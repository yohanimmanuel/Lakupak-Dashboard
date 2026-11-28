import type { Prisma, PrismaClient } from '@/lib/prisma-generated';
import {
  restoreStockForOrderItems,
  deductStockForOrderItems,
  broadcastProductStockUpdates,
  type StockNotificationJob,
  type RestorableOrderItem,
} from '@/services/orders/utils';

type DbClient = PrismaClient | Prisma.TransactionClient;

export type BuyerReturnStockDecision = 'restocked' | 'skipped';

export type BuyerReturnRecordRow = {
  orderNo: string;
  returnRequestId: number | null;
  returnRequestItemId: number | null;
  product: string;
  productId: string | null;
  skuSnapshot: string | null;
  variantName: string | null;
  stockType: string | null;
  piecesPerPackage: number | null;
  quantityReturned: number;
  lineCreditAmount: number;
  reason: string | null;
  returnedAt: Date | null;
  sortOrder: number;
};

/**
 * Upsert CRM return-history rows when a return request is accepted.
 * Idempotent: deletes existing rows for this returnRequestId then inserts fresh.
 */
export async function syncBuyerReturnRecordsFromRequest(
  tx: DbClient,
  args: {
    buyerRefId: number;
    orderNo: string;
    returnRequestId: number;
    reason: string | null;
    returnedAt: Date | null;
    items: Array<{
      returnRequestItemId?: number | null;
      productNameSnapshot: string;
      productId?: string | null;
      productSkuSnapshot?: string | null;
      variantNameSnapshot?: string | null;
      packageType?: string | null;
      piecesPerPackage?: number | null;
      quantityReturned: number;
      lineCreditAmount: number;
    }>;
  },
): Promise<void> {
  const { buyerRefId, orderNo, returnRequestId, reason, returnedAt, items } = args;
  if (!items.length) return;

  await tx.buyerReturnRecord.deleteMany({
    where: { buyerRefId, returnRequestId },
  });

  const baseSort =
    (
      await tx.buyerReturnRecord.aggregate({
        where: { buyerRefId },
        _max: { sortOrder: true },
      })
    )._max.sortOrder ?? -1;

  await tx.buyerReturnRecord.createMany({
    data: items.map((item, index) => ({
      buyerRefId,
      orderNo,
      returnRequestId,
      returnRequestItemId: item.returnRequestItemId ?? null,
      product: item.productNameSnapshot || '',
      productId: item.productId ?? null,
      skuSnapshot: item.productSkuSnapshot ?? null,
      variantName: item.variantNameSnapshot ?? null,
      stockType: item.packageType ?? null,
      piecesPerPackage: item.piecesPerPackage ?? null,
      quantityReturned: Math.max(0, Math.trunc(item.quantityReturned)),
      lineCreditAmount: item.lineCreditAmount,
      reason,
      returnedAt,
      stockDecision: null,
      stockDecidedAt: null,
      sortOrder: baseSort + 1 + index,
    })),
  });
}

/**
 * Resolve the Buyer CRM row for an order, creating/syncing the profile when needed.
 */
export async function resolveBuyerRefIdForOrder(
  tx: DbClient,
  order: { buyerId: string | null; userId: number | null },
): Promise<number | null> {
  if (!order.buyerId) return null;

  const existing = await tx.buyer.findUnique({
    where: { buyerId: order.buyerId },
    select: { id: true },
  });
  if (existing?.id) return existing.id;

  if (order.userId == null) return null;

  const { syncOrderToBuyerProfile } = await import('@/utils/buyerSync');
  await syncOrderToBuyerProfile(order.buyerId, order.userId);

  const created = await tx.buyer.findUnique({
    where: { buyerId: order.buyerId },
    select: { id: true },
  });
  return created?.id ?? null;
}

