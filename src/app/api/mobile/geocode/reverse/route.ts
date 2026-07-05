import { NextRequest, NextResponse } from 'next/server';
import { getSecurityHeaders } from '@/utils/auth-security';
import { getAuthenticatedMarketplaceUserId } from '@/utils/auth-helpers';
import { getGoogleMapsApiKey, reverseGeocodeWithGoogle } from '@/utils/googleGeocode';
import { mobileGeocodeRateLimiter } from '@/utils/rateLimiter';

/**
 * Reverse-geocoding proxy for the Marketplace "Use current location" button.
 * Takes device GPS coordinates and returns a formatted delivery address.
 * No auth required (address can be set during signup) — rate-limited by IP.
 * Optional Bearer token for per-user limits when logged in.
 */
export async function POST(req: NextRequest) {
  const headers = getSecurityHeaders();

  const apiKey = getGoogleMapsApiKey();
  if (!apiKey) {
    return NextResponse.json({ error: 'Geocoding not configured' }, { status: 503, headers });
  }

  let body: { latitude?: unknown; longitude?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400, headers });
  }

  const latitude = typeof body.latitude === 'number' ? body.latitude : NaN;
  const longitude = typeof body.longitude === 'number' ? body.longitude : NaN;

  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180
  ) {
    return NextResponse.json(
      { error: 'valid latitude and longitude are required' },
      { status: 400, headers },
    );
  }

  const auth = await getAuthenticatedMarketplaceUserId(req);
  const userId = auth.ok ? auth.userId : null;

  const rateLimitResponse = await mobileGeocodeRateLimiter(req, userId);
  if (rateLimitResponse) return rateLimitResponse;

  try {
    const result = await reverseGeocodeWithGoogle(latitude, longitude, apiKey);
    return NextResponse.json(
      {
        coordinates: result.coordinates,
        address: result.address,
        precision: result.precision,
      },
      { status: 200, headers },
    );
  } catch {
    return NextResponse.json({ error: 'Reverse geocoding failed' }, { status: 500, headers });
  }
}
