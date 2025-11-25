import { PrismaClient, Prisma } from '@/generated/prisma';
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
        },
      });

      if (product.variantOptions && product.variantOptions.length > 0) {
        for (const variantOption of product.variantOptions) {
          const originalPrice = parseNumberByCurrency(variantOption.sellingPrice, 'IDR');
          const currentOriginalPrice = variantOption.originalSellingPrice
            ? parseNumberByCurrency(variantOption.originalSellingPrice, 'IDR')
            : originalPrice;

          let finalPrice = currentOriginalPrice;
          let hasOffer = false;

          if (productOffers.length > 0) {
            const offer = productOffers[0];
            let bestDiscountAmount = 0;
            let bestDiscountType: typeof offer.offerDiscountTypes[number] | null = null;

            for (const discountType of offer.offerDiscountTypes) {
              if (!discountType.isActive) {
                continue;
              }

              let discountAmount = 0;

              if (discountType.discountType === 'percentage') {
                discountAmount = (currentOriginalPrice * discountType.discountValue) / 100;
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
                finalPrice = currentOriginalPrice * (1 - bestDiscountType.discountValue / 100);
              } else if (bestDiscountType.discountType === 'fixed') {
                finalPrice = Math.max(0, currentOriginalPrice - bestDiscountType.discountValue);
              }
              hasOffer = true;
            } else {
              finalPrice = currentOriginalPrice;
              hasOffer = false;
            }
          } else {
            finalPrice = currentOriginalPrice;
            hasOffer = false;
          }

          await tx.variantOption.update({
            where: { id: variantOption.id },
            data: {
              sellingPrice: String(Math.round(finalPrice)),
              originalSellingPrice: hasOffer ? String(Math.round(currentOriginalPrice)) : null,
            },
          });
        }
      }
    }
  } catch (error) {
    // Silently handle errors - price updates are non-critical
  }
}

