import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSecurityHeaders } from '@/utils/auth-security';
import { getAuthenticatedUserId } from '@/utils/auth-helpers';
import { broadcastMarketplaceHomeOffersRefresh } from '@/utils/websocketBroadcast';
import { normalizeOfferIconKey } from '@/utils/marketplaceHomeOfferIcons';
import { settingsOperationRateLimiter } from '@/utils/rateLimiter';
import { validateCampaignCreateFields } from '@/lib/offers/campaignFieldValidation';

function parseLimit(req: NextRequest): number {
  const raw = new URL(req.url).searchParams.get('limit');
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

const offerSelect = {
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
} as const;

function toJson<T extends { publishedAt: Date | null; createdAt: Date; updatedAt: Date }>(row: T) {
  return {
    ...row,
    publishedAt: row.publishedAt ? row.publishedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function GET(req: NextRequest) {
  const headers = getSecurityHeaders();
  try {
    const userId = await getAuthenticatedUserId(req);
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers });

    const limit = parseLimit(req);
    const offset = parseOffset(req);
    const where = { userId };

    const [offers, totalCount] = await Promise.all([
      prisma.marketplaceHomeOffer.findMany({
        where,
        orderBy: [{ sortOrder: 'asc' }, { publishedAt: 'desc' }, { createdAt: 'desc' }],
        skip: offset,
        take: limit,
        select: offerSelect,
      }),
      prisma.marketplaceHomeOffer.count({ where }),
    ]);

    return NextResponse.json(
      { offers: offers.map(toJson), totalCount },
      { status: 200, headers },
    );
  } catch {
    return NextResponse.json({ error: 'Failed to load offers' }, { status: 500, headers });
  }
}

export async function POST(req: NextRequest) {
  const headers = getSecurityHeaders();
  try {
    const userId = await getAuthenticatedUserId(req);
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers });

    const rateLimitResponse = await settingsOperationRateLimiter(req, userId);
    if (rateLimitResponse) return rateLimitResponse;

    const body = await req.json().catch(() => null);
    if (!body) return NextResponse.json({ error: 'Invalid request format' }, { status: 400, headers });

    const {
      discountText,
      endDateText,
      sortOrder,
      isPublished,
      rightIconKey,
      discountIconKey,
    } = body as Record<string, unknown>;

    const parsed = validateCampaignCreateFields(body as Record<string, unknown>);
    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error }, { status: 400, headers });
    }

    const published = typeof isPublished === 'boolean' ? isPublished : false;
    const sort = typeof sortOrder === 'number' && Number.isFinite(sortOrder) ? Math.floor(sortOrder) : 0;

    const created = await prisma.marketplaceHomeOffer.create({
      data: {
        userId,
        title: parsed.fields.title,
        subtitle: parsed.fields.subtitle,
        discountText: typeof discountText === 'string' ? discountText.trim() : '',
        endDateText: typeof endDateText === 'string' ? endDateText.trim() : '',
        backgroundColor: parsed.fields.backgroundColor,
        textColor: parsed.fields.textColor,
        detailsBody: parsed.fields.detailsBody,
        bannerImageUrl: parsed.fields.bannerImageUrl,
        customBannerImageUrl: parsed.fields.customBannerImageUrl,
        rightIconKey: normalizeOfferIconKey(rightIconKey, 'gift'),
        discountIconKey: normalizeOfferIconKey(discountIconKey, 'flash'),
        sortOrder: sort,
        isPublished: published,
        publishedAt: published ? new Date() : null,
      },
      select: offerSelect,
    });

    void broadcastMarketplaceHomeOffersRefresh(userId);

    return NextResponse.json({ ok: true, offer: toJson(created) }, { status: 201, headers });
  } catch {
    return NextResponse.json({ error: 'Failed to create offer' }, { status: 500, headers });
  }
}
