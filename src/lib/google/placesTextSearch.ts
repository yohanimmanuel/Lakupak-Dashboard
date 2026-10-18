import { getGoogleMapsApiKey } from '@/utils/googleGeocode';

export type PlacesTextSearchPlace = {
  id: string;
  displayName: string;
  formattedAddress: string;
  nationalPhoneNumber: string | null;
  googleMapsUri: string | null;
  /** Google Places primary type key, e.g. convenience_store. */
  primaryType: string | null;
  /** Localized label for the primary type, when Google returns one. */
  primaryTypeDisplayName: string | null;
  /** Other Google type keys for this place. */
  types: string[];
  /** Short Google editorial blurb when available. */
  editorialSummary: string | null;
  rating: number | null;
  userRatingCount: number | null;
  latitude: number | null;
  longitude: number | null;
};

export type PlacesTextSearchInput = {
  textQuery: string;
  regionCode?: string;
  languageCode?: string;
  pageSize?: number;
  /** Circle bias in meters (default 5000). */
  radiusMeters?: number;
  latitude?: number | null;
  longitude?: number | null;
  /** Google Places type, e.g. convenience_store, restaurant, lodging. */
  includedType?: string | null;
};

type PlacesApiPlace = {
  id?: string;
  name?: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  nationalPhoneNumber?: string;
  internationalPhoneNumber?: string;
  googleMapsUri?: string;
  primaryType?: string;
  primaryTypeDisplayName?: { text?: string };
  types?: string[];
  editorialSummary?: { text?: string };
  rating?: number;
  userRatingCount?: number;
  location?: { latitude?: number; longitude?: number };
};

type PlacesApiResponse = {
  places?: PlacesApiPlace[];
  error?: { message?: string; status?: string };
};

const FIELD_MASK = [
  'places.id',
  'places.displayName',
  'places.formattedAddress',
  'places.nationalPhoneNumber',
  'places.internationalPhoneNumber',
  'places.location',
  'places.googleMapsUri',
  'places.primaryType',
  'places.primaryTypeDisplayName',
  'places.types',
  'places.editorialSummary',
  'places.rating',
  'places.userRatingCount',
].join(',');

function clip(value: string, max: number) {
  return value.trim().slice(0, max);
}

function mapPlace(place: PlacesApiPlace): PlacesTextSearchPlace | null {
  const displayName = clip(place.displayName?.text || '', 200);
  const formattedAddress = clip(place.formattedAddress || '', 500);
  if (!displayName && !formattedAddress) return null;

  const id =
    clip(place.id || '', 128) ||
    clip((place.name || '').replace(/^places\//, ''), 128) ||
    `${displayName}|${formattedAddress}`.slice(0, 128);

  const phone =
    clip(place.nationalPhoneNumber || place.internationalPhoneNumber || '', 32) || null;

  const latitude =
    typeof place.location?.latitude === 'number' && Number.isFinite(place.location.latitude)
      ? place.location.latitude
      : null;
  const longitude =
    typeof place.location?.longitude === 'number' && Number.isFinite(place.location.longitude)
      ? place.location.longitude
      : null;

  const types = Array.isArray(place.types)
    ? place.types
        .filter((type): type is string => typeof type === 'string' && Boolean(type.trim()))
        .map((type) => clip(type, 80))
        .slice(0, 12)
    : [];

  const rating =
    typeof place.rating === 'number' && Number.isFinite(place.rating) ? place.rating : null;
  const userRatingCount =
    typeof place.userRatingCount === 'number' && Number.isFinite(place.userRatingCount)
      ? Math.max(0, Math.floor(place.userRatingCount))
      : null;

  return {
    id,
    displayName: displayName || formattedAddress,
    formattedAddress: formattedAddress || displayName,
    nationalPhoneNumber: phone,
    googleMapsUri: place.googleMapsUri ? clip(place.googleMapsUri, 500) : null,
    primaryType: place.primaryType ? clip(place.primaryType, 80) : null,
    primaryTypeDisplayName: place.primaryTypeDisplayName?.text
      ? clip(place.primaryTypeDisplayName.text, 120)
      : null,
    types,
    editorialSummary: place.editorialSummary?.text
      ? clip(place.editorialSummary.text, 400)
      : null,
    rating,
    userRatingCount,
    latitude,
    longitude,
  };
}

/**
 * Google Places API (New) Text Search. Server-side only.
 * @see https://developers.google.com/maps/documentation/places/web-service/text-search
 */
export async function searchPlacesText(
  input: PlacesTextSearchInput,
): Promise<{ places: PlacesTextSearchPlace[]; error?: string }> {
  const apiKey = getGoogleMapsApiKey();
  if (!apiKey) {
    return { places: [], error: 'GOOGLE_MAPS_API_KEY is not configured.' };
  }

  const textQuery = clip(input.textQuery, 300);
  if (!textQuery) {
    return { places: [], error: 'textQuery is required.' };
  }

  const pageSize = Math.min(20, Math.max(1, Math.floor(input.pageSize ?? 20)));
  const body: Record<string, unknown> = {
    textQuery,
    regionCode: (input.regionCode || 'ID').toUpperCase().slice(0, 2),
    languageCode: (input.languageCode || 'id').toLowerCase().slice(0, 5),
    pageSize,
  };

  if (input.includedType) {
    body.includedType = clip(input.includedType, 64);
  }

  const lat = input.latitude;
  const lng = input.longitude;
  if (
    typeof lat === 'number' &&
    typeof lng === 'number' &&
    Number.isFinite(lat) &&
    Number.isFinite(lng)
  ) {
    const radius = Math.min(50000, Math.max(500, Math.floor(input.radiusMeters ?? 5000)));
    body.locationBias = {
      circle: {
        center: { latitude: lat, longitude: lng },
        radius,
      },
    };
  }

  let response: Response;
  try {
    response = await fetch('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': FIELD_MASK,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    });
  } catch (error) {
    const raw = error instanceof Error ? error.message : String(error ?? '');
    const timedOut =
      (typeof error === 'object' &&
        error !== null &&
        'name' in error &&
        (error as { name?: string }).name === 'TimeoutError') ||
      /timeout|aborted|AbortError/i.test(raw);
    return {
      places: [],
      error: timedOut
        ? 'Places Text Search timed out. Please try again.'
        : `Places Text Search request failed${raw ? `: ${raw.slice(0, 180)}` : '.'}`,
    };
  }

  let data: PlacesApiResponse = {};
  try {
    data = (await response.json()) as PlacesApiResponse;
  } catch {
    data = {};
  }

  if (!response.ok) {
    const message =
      data.error?.message ||
      `Places Text Search failed (${response.status}). Check Places API (New) is enabled for this key.`;
    return { places: [], error: message };
  }

  const places = (data.places ?? [])
    .map(mapPlace)
    .filter((row): row is PlacesTextSearchPlace => Boolean(row));

  return { places };
}
