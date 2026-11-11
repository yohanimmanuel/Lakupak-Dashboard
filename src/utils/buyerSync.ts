import { prisma } from '@/lib/db';
import { calculatePromotionGift, PromotionDetails } from './promotionUtils';
import { parseMoney } from '@/app/api/graphql/modules/common/utils';

// Central helper to build mobile marketplace Buyer IDs consistently across modules
// Base: LKB-<marketplaceUserId padded>
// Per distributor: LKB-<marketplaceUserId padded>-<distributorUserId>
export function buildMobileBuyerId(marketplaceUserId: number, distributorUserId?: number): string {
  const baseId = `LKB-${marketplaceUserId.toString().padStart(8, '0')}`;
  return typeof distributorUserId === 'number' ? `${baseId}-${distributorUserId}` : baseId;
}

/**
 * Parse marketplace user ID from a buyerId. Supports:
 * - mobile_user_X (legacy)
 * - LKB-<padded 8 digits> or LKB-<padded 8 digits>-<distributorId> (mobile app)
 * Returns null if not a mobile buyer format.
 */
export function parseMarketplaceUserIdFromBuyerId(buyerId: string | null | undefined): number | null {
  if (!buyerId || typeof buyerId !== 'string') return null;
  if (buyerId.startsWith('mobile_user_')) {
    const n = parseInt(buyerId.replace('mobile_user_', ''), 10);
    return isNaN(n) ? null : n;
  }
  if (buyerId.startsWith('LKB-')) {
    const after = buyerId.slice(4);
    const firstPart = after.includes('-') ? after.split('-')[0] : after;
    const n = parseInt(firstPart, 10);
    return isNaN(n) ? null : n;
  }
  return null;
}

type PaymentFields = {
  paymentStatus?: string | null;
  amountPaid?: string | number | null | { toNumber?: () => number; toString?: () => string };
};

/** Unpaid remainder. A missing amount follows Paid for the whole total and every other status for none of it. */
function unpaidOrderAmount(orderTotal: number, order: PaymentFields): number {
  const total = Math.max(0, orderTotal);
  const recorded = order.amountPaid == null ? null : parseMoney(order.amountPaid);
  const paid =
    recorded != null
      ? Math.min(total, Math.max(0, Math.round(recorded * 100) / 100))
      : String(order.paymentStatus ?? '').toLowerCase() === 'paid'
        ? total
        : 0;
  return Math.max(0, Math.round((total - paid) * 100) / 100);
}

/** Live marketplace/dashboard order rows vs CRM/import profile details. */
function isLiveSyncedOrderDetail(entry: {
  orderNo?: string;
  syncedFromOrders?: boolean;
}): boolean {
  if (entry?.syncedFromOrders === true) return true;
  const orderNo = String(entry?.orderNo || '').trim();
  return /^LKO-\d+(?:-\d+)?$/i.test(orderNo);
}

/**
 * Fill logistics.lastVisit from the latest completed sales job when empty.
 * Returns new logistics JSON only when a visit was backfilled; otherwise null (omit write).
 */
async function backfillLastVisitFromSalesJobs(
  buyer: { logistics: string | null },
  userId: number,
  buyerId: string,
  orderIds: string[],
): Promise<string | null> {
  try {
    const logistics =
      buyer.logistics && buyer.logistics.trim()
        ? (JSON.parse(buyer.logistics) as Record<string, unknown>)
        : {};
    const existingVisit =
      typeof logistics.lastVisit === 'string' ? logistics.lastVisit.trim() : '';
    if (!existingVisit) {
      const latestJob = await prisma.salesJob.findFirst({
        where: {
          distributorId: userId,
          completedAt: { not: null },
          OR:
            orderIds.length > 0
              ? [{ clientId: buyerId }, { orderId: { in: orderIds } }]
              : [{ clientId: buyerId }],
        },
        select: { completedAt: true },
        orderBy: { completedAt: 'desc' },
      });
      if (latestJob?.completedAt) {
        logistics.lastVisit = latestJob.completedAt.toISOString().split('T')[0];
        return JSON.stringify(logistics);
      }
    }
  } catch {
    // Keep existing logistics on parse errors.
  }
  return null;
}

/** Write logistics only if it still matches the value from the earlier buyer read. */
async function saveBackfilledLogistics(
  buyerId: string,
  previousLogistics: string | null,
  nextLogistics: string,
): Promise<number> {
  try {
    const result = await prisma.buyer.updateMany({
      where: { buyerId, logistics: previousLogistics },
      data: { logistics: nextLogistics },
    });
    if (result.count === 0) {
      console.warn('[buyerSync] lastVisit logistics backfill skipped; logistics changed concurrently:', {
        buyerId,
      });
    }
    return result.count;
  } catch (error) {
    console.warn('[buyerSync] lastVisit logistics backfill failed:', {
      buyerId,
      error: error instanceof Error ? error.message : String(error),
    });
    return 0;
  }
}

