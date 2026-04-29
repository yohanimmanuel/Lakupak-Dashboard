import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUserId } from '@/utils/auth-helpers';
import { mapboxGeocodeRateLimiter } from '@/utils/rateLimiter';

/** Geocode result shape matching client GeocodeResult */
interface GeocodeResultBody {
  coordinates: { longitude: number; latitude: number } | null;
  address: string;
}

/**
 * Server-side proxy for Mapbox Geocoding API. Uses MAPBOX_ACCESS_TOKEN (or NEXT_PUBLIC_*)
 * so secret tokens (sk.*) are never sent to the client. Auth required.
 */
export async function POST(request: NextRequest) {
  const userId = await getAuthenticatedUserId(request);
  if (userId == null) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const rateLimitResponse = await mapboxGeocodeRateLimiter(request, userId);
  if (rateLimitResponse) return rateLimitResponse;

  const serverToken =
    process.env.MAPBOX_ACCESS_TOKEN || process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN;
  if (!serverToken) {
    return NextResponse.json({ error: 'Mapbox not configured' }, { status: 503 });
  }

  let body: { addresses?: string[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const MAX_ADDRESSES = 25;
  const MAX_ADDRESS_LENGTH = 300;

  const addresses = Array.isArray(body?.addresses)
    ? body.addresses.filter((a) => typeof a === 'string').map((a) => a.trim()).filter((a) => a.length > 0)
    : [];
  if (addresses.length === 0) {
    return NextResponse.json({ results: {} });
  }
  if (addresses.length > MAX_ADDRESSES) {
    return NextResponse.json(
      { error: `Maximum ${MAX_ADDRESSES} addresses allowed per request` },
      { status: 400 }
    );
  }
  if (addresses.some((a) => a.length > MAX_ADDRESS_LENGTH)) {
    return NextResponse.json({ error: 'One or more addresses are too long' }, { status: 400 });
  }

  const results: Record<string, GeocodeResultBody> = {};

  await Promise.all(
    addresses.map(async (address) => {
      const encoded = encodeURIComponent(address);
      const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encoded}.json?access_token=${serverToken}&limit=1`;
      try {
        const res = await fetch(url);
        if (!res.ok) {
          results[address] = { coordinates: null, address };
          return;
        }
        const data = (await res.json()) as {
          features?: Array<{ center?: [number, number]; place_name?: string }>;
        };
        if (data.features?.length && data.features[0].center) {
          const [longitude, latitude] = data.features[0].center;
          results[address] = {
            coordinates: { longitude, latitude },
            address: data.features[0].place_name ?? address,
          };
        } else {
          results[address] = { coordinates: null, address };
        }
      } catch {
        results[address] = { coordinates: null, address };
      }
    })
  );

  return NextResponse.json({ results });
}
