import { prisma } from '@/lib/db';
import { Prisma } from '@/lib/prisma-generated';

const SAMPLE = 6;
const TOP_N = 8;
const MAX_CONTEXT_CHARS = 40_000;

function truncateContext(payload: unknown): string {
  const json = JSON.stringify(payload, null, 0);
  if (json.length <= MAX_CONTEXT_CHARS) return json;
  return `${json.slice(0, MAX_CONTEXT_CHARS)}\n…[truncated]`;
}

function daysAgo(days: number): Date {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

function dec(value: Prisma.Decimal | number | null | undefined): number {
  if (value == null) return 0;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

function money(value: number): string {
  return value.toFixed(2);
}

function pct(part: number, whole: number): number | null {
  if (!whole) return null;
  return Math.round((part / whole) * 1000) / 10;
}

/** Static map of dashboard modules — how to navigate Laku as a distributor. */
export const LAKU_APP_MODULES = [
  {
    id: 'home',
    path: '/home',
    role: 'Overview widgets, quick links, and account health.',
  },
  {
    id: 'products',
    path: '/products',
    role: 'Catalog, variants, stock, pricing, publish to marketplace.',
  },
  {
    id: 'orders',
    path: '/orders',
    role: 'Incoming orders, payment proof, packing, delivery, returns/cancels.',
  },
  {
    id: 'offers',
    path: '/offers',
    role: 'Create and manage product offers / discounts for buyers.',
  },
  {
    id: 'marketing',
    path: '/marketing',
    role: 'Campaigns, sales team, field reports, and sales targets.',
  },
  {
    id: 'analytics',
    path: '/analytics',
    role: 'Sales, financial, and operational performance reports.',
  },
  {
    id: 'automation',
    path: '/automation',
    role: 'Workflow builder (triggers, WhatsApp/Gmail apps, Laku AI buyer CS, actions).',
  },
  {
    id: 'marketplace',
    path: '/marketplace',
    role: 'Storefront listings and marketplace visibility / performance.',
  },
  {
    id: 'logistics',
    path: '/logistics',
    role: 'Fleets, drivers, routes, and delivery coordination.',
  },
  {
    id: 'clients',
    path: '/clients',
    role: 'Buyers and suppliers CRM.',
  },
  {
    id: 'settings',
    path: '/settings',
    role: 'Company profile, billing, payment methods, language, tours, security.',
  },
] as const;

type OrderWindowStats = {
  orderCount: number;
  revenue: string;
  unpaidCount: number;
  unpaidRevenue: string;
  paymentStatusMix: Record<string, number>;
  orderStatusMix: Record<string, number>;
};

async function orderWindowStats(
  userId: number,
  since: Date,
): Promise<OrderWindowStats> {
  const where = { userId, isDeleted: false, orderDate: { gte: since } };
  const [agg, unpaidAgg, paymentMix, statusMix] = await Promise.all([
    prisma.order.aggregate({
      where,
      _count: { _all: true },
      _sum: { totalAmount: true },
    }),
    prisma.order.aggregate({
      where: { ...where, paymentStatus: 'Unpaid' },
      _count: { _all: true },
      _sum: { totalAmount: true },
    }),
    prisma.order.groupBy({
      by: ['paymentStatus'],
      where,
      _count: { _all: true },
    }),
    prisma.order.groupBy({
      by: ['orderStatus'],
      where,
      _count: { _all: true },
    }),
  ]);

  const paymentStatusMix: Record<string, number> = {};
  for (const row of paymentMix) {
    paymentStatusMix[row.paymentStatus || 'Unknown'] = row._count._all;
  }
  const orderStatusMix: Record<string, number> = {};
  for (const row of statusMix) {
    orderStatusMix[row.orderStatus || 'Unknown'] = row._count._all;
  }

  return {
    orderCount: agg._count._all,
    revenue: money(dec(agg._sum.totalAmount)),
    unpaidCount: unpaidAgg._count._all,
    unpaidRevenue: money(dec(unpaidAgg._sum.totalAmount)),
    paymentStatusMix,
    orderStatusMix,
  };
}

/**
 * Live snapshot of this distributor's Laku dashboard account.
 * Includes analytics windows + catalog signals so navbar Laku AI can analyse trends.
 */
export async function buildDistributorAppAssistantContext(userId: number): Promise<string> {
  const orderWhere = { userId, isDeleted: false };
  const since7d = daysAgo(7);
  const since30d = daysAgo(30);

  const [
    user,
    productCount,
    publishedProductCount,
    draftProductCount,
    notPublishedCount,
    orderCount,
    buyerCount,
    supplierCount,
    offerCount,
    campaignCount,
    automationCount,
    fleetCount,
    recentOrders,
    stats7d,
    stats30d,
    orderItems30d,
    catalogVariants,
    weakDescriptions,
  ] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        currency: true,
        region: true,
        language: true,
        company: {
          select: {
            name: true,
            industryType: true,
            businessDescription: true,
            companySize: true,
            yearsInOperation: true,
            buyerPaymentTermDays: true,
            defaultDeliveryLeadTimeMinDays: true,
            defaultDeliveryLeadTimeMaxDays: true,
          },
        },
      },
    }),
    prisma.product.count({ where: { userId } }),
    prisma.product.count({
      where: { userId, status: 'Published', marketplaceStatus: 'Published' },
    }),
    prisma.product.count({ where: { userId, status: 'Draft' } }),
    prisma.product.count({
      where: { userId, marketplaceStatus: { not: 'Published' } },
    }),
    prisma.order.count({ where: orderWhere }),
    prisma.buyer.count({ where: { userId } }),
    prisma.supplier.count({ where: { userId } }),
    prisma.offer.count({ where: { userId } }),
    prisma.campaign.count({ where: { userId } }),
    prisma.automationWorkflow.count({ where: { userId } }),
    prisma.fleet.count({ where: { userId } }),
    prisma.order.findMany({
      where: orderWhere,
      orderBy: { createdAt: 'desc' },
      take: SAMPLE,
      select: {
        orderId: true,
        orderStatus: true,
        paymentStatus: true,
        storeName: true,
        totalAmount: true,
        orderDate: true,
        deliveryMethod: true,
      },
    }),
    orderWindowStats(userId, since7d),
    orderWindowStats(userId, since30d),
    prisma.orderItem.findMany({
      where: {
        order: {
          userId,
          isDeleted: false,
          orderDate: { gte: since30d },
        },
      },
      select: {
        productId: true,
        productNameSnapshot: true,
        productSkuSnapshot: true,
        packageQuantity: true,
        subtotal: true,
        pricePerPackage: true,
      },
      take: 800,
    }),
    prisma.variantOption.findMany({
      where: {
        isActive: true,
        product: { userId },
      },
      select: {
        variantName: true,
        stockQuantity: true,
        lowStockThreshold: true,
        stockStatus: true,
        sellingPrice: true,
        purchasePrice: true,
        moq: true,
        product: {
          select: {
            productId: true,
            name: true,
            sku: true,
            marketplaceStatus: true,
            status: true,
            brand: true,
            productCategory: true,
            description: true,
          },
        },
      },
      take: 120,
      orderBy: { updatedAt: 'desc' },
    }),
    prisma.product.findMany({
      where: { userId },
      select: {
        productId: true,
        name: true,
        sku: true,
        brand: true,
        productCategory: true,
        marketplaceStatus: true,
        status: true,
        description: true,
      },
      take: 40,
      orderBy: { updatedAt: 'desc' },
    }),
  ]);

  // Top products by 30d revenue
  const byProduct = new Map<
    string,
    { productId: string; name: string; sku: string | null; revenue: number; packages: number }
  >();
  for (const item of orderItems30d) {
    const id = item.productId || item.productSkuSnapshot || item.productNameSnapshot || 'unknown';
    const cur = byProduct.get(id) ?? {
      productId: id,
      name: item.productNameSnapshot || id,
      sku: item.productSkuSnapshot ?? null,
      revenue: 0,
      packages: 0,
    };
    cur.revenue += dec(item.subtotal);
    cur.packages += item.packageQuantity ?? 0;
    byProduct.set(id, cur);
  }
  const topProducts30d = Array.from(byProduct.values())
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, TOP_N)
    .map((p) => ({
      productId: p.productId,
      name: p.name,
      sku: p.sku,
      revenue30d: money(p.revenue),
      packagesSold30d: p.packages,
    }));

  // Catalog margin + stock signals
  type MarginRow = {
    productId: string;
    name: string;
    variantName: string;
    marketplaceStatus: string | null;
    sellingPrice: number;
    purchasePrice: number;
    marginPct: number | null;
    stockQuantity: number;
    lowStock: boolean;
  };
  const marginRows: MarginRow[] = [];
  for (const v of catalogVariants) {
    const sell = dec(v.sellingPrice);
    const cost = dec(v.purchasePrice);
    const marginPct = sell > 0 ? pct(sell - cost, sell) : null;
    const stockQuantity = v.stockQuantity ?? 0;
    const threshold = v.lowStockThreshold ?? 0;
    const lowStock =
      stockQuantity <= 0 ||
      (threshold > 0 && stockQuantity <= threshold) ||
      String(v.stockStatus ?? '').toLowerCase().includes('low');
    marginRows.push({
      productId: v.product.productId,
      name: v.product.name,
      variantName: v.variantName,
      marketplaceStatus: v.product.marketplaceStatus,
      sellingPrice: sell,
      purchasePrice: cost,
      marginPct,
      stockQuantity,
      lowStock,
    });
  }

  const withMargin = marginRows.filter((r) => r.marginPct != null);
  const avgMarginPct =
    withMargin.length > 0
      ? Math.round(
          (withMargin.reduce((s, r) => s + (r.marginPct as number), 0) / withMargin.length) * 10,
        ) / 10
      : null;

  const lowMarginVariants = [...withMargin]
    .sort((a, b) => (a.marginPct as number) - (b.marginPct as number))
    .slice(0, TOP_N)
    .map((r) => ({
      productId: r.productId,
      name: r.name,
      variantName: r.variantName,
      sellingPrice: money(r.sellingPrice),
      purchasePrice: money(r.purchasePrice),
      marginPct: r.marginPct,
      marketplaceStatus: r.marketplaceStatus,
    }));

  const highMarginVariants = [...withMargin]
    .sort((a, b) => (b.marginPct as number) - (a.marginPct as number))
    .slice(0, 5)
    .map((r) => ({
      productId: r.productId,
      name: r.name,
      variantName: r.variantName,
      sellingPrice: money(r.sellingPrice),
      purchasePrice: money(r.purchasePrice),
      marginPct: r.marginPct,
      marketplaceStatus: r.marketplaceStatus,
    }));

  const lowStockVariants = marginRows
    .filter((r) => r.lowStock)
    .slice(0, TOP_N)
    .map((r) => ({
      productId: r.productId,
      name: r.name,
      variantName: r.variantName,
      stockQuantity: r.stockQuantity,
      sellingPrice: money(r.sellingPrice),
      marketplaceStatus: r.marketplaceStatus,
    }));

  const rev7 = Number(stats7d.revenue);
  const rev30 = Number(stats30d.revenue);
  // Rough pace: 7d revenue * (30/7) vs actual 30d
  const projected30From7d = rev7 * (30 / 7);
  const paceVs30dPct =
    rev30 > 0 ? pct(projected30From7d - rev30, rev30) : rev7 > 0 ? 100 : null;

  const context = {
    purpose: 'distributor_dashboard_assistant',
    audience: 'logged_in_distributor',
    analysisCapability:
      'Use analyticsWindows, marketplace, topProducts30d, and catalogInsights to answer financial/trend/catalog questions with concrete numbers. Do not only redirect to /analytics.',
    modules: LAKU_APP_MODULES,
    account: {
      userId: user?.id,
      name: [user?.firstName, user?.lastName].filter(Boolean).join(' ') || null,
      currency: user?.currency ?? null,
      region: user?.region ?? null,
      language: user?.language ?? null,
      company: user?.company ?? null,
    },
    totals: {
      products: productCount,
      productsPublishedMarketplace: publishedProductCount,
      productsDraft: draftProductCount,
      productsNotOnMarketplace: notPublishedCount,
      orders: orderCount,
      buyers: buyerCount,
      suppliers: supplierCount,
      offers: offerCount,
      campaigns: campaignCount,
      automations: automationCount,
      fleets: fleetCount,
    },
    analyticsWindows: {
      last7d: stats7d,
      last30d: stats30d,
      trendHints: {
        revenuePaceVs30dPct: paceVs30dPct,
        note:
          'revenuePaceVs30dPct > 0 means recent 7d pace is above the 30d average; < 0 means slower. Approximate only.',
      },
    },
    marketplace: {
      publishedListings: publishedProductCount,
      unpublishedOrNotListed: notPublishedCount,
      publishRatePct: pct(publishedProductCount, productCount),
      path: '/marketplace',
      analyticsPath: '/analytics',
    },
    topProducts30d,
    catalogInsights: {
      sampleSizeVariants: catalogVariants.length,
      averageMarginPct: avgMarginPct,
      lowMarginVariants,
      highMarginVariants,
      lowStockVariants,
      weakOrMissingDescriptions: weakDescriptions
        .filter((p) => (p.description ?? '').trim().length < 40)
        .slice(0, TOP_N)
        .map((p) => ({
          productId: p.productId,
          name: p.name,
          sku: p.sku,
          brand: p.brand,
          category: p.productCategory,
          marketplaceStatus: p.marketplaceStatus,
          status: p.status,
          descriptionLength: (p.description ?? '').trim().length,
          descriptionPreview: (p.description ?? '').trim().slice(0, 80) || null,
        })),
      suggestionHooks: [
        'Raise sellingPrice on low-margin bestsellers if demand is strong; lower MOQ or price on high-stock slow movers.',
        'Write buyer-facing descriptions for products with empty descriptions before publishing to marketplace.',
        'Publish draft/not-published products that have healthy stock and margin.',
        'Replenish lowStockVariants that appear in topProducts30d.',
      ],
    },
    samples: {
      recentOrders: recentOrders.map((o) => ({
        ...o,
        totalAmount: o.totalAmount != null ? String(o.totalAmount) : null,
      })),
    },
  };

  return truncateContext(context);
}
