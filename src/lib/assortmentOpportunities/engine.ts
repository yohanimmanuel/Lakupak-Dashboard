import {
  DEFAULT_ASSORTMENT_SETTINGS,
  ELIGIBLE_RETAILER_STATUSES,
  EVIDENCE_WINDOW_DAYS,
  NON_PURCHASE_ORDER_STATUSES,
  PRIORITY_RANK,
  clampScore,
  type MatchWeightKey,
  type PriorityLabel,
} from '@/lib/assortmentOpportunities/config';

export type AssortmentSettings = {
  lookbackDays: number;
  defaultReorderDays: number;
  minConfidence: number;
  minMatchScore: number;
  minEvidenceSignals: number;
  matchWeights: Record<MatchWeightKey, number>;
  priorityWeights: Record<'matchSuitability' | 'commercialValue' | 'actionability' | 'freshness', number>;
};

export type EngineRetailer = {
  buyerId: string;
  storeName: string;
  segment: string;
  region: string | null;
  phone: string;
  status: string;
};

export type EngineSku = {
  variantOptionId: number;
  sku: string | null;
  variantName: string;
  productId: string;
  productName: string;
  brand: string;
  categorySlug: string | null;
  productType: string;
  sellingPrice: number;
  stockQuantity: number;
  isActive: boolean;
  productStatus: string;
  attributes?: Record<string, unknown> | null;
};

export type EnginePurchase = {
  buyerId: string;
  orderId: string;
  orderStatus: string;
  at: string;
  variantOptionId: number | null;
  productId: string | null;
  skuSnapshot: string | null;
  variantName?: string | null;
  productName?: string | null;
  unitPrice: number | null;
  quantity: number | null;
};

export type EngineOffer = {
  buyerId: string | null;
  variantOptionId: number | null;
  discountType: string;
  discountValue: number;
  status: string;
};

/** Marketplace UserActivity already tied to a retailer. A view is not purchase intent. */
export type EngineMarketplaceActivity = {
  buyerId: string;
  productId: string;
  variant: string | null;
  activityType: 'viewed' | 'favorite' | 'cart' | 'cart_added' | 'cart_abandoned';
  at: string;
};

export type MarketplaceEngagement = {
  viewed: boolean;
  favorited: boolean;
  inCart: boolean;
  addedToCart: boolean;
  removedFromCart: boolean;
};

export type SignalResult = {
  available: boolean;
  score: number | null;
  weight: number;
  reason: string | null;
};

export type OpportunityDraft = {
  buyerId: string;
  variantOptionId: number;
  productId: string;
  opportunityType: 'new_assortment' | 'reactivation';
  matchScore: number;
  priorityScore: number;
  confidence: number;
  penetration: number;
  skuLabel: string;
  variantName: string;
  productName: string;
  brand: string;
  categorySlug: string | null;
  retailerName: string;
  segment: string;
  reasons: string[];
  recommendedAction: 'introduce' | 'reorder';
  lastPurchasedAt: string | null;
  reorderIntervalDays: number | null;
  intervalSource: 'retailer' | 'category' | 'sku' | 'default';
  breakdown: {
    signals: Record<MatchWeightKey, SignalResult>;
    priority: {
      label: PriorityLabel;
      matchSuitability: number | null;
      commercialValue: number | null;
      actionability: number | null;
      freshness: number | null;
      observedLineValue: number | null;
    };
    penetration: { purchased: number; eligible: number };
    marketplace: MarketplaceEngagement;
    support: boolean;
    intervalSource: 'retailer' | 'category' | 'sku' | 'default';
  };
};

const NON_PURCHASE = new Set<string>(NON_PURCHASE_ORDER_STATUSES);

export function isPurchaseStatus(status: string): boolean {
  return !NON_PURCHASE.has(status.trim().toLowerCase());
}

export function isEligibleRetailerStatus(status: string): boolean {
  return (ELIGIBLE_RETAILER_STATUSES as readonly string[]).includes(status.trim().toLowerCase());
}

