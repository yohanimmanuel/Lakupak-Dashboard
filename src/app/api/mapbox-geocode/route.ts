import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUserId } from '@/utils/auth-helpers';
import { mapboxGeocodeRateLimiter } from '@/utils/rateLimiter';
import { geocodeAddressesBatch } from '@/utils/geocodeBatch';
import { getGoogleMapsApiKey } from '@/utils/googleGeocode';

/** Geocode result shape matching client GeocodeResult */
interface GeocodeResultBody {
  coordinates: { longitude: number; latitude: number } | null;
  address: string;
}

/**
 * Dashboard geocoding proxy (Google Geocoding API + DB cache).
 * Route name kept for backward compatibility; Mapbox is not used for geocoding.
 */
export async function POST(request: NextRequest) {
  const userId = await getAuthenticatedUserId(request);
  if (userId == null) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const rateLimitResponse = await mapboxGeocodeRateLimiter(request, userId);
  if (rateLimitResponse) return rateLimitResponse;

  if (!getGoogleMapsApiKey()) {
    return NextResponse.json({ error: 'Geocoding not configured' }, { status: 503 });
  }

  let body: { addresses?: string[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const MAX_ADDRESSES = 25;
  const MAX_ADDRESS_LENGTH = 500;

  const addresses = Array.isArray(body?.addresses)
    ? body.addresses.filter((a) => typeof a === 'string').map((a) => a.trim()).filter((a) => a.length > 0)
    : [];
  if (addresses.length === 0) {
    return NextResponse.json({ results: {} });
  }
  if (addresses.length > MAX_ADDRESSES) {
    return NextResponse.json(
      { error: `Maximum ${MAX_ADDRESSES} addresses allowed per request` },
      { status: 400 },
    );
  }
  if (addresses.some((a) => a.length > MAX_ADDRESS_LENGTH)) {
    return NextResponse.json({ error: 'One or more addresses are too long' }, { status: 400 });
  }

  const batch = await geocodeAddressesBatch(addresses);
  const results: Record<string, GeocodeResultBody> = {};
  for (const address of addresses) {
    const item = batch[address];
    results[address] = item ?? { coordinates: null, address };
  }

  return NextResponse.json({ results });
}
