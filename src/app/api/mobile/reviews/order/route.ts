import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSecurityHeaders } from '@/utils/auth-security';
import { getAuthenticatedMarketplaceUserId } from '@/utils/auth-helpers';
import { marketplaceMutationRateLimiter } from '@/utils/rateLimiter';

function isProbablyHttpUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === 'https:' || u.protocol === 'http:';
  } catch {
    return false;
  }
}

/** POST /api/mobile/reviews/order – submit product reviews + optional delivery review for an order. */
export async function POST(request: NextRequest) {
  const headers = getSecurityHeaders();

  try {
    const auth = await getAuthenticatedMarketplaceUserId(request);
    if (!auth.ok) {
      if (auth.reason === 'suspended') {
        return NextResponse.json({ error: 'Account suspended' }, { status: 403, headers });
      }
      return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401, headers });
    }
    const userId = auth.userId;

    const rateLimitResponse = await marketplaceMutationRateLimiter(request, userId, 'review-order');
    if (rateLimitResponse) return rateLimitResponse;

    let body: {
      orderId?: string;
      productReviews?: Array<{
        productId: string;
        rating: number;
        title?: string;
        comment?: string;
        imageUrls?: string[];
      }>;
      deliveryRating?: number;
      deliveryComment?: string;
    };

    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400, headers });
    }

    const { orderId, productReviews = [], deliveryRating, deliveryComment } = body;

    if (!orderId || typeof orderId !== 'string' || orderId.trim() === '') {
      return NextResponse.json({ error: 'orderId is required' }, { status: 400, headers });
    }

    const order = await prisma.order.findUnique({
      where: { orderId: orderId.trim() },
      select: {
        orderId: true,
        buyerId: true,
        orderItemsRel: { select: { productId: true } },
      },
    });

    if (!order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404, headers });
    }

    const { parseMarketplaceUserIdFromBuyerId } = await import('@/utils/buyerSync');
    const orderBuyerMarketplaceId = parseMarketplaceUserIdFromBuyerId(order.buyerId);
    if (orderBuyerMarketplaceId === null || orderBuyerMarketplaceId !== userId) {
      return NextResponse.json({ error: 'You can only review your own orders' }, { status: 403, headers });
    }

    const orderProductIds = new Set(
      order.orderItemsRel
        .map((item) => item.productId)
        .filter((id): id is string => typeof id === 'string' && id.trim() !== '')
    );

    if (!Array.isArray(productReviews) || productReviews.length === 0) {
      return NextResponse.json({ error: 'At least one product review is required' }, { status: 400, headers });
    }

    for (const pr of productReviews) {
      if (!pr?.productId || typeof pr.productId !== 'string' || pr.productId.trim() === '') {
        return NextResponse.json({ error: 'Each product review must have a valid productId' }, { status: 400, headers });
      }
      const productIdTrimmed = pr.productId.trim();
      if (!orderProductIds.has(productIdTrimmed)) {
        return NextResponse.json({ error: 'Product not part of order' }, { status: 400, headers });
      }
      const r = Number(pr.rating);
      if (!Number.isFinite(r) || r < 1 || r > 5) {
        return NextResponse.json({ error: 'Each product rating must be between 1 and 5' }, { status: 400, headers });
      }
    }

    const trimmedOrderId = orderId.trim();

    for (const pr of productReviews) {
      const productId = String(pr.productId).trim();
      const rating = Math.min(5, Math.max(1, Math.round(Number(pr.rating))));
      const title = typeof pr.title === 'string' ? pr.title.trim().slice(0, 500) : null;
      const comment = typeof pr.comment === 'string' ? pr.comment.trim().slice(0, 2000) : null;
      const imageUrls = Array.isArray(pr.imageUrls)
        ? pr.imageUrls
            .filter((u): u is string => typeof u === 'string')
            .map((u) => u.trim())
            .filter((u) => u.length > 0 && u.length <= 2048 && isProbablyHttpUrl(u))
            .slice(0, 5)
        : [];

      await prisma.productReview.upsert({
        where: {
          userId_orderId_productId: { userId, orderId: trimmedOrderId, productId },
        },
        create: {
          userId,
          orderId: trimmedOrderId,
          productId,
          rating,
          title: title ?? undefined,
          comment: comment ?? undefined,
          imageUrls,
        },
        update: {
          rating,
          title: title ?? undefined,
          comment: comment ?? undefined,
          imageUrls,
        },
      });
    }

    if (deliveryRating !== undefined && deliveryRating !== null && Number.isFinite(Number(deliveryRating))) {
      const dr = Math.min(5, Math.max(1, Math.round(Number(deliveryRating))));
      const dc = typeof deliveryComment === 'string' ? deliveryComment.trim().slice(0, 2000) : null;
      await prisma.orderDeliveryReview.upsert({
        where: { orderId: trimmedOrderId },
        create: {
          userId,
          orderId: trimmedOrderId,
          deliveryRating: dr,
          deliveryComment: dc ?? undefined,
        },
        update: {
          deliveryRating: dr,
          deliveryComment: dc ?? undefined,
        },
      });
    }

    return NextResponse.json({ success: true, message: 'Reviews submitted' }, { status: 200, headers });
  } catch (e) {
    console.error('Order review submission error:', e);
    return NextResponse.json(
      { error: 'Failed to submit reviews. Please try again.' },
      { status: 500, headers }
    );
  }
}