export function isEligibleSku(sku: EngineSku): boolean {
  return (
    sku.isActive &&
    sku.productStatus.trim().toLowerCase() === 'published' &&
    Number.isFinite(sku.stockQuantity) &&
    sku.stockQuantity > 0 &&
    Number.isFinite(sku.sellingPrice) &&
    sku.sellingPrice > 0
  );
}

/** A purchase counts for a SKU only when the line identifies that variant, never the parent product. */
export function resolvePurchasedSkuId(
  line: Pick<EnginePurchase, 'variantOptionId' | 'productId' | 'skuSnapshot'> & { variantName?: string | null },
  knownSkuIds: Set<number>,
  skuByProductCode: Map<string, number>,
  skuByProductName: Map<string, number> = new Map(),
): number | null {
  if (line.variantOptionId != null && knownSkuIds.has(line.variantOptionId)) {
    return line.variantOptionId;
  }
  const name = line.variantName?.trim().toLowerCase();
  if (line.productId && name) {
    const byName = skuByProductName.get(`${line.productId}::${name}`);
    if (byName != null) return byName;
  }
  if (line.variantOptionId != null) return null;
  const code = line.skuSnapshot?.trim().toLowerCase();
  if (!line.productId || !code) return null;
  return skuByProductCode.get(`${line.productId}::${code}`) ?? null;
}

export function assertOpportunityTenant(recordDistributorId: number, requestDistributorId: number): void {
  if (!Number.isInteger(requestDistributorId) || requestDistributorId <= 0) {
    throw new Error('Distributor is required');
  }
  if (recordDistributorId !== requestDistributorId) {
    throw new Error('Opportunity is outside this distributor');
  }
}

function daysBetween(earlierIso: string, later: Date): number {
  const earlier = new Date(earlierIso).getTime();
  if (!Number.isFinite(earlier)) return 0;
  return Math.max(0, Math.floor((later.getTime() - earlier) / 86_400_000));
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) return (sorted[mid - 1] + sorted[mid]) / 2;
  return sorted[mid];
}

function gaps(dates: string[]): number[] {
  const sorted = [...dates].sort();
  const result: number[] = [];
  for (let i = 1; i < sorted.length; i += 1) {
    result.push(daysBetween(sorted[i - 1], new Date(sorted[i])));
  }
  return result.filter((gap) => gap > 0);
}

function offerPrice(catalogPrice: number, offer: EngineOffer | undefined): number {
  if (!offer || offer.status.trim().toLowerCase() !== 'active') return catalogPrice;
  if (offer.discountType === 'percentage') {
    return Math.max(0, catalogPrice * (1 - offer.discountValue / 100));
  }
  if (offer.discountType === 'fixed_amount') {
    return Math.max(0, catalogPrice - offer.discountValue);
  }
  return catalogPrice;
}

function combine(signals: SignalResult[]): { score: number; confidenceCoverage: number; available: number } {
  const used = signals.filter((signal) => signal.available && signal.score != null && signal.weight > 0);
  const usedWeight = used.reduce((sum, signal) => sum + signal.weight, 0);
  const totalWeight = signals.reduce((sum, signal) => sum + Math.max(0, signal.weight), 0);
  if (usedWeight <= 0 || totalWeight <= 0) {
    return { score: 0, confidenceCoverage: 0, available: used.length };
  }
  const score = used.reduce((sum, signal) => sum + (signal.score ?? 0) * signal.weight, 0) / usedWeight;
  return { score: clampScore(score), confidenceCoverage: usedWeight / totalWeight, available: used.length };
}

const TRAIT_REASONS: Record<string, string> = {
  size: 'shares_size',
  ukuran: 'shares_size',
  flavour: 'shares_flavour',
  flavor: 'shares_flavour',
  rasa: 'shares_flavour',
  packaging: 'shares_packaging',
  kemasan: 'shares_packaging',
  pack: 'shares_packaging',
};

function attributePairs(value: Record<string, unknown> | null | undefined): Array<[string, string]> {
  if (!value) return [];
  const pairs: Array<[string, string]> = [];
  for (const [key, raw] of Object.entries(value)) {
    if (typeof raw !== 'string' || !raw.trim()) continue;
    const reason = TRAIT_REASONS[key.trim().toLowerCase()];
    if (reason) pairs.push([reason, raw.trim().toLowerCase()]);
  }
  return pairs;
}

