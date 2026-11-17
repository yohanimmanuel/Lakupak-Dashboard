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
 * Reconcile stock for a group of orders with set-based SQL writes. Quantities are
 * aggregated by VariantOption ID, so each affected SKU is written once regardless
 * of how many selected orders contain it. Restores run before deductions.
 */
export async function reconcileBulkOrderStock(
  tx: Prisma.TransactionClient,
  restoreItems: RestorableOrderItem[],
  deductItems: RestorableOrderItem[],
): Promise<StockNotificationJob[]> {
  type VariantSnapshot = {
    id: number;
    productId: number;
    stockQuantity: number;
    lowStockThreshold: number;
    variantName: string;
    product: { productId: string; name: string; userId: number | null };
  };
  type QuantityGroup = { id: number; quantity: number; expectedProductId: string };

  const aggregate = (items: RestorableOrderItem[]): QuantityGroup[] => {
    const grouped = new Map<number, QuantityGroup>();
    for (const item of items) {
      if (!item.productId) continue;
      const variantId = item.variantOptionId ?? item.variantId;
      if (!variantId) continue;
      const current = grouped.get(variantId);
      const quantity = calculateTotalQuantityWithPromotions(item);
      if (current) {
        // A variant ID belongs to exactly one catalog product. Ignore malformed
        // order-line references that pair that ID with another product.
        if (current.expectedProductId !== item.productId) continue;
        current.quantity += quantity;
      } else {
        grouped.set(variantId, { id: variantId, quantity, expectedProductId: item.productId });
      }
    }
    return Array.from(grouped.values());
  };

  const allGroups = [...aggregate(restoreItems), ...aggregate(deductItems)];
  if (allGroups.length === 0) return [];
  const variantIds = Array.from(new Set(allGroups.map((group) => group.id)));

  const loadSnapshots = async (): Promise<Map<number, VariantSnapshot>> => {
    const variants = await tx.variantOption.findMany({
      where: { id: { in: variantIds } },
      select: {
        id: true,
        productId: true,
        stockQuantity: true,
        lowStockThreshold: true,
        variantName: true,
        product: { select: { productId: true, name: true, userId: true } },
      },
    });
    return new Map(variants.map((variant) => [variant.id, variant as VariantSnapshot]));
  };

  const snapshots = await loadSnapshots();
  const jobsByVariant = new Map<number, StockNotificationJob>();

  const apply = async (groups: QuantityGroup[], direction: 'restore' | 'deduct') => {
    if (groups.length === 0) return;
    // Reload just before each operation. In particular, deductions observe stock
    // restored by another selected order in this same transaction.
    const currentSnapshots = direction === 'deduct' && restoreItems.length > 0 ? await loadSnapshots() : snapshots;
    const validGroups = groups.filter((group) => {
      const variant = currentSnapshots.get(group.id);
      return variant && variant.product.productId === group.expectedProductId;
    });
    if (validGroups.length === 0) return;

    const beforeById = new Map(validGroups.map((group) => [group.id, currentSnapshots.get(group.id)!]));
    // VariantOption.id and stockQuantity are PostgreSQL INTEGER columns. Explicitly cast
    // VALUES parameters so PostgreSQL never infers them as TEXT (which would make
    // variant.id = batch.id fail with the integer = text operator error).
    const values = validGroups.map((group) =>
      Prisma.sql`(${group.id}::integer, ${group.quantity}::integer)`,
    );
    const sign = direction === 'restore' ? '+' : '-';
    const updated = await tx.$queryRaw<Array<{ id: number; stockQuantity: number; stockStatus: string }>>`
      UPDATE "VariantOption" AS variant
      SET
        "stockQuantity" = variant."stockQuantity" ${Prisma.raw(sign)} batch."quantity",
        "stockStatus" = CASE
          WHEN variant."stockQuantity" ${Prisma.raw(sign)} batch."quantity" <= 0 THEN 'Out of Stock'
          WHEN variant."lowStockThreshold" > 0
            AND variant."stockQuantity" ${Prisma.raw(sign)} batch."quantity" <= variant."lowStockThreshold" THEN 'Low Stock'
          ELSE 'In Stock'
        END,
        "updatedAt" = NOW()
      FROM (VALUES ${Prisma.join(values)}) AS batch("id", "quantity")
      WHERE variant."id" = batch."id"
        ${direction === 'deduct' ? Prisma.sql`AND variant."stockQuantity" >= batch."quantity"` : Prisma.empty}
      RETURNING variant."id", variant."stockQuantity", variant."stockStatus"
    `;

    if (direction === 'deduct' && updated.length !== validGroups.length) {
      const updatedIds = new Set(updated.map((row) => row.id));
      const failedGroup = validGroups.find((group) => !updatedIds.has(group.id));
      if (failedGroup) {
        const variant = beforeById.get(failedGroup.id)!;
        const fresh = await tx.variantOption.findUnique({ where: { id: failedGroup.id }, select: { stockQuantity: true } });
        throw new InsufficientOrderStockError(
          variant.variantName ? `${variant.product.name} (${variant.variantName})` : variant.product.name,
          variant.product.productId,
          failedGroup.quantity,
          fresh?.stockQuantity ?? variant.stockQuantity,
        );
      }
    }

    for (const row of updated) {
      const before = beforeById.get(row.id);
      if (!before?.product.userId) continue;
      const existingJob = jobsByVariant.get(row.id);
      if (existingJob) {
        // Keep the first observed stock level and the final committed quantity.
        existingJob.newStock = row.stockQuantity;
      } else {
        jobsByVariant.set(row.id, {
          userId: before.product.userId,
          productId: before.product.productId,
          productName: before.product.name,
          previousStock: before.stockQuantity,
          newStock: row.stockQuantity,
          lowStockThreshold: before.lowStockThreshold,
          variantName: before.variantName || undefined,
          variantOptionId: before.id,
        });
      }
    }
  };

  await apply(aggregate(restoreItems), 'restore');
  await apply(aggregate(deductItems), 'deduct');
  return Array.from(jobsByVariant.values());
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

