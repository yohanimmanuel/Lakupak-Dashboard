import type { Prisma, PrismaClient } from '@/lib/db';
import { getStartOfDay, getEndOfDay } from '@/lib/dateUtils';
import { prisma as defaultPrisma } from '@/app/api/graphql/modules/common/prisma';

type DbClient = PrismaClient | Prisma.TransactionClient;

export type OfferDiscountType =
  | 'percentage'
  | 'fixed_amount'
  | 'buy_x_get_y';

export type ResolvedOffer = {
  id: string;
  offerId: string;
  buyerId: string | null;
  productId: string | null;
  categoryId: string | null;
  variantOptionId: number | null;
  discountType: OfferDiscountType;
  discountValue: number;
  buyQuantity: number | null;
  freeQuantity: number | null;
  startDate: Date;
  endDate: Date | null;
  status: string;
  notes: string | null;
  description: string | null;
};

export type AppliedOfferPrice = {
  /** Unit price after applying the offer (may equal base for BXGY-only). */
  unitPrice: number;
  discountAmount: number;
  discountPercentage: number | null;
  /** For buy_x_get_y / combo: promotion metadata. */
  promotionDetails: {
    type: 'buy_x_get_y';
    buyQuantity: number;
    discountValue: number;
    freeQuantity: number;
  } | null;
};

function toNumber(value: unknown): number {
  if (value == null) return 0;
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value === 'object' && value !== null && typeof (value as { toNumber?: () => number }).toNumber === 'function') {
    const n = (value as { toNumber: () => number }).toNumber();
    return Number.isFinite(n) ? n : 0;
  }
  const n = Number.parseFloat(String(value));
  return Number.isFinite(n) ? n : 0;
}

function mapOffer(row: {
  id: string;
  offerId: string;
  buyerId: string | null;
  productId: string | null;
  categoryId: string | null;
  variantOptionId?: number | null;
  discountType: string;
  discountValue: unknown;
  buyQuantity: number | null;
  freeQuantity?: number | null;
  startDate: Date;
  endDate: Date | null;
  status: string;
  notes: string | null;
  description: string | null;
}): ResolvedOffer {
  return {
    id: row.id,
    offerId: row.offerId,
    buyerId: row.buyerId,
    productId: row.productId,
    categoryId: row.categoryId,
    variantOptionId: row.variantOptionId ?? null,
    discountType: row.discountType as OfferDiscountType,
    discountValue: toNumber(row.discountValue),
    buyQuantity: row.buyQuantity,
    freeQuantity: row.freeQuantity ?? null,
    startDate: row.startDate,
    endDate: row.endDate,
    status: row.status,
    notes: row.notes,
    description: row.description,
  };
}

/**
 * Resolve the ACTIVE per-client offer for a buyer + product.
 * Resolution order:
 * 1) variant-specific offer (when variantOptionId provided)
 * 2) whole-product offer (productId set, variantOptionId null)
 * 3) category offer
 * Never returns another client's offer.
 */
