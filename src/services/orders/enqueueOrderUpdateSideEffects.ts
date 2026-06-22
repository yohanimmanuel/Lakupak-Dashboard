import { prisma } from '@/lib/db';
import { enqueueSideEffect } from '@/lib/sideEffectQueue';
import { syncOrderToBuyerProfile, parseMarketplaceUserIdFromBuyerId } from '@/utils/buyerSync';
import { broadcastOrderUpdate, broadcastNotification } from '@/utils/websocketBroadcast';
import {
  getMarketplaceUserPushLanguage,
  sendExpoPushToMarketplaceUser,
  sendExpoPushToDriver,
} from '@/utils/expoPush';
import { translateDriverOrderUpdate } from '@/utils/driverPushTranslations';
import type { DriverPushLanguage } from '@/utils/driverPushTranslations';
import {
  type MarketplacePushPayload,
  translateMarketplaceBuyerOrderCancelled,
  translateMarketplaceBuyerOrderStatus,
  translateMarketplacePaymentConfirmed,
  translateMarketplacePaymentUnpaid,
  translateMarketplaceReturnRequestRejected,
} from '@/utils/marketplacePushTranslations';
import { NotificationService } from '@/app/api/graphql/modules/notifications';
import { broadcastSoldCountUpdates, decimalToNumber } from './utils';

const SIDE_EFFECT_OPTS = { retries: 2 } as const;

async function broadcastMarketplaceWsFallback(
  marketplaceUserId: number,
  translations: Record<DriverPushLanguage, MarketplacePushPayload>,
  type: string,
  payload: Record<string, unknown>,
) {
  const wsLang = await getMarketplaceUserPushLanguage(marketplaceUserId);
  const wsCopy = translations[wsLang] ?? translations.en;
  await broadcastNotification(type, wsCopy.title, wsCopy.body, payload, marketplaceUserId);
}

export function enqueueBroadcastOrderUpdates(label: string, orderIds: string[]) {
  if (orderIds.length === 0) return;
  const ids = [...orderIds];
  enqueueSideEffect(
    `broadcastOrderUpdate(${label})`,
    async () => {
      await broadcastOrderUpdate(ids);
    },
    SIDE_EFFECT_OPTS,
  );
}

export function enqueueSoldCountBroadcast(orderId: string, label: string) {
  enqueueSideEffect(
    `broadcastSoldCountUpdates(${label})`,
    async () => {
      await broadcastSoldCountUpdates(orderId);
    },
    SIDE_EFFECT_OPTS,
  );
}

type StockNotificationJob = {
  userId: number;
  productId: string;
  productName: string;
  previousStock: number;
  newStock: number;
  lowStockThreshold: number;
  variantName?: string;
};

type OrderUpdatePostCommitInput = {
  order: {
    orderId: string;
    buyerId: string | null;
    userId: number | null;
    storeName: string | null;
    orderStatus: string;
    paymentStatus: string;
    totalAmount: unknown;
  };
  sanitizedData: Record<string, unknown>;
  previousOrderStatus: string | null;
  previousPaymentStatus: string | null;
  stockNotificationJobs: StockNotificationJob[];
};