/** Same product family, different SKU, shared flavour, size, or packaging. */
export function sharedMerchandisingReason(
  sku: EngineSku,
  other: EngineSku | undefined,
): string | null {
  if (!other || other.variantOptionId === sku.variantOptionId || other.productId !== sku.productId) return null;
  const mine = attributePairs(sku.attributes);
  if (mine.length === 0) return null;
  const theirs = new Map(attributePairs(other.attributes));
  for (const [reason, value] of mine) {
    if (theirs.get(reason) === value) return reason;
  }
  return null;
}

function categoryKey(sku: EngineSku | undefined): string {
  return (sku?.categorySlug || sku?.productType || '').trim().toLowerCase();
}

function sizeOf(sku: EngineSku | undefined): string | null {
  if (!sku?.attributes) return null;
  const raw = sku.attributes.size ?? sku.attributes.ukuran ?? sku.attributes.pack;
  return typeof raw === 'string' && raw.trim() ? raw.trim().toLowerCase() : null;
}

function inEvidenceWindow(iso: string, now: Date): boolean {
  return daysBetween(iso, now) <= EVIDENCE_WINDOW_DAYS;
}

/** Exclusive lower bound matching inEvidenceWindow. Lines at this instant are one day outside the window. */
export function evidenceWindowStart(now: Date): Date {
  return new Date(now.getTime() - (EVIDENCE_WINDOW_DAYS + 1) * 86_400_000);
}

type PurchaseLine = EnginePurchase & { skuId: number | null };

type CategoryPurchaseFacts = {
  lines: PurchaseLine[];
  orderIds: Set<string>;
  recentOrderIds: Set<string>;
  dates: string[];
  cadence: number | null;
  prices: number[];
};

const EMPTY_CATEGORY_FACTS: CategoryPurchaseFacts = {
  lines: [],
  orderIds: new Set(),
  recentOrderIds: new Set(),
  dates: [],
  cadence: null,
  prices: [],
};

/** One pass over a retailer's purchases. Blank categories stay unmatched, as in the per-SKU filter. */
function categoryFactsByKey(
  lines: PurchaseLine[],
  skuById: Map<number, EngineSku>,
  now: Date,
): Map<string, CategoryPurchaseFacts> {
  const grouped = new Map<string, PurchaseLine[]>();
  for (const line of lines) {
    const bought = line.skuId != null ? skuById.get(line.skuId) : undefined;
    const key = categoryKey(bought);
    if (!key) continue;
    const bucket = grouped.get(key);
    if (bucket) bucket.push(line);
    else grouped.set(key, [line]);
  }
  const facts = new Map<string, CategoryPurchaseFacts>();
  for (const [key, categoryLines] of grouped) {
    const dates = [...new Set(categoryLines.map((line) => line.at))].sort();
    facts.set(key, {
      lines: categoryLines,
      orderIds: new Set(categoryLines.map((line) => line.orderId)),
      recentOrderIds: new Set(
        categoryLines.filter((line) => inEvidenceWindow(line.at, now)).map((line) => line.orderId),
      ),
      dates,
      cadence: median(gaps(dates)),
      prices: categoryLines
        .map((line) => line.unitPrice)
        .filter((price): price is number => price != null && price > 0),
    });
  }
  return facts;
}

const EMPTY_MARKETPLACE: MarketplaceEngagement = {
  viewed: false,
  favorited: false,
  inCart: false,
  addedToCart: false,
  removedFromCart: false,
};

/** MarketplaceUser.id is a 32-bit integer. Larger LKB buyer ids are not marketplace users. */
export function linkableMarketplaceUserId(id: number | null): number | null {
  if (id == null || !Number.isInteger(id) || id <= 0 || id > 2147483647) return null;
  return id;
}

