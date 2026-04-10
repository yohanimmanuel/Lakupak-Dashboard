import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSecurityHeaders } from '@/utils/auth-security';

/**
 * GET /api/marketplace/followers-count?userId=123
 * Returns follower count for a distributor (dashboard user).
 */
export async function GET(req: NextRequest) {
  const headers = getSecurityHeaders();
  try {
    const { searchParams } = new URL(req.url);
    const raw = searchParams.get('userId');
    const userId = raw ? parseInt(raw, 10) : NaN;
    if (!Number.isFinite(userId) || userId < 1) {
      return NextResponse.json({ error: 'Invalid userId' }, { status: 400, headers });
    }

    const p = prisma as unknown as typeof prisma & { distributorFollowing: typeof prisma.userActivity };
    const followersCount = await p.distributorFollowing.count({ where: { distributorId: userId } });

    return NextResponse.json({ ok: true, followersCount }, { status: 200, headers });
  } catch (e) {
    console.error('Followers count error:', e);
    return NextResponse.json({ error: 'Failed to load followers count' }, { status: 500, headers });
  }
}

