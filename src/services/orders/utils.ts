import { prisma } from '@/lib/db';
import { Prisma } from '@/lib/prisma-generated';
import { broadcastProductUpdate } from '@/utils/websocketBroadcast';
import { calculateOrderItemPromotion } from '@/utils/promotionUtils';

/**
 * Order statuses for which stock is NOT considered deducted. Stock is deducted when an
 * order moves FROM one of these TO any other status, and restored on the reverse move.
 */
export const STOCK_NO_DEDUCT_STATUSES = ['Pending', 'Cancelled', 'Returned', 'Failed'] as const;

export type StockNotificationJob = {
  userId: number;
  productId: string;
  productName: string;
  previousStock: number;
  newStock: number;
  lowStockThreshold: number;
  variantName?: string;
};

export type RestorableOrderItem = {
  productId: string | null;
  variantOptionId: number | null;
  variantId: number | null;
  packageQuantity: number | null;
  piecesPerPackage: number | null;
  promotionDetailsSnapshot: string | null;
  moqSnapshot: number | null;
};

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

/**
 * Return reserved stock to the correct variant SKU for each order item, inside the caller's
 * transaction. Used when an order leaves a stock-deducted status (e.g. Confirmed → Cancelled).
 * Mirrors the deduct guard: it only touches the exact variant recorded on the order item and
 * never falls back to the "first variant", to avoid corrupting the wrong SKU. Returns the
 * low-stock notification jobs to be dispatched after the transaction commits.
 */
export async function restoreStockForOrderItems(
  tx: Prisma.TransactionClient,
  items: RestorableOrderItem[],
): Promise<StockNotificationJob[]> {
  const jobs: StockNotificationJob[] = [];

  for (const orderItem of items) {
    if (!orderItem.productId) continue;

    // Calculate total quantity to restore (including free items from promotion)
    const totalQtyToRestore = calculateTotalQuantityWithPromotions(orderItem);

    const productForRestore = await tx.product.findFirst({
      where: { productId: orderItem.productId || '' },
      include: { variantOptions: true, variants: true },
    });

    if (!productForRestore) continue;

    // Find the specific variant to restore stock to
    let variantToRestore: { id: number; stockQuantity?: number; variantName?: string } | null = null;

    // First try variantOptionId (most accurate)
    if (orderItem.variantOptionId) {
      variantToRestore =
        productForRestore.variantOptions.find((v: { id: number }) => v.id === orderItem.variantOptionId) || null;
    }

    // If not found, try variantId
    if (!variantToRestore && orderItem.variantId) {
      variantToRestore =
        productForRestore.variantOptions.find((v: { id: number }) => v.id === orderItem.variantId) || null;
    }

    // Do not fall back to "first variant" because it can update the wrong SKU.
    if (!variantToRestore) {
      console.warn(
        '[Orders] Stock restore skipped: variant not found',
        JSON.stringify({
          productId: orderItem.productId,
          variantOptionId: orderItem.variantOptionId ?? null,
          variantId: orderItem.variantId ?? null,
        }),
      );
      continue;
    }

    const previousStock = variantToRestore.stockQuantity || 0;
    const restored = await tx.variantOption.update({
      where: { id: variantToRestore.id },
      data: {
        stockQuantity: { increment: totalQtyToRestore },
      },
      select: { stockQuantity: true, lowStockThreshold: true, stockStatus: true, variantName: true },
    });
    const newStock = restored.stockQuantity ?? previousStock + totalQtyToRestore;
    const lowStockThreshold = restored.lowStockThreshold || 0;
    let newStockStatus = 'In Stock';
    if (newStock <= 0) {
      newStockStatus = 'Out of Stock';
    } else if (lowStockThreshold > 0 && newStock <= lowStockThreshold) {
      newStockStatus = 'Low Stock';
    }
    if (newStockStatus !== restored.stockStatus) {
      await tx.variantOption.update({
        where: { id: variantToRestore.id },
        data: { stockStatus: newStockStatus },
      });
    }

    if (productForRestore.userId) {
      jobs.push({
        userId: productForRestore.userId,
        productId: productForRestore.productId,
        productName: productForRestore.name,
        previousStock,
        newStock,
        lowStockThreshold,
        variantName: (variantToRestore as { variantName?: string }).variantName || undefined,
      });
    }
  }

  return jobs;
}

