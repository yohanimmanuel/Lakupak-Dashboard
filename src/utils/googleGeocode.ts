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

export function getGoogleMapsApiKey(): string | null {
  const key =
    process.env.GOOGLE_MAPS_API_KEY?.trim() ||
    process.env.GOOGLE_GEOCODING_API_KEY?.trim() ||
    '';
  return key || null;
}
