import { NextRequest, NextResponse } from 'next/server';
import { compare } from 'bcryptjs';
import { prisma } from '@/lib/db';
import { getSecurityHeaders, validateAuthInput } from '@/utils/auth-security';
import { loginRateLimiter } from '@/utils/rateLimiter';
import { signPlatformAdminToken } from '@/lib/platform-admin-jwt';
import { PLATFORM_ADMIN_COOKIE } from '@/utils/platform-admin-auth';

export async function POST(req: NextRequest) {
  const rateLimitResponse = await loginRateLimiter(req);
  if (rateLimitResponse) return rateLimitResponse;

  const headers = getSecurityHeaders();

  try {
    const body = await req.json().catch(() => null);
    if (!body) {
      return NextResponse.json({ error: 'Invalid request format' }, { status: 400, headers });
    }

    const { email, password } = body as { email?: unknown; password?: unknown };
    const emailValidation = validateAuthInput.email(String(email));
    if (!emailValidation.valid) {
      return NextResponse.json({ error: emailValidation.error }, { status: 400, headers });
    }
    if (!password || typeof password !== 'string') {
      return NextResponse.json({ error: 'Password is required' }, { status: 400, headers });
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const admin = await prisma.platformAdmin.findUnique({ where: { email: normalizedEmail } });
    if (!admin || !admin.isActive) {
      return NextResponse.json({ error: 'Invalid email or password' }, { status: 401, headers });
    }

    const valid = await compare(password, admin.passwordHash);
    if (!valid) {
      return NextResponse.json({ error: 'Invalid email or password' }, { status: 401, headers });
    }

    const token = signPlatformAdminToken({ sub: admin.id }, '30d');
    const res = NextResponse.json(
      { ok: true, admin: { id: admin.id, email: admin.email, name: admin.name } },
      { status: 200, headers: { ...headers, 'Cache-Control': 'no-store, no-cache, must-revalidate, private' } }
    );

    res.cookies.set(PLATFORM_ADMIN_COOKIE, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 30 * 24 * 60 * 60,
    });

    return res;
  } catch {
    return NextResponse.json({ error: 'An unexpected error occurred. Please try again.' }, { status: 500, headers });
  }
}

