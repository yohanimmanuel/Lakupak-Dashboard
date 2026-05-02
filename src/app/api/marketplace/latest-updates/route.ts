import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSecurityHeaders } from '@/utils/auth-security';
import { mapHomeOfferToLatestUpdatePublic } from '@/utils/homeOfferLatestUpdate';

function parseLimit(req: NextRequest): number {
  const { searchParams } = new URL(req.url);
  const raw = searchParams.get('limit');
  const n = raw ? Number(raw) : 50;
  if (!Number.isFinite(n)) return 50;
  return Math.min(Math.max(1, Math.floor(n)), 100);
}

/**
 * Public read-only feed for the Marketplace app ("Latest updates").
 * Merges published platform announcements with published homepage sale offers (MarketplaceHomeOffer).
 * Home offers use negative `id` values to avoid colliding with PlatformAnnouncement ids.
 */
export async function GET(req: NextRequest) {
  const headers = getSecurityHeaders();
  try {
    const limit = parseLimit(req);
    const { searchParams } = new URL(req.url);
    const categoryRaw = searchParams.get('category');
    const category =
      typeof categoryRaw === 'string' && categoryRaw.trim().length > 0 ? categoryRaw.trim() : null;

    const offerSelect = {
      id: true,
      title: true,
      subtitle: true,
      detailsBody: true,
      discountText: true,
      endDateText: true,
      bannerImageUrl: true,
      customBannerImageUrl: true,
      publishedAt: true,
      createdAt: true,
    };

    /** Home offers are modeled as category `promotion` in the merged feed. */
    const includeHomeOffers =
      !category ||
      category.toLowerCase() === 'promotion' ||
      category.toLowerCase() === 'promotions';

    const [announcements, homeOffers] = await Promise.all([
      prisma.platformAnnouncement.findMany({
        where: {
          isPublished: true,
          ...(category ? { category: { equals: category, mode: 'insensitive' } } : {}),
        },
        orderBy: [{ publishedAt: 'desc' }, { createdAt: 'desc' }],
        take: limit,
        select: {
          id: true,
          title: true,
          body: true,
          category: true,
          imageUrl: true,
          linkUrl: true,
          publishedAt: true,
          createdAt: true,
        },
      }),
      includeHomeOffers
        ? prisma.marketplaceHomeOffer.findMany({
            where: { isPublished: true },
            orderBy: [{ publishedAt: 'desc' }, { createdAt: 'desc' }],
            take: limit,
            select: offerSelect,
          })
        : Promise.resolve([]),
    ]);

    const announcementRows = announcements.map((a) => ({
      id: a.id,
      title: a.title,
      body: a.body,
      category: a.category,
      imageUrl: a.imageUrl,
      linkUrl: a.linkUrl,
      publishedAt: a.publishedAt ? a.publishedAt.toISOString() : null,
      createdAt: a.createdAt.toISOString(),
      _sort: (a.publishedAt ?? a.createdAt).getTime(),
    }));

    const offerRows = homeOffers.map((o) => {
      const pub = mapHomeOfferToLatestUpdatePublic(o, 'list');
      return {
        ...pub,
        _sort: (o.publishedAt ?? o.createdAt).getTime(),
      };
    });

    const merged = [...announcementRows, ...offerRows]
      .sort((x, y) => y._sort - x._sort)
      .slice(0, limit)
      .map(({ _sort: _, ...row }) => row);

    return NextResponse.json({ announcements: merged }, { status: 200, headers });
  } catch {
    return NextResponse.json({ error: 'Failed to load latest updates' }, { status: 500, headers });
  }
}
