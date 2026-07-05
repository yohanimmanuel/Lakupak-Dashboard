export type GeocodePrecision = 'exact' | 'approximate' | 'area';

export interface GoogleGeocodeResult {
  coordinates: { longitude: number; latitude: number } | null;
  address: string;
  precision: GeocodePrecision;
}

type GoogleGeocodeResponse = {
  status: string;
  results?: Array<{
    formatted_address: string;
    geometry: {
      location: { lat: number; lng: number };
      location_type: 'ROOFTOP' | 'RANGE_INTERPOLATED' | 'GEOMETRIC_CENTER' | 'APPROXIMATE';
    };
  }>;
};

function locationTypeToPrecision(
  locationType:
    | 'ROOFTOP'
    | 'RANGE_INTERPOLATED'
    | 'GEOMETRIC_CENTER'
    | 'APPROXIMATE',
): GeocodePrecision {
  switch (locationType) {
    case 'ROOFTOP':
    case 'RANGE_INTERPOLATED':
      return 'exact';
    case 'GEOMETRIC_CENTER':
      return 'approximate';
    default:
      return 'area';
  }
}

function inferRegion(address: string): string | undefined {
  const lower = address.toLowerCase();
  if (lower.includes('singapore')) return 'sg';
  if (
    lower.includes('indonesia') ||
    /\b(jakarta|surabaya|bandung|medan|bali|jawa|yogyakarta|semarang|malang|depok|bekasi|tangerang)\b/.test(
      lower,
    )
  ) {
    return 'id';
  }
  return undefined;
}

/**
 * Forward-geocode an address with Google Geocoding API (server-side only).
 */
export async function geocodeWithGoogle(
  address: string,
  apiKey: string,
): Promise<GoogleGeocodeResult> {
  const trimmed = address.trim();
  if (!trimmed) {
    return { coordinates: null, address, precision: 'area' };
  }

  const region = inferRegion(trimmed);
  const params = new URLSearchParams({
    address: trimmed,
    key: apiKey,
  });
  if (region) params.set('region', region);

  const url = `https://maps.googleapis.com/maps/api/geocode/json?${params.toString()}`;
  const res = await fetch(url);
  if (!res.ok) {
    return { coordinates: null, address: trimmed, precision: 'area' };
  }

  const data = (await res.json()) as GoogleGeocodeResponse;
  if (data.status !== 'OK' || !data.results?.length) {
    return { coordinates: null, address: trimmed, precision: 'area' };
  }

  const top = data.results[0];
  const { lat, lng } = top.geometry.location;

  return {
    coordinates: { longitude: lng, latitude: lat },
    address: top.formatted_address,
    precision: locationTypeToPrecision(top.geometry.location_type),
  };
}

/**
 * Reverse-geocode GPS coordinates into a formatted address (server-side only).
 * The coordinates come from the device GPS, so we keep them as the pin and only
 * borrow Google's formatted_address for the human-readable text.
 */
export async function reverseGeocodeWithGoogle(
  latitude: number,
  longitude: number,
  apiKey: string,
): Promise<GoogleGeocodeResult> {
  const params = new URLSearchParams({
    latlng: `${latitude},${longitude}`,
    key: apiKey,
  });

  const url = `https://maps.googleapis.com/maps/api/geocode/json?${params.toString()}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
  if (!res.ok) {
    return { coordinates: { latitude, longitude }, address: '', precision: 'exact' };
  }

  const data = (await res.json()) as GoogleGeocodeResponse;
  if (data.status !== 'OK' || !data.results?.length) {
    return { coordinates: { latitude, longitude }, address: '', precision: 'exact' };
  }

  // Prefer the most specific result (street address) over broad areas.
  const top = data.results[0];

  return {
    coordinates: { latitude, longitude },
    address: top.formatted_address,
    precision: 'exact',
  };
}

export function getGoogleMapsApiKey(): string | null {
  const key =
    process.env.GOOGLE_MAPS_API_KEY?.trim() ||
    process.env.GOOGLE_GEOCODING_API_KEY?.trim() ||
    '';
  return key || null;
}
