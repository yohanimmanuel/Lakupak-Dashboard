import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSecurityHeaders } from '@/utils/auth-security';
import { parseAmountSafely } from '@/utils/currencyUtils';
import { calculatePromotionGift, type PromotionDetails } from '@/utils/promotionUtils';
import { requirePlatformAdminId, UnauthorizedPlatformAdminError } from '@/utils/platform-admin-auth';

type Grain = 'day';

type FinanceSeriesRow = {
  day: string;
  sales: number;
  revenuePaid: number;
  profitPaid: number;
  orders: number;
  paidOrders: number;
};

function parseGrain(req: NextRequest): Grain {
  const { searchParams } = new URL(req.url);
  const g = (searchParams.get('grain') ?? 'day').toLowerCase();
  return g === 'day' ? 'day' : 'day';
}

function parseWindowDays(req: NextRequest): number | null {
  const raw = new URL(req.url).searchParams.get('days');
  if (!raw) return null;
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  const whole = Math.floor(n);
  if (![3, 7, 30, 60].includes(whole)) return null;
  return whole;
}

function startOfUtcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0));
}

function addUtcDays(d: Date, deltaDays: number): Date {
  const x = new Date(d.getTime());
  x.setUTCDate(x.getUTCDate() + deltaDays);
  return x;
}

function parseUntil(req: NextRequest): Date {
  const raw = new URL(req.url).searchParams.get('until');
  const d = raw ? new Date(raw) : new Date();
  if (Number.isNaN(d.getTime())) return new Date();
  return d;
}

function parseSince(req: NextRequest, until: Date): Date {
  const days = parseWindowDays(req);
  if (days) {
    const untilDay = startOfUtcDay(until);
    return addUtcDays(untilDay, -(days - 1));
  }
  const raw = new URL(req.url).searchParams.get('since');
  if (raw) {
    const d = new Date(raw);
    if (!Number.isNaN(d.getTime())) return d;
  }
  const untilDay = startOfUtcDay(until);
  return addUtcDays(untilDay, -29);
}

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function buildDaySeries(since: Date, until: Date): string[] {
  const start = new Date(Date.UTC(since.getUTCFullYear(), since.getUTCMonth(), since.getUTCDate()));
  const end = new Date(Date.UTC(until.getUTCFullYear(), until.getUTCMonth(), until.getUTCDate()));
  const days: string[] = [];
  for (let t = start.getTime(); t <= end.getTime(); t += 24 * 60 * 60 * 1000) {
    days.push(isoDay(new Date(t)));
  }
  return days;
}

