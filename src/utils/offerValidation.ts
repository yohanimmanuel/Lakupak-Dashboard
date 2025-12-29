/**
 * Offer Validation and Tracking Utilities
 * Handles offer validation, usage tracking, and snapshot creation for orders
 */

import { prisma } from '@/lib/db';
import type { Prisma } from '@/lib/db';

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
    moq?: number | null;
  };
  // Add array of all applicable discount types for tracking
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
  // Offer snapshot fields
  offerApplied?: boolean;
  offerBadgeSnapshot?: string | null;
  offerNameSnapshot?: string | null;
  originalPriceSnapshot?: string | null;
  discountPercentage?: number | null;
  discountAmount?: number | null;
  promotionDetailsSnapshot?: string | null;
}

/**
 * Validate if an offer can be applied to a product
 */
export async function validateOfferForProduct(
  productId: string,
  marketplaceUserId: number | null,
  orderTotal: number,
  orderQuantity: number,
  tx: Prisma.TransactionClient,
  packageQuantity?: number, // Add package quantity for buy_x_get_y calculations
  variant?: { sellingPrice: string; originalSellingPrice?: string | null; moq?: number | null } // Add variant parameter with MOQ
): Promise<OfferValidationResult> {
  try {
    // Find active offers for this product
    const now = new Date();
    const activeOffers = await tx.offer.findMany({
      where: {
        status: 'active',
        // Offer is valid if it has no date ranges (unlimited) OR has at least one active date range that's currently valid
        OR: [
          {
            dateRanges: {
              none: {} // No date ranges = unlimited offer
            }
          },
          {
            dateRanges: {
              some: {
                startDate: { lte: now },
                endDate: { gte: now },
                isActive: true
              }
            }
          }
        ],
        offerProducts: {
          some: {
            productId: productId
          }
        }
      },
      include: {
        offerDiscountTypes: {
          where: {
            isActive: true
          },
          orderBy: {
            priority: 'desc' // Higher priority first
          }
        },
        offerProducts: {
          where: {
            productId: productId
          },
          include: {
            product: true
          }
        },
        dateRanges: {
          where: {
            isActive: true
          }
        }
      }
    });

    if (activeOffers.length === 0) {
      return { isValid: false, error: 'No active offers found for this product' };
    }

    // Get the first (highest priority) offer
    const offer = activeOffers[0];
    if (!offer || !offer.offerProducts || offer.offerProducts.length === 0) {
      return { isValid: false, error: 'No active offers found for this product' };
    }
    const product = offer.offerProducts[0].product;
    
    // Use variant price if provided, otherwise we need to get from variantOptions
    let originalPrice = 0;
    if (variant) {
      originalPrice = parseFloat(variant.originalSellingPrice || variant.sellingPrice);
    } else {
      // If no variant provided, we can't determine price - return error
      return { isValid: false, error: 'Variant information required to validate offer' };
    }

    // Try each discount type in priority order and collect all applicable discounts/promotions
    let bestDiscountAmount = 0;
    let bestDiscountPercentage = 0;
    let bestDiscountTypeId = '';
    let promotionDetails = undefined;
    let hasValidDiscount = false;
    let applicableDiscountTypes: Array<{
      id: string;
      discountType: string;
      discountAmount: number;
      discountPercentage?: number;
      promotionDetails?: {
        minQuantity?: number;
        freeQuantity?: number;
        description?: string;
        moq?: number | null;
      };
    }> = [];

    const discountTypes = offer.offerDiscountTypes || [];
    for (const discountType of discountTypes) {
        // Check usage limits - this will prevent the offer from being applied if limit is reached
      const usageValidation = await validateUsageLimits(
        offer.id,
        discountType.id,
        marketplaceUserId,
        discountType,
        tx
      );

      if (!usageValidation.isValid) {
        continue; // Try next discount type
      }

      // Calculate discount based on type
      let discountAmount = 0;
      let discountPercentage = 0;
      let currentPromotionDetails = undefined;

      if (discountType.discountType === 'percentage') {
        discountPercentage = discountType.discountValue;
        discountAmount = (originalPrice * discountPercentage) / 100;
        
        // Keep the best discount
        if (discountAmount > bestDiscountAmount) {
          bestDiscountAmount = discountAmount;
          bestDiscountPercentage = discountPercentage;
          bestDiscountTypeId = discountType.id;
          hasValidDiscount = true;
        }
        
        // Add to applicable discount types
        applicableDiscountTypes.push({
          id: discountType.id,
          discountType: discountType.discountType,
          discountAmount: discountAmount,
          discountPercentage: discountPercentage
        });
      } else if (discountType.discountType === 'fixed') {
        discountAmount = discountType.discountValue;
        
        // Keep the best discount
        if (discountAmount > bestDiscountAmount) {
          bestDiscountAmount = discountAmount;
          bestDiscountPercentage = 0;
          bestDiscountTypeId = discountType.id;
          hasValidDiscount = true;
        }
        
        // Add to applicable discount types
        applicableDiscountTypes.push({
          id: discountType.id,
          discountType: discountType.discountType,
          discountAmount: discountAmount
        });
      } else if (discountType.discountType === 'buy_x_get_y') {
        // For buy_x_get_y, we don't change the price but provide promotion details
        const minQuantity = discountType.minQuantity;
        const freeItemsPerSet = discountType.discountValue || 1; // Number of free items per qualifying set
        
        // Use package quantity for buy_x_get_y calculations, not total pieces
        const quantityForCalculation = packageQuantity || Math.floor(orderQuantity / 100) || 1; // Fallback to approximate packages
        
        // Only apply promotion if minQuantity is properly set and package quantity meets the requirement
        if (minQuantity && minQuantity > 0 && quantityForCalculation >= minQuantity) {
          // Simple calculation: if you buy X and qualify, you get X free items
          // For "buy 2 get 2": if you buy 4, you get 4 free
          const totalFreeItems = freeItemsPerSet;
          
          currentPromotionDetails = {
            minQuantity: minQuantity,
            freeQuantity: totalFreeItems,
            description: discountType.description || `Buy ${minQuantity}, get ${freeItemsPerSet} free`,
            moq: variant?.moq || null
          };
          
          promotionDetails = currentPromotionDetails;
          
          // Add to applicable discount types
          applicableDiscountTypes.push({
            id: discountType.id,
            discountType: discountType.discountType,
            discountAmount: 0, // Buy X Get Y doesn't change price
            promotionDetails: currentPromotionDetails
          });
        }
      }
    }

    // If we found any valid discount or promotion, return the result
    if (hasValidDiscount || promotionDetails) {
      const finalPrice = originalPrice - bestDiscountAmount;

      // Determine offer badge
      const offerBadge = getOfferBadge(discountTypes);

      return {
        isValid: true,
        offerId: offer.id,
        offerName: offer.name,
        discountTypeId: bestDiscountTypeId || (discountTypes.length > 0 ? discountTypes[0].id : ''),
        discountAmount: bestDiscountAmount,
        discountPercentage: bestDiscountPercentage,
        offerBadge,
        originalPrice,
        finalPrice,
        promotionDetails,
        applicableDiscountTypes: applicableDiscountTypes
      };
    }

    return { 
      isValid: false, 
      error: 'Offer exists but all discount types have reached their usage limits or requirements not met' 
    };

  } catch (error) {
    return { 
      isValid: false, 
      error: error instanceof Error ? error.message : 'Failed to validate offer' 
    };
  }
}