async function resolveRestockLine(
  tx: DbClient,
  record: {
    productId: string | null;
    quantityReturned: number;
    piecesPerPackage: number | null;
    returnRequestItemId: number | null;
    returnRequestId: number | null;
  },
): Promise<RestorableOrderItem> {
  let productId = record.productId;
  let variantOptionId: number | null = null;
  let variantId: number | null = null;
  let packageQuantity = record.quantityReturned;
  let piecesPerPackage = Math.max(1, Number(record.piecesPerPackage) || 1);

  if (record.returnRequestItemId) {
    const returnItem = await tx.orderReturnRequestItem.findUnique({
      where: { id: record.returnRequestItemId },
    });
    if (returnItem) {
      productId = returnItem.productId ?? productId;
      packageQuantity = returnItem.quantityReturned;
      piecesPerPackage = Math.max(1, Number(returnItem.piecesPerPackage) || 1);
      if (returnItem.orderItemId) {
        const orderItem = await tx.orderItem.findUnique({
          where: { id: returnItem.orderItemId },
          select: {
            productId: true,
            variantOptionId: true,
            variantId: true,
          },
        });
        if (orderItem) {
          productId = orderItem.productId ?? productId;
          variantOptionId = orderItem.variantOptionId ?? null;
          variantId = orderItem.variantId ?? null;
        }
      }
    }
  } else if (record.returnRequestId && record.productId) {
    const returnItem = await tx.orderReturnRequestItem.findFirst({
      where: {
        returnRequestId: record.returnRequestId,
        productId: record.productId,
        quantityReturned: record.quantityReturned,
      },
      orderBy: { id: 'asc' },
    });
    if (returnItem?.orderItemId) {
      const orderItem = await tx.orderItem.findUnique({
        where: { id: returnItem.orderItemId },
        select: {
          productId: true,
          variantOptionId: true,
          variantId: true,
        },
      });
      if (orderItem) {
        productId = orderItem.productId ?? productId;
        variantOptionId = orderItem.variantOptionId ?? null;
        variantId = orderItem.variantId ?? null;
      }
      piecesPerPackage = Math.max(1, Number(returnItem.piecesPerPackage) || piecesPerPackage);
      packageQuantity = returnItem.quantityReturned;
    }
  }

  if (!productId) {
    throw new Error('Cannot update stock: product is missing on this return record');
  }

  return {
    productId,
    variantOptionId,
    variantId,
    packageQuantity,
    piecesPerPackage,
    promotionDetailsSnapshot: null,
    moqSnapshot: null,
  };
}

/**
 * Toggle restock for one CRM return line (same idea as supplier Update Stock checkbox).
 * - restocked: add returned qty back to sellable inventory
 * - skipped: do not keep it in sellable inventory (reverses a prior restock)
 */
export async function applyBuyerReturnStockDecision(
  prismaClient: PrismaClient,
  args: {
    returnRecordId: number;
    decision: BuyerReturnStockDecision;
    ownerUserId: number | null;
    isPlatformAdmin?: boolean;
  },
): Promise<{ recordId: number; stockDecision: BuyerReturnStockDecision; stockJobs: StockNotificationJob[] }> {
  const { returnRecordId, decision, ownerUserId, isPlatformAdmin = false } = args;

  return prismaClient.$transaction(async (tx) => {
    const record = await tx.buyerReturnRecord.findUnique({
      where: { id: returnRecordId },
      include: { buyer: { select: { id: true, userId: true, buyerId: true } } },
    });
    if (!record) {
      throw new Error('Return record not found');
    }
    if (
      !isPlatformAdmin &&
      ownerUserId != null &&
      record.buyer.userId != null &&
      record.buyer.userId !== ownerUserId
    ) {
      throw new Error('Forbidden');
    }

    const current =
      record.stockDecision === 'restocked' || record.stockDecision === 'skipped'
        ? record.stockDecision
        : null;
    if (current === decision) {
      return {
        recordId: record.id,
        stockDecision: decision,
        stockJobs: [] as StockNotificationJob[],
      };
    }

    let stockJobs: StockNotificationJob[] = [];
    const line = await resolveRestockLine(tx, record);

    if (decision === 'restocked') {
      stockJobs = await restoreStockForOrderItems(tx, [line]);
    } else if (current === 'restocked') {
      // Untick after a prior restock — reverse the inventory add (supplier-style).
      stockJobs = await deductStockForOrderItems(tx, [line]);
    }

    const updated = await tx.buyerReturnRecord.update({
      where: { id: returnRecordId },
      data: {
        stockDecision: decision,
        stockDecidedAt: new Date(),
      },
      select: { id: true, stockDecision: true },
    });

    return {
      recordId: updated.id,
      stockDecision: updated.stockDecision as BuyerReturnStockDecision,
      stockJobs,
    };
  }).then(async (result) => {
    if (result.stockJobs.length > 0) {
      const productIds = result.stockJobs.map((job) => job.productId);
      void broadcastProductStockUpdates(productIds);
      try {
        const { NotificationService } = await import('@/app/api/graphql/modules/notifications');
        for (const job of result.stockJobs) {
          void NotificationService.checkAndNotifyStockLevel(
            job.userId,
            job.productId,
            job.productName,
            job.previousStock,
            job.newStock,
            job.lowStockThreshold,
            job.variantName,
            job.variantOptionId,
          ).catch(() => undefined);
        }
      } catch {
        // best-effort
      }
    }
    return result;
  });
}
