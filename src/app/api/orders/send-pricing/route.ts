import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getOrderSecurityHeaders } from '@/utils/order-security';
import { getAuthenticatedUserId } from '@/utils/auth-helpers';
import { parseMarketplaceUserIdFromBuyerId, syncOrderToBuyerProfile } from '@/utils/buyerSync';
import {
  broadcastDashboardNotification,
  broadcastNotification,
} from '@/utils/websocketBroadcast';
import { sendExpoPushToMarketplaceUser } from '@/utils/expoPush';
import {
  translateMarketplacePricingSent,
  translateMarketplacePricingUpdated,
} from '@/utils/marketplacePushTranslations';
import { broadcastMarketplaceWsFallback } from '@/services/orders/enqueueOrderUpdateSideEffects';
import { isPricingNotifyAllowed } from '@/services/orders/utils';

/**
 * POST /api/orders/send-pricing
 * Notify the buyer that PO pricing is ready (first send) or updated (subsequent).
 * Does NOT change order status. Blocked until line prices change after a notify.
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
        pricingSentAt: true,
        orderItemsRel: { select: { subtotal: true, updatedAt: true } },
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

    const isPricingUpdate = order.pricingSentAt != null;
    if (
      !isPricingNotifyAllowed(
        order.pricingSentAt,
        items.map((row) => row.updatedAt),
      )
    ) {
      return NextResponse.json(
        {
          error:
            'Pricing already sent for the current amounts. Change a line price before sending an update.',
        },
        { status: 409, headers },
      );
    }

    const eventType = isPricingUpdate ? 'pricing_updated' : 'pricing_sent';
    const storeName = order.storeName || 'buyer';
    const dashboardTitle = isPricingUpdate
      ? 'Pricing update sent to buyer'
      : 'Pricing sent to buyer';
    const dashboardMessage = isPricingUpdate
      ? `Updated pricing for order #${order.orderId} was sent to ${storeName}.`
      : `Pricing for order #${order.orderId} was sent to ${storeName}.`;

    const claimed = await prisma.$transaction(async (tx) => {
      // Claim notify slot with the pricingSentAt we already validated against.
      // Concurrent sends that raced past the allow-check lose here.
      const claim = await tx.order.updateMany({
        where: {
          orderId: order.orderId,
          userId,
          pricingSentAt: order.pricingSentAt ?? null,
        },
        data: { pricingSentAt: new Date() },
      });
      if (claim.count !== 1) return false;

      await tx.notification.create({
        data: {
          userId,
          type: 'order',
          title: dashboardTitle,
          message: dashboardMessage,
          metadata: {
            orderId: order.orderId,
            type: eventType,
          },
          actionUrl: `/orders/details/${order.orderId}`,
        },
      });
      return true;
    });

    if (!claimed) {
      return NextResponse.json(
        {
          error:
            'Pricing already sent for the current amounts. Change a line price before sending an update.',
        },
        { status: 409, headers },
      );
    }

    // Refresh buyer profile Total Spend / Outstanding from priced order lines.
    if (order.buyerId) {
      try {
        await syncOrderToBuyerProfile(order.buyerId, userId);
      } catch (err) {
        console.error('[send-pricing] syncOrderToBuyerProfile failed', err);
      }
    }

    try {
      await broadcastDashboardNotification(userId);
      await broadcastNotification(
        'order',
        dashboardTitle,
        dashboardMessage,
        { orderId: order.orderId, type: eventType },
        userId,
        'dashboard',
      );
    } catch {
      // best-effort realtime
    }

    const marketplaceUserId = parseMarketplaceUserIdFromBuyerId(order.buyerId);
    if (marketplaceUserId != null) {
      const translations = isPricingUpdate
        ? translateMarketplacePricingUpdated({ orderId: order.orderId })
        : translateMarketplacePricingSent({ orderId: order.orderId });
      // `type: 'order'` matches marketplace push/WS handlers; synthetic orderStatus + event
      // distinguish pricing (same pattern as fleet_assigned).
      const payload = {
        orderId: order.orderId,
        type: 'order',
        orderStatus: eventType,
        event: eventType,
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
      {
        success: true,
        orderId: order.orderId,
        orderStatus: order.orderStatus,
        pricingEvent: eventType,
        isPricingUpdate,
      },
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
