import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSecurityHeaders } from '@/utils/auth-security';
import { requireDistributorMember } from '@/lib/marketplace/routeGuard';

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 50;

/**
 * GET /api/mobile/reviews/product?productId=xxx&page=1&limit=10
 * Returns paginated product reviews and aggregate stats (totalReviews, overallRating, breakdown).
 * Aggregates are computed over all reviews for the product; reviews array is paginated.
 * Only for retailers in the product's distributor storefront.
 */
export async function GET(request: NextRequest) {
  const headers = getSecurityHeaders();

  try {
    const { searchParams } = new URL(request.url);
    const productId = searchParams.get('productId');
    const pageParam = searchParams.get('page');
    const limitParam = searchParams.get('limit');

    if (!productId || typeof productId !== 'string' || productId.trim() === '') {
      return NextResponse.json(
        { error: 'productId is required' },
        { status: 400, headers }
      );
    }

    const trimmedId = productId.trim();
    const owner = await prisma.product.findUnique({ where: { productId: trimmedId }, select: { userId: true } });
    if (!owner?.userId) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404, headers });
    }
    const guard = await requireDistributorMember(request, owner.userId, headers);
    if (!guard.ok) return guard.response;

    const page = Math.max(1, parseInt(pageParam ?? String(DEFAULT_PAGE), 10) || DEFAULT_PAGE);
    const limit = Math.min(MAX_LIMIT, Math.max(1, parseInt(limitParam ?? String(DEFAULT_LIMIT), 10) || DEFAULT_LIMIT));
    const skip = (page - 1) * limit;

    const where = { productId: trimmedId };

    const [aggregateResult, ratingGroups, reviews] = await Promise.all([
      prisma.productReview.aggregate({
        where,
        _count: { id: true },
        _avg: { rating: true },
      }),
      prisma.productReview.groupBy({
        by: ['rating'],
        where,
        _count: { id: true },
      }),
      prisma.productReview.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: {
          user: {
            select: { name: true, username: true, image: true },
          },
        },
      }),
    ]);

    // Enrich each review with what that buyer actually purchased (variant/package snapshots)
    const orderIds = Array.from(new Set(reviews.map((r) => r.orderId).filter(Boolean)));
    const orderItems = orderIds.length
      ? await prisma.orderItem.findMany({
          where: { orderId: { in: orderIds }, productId: trimmedId },
          select: {
            orderId: true,
            productId: true,
            productNameSnapshot: true,
            variantNameSnapshot: true,
            packageType: true,
            piecesPerPackage: true,
          },
        })
      : [];

    const orderItemByOrderId = new Map<string, (typeof orderItems)[number]>();
    for (const oi of orderItems) {
      if (oi.orderId) orderItemByOrderId.set(oi.orderId, oi);
    }

    const totalReviews = aggregateResult._count.id;
    const avgRating = aggregateResult._avg.rating;
    const overallRating =
      totalReviews > 0 && avgRating != null ? Math.round(Number(avgRating) * 10) / 10 : 0;

    const breakdown: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    for (const g of ratingGroups) {
      if (g.rating >= 1 && g.rating <= 5) {
        breakdown[g.rating] = g._count.id;
      }
    }

    const list = reviews.map((r) => {
      const oi = orderItemByOrderId.get(r.orderId);
      const pieces = typeof oi?.piecesPerPackage === 'number' && oi.piecesPerPackage > 0 ? oi.piecesPerPackage : null;
      const packType = (oi?.packageType ?? '').trim() || null;
      const purchasedPack =
        packType && pieces ? `${packType} · ${pieces} pcs` : packType ? packType : pieces ? `${pieces} pcs` : null;
      return {
        id: r.id,
        rating: r.rating,
        title: r.title ?? undefined,
        comment: r.comment ?? undefined,
        imageUrls: r.imageUrls ?? [],
        createdAt: r.createdAt.toISOString(),
        reviewerDisplayName:
          (r.user?.name && r.user.name.trim()) || (r.user?.username && r.user.username.trim()) || 'Customer',
        reviewerProfileImage: r.user?.image ?? undefined,
        purchasedProductName: (oi?.productNameSnapshot ?? '').trim() || undefined,
        purchasedVariantName: (oi?.variantNameSnapshot ?? '').trim() || undefined,
        purchasedPackage: purchasedPack ?? undefined,
      };
    });

    const totalPages = totalReviews === 0 ? 0 : Math.ceil(totalReviews / limit);

    return NextResponse.json(
      {
        productId: trimmedId,
        totalReviews,
        overallRating,
        breakdown,
        reviews: list,
        page,
        limit,
        totalPages,
      },
      { status: 200, headers }
    );
  } catch (e) {
    console.error('Product reviews fetch error:', e);
    return NextResponse.json(
      { error: 'Failed to load reviews.' },
      { status: 500, headers }
    );
  }
}
