import { prisma } from '@/lib/db';
import { parseMarketplaceUserIdFromBuyerId } from '@/utils/buyerSync';
import { sendExpoPushToMarketplaceUser } from '@/utils/expoPush';
import { translateMarketplaceFleetAssigned } from '@/utils/marketplacePushTranslations';
import { broadcastOrderUpdate } from '@/utils/websocketBroadcast';
import { broadcastMarketplaceWsFallback } from '@/services/orders/enqueueOrderUpdateSideEffects';

/** After fleet ↔ order sync: refresh marketplace order UIs and notify buyers of new assignments. */
export async function scheduleFleetOrderAssignmentSideEffects(
  addedOrderIds: string[],
  removedOrderIds: string[],
  fleetCode: string,
): Promise<void> {
  const affectedOrderIds = [...new Set([...addedOrderIds, ...removedOrderIds])];
  if (affectedOrderIds.length > 0) {
    await broadcastOrderUpdate(affectedOrderIds);
  }

  if (addedOrderIds.length === 0) return;

  const orders = await prisma.order.findMany({
    where: { orderId: { in: addedOrderIds } },
    select: { orderId: true, buyerId: true },
  });

  await Promise.all(
    orders.map((order) => notifyMarketplaceFleetAssigned(order.orderId, fleetCode, order.buyerId)),
  );
}

async function notifyMarketplaceFleetAssigned(
  orderId: string,
  fleetCode: string,
  buyerId: string | null,
): Promise<void> {
  const marketplaceUserId = parseMarketplaceUserIdFromBuyerId(buyerId);
  if (marketplaceUserId == null) return;

  const translations = translateMarketplaceFleetAssigned({ orderId });
  const payload = {
    orderId,
    fleetCode,
    orderStatus: 'fleet_assigned',
    type: 'order' as const,
  };

  const { tokenCount } = await sendExpoPushToMarketplaceUser(
    marketplaceUserId,
    translations,
    payload,
  );

  if (tokenCount === 0) {
    await broadcastMarketplaceWsFallback(marketplaceUserId, translations, 'order', payload);
  }
}
