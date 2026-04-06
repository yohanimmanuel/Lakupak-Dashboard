import { NextRequest, NextResponse } from 'next/server';
import { getSecurityHeaders } from '@/utils/auth-security';
import { PLATFORM_ADMIN_COOKIE } from '@/utils/platform-admin-auth';

export async function POST(_req: NextRequest) {
  const headers = getSecurityHeaders();
  const res = NextResponse.json({ ok: true }, { status: 200, headers });
  res.cookies.set(PLATFORM_ADMIN_COOKIE, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });
  return res;
}

