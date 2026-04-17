import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSecurityHeaders } from '@/utils/auth-security';
import { getAuthenticatedMarketplaceUserId } from '@/utils/auth-helpers';

/**
 * Active homepage sale banner for the Marketplace home screen (first published offer by sort order).
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

    const offer = await prisma.marketplaceHomeOffer.findFirst({
      where: { isPublished: true },
      orderBy: [{ sortOrder: 'asc' }, { publishedAt: 'desc' }],
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
      return NextResponse.json({ ok: true, offer: null }, { status: 200, headers });
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
    console.error('Home offer error:', e);
    return NextResponse.json({ error: 'Failed to load offer' }, { status: 500, headers });
  }
}
