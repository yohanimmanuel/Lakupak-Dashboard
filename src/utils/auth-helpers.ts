import { NextRequest } from 'next/server';
import { verifyAccessToken } from '../lib/jwt';
import { prisma } from '@/lib/db';

async function resolveDashboardUserId(userId: number): Promise<number | null> {
  if (!Number.isInteger(userId) || userId <= 0) return null;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, isSuspended: true },
  });
  if (!user || user.isSuspended) return null;
  return user.id;
}

/**
 * Extract authenticated **dashboard** user id from JWT (ws-token / API clients) or NextAuth session.
 *
 * Rejects marketplace and driver JWTs even when `sub` is numeric. Legacy tokens without a `type`
 * claim are accepted only when `sub` matches an active, non-suspended row in `User`.
 */
export async function getAuthenticatedUserId(req: NextRequest): Promise<number | null> {
  const authHeader = req.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    try {
      const payload = verifyAccessToken(authHeader.replace('Bearer ', ''));
      if (payload.type === 'marketplace' || payload.type === 'driver') {
        return null;
      }
      return await resolveDashboardUserId(payload.sub);
    } catch {
      // Invalid JWT — fall through to NextAuth
    }
  }

  try {
    const { getServerSession } = await import('next-auth');
    const { authOptions } = await import('@/lib/auth-options');
    const session = await getServerSession(authOptions);
    if (session?.user) {
      const raw = (session.user as { id?: number | string }).id;
      const userId =
        typeof raw === 'number'
          ? raw
          : typeof raw === 'string'
            ? parseInt(raw, 10)
            : NaN;
      if (!Number.isNaN(userId)) {
        return await resolveDashboardUserId(userId);
      }
    }
  } catch {
    // Session check failed
  }

  return null;
}

type MarketplaceAuthResult =
  | { ok: true; userId: number }
  | { ok: false; reason: 'missing_token' | 'invalid_token' | 'suspended' };

/**
 * Auth helper for Marketplace mobile JWT flows.
 * - Validates token
 * - Ensures marketplace account is not suspended
 */
export async function getAuthenticatedMarketplaceUserId(req: NextRequest): Promise<MarketplaceAuthResult> {
  const authHeader = req.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) return { ok: false, reason: 'missing_token' };

  let userId: number;
  try {
    const payload = verifyAccessToken(authHeader.replace('Bearer ', ''));
    if (payload.type === 'dashboard' || payload.type === 'driver') {
      return { ok: false, reason: 'invalid_token' };
    }
    userId = payload.sub;
  } catch {
    return { ok: false, reason: 'invalid_token' };
  }

  if (!Number.isInteger(userId) || userId <= 0) return { ok: false, reason: 'invalid_token' };

  try {
    const u = await prisma.marketplaceUser.findUnique({ where: { id: userId }, select: { isSuspended: true } });
    if (!u) return { ok: false, reason: 'invalid_token' };
    if (u.isSuspended) return { ok: false, reason: 'suspended' };
  } catch {
    // If DB check fails, prefer denying rather than allowing expensive access.
    return { ok: false, reason: 'invalid_token' };
  }

  return { ok: true, userId };
}

