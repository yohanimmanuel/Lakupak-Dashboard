/**
 * Offer Validation and Tracking Utilities
 * Per-retailer pricing: offers only apply when a buyerId (client) is known.
 */

import { prisma } from '@/lib/db';
import type { Prisma } from '@/lib/db';
import {
  getOfferForClientAndProduct,
  applyOfferToPrice,
} from '@/lib/offers/getOfferForClientAndProduct';
import { parsePrice } from '@/utils/currencyUtils';

export interface OfferValidationResult {
  isValid: boolean;
  error?: string;
  offerId?: string;
  offerName?: string;
  discountTypeId?: string;
  discountAmount?: number;
  discountPercentage?: number;
  offerBadge?: 'Discount' | 'Promotion' | 'All Offers' | 'Offer';
  originalPrice?: number;
  finalPrice?: number;
  promotionDetails?: {
    minQuantity?: number;
    freeQuantity?: number;
    description?: string;
    applyMode?: 'from_zero' | 'after_moq';
    moq?: number | null;
  };
  applicableDiscountTypes?: Array<{
    id: string;
    discountType: string;
    discountAmount: number;
    discountPercentage?: number;
    promotionDetails?: {
      minQuantity?: number;
      freeQuantity?: number;
      description?: string;
    };
  }>;
}

export interface OrderItemWithOffer {
  productId: string;
  productName: string;
  packageQuantity: number;
  packageType?: string;
  piecesPerPackage?: number;
  pricePerPackage: number;
  subtotal: number;
  offerApplied?: boolean;
  offerBadgeSnapshot?: string | null;
  offerNameSnapshot?: string | null;
  offerIdSnapshot?: string | null;
  originalPriceSnapshot?: string | null;
  discountPercentage?: number | null;
  discountAmount?: number | null;
  promotionDetailsSnapshot?: string | null;
}

function badgeForType(
  discountType: string,
  hasComboPromotion?: boolean,
): 'Discount' | 'Promotion' | 'All Offers' | 'Offer' {
  if (hasComboPromotion && discountType !== 'buy_x_get_y') return 'All Offers';
  if (discountType === 'buy_x_get_y') return 'Promotion';
  if (
    discountType === 'percentage' ||
    discountType === 'fixed_amount' ||
    discountType === 'fixed_price'
  ) {
    return 'Discount';
  }
  return 'Offer';
}

/**
 * Validate if a per-client offer can be applied to a product.
 * Without buyerId, marketplace must not see private rates — returns invalid.
 */
export async function validateOfferForProduct(
  productId: string,
  marketplaceUserId: number | null,
  _orderTotal: number,
  _orderQuantity: number,
  tx: Prisma.TransactionClient,
  _packageQuantity?: number,
  variant?: {
    sellingPrice: number | string;
    moq?: number | null;
    id?: number | null;
  },
  buyerId?: string | null,
): Promise<OfferValidationResult> {
  try {
    const clientId = String(buyerId || '').trim();
    if (!clientId) {
      return {
        isValid: false,
        error: 'No buyerId — private rates not applied',
      };
    }

    if (!variant) {
      return { isValid: false, error: 'Variant information required to validate offer' };
    }

    // Catalog sellingPrice is the base; client rates apply at order time only
    const originalPrice = parsePrice(
      variant.sellingPrice as
        | string
        | number
        | { toNumber?: () => number; toString?: () => string }
        | null
        | undefined,
    );

    const offer = await getOfferForClientAndProduct(clientId, productId, {
      db: tx,
      variantOptionId: variant.id ?? null,
    });
    if (!offer) {
      return { isValid: false, error: 'No active offer for this client and product' };
    }

    const applied = applyOfferToPrice(originalPrice, offer);
    const promo = applied.promotionDetails;
    const isPromo = Boolean(promo);
    const freeQty = promo?.freeQuantity ?? Math.round(offer.discountValue);
    const buyQty = promo?.buyQuantity ?? offer.buyQuantity ?? 1;
    const hasCombo =
      isPromo &&
      (offer.discountType === 'percentage' ||
        offer.discountType === 'fixed_amount' ||
        offer.discountType === 'fixed_price');

    const discountPercentage =
      offer.discountType === 'percentage' ? applied.discountPercentage ?? undefined : undefined;
    const discountAmount =
      applied.discountAmount > 0 ? applied.discountAmount : undefined;

    return {
      isValid: true,
      offerId: offer.id,
      offerName: offer.notes || offer.offerId,
      discountTypeId: offer.id,
      discountAmount,
      discountPercentage,
      offerBadge: badgeForType(offer.discountType, hasCombo),
      originalPrice,
      finalPrice: applied.unitPrice,
      promotionDetails: isPromo
        ? {
            minQuantity: buyQty,
            freeQuantity: freeQty,
            description: `Buy ${buyQty} get ${freeQty}`,
          }
        : undefined,
      applicableDiscountTypes: [
        {
          id: offer.id,
          discountType: offer.discountType,
          discountAmount,
          discountPercentage,
          promotionDetails: isPromo
            ? {
                minQuantity: buyQty,
                freeQuantity: freeQty,
              }
            : undefined,
        },
      ],
    };
  } catch (error) {
    return {
      isValid: false,
      error: error instanceof Error ? error.message : 'Failed to validate offer',
    };
  }
}

/** No-op: usage limits removed for per-retailer rates. */
export async function updateOfferStatusesBasedOnLimits(_usedOfferIds?: string[]): Promise<void> {
  // Distributors manage offer lifecycle manually
}

