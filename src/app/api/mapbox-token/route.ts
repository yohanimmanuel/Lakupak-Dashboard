import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUserId } from '@/utils/auth-helpers';

/**
 * Returns only a public Mapbox token (pk.*) at runtime. Never exposes MAPBOX_ACCESS_TOKEN (sk.*).
 * - If NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN is set and starts with "pk.", return it to the client.
 * - If only MAPBOX_ACCESS_TOKEN is set and starts with "sk.", treat as secret: require auth and
 *   return { token: null }; client must use /api/mapbox-geocode for server-side geocoding.
 */
export async function GET(request: NextRequest) {
  const publicToken = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN;
  const serverToken = process.env.MAPBOX_ACCESS_TOKEN;

  // Only ever return a public token (pk.). Never return server-only secret (sk.).
  const safeToReturn =
    typeof publicToken === 'string' && publicToken.length > 0 && publicToken.startsWith('pk.');

  if (safeToReturn) {
    return NextResponse.json({ token: publicToken });
  }

  // If only a secret token is configured, require auth; we still don't return a client token.
  if (
    typeof serverToken === 'string' &&
    serverToken.length > 0 &&
    serverToken.startsWith('sk.')
  ) {
    const userId = await getAuthenticatedUserId(request);
    if (userId == null) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    // No client token available; client should use /api/mapbox-geocode for geocoding.
    return NextResponse.json(
      { error: 'MAPBOX_ACCESS_TOKEN not configured for client (use server geocode proxy)' },
      { status: 500 }
    );
  }

  return NextResponse.json(
    { error: 'MAPBOX_ACCESS_TOKEN not configured' },
    { status: 500 }
  );
}
