import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSecurityHeaders } from '../../../../utils/auth-security';
import jwt from 'jsonwebtoken';
import { driverPushTokenRateLimiter } from '@/utils/rateLimiter';

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET is not set');
  return secret;
}

function verifyDriverToken(req: NextRequest): { sub: number; type: string } | null {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;
  try {
    const decoded = jwt.verify(authHeader.slice(7), getJwtSecret());
    if (!decoded || typeof decoded !== 'object') return null;
    const payload = decoded as Record<string, unknown>;
    if (typeof payload.type !== 'string') return null;
    let sub: number;
    if (typeof payload.sub === 'number') sub = payload.sub;
    else if (typeof payload.sub === 'string') sub = parseInt(payload.sub, 10);
    else return null;
    if (!Number.isFinite(sub) || Math.floor(sub) !== sub) return null;
    return { sub, type: payload.type };
  } catch {
    return null;
  }
}

/**
 * POST /api/driver/push-token
 * Register or refresh an Expo push token for a driver.
 * Body: { token: string; platform: 'ios' | 'android' }
 */
export async function POST(req: NextRequest) {
  const headers = getSecurityHeaders();
  const payload = verifyDriverToken(req);
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers });
  if (payload.type !== 'driver') return NextResponse.json({ error: 'Invalid token type' }, { status: 403, headers });

  const rateLimitResponse = await driverPushTokenRateLimiter(req, payload.sub);
  if (rateLimitResponse) return rateLimitResponse;

  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400, headers });
  }

  const { token, platform, language } = (body ?? {}) as Record<string, unknown>;

  if (typeof token !== 'string' || !token.trim()) {
    return NextResponse.json({ error: 'token is required' }, { status: 400, headers });
  }
  if (!['ios', 'android'].includes(platform as string)) {
    return NextResponse.json({ error: 'platform must be ios or android' }, { status: 400, headers });
  }
  // Optional — used so the server can localize OS push banners delivered while the app is idle/closed.
  const normalizedLanguage =
    typeof language === 'string' && /^[a-z]{2}$/i.test(language) ? language.toLowerCase() : null;

  try {
    // If another driver owns this token (device switch) reassign it
    const existing = await prisma.driverPushNotificationToken.findFirst({ where: { token } });
    if (existing && existing.driverId !== payload.sub) {
      await prisma.driverPushNotificationToken.update({
        where: { token },
        data: {
          driverId: payload.sub,
          platform: platform as string,
          isActive: true,
          ...(normalizedLanguage != null ? { language: normalizedLanguage } : {}),
        },
      });
      return NextResponse.json({ ok: true }, { headers });
    }

    await prisma.driverPushNotificationToken.upsert({
      where: { token },
      update: {
        platform: platform as string,
        isActive: true,
        ...(normalizedLanguage != null ? { language: normalizedLanguage } : {}),
      },
      create: {
        driverId: payload.sub,
        token,
        platform: platform as string,
        isActive: true,
        ...(normalizedLanguage != null ? { language: normalizedLanguage } : {}),
      },
    });
    return NextResponse.json({ ok: true }, { headers });
  } catch (err) {
    console.error('[driver/push-token POST]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers });
  }
}

/**
 * PATCH /api/driver/push-token
 * Update the preferred language on every active push token belonging to the driver.
 * Lets the app keep the server's translation language in sync without needing the
 * Expo push token cached client-side. Body: { language: 'id' | 'en' }
 */
export async function PATCH(req: NextRequest) {
  const headers = getSecurityHeaders();
  const payload = verifyDriverToken(req);
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers });
  if (payload.type !== 'driver') return NextResponse.json({ error: 'Invalid token type' }, { status: 403, headers });

  const rateLimitResponse = await driverPushTokenRateLimiter(req, payload.sub);
  if (rateLimitResponse) return rateLimitResponse;

  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400, headers });
  }
  const { language } = (body ?? {}) as Record<string, unknown>;
  if (typeof language !== 'string' || !/^[a-z]{2}$/i.test(language)) {
    return NextResponse.json({ error: 'language must be a 2-letter code' }, { status: 400, headers });
  }

  try {
    await prisma.driverPushNotificationToken.updateMany({
      where: { driverId: payload.sub, isActive: true },
      data: { language: language.toLowerCase() },
    });
    return NextResponse.json({ ok: true }, { headers });
  } catch (err) {
    console.error('[driver/push-token PATCH]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers });
  }
}

/**
 * DELETE /api/driver/push-token
 * Deactivate a push token on logout.
 * Body: { token: string }
 */
export async function DELETE(req: NextRequest) {
  const headers = getSecurityHeaders();
  const payload = verifyDriverToken(req);
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers });
  if (payload.type !== 'driver') return NextResponse.json({ error: 'Invalid token type' }, { status: 403, headers });

  const rateLimitResponse = await driverPushTokenRateLimiter(req, payload.sub);
  if (rateLimitResponse) return rateLimitResponse;

  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400, headers });
  }

  const { token } = (body ?? {}) as Record<string, unknown>;
  if (typeof token !== 'string' || !token.trim()) {
    return NextResponse.json({ error: 'token is required' }, { status: 400, headers });
  }

  try {
    await prisma.driverPushNotificationToken.updateMany({
      where: { token, driverId: payload.sub },
      data: { isActive: false },
    });
    return NextResponse.json({ ok: true }, { headers });
  } catch (err) {
    console.error('[driver/push-token DELETE]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers });
  }
}
