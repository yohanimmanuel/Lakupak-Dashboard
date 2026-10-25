import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSecurityHeaders } from '@/utils/auth-security';
import { marketplaceMutationRateLimiter } from '@/utils/rateLimiter';
import { requireDistributorMember } from '@/lib/marketplace/routeGuard';

const WOULD_ORDER_AGAIN_VALUES = ['yes', 'no', 'maybe'] as const;
const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 50;

/**
 * GET /api/mobile/reviews/distributor?distributorId=xxx&page=1&limit=10
 * Retailers in this distributor's storefront: paginated distributor reviews + aggregate rating/breakdown.
 * Aggregates cover all reviews; `reviews` is the current page.
 */
export async function GET(request: NextRequest) {
  const headers = getSecurityHeaders();

  try {
    const { searchParams } = new URL(request.url);
    const distributorIdRaw = searchParams.get('distributorId');
    if (!distributorIdRaw) {
      return NextResponse.json({ error: 'distributorId is required' }, { status: 400, headers });
    }
    const distributorId = parseInt(distributorIdRaw.trim(), 10);
    if (!Number.isFinite(distributorId) || distributorId < 1) {
      return NextResponse.json({ error: 'Invalid distributorId' }, { status: 400, headers });
    }
    const guard = await requireDistributorMember(request, distributorId, headers);
    if (!guard.ok) return guard.response;

    const page = Math.max(
      1,
      parseInt(searchParams.get('page') ?? String(DEFAULT_PAGE), 10) || DEFAULT_PAGE,
    );
    const limit = Math.min(
      MAX_LIMIT,
      Math.max(1, parseInt(searchParams.get('limit') ?? String(DEFAULT_LIMIT), 10) || DEFAULT_LIMIT),
    );
    const skip = (page - 1) * limit;
    const where = { distributorId };

    const [aggregateResult, ratingGroups, reviews] = await Promise.all([
      prisma.distributorReview.aggregate({
        where,
        _count: { id: true },
        _avg: { overallRating: true },
      }),
      prisma.distributorReview.groupBy({
        by: ['overallRating'],
        where,
        _count: { id: true },
      }),
      prisma.distributorReview.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: {
          user: { select: { name: true, username: true, image: true } },
        },
      }),
    ]);

    const totalReviews = aggregateResult._count.id;
    const avgRating = aggregateResult._avg.overallRating;
    const overallRating =
      totalReviews > 0 && avgRating != null
        ? Math.round(Number(avgRating) * 10) / 10
        : 0;

    const breakdown: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    for (const g of ratingGroups) {
      if (g.overallRating >= 1 && g.overallRating <= 5) {
        breakdown[g.overallRating] = g._count.id;
      }
    }

    const list = reviews.map((r) => ({
      id: r.id,
      overallRating: r.overallRating,
      communicationRating: r.communicationRating ?? undefined,
      deliveryRating: r.deliveryRating ?? undefined,
      productQualityRating: r.productQualityRating ?? undefined,
      wouldOrderAgain: r.wouldOrderAgain ?? undefined,
      comment: r.comment ?? undefined,
      createdAt: r.createdAt.toISOString(),
      reviewerDisplayName:
        (r.user?.name && r.user.name.trim()) ||
        (r.user?.username && r.user.username.trim()) ||
        'Customer',
      reviewerProfileImage: r.user?.image ?? undefined,
    }));

    const totalPages = totalReviews === 0 ? 0 : Math.ceil(totalReviews / limit);

    return NextResponse.json(
      {
        distributorId,
        totalReviews,
        overallRating,
        breakdown,
        reviews: list,
        page,
        limit,
        totalPages,
      },
      { status: 200, headers },
    );
  } catch (e) {
    console.error('Distributor reviews fetch error:', e);
    return NextResponse.json(
      { error: 'Failed to load reviews.' },
      { status: 500, headers },
    );
  }
}

