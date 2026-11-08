import { Prisma } from '@/lib/prisma-generated';
import { prisma } from '@/lib/db';
import { parseMarketplaceUserIdFromBuyerId } from '@/utils/buyerSync';
import {
  DEFAULT_ASSORTMENT_SETTINGS,
  EVIDENCE_WINDOW_DAYS,
  MATCH_WEIGHTS,
  asWeightMap,
  type MatchWeightKey,
  type PriorityWeightKey,
} from '@/lib/assortmentOpportunities/config';
import {
  assertOpportunityTenant,
  evaluateAssortmentOpportunities,
  evidenceWindowStart,
  linkableMarketplaceUserId,
  measurePortfolio,
  type AssortmentSettings,
  type EngineMarketplaceActivity,
  type EngineOffer,
  type EnginePurchase,
  type EngineRetailer,
  type EngineSku,
  type OpportunityDraft,
  type PortfolioSlice,
} from '@/lib/assortmentOpportunities/engine';
import { PRIORITY_RANK } from '@/lib/assortmentOpportunities/config';

const ACTIVE_STATUSES = ['open', 'reviewed'] as const;

export type OpportunityListFilters = {
  q?: string;
  brand?: string;
  category?: string;
  family?: string;
  retailer?: string;
  segment?: string;
  type?: string;
  status?: string;
  productId?: string;
  variantOptionId?: number;
  /** family = one row per product, with average scores. sku = one row per variant match. */
  group?: 'family' | 'sku';
  minMatch?: number;
  minPriority?: number;
  minConfidence?: number;
  sort?: string;
  page?: number;
  limit?: number;
};

function settingsFromRow(row: {
  lookbackDays: number;
  defaultReorderDays: number;
  minConfidence: Prisma.Decimal | number;
  minMatchScore: number;
  minEvidenceSignals: number;
  matchWeights: Prisma.JsonValue;
  priorityWeights: Prisma.JsonValue;
} | null): AssortmentSettings {
  return {
    lookbackDays: row?.lookbackDays ?? DEFAULT_ASSORTMENT_SETTINGS.lookbackDays,
    defaultReorderDays: row?.defaultReorderDays ?? DEFAULT_ASSORTMENT_SETTINGS.defaultReorderDays,
    minConfidence: Number(row?.minConfidence ?? DEFAULT_ASSORTMENT_SETTINGS.minConfidence),
    minMatchScore: row?.minMatchScore ?? DEFAULT_ASSORTMENT_SETTINGS.minMatchScore,
    minEvidenceSignals: row?.minEvidenceSignals ?? DEFAULT_ASSORTMENT_SETTINGS.minEvidenceSignals,
    matchWeights: asWeightMap(row?.matchWeights, DEFAULT_ASSORTMENT_SETTINGS.matchWeights) as AssortmentSettings['matchWeights'],
    priorityWeights: asWeightMap(row?.priorityWeights, DEFAULT_ASSORTMENT_SETTINGS.priorityWeights) as AssortmentSettings['priorityWeights'],
  };
}

export async function getAssortmentSettings(distributorId: number): Promise<AssortmentSettings> {
  const row = await prisma.assortmentOpportunitySettings.findUnique({ where: { distributorId } });
  return settingsFromRow(row);
}

export async function saveAssortmentSettings(
  distributorId: number,
  patch: Partial<AssortmentSettings>,
): Promise<AssortmentSettings> {
  const current = await getAssortmentSettings(distributorId);
  const next: AssortmentSettings = {
    ...current,
    ...patch,
    matchWeights: { ...current.matchWeights, ...patch.matchWeights },
    priorityWeights: { ...current.priorityWeights, ...patch.priorityWeights },
  };
  await prisma.assortmentOpportunitySettings.upsert({
    where: { distributorId },
    create: {
      distributorId,
      lookbackDays: next.lookbackDays,
      defaultReorderDays: next.defaultReorderDays,
      minConfidence: next.minConfidence,
      minMatchScore: next.minMatchScore,
      minEvidenceSignals: next.minEvidenceSignals,
      matchWeights: next.matchWeights,
      priorityWeights: next.priorityWeights,
    },
    update: {
      lookbackDays: next.lookbackDays,
      defaultReorderDays: next.defaultReorderDays,
      minConfidence: next.minConfidence,
      minMatchScore: next.minMatchScore,
      minEvidenceSignals: next.minEvidenceSignals,
      matchWeights: next.matchWeights,
      priorityWeights: next.priorityWeights,
    },
  });
  return next;
}

