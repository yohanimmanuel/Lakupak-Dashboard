import { parsePrice } from '@/utils/currencyUtils';

export type PromotionApplyMode = 'from_zero' | 'after_moq';

export interface PromotionDetails {
  minQuantity: number;
  freeQuantity: number;
  description?: string;
  /** Defaults to `after_moq` when omitted (legacy offers / order snapshots). */
  applyMode?: PromotionApplyMode;
}

export interface PromotionGift {
  freeQty: number;
  totalReceived: number;
}

export function normalizePromotionApplyMode(
  mode?: string | null,
): PromotionApplyMode {
  return mode === 'from_zero' ? 'from_zero' : 'after_moq';
}

type BuyXGetYDiscountSource = {
  minQuantity?: number | null;
  discountValue?: unknown;
  description?: string | null;
  promotionApplyMode?: string | null;
};

/** Build promotionDetails JSON from an active buy_x_get_y OfferDiscountType row. */
export function buildBuyXGetYPromotionDetails(
  discount: BuyXGetYDiscountSource,
): PromotionDetails {
  const minQuantity = discount.minQuantity && discount.minQuantity > 0 ? discount.minQuantity : 1;
  const freeQuantity = discount.discountValue
    ? parsePrice(
        discount.discountValue as
          | string
          | number
          | { toNumber?: () => number; toString?: () => string }
          | null
          | undefined,
      )
    : 0;
  const applyMode = normalizePromotionApplyMode(discount.promotionApplyMode);

  return {
    minQuantity,
    freeQuantity,
    applyMode,
    description:
      discount.description?.trim() ||
      `Buy ${minQuantity} Get ${freeQuantity} Free`,
  };
}

/**
 * Calculate promotion free items (PIECE-BASED SYSTEM).
 * `applyMode: from_zero` — count buy-x-get-y sets from the first unit (ignore product MOQ gate).
 * `applyMode: after_moq` — require product MOQ first (>=), then count sets on quantity above MOQ.
 */
export const calculatePromotionGift = (
  promotionDetails: PromotionDetails,
  quantityInPieces: number,
  moq: number | null,
): PromotionGift | null => {
  const minQty = promotionDetails.minQuantity || 1;
  const freeQty = promotionDetails.freeQuantity || 0;
  const applyMode = normalizePromotionApplyMode(promotionDetails.applyMode);

  if (applyMode === 'from_zero' || moq === null || moq === undefined) {
    const completeSets = Math.floor(quantityInPieces / minQty);
    const totalFreeItems = completeSets * freeQty;

    if (totalFreeItems > 0) {
      return {
        freeQty: totalFreeItems,
        totalReceived: quantityInPieces + totalFreeItems,
      };
    }
    return null;
  }

  // after_moq: MOQ satisfied when quantity >= moq (not strictly greater).
  if (quantityInPieces < moq) return null;

  const quantityAboveMOQ = quantityInPieces - moq;
  const completeSets = Math.floor(quantityAboveMOQ / minQty);
  const totalFreeItems = completeSets * freeQty;

  if (totalFreeItems > 0) {
    return {
      freeQty: totalFreeItems,
      totalReceived: quantityInPieces + totalFreeItems,
    };
  }

  return null;
};

/**
 * HELPER FOR ORDER DETAILS: Calculate promotion from saved order item data
 */
export function calculateOrderItemPromotion(
  promotionDetails: PromotionDetails | string | null | undefined,
  quantityInPackages: number,
  piecesPerPackage: number,
  moq: number | null | undefined,
): PromotionGift | null {
  let parsedPromotionDetails: PromotionDetails | null = null;
  if (typeof promotionDetails === 'string') {
    try {
      parsedPromotionDetails = JSON.parse(promotionDetails) as PromotionDetails;
    } catch {
      return null;
    }
  } else if (promotionDetails && typeof promotionDetails === 'object') {
    parsedPromotionDetails = promotionDetails;
  }

  if (!parsedPromotionDetails) return null;

  const totalPieces = quantityInPackages * piecesPerPackage;

  return calculatePromotionGift(parsedPromotionDetails, totalPieces, moq ?? null);
}

/** @deprecated Use calculateOrderItemPromotion instead for consistency with Marketplace */
export const calculateDashboardPromotionGift = calculateOrderItemPromotion;