/** POST /api/mobile/reviews/distributor – submit a distributor (seller) review. */
export async function POST(request: NextRequest) {
  const headers = getSecurityHeaders();

  try {
    let body: {
      id?: string | number;
      orderId?: string;
      overallRating?: number;
      communicationRating?: number;
      deliveryRating?: number;
      productQualityRating?: number;
      wouldOrderAgain?: string;
      comment?: string;
    };

    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400, headers });
    }

    const distributorIdRaw = body.id;
    if (distributorIdRaw === undefined || distributorIdRaw === null) {
      return NextResponse.json({ error: 'Distributor id is required' }, { status: 400, headers });
    }

    const distributorId =
      typeof distributorIdRaw === 'number'
        ? distributorIdRaw
        : parseInt(String(distributorIdRaw).trim(), 10);
    if (!Number.isFinite(distributorId) || distributorId < 1) {
      return NextResponse.json({ error: 'Invalid distributor id' }, { status: 400, headers });
    }

    const guard = await requireDistributorMember(request, distributorId, headers);
    if (!guard.ok) return guard.response;
    const userId = guard.marketplaceUserId;

    const rateLimitResponse = await marketplaceMutationRateLimiter(request, userId, 'review-distributor');
    if (rateLimitResponse) return rateLimitResponse;

    const overallRating = Number(body.overallRating);
    if (!Number.isFinite(overallRating) || overallRating < 1 || overallRating > 5) {
      return NextResponse.json({ error: 'Overall rating must be between 1 and 5' }, { status: 400, headers });
    }

    const clamp = (n: number) => Math.min(5, Math.max(0, Math.round(n)));
    const communicationRating =
      body.communicationRating !== undefined && body.communicationRating !== null
        ? clamp(Number(body.communicationRating))
        : null;
    const deliveryRating =
      body.deliveryRating !== undefined && body.deliveryRating !== null
        ? clamp(Number(body.deliveryRating))
        : null;
    const productQualityRating =
      body.productQualityRating !== undefined && body.productQualityRating !== null
        ? clamp(Number(body.productQualityRating))
        : null;

    let wouldOrderAgain: string | null = null;
    if (body.wouldOrderAgain != null && typeof body.wouldOrderAgain === 'string') {
      const v = body.wouldOrderAgain.trim().toLowerCase();
      if (WOULD_ORDER_AGAIN_VALUES.includes(v as (typeof WOULD_ORDER_AGAIN_VALUES)[number])) {
        wouldOrderAgain = v;
      }
    }

    const comment =
      typeof body.comment === 'string' ? body.comment.trim().slice(0, 2000) : undefined;
    const orderId =
      typeof body.orderId === 'string' && body.orderId.trim() ? body.orderId.trim() : undefined;

    const distributor = await prisma.user.findUnique({
      where: { id: distributorId },
      select: { id: true },
    });

    if (!distributor) {
      return NextResponse.json({ error: 'Distributor not found' }, { status: 404, headers });
    }

    if (userId === distributorId) {
      return NextResponse.json({ error: 'Cannot review yourself' }, { status: 400, headers });
    }

    await prisma.distributorReview.upsert({
      where: {
        userId_distributorId: { userId, distributorId },
      },
      create: {
        userId,
        distributorId,
        orderId: orderId ?? undefined,
        overallRating: Math.round(overallRating),
        communicationRating: communicationRating ?? undefined,
        deliveryRating: deliveryRating ?? undefined,
        productQualityRating: productQualityRating ?? undefined,
        wouldOrderAgain: wouldOrderAgain ?? undefined,
        comment: comment ?? undefined,
      },
      update: {
        orderId: orderId ?? undefined,
        overallRating: Math.round(overallRating),
        communicationRating: communicationRating ?? undefined,
        deliveryRating: deliveryRating ?? undefined,
        productQualityRating: productQualityRating ?? undefined,
        wouldOrderAgain: wouldOrderAgain ?? undefined,
        comment: comment ?? undefined,
      },
    });

    return NextResponse.json({ success: true, message: 'Review submitted' }, { status: 200, headers });
  } catch (e) {
    console.error('Distributor review submission error:', e);
    return NextResponse.json(
      { error: 'Failed to submit review. Please try again.' },
      { status: 500, headers },
    );
  }
}
