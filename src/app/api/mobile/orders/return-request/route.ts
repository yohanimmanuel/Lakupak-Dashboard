import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSecurityHeaders } from '@/utils/auth-security';
import { parseMarketplaceUserIdFromBuyerId } from '@/utils/buyerSync';
import { broadcastOrderUpdate, broadcastNotification } from '@/utils/websocketBroadcast';
import { getMarketplaceUserPushLanguage, sendExpoPushToMarketplaceUser } from '@/utils/expoPush';
import { translateMarketplaceReturnRequestSubmitted } from '@/utils/marketplacePushTranslations';
import { NotificationService } from '@/app/api/graphql/modules/notifications';
import { marketplaceReturnRequestRateLimiter } from '@/utils/rateLimiter';
import { auditOrder } from '@/lib/audit';

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

function isProbablyHttpUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === 'https:' || u.protocol === 'http:';
  } catch {
    return false;
  }
}

/**
 * POST /api/mobile/orders/return-request
 * Body: { orderId: string, reason: string, reasonDetail?: string }
 * Creates a return/refund request for an order. Order must be Delivered or Received.
 */
export async function POST(request: NextRequest) {
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

    const rateLimitResponse = await marketplaceReturnRequestRateLimiter(request, marketplaceUserId);
    if (rateLimitResponse) return rateLimitResponse;

    const body = await request.json().catch(() => ({}));
    const { orderId, reason, reasonDetail, imageUrls } = body;

    if (!orderId || typeof orderId !== 'string' || !orderId.trim()) {
      return NextResponse.json(
        { error: 'Order ID is required' },
        { status: 400, headers }
      );
    }
    const safeOrderId = orderId.trim();
    if (safeOrderId.length > 64) {
      return NextResponse.json({ error: 'Order ID is too long' }, { status: 400, headers });
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
    if (detailText && detailText.length > 1000) {
      return NextResponse.json({ error: 'reasonDetail is too long' }, { status: 400, headers });
    }

    let safeImageUrls: string[] = [];
    if (Array.isArray(imageUrls)) {
      safeImageUrls = imageUrls
        .filter((u) => typeof u === 'string')
        .map((u) => u.trim())
        .filter((u) => u.length > 0 && u.length <= 2048 && isProbablyHttpUrl(u))
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

    // Notify marketplace buyer (confirmation): always send both Expo push and WebSocket so in-app gets same content
    try {
      const returnTranslations = translateMarketplaceReturnRequestSubmitted({ orderId: order.orderId });
      const payload = { orderId: order.orderId, orderStatus: order.orderStatus, type: 'order' };
      await sendExpoPushToMarketplaceUser(marketplaceUserId, returnTranslations, payload);
      const wsLang = await getMarketplaceUserPushLanguage(marketplaceUserId);
      const wsCopy = returnTranslations[wsLang];
      await broadcastNotification('order', wsCopy.title, wsCopy.body, payload, marketplaceUserId, 'marketplace');
    } catch {
      // Don't fail the return request if notification fails
    }

    auditOrder(request, {
      action: 'return_request',
      resourceId: order.orderId,
      actorId: marketplaceUserId,
      actorType: 'marketplace',
      metadata: { returnRequestId: created.id, reason },
    });

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
