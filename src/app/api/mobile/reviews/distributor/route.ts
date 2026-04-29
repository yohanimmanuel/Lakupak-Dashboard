import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSecurityHeaders } from '@/utils/auth-security';
import { getAuthenticatedMarketplaceUserId } from '@/utils/auth-helpers';
import { marketplaceMutationRateLimiter } from '@/utils/rateLimiter';

const WOULD_ORDER_AGAIN_VALUES = ['yes', 'no', 'maybe'] as const;

/**
 * GET /api/mobile/reviews/distributor?distributorId=xxx
 * Public: returns distributor reviews and aggregate rating for display.
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

    const reviews = await prisma.distributorReview.findMany({
      where: { distributorId },
      orderBy: { createdAt: 'desc' },
      include: {
        user: { select: { name: true, username: true, image: true } },
      },
    });

    const totalReviews = reviews.length;
    const sumRating = reviews.reduce((acc, r) => acc + r.overallRating, 0);
    const overallRating = totalReviews > 0 ? Math.round((sumRating / totalReviews) * 10) / 10 : 0;

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
        (r.user?.name && r.user.name.trim()) || (r.user?.username && r.user.username.trim()) || 'Customer',
      reviewerProfileImage: r.user?.image ?? undefined,
    }));

    return NextResponse.json(
      { distributorId, totalReviews, overallRating, reviews: list },
      { status: 200, headers }
    );
  } catch (e) {
    console.error('Distributor reviews fetch error:', e);
    return NextResponse.json(
      { error: 'Failed to load reviews.' },
      { status: 500, headers }
    );
  }
}

/** POST /api/mobile/reviews/distributor – submit a distributor (seller) review. */
export async function POST(request: NextRequest) {
  const headers = getSecurityHeaders();

  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Authorization token required' }, { status: 401, headers });
    }

    const auth = await getAuthenticatedMarketplaceUserId(request);
    if (!auth.ok) {
      if (auth.reason === 'suspended') {
        return NextResponse.json({ error: 'Account suspended' }, { status: 403, headers });
      }
      return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401, headers });
    }
    const userId = auth.userId;

    const rateLimitResponse = await marketplaceMutationRateLimiter(request, userId, 'review-distributor');
    if (rateLimitResponse) return rateLimitResponse;

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
      { status: 500, headers }
    );
  }
}