export function scheduleOrderUpdatePostCommitEffects(input: OrderUpdatePostCommitInput) {
  const { order, sanitizedData, previousOrderStatus, previousPaymentStatus, stockNotificationJobs } =
    input;

  for (const job of stockNotificationJobs) {
    enqueueSideEffect(
      `stockNotification(${job.productId})`,
      async () => {
        await NotificationService.checkAndNotifyStockLevel(
          job.userId,
          job.productId,
          job.productName,
          job.previousStock,
          job.newStock,
          job.lowStockThreshold,
          job.variantName,
        );
      },
      SIDE_EFFECT_OPTS,
    );
  }

  if (order.buyerId && sanitizedData.userId) {
    const buyerId = order.buyerId;
    const userId = sanitizedData.userId as number;
    enqueueSideEffect('syncOrderToBuyerProfile', async () => {
      await syncOrderToBuyerProfile(buyerId, userId);
    }, SIDE_EFFECT_OPTS);
  }

  enqueueBroadcastOrderUpdates('order-update', [order.orderId]);

  if (sanitizedData.orderStatus || sanitizedData.orderItems) {
    enqueueSoldCountBroadcast(order.orderId, 'order-update');
  }

  if (
    sanitizedData.orderStatus &&
    sanitizedData.orderStatus !== 'Pending' &&
    sanitizedData.orderStatus !== 'Received' &&
    String(sanitizedData.orderStatus) !== (previousOrderStatus ?? '') &&
    order.userId
  ) {
    const userId = order.userId;
    const orderId = order.orderId;
    const status = String(sanitizedData.orderStatus);
    const storeName = order.storeName || 'Unknown Store';
    const totalAmount = decimalToNumber(order.totalAmount);
    enqueueSideEffect('createOrderNotification', async () => {
      await NotificationService.createOrderNotification(
        userId,
        orderId,
        status,
        storeName,
        totalAmount,
      );
    }, SIDE_EFFECT_OPTS);
  }

  if (
    sanitizedData.paymentStatus !== undefined &&
    String(sanitizedData.paymentStatus) === 'Paid' &&
    previousPaymentStatus !== 'Paid'
  ) {
    enqueueSideEffect('marketplacePaymentConfirmed', async () => {
      const marketplaceUserId = parseMarketplaceUserIdFromBuyerId(order.buyerId);
      if (marketplaceUserId == null) return;
      const payload = { orderId: order.orderId, paymentStatus: 'Paid', type: 'payment' };
      const payTranslations = translateMarketplacePaymentConfirmed({ orderId: order.orderId });
      const { tokenCount } = await sendExpoPushToMarketplaceUser(
        marketplaceUserId,
        payTranslations,
        payload,
      );
      if (tokenCount === 0) {
        await broadcastMarketplaceWsFallback(marketplaceUserId, payTranslations, 'payment', payload);
      }
    }, SIDE_EFFECT_OPTS);
  }

  if (
    sanitizedData.paymentStatus !== undefined &&
    String(sanitizedData.paymentStatus) === 'Unpaid' &&
    previousPaymentStatus !== null &&
    previousPaymentStatus !== 'Unpaid'
  ) {
    enqueueSideEffect('marketplacePaymentUnpaid', async () => {
      const marketplaceUserId = parseMarketplaceUserIdFromBuyerId(order.buyerId);
      if (marketplaceUserId == null) return;
      const payload = { orderId: order.orderId, paymentStatus: 'Unpaid', type: 'payment' };
      const payTranslations = translateMarketplacePaymentUnpaid({ orderId: order.orderId });
      const { tokenCount } = await sendExpoPushToMarketplaceUser(
        marketplaceUserId,
        payTranslations,
        payload,
      );
      if (tokenCount === 0) {
        await broadcastMarketplaceWsFallback(marketplaceUserId, payTranslations, 'payment', payload);
      }
    }, SIDE_EFFECT_OPTS);
  }

  if (sanitizedData.orderStatus) {
    const orderStatus = String(sanitizedData.orderStatus);
    enqueueSideEffect('marketplaceOrderStatus', async () => {
      const marketplaceUserId = parseMarketplaceUserIdFromBuyerId(order.buyerId);
      if (marketplaceUserId == null) return;
      if (orderStatus === (previousOrderStatus ?? '')) return;
      const orderPushTranslations = translateMarketplaceBuyerOrderStatus({
        orderId: order.orderId,
        status: orderStatus,
      });
      const orderPayload = { orderId: order.orderId, orderStatus, type: 'order' as const };
      const { tokenCount } = await sendExpoPushToMarketplaceUser(
        marketplaceUserId,
        orderPushTranslations,
        orderPayload,
      );
      if (tokenCount === 0) {
        await broadcastMarketplaceWsFallback(
          marketplaceUserId,
          orderPushTranslations,
          'order',
          orderPayload,
        );
      }
    }, SIDE_EFFECT_OPTS);

    enqueueSideEffect('driverOrderStatus', async () => {
      const orderWithFleet = await prisma.order.findUnique({
        where: { orderId: order.orderId },
        select: { fleet: { select: { driverId: true, fleetCode: true } } },
      });
      const driverId = orderWithFleet?.fleet?.driverId;
      const fleetCode = orderWithFleet?.fleet?.fleetCode;
      if (!driverId) return;
      const translations = translateDriverOrderUpdate({
        orderId: String(order.orderId),
        status: orderStatus,
        fleetCode: fleetCode ?? undefined,
      });
      await sendExpoPushToDriver(driverId, translations, {
        type: 'order_updated',
        orderId: order.orderId,
        orderStatus,
        fleetCode: fleetCode ?? '',
      });
    }, SIDE_EFFECT_OPTS);
  }

  if (order.userId) {
    const userId = order.userId;
    enqueueSideEffect('invalidateOrderCaches', async () => {
      const { invalidateDashboardCache, invalidateProductCache } = await import('@/lib/queryCache');
      await Promise.all([
        invalidateDashboardCache(userId),
        invalidateProductCache(userId),
      ]);
    }, SIDE_EFFECT_OPTS);
  }
}