/**
 * Deactivate offer and discount type if usage limit is reached
 */
async function deactivateOfferIfLimitReached(
  offerId: string,
  discountTypeId: string,
  tx: Prisma.TransactionClient
): Promise<void> {
  try {
    // Deactivate only this specific discount type
    await tx.offerDiscountType.update({
      where: { id: discountTypeId },
      data: { isActive: false }
    });
    
    // Check if ALL discount types are now inactive, then deactivate the entire offer
    const remainingActiveDiscountTypes = await tx.offerDiscountType.count({
      where: {
        offerId: offerId,
        isActive: true
      }
    });
    
    if (remainingActiveDiscountTypes === 0) {
      await tx.offer.update({
        where: { id: offerId },
        data: { status: 'inactive' }
      });
    }
  } catch (error) {
    // Don't throw - this shouldn't fail the validation
  }
}

/**
 * Validate usage limits for an offer discount type
 */
async function validateUsageLimits(
  offerId: string,
  discountTypeId: string,
  marketplaceUserId: number | null,
  discountType: {
    // perCustomerLimit removed
  },
  tx: Prisma.TransactionClient
): Promise<{ isValid: boolean; error?: string }> {
  // No usage limits - distributors manage offers manually

  // Per-customer usage limit check removed

  return { isValid: true };
}

/**
 * Check and update offer statuses based on usage limits for specific offers
 * This function should be called after order creation to ensure offers are properly deactivated
 */
