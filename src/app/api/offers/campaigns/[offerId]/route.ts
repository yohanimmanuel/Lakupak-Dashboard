import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { getSecurityHeaders } from '@/utils/auth-security';
import { getAuthenticatedUserId } from '@/utils/auth-helpers';
import { broadcastMarketplaceHomeOffersRefresh } from '@/utils/websocketBroadcast';
import { normalizeOfferIconKey } from '@/utils/marketplaceHomeOfferIcons';
import { settingsOperationRateLimiter } from '@/utils/rateLimiter';
import { validateCampaignPatchFields } from '@/lib/offers/campaignFieldValidation';

function getId(params: { offerId?: string }) {
  const id = Number(params.offerId);
  return Number.isFinite(id) ? id : null;
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
  bannerImageUrl: true,
  customBannerImageUrl: true,
  rightIconKey: true,
  discountIconKey: true,
  isPublished: true,
  publishedAt: true,
  sortOrder: true,
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

export async function GET(req: NextRequest, ctx: { params: Promise<{ offerId: string }> }) {
  const headers = getSecurityHeaders();
  try {
    const userId = await getAuthenticatedUserId(req);
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers });

    const id = getId(await ctx.params);
    if (!id) return NextResponse.json({ error: 'Invalid offer id' }, { status: 400, headers });

    const offer = await prisma.marketplaceHomeOffer.findFirst({
      where: { id, userId },
      select: offerSelect,
    });
    if (!offer) return NextResponse.json({ error: 'Not found' }, { status: 404, headers });

    return NextResponse.json({ offer: toJson(offer) }, { status: 200, headers });
  } catch {
    return NextResponse.json({ error: 'Failed to load offer' }, { status: 500, headers });
  }
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ offerId: string }> }) {
  const headers = getSecurityHeaders();
  try {
    const userId = await getAuthenticatedUserId(req);
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers });

    const rateLimitResponse = await settingsOperationRateLimiter(req, userId);
    if (rateLimitResponse) return rateLimitResponse;

    const id = getId(await ctx.params);
    if (!id) return NextResponse.json({ error: 'Invalid offer id' }, { status: 400, headers });

    const body = await req.json().catch(() => null);
    if (!body) return NextResponse.json({ error: 'Invalid request format' }, { status: 400, headers });

    const patch = body as Record<string, unknown>;
    const parsed = validateCampaignPatchFields(patch);
    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error }, { status: 400, headers });
    }

    const data: Prisma.MarketplaceHomeOfferUpdateInput = { ...parsed.fields };

    if (typeof patch.discountText === 'string') data.discountText = patch.discountText.trim();
    if (typeof patch.endDateText === 'string') data.endDateText = patch.endDateText.trim();
    if (typeof patch.sortOrder === 'number' && Number.isFinite(patch.sortOrder)) data.sortOrder = Math.floor(patch.sortOrder);
    if (typeof patch.isPublished === 'boolean') {
      data.isPublished = patch.isPublished;
    }
    if ('rightIconKey' in patch) data.rightIconKey = normalizeOfferIconKey(patch.rightIconKey, 'gift');
    if ('discountIconKey' in patch) data.discountIconKey = normalizeOfferIconKey(patch.discountIconKey, 'flash');

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: 'No changes provided' }, { status: 400, headers });
    }

    const existing = await prisma.marketplaceHomeOffer.findFirst({
      where: { id, userId },
      select: { id: true, isPublished: true },
    });
    if (!existing) return NextResponse.json({ error: 'Offer not found' }, { status: 404, headers });

    if (typeof patch.isPublished === 'boolean' && patch.isPublished !== existing.isPublished) {
      data.publishedAt = patch.isPublished ? new Date() : null;
    }

    const updated = await prisma.marketplaceHomeOffer.update({
      where: { id },
      data,
      select: offerSelect,
    });

    void broadcastMarketplaceHomeOffersRefresh(userId);
    return NextResponse.json({ ok: true, offer: toJson(updated) }, { status: 200, headers });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
      return NextResponse.json({ error: 'Offer not found' }, { status: 404, headers });
    }
    return NextResponse.json({ error: 'Failed to update offer' }, { status: 500, headers });
  }
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ offerId: string }> }) {
  const headers = getSecurityHeaders();
  try {
    const userId = await getAuthenticatedUserId(req);
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers });

    const rateLimitResponse = await settingsOperationRateLimiter(req, userId);
    if (rateLimitResponse) return rateLimitResponse;

    const id = getId(await ctx.params);
    if (!id) return NextResponse.json({ error: 'Invalid offer id' }, { status: 400, headers });

    const existing = await prisma.marketplaceHomeOffer.findFirst({
      where: { id, userId },
      select: { id: true },
    });
    if (!existing) return NextResponse.json({ error: 'Offer not found' }, { status: 404, headers });

    await prisma.marketplaceHomeOffer.delete({ where: { id } });
    void broadcastMarketplaceHomeOffersRefresh(userId);
    return NextResponse.json({ ok: true }, { status: 200, headers });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
      return NextResponse.json({ error: 'Offer not found' }, { status: 404, headers });
    }
    return NextResponse.json({ error: 'Failed to delete offer' }, { status: 500, headers });
  }
}
