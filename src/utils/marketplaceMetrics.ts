import type { Prisma, PrismaClient } from '@/lib/db';
import { parseNumberByCurrency } from '@/config/currencyConfig';
import { getTodayBoundaries, getStartOfDay, getEndOfDay } from '@/lib/dateUtils';

export const SOLD_COUNT_EXCLUDED_STATUSES = ['Pending', 'Cancelled', 'Returned'] as const;

export async function calculateSoldCounts(
  prisma: PrismaClient,
  productIds: string[],
  excludedStatuses: readonly string[] = SOLD_COUNT_EXCLUDED_STATUSES,
): Promise<Map<string, string>> {
  if (!productIds.length) {
    return new Map();
  }

  const orderItems = await prisma.orderItem.findMany({
    where: {
      productId: { in: productIds },
      order: {
        orderStatus: { notIn: excludedStatuses as string[] },
      },
    },
    select: {
      productId: true,
      packageQuantity: true,
      piecesPerPackage: true,
    },
  });

  const soldCounts = new Map<string, number>();

  for (const item of orderItems) {
    if (!item.productId) {
      continue;
    }

    const packageQuantity = Number(item.packageQuantity ?? 0);
    const piecesPerPackage = Number(item.piecesPerPackage ?? 0);

    let piecesSold = 0;
    if (packageQuantity > 0 && piecesPerPackage > 0) {
      piecesSold = packageQuantity * piecesPerPackage;
    } else if (packageQuantity > 0) {
      piecesSold = packageQuantity;
    } else {
      piecesSold = 1;
    }

    soldCounts.set(item.productId, (soldCounts.get(item.productId) ?? 0) + piecesSold);
  }

  const result = new Map<string, string>();
  soldCounts.forEach((value, key) => {
    result.set(key, String(value));
  });

  return result;
}

/**
 * Automatically manage offer lifecycle based on date ranges
 * - Deactivate 'active' offers that have expired → set to 'inactive'
 * - Convert 'active' offers with future dates → set to 'scheduled'
 * - Activate 'scheduled' offers when their start date arrives → set to 'active'
 * - Never touch 'inactive' offers (manually deactivated or already expired)
 */