async function trackFlatOfferUsage(
  offerId: string,
  marketplaceUserId: number | null,
  discountAmount: number,
  tx: Prisma.TransactionClient,
): Promise<void> {
  // Use empty string instead of null so compound unique upsert works reliably
  const discountTypeId = '';

  if (marketplaceUserId != null) {
    await tx.offerUsageTracking.upsert({
      where: {
        offerId_discountTypeId_marketplaceUserId: {
          offerId,
          discountTypeId,
          marketplaceUserId,
        },
      },
      update: {
        usageCount: { increment: 1 },
        lastUsedAt: new Date(),
      },
      create: {
        offerId,
        discountTypeId,
        marketplaceUserId,
        usageCount: 1,
        lastUsedAt: new Date(),
      },
    });
  } else {
    const existingUsage = await tx.offerUsageTracking.findFirst({
      where: {
        offerId,
        OR: [{ discountTypeId: '' }, { discountTypeId: null }],
        marketplaceUserId: null,
      },
    });
    if (existingUsage) {
      await tx.offerUsageTracking.update({
        where: { id: existingUsage.id },
        data: { usageCount: { increment: 1 }, lastUsedAt: new Date() },
      });
    } else {
      await tx.offerUsageTracking.create({
        data: {
          offerId,
          discountTypeId,
          marketplaceUserId: null,
          usageCount: 1,
          lastUsedAt: new Date(),
        },
      });
    }
  }

  await tx.offer.update({
    where: { id: offerId },
    data: {
      totalUsage: { increment: 1 },
      totalDiscountGiven: { increment: discountAmount },
    },
  });
}

export async function trackOfferUsageForAllTypes(
  offerId: string,
  _applicableDiscountTypes: Array<{
    id: string;
    discountType: string;
    discountAmount: number;
    discountPercentage?: number;
  }>,
  marketplaceUserId: number | null,
  tx: Prisma.TransactionClient,
): Promise<void> {
  const totalDiscount = _applicableDiscountTypes.reduce(
    (sum, d) => sum + (d.discountAmount || 0),
    0,
  );
  await trackFlatOfferUsage(offerId, marketplaceUserId, totalDiscount, tx);
}

export async function trackOfferUsage(
  offerId: string,
  _discountTypeId: string,
  marketplaceUserId: number | null,
  discountAmount: number,
  tx: Prisma.TransactionClient,
): Promise<void> {
  await trackFlatOfferUsage(offerId, marketplaceUserId, discountAmount, tx);
}

/**
 * Best-effort reverse of offer usage counters when an order is deleted.
 * Decrements totalUsage / totalDiscountGiven for offers referenced on order items.
 * Looks up by the stable Offer.id in offerIdSnapshot (set at apply time),
 * scoped to the order's distributor (and buyer when present).
 */
export async function reverseOfferUsage(
  orderId: string,
  tx: Prisma.TransactionClient,
): Promise<void> {
  try {
    const order = await tx.order.findFirst({
      where: { orderId },
      select: { userId: true, buyerId: true },
    });
    if (!order) return;

    const items = await tx.orderItem.findMany({
      where: { orderId, offerApplied: true },
      select: {
        offerIdSnapshot: true,
        discountAmount: true,
      },
    });

    for (const item of items) {
      const offerKey = item.offerIdSnapshot?.trim();
      if (!offerKey) continue;

      const offer = await tx.offer.findFirst({
        where: {
          OR: [{ id: offerKey }, { offerId: offerKey }],
          ...(order.userId != null ? { userId: order.userId } : {}),
          ...(order.buyerId ? { buyerId: order.buyerId } : {}),
        },
        select: { id: true, totalUsage: true },
      });
      if (!offer) continue;
      const discount = Number(item.discountAmount ?? 0);
      await tx.offer.update({
        where: { id: offer.id },
        data: {
          totalUsage: { decrement: offer.totalUsage > 0 ? 1 : 0 },
          ...(discount > 0 ? { totalDiscountGiven: { decrement: discount } } : {}),
        },
      });
    }
  } catch {
    // Non-fatal: deletion should still proceed
  }
}

/**
 * Create order item with offer snapshot fields.
 */
export function createOrderItemWithOffer(
  baseItem: Omit<
    OrderItemWithOffer,
    | 'offerApplied'
    | 'offerBadgeSnapshot'
    | 'offerNameSnapshot'
    | 'offerIdSnapshot'
    | 'originalPriceSnapshot'
    | 'discountPercentage'
    | 'discountAmount'
    | 'promotionDetailsSnapshot'
  >,
  validation: OfferValidationResult,
): OrderItemWithOffer {
  if (!validation.isValid) {
    return {
      ...baseItem,
      offerApplied: false,
      offerBadgeSnapshot: null,
      offerNameSnapshot: null,
      offerIdSnapshot: null,
      originalPriceSnapshot: null,
      discountPercentage: null,
      discountAmount: null,
      promotionDetailsSnapshot: null,
    };
  }

  return {
    ...baseItem,
    offerApplied: true,
    offerBadgeSnapshot: validation.offerBadge ?? null,
    offerNameSnapshot: validation.offerName ?? null,
    offerIdSnapshot: validation.offerId ?? null,
    originalPriceSnapshot:
      validation.originalPrice != null ? String(validation.originalPrice) : null,
    discountPercentage: validation.discountPercentage ?? null,
    discountAmount: validation.discountAmount ?? null,
    promotionDetailsSnapshot: validation.promotionDetails
      ? JSON.stringify(validation.promotionDetails)
      : null,
  };
}