/**
 * Sync a MarketplaceUser profile into all distributor-scoped Buyer rows.
 *
 * This keeps the Dashboard buyer list/details "live" with the latest Marketplace profile,
 * while Orders remain immutable snapshots.
 *
 * Buyer IDs follow buildMobileBuyerId():
 * - Base: LKB-<padded 8 digits>
 * - Per distributor: LKB-<padded 8 digits>-<distributorUserId>
 */
export async function syncMarketplaceUserToBuyerProfiles(marketplaceUserId: number): Promise<void> {
  try {
    if (!Number.isFinite(marketplaceUserId) || marketplaceUserId < 1) return;

    const marketplaceUser = await prisma.marketplaceUser.findUnique({
      where: { id: marketplaceUserId },
      select: {
        id: true,
        name: true,
        storeName: true,
        email: true,
        phone: true,
        chosenAddress: true,
        image: true,
      },
    });

    if (!marketplaceUser) return;

    const baseBuyerId = buildMobileBuyerId(marketplaceUser.id);

    await prisma.buyer.updateMany({
      where: {
        buyerId: {
          startsWith: baseBuyerId,
        },
      },
      data: {
        owner: marketplaceUser.name || 'Mobile User',
        email: marketplaceUser.email || '',
        phone: marketplaceUser.phone || '',
        storeName: marketplaceUser.storeName || 'Mobile Store',
        address: marketplaceUser.chosenAddress || '',
        avatar: marketplaceUser.image || null,
        updatedAt: new Date(),
      },
    });
  } catch {
    // best-effort sync; never block the main request
  }
}

