import { NextRequest, NextResponse } from 'next/server';
import { compare } from 'bcryptjs';
import { prisma } from '@/lib/db';
import { getSecurityHeaders } from '../../../../../utils/auth-security';
import { loginRateLimiter } from '../../../../../utils/rateLimiter';
import jwt from 'jsonwebtoken';
import { auditAuth } from '@/lib/audit';

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET is not set');
  return secret;
}

export async function POST(req: NextRequest) {
  const rateLimitResponse = await loginRateLimiter(req);
  if (rateLimitResponse) return rateLimitResponse;

  const headers = getSecurityHeaders();

  try {
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: 'Invalid request format' }, { status: 400, headers });
    }

    const { username, password } = body as { username?: unknown; password?: unknown };

    if (!username || typeof username !== 'string') {
      return NextResponse.json({ error: 'Username is required' }, { status: 400, headers });
    }
    if (!password || typeof password !== 'string') {
      return NextResponse.json({ error: 'Password is required' }, { status: 400, headers });
    }

    const driver = await prisma.driver.findUnique({
      where: { username: username.trim() },
      select: { id: true, userId: true, name: true, username: true, phone: true, avatar: true, passwordHash: true },
    });

    if (!driver) {
      return NextResponse.json({ error: 'Invalid username or password' }, { status: 401, headers });
    }

    if (!driver.passwordHash || driver.passwordHash === '') {
      return NextResponse.json({ error: 'Invalid username or password' }, { status: 401, headers });
    }

    const valid = await compare(password, driver.passwordHash);
    if (!valid) {
      auditAuth(req, {
        action: 'login',
        actorType: 'driver',
        actorId: driver.id,
        success: false,
        metadata: { scope: 'driver', reason: 'bad_password' },
      });
      return NextResponse.json({ error: 'Invalid username or password' }, { status: 401, headers });
    }

    auditAuth(req, {
      action: 'login',
      actorType: 'driver',
      actorId: driver.id,
      success: true,
      metadata: { scope: 'driver', distributorId: driver.userId },
    });

    const token = jwt.sign(
      { sub: driver.id, type: 'driver', userId: driver.userId },
      getJwtSecret(),
      { expiresIn: '30d' },
    );

    return NextResponse.json(
      {
        token,
        driver: {
          id: driver.id,
          name: driver.name,
          username: driver.username,
          phone: driver.phone ?? null,
          avatar: driver.avatar ?? null,
          distributorId: driver.userId,
        },
      },
      {
        status: 200,
        headers: { ...headers, 'Cache-Control': 'no-store, no-cache, must-revalidate, private' },
      },
    );
  } catch {
    return NextResponse.json(
      { error: 'An unexpected error occurred. Please try again.' },
      { status: 500, headers },
    );
  }
}