function parsePromotionSnapshot(snapshot: string | null | undefined): PromotionDetails | null {
  if (!snapshot) return null;
  try {
    const parsed = JSON.parse(snapshot) as Partial<PromotionDetails>;
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      typeof parsed.minQuantity === 'number' &&
      typeof parsed.freeQuantity === 'number'
    ) {
      return {
        minQuantity: parsed.minQuantity,
        freeQuantity: parsed.freeQuantity,
        description: parsed.description,
      };
    }
    return null;
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  const headers = getSecurityHeaders();
  try {
    requirePlatformAdminId(req);

    const grain = parseGrain(req);
    const until = parseUntil(req);
    const since = parseSince(req, until);

    if (grain !== 'day') {
      return NextResponse.json({ error: 'Unsupported grain' }, { status: 400, headers });
    }

    const days = buildDaySeries(since, until);

    const orders = await prisma.order.findMany({
      where: {
        isDeleted: false,
        OR: [
          {
            createdAt: {
              gte: since,
              lte: until,
            },
          },
          {
            paidAt: {
              gte: since,
              lte: until,
            },
          },
        ],
      },
      select: {
        createdAt: true,
        paidAt: true,
        orderDate: true,
        totalAmount: true,
        paymentStatus: true,
        orderItemsRel: {
          select: {
            productId: true,
            packageQuantity: true,
            piecesPerPackage: true,
            promotionDetailsSnapshot: true,
            moqSnapshot: true,
          },
        },
      },
    });

    // IMPORTANT: Avoid loading the entire product catalog into memory.
    // We only need costs for products that appear in the selected order window.
    const productIdsInWindow = new Set<string>();
    for (const order of orders) {
      for (const item of order.orderItemsRel) {
        if (typeof item.productId === 'string' && item.productId.length > 0) {
          productIdsInWindow.add(item.productId);
        }
      }
    }

    const products =
      productIdsInWindow.size === 0
        ? []
        : await prisma.product.findMany({
            where: { productId: { in: Array.from(productIdsInWindow) } },
            select: {
              productId: true,
              variantOptions: {
                select: { purchasePrice: true },
                orderBy: { id: 'asc' },
                take: 1,
              },
            },
          });

    const productCostById: Record<string, number> = {};
    for (const product of products) {
      const purchasePrice = parseAmountSafely(product.variantOptions[0]?.purchasePrice);
      if (purchasePrice > 0) {
        productCostById[product.productId] = purchasePrice;
      }
    }

    const seriesByDay = new Map<string, FinanceSeriesRow>();
    for (const day of days) {
      seriesByDay.set(day, {
        day,
        sales: 0,
        revenuePaid: 0,
        profitPaid: 0,
        orders: 0,
        paidOrders: 0,
      });
    }

    let totalSales = 0;
    let totalPaidRevenue = 0;
    let totalProfit = 0;
    let totalOrders = 0;
    let paidOrders = 0;

    for (const order of orders) {
      const orderRevenue = parseAmountSafely(order.totalAmount);
      const isPaid = order.paymentStatus === 'Paid';
      const createdInWindow = order.createdAt >= since && order.createdAt <= until;
      const paidAtDate = order.paidAt ? new Date(order.paidAt) : null;
      const paidInWindow =
        isPaid &&
        !!paidAtDate &&
        !Number.isNaN(paidAtDate.getTime()) &&
        paidAtDate >= since &&
        paidAtDate <= until;

      let orderCogs = 0;
      for (const item of order.orderItemsRel) {
        if (!item.productId) continue;
        const cost = productCostById[item.productId];
        if (typeof cost !== 'number' || cost <= 0) continue;

        const paidPieces = (item.packageQuantity || 1) * (item.piecesPerPackage || 1);
        const promotionDetails = parsePromotionSnapshot(item.promotionDetailsSnapshot);
        const freePieces = promotionDetails
          ? calculatePromotionGift(promotionDetails, paidPieces, item.moqSnapshot ?? null)?.freeQty || 0
          : 0;
        const totalPieces = paidPieces + freePieces;
        orderCogs += cost * totalPieces;
      }

      const orderProfit = orderRevenue - orderCogs;

      if (createdInWindow) {
        const createdDay = isoDay(order.createdAt);
        const createdBucket = seriesByDay.get(createdDay);
        if (createdBucket) {
          totalOrders += 1;
          totalSales += orderRevenue;
          createdBucket.orders += 1;
          createdBucket.sales += orderRevenue;
        }
      }

      if (paidInWindow && paidAtDate) {
        const paidDay = isoDay(paidAtDate);
        const paidBucket = seriesByDay.get(paidDay);
        paidOrders += 1;
        totalPaidRevenue += orderRevenue;
        totalProfit += orderProfit;
        if (paidBucket) {
          paidBucket.paidOrders += 1;
          paidBucket.revenuePaid += orderRevenue;
          paidBucket.profitPaid += orderProfit;
        }
      }
    }

    const profitMargin = totalPaidRevenue > 0 ? (totalProfit / totalPaidRevenue) * 100 : 0;
    const series = days.map((d) => seriesByDay.get(d)!);

    return NextResponse.json(
      {
        params: {
          since: since.toISOString(),
          until: until.toISOString(),
          grain,
        },
        kpis: {
          gmv: {
            totalSales,
            totalProfit,
            profitMargin,
            totalOrders,
            paidOrders,
          },
          revenue: {
            paidRevenue: totalPaidRevenue,
          },
        },
        series,
      },
      { status: 200, headers }
    );
  } catch (err) {
    if (err instanceof UnauthorizedPlatformAdminError) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers });
    }
    console.error('[PlatformAdmin][FinanceAnalytics] Failed to load finance analytics', err);
    return NextResponse.json({ error: 'Failed to load finance analytics' }, { status: 500, headers });
  }
}