export async function deactivateExpiredOffers(
  tx: Prisma.TransactionClient | PrismaClient,
  userId?: number
): Promise<{ deactivatedCount: number; activatedCount: number; affectedUserIds: number[] }> {
  try {
    const { startOfToday, endOfToday } = getTodayBoundaries();
    const affectedUserIds = new Set<number>();
    let deactivatedCount = 0;
    let activatedCount = 0;

    // STEP 1: Process 'active' offers - check if they should be expired OR scheduled
    const activeWhereClause: Prisma.OfferWhereInput = {
      status: 'active',
    };
    
    if (userId) {
      activeWhereClause.userId = userId;
    }

    const activeOffers = await tx.offer.findMany({
      where: activeWhereClause,
      include: {
        dateRanges: true,
        offerDiscountTypes: true,
        offerProducts: {
          select: {
            productId: true,
          },
        },
      },
    });

    const offersToExpire: string[] = [];
    const offersToSchedule: string[] = [];

    for (const offer of activeOffers) {
      // Check if at least one discount type is active
      const hasActiveDiscountType = offer.offerDiscountTypes.some(dt => dt.isActive === true);
      
      if (!hasActiveDiscountType) {
        offersToExpire.push(offer.id);
        if (offer.userId) affectedUserIds.add(offer.userId);
        continue;
      }

      // Check date ranges
      if (offer.dateRanges && offer.dateRanges.length > 0) {
        const activeDateRanges = offer.dateRanges.filter(dr => dr.isActive);
        
        if (activeDateRanges.length === 0) {
          offersToExpire.push(offer.id);
          if (offer.userId) affectedUserIds.add(offer.userId);
          continue;
        }

        // Check if ALL active date ranges have expired
          const allExpired = activeDateRanges.every(range => {
          const rangeEnd = getEndOfDay(new Date(range.endDate));
          return startOfToday > rangeEnd; // Today is after end date
          });
          
          if (allExpired) {
          offersToExpire.push(offer.id);
          if (offer.userId) affectedUserIds.add(offer.userId);
          continue;
        }

        // Check if ALL active date ranges are in the future (not yet started)
        const allFuture = activeDateRanges.every(range => {
          const rangeStart = getStartOfDay(new Date(range.startDate));
          return endOfToday < rangeStart; // Today is before start date
        });
        
        if (allFuture) {
          offersToSchedule.push(offer.id);
        if (offer.userId) affectedUserIds.add(offer.userId);
        }
      }
    }

    // Convert expired offers to 'inactive' status
    if (offersToExpire.length > 0) {
      await tx.offer.updateMany({
        where: {
          id: { in: offersToExpire },
        },
        data: {
          status: 'inactive',
        },
      });

      deactivatedCount += offersToExpire.length;
      
      // Restore product prices for expired offers
      for (const affectedUserId of affectedUserIds) {
        await updateProductPricesFromOffers(tx, affectedUserId);
      }
    }

    // Convert future offers to 'scheduled' status
    if (offersToSchedule.length > 0) {
      await tx.offer.updateMany({
        where: {
          id: { in: offersToSchedule },
        },
        data: {
          status: 'scheduled',
        },
      });

      deactivatedCount += offersToSchedule.length;
      
      // Restore product prices for scheduled offers (they shouldn't apply yet)
      for (const affectedUserId of affectedUserIds) {
        await updateProductPricesFromOffers(tx, affectedUserId);
      }
    }

    // STEP 2: Activate 'scheduled' offers that have reached their start date
    const scheduledWhereClause: Prisma.OfferWhereInput = {
      status: 'scheduled',
    };
    
    if (userId) {
      scheduledWhereClause.userId = userId;
    }

    const scheduledOffers = await tx.offer.findMany({
      where: scheduledWhereClause,
      include: {
        dateRanges: true,
        offerDiscountTypes: true,
        offerProducts: {
          select: {
            productId: true,
          },
        },
      },
    });

    const offersToActivate: string[] = [];

    for (const offer of scheduledOffers) {
      let shouldActivate = false;

      // Check if at least one discount type is active
      const hasActiveDiscountType = offer.offerDiscountTypes.some(dt => dt.isActive === true);
      
      if (hasActiveDiscountType && offer.dateRanges && offer.dateRanges.length > 0) {
        // Check if ANY active date range has started (and not expired)
        const hasStartedDateRange = offer.dateRanges.some(range => {
          if (!range.isActive) return false;
          
          const rangeStart = getStartOfDay(new Date(range.startDate));
          const rangeEnd = getEndOfDay(new Date(range.endDate));
          
          // Started: today >= start date AND today <= end date
          return startOfToday >= rangeStart && startOfToday <= rangeEnd;
        });
        
        if (hasStartedDateRange) {
          shouldActivate = true;
        }
      }

      if (shouldActivate) {
        offersToActivate.push(offer.id);
        if (offer.userId) affectedUserIds.add(offer.userId);
      }
    }

    // Activate scheduled offers that have reached their start date
    if (offersToActivate.length > 0) {
      await tx.offer.updateMany({
        where: {
          id: { in: offersToActivate },
        },
        data: {
          status: 'active',
        },
      });

      activatedCount = offersToActivate.length;
      
      // Apply offer prices for activated offers
      for (const affectedUserId of affectedUserIds) {
        await updateProductPricesFromOffers(tx, affectedUserId);
      }
    }

    return {
      deactivatedCount,
      activatedCount,
      affectedUserIds: Array.from(affectedUserIds),
    };
  } catch (error) {
    // Silently handle errors - lifecycle management is non-critical
    return {
      deactivatedCount: 0,
      activatedCount: 0,
      affectedUserIds: [],
    };
  }
}

/**
 * Helper function to check if current time is within any active date range
 * Matches marketplace query logic exactly
 */
function isWithinActiveDateRange(dateRanges: Array<{ startDate: Date | string; endDate: Date | string; isActive: boolean }>): boolean {
  if (!dateRanges || dateRanges.length === 0) {
    return true; // No date ranges means offer is always active
  }
  
  const { startOfToday, endOfToday } = getTodayBoundaries();
  
  return dateRanges.some(range => {
    if (!range.isActive) return false;
    
    // Convert to Date objects (they come as strings from database)
    const startDate = new Date(range.startDate);
    const endDate = new Date(range.endDate);
    
    // Normalize to start/end of day in business timezone
    const rangeStart = getStartOfDay(startDate);
    const rangeEnd = getEndOfDay(endDate);
    
    // Check if today intersects with the date range
    return !(rangeEnd < startOfToday || rangeStart > endOfToday);
  });
}

