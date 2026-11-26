import type { Prisma } from '@/lib/db';
import { prisma } from '@/lib/db';
import { buildMobileBuyerId } from '@/utils/buyerSync';
import { parsePrice, safeParsePrice } from '@/utils/currencyUtils';
import { segmentPriceKey } from '@/utils/priceAnchorUtils';

export type MarketplaceSegmentPriceRow = {
  segmentKey: string;
  sellingPrice: unknown;
};

export const marketplaceVariantOptionsSegmentInclude = {
  where: { isActive: true },
  include: {
    segmentPriceRows: { select: { segmentKey: true, sellingPrice: true } },
  },
} satisfies Prisma.ProductInclude['variantOptions'];

export const orderFlowVariantOptionsInclude = {
  include: {
    segmentPriceRows: { select: { segmentKey: true, sellingPrice: true } },
  },
} satisfies NonNullable<Prisma.ProductInclude['variantOptions']>;

/** Default variant option unit price with optional segment override (per-Piece). */
export function resolveMarketplaceSellingPrice(
  defaultPrice: number,
  segmentRows: MarketplaceSegmentPriceRow[] | null | undefined,
  businessType: string | null | undefined,
): number {
  const key = segmentPriceKey(businessType);
  if (!key || !segmentRows?.length) {
    return defaultPrice;
  }
  const row = segmentRows.find((r) => segmentPriceKey(r.segmentKey) === key);
  if (!row) {
    return defaultPrice;
  }
  const segmentPrice = parsePrice(row.sellingPrice as Parameters<typeof parsePrice>[0]);
  if (!Number.isFinite(segmentPrice) || segmentPrice < 0) {
    return defaultPrice;
  }
  return segmentPrice;
}

type VariantOptionWithSegments = {
  sellingPrice?: unknown;
  segmentPriceRows?: MarketplaceSegmentPriceRow[] | null;
};

export function resolveVariantOptionMarketplaceUnitPrice(
  variantOption: VariantOptionWithSegments,
  businessType: string | null | undefined,
): number {
  const base = parsePrice(
    variantOption.sellingPrice as Parameters<typeof parsePrice>[0],
  );
  return resolveMarketplaceSellingPrice(base, variantOption.segmentPriceRows, businessType);
}

export async function loadDistributorBusinessTypesMap(
  marketplaceUserId: number,
  distributorUserIds: number[],
  db: typeof prisma = prisma,
): Promise<Map<number, string>> {
  const unique = Array.from(new Set(distributorUserIds.filter((id) => Number.isInteger(id) && id > 0)));
  const map = new Map<number, string>();
  if (!Number.isInteger(marketplaceUserId) || marketplaceUserId < 1 || unique.length === 0) {
    return map;
  }
  const buyerIds = unique.map((d) => buildMobileBuyerId(marketplaceUserId, d));
  const buyers = await db.buyer.findMany({
    where: { buyerId: { in: buyerIds } },
    select: { buyerId: true, businessType: true },
  });
  const byBuyerId = new Map(buyers.map((b) => [b.buyerId, b.businessType]));
  for (const distributorId of unique) {
    const businessType = byBuyerId.get(buildMobileBuyerId(marketplaceUserId, distributorId));
    if (businessType?.trim()) {
      map.set(distributorId, businessType);
    }
  }
  return map;
}

export async function loadBuyerBusinessTypeByBuyerId(
  buyerId: string | null | undefined,
  db: typeof prisma = prisma,
): Promise<string | null> {
  if (!buyerId?.trim()) return null;
  const buyer = await db.buyer.findUnique({
    where: { buyerId: buyerId.trim() },
    select: { businessType: true },
  });
  const bt = buyer?.businessType?.trim();
  return bt || null;
}

type ProductSnapshot = Record<string, unknown>;