function listWhere(distributorId: number, filters: OpportunityListFilters): Prisma.AssortmentOpportunityWhereInput {
  assertOpportunityTenant(distributorId, distributorId);
  const status = filters.status?.trim().toLowerCase();
  const where: Prisma.AssortmentOpportunityWhereInput = {
    distributorId,
    status: status && status !== 'all' ? status : { in: [...ACTIVE_STATUSES] },
    buyer: { is: { status: { equals: 'active', mode: 'insensitive' } } },
  };
  if (filters.brand && filters.brand !== 'all') where.brand = { equals: filters.brand, mode: 'insensitive' };
  if (filters.category && filters.category !== 'all') where.categorySlug = filters.category;
  if (filters.family && filters.family !== 'all') where.productName = { equals: filters.family, mode: 'insensitive' };
  if (filters.productId) where.productId = filters.productId;
  if (filters.variantOptionId != null) where.variantOptionId = filters.variantOptionId;
  if (filters.segment && filters.segment !== 'all') where.segment = { equals: filters.segment, mode: 'insensitive' };
  if (filters.type && filters.type !== 'all') where.opportunityType = filters.type;
  if (filters.retailer?.trim()) where.retailerName = { contains: filters.retailer.trim(), mode: 'insensitive' };
  if (filters.q?.trim()) {
    where.OR = [
      { skuLabel: { contains: filters.q.trim(), mode: 'insensitive' } },
      { variantName: { contains: filters.q.trim(), mode: 'insensitive' } },
      { productName: { contains: filters.q.trim(), mode: 'insensitive' } },
      { retailerName: { contains: filters.q.trim(), mode: 'insensitive' } },
    ];
  }
  if (filters.minMatch != null && Number.isFinite(filters.minMatch)) where.matchScore = { gte: filters.minMatch };
  if (filters.minPriority != null && Number.isFinite(filters.minPriority)) where.priorityScore = { gte: filters.minPriority };
  if (filters.minConfidence != null && Number.isFinite(filters.minConfidence)) {
    where.confidence = { gte: filters.minConfidence };
  }
  return where;
}

export type FamilyOpportunityRow = {
  productId: string;
  productName: string;
  brand: string;
  categorySlug: string | null;
  variantCount: number;
  retailerCount: number;
  matchScore: number;
  priorityScore: number;
  penetration: number;
  confidence: number;
  image: string | null;
};

type RawPurchase = {
  buyerId: string;
  orderId: string;
  orderStatus: string;
  at: Date;
  variantOptionId: number | null;
  productId: string | null;
  skuSnapshot: string | null;
  variantName: string | null;
  productName: string | null;
  unitPrice: Prisma.Decimal | null;
  quantity: number | null;
};

function toRetailers(buyers: Array<{ buyerId: string; storeName: string; businessType: string; region: string | null; phone: string; status: string }>): EngineRetailer[] {
  return buyers.map((buyer) => ({
    buyerId: buyer.buyerId,
    storeName: buyer.storeName,
    segment: buyer.businessType,
    region: buyer.region,
    phone: buyer.phone,
    status: buyer.status,
  }));
}

function toSkus(skus: Array<{
  id: number;
  sku: string | null;
  variantName: string;
  sellingPrice: Prisma.Decimal | number;
  stockQuantity: number;
  isActive: boolean;
  attributes: Prisma.JsonValue;
  product: {
    productId: string;
    name: string;
    brand: string;
    productType: string;
    merchandisingCategorySlug: string | null;
    status: string;
  };
}>): EngineSku[] {
  return skus.map((sku) => ({
    variantOptionId: sku.id,
    sku: sku.sku,
    variantName: sku.variantName,
    productId: sku.product.productId,
    productName: sku.product.name,
    brand: sku.product.brand,
    categorySlug: sku.product.merchandisingCategorySlug,
    productType: sku.product.productType,
    sellingPrice: Number(sku.sellingPrice),
    stockQuantity: sku.stockQuantity,
    isActive: sku.isActive,
    productStatus: sku.product.status,
    attributes:
      sku.attributes && typeof sku.attributes === 'object' && !Array.isArray(sku.attributes)
        ? (sku.attributes as Record<string, unknown>)
        : null,
  }));
}

function toPurchases(rows: RawPurchase[]): EnginePurchase[] {
  return rows.map((row) => ({
    buyerId: row.buyerId,
    orderId: row.orderId,
    orderStatus: row.orderStatus,
    at: new Date(row.at).toISOString(),
    variantOptionId: row.variantOptionId,
    productId: row.productId,
    skuSnapshot: row.skuSnapshot,
    variantName: row.variantName,
    productName: row.productName,
    unitPrice: row.unitPrice == null ? null : Number(row.unitPrice),
    quantity: row.quantity,
  }));
}

function loadOrderLines(distributorId: number, since?: Date) {
  const windowSql = since ? Prisma.sql`AND o."orderDate" > ${since}` : Prisma.empty;
  return prisma.$queryRaw<RawPurchase[]>`
    SELECT o."buyerId" AS "buyerId",
           o."orderId" AS "orderId",
           o."orderStatus" AS "orderStatus",
           o."orderDate" AS "at",
           oi."variantOptionId" AS "variantOptionId",
           oi."productId" AS "productId",
           oi."productSkuSnapshot" AS "skuSnapshot",
           oi."variantNameSnapshot" AS "variantName",
           oi."productNameSnapshot" AS "productName",
           COALESCE(oi."unitPriceSnapshot", oi."pricePerPackage") AS "unitPrice",
           oi."packageQuantity" AS "quantity"
    FROM "OrderItem" oi
    INNER JOIN "Order" o ON o."orderId" = oi."orderId"
    WHERE o."userId" = ${distributorId}
      AND o."isDeleted" = false
      AND o."buyerId" IS NOT NULL
      ${windowSql}
  `;
}

