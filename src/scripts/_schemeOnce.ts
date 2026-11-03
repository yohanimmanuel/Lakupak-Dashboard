import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(process.cwd(), '.env.local') });
config({ path: resolve(process.cwd(), '.env') });

async function main() {
const { prisma } = await import('../lib/db');
const { evaluateAssortmentOpportunities } = await import('../lib/assortmentOpportunities/engine');
const { getAssortmentSettings } = await import('../lib/assortmentOpportunities/service');
const { EVIDENCE_WINDOW_DAYS } = await import('../lib/assortmentOpportunities/config');
const { parseMarketplaceUserIdFromBuyerId } = await import('../utils/buyerSync');

const product = await prisma.product.findFirst({
  where: { name: { contains: 'Teh Botol', mode: 'insensitive' } },
  select: { userId: true, productId: true, name: true },
});
if (!product?.userId) {
  console.log(JSON.stringify({ error: 'Teh Botol product not found' }));
  process.exit(0);
}

const distributorId = product.userId;
const settings = await getAssortmentSettings(distributorId);
const [buyers, skus, purchaseRows, offers] = await Promise.all([
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
  prisma.$queryRaw<Array<{
    buyerId: string;
    orderId: string;
    orderStatus: string;
    at: Date;
    variantOptionId: number | null;
    productId: string | null;
    skuSnapshot: string | null;
    variantName: string | null;
    productName: string | null;
    unitPrice: unknown;
    quantity: number | null;
  }>>`
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
  `,
  prisma.offer.findMany({
    where: { userId: distributorId, status: 'active', variantOptionId: { not: null } },
    select: { buyerId: true, variantOptionId: true, discountType: true, discountValue: true, status: true, endDate: true },
  }),
]);

const engineSkus = skus.map((sku) => ({
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
  attributes: sku.attributes && typeof sku.attributes === 'object' && !Array.isArray(sku.attributes)
    ? sku.attributes as Record<string, unknown>
    : null,
}));
const target = engineSkus.find((sku) => sku.productId === product.productId && /350/.test(`${sku.variantName} ${sku.sku ?? ''}`))
  ?? engineSkus.find((sku) => sku.productId === product.productId);
if (!target) {
  console.log(JSON.stringify({ error: 'No variant' }));
  process.exit(0);
}

const now = new Date();
const since = new Date(now.getTime() - EVIDENCE_WINDOW_DAYS * 24 * 60 * 60 * 1000);
const buyerByMarket = new Map<number, string>();
for (const buyer of buyers) {
  const id = parseMarketplaceUserIdFromBuyerId(buyer.buyerId);
  if (id != null && id <= 2147483647) buyerByMarket.set(id, buyer.buyerId);
}
const productIds = [...new Set(engineSkus.map((sku) => sku.productId))];
const activityRows = buyerByMarket.size === 0 ? [] : await prisma.userActivity.findMany({
  where: {
    userId: { in: [...buyerByMarket.keys()] },
    productId: { in: productIds },
    OR: [
      { activityType: 'cart' },
      { activityType: { in: ['viewed', 'favorite', 'cart_added', 'cart_abandoned'] }, createdAt: { gte: since } },
    ],
  },
  select: { userId: true, productId: true, activityType: true, metadata: true, createdAt: true },
});
const marketplace = activityRows.flatMap((row) => {
  const buyerId = buyerByMarket.get(row.userId);
  if (!buyerId) return [];
  if (!['viewed', 'favorite', 'cart', 'cart_added', 'cart_abandoned'].includes(row.activityType)) return [];
  const metadata = row.metadata;
  const variant = metadata && typeof metadata === 'object' && !Array.isArray(metadata) && typeof (metadata as { variant?: unknown }).variant === 'string'
    ? String((metadata as { variant: string }).variant)
    : null;
  return [{ buyerId, productId: row.productId, variant, activityType: row.activityType as 'viewed' | 'favorite' | 'cart' | 'cart_added' | 'cart_abandoned', at: row.createdAt.toISOString() }];
});

const purchases = purchaseRows.map((row) => ({
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
const engineOffers = offers
  .filter((offer) => !offer.endDate || offer.endDate >= now)
  .map((offer) => ({
    buyerId: offer.buyerId,
    variantOptionId: offer.variantOptionId,
    discountType: offer.discountType,
    discountValue: Number(offer.discountValue),
    status: offer.status,
  }));

const drafts = evaluateAssortmentOpportunities({
  now,
  settings,
  retailers: buyers.map((buyer) => ({
    buyerId: buyer.buyerId,
    storeName: buyer.storeName,
    segment: buyer.businessType,
    region: buyer.region,
    phone: buyer.phone,
    status: buyer.status,
  })),
  skus: engineSkus,
  purchases,
  offers: engineOffers,
  marketplace,
});

const forSku = drafts.filter((row) => row.variantOptionId === target.variantOptionId);
const example = [...forSku].sort((a, b) => Number(b.breakdown.marketplace.inCart) - Number(a.breakdown.marketplace.inCart) || b.priorityScore - a.priorityScore || b.matchScore - a.matchScore)[0];
const used = example ? Object.values(example.breakdown.signals).filter((signal) => signal.available && signal.score != null) : [];
const usedWeight = used.reduce((sum, signal) => sum + signal.weight, 0);
const weighted = used.reduce((sum, signal) => sum + (signal.score ?? 0) * signal.weight, 0);

const targetActivity = marketplace.filter((row) => row.productId === target.productId && row.buyerId === example?.buyerId);
console.log(JSON.stringify({
  now: now.toISOString(),
  variant: {
    sku: target.sku,
    name: target.variantName,
    product: target.productName,
    brand: target.brand,
    price: target.sellingPrice,
    size: target.attributes?.size ?? target.attributes?.ukuran ?? null,
    category: target.categorySlug || target.productType,
  },
  settings: {
    minEvidenceSignals: settings.minEvidenceSignals,
    minConfidence: settings.minConfidence,
    minMatchScore: settings.minMatchScore,
    windowDays: EVIDENCE_WINDOW_DAYS,
  },
  skuSummary: {
    retailersMatched: forSku.length,
    newAssortment: forSku.filter((row) => row.opportunityType === 'new_assortment').length,
    reactivation: forSku.filter((row) => row.opportunityType === 'reactivation').length,
    withOpenCart: forSku.filter((row) => row.breakdown.marketplace.inCart).length,
    withView: forSku.filter((row) => row.breakdown.marketplace.viewed).length,
    withFavorite: forSku.filter((row) => row.breakdown.marketplace.favorited).length,
    penetration: example?.penetration ?? null,
    penetrationDetail: example?.breakdown.penetration ?? null,
    marketplaceRowsForDistributor: marketplace.length,
    linkedMarketplaceBuyers: buyerByMarket.size,
  },
  example: example ? {
    store: example.retailerName,
    segment: example.segment,
    type: example.opportunityType,
    lastPurchasedAt: example.lastPurchasedAt,
    reorderIntervalDays: example.reorderIntervalDays,
    intervalSource: example.intervalSource,
    signals: example.breakdown.signals,
    reasons: example.reasons,
    usedWeight,
    weightedSum: weighted,
    matchScore: example.matchScore,
    confidence: example.confidence,
    priority: example.breakdown.priority,
    marketplace: example.breakdown.marketplace,
    recommendedAction: example.recommendedAction,
    activityOnThisBuyer: targetActivity.map((row) => ({ type: row.activityType, variant: row.variant, productId: row.productId })),
  } : null,
}, null, 2));

await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'scheme failed');
  process.exit(1);
});
