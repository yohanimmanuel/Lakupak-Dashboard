import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSecurityHeaders } from '@/utils/auth-security';
import { verifyAccessToken } from '@/lib/jwt';

function getId(raw: string | undefined) {
  const id = Number(raw);
  return Number.isFinite(id) ? id : null;
}

/**
 * Published home offer detail (buyer must be authenticated).
 */
export async function GET(
  request: NextRequest,
  ctx: { params: Promise<{ offerId: string }> }
) {
  const headers = getSecurityHeaders();

  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Authorization token required' }, { status: 401, headers });
    }

    try {
      verifyAccessToken(authHeader.replace('Bearer ', ''));
    } catch {
      return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401, headers });
    }

    const params = await ctx.params;
    const id = getId(params.offerId);
    if (!id) {
      return NextResponse.json({ error: 'Invalid offer id' }, { status: 400, headers });
    }

    const offer = await prisma.marketplaceHomeOffer.findFirst({
      where: { id, isPublished: true },
      select: {
        id: true,
        title: true,
        subtitle: true,
        discountText: true,
        endDateText: true,
        backgroundColor: true,
        textColor: true,
        detailsBody: true,
        bannerImageUrl: true,
        customBannerImageUrl: true,
        rightIconKey: true,
        discountIconKey: true,
        publishedAt: true,
      },
    });

    if (!offer) {
      return NextResponse.json({ error: 'Offer not found' }, { status: 404, headers });
    }

    return NextResponse.json(
      {
        ok: true,
        offer: {
          ...offer,
          publishedAt: offer.publishedAt ? offer.publishedAt.toISOString() : null,
        },
      },
      { status: 200, headers }
    );
  } catch (e) {
    console.error('Offer detail error:', e);
    return NextResponse.json({ error: 'Failed to load offer' }, { status: 500, headers });
  }
}