export function scheduleOrderCancelPostCommitEffects(updatedOrder: {
  orderId: string;
  buyerId: string | null;
  userId: number | null;
  storeName: string | null;
  totalAmount: unknown;
}, bodyUserId: number | undefined) {
  if (updatedOrder.buyerId && bodyUserId) {
    const buyerId = updatedOrder.buyerId;
    const userId = bodyUserId;
    enqueueSideEffect('syncOrderToBuyerProfile(cancel)', async () => {
      await syncOrderToBuyerProfile(buyerId, userId);
    }, SIDE_EFFECT_OPTS);
  }

  enqueueBroadcastOrderUpdates('cancel', [updatedOrder.orderId]);
  enqueueSoldCountBroadcast(updatedOrder.orderId, 'cancel');

  if (updatedOrder.userId) {
    const userId = updatedOrder.userId;
    const orderId = updatedOrder.orderId;
    const storeName = updatedOrder.storeName || 'Unknown Store';
    const totalAmount = decimalToNumber(updatedOrder.totalAmount);
    enqueueSideEffect('createOrderNotification(cancel)', async () => {
      await NotificationService.createOrderNotification(
        userId,
        orderId,
        'Cancelled',
        storeName,
        totalAmount,
      );
    }, SIDE_EFFECT_OPTS);
  }

  enqueueSideEffect('marketplaceOrderCancelled', async () => {
    const marketplaceUserId = parseMarketplaceUserIdFromBuyerId(updatedOrder.buyerId);
    if (marketplaceUserId == null) return;
    const cancelTranslations = translateMarketplaceBuyerOrderCancelled({
      orderId: updatedOrder.orderId,
    });
    const payload = { orderId: updatedOrder.orderId, orderStatus: 'Cancelled', type: 'order' };
    const { tokenCount } = await sendExpoPushToMarketplaceUser(
      marketplaceUserId,
      cancelTranslations,
      payload,
    );
    if (tokenCount === 0) {
      await broadcastNotification(
        'order',
        cancelTranslations.en.title,
        cancelTranslations.en.body,
        payload,
        marketplaceUserId,
      );
    }
  }, SIDE_EFFECT_OPTS);
}

export function scheduleReturnRequestRejectedNotification(input: {
  marketplaceUserId: number;
  orderId: string;
  orderStatus: string;
}) {
  enqueueSideEffect('returnRequestRejected', async () => {
    const rejectTranslations = translateMarketplaceReturnRequestRejected({
      orderId: input.orderId,
    });
    const payload = {
      orderId: input.orderId,
      orderStatus: input.orderStatus,
      type: 'order' as const,
      returnRequestStatus: 'Rejected' as const,
    };
    const { tokenCount } = await sendExpoPushToMarketplaceUser(
      input.marketplaceUserId,
      rejectTranslations,
      payload,
    );
    if (tokenCount === 0) {
      await broadcastMarketplaceWsFallback(
        input.marketplaceUserId,
        rejectTranslations,
        'order',
        payload,
      );
    }
  }, SIDE_EFFECT_OPTS);
}
