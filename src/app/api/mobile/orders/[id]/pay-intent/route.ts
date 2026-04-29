import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSecurityHeaders } from '@/utils/auth-security';
import { parseMarketplaceUserIdFromBuyerId } from '@/utils/buyerSync';
import { broadcastDashboardNotification, broadcastNotification, broadcastOrderUpdate } from '@/utils/websocketBroadcast';
import { sendExpoPushToMarketplaceUser } from '@/utils/expoPush';
import { marketplacePayIntentRateLimiter } from '@/utils/rateLimiter';

/**
 * POST /api/mobile/orders/[id]/pay-intent
 * Buyer indicates they will pay via manual transfer; we notify the distributor.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const headers = getSecurityHeaders();

  try {
    const { getAuthenticatedMarketplaceUserId } = await import('@/utils/auth-helpers');
    const auth = await getAuthenticatedMarketplaceUserId(request);
    if (!auth.ok) {
      if (auth.reason === 'suspended') {
        return NextResponse.json({ error: 'Account suspended' }, { status: 403, headers });
      }
      return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401, headers });
    }
    const marketplaceUserId = auth.userId;

    // Rate limiting: pay intent triggers fanout (DB notification, WS, push)
    const rateLimitResponse = await marketplacePayIntentRateLimiter(request, marketplaceUserId);
    if (rateLimitResponse) return rateLimitResponse;

    const { id } = await params;
    const orderIdNum = parseInt(id, 10);
    if (!Number.isFinite(orderIdNum) || orderIdNum < 1) {
      return NextResponse.json({ error: 'Invalid order id' }, { status: 400, headers });
    }

    const order = await prisma.order.findUnique({
      where: { id: orderIdNum },
      select: {
        id: true,
        orderId: true,
        buyerId: true,
        userId: true,
        paymentStatus: true,
        orderStatus: true,
        storeName: true,
        totalAmount: true,
      },
    });

    if (!order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404, headers });
    }

    const orderBuyerMarketplaceId = parseMarketplaceUserIdFromBuyerId(order.buyerId);
    if (orderBuyerMarketplaceId === null || orderBuyerMarketplaceId !== marketplaceUserId) {
      return NextResponse.json({ error: 'You can only pay your own orders' }, { status: 403, headers });
    }

    // Prevent pay intent on orders that are not awaiting payment
    if (order.paymentStatus === 'paid') {
      return NextResponse.json({ error: 'Order is already paid' }, { status: 400, headers });
    }
    if (order.orderStatus === 'cancelled' || order.orderStatus === 'rejected') {
      return NextResponse.json({ error: 'Cannot pay for a cancelled order' }, { status: 400, headers });
    }

    // Notify distributor dashboard (web) via Notification row + dashboard WS hint
    const distributorUserId = order.userId ?? null;
    if (typeof distributorUserId === 'number' && distributorUserId > 0) {
      try {
        // IMPORTANT: NotificationService.createOrderNotification only supports known order statuses.
        // For Pay Intent we always create a concrete Notification row.
        await prisma.notification.create({
          data: {
            userId: distributorUserId,
            type: 'payment',
            title: 'Buyer initiated payment',
            message: `Buyer initiated payment for order #${order.orderId}. Please verify and set Payment Status to Paid when received.`,
            metadata: { orderId: order.orderId, type: 'payment' },
            actionUrl: `/orders/details/${order.orderId}`,
          },
        });

        await broadcastDashboardNotification(distributorUserId);
        await broadcastNotification(
          'payment',
          'Buyer initiated payment',
          `Order #${order.orderId}: buyer initiated payment. Verify incoming transfer and mark as Paid when received.`,
          { orderId: order.orderId, type: 'payment' },
          distributorUserId
        );
      } catch {
        // best-effort
      }
    }

    // Let marketplace buyer know we notified the distributor (push first; WS fallback)
    try {
      const title = 'Payment intent submitted';
      const body = `We notified the distributor for order #${order.orderId}. Please complete your manual transfer.`;
      const payload = { orderId: order.orderId, type: 'payment' };
      const { tokenCount } = await sendExpoPushToMarketplaceUser(marketplaceUserId, title, body, payload);
      if (tokenCount === 0) {
        await broadcastNotification('payment', title, body, payload, marketplaceUserId);
      }
    } catch {
      // best-effort
    }

    // Trigger order refresh in real-time UIs
    try {
      await broadcastOrderUpdate([order.orderId]);
    } catch {
      // ignore
    }

    return NextResponse.json({ ok: true }, { status: 200, headers });
  } catch (error) {
    console.error('[mobile/orders/[id]/pay-intent] POST error', error);
    return NextResponse.json({ error: 'Failed to send payment notification' }, { status: 500, headers });
  }
}

