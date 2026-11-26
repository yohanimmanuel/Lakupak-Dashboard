import { parsePrice } from '@/utils/currencyUtils';

export type PromotionApplyMode = 'from_zero' | 'after_moq';

export interface PromotionDetails {
  /** Buy-X threshold. Offer form stores this in packages of the ordered stock level. */
  minQuantity: number;
  /** Free-Y amount. Offer form stores this in packages of the ordered stock level. */
  freeQuantity: number;
  description?: string;
  /** Defaults to `after_moq` when omitted (legacy offers / order snapshots). */
  applyMode?: PromotionApplyMode;
  /** Optional product MOQ already converted to pieces (preferred for order snapshots). */
  moq?: number | null;
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
 * Resolve product MOQ into pieces for the ordered stock level.
 * - `moqByStockLevel[Cartons] = 2` with 22 pcs/carton → 44 pieces
 * - Pieces level / missing map → use legacy `moqPieces`
 */
export function resolveMoqInPieces(opts: {
  packageType?: string | null;
  piecesPerPackage: number;
  moqPieces?: number | null;
  moqByStockLevel?: Record<string, number> | null;
}): number | null {
  const piecesPerPackage = Math.max(1, Math.trunc(Number(opts.piecesPerPackage) || 1));
  const level = String(opts.packageType || '').trim();
  const byLevel = opts.moqByStockLevel;
  if (level && level.toLowerCase() !== 'pieces' && byLevel && typeof byLevel === 'object') {
    const levelMoq = Number(byLevel[level]);
    if (Number.isFinite(levelMoq) && levelMoq > 0) {
      return Math.trunc(levelMoq) * piecesPerPackage;
    }
  }
  const piecesMoq = opts.moqPieces;
  if (piecesMoq != null && Number.isFinite(Number(piecesMoq)) && Number(piecesMoq) > 0) {
    return Math.trunc(Number(piecesMoq));
  }
  return null;
}

/**
 * Calculate promotion free items (PIECE-BASED SYSTEM).
 * Callers must pass `minQuantity` / `freeQuantity` / `moq` already in pieces.
 * `applyMode: from_zero` — count buy-x-get-y sets from the first unit.
 * `applyMode: after_moq` — require product MOQ first (>=), then count sets on quantity above MOQ.
 */
export const calculatePromotionGift = (
  promotionDetails: PromotionDetails,
  quantityInPieces: number,
  moq: number | null,
): PromotionGift | null => {
  const minQty = Math.max(1, Math.trunc(promotionDetails.minQuantity || 1));
  const freeQty = Math.max(0, Math.trunc(promotionDetails.freeQuantity || 0));
  const applyMode = normalizePromotionApplyMode(promotionDetails.applyMode);
  const qty = Math.max(0, Math.trunc(quantityInPieces || 0));
  if (freeQty <= 0 || qty <= 0) return null;

  if (applyMode === 'from_zero' || moq === null || moq === undefined) {
    const completeSets = Math.floor(qty / minQty);
    const totalFreeItems = completeSets * freeQty;
    if (totalFreeItems > 0) {
      return {
        freeQty: totalFreeItems,
        totalReceived: qty + totalFreeItems,
      };
    }
    return null;
  }

  const moqPieces = Math.max(0, Math.trunc(moq));
  // after_moq: MOQ satisfied when quantity >= moq (not strictly greater).
  if (qty < moqPieces) return null;

  const quantityAboveMOQ = qty - moqPieces;
  const completeSets = Math.floor(quantityAboveMOQ / minQty);
  const totalFreeItems = completeSets * freeQty;

  if (totalFreeItems > 0) {
    return {
      freeQty: totalFreeItems,
      totalReceived: qty + totalFreeItems,
    };
  }

  return null;
};

/**
 * HELPER FOR ORDER DETAILS: Calculate promotion from saved order item data.
 * Offer form X/Y are packages for the ordered stock level — convert to pieces here.
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

  const ppp = Math.max(1, Math.trunc(Number(piecesPerPackage) || 1));
  const packages = Math.max(0, Number(quantityInPackages) || 0);
  const totalPieces = Math.trunc(packages * ppp);

  // Snapshot may already store piece MOQ; otherwise treat provided moq as pieces.
  const moqPieces =
    parsedPromotionDetails.moq != null && Number(parsedPromotionDetails.moq) > 0
      ? Math.trunc(Number(parsedPromotionDetails.moq))
      : moq != null && Number(moq) > 0
        ? Math.trunc(Number(moq))
        : null;

  // Offer UI: X/Y are packages → pieces for the stock level being ordered.
  const piecePromotion: PromotionDetails = {
    ...parsedPromotionDetails,
    minQuantity: Math.max(1, Math.trunc(parsedPromotionDetails.minQuantity || 1)) * ppp,
    freeQuantity: Math.max(0, Math.trunc(parsedPromotionDetails.freeQuantity || 0)) * ppp,
  };

  return calculatePromotionGift(piecePromotion, totalPieces, moqPieces);
}

/** @deprecated Use calculateOrderItemPromotion instead for consistency with Marketplace */
export const calculateDashboardPromotionGift = calculateOrderItemPromotion;
