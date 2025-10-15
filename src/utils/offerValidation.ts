/**
 * Offer Validation and Tracking Utilities
 * Handles offer validation, usage tracking, and snapshot creation for orders
 */

import { prisma } from '@/lib/db';
import type { Prisma } from '@prisma/client';

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
  };
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
  packageQuantity?: number // Add package quantity for buy_x_get_y calculations
): Promise<OfferValidationResult> {
  try {
    // Find active offers for this product
    const activeOffers = await tx.offer.findMany({
      where: {
        status: 'active',
        startDate: { lte: new Date() },
        endDate: { gte: new Date() },
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
        }
      }
    });

    if (activeOffers.length === 0) {
      return { isValid: false, error: 'No active offers found for this product' };
    }

    // Get the first (highest priority) offer
    const offer = activeOffers[0];
    const product = offer.offerProducts[0].product;
    const originalPrice = parseFloat(product.originalSellingPrice || product.sellingPrice);

    // Try each discount type in priority order and collect all applicable discounts/promotions
    let bestDiscountAmount = 0;
    let bestDiscountPercentage = 0;
    let bestDiscountTypeId = '';
    let promotionDetails = undefined;
    let hasValidDiscount = false;

    for (const discountType of offer.offerDiscountTypes) {
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
      } else if (discountType.discountType === 'fixed') {
        discountAmount = discountType.discountValue;
        
        // Keep the best discount
        if (discountAmount > bestDiscountAmount) {
          bestDiscountAmount = discountAmount;
          bestDiscountPercentage = 0;
          bestDiscountTypeId = discountType.id;
          hasValidDiscount = true;
        }
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
          
          promotionDetails = {
            minQuantity: minQuantity,
            freeQuantity: totalFreeItems,
            description: discountType.description || `Buy ${minQuantity}, get ${freeItemsPerSet} free`
          };
        }
      }
    }

    // If we found any valid discount or promotion, return the result
    if (hasValidDiscount || promotionDetails) {
      const finalPrice = originalPrice - bestDiscountAmount;

      // Determine offer badge
      const offerBadge = getOfferBadge(offer.offerDiscountTypes);

      return {
        isValid: true,
        offerId: offer.id,
        offerName: offer.name,
        discountTypeId: bestDiscountTypeId || offer.offerDiscountTypes[0].id,
        discountAmount: bestDiscountAmount,
        discountPercentage: bestDiscountPercentage,
        offerBadge,
        originalPrice,
        finalPrice,
        promotionDetails
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
 * Validate usage limits for an offer discount type
 */
async function validateUsageLimits(
  offerId: string,
  discountTypeId: string,
  marketplaceUserId: number | null,
  discountType: {
    maxUsage?: number | null;
    // perCustomerLimit removed
  },
  tx: Prisma.TransactionClient
): Promise<{ isValid: boolean; error?: string }> {
  // Check overall max usage for this discount type
  if (discountType.maxUsage && discountType.maxUsage > 0) {
    const totalUsage = await tx.offerUsageTracking.aggregate({
      where: {
        offerId: offerId,
        discountTypeId: discountTypeId
      },
      _sum: {
        usageCount: true
      }
    });

    const currentUsage = totalUsage._sum.usageCount || 0;
    console.log(`[DEBUG] validateUsageLimits - offerId: ${offerId}, discountTypeId: ${discountTypeId}, currentUsage: ${currentUsage}, maxUsage: ${discountType.maxUsage}`);
    // Check if the current usage has already reached or exceeded the limit
    if (currentUsage >= discountType.maxUsage) {
      // Deactivate only this specific discount type, not the entire offer
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
      
      return { 
        isValid: false, 
        error: `This offer has reached its maximum usage limit of ${discountType.maxUsage} (current usage: ${currentUsage})` 
      };
    }
  }

  // Per-customer usage limit check removed

  return { isValid: true };
}

/**
 * Check and update offer statuses based on usage limits
 * This function should be called periodically to ensure offers are properly deactivated
 */
export async function updateOfferStatusesBasedOnLimits(): Promise<void> {
  try {
    await prisma.$transaction(async (tx) => {
      // Get all active offers
      const activeOffers = await tx.offer.findMany({
        where: { status: 'active' },
        include: {
          offerDiscountTypes: {
            where: { isActive: true }
          }
        }
      });

      for (const offer of activeOffers) {
        for (const discountType of offer.offerDiscountTypes) {
          // Check if max usage limit is reached
          if (discountType.maxUsage && discountType.maxUsage > 0) {
            const totalUsage = await tx.offerUsageTracking.aggregate({
              where: {
                offerId: offer.id,
                discountTypeId: discountType.id
              },
              _sum: {
                usageCount: true
              }
            });

            const currentUsage = totalUsage._sum.usageCount || 0;
            if (currentUsage >= discountType.maxUsage) {
              // Deactivate only this specific discount type
              await tx.offerDiscountType.update({
                where: { id: discountType.id },
                data: { isActive: false }
              });
              
              // Check if ALL discount types are now inactive, then deactivate the entire offer
              const remainingActiveDiscountTypes = await tx.offerDiscountType.count({
                where: {
                  offerId: offer.id,
                  isActive: true
                }
              });
              
              if (remainingActiveDiscountTypes === 0) {
                await tx.offer.update({
                  where: { id: offer.id },
                  data: { status: 'inactive' }
                });
              }
            }
          }
        }
      }
    });
  } catch (error) {
    // Log error but don't throw - this is a maintenance function
    // Error handled silently
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
    console.log(`[DEBUG] trackOfferUsage - offerId: ${offerId}, discountTypeId: ${discountTypeId}, marketplaceUserId: ${marketplaceUserId}`);
    // Track usage for marketplace user (or general usage if no marketplaceUserId)
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
      // First check if record exists
      const existingUsage = await tx.offerUsageTracking.findUnique({
        where: {
          offerId_discountTypeId_marketplaceUserId: {
            offerId: offerId,
            discountTypeId: discountTypeId,
            marketplaceUserId: null
          }
        }
      });

      if (existingUsage) {
        // Update existing record
        await tx.offerUsageTracking.update({
          where: { id: existingUsage.id },
          data: {
            usageCount: { increment: 1 },
            lastUsedAt: new Date()
          }
        });
      } else {
        // Create new record
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

    // Update offer totals
    await tx.offer.update({
      where: { id: offerId },
      data: {
        totalUsage: { increment: 1 },
        totalDiscountGiven: { increment: discountAmount }
      }
    });

    // Check if this usage pushes the offer over its limits and deactivate if needed
    const discountType = await tx.offerDiscountType.findUnique({
      where: { id: discountTypeId },
      select: { maxUsage: true }
    });

    if (discountType) {
      // Check max usage limit
      if (discountType.maxUsage && discountType.maxUsage > 0) {
        const totalUsage = await tx.offerUsageTracking.aggregate({
          where: {
            offerId: offerId,
            discountTypeId: discountTypeId
          },
          _sum: {
            usageCount: true
          }
        });

        const currentUsage = totalUsage._sum.usageCount || 0;
        console.log(`[DEBUG] trackOfferUsage - After tracking, currentUsage: ${currentUsage}, maxUsage: ${discountType.maxUsage}`);
        
        if (currentUsage >= discountType.maxUsage) {
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
        }
      }
    }

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

