// Utility functions for promotion calculations

export interface PromotionDetails {
  minQuantity: number;
  freeQuantity: number;
  description?: string;
}

export interface PromotionGift {
  freeQty: number;
  totalReceived: number;
}

/**
 * Calculate promotion free items (PIECE-BASED SYSTEM)
 * Free items are only calculated AFTER MOQ is fulfilled
 * @param promotionDetails - The promotion details (minQuantity, freeQuantity in pieces)
 * @param quantityInPieces - Current quantity ordered IN PIECES
 * @param moq - Minimum Order Quantity IN PIECES (null if no MOQ)
 * @returns PromotionGift object or null if no free items
 */
export const calculatePromotionGift = (
  promotionDetails: PromotionDetails,
  quantityInPieces: number,
  moq: number | null
): PromotionGift | null => {
  const minQty = promotionDetails.minQuantity || 1;
  const freeQty = promotionDetails.freeQuantity || 0;

  // If no MOQ is set, calculate from total quantity
  if (moq === null) {
    const completeSets = Math.floor(quantityInPieces / minQty);
    const totalFreeItems = completeSets * freeQty;
    
    if (totalFreeItems > 0) {
      return {
        freeQty: totalFreeItems,
        totalReceived: quantityInPieces + totalFreeItems
      };
    }
    return null;
  }
  
  // Only calculate free items if MOQ is met
  if (quantityInPieces < moq) return null;
  
  // Once MOQ is met, apply promotion only to quantity ABOVE MOQ
  // For example: MOQ = 4 pieces, buy 3 get 2
  // - Order 4 pieces: 0 above MOQ, 0 complete sets, 0 free items
  // - Order 7 pieces: 3 above MOQ, 1 complete set (3/3), 2 free items
  // - Order 10 pieces: 6 above MOQ, 2 complete sets (6/3), 4 free items
  const quantityAboveMOQ = quantityInPieces - moq;
  
  // Count how many complete sets of minQty we have in the quantity above MOQ
  const completeSets = Math.floor(quantityAboveMOQ / minQty);
  
  // For each complete set, give freeQty items
  const totalFreeItems = completeSets * freeQty;
  
  if (totalFreeItems > 0) {
    return {
      freeQty: totalFreeItems,
      totalReceived: quantityInPieces + totalFreeItems
    };
  }
  
  return null;
};

/**
 * HELPER FOR ORDER DETAILS: Calculate promotion from saved order item data
 * EXACT SAME as Marketplace - Use this for OrderDetails components where data comes from order history
 * 
 * @param promotionDetails - The saved promotion details
 * @param quantityInPackages - Quantity ordered in packages
 * @param piecesPerPackage - Pieces per package from order item
 * @param moq - MOQ from order item or fetched product data (in pieces)
 * @returns PromotionGift object or null if no free items
 */
export function calculateOrderItemPromotion(
  promotionDetails: PromotionDetails | string | null | undefined,
  quantityInPackages: number,
  piecesPerPackage: number,
  moq: number | null | undefined
): PromotionGift | null {
  // Parse promotion details if it's a string
  let parsedPromotionDetails: PromotionDetails | null = null;
  if (typeof promotionDetails === 'string') {
    try {
      parsedPromotionDetails = JSON.parse(promotionDetails);
    } catch (e) {
      return null;
    }
  } else if (promotionDetails && typeof promotionDetails === 'object') {
    parsedPromotionDetails = promotionDetails;
  }
  
  if (!parsedPromotionDetails) return null;
  
  // Calculate total pieces
  const totalPieces = quantityInPackages * piecesPerPackage;
  
  // Calculate promotion in pieces
  return calculatePromotionGift(
    parsedPromotionDetails,
    totalPieces,
    moq || null
  );
}

/**
 * @deprecated Use calculateOrderItemPromotion instead for consistency with Marketplace
 */
export const calculateDashboardPromotionGift = calculateOrderItemPromotion;
