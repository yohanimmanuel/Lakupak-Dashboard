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
      // Check main date range
      if (offer.startDate > now || offer.endDate < now) {
        offersToDeactivate.push(offer.id);
        if (offer.userId) affectedUserIds.add(offer.userId);
        continue;
      }

      // Note: Date ranges are NOT used for auto-deactivation
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

export async function updateProductPricesFromOffers(
  tx: Prisma.TransactionClient | PrismaClient,
  userId: number,
): Promise<void> {
  try {
    const products = await tx.product.findMany({
      where: { userId },
      include: {
        variants: true,
        variantOptions: true,
      },
    });

    const now = new Date();
    const nowStartOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    for (const product of products) {
      const productOffers = await tx.offer.findMany({
        where: {
          userId,
          status: 'active',
          offerProducts: {
            some: { productId: product.productId },
          },
        },
        include: {
          offerDiscountTypes: true,
          dateRanges: true,
        },
      });

      // Filter offers to only include those with valid date ranges
      const validProductOffers = productOffers.filter(offer => {
        // Check main date range
        if (offer.startDate > now || offer.endDate < now) {
          return false;
        }

        // Check date ranges if they exist
        if (offer.dateRanges && offer.dateRanges.length > 0) {
          const hasActiveDateRange = offer.dateRanges.some(range => {
            if (!range.isActive) return false;
            
            const startDate = range.startDate instanceof Date ? range.startDate : new Date(range.startDate);
            const endDate = range.endDate instanceof Date ? range.endDate : new Date(range.endDate);
            
            const rangeStart = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
            const rangeEnd = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate());
            
            return rangeStart <= nowStartOfDay && nowStartOfDay <= rangeEnd;
          });
          
          if (!hasActiveDateRange) {
            return false;
          }
        }

        // Check if at least one discount type is active
        return offer.offerDiscountTypes.some(dt => dt.isActive === true);
      });

      if (product.variantOptions && product.variantOptions.length > 0) {
        for (const variantOption of product.variantOptions) {
          // Get the true original price - preserve it if it exists, otherwise use current sellingPrice as baseline
          // If originalSellingPrice exists, it's the true original price before any discounts
          // If it doesn't exist, the current sellingPrice might already be discounted, so we need to be careful
          const currentSellingPrice = parseNumberByCurrency(variantOption.sellingPrice, 'IDR');
          const storedOriginalPrice = variantOption.originalSellingPrice
            ? parseNumberByCurrency(variantOption.originalSellingPrice, 'IDR')
            : null;

          // Determine the true original price:
          // 1. If originalSellingPrice exists, use it (it's the true original)
          // 2. If not, and sellingPrice > 0, use sellingPrice as the original (no discount applied yet)
          // 3. This prevents price corruption by always preserving the true original
          const trueOriginalPrice = storedOriginalPrice ?? currentSellingPrice;

          let finalPrice = trueOriginalPrice;
          let hasOffer = false;

          if (validProductOffers.length > 0) {
            const offer = validProductOffers[0];
            let bestDiscountAmount = 0;
            let bestDiscountType: typeof offer.offerDiscountTypes[number] | null = null;

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
            } else {
              // No valid discount type, restore to original price
              finalPrice = trueOriginalPrice;
              hasOffer = false;
            }
          } else {
            // No offers, restore to original price
            finalPrice = trueOriginalPrice;
            hasOffer = false;
          }

          // Update prices:
          // - If hasOffer: set sellingPrice to discounted price, set originalSellingPrice to true original
          // - If !hasOffer: restore sellingPrice to true original, clear originalSellingPrice
          await tx.variantOption.update({
            where: { id: variantOption.id },
            data: {
              sellingPrice: String(Math.round(finalPrice)),
              // Set originalSellingPrice only when offer is active (to preserve true original)
              // Clear it when no offer (sellingPrice becomes the original again)
              originalSellingPrice: hasOffer ? String(Math.round(trueOriginalPrice)) : null,
            },
          });
        }
      }
    }
  } catch (error) {
    // Silently handle errors - price updates are non-critical
  }
}