async function loadMatchInputs(distributorId: number, purchasesSince?: Date) {
  const [buyers, skus, purchaseRows] = await Promise.all([
    prisma.buyer.findMany({
      where: { userId: distributorId },
      select: { buyerId: true, storeName: true, businessType: true, region: true, phone: true, status: true },
    }),
    prisma.variantOption.findMany({
      where: { product: { userId: distributorId } },
      select: {
        id: true,
        sku: true,
        variantName: true,
        sellingPrice: true,
        stockQuantity: true,
        isActive: true,
        attributes: true,
        product: {
          select: {
            productId: true,
            name: true,
            brand: true,
            productType: true,
            merchandisingCategorySlug: true,
            status: true,
          },
        },
      },
    }),
    loadOrderLines(distributorId, purchasesSince),
  ]);
  return {
    buyers,
    retailers: toRetailers(buyers),
    skus: toSkus(skus),
    purchases: toPurchases(purchaseRows),
  };
}

async function loadPortfolio(distributorId: number) {
  const now = new Date();
  const [catalog, images] = await Promise.all([
    loadMatchInputs(distributorId, evidenceWindowStart(now)),
    prisma.product.findMany({
      where: { userId: distributorId },
      select: { productId: true, images: true },
    }),
  ]);
  const measured = measurePortfolio({
    now,
    retailers: catalog.retailers,
    skus: catalog.skus,
    purchases: catalog.purchases,
  });
  const imageByProduct = new Map(images.map((product) => [product.productId, product.images?.[0] ?? null]));
  return { ...measured, imageByProduct };
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export async function listFamilyOpportunities(distributorId: number, filters: OpportunityListFilters) {
  const page = Math.max(1, filters.page || 1);
  const limit = Math.min(50, Math.max(1, filters.limit || 10));
  const where = listWhere(distributorId, filters);
  const summaryWhere: Prisma.AssortmentOpportunityWhereInput = {
    distributorId,
    status: { in: [...ACTIVE_STATUSES] },
    buyer: { is: { status: { equals: 'active', mode: 'insensitive' } } },
  };
  const [matched, summary, highPriority, fresh, reactivation, facetRows, settings] = await Promise.all([
    prisma.assortmentOpportunity.findMany({
      where,
      select: {
        productId: true,
        productName: true,
        brand: true,
        categorySlug: true,
        variantOptionId: true,
        buyerId: true,
        matchScore: true,
        priorityScore: true,
        confidence: true,
        penetration: true,
      },
    }),
    prisma.assortmentOpportunity.count({ where: summaryWhere }),
    prisma.assortmentOpportunity.count({
      where: {
        ...summaryWhere,
        OR: [
          { priorityScore: { gte: 70 } },
          { priorityScore: { gte: PRIORITY_RANK.high, lte: PRIORITY_RANK.urgent } },
        ],
      },
    }),
    prisma.assortmentOpportunity.count({ where: { ...summaryWhere, opportunityType: 'new_assortment' } }),
    prisma.assortmentOpportunity.count({ where: { ...summaryWhere, opportunityType: 'reactivation' } }),
    prisma.assortmentOpportunity.findMany({
      where: summaryWhere,
      select: { brand: true, categorySlug: true, productName: true, segment: true },
      distinct: ['brand', 'categorySlug', 'productName', 'segment'],
    }),
    getAssortmentSettings(distributorId),
  ]);

  const grouped = new Map<string, {
    productId: string;
    productName: string;
    brand: string;
    categorySlug: string | null;
    variants: Set<number>;
    retailers: Set<string>;
    match: number[];
    priority: number[];
    penetration: number[];
    confidence: number[];
  }>();
  for (const row of matched) {
    const current = grouped.get(row.productId) ?? {
      productId: row.productId,
      productName: row.productName,
      brand: row.brand,
      categorySlug: row.categorySlug,
      variants: new Set<number>(),
      retailers: new Set<string>(),
      match: [],
      priority: [],
      penetration: [],
      confidence: [],
    };
    current.variants.add(row.variantOptionId);
    current.retailers.add(row.buyerId);
    current.match.push(row.matchScore);
    current.priority.push(row.priorityScore);
    current.penetration.push(Number(row.penetration));
    current.confidence.push(Number(row.confidence));
    grouped.set(row.productId, current);
  }

  const families: FamilyOpportunityRow[] = [...grouped.values()]
    .map((family) => ({
      productId: family.productId,
      productName: family.productName,
      brand: family.brand,
      categorySlug: family.categorySlug,
      variantCount: family.variants.size,
      retailerCount: family.retailers.size,
      matchScore: Math.round(average(family.match)),
      priorityScore: Math.round(average(family.priority)),
      penetration: Math.round(average(family.penetration) * 10) / 10,
      confidence: Math.round(average(family.confidence) * 1000) / 1000,
      image: null,
    }))
    .sort((a, b) => b.priorityScore - a.priorityScore || b.matchScore - a.matchScore);

  const total = families.length;
  const unique = (values: Array<string | null | undefined>) =>
    [...new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value)))].sort((a, b) =>
      a.localeCompare(b),
    );

  return {
    summary: {
      total: summary,
      highPriority,
      newAssortment: fresh,
      reactivation,
      highPriorityScore: DEFAULT_ASSORTMENT_SETTINGS.highPriorityScore,
    },
    settings,
    facets: {
      brands: unique(facetRows.map((row) => row.brand)),
      categories: unique(facetRows.map((row) => row.categorySlug)),
      families: unique(facetRows.map((row) => row.productName)),
      segments: unique(facetRows.map((row) => row.segment)),
    },
    page,
    limit,
    total,
    totalPages: Math.max(1, Math.ceil(total / limit)),
    rows: await alignFamilyRows(distributorId, families.slice((page - 1) * limit, page * limit)),
  };
}

