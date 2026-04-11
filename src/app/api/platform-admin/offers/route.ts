import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSecurityHeaders } from '@/utils/auth-security';
import { requirePlatformAdminId } from '@/utils/platform-admin-auth';
import { broadcastMarketplaceHomeOffersRefresh } from '@/utils/websocketBroadcast';
import { normalizeOfferIconKey } from '@/utils/marketplaceHomeOfferIcons';

function parseLimit(req: NextRequest): number {
  const { searchParams } = new URL(req.url);
  const raw = searchParams.get('limit');
  const n = raw ? Number(raw) : 50;
  if (!Number.isFinite(n)) return 50;
  return Math.min(Math.max(1, Math.floor(n)), 100);
}

function parseOffset(req: NextRequest): number {
  const raw = new URL(req.url).searchParams.get('offset');
  const n = raw ? Number(raw) : 0;
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.floor(n));
}

export async function GET(req: NextRequest) {
  const headers = getSecurityHeaders();
  try {
    requirePlatformAdminId(req);
    const limit = parseLimit(req);
    const offset = parseOffset(req);

    const [offers, totalCount] = await Promise.all([
      prisma.marketplaceHomeOffer.findMany({
        orderBy: [{ sortOrder: 'asc' }, { publishedAt: 'desc' }, { createdAt: 'desc' }],
        skip: offset,
        take: limit,
        select: {
          id: true,
          title: true,
          subtitle: true,
          discountText: true,
          endDateText: true,
          backgroundColor: true,
          textColor: true,
          detailsBody: true,
          isPublished: true,
          publishedAt: true,
          sortOrder: true,
          bannerImageUrl: true,
          customBannerImageUrl: true,
          rightIconKey: true,
          discountIconKey: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      prisma.marketplaceHomeOffer.count(),
    ]);

    return NextResponse.json(
      {
        offers: offers.map((o) => ({
          ...o,
          publishedAt: o.publishedAt ? o.publishedAt.toISOString() : null,
          createdAt: o.createdAt.toISOString(),
          updatedAt: o.updatedAt.toISOString(),
        })),
        totalCount,
      },
      { status: 200, headers }
    );
  } catch (err) {
    if (err instanceof Error && err.message === 'UNAUTHORIZED_PLATFORM_ADMIN') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers });
    }
    return NextResponse.json({ error: 'Failed to load offers' }, { status: 500, headers });
  }
}

export async function POST(req: NextRequest) {
  const headers = getSecurityHeaders();
  try {
    const adminId = requirePlatformAdminId(req);
    const body = await req.json().catch(() => null);
    if (!body) return NextResponse.json({ error: 'Invalid request format' }, { status: 400, headers });

    const {
      title,
      subtitle,
      discountText,
      endDateText,
      backgroundColor,
      textColor,
      detailsBody,
      sortOrder,
      isPublished,
      bannerImageUrl,
      customBannerImageUrl,
      rightIconKey,
      discountIconKey,
    } = body as Record<string, unknown>;

    if (!title || typeof title !== 'string' || title.trim().length < 2) {
      return NextResponse.json({ error: 'Title is required.' }, { status: 400, headers });
    }

    const published = typeof isPublished === 'boolean' ? isPublished : false;
    const sort =
      typeof sortOrder === 'number' && Number.isFinite(sortOrder) ? Math.floor(sortOrder) : 0;

    const imageUrl =
      typeof bannerImageUrl === 'string' && bannerImageUrl.trim().length > 0
        ? bannerImageUrl.trim()
        : null;
    const customBannerUrl =
      typeof customBannerImageUrl === 'string' && customBannerImageUrl.trim().length > 0
        ? customBannerImageUrl.trim()
        : null;

    const created = await prisma.marketplaceHomeOffer.create({
      data: {
        title: title.trim(),
        subtitle: typeof subtitle === 'string' ? subtitle.trim() : '',
        discountText: typeof discountText === 'string' ? discountText.trim() : '',
        endDateText: typeof endDateText === 'string' ? endDateText.trim() : '',
        backgroundColor:
          typeof backgroundColor === 'string' && backgroundColor.trim() ? backgroundColor.trim() : '#0a61d7',
        textColor: typeof textColor === 'string' && textColor.trim() ? textColor.trim() : '#FFFFFF',
        detailsBody: typeof detailsBody === 'string' ? detailsBody.trim() : '',
        bannerImageUrl: imageUrl,
        customBannerImageUrl: customBannerUrl,
        rightIconKey: normalizeOfferIconKey(rightIconKey, 'gift'),
        discountIconKey: normalizeOfferIconKey(discountIconKey, 'flash'),
        sortOrder: sort,
        isPublished: published,
        publishedAt: published ? new Date() : null,
        createdByAdminId: adminId,
      },
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
        isPublished: true,
        publishedAt: true,
        sortOrder: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    const offerJson = {
      ...created,
      publishedAt: created.publishedAt ? created.publishedAt.toISOString() : null,
      createdAt: created.createdAt.toISOString(),
      updatedAt: created.updatedAt.toISOString(),
    };

    void broadcastMarketplaceHomeOffersRefresh();

    return NextResponse.json({ ok: true, offer: offerJson }, { status: 201, headers });
  } catch (err) {
    if (err instanceof Error && err.message === 'UNAUTHORIZED_PLATFORM_ADMIN') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers });
    }
    return NextResponse.json({ error: 'Failed to create offer' }, { status: 500, headers });
  }
}
