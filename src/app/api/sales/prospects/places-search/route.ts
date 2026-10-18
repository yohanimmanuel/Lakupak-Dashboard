import { NextRequest, NextResponse } from 'next/server';
import { setDbSecurityContextFromRequest } from '@/lib/db';
import {
  runPlacesProspecting,
  type PlacesProspectCriteria,
} from '@/lib/salesJobs/placesProspecting';

async function getSessionUserId(): Promise<number | null> {
  const { getServerSession } = await import('next-auth');
  const { authOptions } = await import('@/lib/auth-options');
  const session = await getServerSession(authOptions);
  const raw = session?.user?.id;
  if (!raw) return null;
  const n = Number.parseInt(String(raw), 10);
  return Number.isFinite(n) ? n : null;
}

function readCriteria(record: Record<string, unknown>): PlacesProspectCriteria {
  const num = (key: string) => {
    const v = record[key];
    return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
  };
  const str = (key: string) => (typeof record[key] === 'string' ? String(record[key]) : undefined);

  return {
    buyerType: str('buyerType'),
    region: str('region'),
    notes: str('notes'),
    textQuery: str('textQuery'),
    latitude: num('latitude'),
    longitude: num('longitude'),
    radiusMeters: num('radiusMeters'),
    pageSize: num('pageSize'),
    create: record.create === true,
    languageCode: str('languageCode'),
  };
}

/**
 * POST /api/sales/prospects/places-search
 * Server-side Google Places (New) Text Search → optional Prospect rows.
 */
export async function POST(request: NextRequest) {
  const userId = await getSessionUserId();
  if (userId == null) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  await setDbSecurityContextFromRequest(request, userId);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const record = body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
  const criteria = readCriteria(record);
  const result = await runPlacesProspecting(userId, criteria);

  if (!result.ok) {
    return NextResponse.json(
      {
        error: result.error || 'Places search failed',
        query: result.query,
        candidates: [],
        createdCount: 0,
        skippedCount: 0,
      },
      { status: 502 },
    );
  }

  return NextResponse.json({
    query: result.query,
    includedType: result.includedType,
    createdCount: result.createdCount,
    skippedCount: result.skippedCount,
    candidates: result.candidates.map((c) => ({
      placeId: c.placeId,
      storeName: c.storeName,
      owner: c.owner,
      phone: c.phone,
      address: c.address,
      region: c.region,
      buyerType: c.buyerType,
      notes: c.notes,
      googleMapsUri: c.googleMapsUri,
      latitude: c.latitude,
      longitude: c.longitude,
      created: c.created,
      skippedReason: c.skippedReason ?? null,
      buyerId: c.prospect?.buyerId ?? null,
    })),
  });
}
