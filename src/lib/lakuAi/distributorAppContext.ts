import { prisma } from '@/lib/db';
import { Prisma } from '@/lib/prisma-generated';

const SAMPLE = 6;
const TOP_N = 8;
const MAX_CONTEXT_CHARS = 18_000;

type MarginCategoryGroup = 'fmcg_fnb' | 'beauty_fashion' | 'general';

type MarginBenchmark = {
  group: MarginCategoryGroup;
  label: string;
  /** Typical healthy unit margin range for this product type. */
  typicalMinPct: number;
  typicalMaxPct: number;
  /** Below this is thin for the category (not automatically "critical"). */
  thinBelowPct: number;
  /** Below this is loss-making / too aggressive. */
  criticalBelowPct: number;
};

function resolveMarginBenchmark(input: {
  merchandisingCategorySlug?: string | null;
  productType?: string | null;
  name?: string | null;
}): MarginBenchmark {
  const blob = [
    input.merchandisingCategorySlug,
    input.productType,
    input.name,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  const isFmcg =
    /\b(food-beverage|food|beverage|fnb|fmcg|snack|drink|grocery|instant|noodle|indomie|taro|roti|bread|minuman|makanan)\b/.test(
      blob,
    );
  if (isFmcg) {
    return {
      group: 'fmcg_fnb',
      label: 'FMCG / Food & Beverage',
      typicalMinPct: 5,
      typicalMaxPct: 10,
      thinBelowPct: 3,
      criticalBelowPct: 0,
    };
  }

  const isBeautyFashion =
    /\b(beauty-personal-care|fashion-apparel|beauty|fashion|apparel|skincare|makeup|cosmetic|clothing|shoes|bag|bags)\b/.test(
      blob,
    );
  if (isBeautyFashion) {
    return {
      group: 'beauty_fashion',
      label: 'Beauty / Fashion',
      typicalMinPct: 15,
      typicalMaxPct: 40,
      thinBelowPct: 10,
      criticalBelowPct: 5,
    };
  }

  return {
    group: 'general',
    label: 'General merchandise',
    typicalMinPct: 10,
    typicalMaxPct: 25,
    thinBelowPct: 8,
    criticalBelowPct: 0,
  };
}

function assessMarginPct(
  marginPct: number | null,
  benchmark: MarginBenchmark,
): {
  status: 'loss' | 'thin' | 'healthy' | 'strong' | 'unknown';
  looksAggressive: boolean;
  typicalRangePct: [number, number];
  categoryGroup: MarginCategoryGroup;
  categoryLabel: string;
} {
  if (marginPct == null || !Number.isFinite(marginPct)) {
    return {
      status: 'unknown',
      looksAggressive: false,
      typicalRangePct: [benchmark.typicalMinPct, benchmark.typicalMaxPct],
      categoryGroup: benchmark.group,
      categoryLabel: benchmark.label,
    };
  }
  let status: 'loss' | 'thin' | 'healthy' | 'strong';
  if (marginPct < benchmark.criticalBelowPct) status = 'loss';
  else if (marginPct < benchmark.thinBelowPct) status = 'thin';
  else if (marginPct <= benchmark.typicalMaxPct) status = 'healthy';
  else status = 'strong';

  return {
    status,
    // Aggressive = losing money, or clearly below category norms.
    looksAggressive: status === 'loss' || status === 'thin',
    typicalRangePct: [benchmark.typicalMinPct, benchmark.typicalMaxPct],
    categoryGroup: benchmark.group,
    categoryLabel: benchmark.label,
  };
}

function deepCloneContext<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function trimArrayAtPath(obj: Record<string, unknown>, path: string[], maxItems: number): void {
  let current: unknown = obj;
  for (let i = 0; i < path.length - 1; i += 1) {
    if (!current || typeof current !== 'object' || Array.isArray(current)) return;
    current = (current as Record<string, unknown>)[path[i]!];
  }
  const key = path[path.length - 1];
  if (!key || !current || typeof current !== 'object' || Array.isArray(current)) return;
  const parent = current as Record<string, unknown>;
  const value = parent[key];
  if (Array.isArray(value) && value.length > maxItems) {
    parent[key] = value.slice(0, maxItems);
  }
}

function trimOfferProductSamples(obj: Record<string, unknown>, maxProducts: number): void {
  const offers = obj.offers;
  if (!offers || typeof offers !== 'object' || Array.isArray(offers)) return;
  const items = (offers as Record<string, unknown>).items;
  if (!Array.isArray(items)) return;
  for (const item of items) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const products = (item as Record<string, unknown>).products;
    if (Array.isArray(products) && products.length > maxProducts) {
      (item as Record<string, unknown>).products = products.slice(0, maxProducts);
    }
  }
}

function asContextRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function boundTextField(value: unknown, maxChars: number): unknown {
  if (typeof value !== 'string') return value;
  if (maxChars <= 0) return null;
  if (value.length <= maxChars) return value;
  return `${value.slice(0, maxChars)}…`;
}

function accountWithBoundedBusinessDescription(
  account: unknown,
  businessDescriptionMaxChars: number,
): unknown {
  const record = asContextRecord(account);
  if (!record) return account;
  const company = asContextRecord(record.company);
  if (!company) return record;
  return {
    ...record,
    company: {
      ...company,
      businessDescription: boundTextField(company.businessDescription, businessDescriptionMaxChars),
    },
  };
}

function buildContextFallback(
  reduced: Record<string, unknown>,
  options: {
    businessDescriptionMaxChars: number;
    includeAnalyticsWindows: boolean;
    includeMarketplace: boolean;
  },
): Record<string, unknown> {
  const fallback: Record<string, unknown> = {
    contextTruncated: true,
    purpose: reduced.purpose,
    audience: reduced.audience,
    account: accountWithBoundedBusinessDescription(
      reduced.account,
      options.businessDescriptionMaxChars,
    ),
    totals: reduced.totals,
    truncationNote:
      'Large sections (offers, catalogInsights, samples) omitted to fit context limit.',
  };
  if (options.includeAnalyticsWindows) {
    fallback.analyticsWindows = reduced.analyticsWindows;
  }
  if (options.includeMarketplace) {
    fallback.marketplace = reduced.marketplace;
  }
  return fallback;
}

function buildMinimalContextFallback(reduced: Record<string, unknown>): Record<string, unknown> {
  const account = asContextRecord(reduced.account);
  const company = account ? asContextRecord(account.company) : null;
  return {
    contextTruncated: true,
    purpose: reduced.purpose,
    audience: reduced.audience,
    account: account
      ? {
          userId: account.userId,
          name: account.name,
          currency: account.currency,
          region: account.region,
          language: account.language,
          company: company
            ? {
                name: company.name,
                industryType: company.industryType,
                companySize: company.companySize,
                yearsInOperation: company.yearsInOperation,
              }
            : null,
        }
      : null,
    totals: reduced.totals,
    truncationNote:
      'Context heavily truncated; only core account totals retained to fit context limit.',
  };
}

