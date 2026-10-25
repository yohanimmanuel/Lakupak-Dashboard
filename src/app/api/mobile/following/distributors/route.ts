import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSecurityHeaders } from '@/utils/auth-security';
import { getAuthenticatedMarketplaceUserId } from '@/utils/auth-helpers';
import { marketplaceMutationRateLimiter } from '@/utils/rateLimiter';
import { isMarketplaceMember } from '@/lib/marketplace/access';

/**
 * GET /api/mobile/following/distributors
 * List followed distributors for the authenticated marketplace buyer.
 *
 * POST /api/mobile/following/distributors
 * Follow a distributor (idempotent).
 */
export async function GET(request: NextRequest) {
  const headers = getSecurityHeaders();

  try {
    // Prisma client types may lag until `prisma generate` runs; keep runtime correct.
    const p = prisma as unknown as typeof prisma & { distributorFollowing: typeof prisma.userActivity };

    const auth = await getAuthenticatedMarketplaceUserId(request);
    if (!auth.ok) {
      if (auth.reason === 'suspended') {
        return NextResponse.json({ error: 'Account suspended' }, { status: 403, headers });
      }
      return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401, headers });
    }
    const marketplaceUserId = auth.userId;

    const rateLimitResponse = await marketplaceMutationRateLimiter(request, marketplaceUserId, 'following-list');
    if (rateLimitResponse) return rateLimitResponse;

    const followings = await p.distributorFollowing.findMany({
      where: { marketplaceUserId },
      orderBy: { createdAt: 'desc' },
      select: {
        createdAt: true,
        distributor: {
          select: {
            id: true,
            name: true,
            image: true,
            company: { select: { name: true, logo: true, bannerImage: true } },
          },
        },
      },
    });

    const items = (followings as Array<{
      createdAt: Date;
      distributor: {
        id: number;
        name: string | null;
        image: string | null;
        company: { name: string | null; logo: string | null; bannerImage: string | null } | null;
      };
    }>).map((f) => {
      const company = f.distributor.company;
      return {
        distributorId: f.distributor.id,
        name: company?.name || f.distributor.name || `Distributor #${f.distributor.id}`,
        logo: company?.logo ?? f.distributor.image ?? null,
        bannerImage: company?.bannerImage ?? null,
        followedAt: f.createdAt.toISOString(),
      };
    });

    return NextResponse.json({ ok: true, items }, { status: 200, headers });
  } catch (e) {
    console.error('List followings error:', e);
    return NextResponse.json({ error: 'Failed to load followings' }, { status: 500, headers });
  }
}

export async function POST(request: NextRequest) {
  const headers = getSecurityHeaders();

  try {
    // Prisma client types may lag until `prisma generate` runs; keep runtime correct.
    const p = prisma as unknown as typeof prisma & { distributorFollowing: typeof prisma.userActivity };

    const auth = await getAuthenticatedMarketplaceUserId(request);
    if (!auth.ok) {
      if (auth.reason === 'suspended') {
        return NextResponse.json({ error: 'Account suspended' }, { status: 403, headers });
      }
      return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401, headers });
    }
    const marketplaceUserId = auth.userId;

    const rateLimitResponse = await marketplaceMutationRateLimiter(request, marketplaceUserId, 'following-follow');
    if (rateLimitResponse) return rateLimitResponse;

    let body: { distributorId?: number | string };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400, headers });
    }

    const distributorIdRaw = body.distributorId;
    const distributorId =
      typeof distributorIdRaw === 'number'
        ? distributorIdRaw
        : typeof distributorIdRaw === 'string'
          ? parseInt(distributorIdRaw.trim(), 10)
          : NaN;

    if (!Number.isFinite(distributorId) || distributorId < 1) {
      return NextResponse.json({ error: 'Invalid distributorId' }, { status: 400, headers });
    }

    const seller = await prisma.user.findUnique({ where: { id: distributorId }, select: { id: true } });
    if (!seller) {
      return NextResponse.json({ error: 'Distributor not found' }, { status: 404, headers });
    }
    if (!(await isMarketplaceMember(marketplaceUserId, distributorId))) {
      return NextResponse.json(
        { error: 'This storefront is only open to retailers invited by the distributor', code: 'NOT_A_MEMBER' },
        { status: 403, headers },
      );
    }

    await p.distributorFollowing.upsert({
      where: { marketplaceUserId_distributorId: { marketplaceUserId, distributorId } },
      update: {},
      create: { marketplaceUserId, distributorId },
      select: { id: true },
    });

    return NextResponse.json({ ok: true }, { status: 200, headers });
  } catch (e) {
    console.error('Follow distributor error:', e);
    return NextResponse.json({ error: 'Failed to follow distributor' }, { status: 500, headers });
  }
}

