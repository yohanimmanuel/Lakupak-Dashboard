import { NextRequest } from 'next/server';
import { verifyAccessToken } from '../lib/jwt';
import { getServerSession } from 'next-auth';
import { authOptions } from '../app/api/auth/[...nextauth]/route';

/**
 * Extract authenticated user ID from either JWT token or NextAuth session
 * Supports both mobile (JWT) and web (NextAuth) authentication
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
    } catch (error) {
      // Invalid JWT token, fall through to NextAuth check
    }  }

  // Try NextAuth session (web dashboard)
  try {
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
  } catch (error) {
    // Session check failed
  }

  return null;
}

