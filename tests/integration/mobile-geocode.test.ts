import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '@/app/api/mobile/geocode/route';
import { geocodeWithGoogle } from '@/utils/googleGeocode';

const TEST_API_KEY = 'vitest-google-maps-key';

function makeGeocodeRequest(body: unknown, ip = '127.0.0.1.50') {
  const req = new Request('http://localhost/api/mobile/geocode', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-forwarded-for': ip,
    },
    body: JSON.stringify(body),
  });
  return new NextRequest(req);
}

function googleOkResponse(overrides?: {
  lat?: number;
  lng?: number;
  formatted_address?: string;
  location_type?: 'ROOFTOP' | 'RANGE_INTERPOLATED' | 'GEOMETRIC_CENTER' | 'APPROXIMATE';
}) {
  return {
    status: 'OK',
    results: [
      {
        formatted_address:
          overrides?.formatted_address ??
          'Pacific Century Place, Jl. Jend. Sudirman No.52-53, Jakarta, Indonesia',
        geometry: {
          location: {
            lat: overrides?.lat ?? -6.2278126,
            lng: overrides?.lng ?? 106.8083072,
          },
          location_type: overrides?.location_type ?? 'ROOFTOP',
        },
      },
    ],
  };
}

describe('POST /api/mobile/geocode', () => {
  const originalFetch = globalThis.fetch;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.stubEnv('GOOGLE_MAPS_API_KEY', TEST_API_KEY);
    delete process.env.GOOGLE_GEOCODING_API_KEY;

    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.stubGlobal('fetch', originalFetch);
    vi.restoreAllMocks();
  });

  it('returns 503 when Google API key is not configured', async () => {
    delete process.env.GOOGLE_MAPS_API_KEY;
    delete process.env.GOOGLE_GEOCODING_API_KEY;

    const response = await POST(makeGeocodeRequest({ address: 'Jakarta' }));
    const body = (await response.json()) as { error?: string };

    expect(response.status).toBe(503);
    expect(body.error).toBe('Geocoding not configured');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns 400 for invalid JSON body', async () => {
    const req = new Request('http://localhost/api/mobile/geocode', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-forwarded-for': '127.0.0.1.51',
      },
      body: 'not-json',
    });

    const response = await POST(new NextRequest(req));
    const body = (await response.json()) as { error?: string };

    expect(response.status).toBe(400);
    expect(body.error).toBe('Invalid JSON body');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns 400 when address is missing or blank', async () => {
    const response = await POST(makeGeocodeRequest({ address: '   ' }, '127.0.0.1.52'));
    const body = (await response.json()) as { error?: string };

    expect(response.status).toBe(400);
    expect(body.error).toBe('address is required');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns 400 when address exceeds max length', async () => {
    const response = await POST(
      makeGeocodeRequest({ address: 'a'.repeat(501) }, '127.0.0.1.53'),
    );
    const body = (await response.json()) as { error?: string };

    expect(response.status).toBe(400);
    expect(body.error).toBe('address is too long');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns coordinates and formatted address on successful geocode', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify(googleOkResponse()), { status: 200 }),
    );

    const response = await POST(
      makeGeocodeRequest(
        { address: 'Jl. Sudirman No. 52, Jakarta, Indonesia' },
        '127.0.0.1.54',
      ),
    );
    const body = (await response.json()) as {
      coordinates?: { longitude: number; latitude: number };
      address?: string;
      precision?: string;
    };

    expect(response.status).toBe(200);
    expect(body.coordinates).toEqual({
      longitude: 106.8083072,
      latitude: -6.2278126,
    });
    expect(body.address).toContain('Jakarta');
    expect(body.precision).toBe('exact');
    expect(body.coordinates!.latitude).toBeLessThan(0);
    expect(body.coordinates!.longitude).toBeGreaterThan(100);
    expect(fetchMock).toHaveBeenCalledOnce();

    const calledUrl = String(fetchMock.mock.calls[0]?.[0]);
    expect(calledUrl).toContain('maps.googleapis.com/maps/api/geocode/json');
    expect(calledUrl).toContain('region=id');
  });

  it('returns 200 with null coordinates when Google finds no results', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ status: 'ZERO_RESULTS', results: [] }), { status: 200 }),
    );

    const input = 'zzzz-not-a-real-place-12345';
    const response = await POST(makeGeocodeRequest({ address: input }, '127.0.0.1.55'));
    const body = (await response.json()) as {
      coordinates: null;
      address: string;
      precision: string;
    };

    expect(response.status).toBe(200);
    expect(body.coordinates).toBeNull();
    expect(body.address).toBe(input);
    expect(body.precision).toBe('area');
  });

  it('returns 500 when Google geocoding throws', async () => {
    fetchMock.mockRejectedValueOnce(new Error('network down'));

    const response = await POST(
      makeGeocodeRequest({ address: 'Jl. Thamrin, Jakarta' }, '127.0.0.1.56'),
    );
    const body = (await response.json()) as { error?: string };

    expect(response.status).toBe(500);
    expect(body.error).toBe('Geocoding failed');
  });
});

describe('geocodeWithGoogle', () => {
  const originalFetch = globalThis.fetch;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.stubGlobal('fetch', originalFetch);
    vi.restoreAllMocks();
  });

  it('returns null coordinates for blank input without calling Google', async () => {
    const result = await geocodeWithGoogle('   ', TEST_API_KEY);

    expect(result).toEqual({
      coordinates: null,
      address: '   ',
      precision: 'area',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    ['ROOFTOP', 'exact'],
    ['RANGE_INTERPOLATED', 'exact'],
    ['GEOMETRIC_CENTER', 'approximate'],
    ['APPROXIMATE', 'area'],
  ] as const)('maps Google location_type %s to precision %s', async (locationType, precision) => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify(
          googleOkResponse({
            location_type: locationType,
            formatted_address: 'Test Address',
          }),
        ),
        { status: 200 },
      ),
    );

    const result = await geocodeWithGoogle('Test Address, Jakarta', TEST_API_KEY);

    expect(result.precision).toBe(precision);
    expect(result.coordinates).toEqual({
      longitude: 106.8083072,
      latitude: -6.2278126,
    });
  });

  it('adds region=sg for Singapore addresses', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify(googleOkResponse({ lat: 1.29, lng: 103.85 })), {
        status: 200,
      }),
    );

    await geocodeWithGoogle('1 Raffles Place, Singapore', TEST_API_KEY);

    const calledUrl = String(fetchMock.mock.calls[0]?.[0]);
    expect(calledUrl).toContain('region=sg');
  });
});