/** An unnamed or "Default" cart line only belongs to a product that has one SKU. */
export function marketplaceActivityMatchesSku(
  activity: { productId: string; variant: string | null },
  sku: Pick<EngineSku, 'productId' | 'variantOptionId' | 'sku' | 'variantName'>,
  productSkuCount: number,
): boolean {
  if (activity.productId !== sku.productId) return false;
  const variant = (activity.variant ?? '').trim().toLowerCase();
  if (!variant || variant === 'default') return productSkuCount <= 1;
  const names = [sku.variantName, sku.sku ?? '', String(sku.variantOptionId)]
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  return names.includes(variant);
}

function actionabilityFromMarketplace(engagement: MarketplaceEngagement): number | null {
  if (engagement.inCart) return 100;
  if (engagement.favorited) return 60;
  if (engagement.viewed) return 30;
  return null;
}

function marketplaceByPair(
  activities: EngineMarketplaceActivity[],
  skus: EngineSku[],
): Map<string, MarketplaceEngagement> {
  const skusByProduct = new Map<string, EngineSku[]>();
  for (const sku of skus) {
    const list = skusByProduct.get(sku.productId) ?? [];
    list.push(sku);
    skusByProduct.set(sku.productId, list);
  }
  const pairs = new Map<string, MarketplaceEngagement>();
  for (const activity of activities) {
    const candidates = skusByProduct.get(activity.productId) ?? [];
    for (const sku of candidates) {
      if (!marketplaceActivityMatchesSku(activity, sku, candidates.length)) continue;
      const key = `${activity.buyerId}:${sku.variantOptionId}`;
      const current = pairs.get(key) ?? { ...EMPTY_MARKETPLACE };
      if (activity.activityType === 'cart') current.inCart = true;
      else if (activity.activityType === 'viewed') current.viewed = true;
      else if (activity.activityType === 'favorite') current.favorited = true;
      else if (activity.activityType === 'cart_added') current.addedToCart = true;
      else if (activity.activityType === 'cart_abandoned') current.removedFromCart = true;
      pairs.set(key, current);
    }
  }
  return pairs;
}

export type PortfolioSlice = { purchased: number; regulars: number; gap: number; penetration: number };

function penetrationOf(purchased: number, regulars: number): number {
  if (regulars <= 0) return 0;
  return Math.round((purchased / regulars) * 1000) / 10;
}

/**
 * Category buyers are active retailers with at least one completed order in that
 * category during the evidence window. Penetration is buyers of this product or
 * SKU divided by those category buyers.
 */