async function alignFamilyRows(distributorId: number, rows: FamilyOpportunityRow[]): Promise<FamilyOpportunityRow[]> {
  const rates = await loadPortfolio(distributorId);
  return rows.map((row) => {
    const slice = rates.product.get(row.productId);
    return {
      ...row,
      image: rates.imageByProduct.get(row.productId) ?? null,
      penetration: slice?.penetration ?? 0,
      retailerCount: slice?.regulars ?? 0,
    };
  });
}

export async function listAssortmentOpportunities(distributorId: number, filters: OpportunityListFilters) {
  const page = Math.max(1, filters.page || 1);
  const limit = Math.min(50, Math.max(1, filters.limit || 10));
  const where = listWhere(distributorId, filters);
  const summaryWhere: Prisma.AssortmentOpportunityWhereInput = {
    distributorId,
    status: { in: [...ACTIVE_STATUSES] },
    buyer: { is: { status: { equals: 'active', mode: 'insensitive' } } },
  };
  const [total, rows, summary, highPriority, fresh, reactivation, facetRows, settings] = await Promise.all([
    prisma.assortmentOpportunity.count({ where }),
    prisma.assortmentOpportunity.findMany({
      where,
      orderBy: [{ priorityScore: 'desc' }, { matchScore: 'desc' }],
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.assortmentOpportunity.count({ where: summaryWhere }),
    prisma.assortmentOpportunity.count({
      where: {
        ...summaryWhere,
        OR: [
          { priorityScore: { gte: 70 } },
          { priorityScore: { gte: PRIORITY_RANK.high, lte: PRIORITY_RANK.urgent } },
        ],
      },
    }),
    prisma.assortmentOpportunity.count({ where: { ...summaryWhere, opportunityType: 'new_assortment' } }),
    prisma.assortmentOpportunity.count({ where: { ...summaryWhere, opportunityType: 'reactivation' } }),
    prisma.assortmentOpportunity.findMany({
      where: summaryWhere,
      select: { brand: true, categorySlug: true, productName: true, segment: true },
      distinct: ['brand', 'categorySlug', 'productName', 'segment'],
    }),
    getAssortmentSettings(distributorId),
  ]);

  const unique = (values: Array<string | null | undefined>) =>
    [...new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value)))].sort((a, b) =>
      a.localeCompare(b),
    );

  return {
    summary: {
      total: summary,
      highPriority,
      newAssortment: fresh,
      reactivation,
      highPriorityScore: DEFAULT_ASSORTMENT_SETTINGS.highPriorityScore,
    },
    settings,
    facets: {
      brands: unique(facetRows.map((row) => row.brand)),
      categories: unique(facetRows.map((row) => row.categorySlug)),
      families: unique(facetRows.map((row) => row.productName)),
      segments: unique(facetRows.map((row) => row.segment)),
    },
    page,
    limit,
    total,
    totalPages: Math.max(1, Math.ceil(total / limit)),
    rows: await alignSkuRows(distributorId, rows),
  };
}

export async function listVariantGroups(distributorId: number, filters: OpportunityListFilters) {
  const page = Math.max(1, filters.page || 1);
  const limit = Math.min(50, Math.max(1, filters.limit || 10));
  const where = listWhere(distributorId, filters);
  const facetWhere: Prisma.AssortmentOpportunityWhereInput = {
    distributorId,
    status: { in: [...ACTIVE_STATUSES] },
    buyer: { is: { status: { equals: 'active', mode: 'insensitive' } } },
    ...(filters.productId ? { productId: filters.productId } : {}),
  };
  const [grouped, portfolio, facetRows] = await Promise.all([
    prisma.assortmentOpportunity.groupBy({
      by: ['variantOptionId'],
      where,
      _count: { _all: true },
      _avg: { matchScore: true },
      _max: { priorityScore: true },
    }),
    loadPortfolio(distributorId),
    prisma.assortmentOpportunity.findMany({
      where: facetWhere,
      select: { brand: true, categorySlug: true },
      distinct: ['brand', 'categorySlug'],
    }),
  ]);
  const sortKey = filters.sort || 'priority';
  const sortValue = (group: (typeof grouped)[number]) => {
    if (sortKey === 'match') return group._avg.matchScore ?? 0;
    if (sortKey === 'retailers') return group._count._all;
    if (sortKey === 'penetration') return portfolio.sku.get(group.variantOptionId)?.penetration ?? 0;
    return group._max.priorityScore ?? 0;
  };
  grouped.sort((a, b) => sortValue(b) - sortValue(a) || a.variantOptionId - b.variantOptionId);
  const total = grouped.length;
  const pageGroups = grouped.slice((page - 1) * limit, page * limit);
  const ids = pageGroups.map((group) => group.variantOptionId);
  const [samples, typeCounts] = await Promise.all([
    ids.length === 0
      ? Promise.resolve([])
      : prisma.assortmentOpportunity.findMany({
          where: { ...where, variantOptionId: { in: ids } },
          distinct: ['variantOptionId'],
          orderBy: { variantOptionId: 'asc' },
          select: {
            variantOptionId: true,
            skuLabel: true,
            variantName: true,
            productName: true,
            brand: true,
            productId: true,
          },
        }),
    ids.length === 0
      ? Promise.resolve([])
      : prisma.assortmentOpportunity.groupBy({
          by: ['variantOptionId', 'opportunityType'],
          where: { ...where, variantOptionId: { in: ids } },
          _count: { _all: true },
        }),
  ]);
  const productRecord = filters.productId
    ? await prisma.product.findFirst({
        where: { userId: distributorId, productId: filters.productId },
        select: { name: true, brand: true, images: true },
      })
    : null;
  const sampleByVariant = new Map(samples.map((row) => [row.variantOptionId, row]));
  const typesByVariant = new Map<number, { newAssortment: number; reactivation: number }>();
  for (const row of typeCounts) {
    const current = typesByVariant.get(row.variantOptionId) ?? { newAssortment: 0, reactivation: 0 };
    if (row.opportunityType === 'reactivation') current.reactivation = row._count._all;
    else current.newAssortment += row._count._all;
    typesByVariant.set(row.variantOptionId, current);
  }
  return {
    page,
    limit,
    total,
    totalPages: Math.max(1, Math.ceil(total / limit)),
    matchTotal: grouped.reduce((sum, group) => sum + group._count._all, 0),
    product: productRecord
      ? { name: productRecord.name, brand: productRecord.brand, image: productRecord.images?.[0] ?? null }
      : null,
    facets: {
      brands: [...new Set(facetRows.map((row) => row.brand?.trim()).filter((value): value is string => Boolean(value)))].sort((a, b) => a.localeCompare(b)),
      categories: [...new Set(facetRows.map((row) => row.categorySlug?.trim()).filter((value): value is string => Boolean(value)))].sort((a, b) => a.localeCompare(b)),
    },
    rows: pageGroups.map((group) => {
      const sample = sampleByVariant.get(group.variantOptionId);
      const types = typesByVariant.get(group.variantOptionId) ?? { newAssortment: 0, reactivation: 0 };
      return {
        variantOptionId: group.variantOptionId,
        skuLabel: sample?.skuLabel ?? '',
        variantName: sample?.variantName ?? '',
        productName: sample?.productName ?? '',
        brand: sample?.brand ?? '',
        productId: sample?.productId ?? '',
        retailerCount: group._count._all,
        penetration: portfolio.sku.get(group.variantOptionId)?.penetration ?? 0,
        matchScore: Math.round(group._avg.matchScore ?? 0),
        priorityScore: group._max.priorityScore ?? 0,
        newAssortment: types.newAssortment,
        reactivation: types.reactivation,
      };
    }),
  };
}

