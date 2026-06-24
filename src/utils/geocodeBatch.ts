import { resolveGeocodeWithCache } from '@/utils/addressGeocodeCache';

export type BatchGeocodeResult = {
  coordinates: { longitude: number; latitude: number } | null;
  address: string;
};

/** Geocode multiple addresses with Google (DB cache first). */
export async function geocodeAddressesBatch(
  addresses: string[],
): Promise<Record<string, BatchGeocodeResult>> {
  const results: Record<string, BatchGeocodeResult> = {};

  await Promise.all(
    addresses.map(async (address) => {
      const resolved = await resolveGeocodeWithCache(address);
      results[address] = {
        coordinates: resolved.coordinates,
        address: resolved.address,
      };
    }),
  );

  return results;
}