export function measurePortfolio(input: {
  now: Date;
  retailers: EngineRetailer[];
  skus: EngineSku[];
  purchases: EnginePurchase[];
}): { activeRetailers: number; orderingRetailers: number; sku: Map<number, PortfolioSlice>; product: Map<string, PortfolioSlice> } {
  const active = new Set(
    input.retailers.filter((retailer) => isEligibleRetailerStatus(retailer.status)).map((retailer) => retailer.buyerId),
  );
  const knownSkuIds = new Set(input.skus.map((sku) => sku.variantOptionId));
  const skuByProductCode = new Map<string, number>();
  const skuByProductName = new Map<string, number>();
  const skuById = new Map(input.skus.map((sku) => [sku.variantOptionId, sku]));
  for (const sku of input.skus) {
    const code = sku.sku?.trim().toLowerCase();
    if (code) skuByProductCode.set(`${sku.productId}::${code}`, sku.variantOptionId);
    const name = sku.variantName?.trim().toLowerCase();
    if (name) skuByProductName.set(`${sku.productId}::${name}`, sku.variantOptionId);
  }
  const productCategory = new Map<string, string>();
  const productByName = new Map<string, string>();
  for (const sku of input.skus) {
    if (!productCategory.has(sku.productId)) productCategory.set(sku.productId, categoryKey(sku));
    const name = sku.productName.trim().toLowerCase();
    if (name && !productByName.has(name)) productByName.set(name, sku.productId);
  }
  const ordersByCategory = new Map<string, Map<string, Set<string>>>();
  const skuBuyers = new Map<number, Set<string>>();
  const productBuyers = new Map<string, Set<string>>();
  for (const line of input.purchases) {
    if (!active.has(line.buyerId) || !isPurchaseStatus(line.orderStatus)) continue;
    if (!inEvidenceWindow(line.at, input.now)) continue;
    const skuId = resolvePurchasedSkuId(line, knownSkuIds, skuByProductCode, skuByProductName);
    const resolved = skuId != null ? skuById.get(skuId) : null;
    let productId = resolved?.productId ?? null;
    if (!productId && line.productId && productCategory.has(line.productId)) productId = line.productId;
    if (!productId && line.productName) productId = productByName.get(line.productName.trim().toLowerCase()) ?? null;
    const category = productId ? productCategory.get(productId) || `product:${productId}` : '';
    if (category) {
      const byBuyer = ordersByCategory.get(category) ?? new Map<string, Set<string>>();
      const orders = byBuyer.get(line.buyerId) ?? new Set<string>();
      orders.add(line.orderId);
      byBuyer.set(line.buyerId, orders);
      ordersByCategory.set(category, byBuyer);
    }
    if (skuId != null) {
      const buyers = skuBuyers.get(skuId) ?? new Set<string>();
      buyers.add(line.buyerId);
      skuBuyers.set(skuId, buyers);
    }
    if (productId) {
      const buyers = productBuyers.get(productId) ?? new Set<string>();
      buyers.add(line.buyerId);
      productBuyers.set(productId, buyers);
    }
  }
  const regularsByCategory = new Map<string, Set<string>>();
  for (const [category, byBuyer] of ordersByCategory) {
    regularsByCategory.set(category, new Set(byBuyer.keys()));
  }
  const orderingRetailers = new Set<string>();
  for (const buyers of regularsByCategory.values()) {
    for (const buyerId of buyers) orderingRetailers.add(buyerId);
  }
  const sku = new Map<number, PortfolioSlice>();
  for (const item of input.skus) {
    const regularSet = regularsByCategory.get(categoryKey(item) || `product:${item.productId}`) ?? new Set<string>();
    const buyers = skuBuyers.get(item.variantOptionId) ?? new Set<string>();
    let purchased = 0;
    for (const buyerId of buyers) if (regularSet.has(buyerId)) purchased += 1;
    sku.set(item.variantOptionId, {
      purchased,
      regulars: regularSet.size,
      gap: regularSet.size - purchased,
      penetration: penetrationOf(purchased, regularSet.size),
    });
  }
  const product = new Map<string, PortfolioSlice>();
  const seenProducts = new Set<string>();
  for (const item of input.skus) {
    if (seenProducts.has(item.productId)) continue;
    seenProducts.add(item.productId);
    const regularSet = regularsByCategory.get(categoryKey(item) || `product:${item.productId}`) ?? new Set<string>();
    const bought = productBuyers.get(item.productId) ?? new Set<string>();
    let purchased = 0;
    for (const buyerId of bought) if (regularSet.has(buyerId)) purchased += 1;
    product.set(item.productId, {
      purchased,
      regulars: regularSet.size,
      gap: regularSet.size - purchased,
      penetration: penetrationOf(purchased, regularSet.size),
    });
  }
  return { activeRetailers: active.size, orderingRetailers: orderingRetailers.size, sku, product };
}

function priorityLabelForMatch(args: {
  opportunityType: OpportunityDraft['opportunityType'];
  available: number;
  hasBrand: boolean;
  hasCompeting: boolean;
  hasCategory: boolean;
}): PriorityLabel {
  if (args.opportunityType === 'reactivation' && args.hasCategory) return 'urgent';
  if (args.hasCategory && (args.hasBrand || args.hasCompeting) && args.available >= 3) return 'high';
  if (args.available >= 2) return 'medium';
  return 'low';
}

