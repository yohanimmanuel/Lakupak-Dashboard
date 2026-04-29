import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSecurityHeaders, validateAuthInput } from '@/utils/auth-security';
import { hash } from 'bcryptjs';
import { signPlatformAdminToken } from '@/lib/platform-admin-jwt';
import { PLATFORM_ADMIN_COOKIE } from '@/utils/platform-admin-auth';
import { getClientIp, rateLimit } from '@/utils/rateLimiter';

/**
 * One-time bootstrap endpoint to create the FIRST PlatformAdmin.
 * Guarded by PLATFORM_ADMIN_BOOTSTRAP_KEY (server env), and only works when
 * there are no PlatformAdmin records yet.
 */
export async function POST(req: NextRequest) {
  const headers = getSecurityHeaders();

  const bootstrapKey = process.env.PLATFORM_ADMIN_BOOTSTRAP_KEY;
  if (!bootstrapKey || bootstrapKey.trim() === '') {
    return NextResponse.json(
      { error: 'Bootstrap is not enabled on this server.' },
      { status: 403, headers }
    );
  }

  const provided = req.headers.get('x-platform-admin-bootstrap-key') || '';
  if (provided !== bootstrapKey) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403, headers });
  }

  // Even though this is guarded by a secret header, rate limit to reduce brute-force/noise.
  const ip = getClientIp(req);
  const rateLimitResponse = await rateLimit(req, {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 10,
    message: 'Too many bootstrap attempts. Please slow down.',
    keyGenerator: () => `platform-admin-bootstrap:${ip}`,
    progressivePenalty: true,
    burstLimit: 3,
    burstWindowMs: 1000,
  });
  if (rateLimitResponse) return rateLimitResponse;

  const body = await req.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: 'Invalid request format' }, { status: 400, headers });
  }

  const { email, password, name } = body as { email?: unknown; password?: unknown; name?: unknown };
  const emailValidation = validateAuthInput.email(String(email));
  if (!emailValidation.valid) {
    return NextResponse.json({ error: emailValidation.error }, { status: 400, headers });
  }
  if (!password || typeof password !== 'string' || password.length < 8) {
    return NextResponse.json(
      { error: 'Password must be at least 8 characters.' },
      { status: 400, headers }
    );
  }

  const normalizedEmail = String(email).trim().toLowerCase();
  const displayName = typeof name === 'string' ? name.trim() : undefined;

  const existingCount = await prisma.platformAdmin.count();
  if (existingCount > 0) {
    return NextResponse.json(
      { error: 'Platform admin already bootstrapped.' },
      { status: 409, headers }
    );
  }

  const passwordHash = await hash(password, 10);
  const created = await prisma.platformAdmin.create({
    data: {
      email: normalizedEmail,
      passwordHash,
      name: displayName && displayName.length > 0 ? displayName : null,
      isActive: true,
    },
    select: { id: true, email: true, name: true, isActive: true, createdAt: true },
  });

  // Auto-login after bootstrap so the user lands in /admin immediately.
  const token = signPlatformAdminToken({ sub: created.id }, '30d');
  const res = NextResponse.json({ ok: true, admin: created }, { status: 201, headers });
  res.cookies.set(PLATFORM_ADMIN_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 30 * 24 * 60 * 60,
  });
  return res;
}