/**
 * GET /api/mobile/reviews/order?orderId=xxx
 * Returns the authenticated buyer's existing product reviews (and optional delivery review) for an order.
 */
export async function GET(request: NextRequest) {
  const headers = getSecurityHeaders();

  try {
    const auth = await getAuthenticatedMarketplaceUserId(request);
    if (!auth.ok) {
      if (auth.reason === 'suspended') {
        return NextResponse.json({ error: 'Account suspended' }, { status: 403, headers });
      }
      return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401, headers });
    }
    const userId = auth.userId;

    const { searchParams } = new URL(request.url);
    const orderId = searchParams.get('orderId');
    if (!orderId || typeof orderId !== 'string' || orderId.trim() === '') {
      return NextResponse.json({ error: 'orderId is required' }, { status: 400, headers });
    }

    const trimmedOrderId = orderId.trim();

    // Verify ownership of order (buyerId -> marketplace user id)
    const order = await prisma.order.findUnique({
      where: { orderId: trimmedOrderId },
      select: { orderId: true, buyerId: true },
    });
    if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404, headers });

    const { parseMarketplaceUserIdFromBuyerId } = await import('@/utils/buyerSync');
    const orderBuyerMarketplaceId = parseMarketplaceUserIdFromBuyerId(order.buyerId);
    if (orderBuyerMarketplaceId === null || orderBuyerMarketplaceId !== userId) {
      return NextResponse.json({ error: 'You can only access reviews for your own orders' }, { status: 403, headers });
    }

    const [productReviews, deliveryReview] = await Promise.all([
      prisma.productReview.findMany({
        where: { userId, orderId: trimmedOrderId },
        select: {
          productId: true,
          rating: true,
          title: true,
          comment: true,
          imageUrls: true,
          updatedAt: true,
        },
      }),
      prisma.orderDeliveryReview.findUnique({
        where: { orderId: trimmedOrderId },
        select: { deliveryRating: true, deliveryComment: true, updatedAt: true },
      }),
    ]);

    return NextResponse.json(
      {
        orderId: trimmedOrderId,
        productReviews: productReviews.map((r) => ({
          productId: r.productId,
          rating: r.rating,
          title: r.title ?? null,
          comment: r.comment ?? null,
          imageUrls: r.imageUrls ?? [],
          updatedAt: r.updatedAt.toISOString(),
        })),
        deliveryReview: deliveryReview
          ? {
              deliveryRating: deliveryReview.deliveryRating ?? null,
              deliveryComment: deliveryReview.deliveryComment ?? null,
              updatedAt: deliveryReview.updatedAt.toISOString(),
            }
          : null,
      },
      { status: 200, headers },
    );
  } catch (e) {
    console.error('Order reviews fetch error:', e);
    return NextResponse.json({ error: 'Failed to load reviews.' }, { status: 500, headers });
  }
}