export function evaluateAssortmentOpportunities(input: {
  now: Date;
  settings?: Partial<AssortmentSettings>;
  retailers: EngineRetailer[];
  skus: EngineSku[];
  purchases: EnginePurchase[];
  offers?: EngineOffer[];
  marketplace?: EngineMarketplaceActivity[];
}): OpportunityDraft[] {
  const settings: AssortmentSettings = {
    ...DEFAULT_ASSORTMENT_SETTINGS,
    ...input.settings,
    matchWeights: { ...DEFAULT_ASSORTMENT_SETTINGS.matchWeights, ...input.settings?.matchWeights },
    priorityWeights: { ...DEFAULT_ASSORTMENT_SETTINGS.priorityWeights, ...input.settings?.priorityWeights },
  };
  const weights = settings.matchWeights;
  const retailers = input.retailers.filter(
    (retailer) => retailer.buyerId.trim() && isEligibleRetailerStatus(retailer.status),
  );
  const eligibleRetailerIds = new Set(retailers.map((retailer) => retailer.buyerId));
  const knownSkuIds = new Set(input.skus.map((sku) => sku.variantOptionId));
  const skuByProductCode = new Map<string, number>();
  const skuByProductName = new Map<string, number>();
  for (const sku of input.skus) {
    const code = sku.sku?.trim().toLowerCase();
    if (code) skuByProductCode.set(`${sku.productId}::${code}`, sku.variantOptionId);
    const name = sku.variantName?.trim().toLowerCase();
    if (name) skuByProductName.set(`${sku.productId}::${name}`, sku.variantOptionId);
  }
  const skuById = new Map(input.skus.map((sku) => [sku.variantOptionId, sku]));

  const purchasesByRetailerSku = new Map<string, Map<number, string[]>>();
  const quantityBySku = new Map<number, number[]>();
  const retailerLines = new Map<string, Array<EnginePurchase & { skuId: number | null }>>();

  for (const line of input.purchases) {
    if (!eligibleRetailerIds.has(line.buyerId) || !isPurchaseStatus(line.orderStatus)) continue;
    const skuId = resolvePurchasedSkuId(line, knownSkuIds, skuByProductCode, skuByProductName);
    const bucket = retailerLines.get(line.buyerId) ?? [];
    bucket.push({ ...line, skuId });
    retailerLines.set(line.buyerId, bucket);
    if (skuId == null) continue;
    const bySku = purchasesByRetailerSku.get(line.buyerId) ?? new Map<number, string[]>();
    const dates = bySku.get(skuId) ?? [];
    dates.push(line.at);
    bySku.set(skuId, dates);
    purchasesByRetailerSku.set(line.buyerId, bySku);
    if (line.quantity != null && line.quantity > 0) {
      const quantities = quantityBySku.get(skuId) ?? [];
      quantities.push(line.quantity);
      quantityBySku.set(skuId, quantities);
    }
  }

  const buyersOfSku = new Map<number, Set<string>>();
  for (const [buyerId, bySku] of purchasesByRetailerSku) {
    for (const skuId of bySku.keys()) {
      const buyers = buyersOfSku.get(skuId) ?? new Set<string>();
      buyers.add(buyerId);
      buyersOfSku.set(skuId, buyers);
    }
  }

  const skuGapMedian = new Map<number, number | null>();
  for (const [skuId, buyers] of buyersOfSku) {
    const allGaps: number[] = [];
    for (const buyerId of buyers) {
      allGaps.push(...gaps(purchasesByRetailerSku.get(buyerId)?.get(skuId) ?? []));
    }
    skuGapMedian.set(skuId, allGaps.length >= 1 ? median(allGaps) : null);
  }

  const offerByPair = new Map<string, EngineOffer>();
  for (const offer of input.offers ?? []) {
    if (!offer.buyerId || offer.variantOptionId == null) continue;
    if (offer.status.trim().toLowerCase() !== 'active') continue;
    offerByPair.set(`${offer.buyerId}:${offer.variantOptionId}`, offer);
  }

  const marketplacePairs = marketplaceByPair(input.marketplace ?? [], input.skus);
  const portfolio = measurePortfolio({
    now: input.now,
    retailers: input.retailers,
    skus: input.skus,
    purchases: input.purchases,
  });
  const drafts: OpportunityDraft[] = [];

  for (const retailer of retailers) {
    const lines = retailerLines.get(retailer.buyerId) ?? [];
    const categoryByKey = categoryFactsByKey(lines, skuById, input.now);

    for (const sku of input.skus) {
      if (!isEligibleSku(sku)) continue;
      const dates = purchasesByRetailerSku.get(retailer.buyerId)?.get(sku.variantOptionId) ?? [];
      const sortedDates = [...dates].sort();
      const lastPurchasedAt = sortedDates.length > 0 ? sortedDates[sortedDates.length - 1] : null;
      const retailerGaps = gaps(sortedDates);
      const retailerInterval = retailerGaps.length >= 1 ? median(retailerGaps) : null;
      const skuInterval = skuGapMedian.get(sku.variantOptionId) ?? null;
      const daysSince = lastPurchasedAt ? daysBetween(lastPurchasedAt, input.now) : null;

      const key = categoryKey(sku);
      const brandKey = sku.brand.trim().toLowerCase();
      const categoryFacts = key ? categoryByKey.get(key) ?? EMPTY_CATEGORY_FACTS : EMPTY_CATEGORY_FACTS;
      const categoryLines = categoryFacts.lines;
      const categoryOrderIds = categoryFacts.orderIds;
      const recentCategoryOrders = categoryFacts.recentOrderIds;
      const categoryDates = categoryFacts.dates;
      const categoryCadence = categoryFacts.cadence;

      let opportunityType: OpportunityDraft['opportunityType'] | null = null;
      let interval: number | null = null;
      let intervalSource: OpportunityDraft['intervalSource'] = 'default';
      if (!lastPurchasedAt) {
        opportunityType = 'new_assortment';
      } else if (daysSince != null) {
        const cycle = retailerInterval ?? categoryCadence ?? skuInterval;
        if (cycle == null || daysSince <= cycle) continue;
        opportunityType = 'reactivation';
        interval = Math.max(1, Math.round(cycle));
        intervalSource = retailerInterval ? 'retailer' : categoryCadence ? 'category' : 'sku';
      }
      if (!opportunityType) continue;

      const category: SignalResult = {
        available: categoryOrderIds.size >= 2,
        score: null,
        weight: weights.categoryAffinity,
        reason: null,
      };
      if (category.available) {
        const recentCount = recentCategoryOrders.size;
        category.score = recentCount >= 4 ? 100 : recentCount === 3 ? 85 : recentCount === 2 ? 70 : categoryOrderIds.size >= 4 ? 60 : 50;
        category.reason = 'repeated_category';
      }

      const hasBrand = categoryLines.some((line) => {
        const bought = line.skuId != null ? skuById.get(line.skuId) : null;
        return Boolean(bought) && bought!.brand.trim().toLowerCase() === brandKey && line.skuId !== sku.variantOptionId;
      });

      const targetSize = sizeOf(sku);
      const competing = new Set<number>();
      for (const line of categoryLines) {
        if (line.skuId == null || line.skuId === sku.variantOptionId) continue;
        const bought = skuById.get(line.skuId);
        if (!bought || bought.brand.trim().toLowerCase() === brandKey) continue;
        const otherSize = sizeOf(bought);
        if (targetSize && otherSize !== targetSize) continue;
        competing.add(line.skuId);
      }
      const coPurchase: SignalResult = {
        available: competing.size > 0,
        score: competing.size >= 3 ? 100 : competing.size === 2 ? 85 : competing.size === 1 ? 70 : null,
        weight: weights.coPurchase,
        reason: competing.size > 0 ? 'competing_products' : null,
      };

      const segment: SignalResult = {
        available: Boolean(retailer.segment.trim()) && categoryLines.length > 0,
        score: retailer.segment.trim() && categoryLines.length > 0 ? (categoryOrderIds.size >= 2 ? 80 : 60) : null,
        weight: weights.segmentFit,
        reason: retailer.segment.trim() && categoryLines.length > 0 ? 'segment_buys_category' : null,
      };

      const lastCategoryAt = categoryDates.length > 0 ? categoryDates[categoryDates.length - 1] : null;
      const activity: SignalResult = {
        available: categoryOrderIds.size > 0,
        score: null,
        weight: weights.purchasingActivity,
        reason: null,
      };
      if (activity.available && lastCategoryAt) {
        const age = daysBetween(lastCategoryAt, input.now);
        if (categoryCadence && age <= categoryCadence * 1.5 && categoryCadence <= 21) activity.score = 100;
        else if (categoryCadence && age <= categoryCadence * 1.5 && categoryCadence <= 35) activity.score = 80;
        else if (categoryCadence && age <= categoryCadence * 1.5) activity.score = 60;
        else if (recentCategoryOrders.size >= 2) activity.score = 70;
        else activity.score = 45;
        activity.reason = 'regular_category_orders';
      }

      const paid = categoryFacts.prices;
      const priceToPay = offerPrice(sku.sellingPrice, offerByPair.get(`${retailer.buyerId}:${sku.variantOptionId}`));
      const price: SignalResult = {
        available: paid.length > 0,
        score: null,
        weight: weights.priceSuitability,
        reason: null,
      };
      if (price.available) {
        const low = Math.min(...paid);
        const high = Math.max(...paid);
        const inside = priceToPay >= low && priceToPay <= high;
        price.score = inside ? 100 : 30;
        price.reason = inside ? 'price_within_range' : 'price_outside_range';
      }

      const signals = {
        categoryAffinity: category,
        coPurchase,
        segmentFit: segment,
        purchasingActivity: activity,
        priceSuitability: price,
      };
      const combined = combine(Object.values(signals));
      if (combined.available < settings.minEvidenceSignals) continue;
      if (combined.confidenceCoverage < settings.minConfidence || combined.score < settings.minMatchScore) continue;

      const marketplace = marketplacePairs.get(`${retailer.buyerId}:${sku.variantOptionId}`) ?? EMPTY_MARKETPLACE;
      const slice = portfolio.sku.get(sku.variantOptionId);
      const purchased = slice?.purchased ?? 0;
      const eligibleCount = slice?.regulars ?? 0;
      const label = priorityLabelForMatch({
        opportunityType,
        available: combined.available,
        hasBrand,
        hasCompeting: competing.size > 0,
        hasCategory: category.available,
      });
      const trait = (key ? categoryLines : lines).reduce<string | null>((found, line) => {
        if (found || line.skuId == null) return found;
        return sharedMerchandisingReason(sku, skuById.get(line.skuId));
      }, null);
      const reasons = [
        opportunityType === 'reactivation' ? 'overdue_reorder' : 'never_purchased',
        ...(hasBrand ? ['buys_same_brand'] : []),
        ...Object.values(signals)
          .filter((signal) => signal.reason)
          .map((signal) => signal.reason as string),
        ...(trait ? [trait] : []),
      ];

      drafts.push({
        buyerId: retailer.buyerId,
        variantOptionId: sku.variantOptionId,
        productId: sku.productId,
        opportunityType,
        matchScore: combined.score,
        priorityScore: PRIORITY_RANK[label],
        confidence: Math.round(combined.confidenceCoverage * 1000) / 1000,
        penetration: slice?.penetration ?? 0,
        skuLabel: sku.sku?.trim() || sku.variantName,
        variantName: sku.variantName,
        productName: sku.productName,
        brand: sku.brand,
        categorySlug: sku.categorySlug,
        retailerName: retailer.storeName,
        segment: retailer.segment.trim() || 'Other',
        reasons: [...new Set(reasons)],
        recommendedAction: opportunityType === 'reactivation' ? 'reorder' : 'introduce',
        lastPurchasedAt,
        reorderIntervalDays: interval,
        intervalSource,
        breakdown: {
          signals,
          priority: {
            label,
            matchSuitability: combined.score,
            commercialValue: null,
            actionability: actionabilityFromMarketplace(marketplace),
            freshness: null,
            observedLineValue: null,
          },
          penetration: { purchased, eligible: eligibleCount },
          marketplace,
          support: true,
          intervalSource,
        },
      });
    }
  }

  const seen = new Set<string>();
  return drafts
    .sort((a, b) => b.priorityScore - a.priorityScore || b.matchScore - a.matchScore)
    .filter((draft) => {
      const key = `${draft.buyerId}:${draft.variantOptionId}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}
