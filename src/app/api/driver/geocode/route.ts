import { NextRequest, NextResponse } from 'next/server';
import jwt from 'jsonwebtoken';
import { getSecurityHeaders } from '@/utils/auth-security';
import { resolveGeocodeWithCache } from '@/utils/addressGeocodeCache';
import { getGoogleMapsApiKey } from '@/utils/googleGeocode';
import { mobileGeocodeRateLimiter } from '@/utils/rateLimiter';

const MAX_ADDRESS_LENGTH = 500;

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

/** Google geocoding for Driver app delivery stops (same source as dashboard orders). */
export async function POST(req: NextRequest) {
  const headers = getSecurityHeaders();
  const payload = verifyDriverToken(req);
  if (!payload) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers });
  }
  if (payload.type !== 'driver') {
    return NextResponse.json({ error: 'Invalid token type' }, { status: 403, headers });
  }

  if (!getGoogleMapsApiKey()) {
    return NextResponse.json({ error: 'Geocoding not configured' }, { status: 503, headers });
  }

  const rateLimitResponse = await mobileGeocodeRateLimiter(req, payload.sub);
  if (rateLimitResponse) return rateLimitResponse;

  let body: { address?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400, headers });
  }

  const address = typeof body.address === 'string' ? body.address.trim() : '';
  if (!address) {
    return NextResponse.json({ error: 'address is required' }, { status: 400, headers });
  }
  if (address.length > MAX_ADDRESS_LENGTH) {
    return NextResponse.json({ error: 'address is too long' }, { status: 400, headers });
  }

  try {
    const result = await resolveGeocodeWithCache(address);
    return NextResponse.json(
      {
        coordinates: result.coordinates,
        address: result.address,
        precision: result.precision,
      },
      { status: 200, headers },
    );
  } catch {
    return NextResponse.json({ error: 'Geocoding failed' }, { status: 500, headers });
  }
}
