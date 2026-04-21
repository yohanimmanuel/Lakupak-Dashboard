import { prisma } from '@/lib/db';
import { broadcastProductUpdate } from '@/utils/websocketBroadcast';
import { calculateOrderItemPromotion } from '@/utils/promotionUtils';

export const decimalToNumber = (value: unknown): number => {
  if (value === null || value === undefined) return 0;
  if (typeof value === 'number') return value;
  if (typeof value === 'string') return parseFloat(value) || 0;
  if (typeof value === 'object' && value !== null) {
    if (typeof (value as { toNumber?: () => number }).toNumber === 'function') {
      return (value as { toNumber: () => number }).toNumber();
    }
    if (typeof (value as { toString?: () => string }).toString === 'function') {
      return parseFloat((value as { toString: () => string }).toString()) || 0;
    }
  }
  return Number(value) || 0;
};

export async function broadcastSoldCountUpdates(orderId: string): Promise<void> {
  try {
    const orderItems = await prisma.orderItem.findMany({
      where: { orderId },
      select: { productId: true },
    });
    const productIds = Array.from(
      new Set(
        orderItems
          .map((item: { productId: string | null }) => item.productId)
          .filter((id: string | null): id is string => Boolean(id)),
      ),
    ) as string[];
    if (productIds.length > 0) {
      await broadcastProductUpdate(productIds);
    }
  } catch {
    // best-effort
  }
}

export function calculateTotalQuantityWithPromotions(orderItem: {
  packageQuantity?: number | null;
  piecesPerPackage?: number | null;
  promotionDetailsSnapshot?: string | null;
  moqSnapshot?: number | null;
}): number {
  const orderedQty = Math.max(1, orderItem.packageQuantity || 1);
  const piecesPerPackage = Math.max(1, orderItem.piecesPerPackage || 1);
  const orderedPieces = orderedQty * piecesPerPackage;
  let totalQuantity = orderedPieces;

  if (orderItem.promotionDetailsSnapshot && typeof orderItem.promotionDetailsSnapshot === 'string') {
    try {
      const promotionGift = calculateOrderItemPromotion(
        orderItem.promotionDetailsSnapshot,
        orderedQty,
        piecesPerPackage,
        orderItem.moqSnapshot,
      );
      if (
        promotionGift &&
        typeof promotionGift.freeQty === 'number' &&
        !isNaN(promotionGift.freeQty) &&
        promotionGift.freeQty > 0
      ) {
        totalQuantity = orderedPieces + promotionGift.freeQty;
      }
    } catch {
      // ignore
    }
  }

  return totalQuantity;
}

