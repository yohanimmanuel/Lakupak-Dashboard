import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSecurityHeaders } from '@/utils/auth-security';
import { verifyAccessToken } from '@/lib/jwt';

const select = {
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
} as const;

/**
 * All published homepage offers for Marketplace (carousel + list). Ordered for display.
 */
export async function GET(request: NextRequest) {
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

    const offers = await prisma.marketplaceHomeOffer.findMany({
      where: { isPublished: true },
      orderBy: [{ sortOrder: 'asc' }, { publishedAt: 'desc' }],
      take: 50,
      select,
    });

    return NextResponse.json(
      {
        ok: true,
        offers: offers.map((o) => ({
          ...o,
          publishedAt: o.publishedAt ? o.publishedAt.toISOString() : null,
        })),
      },
      { status: 200, headers }
    );
  } catch (e) {
    console.error('Mobile offers list error:', e);
    return NextResponse.json({ error: 'Failed to load offers' }, { status: 500, headers });
  }
}
