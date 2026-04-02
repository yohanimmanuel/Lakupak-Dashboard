import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSecurityHeaders } from '../../../../utils/auth-security';
import jwt from 'jsonwebtoken';

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
    if (typeof payload.sub === 'number') {
      sub = payload.sub;
    } else if (typeof payload.sub === 'string') {
      sub = parseInt(payload.sub, 10);
    } else {
      return null;
    }
    if (!Number.isFinite(sub) || Math.floor(sub) !== sub) return null;
    return { sub, type: payload.type };
  } catch {
    return null;
  }
}

/**
 * POST /api/driver/location
 * Called by the Laku-Driver app every ~10 seconds to persist the driver's
 * current GPS coordinates so the dashboard map can show the live position.
 *
 * Body: { lat: number; lng: number }
 */
export async function POST(req: NextRequest) {
  const headers = getSecurityHeaders();
  const payload = verifyDriverToken(req);
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers });
  if (payload.type !== 'driver') return NextResponse.json({ error: 'Invalid token type' }, { status: 403, headers });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400, headers });
  }

  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Body must be an object' }, { status: 400, headers });
  }

  const { lat, lng } = body as Record<string, unknown>;

  if (typeof lat !== 'number' || typeof lng !== 'number') {
    return NextResponse.json({ error: 'lat and lng must be numbers' }, { status: 400, headers });
  }

  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return NextResponse.json({ error: 'lat/lng out of valid range' }, { status: 400, headers });
  }

  try {
    await prisma.driver.update({
      where: { id: payload.sub },
      data: {
        lastLat: lat,
        lastLng: lng,
        lastLocationAt: new Date(),
      },
    });
    return NextResponse.json({ ok: true }, { status: 200, headers });
  } catch (err) {
    console.error('[location] Failed to update driver location:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers });
  }
}