export async function getOfferForClientAndProduct(
  clientId: string,
  productId: string,
  opts?: {
    userId?: number;
    at?: Date;
    db?: DbClient;
    variantOptionId?: number | null;
  },
): Promise<ResolvedOffer | null> {
  const buyerId = String(clientId || '').trim();
  const pid = String(productId || '').trim();
  if (!buyerId || !pid) return null;

  const db = opts?.db ?? defaultPrisma;
  const at = opts?.at ?? new Date();
  const atStart = getStartOfDay(at);
  const atEnd = getEndOfDay(at);
  const variantOptionId =
    opts?.variantOptionId != null && Number.isFinite(Number(opts.variantOptionId))
      ? Number(opts.variantOptionId)
      : null;

  const product = await db.product.findFirst({
    where: {
      productId: pid,
      ...(opts?.userId != null ? { userId: opts.userId } : {}),
    },
    select: {
      productId: true,
      merchandisingCategorySlug: true,
      userId: true,
    },
  });
  if (!product) return null;

  const dateWindow: Prisma.OfferWhereInput = {
    startDate: { lte: atEnd },
    OR: [{ endDate: null }, { endDate: { gte: atStart } }],
  };

  const baseWhere: Prisma.OfferWhereInput = {
    buyerId,
    status: 'active',
    ...dateWindow,
    ...(opts?.userId != null
      ? { userId: opts.userId }
      : product.userId != null
        ? { userId: product.userId }
        : {}),
  };

  // 1) Variant-specific offer
  if (variantOptionId != null) {
    const variantOffer = await db.offer.findFirst({
      where: {
        ...baseWhere,
        productId: pid,
        variantOptionId,
      },
      orderBy: { updatedAt: 'desc' },
    });
    if (variantOffer) return mapOffer(variantOffer);
  }

  // 2) Whole-product offer (all variants)
  const productOffer = await db.offer.findFirst({
    where: {
      ...baseWhere,
      productId: pid,
      variantOptionId: null,
    },
    orderBy: { updatedAt: 'desc' },
  });
  if (productOffer) return mapOffer(productOffer);

  // 3) Category offer
  const categorySlug = product.merchandisingCategorySlug?.trim();
  if (!categorySlug) return null;

  const categoryOffer = await db.offer.findFirst({
    where: {
      ...baseWhere,
      productId: null,
      categoryId: categorySlug,
      variantOptionId: null,
    },
    orderBy: { updatedAt: 'desc' },
  });

  return categoryOffer ? mapOffer(categoryOffer) : null;
}

function resolveFreeQuantity(
  offer: Pick<ResolvedOffer, 'discountType' | 'discountValue' | 'buyQuantity' | 'freeQuantity'>,
): number | null {
  if (offer.freeQuantity != null && offer.freeQuantity > 0) {
    return offer.freeQuantity;
  }
  // Legacy BXGY: free Y stored in discountValue
  if (offer.discountType === 'buy_x_get_y') {
    const fromValue = Math.round(offer.discountValue);
    return fromValue > 0 ? fromValue : null;
  }
  return null;
}

/**
 * Apply a resolved offer to a base unit price.
 * - Price discount (percentage / fixed_amount): adjusts unit price.
 * - BXGY (buy_x_get_y or combo buyQuantity+freeQuantity): attaches promotionDetails.
 * - Combination: both apply.
 */
export function applyOfferToPrice(
  basePrice: number,
  offer: Pick<
    ResolvedOffer,
    'discountType' | 'discountValue' | 'buyQuantity' | 'freeQuantity'
  >,
): AppliedOfferPrice {
  const base = Number.isFinite(basePrice) ? Math.max(0, basePrice) : 0;
  const value = Number.isFinite(offer.discountValue) ? offer.discountValue : 0;

  let unitPrice = base;
  let discountAmount = 0;
  let discountPercentage: number | null = null;

  if (offer.discountType === 'percentage') {
    const pct = Math.min(100, Math.max(0, value));
    discountAmount = (base * pct) / 100;
    unitPrice = Math.max(0, base - discountAmount);
    discountPercentage = pct;
  } else if (offer.discountType === 'fixed_amount') {
    discountAmount = Math.min(base, Math.max(0, value));
    unitPrice = Math.max(0, base - discountAmount);
    discountPercentage = base > 0 ? (discountAmount / base) * 100 : null;
  }

  const freeQty = resolveFreeQuantity(offer);
  const buyQty =
    offer.buyQuantity && offer.buyQuantity > 0
      ? offer.buyQuantity
      : offer.discountType === 'buy_x_get_y'
        ? 1
        : null;
  const hasBxgy =
    offer.discountType === 'buy_x_get_y' ||
    (buyQty != null && freeQty != null && freeQty > 0);

  const promotionDetails =
    hasBxgy && buyQty != null && freeQty != null
      ? {
          type: 'buy_x_get_y' as const,
          buyQuantity: buyQty,
          discountValue: freeQty,
          freeQuantity: freeQty,
        }
      : null;

  // Pure BXGY: unit price unchanged
  if (offer.discountType === 'buy_x_get_y') {
    return {
      unitPrice: base,
      discountAmount: 0,
      discountPercentage: null,
      promotionDetails,
    };
  }

  return {
    unitPrice,
    discountAmount,
    discountPercentage,
    promotionDetails,
  };
}