function truncateContext(payload: unknown): string {
  const serialize = (value: unknown) => JSON.stringify(value, null, 0);
  const full = serialize(payload);
  if (full.length <= MAX_CONTEXT_CHARS) return full;

  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return serialize({
      contextTruncated: true,
      note: 'Context exceeded size limit.',
    });
  }

  let reduced = deepCloneContext(payload) as Record<string, unknown>;
  reduced.contextTruncated = true;

  const trimSteps: Array<() => void> = [
    () => trimArrayAtPath(reduced, ['offers', 'items'], 4),
    () => trimOfferProductSamples(reduced, 3),
    () => trimArrayAtPath(reduced, ['offers', 'items'], 2),
    () => trimOfferProductSamples(reduced, 1),
    () => trimArrayAtPath(reduced, ['catalogInsights', 'lowMarginVariants'], 4),
    () => trimArrayAtPath(reduced, ['catalogInsights', 'highMarginVariants'], 4),
    () => trimArrayAtPath(reduced, ['catalogInsights', 'catalogPriceCuts'], 4),
    () => trimArrayAtPath(reduced, ['catalogInsights', 'lowStockVariants'], 4),
    () => trimArrayAtPath(reduced, ['catalogInsights', 'weakOrMissingDescriptions'], 4),
    () => trimArrayAtPath(reduced, ['topProducts30d'], 6),
    () => trimArrayAtPath(reduced, ['samples', 'recentOrders'], 4),
    () => trimArrayAtPath(reduced, ['offers', 'items'], 0),
    () => {
      reduced.catalogInsights = {
        sampleSizeVariants: (reduced.catalogInsights as Record<string, unknown> | undefined)
          ?.sampleSizeVariants,
        averageMarginPct: (reduced.catalogInsights as Record<string, unknown> | undefined)
          ?.averageMarginPct,
        truncationNote: 'Detailed catalogInsights arrays omitted to fit context limit.',
      };
    },
    () => {
      reduced.samples = { truncationNote: 'Recent order samples omitted to fit context limit.' };
    },
  ];

  for (const step of trimSteps) {
    step();
    const attempt = serialize(reduced);
    if (attempt.length <= MAX_CONTEXT_CHARS) return attempt;
  }

  const fallbackAttempts: Array<() => Record<string, unknown>> = [
    () =>
      buildContextFallback(reduced, {
        businessDescriptionMaxChars: 4_000,
        includeAnalyticsWindows: true,
        includeMarketplace: true,
      }),
    () =>
      buildContextFallback(reduced, {
        businessDescriptionMaxChars: 500,
        includeAnalyticsWindows: true,
        includeMarketplace: true,
      }),
    () =>
      buildContextFallback(reduced, {
        businessDescriptionMaxChars: 0,
        includeAnalyticsWindows: false,
        includeMarketplace: false,
      }),
    () => buildMinimalContextFallback(reduced),
  ];

  for (const build of fallbackAttempts) {
    const attempt = serialize(build());
    if (attempt.length <= MAX_CONTEXT_CHARS) return attempt;
  }

  return serialize({
    contextTruncated: true,
    note: 'Context exceeded size limit.',
  });
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
    path: '/sales',
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
    role: 'Workflow builder (triggers, WhatsApp/Gmail apps, Lakupak AI buyer CS, actions).',
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
    offers,
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
    prisma.offer.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
      take: 20,
      select: {
        offerId: true,
        notes: true,
        description: true,
        status: true,
        buyerId: true,
        productId: true,
        categoryId: true,
        discountType: true,
        discountValue: true,
        buyQuantity: true,
        startDate: true,
        endDate: true,
        totalUsage: true,
        totalDiscountGiven: true,
        buyer: { select: { storeName: true, owner: true } },
        product: {
          select: {
            productId: true,
            name: true,
            sku: true,
            marketplaceStatus: true,
            productType: true,
            merchandisingCategorySlug: true,
            variantOptions: {
              where: { isActive: true },
              take: 4,
              select: {
                variantName: true,
                sellingPrice: true,
                originalSellingPrice: true,
                purchasePrice: true,
              },
            },
          },
        },
      },
    }),
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
        originalSellingPrice: true,
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
            productType: true,
            merchandisingCategorySlug: true,
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

  // Catalog margin + stock signals (current unit price may already include a catalog discount)
  type MarginRow = {
    productId: string;
    name: string;
    variantName: string;
    marketplaceStatus: string | null;
    productType: string | null;
    merchandisingCategorySlug: string | null;
    sellingPrice: number;
    originalSellingPrice: number | null;
    purchasePrice: number;
    marginPct: number | null;
    catalogDiscountPct: number | null;
    stockQuantity: number;
    lowStock: boolean;
    marginAssessment: ReturnType<typeof assessMarginPct>;
  };
  const marginRows: MarginRow[] = [];
  for (const v of catalogVariants) {
    const sell = dec(v.sellingPrice);
    const original = v.originalSellingPrice != null ? dec(v.originalSellingPrice) : null;
    const cost = dec(v.purchasePrice);
    const marginPct = sell > 0 ? pct(sell - cost, sell) : null;
    const catalogDiscountPct =
      original != null && original > sell && original > 0
        ? pct(original - sell, original)
        : null;
    const stockQuantity = v.stockQuantity ?? 0;
    const threshold = v.lowStockThreshold ?? 0;
    const lowStock =
      stockQuantity <= 0 ||
      (threshold > 0 && stockQuantity <= threshold) ||
      String(v.stockStatus ?? '').toLowerCase().includes('low');
    const benchmark = resolveMarginBenchmark({
      merchandisingCategorySlug: v.product.merchandisingCategorySlug,
      productType: v.product.productType,
      name: v.product.name,
    });
    marginRows.push({
      productId: v.product.productId,
      name: v.product.name,
      variantName: v.variantName,
      marketplaceStatus: v.product.marketplaceStatus,
      productType: v.product.productType ?? null,
      merchandisingCategorySlug: v.product.merchandisingCategorySlug ?? null,
      sellingPrice: sell,
      originalSellingPrice: original,
      purchasePrice: cost,
      marginPct,
      catalogDiscountPct,
      stockQuantity,
      lowStock,
      marginAssessment: assessMarginPct(marginPct, benchmark),
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
      productType: r.productType,
      merchandisingCategory: r.merchandisingCategorySlug,
      sellingPrice: money(r.sellingPrice),
      listPriceBeforeDiscount:
        r.originalSellingPrice != null ? money(r.originalSellingPrice) : null,
      purchasePrice: money(r.purchasePrice),
      marginPct: r.marginPct,
      catalogDiscountPct: r.catalogDiscountPct,
      marginAssessment: r.marginAssessment,
      marketplaceStatus: r.marketplaceStatus,
    }));

  const highMarginVariants = [...withMargin]
    .sort((a, b) => (b.marginPct as number) - (a.marginPct as number))
    .slice(0, 5)
    .map((r) => ({
      productId: r.productId,
      name: r.name,
      variantName: r.variantName,
      productType: r.productType,
      merchandisingCategory: r.merchandisingCategorySlug,
      sellingPrice: money(r.sellingPrice),
      listPriceBeforeDiscount:
        r.originalSellingPrice != null ? money(r.originalSellingPrice) : null,
      purchasePrice: money(r.purchasePrice),
      marginPct: r.marginPct,
      catalogDiscountPct: r.catalogDiscountPct,
      marginAssessment: r.marginAssessment,
      marketplaceStatus: r.marketplaceStatus,
    }));

  const catalogPriceCuts = marginRows
    .filter((r) => r.catalogDiscountPct != null && (r.catalogDiscountPct as number) > 0)
    .sort((a, b) => (b.catalogDiscountPct as number) - (a.catalogDiscountPct as number))
    .slice(0, TOP_N)
    .map((r) => ({
      productId: r.productId,
      name: r.name,
      variantName: r.variantName,
      productType: r.productType,
      merchandisingCategory: r.merchandisingCategorySlug,
      listPriceBeforeDiscount:
        r.originalSellingPrice != null ? money(r.originalSellingPrice) : null,
      sellingPrice: money(r.sellingPrice),
      purchasePrice: money(r.purchasePrice),
      catalogDiscountPct: r.catalogDiscountPct,
      marginPctAfterCut: r.marginPct,
      marginAssessment: r.marginAssessment,
      marketplaceStatus: r.marketplaceStatus,
    }));

  function applyOfferToPrice(
    sellingPrice: number,
    discountType: string,
    discountValue: number,
  ): number | null {
    if (!(sellingPrice > 0)) return null;
    const kind = String(discountType ?? '').toLowerCase();
    if (kind.includes('percent')) {
      return Math.max(0, sellingPrice * (1 - discountValue / 100));
    }
    if (kind.includes('fixed') || kind.includes('amount')) {
      return Math.max(0, sellingPrice - discountValue);
    }
    return null;
  }

  const offerInsights = offers.map((offer) => {
    const discountRules = [
      {
        discountType: offer.discountType,
        discountValue: dec(offer.discountValue),
        name: offer.notes,
        description: offer.description,
        minOrderValue: null as string | null,
        minQuantity: offer.buyQuantity,
        priority: 1,
      },
    ];

    const products = offer.product
      ? [
          (() => {
            const product = offer.product!;
            const benchmark = resolveMarginBenchmark({
              merchandisingCategorySlug: product.merchandisingCategorySlug,
              productType: product.productType,
              name: product.name,
            });
            const variants = product.variantOptions.map((v) => {
              const sell = dec(v.sellingPrice);
              const original = v.originalSellingPrice != null ? dec(v.originalSellingPrice) : null;
              const cost = dec(v.purchasePrice);
              const baseMarginPct = sell > 0 ? pct(sell - cost, sell) : null;
              const catalogDiscountPct =
                original != null && original > sell && original > 0
                  ? pct(original - sell, original)
                  : null;
              const catalogAlreadyDiscounted = original != null && original > sell && original > 0;

              const offerImpacts = discountRules.map((rule) => {
                if (catalogAlreadyDiscounted) {
                  const assessment = assessMarginPct(baseMarginPct, benchmark);
                  return {
                    discountType: rule.discountType,
                    discountValue: rule.discountValue,
                    pricingMode: 'discount_already_in_current_price',
                    effectiveUnitPrice: money(sell),
                    listPriceBeforeDiscount: money(original as number),
                    catalogDiscountPct,
                    effectiveMarginPct: baseMarginPct,
                    marginAssessment: assessment,
                    looksAggressive: assessment.looksAggressive,
                  };
                }

                const after = applyOfferToPrice(sell, rule.discountType, rule.discountValue);
                if (after == null) {
                  return {
                    discountType: rule.discountType,
                    discountValue: rule.discountValue,
                    pricingMode: 'promotion_non_unit_price',
                    effectiveUnitPrice: null as string | null,
                    effectiveMarginPct: null as number | null,
                    marginAssessment: assessMarginPct(null, benchmark),
                    looksAggressive: false,
                  };
                }
                const marginAfter = after > 0 ? pct(after - cost, after) : cost > 0 ? -100 : null;
                const assessment = assessMarginPct(marginAfter, benchmark);
                return {
                  discountType: rule.discountType,
                  discountValue: rule.discountValue,
                  pricingMode: 'offer_applied_on_current_price',
                  effectiveUnitPrice: money(after),
                  effectiveMarginPct: marginAfter,
                  marginAssessment: assessment,
                  looksAggressive: assessment.looksAggressive,
                };
              });

              return {
                variantName: v.variantName,
                currentUnitPrice: money(sell),
                listPriceBeforeDiscount: original != null ? money(original) : null,
                purchasePrice: money(cost),
                catalogDiscountPct,
                marginPctAtCurrentPrice: baseMarginPct,
                marginAssessmentAtCurrentPrice: assessMarginPct(baseMarginPct, benchmark),
                offerImpacts,
              };
            });

            return {
              productId: product.productId,
              name: product.name,
              sku: product.sku,
              productType: product.productType,
              merchandisingCategory: product.merchandisingCategorySlug,
              marketplaceStatus: product.marketplaceStatus,
              marginBenchmark: {
                categoryLabel: benchmark.label,
                typicalRangePct: [benchmark.typicalMinPct, benchmark.typicalMaxPct],
              },
              variants,
            };
          })(),
        ]
      : offer.categoryId
        ? [{ categoryId: offer.categoryId, name: `Category: ${offer.categoryId}` }]
        : [];

    return {
      offerId: offer.offerId,
      name: offer.notes || offer.offerId,
      status: offer.status,
      buyerId: offer.buyerId,
      buyerStoreName: offer.buyer?.storeName ?? null,
      productId: offer.productId,
      categoryId: offer.categoryId,
      discountType: offer.discountType,
      discountValue: dec(offer.discountValue),
      buyQuantity: offer.buyQuantity,
      startDate: offer.startDate,
      endDate: offer.endDate,
      totalUsage: offer.totalUsage,
      totalDiscountGiven: money(dec(offer.totalDiscountGiven)),
      discountRules,
      products,
    };
  });

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
      'Use analyticsWindows, marketplace, topProducts30d, catalogInsights, and offers to answer financial/trend/catalog/discount questions with concrete numbers. Do not only redirect to /analytics or /offers.',
    pricingSemantics: [
      'Judge margins by product type using marginAssessment / marginBenchmark (FMCG F&B typical ~5-10%; beauty/fashion/technology often 15%+; general merchandise 10%+).',
      'pricingMode=discount_already_in_current_price means the current unit price already includes the discount - do not apply the offer percentage/fixed amount again.',
      'pricingMode=offer_applied_on_current_price means estimate the offer on the current unit price.',
      'Use looksAggressive and marginAssessment.status (loss/thin/healthy/strong) - a ~7% FMCG margin can be healthy; the same margin may be thin for fashion/beauty.',
    ],
    userFacingReplyRules: [
      'Speak in business language only: product names, prices, margins, offer names, categories.',
      'Never mention database field names, JSON keys, schema, pricingMode flags, or internal implementation rules in the reply.',
      'Never explain how Lakupak stores discounts; just give the assessment and recommendations.',
    ],
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
    offers: {
      path: '/offers',
      sampleSize: offers.length,
      sampleNote:
        offerCount > offers.length
          ? `Showing ${offers.length} of ${offerCount} offers (most recently updated). Ask to focus on a named offer if needed.`
          : 'All offers currently loaded for this account sample.',
      items: offerInsights,
    },
    catalogInsights: {
      sampleSizeVariants: catalogVariants.length,
      averageMarginPct: avgMarginPct,
      lowMarginVariants,
      highMarginVariants,
      catalogPriceCuts,
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
        'For aggressive offers (looksAggressive / marginAssessment.status loss|thin vs category norms), reduce the discount or exclude weak-margin variants.',
        'Compare margins to marginBenchmark.typicalRangePct for that product type before calling a margin too low.',
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