async function alignSkuRows<T extends { productId: string; variantOptionId: number; penetration: unknown }>(
  distributorId: number,
  rows: T[],
) {
  const rates = await loadPortfolio(distributorId);
  return rows.map((row) => ({
    ...row,
    image: rates.imageByProduct.get(row.productId) ?? null,
    penetration: rates.sku.get(row.variantOptionId)?.penetration ?? 0,
  }));
}

function variantFromActivity(metadata: Prisma.JsonValue | null): string | null {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return null;
  const variant = (metadata as { variant?: unknown }).variant;
  return typeof variant === 'string' && variant.trim() ? variant.trim() : null;
}

const MARKETPLACE_EVENTS = ['viewed', 'favorite', 'cart_added', 'cart_abandoned'] as const;

/** Current carts, plus views, favorites, and cart events from the evidence window. */
async function loadMarketplaceActivities(
  buyers: Array<{ buyerId: string }>,
  productIds: string[],
  now: Date,
): Promise<EngineMarketplaceActivity[]> {
  const buyerByMarketplaceUser = new Map<number, string>();
  for (const buyer of buyers) {
    const marketplaceUserId = linkableMarketplaceUserId(parseMarketplaceUserIdFromBuyerId(buyer.buyerId));
    if (marketplaceUserId != null) buyerByMarketplaceUser.set(marketplaceUserId, buyer.buyerId);
  }
  if (buyerByMarketplaceUser.size === 0 || productIds.length === 0) return [];
  const candidateIds = [...buyerByMarketplaceUser.keys()];
  const existingUsers = await prisma.marketplaceUser.findMany({
    where: { id: { in: candidateIds } },
    select: { id: true },
  });
  const existingIds = new Set(existingUsers.map((user) => user.id));
  for (const id of candidateIds) {
    if (!existingIds.has(id)) buyerByMarketplaceUser.delete(id);
  }
  if (buyerByMarketplaceUser.size === 0) return [];
  const since = new Date(now.getTime() - EVIDENCE_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const rows = await prisma.userActivity.findMany({
    where: {
      userId: { in: [...buyerByMarketplaceUser.keys()] },
      productId: { in: productIds },
      OR: [
        { activityType: 'cart' },
        { activityType: { in: [...MARKETPLACE_EVENTS] }, createdAt: { gte: since } },
      ],
    },
    select: { userId: true, productId: true, activityType: true, metadata: true, createdAt: true },
  });
  const activities: EngineMarketplaceActivity[] = [];
  for (const row of rows) {
    const buyerId = buyerByMarketplaceUser.get(row.userId);
    if (!buyerId) continue;
    if (
      row.activityType !== 'viewed' &&
      row.activityType !== 'favorite' &&
      row.activityType !== 'cart' &&
      row.activityType !== 'cart_added' &&
      row.activityType !== 'cart_abandoned'
    ) continue;
    activities.push({
      buyerId,
      productId: row.productId,
      variant: variantFromActivity(row.metadata),
      activityType: row.activityType,
      at: row.createdAt.toISOString(),
    });
  }
  return activities;
}

function draftData(distributorId: number, draft: OpportunityDraft) {
  return {
    distributorId,
    buyerId: draft.buyerId,
    variantOptionId: draft.variantOptionId,
    productId: draft.productId,
    opportunityType: draft.opportunityType,
    matchScore: draft.matchScore,
    priorityScore: draft.priorityScore,
    confidence: draft.confidence,
    penetration: draft.penetration,
    skuLabel: draft.skuLabel,
    variantName: draft.variantName,
    productName: draft.productName,
    brand: draft.brand,
    categorySlug: draft.categorySlug,
    retailerName: draft.retailerName,
    segment: draft.segment,
    reasons: draft.reasons,
    breakdown: draft.breakdown as unknown as Prisma.InputJsonValue,
    recommendedAction: draft.recommendedAction,
    lastPurchasedAt: draft.lastPurchasedAt ? new Date(draft.lastPurchasedAt) : null,
    reorderIntervalDays: draft.reorderIntervalDays,
  };
}

export async function refreshAssortmentOpportunities(distributorId: number) {
  assertOpportunityTenant(distributorId, distributorId);
  const settings = await getAssortmentSettings(distributorId);
  const [catalog, offers] = await Promise.all([
    loadMatchInputs(distributorId),
    prisma.offer.findMany({
      where: { userId: distributorId, status: 'active', variantOptionId: { not: null } },
      select: { buyerId: true, variantOptionId: true, discountType: true, discountValue: true, status: true, endDate: true },
    }),
  ]);

  const now = new Date();
  const { buyers, retailers, skus: engineSkus, purchases } = catalog;
  const engineOffers: EngineOffer[] = offers
    .filter((offer) => !offer.endDate || offer.endDate >= now)
    .map((offer) => ({
      buyerId: offer.buyerId,
      variantOptionId: offer.variantOptionId,
      discountType: offer.discountType,
      discountValue: Number(offer.discountValue),
      status: offer.status,
    }));
  const productIds = [...new Set(engineSkus.map((sku) => sku.productId))];
  const marketplace = await loadMarketplaceActivities(buyers, productIds, now);
  const drafts = evaluateAssortmentOpportunities({
    now,
    settings,
    retailers,
    skus: engineSkus,
    purchases,
    offers: engineOffers,
    marketplace,
  });
  const keys = new Set(drafts.map((draft) => `${draft.buyerId}:${draft.variantOptionId}`));
  const existing = await prisma.assortmentOpportunity.findMany({
    where: { distributorId },
    select: { id: true, buyerId: true, variantOptionId: true, status: true },
  });
  const existingByKey = new Map(existing.map((row) => [`${row.buyerId}:${row.variantOptionId}`, row]));
  const toCreate: Prisma.AssortmentOpportunityCreateManyInput[] = [];
  const toUpdate: Array<{ id: string; data: ReturnType<typeof draftData>; status: string }> = [];
  for (const draft of drafts) {
    const key = `${draft.buyerId}:${draft.variantOptionId}`;
    const current = existingByKey.get(key);
    const data = draftData(distributorId, draft);
    if (!current) {
      toCreate.push({ ...data, status: 'open', generatedAt: now });
    } else {
      toUpdate.push({
        id: current.id,
        data,
        status: current.status === 'expired' ? 'open' : current.status,
      });
    }
  }

  for (let index = 0; index < toCreate.length; index += 100) {
    const created = await prisma.assortmentOpportunity.createManyAndReturn({
      data: toCreate.slice(index, index + 100),
      skipDuplicates: true,
    });
    if (created.length === 0) continue;
    await prisma.assortmentOpportunityEvent.createMany({
      data: created.map((row) => ({ opportunityId: row.id, distributorId, action: 'created' })),
    });
  }

  for (let index = 0; index < toUpdate.length; index += 20) {
    await Promise.all(
      toUpdate.slice(index, index + 20).map((row) =>
        prisma.assortmentOpportunity.update({
          where: { id: row.id },
          data: { ...row.data, status: row.status, generatedAt: now },
        }),
      ),
    );
  }

  const stale = existing.filter(
    (row) => !keys.has(`${row.buyerId}:${row.variantOptionId}`) && (row.status === 'open' || row.status === 'reviewed'),
  );
  if (stale.length > 0) {
    await prisma.assortmentOpportunity.updateMany({
      where: { distributorId, id: { in: stale.map((row) => row.id) } },
      data: { status: 'expired' },
    });
    await prisma.assortmentOpportunityEvent.createMany({
      data: stale.map((row) => ({ opportunityId: row.id, distributorId, action: 'expired' })),
    });
  }

  await prisma.assortmentOpportunitySettings.upsert({
    where: { distributorId },
    create: {
      distributorId,
      lookbackDays: settings.lookbackDays,
      defaultReorderDays: settings.defaultReorderDays,
      minConfidence: settings.minConfidence,
      minMatchScore: settings.minMatchScore,
      minEvidenceSignals: settings.minEvidenceSignals,
      matchWeights: settings.matchWeights,
      priorityWeights: settings.priorityWeights,
      lastRefreshedAt: now,
    },
    update: { lastRefreshedAt: now },
  });

  return { generated: drafts.length };
}

const STATUS_ACTIONS: Record<string, string> = {
  open: 'reopened',
  reviewed: 'reviewed',
  dismissed: 'dismissed',
};

export async function updateAssortmentOpportunityStatus(
  distributorId: number,
  id: string,
  status: 'open' | 'reviewed' | 'dismissed',
) {
  const row = await prisma.assortmentOpportunity.findFirst({ where: { id, distributorId } });
  if (!row) return null;
  assertOpportunityTenant(row.distributorId, distributorId);
  const updated = await prisma.assortmentOpportunity.update({
    where: { id: row.id },
    data: { status, reviewedAt: status === 'open' ? null : new Date() },
  });
  await prisma.assortmentOpportunityEvent.create({
    data: { opportunityId: row.id, distributorId, action: STATUS_ACTIONS[status] },
  });
  return updated;
}

export async function getAssortmentOpportunity(distributorId: number, id: string) {
  const row = await prisma.assortmentOpportunity.findFirst({
    where: { id, distributorId },
    include: { events: { orderBy: { createdAt: 'desc' }, take: 20 } },
  });
  if (!row) return null;
  assertOpportunityTenant(row.distributorId, distributorId);
  const history = await prisma.orderItem.findMany({
    where: {
      OR: [{ variantOptionId: row.variantOptionId }, { productId: row.productId }],
      order: { userId: distributorId, buyerId: row.buyerId, isDeleted: false },
    },
    orderBy: { createdAt: 'desc' },
    take: 12,
    select: {
      productNameSnapshot: true,
      variantNameSnapshot: true,
      productSkuSnapshot: true,
      packageQuantity: true,
      unitPriceSnapshot: true,
      pricePerPackage: true,
      variantOptionId: true,
      order: { select: { orderDate: true, orderStatus: true, orderId: true } },
    },
  });
  const rates = await loadPortfolio(distributorId);
  const slice: PortfolioSlice | undefined = rates.sku.get(row.variantOptionId);
  const breakdown =
    row.breakdown && typeof row.breakdown === 'object' && !Array.isArray(row.breakdown)
      ? {
          ...(row.breakdown as Record<string, unknown>),
          penetration: { purchased: slice?.purchased ?? 0, eligible: slice?.regulars ?? 0 },
        }
      : row.breakdown;
  return {
    opportunity: {
      ...row,
      penetration: slice?.penetration ?? 0,
      breakdown,
      image: rates.imageByProduct.get(row.productId) ?? null,
    },
    history,
  };
}

const SIGNAL_REASONS: Record<MatchWeightKey, readonly string[]> = {
  categoryAffinity: ['repeated_category'],
  coPurchase: ['competing_products'],
  segmentFit: ['segment_buys_category'],
  purchasingActivity: ['regular_category_orders'],
  priceSuitability: ['price_within_range', 'price_outside_range'],
};

function storedSignal(breakdown: unknown, key: MatchWeightKey): { score: number | null; reason: string | null } | null {
  if (!breakdown || typeof breakdown !== 'object' || Array.isArray(breakdown)) return null;
  const signal = (breakdown as { signals?: Record<string, { available?: boolean; score?: number | null; reason?: string | null }> }).signals?.[key];
  if (!signal?.available) return null;
  return {
    score: typeof signal.score === 'number' ? signal.score : null,
    reason: typeof signal.reason === 'string' ? signal.reason : null,
  };
}

type SignalExample = {
  productName: string;
  retailerName: string;
  categorySlug: string | null;
  segment: string;
  reason: string | null;
  score: number | null;
  matchScore: number;
};

function exampleIdentity(example: SignalExample): string {
  return `${example.productName.trim().toLowerCase()}::${example.retailerName.trim().toLowerCase()}`;
}

/** One example per signal; avoid reusing the same product or retailer across weights when possible. */
function assignUniqueExamples(
  drafts: Array<{ candidates: SignalExample[]; examples: SignalExample[] }>,
): void {
  const usedProducts = new Set<string>();
  const usedRetailers = new Set<string>();
  const usedPairs = new Set<string>();

  const tryPick = (
    ranked: SignalExample[],
    requireFreshProduct: boolean,
    requireFreshRetailer: boolean,
  ): SignalExample | null => {
    for (const example of ranked) {
      const productKey = example.productName.trim().toLowerCase();
      const retailerKey = example.retailerName.trim().toLowerCase();
      const pairKey = exampleIdentity(example);
      if (usedPairs.has(pairKey)) continue;
      if (requireFreshProduct && usedProducts.has(productKey)) continue;
      if (requireFreshRetailer && usedRetailers.has(retailerKey)) continue;
      return example;
    }
    return null;
  };

  for (const draft of drafts) {
    const ranked = [...draft.candidates].sort(
      (a, b) => (b.score ?? -1) - (a.score ?? -1) || b.matchScore - a.matchScore,
    );
    const picked =
      tryPick(ranked, true, true) ??
      tryPick(ranked, true, false) ??
      tryPick(ranked, false, true) ??
      tryPick(ranked, false, false);
    if (!picked) {
      draft.examples = [];
      continue;
    }
    draft.examples = [picked];
    usedProducts.add(picked.productName.trim().toLowerCase());
    usedRetailers.add(picked.retailerName.trim().toLowerCase());
    usedPairs.add(exampleIdentity(picked));
  }
}

export async function assortmentAnalysisFacts(distributorId: number) {
  assertOpportunityTenant(distributorId, distributorId);
  const [portfolio, opportunities, products] = await Promise.all([
    loadPortfolio(distributorId),
    prisma.assortmentOpportunity.findMany({
      where: {
        distributorId,
        status: { in: [...ACTIVE_STATUSES] },
        buyer: { is: { status: { equals: 'active', mode: 'insensitive' } } },
      },
      select: {
        buyerId: true,
        productId: true,
        productName: true,
        retailerName: true,
        categorySlug: true,
        segment: true,
        opportunityType: true,
        reasons: true,
        matchScore: true,
        breakdown: true,
      },
    }),
    prisma.product.findMany({
      where: { userId: distributorId },
      select: { productId: true, name: true, brand: true },
    }),
  ]);
  const matchTotal = opportunities.reduce((sum, row) => sum + Number(row.matchScore), 0);
  const signalDrafts = (Object.keys(MATCH_WEIGHTS) as MatchWeightKey[]).map((key) => {
    const buyers = new Set<string>();
    const productIds = new Set<string>();
    const categoryCounts = new Map<string, number>();
    const segmentCounts = new Map<string, number>();
    const candidates: SignalExample[] = [];
    let matches = 0;
    let scoreTotal = 0;
    let scored = 0;
    let strongScores = 0;
    let insideRange = 0;
    let outsideRange = 0;
    for (const row of opportunities) {
      const signal = storedSignal(row.breakdown, key);
      const reason = signal?.reason ?? row.reasons.find((code) => SIGNAL_REASONS[key].includes(code)) ?? null;
      if (!signal && !reason) continue;
      matches += 1;
      buyers.add(row.buyerId);
      productIds.add(row.productId);
      const categoryKey = row.categorySlug?.trim();
      if (categoryKey) categoryCounts.set(categoryKey, (categoryCounts.get(categoryKey) ?? 0) + 1);
      const segmentKey = row.segment?.trim();
      if (segmentKey) segmentCounts.set(segmentKey, (segmentCounts.get(segmentKey) ?? 0) + 1);
      if (signal?.score != null) {
        scoreTotal += signal.score;
        scored += 1;
        if (signal.score >= 80) strongScores += 1;
      }
      if (reason === 'price_within_range') insideRange += 1;
      if (reason === 'price_outside_range') outsideRange += 1;
      candidates.push({
        productName: row.productName,
        retailerName: row.retailerName,
        categorySlug: row.categorySlug,
        segment: row.segment,
        reason,
        score: signal?.score ?? null,
        matchScore: Number(row.matchScore),
      });
    }
    const topCategoryEntry = [...categoryCounts.entries()].sort(
      (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
    )[0];
    const topSegmentEntry = [...segmentCounts.entries()].sort(
      (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
    )[0];
    return {
      key,
      weight: MATCH_WEIGHTS[key],
      matches,
      retailers: buyers.size,
      products: productIds.size,
      averageScore: scored > 0 ? Math.round(scoreTotal / scored) : null,
      strongScores,
      insideRange,
      outsideRange,
      topCategory: topCategoryEntry?.[0] ?? null,
      topCategoryMatches: topCategoryEntry?.[1] ?? 0,
      topSegment: topSegmentEntry?.[0] ?? null,
      topSegmentMatches: topSegmentEntry?.[1] ?? 0,
      candidates,
      examples: [] as SignalExample[],
    };
  });

  // Prefer signals with fewer candidate pairs first so scarce examples are not all claimed by earlier weights.
  assignUniqueExamples(
    [...signalDrafts].sort((a, b) => a.candidates.length - b.candidates.length || a.weight - b.weight),
  );

  const signals = signalDrafts.map(({ candidates: _candidates, ...signal }) => signal);
  const productLabels = new Map(products.map((product) => [product.productId, { name: product.name, brand: product.brand }]));
  const penetrationRows = [...portfolio.product.entries()]
    .map(([productId, slice]) => ({
      productName: productLabels.get(productId)?.name ?? productId,
      brand: productLabels.get(productId)?.brand ?? null,
      buyersOfProduct: slice.purchased,
      categoryBuyers: slice.regulars,
      notBuying: slice.gap,
      penetrationPct: slice.penetration,
    }))
    .filter((row) => row.categoryBuyers > 0);
  const lowestPenetration = [...penetrationRows]
    .sort((a, b) => a.penetrationPct - b.penetrationPct || b.notBuying - a.notBuying)
    .slice(0, 8);
  const highestPenetration = [...penetrationRows]
    .sort((a, b) => b.penetrationPct - a.penetrationPct || b.buyersOfProduct - a.buyersOfProduct)
    .slice(0, 8);
  const averagePenetrationPct = penetrationRows.length
    ? Math.round((penetrationRows.reduce((sum, row) => sum + row.penetrationPct, 0) / penetrationRows.length) * 10) / 10
    : null;
  let newAssortment = 0;
  let reactivation = 0;
  for (const row of opportunities) {
    if (row.opportunityType === 'reactivation') reactivation += 1;
    else newAssortment += 1;
  }
  return {
    windowDays: EVIDENCE_WINDOW_DAYS,
    activeRetailers: portfolio.activeRetailers,
    orderingRetailers: portfolio.orderingRetailers,
    openMatches: opportunities.length,
    averageMatch: opportunities.length > 0 ? Math.round(matchTotal / opportunities.length) : 0,
    newAssortment,
    reactivation,
    signals,
    penetration: {
      productsWithCategoryBuyers: penetrationRows.length,
      averagePenetrationPct,
      lowestPenetration,
      highestPenetration,
    },
  };
}

export type { MatchWeightKey, PriorityWeightKey };