export async function syncOrderToBuyerProfile(buyerId: string, userId: number): Promise<boolean> {
  try {
    // Get buyer
    const buyer = await prisma.buyer.findUnique({
      where: { buyerId }
    });

    if (!buyer) {
      return false;
    }

    // Get all orders for this buyer that belong ONLY to the provided distributor (userId)
    // Exclude cancelled and returned
    const orders = await prisma.order.findMany({
      where: {
        buyerId: buyerId,
        userId: userId,
        isDeleted: false,
        orderStatus: { notIn: ['Cancelled', 'Returned'] } // Exclude cancelled and returned orders
      },
      include: {
        orderItemsRel: true
      }
    });

    const {
      loadBuyerOrderDetails,
      lockBuyerOrderRecords,
      replaceBuyerOrderRecords,
    } = await import('@/lib/clients/buyerRecords');

    // No live orders: drop previously synced LKO rows, keep CRM/import details.
    if (orders.length === 0) {
      const nextLogistics = await backfillLastVisitFromSalesJobs(buyer, userId, buyerId, []);
      // Lock → load → filter → replace in one txn so updateBuyer rows are not omitted.
      const recordsChanged = await prisma.$transaction(async (tx) => {
        await lockBuyerOrderRecords(tx, buyer.id);
        const existing = await loadBuyerOrderDetails(tx, buyer.id);
        const preserved = existing.filter((row) => !isLiveSyncedOrderDetail(row));
        if (preserved.length === existing.length) {
          return false;
        }
        const { changed } = await replaceBuyerOrderRecords(tx, buyer.id, preserved);
        if (changed) {
          await tx.buyer.update({
            where: { id: buyer.id },
            data: { updatedAt: new Date() },
          });
        }
        return changed;
      });
      if (!recordsChanged && nextLogistics == null) {
        return false;
      }
      if (nextLogistics != null) {
        await saveBackfilledLogistics(buyerId, buyer.logistics, nextLogistics);
      }
      return true;
    }

    // Calculate totals
    let totalSpend = 0;
    let totalOutstanding = 0;
    let orderCount = 0;
    const monthlyData: { [key: string]: { spend: number; orders: number } } = {};

    for (const order of orders) {
      // Prefer order.totalAmount once pricing has been applied; fall back to lines + shipping.
      const shippingFee = parseMoney(
        (order as { shippingFee?: unknown }).shippingFee as
          | string
          | number
          | { toNumber?: () => number; toString?: () => string }
          | null
          | undefined,
      );
      const lineSpend = order.orderItemsRel.reduce((sum: number, item: { subtotal: unknown }) => {
        return (
          sum +
          parseMoney(
            item.subtotal as
              | string
              | number
              | { toNumber?: () => number; toString?: () => string }
              | null
              | undefined,
          )
        );
      }, 0);
      const headerTotal = parseMoney(
        (order as { totalAmount?: unknown }).totalAmount as
          | string
          | number
          | { toNumber?: () => number; toString?: () => string }
          | null
          | undefined,
      );
      const totalOrderAmount = headerTotal > 0 ? headerTotal : lineSpend + shippingFee;

      totalSpend += totalOrderAmount;
      orderCount++;

      totalOutstanding += unpaidOrderAmount(totalOrderAmount, order);

      // Monthly data
      const monthKey = order.createdAt.toISOString().substring(0, 7); // YYYY-MM
      if (!monthlyData[monthKey]) {
        monthlyData[monthKey] = { spend: 0, orders: 0 };
      }
      monthlyData[monthKey].spend += totalOrderAmount;
      monthlyData[monthKey].orders += 1;
    }

    // Calculate monthly averages
    const monthlyAverages = Object.entries(monthlyData).map(([month, data]) => ({
      month,
      totalSpend: data.spend,
      orderCount: data.orders
    }));

    // Process orders into orderDetails format for the buyer profile
    const orderDetails = orders.map(order => {
      // Combine items that share the same product (different variants) into a
      // single product name so the same product isn't listed multiple times.
      const seenProductKeys = new Set<string>();
      const productNames = order.orderItemsRel
        .filter(item => {
          const key = item.productId || item.productNameSnapshot || 'Unknown Product';
          if (seenProductKeys.has(key)) return false;
          seenProductKeys.add(key);
          return true;
        })
        .map(item => item.productNameSnapshot || 'Unknown Product')
        .join(', ');
      
      // Calculate total orders (packages) including free pieces from promotions
      const totalOrders = order.orderItemsRel.reduce((sum: number, item: { 
        packageQuantity: number | null;
        piecesPerPackage: number | null;
        promotionDetailsSnapshot: string | null;
        moqSnapshot: number | null;
      }) => {
        const paidPackages = item.packageQuantity ?? 1;
        const piecesPerPackage = item.piecesPerPackage ?? 1;
        const paidPieces = paidPackages * piecesPerPackage;
        
        // Calculate free pieces from buy-x-get-y promotions
        let freePieces = 0;
        if (item.promotionDetailsSnapshot) {
          try {
            const promotionDetails: PromotionDetails = JSON.parse(item.promotionDetailsSnapshot);
            const moq = item.moqSnapshot ?? null;
            const promotionGift = calculatePromotionGift(promotionDetails, paidPieces, moq);
            freePieces = promotionGift?.freeQty || 0;
          } catch {
            // Invalid JSON, skip free items
          }
        }
        
        // Convert free pieces to packages and add to paid packages
        const freePackages = piecesPerPackage > 0 ? freePieces / piecesPerPackage : 0;
        return sum + paidPackages + freePackages;
      }, 0);
      // Convert Decimal values to numbers for calculations
      const lineSpend = order.orderItemsRel.reduce((sum: number, item: { subtotal: unknown }) => {
        return sum + parseMoney(item.subtotal as string | number | { toNumber?: () => number; toString?: () => string } | null | undefined);
      }, 0);
      const shippingFee = parseMoney((order as { shippingFee?: unknown }).shippingFee as string | number | { toNumber?: () => number; toString?: () => string } | null | undefined);
      const headerTotal = parseMoney((order as { totalAmount?: unknown }).totalAmount as string | number | { toNumber?: () => number; toString?: () => string } | null | undefined);
      const orderTotal = headerTotal > 0 ? headerTotal : lineSpend + shippingFee;
      const orderOutstanding = unpaidOrderAmount(orderTotal, order);
      
      return {
        orderNo: order.orderId,
        product: productNames,
        totalOrders: totalOrders.toString(),
        totalSpend: orderTotal.toString(), // Prefer priced order total after send-pricing
        shippingFee: shippingFee.toString(),
        lastOrderDate: order.createdAt.toISOString().split('T')[0],
        outstanding: orderOutstanding.toString(),
        syncedFromOrders: true,
      };
    });

    const nextLogistics = await backfillLastVisitFromSalesJobs(
      buyer,
      userId,
      buyerId,
      orders.map((order) => order.orderId),
    );

    // Lock → load CRM rows → merge live sync → replace, so concurrent updateBuyer
    // records are included in the replacement list.
    await prisma.$transaction(async (tx) => {
      await lockBuyerOrderRecords(tx, buyer.id);
      const existing = await loadBuyerOrderDetails(tx, buyer.id);
      const preservedCrm = existing.filter((row) => !isLiveSyncedOrderDetail(row));
      const mergedOrderDetails = [...preservedCrm, ...orderDetails];
      const { changed } = await replaceBuyerOrderRecords(tx, buyer.id, mergedOrderDetails);
      if (changed) {
        await tx.buyer.update({
          where: { id: buyer.id },
          data: { updatedAt: new Date() },
        });
      }
    });
    if (nextLogistics != null) {
      await saveBackfilledLogistics(buyerId, buyer.logistics, nextLogistics);
    }
    return true;
  } catch (error) {
    console.warn('[buyerSync] syncBuyerOrderDetails failed:', {
      buyerId,
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}