export async function updateOfferStatusesBasedOnLimits(usedOfferIds?: string[]): Promise<void> {
  // If no offers were used, don't check anything
  if (!usedOfferIds || usedOfferIds.length === 0) {
    return;
  }

  try {
    await prisma.$transaction(async (tx) => {
      
      // Only check the specific offers that were used
      const usedOffers = await tx.offer.findMany({
        where: { 
          status: 'active', 
          id: { in: usedOfferIds } 
        },
        include: {
          offerDiscountTypes: {
            where: { isActive: true }
          }
        }
      });


      for (const offer of usedOffers) {
        let hasDeactivatedDiscountType = false;
        
        // No usage limits - distributors manage offers manually
        
        // No automatic deactivation - distributors manage offers manually
      }
    });
  } catch (error) {
    // Log error but don't throw - this is a maintenance function
  }
}

/**
 * Helper function to track per-discount-type usage (for analytics)
 * This is used by both trackOfferUsage and trackOfferUsageForAllTypes
 */
async function trackDiscountTypeUsage(
  offerId: string,
  discountTypeId: string,
  marketplaceUserId: number | null,
  tx: Prisma.TransactionClient
): Promise<void> {
    if (marketplaceUserId) {
      await tx.offerUsageTracking.upsert({
        where: {
          offerId_discountTypeId_marketplaceUserId: {
            offerId: offerId,
            discountTypeId: discountTypeId,
            marketplaceUserId: marketplaceUserId
          }
        },
        update: {
          usageCount: { increment: 1 },
          lastUsedAt: new Date()
        },
        create: {
          offerId: offerId,
          discountTypeId: discountTypeId,
          marketplaceUserId: marketplaceUserId,
          usageCount: 1,
          lastUsedAt: new Date()
        }
      });
    } else {
      // Track general usage when no marketplaceUserId (for admin orders)
    const existingUsage = await tx.offerUsageTracking.findFirst({
        where: {
            offerId: offerId,
            discountTypeId: discountTypeId,
            marketplaceUserId: null
        }
      });

      if (existingUsage) {
        await tx.offerUsageTracking.update({
          where: { id: existingUsage.id },
          data: {
            usageCount: { increment: 1 },
            lastUsedAt: new Date()
          }
        });
      } else {
        await tx.offerUsageTracking.create({
          data: {
            offerId: offerId,
            discountTypeId: discountTypeId,
            marketplaceUserId: null,
            usageCount: 1,
            lastUsedAt: new Date()
          }
        });
      }
    }
}

/**
 * Track usage for all applicable discount types in an order
 * Note: totalUsage should only increment once per order item, even if multiple discount types are applied
 */
export async function trackOfferUsageForAllTypes(
  offerId: string,
  applicableDiscountTypes: Array<{
    id: string;
    discountType: string;
    discountAmount: number;
    discountPercentage?: number;
    promotionDetails?: {
      minQuantity?: number;
      freeQuantity?: number;
      description?: string;
    };
  }>,
  marketplaceUserId: number | null,
  tx: Prisma.TransactionClient
): Promise<void> {
  try {
    if (applicableDiscountTypes.length === 0) {
      return;
    }

    // Calculate total discount amount across all discount types
    const totalDiscountAmount = applicableDiscountTypes.reduce(
      (sum, dt) => sum + (dt.discountAmount || 0),
      0
    );

    // Track usage for each discount type individually (for per-type analytics)
    for (const discountType of applicableDiscountTypes) {
      await trackDiscountTypeUsage(offerId, discountType.id, marketplaceUserId, tx);
    }

    // Update offer totals ONCE per order item (not per discount type)
    // This ensures totalUsage represents the number of times the offer was used, not the number of discount types
    await tx.offer.update({
      where: { id: offerId },
      data: {
        totalUsage: { increment: 1 },
        totalDiscountGiven: { increment: totalDiscountAmount }
      }
    });
  } catch (error) {
    // Don't throw - this shouldn't fail the order
  }
}

/**
 * Track offer usage after successful order creation
 */
export async function trackOfferUsage(
  offerId: string,
  discountTypeId: string,
  marketplaceUserId: number | null,
  discountAmount: number,
  tx: Prisma.TransactionClient
): Promise<void> {
  try {
    // Track per-discount-type usage (for analytics)
    await trackDiscountTypeUsage(offerId, discountTypeId, marketplaceUserId, tx);

    // Update offer totals
    await tx.offer.update({
      where: { id: offerId },
      data: {
        totalUsage: { increment: 1 },
        totalDiscountGiven: { increment: discountAmount }
      }
    });

    // No usage limits - distributors manage offers manually

  } catch (error) {
    // Don't fail the order if tracking fails, just log it
    // Error handled silently
  }
}

