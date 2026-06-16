import { prisma } from '@/lib/db';
import {
  geocodeWithGoogle,
  getGoogleMapsApiKey,
  type GeocodePrecision,
  type GoogleGeocodeResult,
} from '@/utils/googleGeocode';

export type CachedGeocodeResponse = {
  coordinates: { longitude: number; latitude: number } | null;
  address: string;
  precision: GeocodePrecision;
  cached: boolean;
};

/** Normalize address text for deduplicated geocode cache lookups. */
export function normalizeAddressKey(address: string): string {
  return address.trim().replace(/\s+/g, ' ').toLowerCase();
}

function toCachedResponse(
  addressText: string,
  latitude: number,
  longitude: number,
  precision: GeocodePrecision | null | undefined,
): CachedGeocodeResponse {
  return {
    coordinates: { latitude, longitude },
    address: addressText,
    precision: precision ?? 'area',
    cached: true,
  };
}

/** Look up coordinates from any saved buyer address with the same normalized text. */
export async function lookupCachedGeocode(address: string): Promise<CachedGeocodeResponse | null> {
  const trimmed = address.trim();
  if (!trimmed) return null;

  const normalized = normalizeAddressKey(trimmed);
  const cached = await prisma.address.findFirst({
    where: {
      addressNormalized: normalized,
      latitude: { not: null },
      longitude: { not: null },
    },
    orderBy: { updatedAt: 'desc' },
    select: {
      address: true,
      latitude: true,
      longitude: true,
      geocodePrecision: true,
    },
  });

  if (
    cached?.latitude == null ||
    cached.longitude == null ||
    Number.isNaN(cached.latitude) ||
    Number.isNaN(cached.longitude)
  ) {
    return null;
  }

  return toCachedResponse(
    cached.address,
    cached.latitude,
    cached.longitude,
    cached.geocodePrecision as GeocodePrecision | null,
  );
}

/** Persist geocode result on all buyer addresses sharing the same normalized text. */
export async function persistGeocodeResult(
  addressText: string,
  result: Pick<GoogleGeocodeResult, 'coordinates' | 'precision' | 'address'>,
): Promise<void> {
  const trimmed = addressText.trim();
  if (!trimmed) return;

  const normalized = normalizeAddressKey(trimmed);
  const data =
    result.coordinates == null
      ? {
          addressNormalized: normalized,
          latitude: null,
          longitude: null,
          geocodePrecision: result.precision,
        }
      : {
          addressNormalized: normalized,
          latitude: result.coordinates.latitude,
          longitude: result.coordinates.longitude,
          geocodePrecision: result.precision,
        };

  await prisma.address.updateMany({
    where: {
      OR: [{ addressNormalized: normalized }, { address: trimmed }],
    },
    data,
  });
}

/**
 * Resolve geocode for an address string: DB cache first, then Google.
 * Persists successful results for future lookups.
 */
export async function resolveGeocodeWithCache(address: string): Promise<CachedGeocodeResponse> {
  const trimmed = address.trim();
  if (!trimmed) {
    return { coordinates: null, address: trimmed, precision: 'area', cached: false };
  }

  const cached = await lookupCachedGeocode(trimmed);
  if (cached) return cached;

  const apiKey = getGoogleMapsApiKey();
  if (!apiKey) {
    return { coordinates: null, address: trimmed, precision: 'area', cached: false };
  }

  const result = await geocodeWithGoogle(trimmed, apiKey);
  if (result.coordinates) {
    await persistGeocodeResult(trimmed, result);
  }

  return {
    coordinates: result.coordinates,
    address: result.address,
    precision: result.precision,
    cached: false,
  };
}

/** Attach coordinates to a specific address row (create/update/register). */
export async function attachGeocodeToAddress(addressId: number, addressText: string): Promise<void> {
  const trimmed = addressText.trim();
  if (!trimmed) return;

  const normalized = normalizeAddressKey(trimmed);
  await prisma.address.update({
    where: { id: addressId },
    data: { addressNormalized: normalized },
  });

  const cached = await lookupCachedGeocode(trimmed);
  if (cached?.coordinates) {
    await prisma.address.update({
      where: { id: addressId },
      data: {
        latitude: cached.coordinates.latitude,
        longitude: cached.coordinates.longitude,
        geocodePrecision: cached.precision,
        addressNormalized: normalized,
      },
    });
    return;
  }

  const apiKey = getGoogleMapsApiKey();
  if (!apiKey) return;

  const result = await geocodeWithGoogle(trimmed, apiKey);
  await persistGeocodeResult(trimmed, result);

  if (result.coordinates) {
    await prisma.address.update({
      where: { id: addressId },
      data: {
        latitude: result.coordinates.latitude,
        longitude: result.coordinates.longitude,
        geocodePrecision: result.precision,
        addressNormalized: normalized,
      },
    });
  }
}

export function clearGeocodeFieldsForAddressUpdate(addressText: string) {
  const normalized = normalizeAddressKey(addressText);
  return {
    addressNormalized: normalized,
    latitude: null as null,
    longitude: null as null,
    geocodePrecision: null as null,
  };
}
