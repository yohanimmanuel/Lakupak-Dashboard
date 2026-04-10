import { NextRequest, NextResponse } from 'next/server';
import { getSecurityHeaders } from '@/utils/auth-security';
import { getPlatformAdminIdFromRequest } from '@/utils/platform-admin-auth';
import { signPlatformAdminToken } from '@/lib/platform-admin-jwt';

/**
 * GET /api/platform-admin/ws-token
 * Short-lived JWT for WebSocket auth (same server as marketplace WS; use type platform_admin on connect).
 */
export async function GET(req: NextRequest) {
  const headers = getSecurityHeaders();
  const adminId = getPlatformAdminIdFromRequest(req);
  if (!adminId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers });
  }
  try {
    const token = signPlatformAdminToken({ sub: adminId }, '1h');
    return NextResponse.json({ token }, { status: 200, headers });
  } catch {
    return NextResponse.json({ error: 'Failed to issue token' }, { status: 500, headers });
  }
}
