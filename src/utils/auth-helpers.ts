import { NextRequest } from 'next/server';
import { verifyAccessToken } from '../lib/jwt';
import { prisma } from '@/lib/db';

/**
 * Extract authenticated user ID from either JWT token or NextAuth session
 * Supports both mobile (JWT) and web (NextAuth) authentication.
 * NextAuth is lazy-loaded so AUTH_SECRET is not required at build time (Docker).
 */
export async function getAuthenticatedUserId(req: NextRequest): Promise<number | null> {
  // Try JWT token first (mobile app)
  const authHeader = req.headers.get('authorization');
  if (authHeader && authHeader.startsWith('Bearer ')) {
    try {
      const token = authHeader.replace('Bearer ', '');
      const payload = verifyAccessToken(token);
      // Validate that sub is a positive integer
      if (typeof payload.sub === 'number' && payload.sub > 0 && Number.isInteger(payload.sub)) {
        return payload.sub;
      }
      return null;
    } catch {
      // Invalid JWT token, fall through to NextAuth check
    }
  }

  // Try NextAuth session (web dashboard) — lazy load so build does not require AUTH_SECRET
  try {
    const { getServerSession } = await import('next-auth');
    const { authOptions } = await import('@/lib/auth-options');
    const session = await getServerSession(authOptions);
    if (session?.user) {
      const userId = (session.user as { id?: number | string }).id;
      if (typeof userId === 'number') {
        return userId;
      }
      if (typeof userId === 'string') {
        const parsed = parseInt(userId, 10);
        if (!isNaN(parsed)) {
          return parsed;
        }
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

