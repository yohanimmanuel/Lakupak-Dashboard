import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getOrderSecurityHeaders } from '@/utils/order-security';
import { getAuthenticatedUserId } from '@/utils/auth-helpers';
import { parseMarketplaceUserIdFromBuyerId } from '@/utils/buyerSync';
import {
  broadcastDashboardNotification,
  broadcastNotification,
} from '@/utils/websocketBroadcast';
import { sendExpoPushToMarketplaceUser } from '@/utils/expoPush';
import { translateMarketplacePricingSent } from '@/utils/marketplacePushTranslations';
import { broadcastMarketplaceWsFallback } from '@/services/orders/enqueueOrderUpdateSideEffects';

/**
 * POST /api/orders/send-pricing
 * Notify the buyer that PO pricing is ready. Does NOT change order status.
 * - Dashboard navbar: confirmation for the distributor
 * - Marketplace app: Expo push (+ WebSocket fallback) for the buyer
 */
export async function POST(request: NextRequest) {
  const headers = getOrderSecurityHeaders();

  try {
    const authUserId = await getAuthenticatedUserId(request);
    if (authUserId == null) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers });
    }

    const body = (await request.json()) as { orderId?: string; userId?: number };
    const orderId = String(body.orderId || '').trim();
    const userId = Number(body.userId ?? authUserId);

    if (!orderId) {
      return NextResponse.json({ error: 'orderId is required' }, { status: 400, headers });
    }
    if (userId !== authUserId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403, headers });
    }

    const order = await prisma.order.findFirst({
      where: { orderId, userId, isDeleted: false },
      select: {
        orderId: true,
        buyerId: true,
        storeName: true,
        orderStatus: true,
        orderItemsRel: { select: { subtotal: true } },
      },
    });
    if (!order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404, headers });
    }
    if (order.orderStatus !== 'Pending') {
      return NextResponse.json(
        {
          error:
            'Pricing can only be sent while the order is Pending. Current status does not allow sending pricing.',
        },
        { status: 409, headers },
      );
    }
    const items = order.orderItemsRel ?? [];
    if (items.length === 0) {
      return NextResponse.json(
        { error: 'Order has no line items to price.' },
        { status: 409, headers },
      );
    }
    const pendingCount = items.filter((row) => !(Number(row.subtotal) > 0)).length;
    if (pendingCount > 0) {
      return NextResponse.json(
        {
          error: `Cannot send pricing: ${pendingCount} item(s) still need a price greater than zero.`,
        },
        { status: 409, headers },
      );
    }

    const storeName = order.storeName || 'buyer';
    const dashboardTitle = 'Pricing sent to buyer';
    const dashboardMessage = `Pricing for order #${order.orderId} was sent to ${storeName}.`;

    await prisma.notification.create({
      data: {
        userId,
        type: 'order',
        title: dashboardTitle,
        message: dashboardMessage,
        metadata: {
          orderId: order.orderId,
          type: 'pricing_sent',
        },
        actionUrl: `/orders/details/${order.orderId}`,
      },
    });

    try {
      await broadcastDashboardNotification(userId);
      await broadcastNotification(
        'order',
        dashboardTitle,
        dashboardMessage,
        { orderId: order.orderId, type: 'pricing_sent' },
        userId,
        'dashboard',
      );
    } catch {
      // best-effort realtime
    }

    const marketplaceUserId = parseMarketplaceUserIdFromBuyerId(order.buyerId);
    if (marketplaceUserId != null) {
      const translations = translateMarketplacePricingSent({ orderId: order.orderId });
      const payload = {
        orderId: order.orderId,
        type: 'pricing_sent',
      };
      try {
        const { tokenCount } = await sendExpoPushToMarketplaceUser(
          marketplaceUserId,
          translations,
          payload,
        );
        if (tokenCount === 0) {
          await broadcastMarketplaceWsFallback(
            marketplaceUserId,
            translations,
            'order',
            payload,
          );
        } else {
          // Also ping in-app WS so foreground marketplace clients refresh.
          await broadcastMarketplaceWsFallback(
            marketplaceUserId,
            translations,
            'order',
            payload,
          );
        }
      } catch (err) {
        console.error('[send-pricing] marketplace notify failed', err);
      }
    }

    return NextResponse.json(
      { success: true, orderId: order.orderId, orderStatus: order.orderStatus },
      { status: 200, headers },
    );
  } catch (error) {
    console.error('[send-pricing]', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to send pricing' },
      { status: 500, headers },
    );
  }
}
