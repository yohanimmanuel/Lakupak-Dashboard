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
  variantOptionId?: number;
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

export async function broadcastProductStockUpdates(productIdsInput: string[]): Promise<void> {
  try {
    const productIds = Array.from(new Set(productIdsInput.map((id) => String(id).trim()).filter(Boolean)));
    if (productIds.length === 0) return;
    // The product list query is cached. Clear each seller's cache before the
    // WebSocket event prompts clients to force-fetch, otherwise the table can
    // briefly render the pre-deduction stock while the catalog shows fresh data.
    const products = await prisma.product.findMany({
      where: { productId: { in: productIds } },
      select: { userId: true },
    });
    const ownerIds = Array.from(new Set(products.map((product) => product.userId).filter((id): id is number => id != null)));
    const { invalidateProductCache } = await import('@/lib/queryCache');
    await Promise.all(ownerIds.map((ownerId) => invalidateProductCache(ownerId)));
    await broadcastProductUpdate(productIds);
  } catch {
    // best-effort
  }
}

export async function broadcastSoldCountUpdatesForOrders(orderIds: string[]): Promise<void> {
  try {
    const uniqueOrderIds = Array.from(new Set(orderIds.map((id) => String(id).trim()).filter(Boolean)));
    if (uniqueOrderIds.length === 0) return;
    const orderItems = await prisma.orderItem.findMany({
      where: { orderId: { in: uniqueOrderIds } },
      select: { productId: true },
    });
    const productIds = orderItems
      .map((item: { productId: string | null }) => item.productId)
      .filter((id: string | null): id is string => Boolean(id));
    await broadcastProductStockUpdates(productIds);
  } catch {
    // best-effort
  }
}

export async function broadcastSoldCountUpdates(orderId: string): Promise<void> {
  return broadcastSoldCountUpdatesForOrders([orderId]);
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

  // Stable lock order across concurrent order updates that share SKUs.
  const orderedItems = [...items].sort((a, b) => {
    const aKey = a.variantOptionId ?? a.variantId ?? 0;
    const bKey = b.variantOptionId ?? b.variantId ?? 0;
    if (aKey !== bKey) return aKey - bKey;
    return String(a.productId ?? '').localeCompare(String(b.productId ?? ''));
  });

  for (const orderItem of orderedItems) {
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
        variantOptionId: variantToRestore.id,
      });
    }
  }

  return jobs;
}


export class InsufficientOrderStockError extends Error {
  readonly productId: string;
  readonly required: number;
  readonly available: number;

  constructor(productName: string, productId: string, required: number, available: number) {
    super(`Insufficient stock for ${productName}. Required: ${required} pieces, available: ${available}.`);
    this.name = 'InsufficientOrderStockError';
    this.productId = productId;
    this.required = required;
    this.available = available;
  }
}

/**
 * Deduct reserved stock from the exact variant recorded on each order item.
 * The conditional decrement is the concurrency guard: a request cannot push
 * inventory below zero. Call inside the same transaction as the order update.
 */
export async function deductStockForOrderItems(
  tx: Prisma.TransactionClient,
  items: RestorableOrderItem[],
): Promise<StockNotificationJob[]> {
  const jobs: StockNotificationJob[] = [];
  const orderedItems = [...items].sort((a, b) => {
    const aKey = a.variantOptionId ?? a.variantId ?? 0;
    const bKey = b.variantOptionId ?? b.variantId ?? 0;
    if (aKey !== bKey) return aKey - bKey;
    return String(a.productId ?? '').localeCompare(String(b.productId ?? ''));
  });

  for (const orderItem of orderedItems) {
    if (!orderItem.productId) continue;
    const required = calculateTotalQuantityWithPromotions(orderItem);
    const product = await tx.product.findFirst({
      where: { productId: orderItem.productId },
      include: { variantOptions: true, variants: true },
    });
    if (!product) continue;

    let variant = orderItem.variantOptionId
      ? product.variantOptions.find((candidate: { id: number }) => candidate.id === orderItem.variantOptionId) ?? null
      : null;
    if (!variant && orderItem.variantId) {
      variant = product.variantOptions.find((candidate: { id: number }) => candidate.id === orderItem.variantId) ?? null;
    }
    if (!variant) {
      console.warn('[Orders] Stock deduct skipped: variant not found', JSON.stringify({
        productId: orderItem.productId,
        variantOptionId: orderItem.variantOptionId ?? null,
        variantId: orderItem.variantId ?? null,
      }));
      continue;
    }

    const previousStock = Number(variant.stockQuantity) || 0;
    const lowStockThreshold = Number(variant.lowStockThreshold) || 0;
    const result = await tx.variantOption.updateMany({
      where: { id: variant.id, stockQuantity: { gte: required } },
      data: { stockQuantity: { decrement: required } },
    });
    if (result.count === 0) {
      const current = await tx.variantOption.findUnique({
        where: { id: variant.id },
        select: { stockQuantity: true },
      });
      throw new InsufficientOrderStockError(
        variant.variantName ? `${product.name} (${variant.variantName})` : product.name,
        product.productId,
        required,
        current?.stockQuantity ?? previousStock,
      );
    }

    const after = await tx.variantOption.findUnique({
      where: { id: variant.id },
      select: { stockQuantity: true, stockStatus: true },
    });
    const newStock = after?.stockQuantity ?? Math.max(0, previousStock - required);
    const nextStatus = newStock <= 0
      ? 'Out of Stock'
      : lowStockThreshold > 0 && newStock <= lowStockThreshold
        ? 'Low Stock'
        : 'In Stock';
    if (after && nextStatus !== after.stockStatus) {
      await tx.variantOption.update({ where: { id: variant.id }, data: { stockStatus: nextStatus } });
    }

    if (product.userId) {
      jobs.push({
        userId: product.userId,
        productId: product.productId,
        productName: product.name,
        previousStock,
        newStock,
        lowStockThreshold,
        variantName: variant.variantName || undefined,
        variantOptionId: variant.id,
      });
    }
  }

  return jobs;
}

/** True when pricing was never sent, or any line was updated after the last notify. */
export function isPricingNotifyAllowed(
  pricingSentAt: Date | string | null | undefined,
  itemUpdatedAts: Array<Date | string | null | undefined>,
): boolean {
  if (pricingSentAt == null) return true;
  const sentMs = new Date(pricingSentAt).getTime();
  if (!Number.isFinite(sentMs)) return true;
  return itemUpdatedAts.some((updatedAt) => {
    if (updatedAt == null) return false;
    const ms = new Date(updatedAt).getTime();
    return Number.isFinite(ms) && ms > sentMs;
  });
}

