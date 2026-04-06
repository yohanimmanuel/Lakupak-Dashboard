import { NextRequest } from 'next/server';
import { verifyPlatformAdminToken } from '@/lib/platform-admin-jwt';

export const PLATFORM_ADMIN_COOKIE = 'laku_platform_admin';

export function getPlatformAdminIdFromRequest(req: NextRequest): number | null {
  const token = req.cookies.get(PLATFORM_ADMIN_COOKIE)?.value;
  if (!token) return null;
  try {
    const payload = verifyPlatformAdminToken(token);
    return payload.sub;
  } catch {
    return null;
  }
}

export function requirePlatformAdminId(req: NextRequest): number {
  const adminId = getPlatformAdminIdFromRequest(req);
  if (!adminId) {
    throw new Error('UNAUTHORIZED_PLATFORM_ADMIN');
  }
  return adminId;
}