/**
 * Reverse offer discount when an order is deleted
 * Note: totalUsage remains cumulative (doesn't decrease), only totalDiscountGiven is reversed
 */
export async function reverseOfferUsage(
  orderId: string,
  tx: Prisma.TransactionClient
): Promise<void> {
  try {
    // Get all order items that had offers applied
    const orderItems = await tx.orderItem.findMany({
      where: {
        orderId: orderId,
        offerApplied: true
      }
    });

    // Process each order item that had an offer
    for (const item of orderItems) {
      // Parse the promotion details to get discount amount
      let discountAmount = 0;
      if (item.promotionDetailsSnapshot) {
        try {
          const promotionDetails = JSON.parse(item.promotionDetailsSnapshot);
          // For buy_x_get_y, calculate the discount based on free quantity
          if (promotionDetails.freeQuantity && item.packageQuantity) {
            const freeQuantity = promotionDetails.freeQuantity;
            const packageQuantity = item.packageQuantity;
            const actualFreeQuantity = Math.min(freeQuantity, packageQuantity);
            // Estimate discount amount (this is approximate since we don't have original price)
            discountAmount = actualFreeQuantity * (item.pricePerPackage || 0);
          }
        } catch (e) {
          // If parsing fails, skip this item
          continue;
        }
      } else if (item.discountPercentage && item.discountPercentage > 0) {
        // For percentage discounts, calculate the discount amount
        const originalPrice = parseFloat(item.originalPriceSnapshot || '0');
        discountAmount = originalPrice * (item.discountPercentage / 100);
      } else if (item.discountAmount) {
        // For fixed discounts, use the stored discount amount (same technique as percentage discounts)
        discountAmount = item.discountAmount;
      }

      // Find the offer and discount type from the snapshots
      const offerName = item.offerNameSnapshot;
      if (!offerName) continue;

      // Find the offer by name
      const offer = await tx.offer.findFirst({
        where: {
          name: offerName
        },
        include: {
          offerDiscountTypes: true
        }
      });

      if (!offer) continue;

      // Find the discount type that was applied
      let discountTypeId = null;
      for (const dt of offer.offerDiscountTypes) {
        if (dt.discountType === 'buy_x_get_y' && item.promotionDetailsSnapshot) {
          discountTypeId = dt.id;
          break;
        } else if (dt.discountType === 'percentage' && item.discountPercentage) {
          discountTypeId = dt.id;
          break;
        } else if (dt.discountType === 'fixed' && item.discountAmount) {
          discountTypeId = dt.id;
          break;
        }
      }

      if (!discountTypeId) continue;

      // Only decrement the total discount given, but never below 0
      const currentOffer = await tx.offer.findUnique({
        where: { id: offer.id },
        select: { totalDiscountGiven: true }
      });
      
      if (currentOffer) {
        const newTotalDiscount = Math.max(0, currentOffer.totalDiscountGiven - discountAmount);
        await tx.offer.update({
          where: { id: offer.id },
          data: {
            totalDiscountGiven: newTotalDiscount
          }
        });
      }

      // Note: We don't decrement individual usage tracking since we can't identify
      // which specific marketplace user made the original purchase
    }
  } catch (error) {
    // Don't throw - this shouldn't fail the order deletion
  }
}

/**
 * Determine offer badge based on discount types
 */
function getOfferBadge(
  discountTypes: Array<{ discountType: string; isActive: boolean }>
): 'Discount' | 'Promotion' | 'All Offers' | 'Offer' {
  const activeTypes = discountTypes.filter(dt => dt.isActive);
  const hasDiscount = activeTypes.some(dt => dt.discountType === 'percentage' || dt.discountType === 'fixed');
  const hasPromotion = activeTypes.some(dt => dt.discountType === 'buy_x_get_y');

  if (hasDiscount && hasPromotion) return 'All Offers';
  if (hasPromotion) return 'Promotion';
  if (hasDiscount) return 'Discount';
  return 'Offer';
}

/**
 * Create offer snapshot for order item
 */
