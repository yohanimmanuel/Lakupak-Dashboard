import { prisma } from '@/lib/db';
import { enqueueSideEffect } from '@/lib/sideEffectQueue';
import { syncOrderItemPricingFromCatalog } from '@/services/orders/resolvePendingOrderItemPricing';
import { broadcastOfferUpdate, broadcastOrderUpdate } from '@/utils/websocketBroadcast';

type OfferPricingChange = {
  userId: number;
  offerId: string;
  buyerIds: Array<string | null | undefined>;
  productIds: Array<string | null | undefined>;
  categoryIds: Array<string | null | undefined>;
};

const pendingByUser = new Map<number, OfferPricingChange>();
let flushTimer: ReturnType<typeof setTimeout> | null = null;

function collectIds(values: Array<string | null | undefined>): string[] {
  const ids = new Set<string>();
  for (const value of values) {
    const trimmed = value?.trim();
    if (trimmed) ids.add(trimmed);
  }
  return [...ids];
}

/**
 * Activating or deactivating a client rate changes Pending PO prices.
 * Coalesce bursts (one update per product in a group) into a single resync
 * and websocket broadcast so the marketplace orders tab updates without a pull.
 */
export function enqueueOfferPricingBroadcast(change: OfferPricingChange): void {
  const existing = pendingByUser.get(change.userId);
  if (!existing) {
    pendingByUser.set(change.userId, {
      userId: change.userId,
      offerId: change.offerId,
      buyerIds: [...change.buyerIds],
      productIds: [...change.productIds],
      categoryIds: [...change.categoryIds],
    });
  } else {
    if (change.offerId) existing.offerId = change.offerId;
    existing.buyerIds.push(...change.buyerIds);
    existing.productIds.push(...change.productIds);
    existing.categoryIds.push(...change.categoryIds);
  }

  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = setTimeout(() => {
    flushTimer = null;
    const batch = [...pendingByUser.values()];
    pendingByUser.clear();
    for (const job of batch) {
      enqueueSideEffect(
        `offer-pricing-broadcast:${job.userId}`,
        () => syncPendingOrdersAndBroadcast(job),
        { retries: 2, initialDelayMs: 0 },
      );
    }
  }, 200);
}

async function syncPendingOrdersAndBroadcast(change: OfferPricingChange): Promise<void> {
  const buyerIds = collectIds(change.buyerIds);
  const categoryIds = collectIds(change.categoryIds);
  const productIds = new Set(collectIds(change.productIds));

  if (categoryIds.length > 0) {
    const products = await prisma.product.findMany({
      where: {
        userId: change.userId,
        merchandisingCategorySlug: { in: categoryIds },
      },
      select: { productId: true },
    });
    for (const product of products) {
      if (product.productId) productIds.add(product.productId);
    }
  }

  const orderIds: string[] = [];
  if (buyerIds.length > 0) {
    const orders = await prisma.order.findMany({
      where: {
        userId: change.userId,
        buyerId: { in: buyerIds },
        orderStatus: 'Pending',
        isDeleted: false,
      },
      select: { orderId: true, buyerId: true },
    });

    for (const order of orders) {
      await syncOrderItemPricingFromCatalog({
        orderId: order.orderId,
        userId: change.userId,
        buyerId: order.buyerId,
      });
      orderIds.push(order.orderId);
    }
  }

  if (orderIds.length > 0) {
    await broadcastOrderUpdate(orderIds);
  }
  if (change.offerId) {
    await broadcastOfferUpdate(change.offerId, [...productIds]);
  }
}
