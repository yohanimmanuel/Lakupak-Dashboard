import type { Prisma, PrismaClient } from '@/lib/db';
import { parseNumberByCurrency } from '@/config/currencyConfig';

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
 * Deactivate expired offers based on main dates and date ranges
 * This function should be called periodically or when checking offers
 */
export async function deactivateExpiredOffers(
  tx: Prisma.TransactionClient | PrismaClient,
  userId?: number
): Promise<{ deactivatedCount: number; affectedUserIds: number[] }> {
  try {
    const now = new Date();
    const affectedUserIds = new Set<number>();
    let deactivatedCount = 0;

    // Get all active offers (optionally filtered by userId)
    const whereClause: Prisma.OfferWhereInput = {
      status: 'active',
    };
    
    if (userId) {
      whereClause.userId = userId;
    }

    const activeOffers = await tx.offer.findMany({
      where: whereClause,
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

    const offersToDeactivate: string[] = [];

    for (const offer of activeOffers) {
      // Note: Offers don't have main dates - only date ranges
      // Date ranges are NOT used for auto-deactivation
      // Date ranges can extend beyond main offer dates for flexibility
      // When date ranges expire, the offer remains active but UI actions are blocked

      // Check if at least one discount type is active
      const hasActiveDiscountType = offer.offerDiscountTypes.some(dt => dt.isActive === true);
      if (!hasActiveDiscountType) {
        offersToDeactivate.push(offer.id);
        if (offer.userId) affectedUserIds.add(offer.userId);
        continue;
      }
    }

    // Deactivate expired offers
    if (offersToDeactivate.length > 0) {
      await tx.offer.updateMany({
        where: {
          id: { in: offersToDeactivate },
        },
        data: {
          status: 'inactive',
        },
      });

      deactivatedCount = offersToDeactivate.length;
      
      // Restore product prices for all affected users
      // This ensures prices are restored when offers expire
      for (const affectedUserId of affectedUserIds) {
        await updateProductPricesFromOffers(tx, affectedUserId);
      }
    }

    return {
      deactivatedCount,
      affectedUserIds: Array.from(affectedUserIds),
    };
  } catch (error) {
    // Silently handle errors - deactivation is non-critical
    return {
      deactivatedCount: 0,
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
  
  const now = new Date();
  // Normalize to start of day for date-only comparisons
  const nowStartOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  
  return dateRanges.some(range => {
    if (!range.isActive) return false;
    
    // Convert to Date objects (they come as strings from database)
    const startDate = new Date(range.startDate);
    const endDate = new Date(range.endDate);
    
    // Normalize to start of day for date-only comparisons
    const rangeStart = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
    const rangeEnd = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate());
    
    // Check if current date is within range (inclusive)
    return rangeStart <= nowStartOfDay && nowStartOfDay <= rangeEnd;
  });
}

export async function updateProductPricesFromOffers(
  tx: Prisma.TransactionClient | PrismaClient,
  userId: number,
): Promise<void> {
  try {
    // Optimization: Only fetch products that have offers (much faster)
    // Fetch all and manually deduplicate for reliability
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
    const productIds = Array.from(new Set(allOfferProducts.map(p => p.productId)));

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

    const now = new Date();
    const nowStartOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    // Optimization: Fetch all active offers for these products in a single query
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

    // Build a map of productId -> offers for fast lookup
    const offersByProductId = new Map<string, typeof allOffers>();
    for (const offer of allOffers) {
      for (const offerProduct of offer.offerProducts) {
        if (!offersByProductId.has(offerProduct.productId)) {
          offersByProductId.set(offerProduct.productId, []);
        }
        offersByProductId.get(offerProduct.productId)!.push(offer);
      }
    }

    for (const product of products) {
      // Get offers for this product from the pre-fetched map
      const productOffers = offersByProductId.get(product.productId) || [];

      // Filter offers using the same logic as marketplace query
      const validProductOffers = productOffers.filter(offer => {
        // Check date ranges using the same function as marketplace
        const hasActiveDateRange = isWithinActiveDateRange(offer.dateRanges || []);
        if (!hasActiveDateRange) {
          return false;
        }
        
        // Check if at least one discount type is active
        return offer.offerDiscountTypes.some(dt => dt.isActive === true);
      });

      if (product.variantOptions && product.variantOptions.length > 0) {
        // Batch all variant option updates for this product
        const variantUpdates = product.variantOptions.map(variantOption => {
          const currentSellingPrice = parseNumberByCurrency(variantOption.sellingPrice, 'IDR');
          const storedOriginalPrice = variantOption.originalSellingPrice
            ? parseNumberByCurrency(variantOption.originalSellingPrice, 'IDR')
            : null;

          const trueOriginalPrice = storedOriginalPrice ?? currentSellingPrice;

          let finalPrice = trueOriginalPrice;
          let hasOffer = false;

          // Consider ALL valid offers and find the best discount across all of them
          if (validProductOffers.length > 0) {
            let bestDiscountAmount = 0;
            let bestDiscountType: { discountType: string; discountValue: number } | null = null;

            // Check all offers to find the best discount
            for (const offer of validProductOffers) {
              for (const discountType of offer.offerDiscountTypes) {
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
            }

            if (bestDiscountType && bestDiscountAmount > 0) {
              if (bestDiscountType.discountType === 'percentage') {
                finalPrice = trueOriginalPrice * (1 - bestDiscountType.discountValue / 100);
              } else if (bestDiscountType.discountType === 'fixed') {
                finalPrice = Math.max(0, trueOriginalPrice - bestDiscountType.discountValue);
              }
              hasOffer = true;
            } else {
              finalPrice = trueOriginalPrice;
              hasOffer = false;
            }
          } else {
            finalPrice = trueOriginalPrice;
            hasOffer = false;
          }

          return tx.variantOption.update({
            where: { id: variantOption.id },
            data: {
              sellingPrice: String(Math.round(finalPrice)),
              originalSellingPrice: hasOffer ? String(Math.round(trueOriginalPrice)) : null,
            },
          });
        });

        // Execute all updates for this product in parallel
        await Promise.all(variantUpdates);
      }
    }
  } catch (error) {
    console.error('[MarketplaceMetrics] Price update failed for userId:', userId, error);
    // Continue despite errors to avoid blocking offer operations
  }
}