export function createOfferSnapshot(
  validation: OfferValidationResult,
  originalItem: OrderItemWithOffer
): OrderItemWithOffer {
  if (!validation.isValid || !validation.offerId) {
    return originalItem;
  }

  return {
    ...originalItem,
    offerApplied: true,
    offerBadgeSnapshot: validation.offerBadge,
    offerNameSnapshot: validation.offerName,
    originalPriceSnapshot: validation.originalPrice?.toString(),
    discountPercentage: validation.discountPercentage,
    discountAmount: validation.discountAmount,
    promotionDetailsSnapshot: validation.promotionDetails 
      ? JSON.stringify(validation.promotionDetails) 
      : null
  };
}

/**
 * Validate multiple products in a cart
 */
export async function validateOffersForCart(
  items: Array<{
    productId: string;
    quantity: number;
    price: number;
  }>,
  marketplaceUserId: number | null,
  tx: Prisma.TransactionClient
): Promise<Map<string, OfferValidationResult>> {
  const results = new Map<string, OfferValidationResult>();
  const orderTotal = items.reduce((sum, item) => sum + (item.price * item.quantity), 0);

  for (const item of items) {
    const validation = await validateOfferForProduct(
      item.productId,
      marketplaceUserId,
      orderTotal,
      item.quantity,
      tx
    );
    results.set(item.productId, validation);
  }

  return results;
}

/**
 * Update product prices after offer deactivation
 * This function resets product prices to their original values when offers are deactivated
 * Only affects products that are specifically associated with the deactivated offer
 */
async function updateProductPricesAfterOfferDeactivation(
  tx: Prisma.TransactionClient, 
  offerId: string
): Promise<void> {
  try {
    // Get the offer and its associated products
    const offer = await tx.offer.findUnique({
      where: { id: offerId },
      select: { 
        userId: true,
        offerProducts: {
          select: { productId: true }
        }
      }
    });

    if (!offer) return;

    // Get only the products that are specifically associated with this offer
    const productIds = offer.offerProducts.map((op: { productId: string }) => op.productId);
    
    if (productIds.length === 0) return;

    // Get products with originalSellingPrice set that are associated with this specific offer
    const productsWithOriginalPrices = await tx.product.findMany({
      where: {
        productId: { in: productIds },
        userId: offer.userId,
            variantOptions: {
              some: {
                originalSellingPrice: {
                  not: ''
                }
              }
            }
          },
      include: { 
        variantOptions: true, 
        variants: true 
      }
    });

    // Reset prices only for variants of products associated with this specific offer
    for (const product of productsWithOriginalPrices) {
      // Reset variantOptions (new structure)
      const variantOptions = (product as { variantOptions: Array<{ id: number; originalSellingPrice: string | null }> }).variantOptions || [];
      for (const variantOption of variantOptions) {
        if (variantOption.originalSellingPrice && variantOption.originalSellingPrice !== '') {
          await tx.variantOption.update({
            where: { id: variantOption.id },
            data: {
              sellingPrice: variantOption.originalSellingPrice,
              originalSellingPrice: ''
            }
          });
        }
      }
      
    }
  } catch (error) {
    // Error handled silently - don't fail the order
  }
}

/**
 * Compute offer startDate and endDate from dateRanges
 * Uses earliest startDate and latest endDate from active date ranges (or all ranges if none are active)
 * Returns null for both dates if no date ranges exist to represent "no date"
 * @param dateRanges - Array of date ranges
 * @returns Object with startDate and endDate as ISO strings or null
 */
export function computeOfferDates(dateRanges: Array<{
  startDate: string;
  endDate: string;
  isActive: boolean;
}>): { startDate: string | null; endDate: string | null } {
  let calculatedStartDate: string | null = null;
  let calculatedEndDate: string | null = null;
  
  if (dateRanges.length > 0) {
    const activeDateRanges = dateRanges.filter(dr => dr.isActive);
    if (activeDateRanges.length > 0) {
      const startDates = activeDateRanges.map(dr => new Date(dr.startDate).getTime());
      const endDates = activeDateRanges.map(dr => new Date(dr.endDate).getTime());
      calculatedStartDate = new Date(Math.min(...startDates)).toISOString();
      calculatedEndDate = new Date(Math.max(...endDates)).toISOString();
    } else {
      // If no active date ranges, use all date ranges
      const startDates = dateRanges.map(dr => new Date(dr.startDate).getTime());
      const endDates = dateRanges.map(dr => new Date(dr.endDate).getTime());
      calculatedStartDate = new Date(Math.min(...startDates)).toISOString();
      calculatedEndDate = new Date(Math.max(...endDates)).toISOString();
    }
  }
  
  return { startDate: calculatedStartDate, endDate: calculatedEndDate };
}


