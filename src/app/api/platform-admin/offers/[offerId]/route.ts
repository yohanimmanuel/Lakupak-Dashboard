import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { getSecurityHeaders } from '@/utils/auth-security';
import { requirePlatformAdminId } from '@/utils/platform-admin-auth';
import { broadcastMarketplaceHomeOffersRefresh } from '@/utils/websocketBroadcast';
import { normalizeOfferIconKey } from '@/utils/marketplaceHomeOfferIcons';
import { platformAdminMutationRateLimiter } from '@/utils/rateLimiter';

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
};

export async function GET(req: NextRequest, ctx: { params: Promise<{ offerId: string }> }) {
  const headers = getSecurityHeaders();
  try {
    requirePlatformAdminId(req);
    const params = await ctx.params;
    const id = getId(params);
    if (!id) return NextResponse.json({ error: 'Invalid offer id' }, { status: 400, headers });

    const offer = await prisma.marketplaceHomeOffer.findUnique({
      where: { id },
      select: offerSelect,
    });

    if (!offer) {
      return NextResponse.json({ error: 'Not found' }, { status: 404, headers });
    }

    return NextResponse.json(
      {
        offer: {
          ...offer,
          publishedAt: offer.publishedAt ? offer.publishedAt.toISOString() : null,
          createdAt: offer.createdAt.toISOString(),
          updatedAt: offer.updatedAt.toISOString(),
        },
      },
      { status: 200, headers }
    );
  } catch (err) {
    if (err instanceof Error && err.message === 'UNAUTHORIZED_PLATFORM_ADMIN') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers });
    }
    return NextResponse.json({ error: 'Failed to load offer' }, { status: 500, headers });
  }
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ offerId: string }> }) {
  const headers = getSecurityHeaders();
  try {
    const adminId = requirePlatformAdminId(req);

    const rateLimitResponse = await platformAdminMutationRateLimiter(req, adminId);
    if (rateLimitResponse) return rateLimitResponse;

    const params = await ctx.params;
    const id = getId(params);
    if (!id) return NextResponse.json({ error: 'Invalid offer id' }, { status: 400, headers });

    const body = await req.json().catch(() => null);
    if (!body) return NextResponse.json({ error: 'Invalid request format' }, { status: 400, headers });

    const patch = body as Record<string, unknown>;
    const data: Record<string, unknown> = {};

    if (typeof patch.title === 'string') data.title = patch.title.trim();
    if (typeof patch.subtitle === 'string') data.subtitle = patch.subtitle.trim();
    if (typeof patch.discountText === 'string') data.discountText = patch.discountText.trim();
    if (typeof patch.endDateText === 'string') data.endDateText = patch.endDateText.trim();
    if (typeof patch.backgroundColor === 'string') data.backgroundColor = patch.backgroundColor.trim() || '#0a61d7';
    if (typeof patch.textColor === 'string') data.textColor = patch.textColor.trim() || '#FFFFFF';
    if (typeof patch.detailsBody === 'string') data.detailsBody = patch.detailsBody.trim();
    if (typeof patch.sortOrder === 'number' && Number.isFinite(patch.sortOrder)) {
      data.sortOrder = Math.floor(patch.sortOrder);
    }
    if (typeof patch.isPublished === 'boolean') {
      data.isPublished = patch.isPublished;
      data.publishedAt = patch.isPublished ? new Date() : null;
    }
    if ('bannerImageUrl' in patch) {
      data.bannerImageUrl =
        typeof patch.bannerImageUrl === 'string' && patch.bannerImageUrl.trim().length > 0
          ? patch.bannerImageUrl.trim()
          : null;
    }
    if ('customBannerImageUrl' in patch) {
      data.customBannerImageUrl =
        typeof patch.customBannerImageUrl === 'string' && patch.customBannerImageUrl.trim().length > 0
          ? patch.customBannerImageUrl.trim()
          : null;
    }
    if ('rightIconKey' in patch) {
      data.rightIconKey = normalizeOfferIconKey(patch.rightIconKey, 'gift');
    }
    if ('discountIconKey' in patch) {
      data.discountIconKey = normalizeOfferIconKey(patch.discountIconKey, 'flash');
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: 'No changes provided' }, { status: 400, headers });
    }

    const updated = await prisma.marketplaceHomeOffer.update({
      where: { id },
      data,
      select: offerSelect,
    });

    const offerJson = {
      ...updated,
      publishedAt: updated.publishedAt ? updated.publishedAt.toISOString() : null,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
    };

    void broadcastMarketplaceHomeOffersRefresh();

    return NextResponse.json({ ok: true, offer: offerJson }, { status: 200, headers });
  } catch (err) {
    if (err instanceof Error && err.message === 'UNAUTHORIZED_PLATFORM_ADMIN') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers });
    }
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
      return NextResponse.json({ error: 'Offer not found' }, { status: 404, headers });
    }
    return NextResponse.json({ error: 'Failed to update offer' }, { status: 500, headers });
  }
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ offerId: string }> }) {
  const headers = getSecurityHeaders();
  try {
    const adminId = requirePlatformAdminId(req);

    const rateLimitResponse = await platformAdminMutationRateLimiter(req, adminId);
    if (rateLimitResponse) return rateLimitResponse;

    const params = await ctx.params;
    const id = getId(params);
    if (!id) return NextResponse.json({ error: 'Invalid offer id' }, { status: 400, headers });

    await prisma.marketplaceHomeOffer.delete({ where: { id } });
    void broadcastMarketplaceHomeOffersRefresh();

    return NextResponse.json({ ok: true }, { status: 200, headers });
  } catch (err) {
    if (err instanceof Error && err.message === 'UNAUTHORIZED_PLATFORM_ADMIN') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers });
    }
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
      return NextResponse.json({ error: 'Offer not found' }, { status: 404, headers });
    }
    return NextResponse.json({ error: 'Failed to delete offer' }, { status: 500, headers });
  }
}