export async function updateProductPricesFromOffers(
  tx: Prisma.TransactionClient | PrismaClient,
  userId: number,
  targetProductIds?: string[], // Optional: only update specific products (for targeted updates)
): Promise<void> {
  try {
    let productIds: string[];
    
    if (targetProductIds && targetProductIds.length > 0) {
      // Targeted update: only update the specified products
      productIds = targetProductIds;
    } else {
      // Full update: fetch all products that have offers
    const allOfferProducts = await tx.offerProduct.findMany({
      where: {
        offer: {
          userId,
        },
      },
      select: {
        productId: true,
      },
    });

    if (allOfferProducts.length === 0) {
      return;
    }

    // Use Set to ensure unique product IDs
      productIds = Array.from(new Set(allOfferProducts.map(p => p.productId)));
    }

    // Fetch only products that have offers
    const products = await tx.product.findMany({
      where: { 
        userId,
        productId: { in: productIds },
      },
      include: {
        variants: true,
        variantOptions: true,
      },
    });

    if (products.length === 0) {
      return;
    }

    // Optimization: Fetch all active offers for these products in a single query
    // Business rule: One product can only be in ONE offer at a time (1:1 relationship)
    // Only 'active' offers apply discounts (not 'scheduled', 'inactive', or 'expired')
    const allOffers = await tx.offer.findMany({
      where: {
        userId,
        status: 'active',
        offerProducts: {
          some: { productId: { in: productIds } },
        },
      },
      include: {
        offerDiscountTypes: true,
        dateRanges: true,
        offerProducts: {
          select: {
            productId: true,
          },
        },
      },
    });

    // Build a map of productId -> THE offer for that product (1:1 mapping)
    const offerByProductId = new Map<string, typeof allOffers[0]>();
    for (const offer of allOffers) {
      for (const offerProduct of offer.offerProducts) {
        // Since business rule is 1:1, just set the offer directly
        offerByProductId.set(offerProduct.productId, offer);
      }
    }

    // Collect ALL variant updates from ALL products FIRST
    const allVariantUpdates: Promise<unknown>[] = [];

    for (const product of products) {
      // Get THE offer for this product (should only be one)
      const productOffer = offerByProductId.get(product.productId);

      // Check if the offer is valid (date range and active discount types)
      let isValidOffer = false;
      if (productOffer) {
        const hasActiveDateRange = isWithinActiveDateRange(productOffer.dateRanges || []);
        const hasActiveDiscountType = productOffer.offerDiscountTypes.some(dt => dt.isActive === true);
        isValidOffer = hasActiveDateRange && hasActiveDiscountType;
      }

      if (product.variantOptions && product.variantOptions.length > 0) {
        // Prepare all variant option updates for this product
        const variantUpdates = product.variantOptions.map(variantOption => {
          const currentSellingPrice = parseNumberByCurrency(variantOption.sellingPrice, 'IDR');
          const storedOriginalPrice = variantOption.originalSellingPrice
            ? parseNumberByCurrency(variantOption.originalSellingPrice, 'IDR')
            : null;

          const trueOriginalPrice = storedOriginalPrice ?? currentSellingPrice;

          let finalPrice = trueOriginalPrice;
          let hasOffer = false;

          // Apply the offer discount if valid (1:1 relationship - one product, one offer)
          if (isValidOffer && productOffer) {
            // Find the best discount type from this offer's discount types
            let bestDiscountAmount = 0;
            let bestDiscountType: { discountType: string; discountValue: number } | null = null;

            for (const discountType of productOffer.offerDiscountTypes) {
                if (!discountType.isActive) {
                  continue;
                }

                let discountAmount = 0;

                if (discountType.discountType === 'percentage') {
                  discountAmount = (trueOriginalPrice * discountType.discountValue) / 100;
                } else if (discountType.discountType === 'fixed') {
                  discountAmount = discountType.discountValue;
                }
                // Note: buy_x_get_y doesn't affect price directly, so we skip it here

                if (discountAmount > bestDiscountAmount) {
                  bestDiscountAmount = discountAmount;
                  bestDiscountType = discountType;
              }
            }

            if (bestDiscountType && bestDiscountAmount > 0) {
              if (bestDiscountType.discountType === 'percentage') {
                finalPrice = trueOriginalPrice * (1 - bestDiscountType.discountValue / 100);
              } else if (bestDiscountType.discountType === 'fixed') {
                finalPrice = Math.max(0, trueOriginalPrice - bestDiscountType.discountValue);
              }
              hasOffer = true;
            }
          }

          return tx.variantOption.update({
            where: { id: variantOption.id },
            data: {
              sellingPrice: String(Math.round(finalPrice)),
              originalSellingPrice: hasOffer ? String(Math.round(trueOriginalPrice)) : null,
            },
          });
        });

        // Add this product's variant updates to the batch (don't await yet!)
        allVariantUpdates.push(...variantUpdates);
      }
    }

    // Execute ALL variant updates from ALL products at once - true parallel execution!
    if (allVariantUpdates.length > 0) {
      await Promise.all(allVariantUpdates);
    }
  } catch (error) {
    console.error('[MarketplaceMetrics] Price update failed for userId:', userId, error);
    // Continue despite errors to avoid blocking offer operations
  }
}

