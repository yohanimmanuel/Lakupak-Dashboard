import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@/lib/prisma-generated';
import { prisma } from '@/lib/db';
import { getSecurityHeaders } from '@/utils/auth-security';
import { parseMarketplaceUserIdFromBuyerId } from '@/utils/buyerSync';
import { broadcastOrderUpdate, broadcastNotification } from '@/utils/websocketBroadcast';
import { sendExpoPushToMarketplaceUser } from '@/utils/expoPush';
import { NotificationService } from '@/app/api/graphql/modules/notifications';

const decimalToNumber = (value: unknown): number => {
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

/**
 * PUT /api/mobile/orders/[id]/status
 * Body: { status: 'Received' }
 * Marks order as received by the buyer (marketplace). Sets orderStatus to Received and receivedAt.
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const headers = getSecurityHeaders();

  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json(
        { error: 'Authorization token required' },
        { status: 401, headers }
      );
    }

    const token = authHeader.replace('Bearer ', '');
    const { verifyAccessToken } = await import('@/lib/jwt');
    let marketplaceUserId: number;
    try {
      const payload = verifyAccessToken(token);
      const sub = payload.sub;
      marketplaceUserId = typeof sub === 'number' ? sub : parseInt(String(sub), 10);
      if (!Number.isInteger(marketplaceUserId) || marketplaceUserId < 1) {
        throw new Error('Invalid sub');
      }
    } catch {
      return NextResponse.json(
        { error: 'Invalid or expired token' },
        { status: 401, headers }
      );
    }

    const { id } = await params;
    const orderIdNum = parseInt(id, 10);
    if (isNaN(orderIdNum) || orderIdNum < 1) {
      return NextResponse.json(
        { error: 'Invalid order id' },
        { status: 400, headers }
      );
    }

    const body = await request.json().catch(() => ({}));
    const status = body.status;
    if (status !== 'Received') {
      return NextResponse.json(
        { error: 'Only status "Received" is allowed' },
        { status: 400, headers }
      );
    }

    const order = await prisma.order.findUnique({
      where: { id: orderIdNum },
    });

    if (!order) {
      return NextResponse.json(
        { error: 'Order not found' },
        { status: 404, headers }
      );
    }

    const orderBuyerMarketplaceId = parseMarketplaceUserIdFromBuyerId(order.buyerId);
    if (orderBuyerMarketplaceId === null || orderBuyerMarketplaceId !== marketplaceUserId) {
      return NextResponse.json(
        { error: 'You can only update your own orders' },
        { status: 403, headers }
      );
    }

    if (order.orderStatus !== 'Delivered') {
      return NextResponse.json(
        { error: 'Only delivered orders can be marked as received' },
        { status: 400, headers }
      );
    }

    try {
      await prisma.order.update({
        where: {
          id: orderIdNum,
          orderStatus: 'Delivered',
        },
        data: {
          orderStatus: 'Received',
          receivedAt: new Date(),
        },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
        return NextResponse.json(
          { error: 'Order status has changed, please refresh' },
          { status: 409, headers }
        );
      }
      throw err;
    }

    // Broadcast so dashboard/live views refresh
    try {
      await broadcastOrderUpdate([order.orderId]);
    } catch {
      // Ignore broadcast errors
    }

    // Notify distributor: "Order Received" only when marketplace (buyer) triggers it (not when dashboard sets status)
    if (order.userId) {
      try {
        const storeName = order.storeName ?? (order as { storeNameSnapshot?: string }).storeNameSnapshot ?? 'Unknown Store';
        await NotificationService.createOrderNotification(
          order.userId,
          order.orderId,
          'Received',
          storeName,
          decimalToNumber(order.totalAmount)
        );
      } catch {
        // Don't fail the status update if notification fails
      }
    }

    // Notify marketplace buyer (confirmation): Expo push first; if no Expo tokens, fallback to WebSocket
    try {
      const title = 'Order Received';
      const body = `Your order #${order.orderId} has been marked as received. Thank you for confirming!`;
      const payload = { orderId: order.orderId, orderStatus: 'Received', type: 'order' };
      const { tokenCount } = await sendExpoPushToMarketplaceUser(
        marketplaceUserId,
        title,
        body,
        payload
      );
      if (tokenCount === 0) {
        await broadcastNotification('order', title, body, payload, marketplaceUserId);
      }
    } catch {
      // Don't fail the status update if notification fails
    }

    return NextResponse.json(
      { message: 'Order marked as received successfully!' },
      { status: 200, headers }
    );
  } catch (error) {
    console.error('[mobile/orders/[id]/status] PUT error', error);
    return NextResponse.json(
      { error: 'Failed to update order status' },
      { status: 500, headers }
    );
  }
}
