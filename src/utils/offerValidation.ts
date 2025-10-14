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
  tx: Prisma.TransactionClient
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

    // Try each discount type in priority order
    for (const discountType of offer.offerDiscountTypes) {
      // Check usage limits
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
      let finalPrice = originalPrice;
      let promotionDetails = undefined;

      if (discountType.discountType === 'percentage') {
        discountPercentage = discountType.discountValue;
        discountAmount = (originalPrice * discountPercentage) / 100;
        finalPrice = originalPrice - discountAmount;
      } else if (discountType.discountType === 'fixed') {
        discountAmount = discountType.discountValue;
        discountPercentage = 0; // Don't set percentage for fixed discounts
        finalPrice = Math.max(0, originalPrice - discountAmount);
      } else if (discountType.discountType === 'buy_x_get_y') {
        // For buy_x_get_y, we don't change the price but provide promotion details
        const minQuantity = discountType.minQuantity || 1;
        const freeQuantity = Math.floor(orderQuantity / minQuantity) * (discountType.discountValue || 1);
        promotionDetails = {
          minQuantity: minQuantity,
          freeQuantity: freeQuantity,
          description: discountType.description || `Buy ${minQuantity}, get ${discountType.discountValue || 1} free`
        };
      }

      // Determine offer badge
      const offerBadge = getOfferBadge(offer.offerDiscountTypes);

      return {
        isValid: true,
        offerId: offer.id,
        offerName: offer.name,
        discountTypeId: discountType.id,
        discountAmount,
        discountPercentage,
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
    perCustomerLimit?: number | null;
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
    if (currentUsage >= discountType.maxUsage) {
      return { 
        isValid: false, 
        error: `This offer has reached its maximum usage limit of ${discountType.maxUsage}` 
      };
    }
  }

  // Check per-customer usage limit
  if (discountType.perCustomerLimit && discountType.perCustomerLimit > 0 && marketplaceUserId) {
    const customerUsage = await tx.offerUsageTracking.findUnique({
      where: {
        offerId_discountTypeId_marketplaceUserId: {
          offerId: offerId,
          discountTypeId: discountTypeId,
          marketplaceUserId: marketplaceUserId
        }
      }
    });

    if (customerUsage && customerUsage.usageCount >= discountType.perCustomerLimit) {
      return { 
        isValid: false, 
        error: `You have reached the usage limit for this offer (${discountType.perCustomerLimit} uses per customer)` 
      };
    }
  }

  return { isValid: true };
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
    // Track usage for marketplace user
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
    }

    // Update offer totals
    await tx.offer.update({
      where: { id: offerId },
      data: {
        totalUsage: { increment: 1 },
        totalDiscountGiven: { increment: discountAmount }
      }
    });

  } catch (error) {
    // Don't fail the order if tracking fails, just log it
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

      // Only decrement the total discount given, keep totalUsage as cumulative
      await tx.offer.update({
        where: { id: offer.id },
        data: {
          totalDiscountGiven: { decrement: discountAmount }
        }
      });

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

