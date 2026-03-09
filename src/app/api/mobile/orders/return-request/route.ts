import { NextRequest, NextResponse } from 'next/server';
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

const VALID_REASONS = [
  'wrong_item',
  'defective',
  'not_as_described',
  'changed_mind',
  'late_delivery',
  'other',
];

/**
 * POST /api/mobile/orders/return-request
 * Body: { orderId: string, reason: string, reasonDetail?: string }
 * Creates a return/refund request for an order. Order must be Delivered or Received.
 */
export async function POST(request: NextRequest) {
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

    const body = await request.json().catch(() => ({}));
    const { orderId, reason, reasonDetail, imageUrls } = body;

    if (!orderId || typeof orderId !== 'string' || !orderId.trim()) {
      return NextResponse.json(
        { error: 'Order ID is required' },
        { status: 400, headers }
      );
    }

    if (!reason || typeof reason !== 'string' || !VALID_REASONS.includes(reason)) {
      return NextResponse.json(
        { error: 'Valid reason is required' },
        { status: 400, headers }
      );
    }

    const order = await prisma.order.findUnique({
      where: { orderId: orderId.trim() },
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
        { error: 'You can only request a return for your own orders' },
        { status: 403, headers }
      );
    }

    if (!['Delivered', 'Received', 'Returned'].includes(order.orderStatus)) {
      return NextResponse.json(
        { error: 'Return/refund is only available for delivered, received, or returned orders' },
        { status: 400, headers }
      );
    }

    const detailText =
      typeof reasonDetail === 'string' && reasonDetail.trim()
        ? reasonDetail.trim()
        : null;

    let safeImageUrls: string[] = [];
    if (Array.isArray(imageUrls)) {
      safeImageUrls = imageUrls
        .filter((u) => typeof u === 'string')
        .map((u) => u.trim())
        .filter((u) => u.length > 0)
        .slice(0, 5);
    }

    const created = await prisma.orderReturnRequest.create({
      data: {
        orderId: order.orderId,
        marketplaceUserId,
        reason,
        reasonDetail: detailText,
        imageUrls: safeImageUrls,
        status: 'Pending',
      },
    });

    // Broadcast order update so dashboard/live views refresh (same as cancel order)
    try {
      await broadcastOrderUpdate([order.orderId]);
    } catch {
      // Ignore broadcast errors
    }

    // Notify distributor that a return request was submitted
    if (order.userId) {
      try {
        const storeName = order.storeName ?? order.storeNameSnapshot ?? 'Unknown Store';
        await NotificationService.createOrderNotification(
          order.userId,
          order.orderId,
          'ReturnRequested',
          storeName,
          decimalToNumber(order.totalAmount)
        );
      } catch {
        // Don't fail the return request if notification fails
      }
    }

    // Notify marketplace buyer (confirmation): Expo push first; if no Expo tokens, fallback to WebSocket (same as cancel)
    try {
      const { tokenCount } = await sendExpoPushToMarketplaceUser(
        marketplaceUserId,
        'Return Request Submitted',
        `Your return request for order #${order.orderId} has been submitted. We will process it and contact you if needed.`,
        { orderId: order.orderId, orderStatus: order.orderStatus, type: 'order' }
      );
      if (tokenCount === 0) {
        await broadcastNotification(
          'order',
          'Return Request Submitted',
          `Your return request for order #${order.orderId} has been submitted. We will process it and contact you if needed.`,
          { orderId: order.orderId, orderStatus: 'Returned', type: 'order' },
          marketplaceUserId
        );
      }
    } catch {
      // Don't fail the return request if notification fails
    }

    return NextResponse.json(
      {
        message: 'Return request submitted. We will process it and contact you if needed.',
        returnRequestId: created.id,
      },
      { status: 201, headers }
    );
  } catch (error) {
    console.error('[return-request] POST error', error);
    return NextResponse.json(
      { error: 'Failed to submit return request' },
      { status: 500, headers }
    );
  }
}
