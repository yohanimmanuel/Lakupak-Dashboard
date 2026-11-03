import { NextRequest, NextResponse } from 'next/server';
import { getSecurityHeaders } from '@/utils/auth-security';
import { getAuthenticatedUserId } from '@/utils/auth-helpers';
import { Prisma } from '@/lib/prisma-generated';
import {
  listAssortmentOpportunities,
  listFamilyOpportunities,
  listVariantGroups,
  refreshAssortmentOpportunities,
  saveAssortmentSettings,
} from '@/lib/assortmentOpportunities/service';
import { assortmentSettingValue, DEFAULT_ASSORTMENT_SETTINGS } from '@/lib/assortmentOpportunities/config';

function decimal(value: Prisma.Decimal | number | null | undefined): number | null {
  if (value == null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function serializeRow(row: {
  confidence: Prisma.Decimal | number;
  penetration: Prisma.Decimal | number;
  lastPurchasedAt: Date | null;
  reviewedAt: Date | null;
  generatedAt: Date;
  updatedAt: Date;
  [key: string]: unknown;
}) {
  return {
    ...row,
    confidence: decimal(row.confidence),
    penetration: decimal(row.penetration),
    lastPurchasedAt: row.lastPurchasedAt ? row.lastPurchasedAt.toISOString() : null,
    reviewedAt: row.reviewedAt ? row.reviewedAt.toISOString() : null,
    generatedAt: row.generatedAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function numberParam(value: string | null): number | undefined {
  if (value == null || value.trim() === '') return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export async function GET(req: NextRequest) {
  const headers = getSecurityHeaders();
  const userId = await getAuthenticatedUserId(req);
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers });
  const params = new URL(req.url).searchParams;
  const filters = {
    q: params.get('q') || undefined,
    brand: params.get('brand') || undefined,
    category: params.get('category') || undefined,
    family: params.get('family') || undefined,
    retailer: params.get('retailer') || undefined,
    segment: params.get('segment') || undefined,
    type: params.get('type') || undefined,
    status: params.get('status') || undefined,
    minMatch: numberParam(params.get('minMatch')),
    minPriority: numberParam(params.get('minPriority')),
    productId: params.get('productId') || undefined,
    variantOptionId: numberParam(params.get('variantOptionId')),
    minConfidence: numberParam(params.get('minConfidence')),
    sort: params.get('sort') || undefined,
    page: numberParam(params.get('page')),
    limit: numberParam(params.get('limit')),
  };
  if (params.get('group') === 'variant') {
    const result = await listVariantGroups(userId, filters);
    return NextResponse.json(result, { headers });
  }
  if (params.get('group') === 'family') {
    const result = await listFamilyOpportunities(userId, filters);
    return NextResponse.json(
      {
        ...result,
        settings: {
          ...result.settings,
          highPriorityScore: DEFAULT_ASSORTMENT_SETTINGS.highPriorityScore,
        },
      },
      { headers },
    );
  }
  const result = await listAssortmentOpportunities(userId, filters);
  return NextResponse.json(
    {
      ...result,
      rows: result.rows.map((row) => serializeRow(row)),
      settings: {
        ...result.settings,
        highPriorityScore: DEFAULT_ASSORTMENT_SETTINGS.highPriorityScore,
      },
    },
    { headers },
  );
}

export async function POST(req: NextRequest) {
  const headers = getSecurityHeaders();
  const userId = await getAuthenticatedUserId(req);
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers });
  const body = await req.json().catch(() => ({}));
  if (body && typeof body === 'object' && body.settings && typeof body.settings === 'object') {
    const settings = body.settings as Record<string, unknown>;
    const patch: Record<string, number> = {};
    for (const key of ['lookbackDays', 'defaultReorderDays', 'minConfidence', 'minMatchScore', 'minEvidenceSignals']) {
      const parsed = assortmentSettingValue(key, settings[key]);
      if (parsed != null) patch[key] = parsed;
    }
    if (Object.keys(patch).length > 0) {
      await saveAssortmentSettings(userId, patch);
    }
  }
  const refreshed = await refreshAssortmentOpportunities(userId);
  return NextResponse.json(refreshed, { headers });
}