/** Re-apply segment prices on stored cart/activity product JSON from live catalog rows. */
export async function applySegmentPricesToMarketplaceProductSnapshot(
  productData: ProductSnapshot,
  productId: string,
  marketplaceUserId: number,
  distributorUserId: number,
  db: typeof prisma = prisma,
): Promise<ProductSnapshot> {
  const product = await db.product.findFirst({
    where: {
      productId,
      userId: distributorUserId,
      status: 'Published',
      marketplaceStatus: 'Published',
    },
    include: {
      variantOptions: orderFlowVariantOptionsInclude,
    },
  });
  if (!product?.variantOptions?.length) {
    return productData;
  }

  const businessTypeMap = await loadDistributorBusinessTypesMap(marketplaceUserId, [distributorUserId], db);
  const businessType = businessTypeMap.get(distributorUserId) ?? null;

  const priceByVariantId = new Map<number, number>();
  for (const vo of product.variantOptions) {
    priceByVariantId.set(vo.id, resolveVariantOptionMarketplaceUnitPrice(vo, businessType));
  }

  const next: ProductSnapshot = { ...productData };

  const formatted = Array.isArray(productData.variantOptionsFormatted)
    ? (productData.variantOptionsFormatted as Array<Record<string, unknown>>)
    : null;
  if (formatted) {
    next.variantOptionsFormatted = formatted.map((row) => {
      const id = Number(row.id);
      if (!Number.isInteger(id) || !priceByVariantId.has(id)) return row;
      return { ...row, sellingPrice: priceByVariantId.get(id) };
    });
  }

  const defaultVo = product.variantOptions.find((v) => v.isDefault) ?? product.variantOptions[0];
  const headline = defaultVo ? priceByVariantId.get(defaultVo.id) : undefined;
  if (headline != null && Number.isFinite(headline)) {
    next.sellingPrice = headline;
    next.price = headline;
  }

  const prices = [...priceByVariantId.values()];
  if (prices.length > 0) {
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    if (min === max) {
      next.sellingPrice = min;
      next.price = min;
    }
  }

  if (Array.isArray(productData.variantOptions)) {
    next.variantOptions = (productData.variantOptions as Array<Record<string, unknown>>).map((row) => {
      const id = Number(row.id);
      if (!Number.isInteger(id) || !priceByVariantId.has(id)) return row;
      const patched: Record<string, unknown> = { ...row, sellingPrice: priceByVariantId.get(id) };
      delete patched.segmentPrices;
      delete patched.segmentPriceRows;
      return patched;
    });
  }

  return next;
}

/** Format resolved per-piece price for public variant option payloads. */
export function formatResolvedVariantSellingPrice(value: number): number {
  return safeParsePrice(value);
}

type DbClient = Prisma.TransactionClient | typeof prisma;

/**
 * After CRM buyers are removed: drop VariantSegmentPrice rows for any segment
 * that no longer has a remaining buyer. Marketplace pricing then falls back to
 * the variant default selling price immediately.
 */
export async function clearOrphanVariantSegmentPrices(opts: {
  distributorUserId: number;
  removedBusinessTypes: Array<string | null | undefined>;
  db?: DbClient;
}): Promise<void> {
  const db = opts.db ?? prisma;
  const candidateKeys = [
    ...new Set(
      opts.removedBusinessTypes
        .map((type) => segmentPriceKey(type))
        .filter((key) => key.length > 0),
    ),
  ];
  if (candidateKeys.length === 0) return;

  const remainingBuyers = await db.buyer.findMany({
    where: { userId: opts.distributorUserId },
    select: { businessType: true },
  });
  const remainingKeys = new Set(
    remainingBuyers
      .map((buyer) => segmentPriceKey(buyer.businessType))
      .filter((key) => key.length > 0),
  );
  const orphanKeys = candidateKeys.filter((key) => !remainingKeys.has(key));
  if (orphanKeys.length === 0) return;

  await db.variantSegmentPrice.deleteMany({
    where: {
      segmentKey: { in: orphanKeys },
      variantOption: {
        product: { userId: opts.distributorUserId },
      },
    },
  });
}