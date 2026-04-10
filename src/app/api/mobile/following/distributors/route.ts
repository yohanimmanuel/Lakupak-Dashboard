import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSecurityHeaders } from '@/utils/auth-security';
import { verifyAccessToken } from '@/lib/jwt';

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

    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Authorization token required' }, { status: 401, headers });
    }

    let marketplaceUserId: number;
    try {
      const payload = verifyAccessToken(authHeader.replace('Bearer ', ''));
      marketplaceUserId = payload.sub;
    } catch {
      return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401, headers });
    }

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

    const items = (followings as Array<{ createdAt: Date; distributor: any }>).map((f) => {
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

    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Authorization token required' }, { status: 401, headers });
    }

    let marketplaceUserId: number;
    try {
      const payload = verifyAccessToken(authHeader.replace('Bearer ', ''));
      marketplaceUserId = payload.sub;
    } catch {
      return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401, headers });
    }

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

