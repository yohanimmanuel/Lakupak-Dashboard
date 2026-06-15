import { NextRequest, NextResponse } from 'next/server';
import { getSecurityHeaders } from '@/utils/auth-security';
import { getAuthenticatedMarketplaceUserId } from '@/utils/auth-helpers';
import { geocodeWithGoogle, getGoogleMapsApiKey } from '@/utils/googleGeocode';
import { mobileGeocodeRateLimiter } from '@/utils/rateLimiter';

const MAX_ADDRESS_LENGTH = 500;

/**
 * Google Geocoding proxy for Marketplace address preview.
 * No auth required (signup address step) — rate-limited by IP.
 * Optional Bearer token for per-user limits when logged in.
 */
export async function POST(req: NextRequest) {
  const headers = getSecurityHeaders();

  const apiKey = getGoogleMapsApiKey();
  if (!apiKey) {
    return NextResponse.json({ error: 'Geocoding not configured' }, { status: 503, headers });
  }

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

  const auth = await getAuthenticatedMarketplaceUserId(req);
  const userId = auth.ok ? auth.userId : null;

  const rateLimitResponse = await mobileGeocodeRateLimiter(req, userId);
  if (rateLimitResponse) return rateLimitResponse;

  try {
    const result = await geocodeWithGoogle(address, apiKey);
    if (!result.coordinates) {
      return NextResponse.json(
        { coordinates: null, address, precision: result.precision },
        { status: 200, headers },
      );
    }

    return NextResponse.json(result, { status: 200, headers });
  } catch {
    return NextResponse.json({ error: 'Geocoding failed' }, { status: 500, headers });
  }
}
