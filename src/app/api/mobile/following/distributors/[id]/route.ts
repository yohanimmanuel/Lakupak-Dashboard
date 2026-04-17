import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSecurityHeaders } from '@/utils/auth-security';
import { getAuthenticatedMarketplaceUserId } from '@/utils/auth-helpers';

/**
 * GET /api/mobile/following/distributors/[id]
 * Check whether the authenticated buyer follows a distributor.
 *
 * DELETE /api/mobile/following/distributors/[id]
 * Unfollow a distributor (idempotent).
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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

    const { id } = await params;
    const distributorId = id ? parseInt(id, 10) : NaN;
    if (!Number.isFinite(distributorId) || distributorId < 1) {
      return NextResponse.json({ error: 'Invalid distributor id' }, { status: 400, headers });
    }

    const found = await p.distributorFollowing.findUnique({
      where: { marketplaceUserId_distributorId: { marketplaceUserId, distributorId } },
      select: { id: true },
    });

    return NextResponse.json({ ok: true, isFollowing: !!found }, { status: 200, headers });
  } catch (e) {
    console.error('Check following error:', e);
    return NextResponse.json({ error: 'Failed to check following state' }, { status: 500, headers });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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

    const { id } = await params;
    const distributorId = id ? parseInt(id, 10) : NaN;
    if (!Number.isFinite(distributorId) || distributorId < 1) {
      return NextResponse.json({ error: 'Invalid distributor id' }, { status: 400, headers });
    }

    await p.distributorFollowing.deleteMany({
      where: { marketplaceUserId, distributorId },
    });

    return NextResponse.json({ ok: true }, { status: 200, headers });
  } catch (e) {
    console.error('Unfollow distributor error:', e);
    return NextResponse.json({ error: 'Failed to unfollow distributor' }, { status: 500, headers });
  }
}

