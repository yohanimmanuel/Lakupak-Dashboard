import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSecurityHeaders } from '@/utils/auth-security';
import { requirePlatformAdminId } from '@/utils/platform-admin-auth';
import { Prisma } from '@prisma/client';
import { platformAdminMutationRateLimiter } from '@/utils/rateLimiter';

type Kind = 'SYNONYM' | 'TRANSLATION';

function normTerm(s: unknown): string {
  if (typeof s !== 'string') return '';
  return s.trim().toLowerCase().replace(/\s+/g, ' ');
}

function normLocale(s: unknown): string | null {
  if (typeof s !== 'string') return null;
  const t = s.trim().toLowerCase();
  if (!t) return null;
  // Keep it permissive for MVP (e.g. "id", "en", "id-ID").
  return t;
}

function parseKind(req: NextRequest): Kind | null {
  const raw = new URL(req.url).searchParams.get('kind');
  if (!raw) return null;
  const k = raw.trim().toUpperCase();
  return k === 'SYNONYM' || k === 'TRANSLATION' ? (k as Kind) : null;
}

function parseEnabled(req: NextRequest): boolean | null {
  const raw = new URL(req.url).searchParams.get('enabled');
  if (raw == null) return null;
  if (raw === 'true' || raw === '1') return true;
  if (raw === 'false' || raw === '0') return false;
  return null;
}

function parseLimit(req: NextRequest): number {
  const raw = new URL(req.url).searchParams.get('limit');
  const n = raw ? Number(raw) : 50;
  if (!Number.isFinite(n)) return 50;
  return Math.min(Math.max(1, Math.floor(n)), 200);
}

function parseOffset(req: NextRequest): number {
  const raw = new URL(req.url).searchParams.get('offset');
  const n = raw ? Number(raw) : 0;
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.floor(n));
}

export async function GET(req: NextRequest) {
  const headers = getSecurityHeaders();
  try {
    requirePlatformAdminId(req);
    const { searchParams } = new URL(req.url);
    const kind = parseKind(req);
    const enabled = parseEnabled(req);
    const q = normTerm(searchParams.get('q'));
    const fromLocale = normLocale(searchParams.get('fromLocale'));
    const toLocale = normLocale(searchParams.get('toLocale'));
    const limit = parseLimit(req);
    const offset = parseOffset(req);

    const where: Prisma.MarketplaceSearchTermMapWhereInput = {};
    if (kind) where.kind = kind;
    if (enabled !== null) where.enabled = enabled;
    if (q) {
      where.OR = [{ fromTerm: { contains: q } }, { toTerm: { contains: q } }];
    }
    if (fromLocale) where.fromLocale = fromLocale;
    if (toLocale) where.toLocale = toLocale;

    const [rows, totalCount] = await Promise.all([
      prisma.marketplaceSearchTermMap.findMany({
        where,
        orderBy: [{ enabled: 'desc' }, { updatedAt: 'desc' }],
        take: limit,
        skip: offset,
        select: {
          id: true,
          kind: true,
          fromTerm: true,
          toTerm: true,
          fromLocale: true,
          toLocale: true,
          bidirectional: true,
          enabled: true,
          createdByAdminId: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      prisma.marketplaceSearchTermMap.count({ where }),
    ]);

    return NextResponse.json(
      {
        totalCount,
        rows: rows.map((r) => ({
          ...r,
          fromLocale: r.fromLocale && String(r.fromLocale).trim() ? r.fromLocale : null,
          toLocale: r.toLocale && String(r.toLocale).trim() ? r.toLocale : null,
          createdAt: r.createdAt.toISOString(),
          updatedAt: r.updatedAt.toISOString(),
        })),
      },
      { status: 200, headers },
    );
  } catch (err) {
    if (err instanceof Error && err.message === 'UNAUTHORIZED_PLATFORM_ADMIN') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers });
    }
    return NextResponse.json({ error: 'Failed to load term maps' }, { status: 500, headers });
  }
}

export async function POST(req: NextRequest) {
  const headers = getSecurityHeaders();
  try {
    const adminId = requirePlatformAdminId(req);

    const rateLimitResponse = await platformAdminMutationRateLimiter(req, adminId);
    if (rateLimitResponse) return rateLimitResponse;

    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) return NextResponse.json({ error: 'Invalid request format' }, { status: 400, headers });

    const kindRaw = typeof body.kind === 'string' ? body.kind.trim().toUpperCase() : '';
    const kind: Kind | null = kindRaw === 'SYNONYM' || kindRaw === 'TRANSLATION' ? (kindRaw as Kind) : null;
    if (!kind) return NextResponse.json({ error: 'Invalid kind' }, { status: 400, headers });

    const fromTerm = normTerm(body.fromTerm);
    const toTerm = normTerm(body.toTerm);
    const toTermsRaw = Array.isArray(body.toTerms) ? (body.toTerms as unknown[]) : null;
    const toTerms =
      toTermsRaw?.map((t) => normTerm(t)).filter(Boolean).filter((t) => t !== fromTerm) ?? [];
    const effectiveToTerms = toTerms.length > 0 ? toTerms : (toTerm && toTerm !== fromTerm ? [toTerm] : []);
    if (fromTerm.length < 1 || effectiveToTerms.length < 1) {
      return NextResponse.json({ error: 'Both terms are required.' }, { status: 400, headers });
    }

    const bidirectional = typeof body.bidirectional === 'boolean' ? body.bidirectional : true;
    const enabled = typeof body.enabled === 'boolean' ? body.enabled : true;

    const fromLocale = normLocale(body.fromLocale);
    const toLocale = normLocale(body.toLocale);
    if (kind === 'TRANSLATION') {
      if (!fromLocale || !toLocale) {
        return NextResponse.json({ error: 'fromLocale and toLocale are required for translations.' }, { status: 400, headers });
      }
    }

    // Some environments end up with non-null locale columns / inputs. For synonyms, store empty-string locales.
    const synFromLocale = kind === 'TRANSLATION' ? fromLocale! : '';
    const synToLocale = kind === 'TRANSLATION' ? toLocale! : '';

    const rowsToCreate: Array<{
      kind: Kind;
      fromTerm: string;
      toTerm: string;
      fromLocale: string;
      toLocale: string;
      bidirectional: boolean;
      enabled: boolean;
      createdByAdminId: number;
    }> = [];

    for (const t of effectiveToTerms) {
      const samePair = fromTerm === t && synFromLocale === synToLocale;
      rowsToCreate.push({
        kind,
        fromTerm,
        toTerm: t,
        fromLocale: synFromLocale,
        toLocale: synToLocale,
        bidirectional,
        enabled,
        createdByAdminId: adminId,
      });
      if (bidirectional && !samePair) {
        rowsToCreate.push({
          kind,
          fromTerm: t,
          toTerm: fromTerm,
          fromLocale: synToLocale,
          toLocale: synFromLocale,
          bidirectional,
          enabled,
          createdByAdminId: adminId,
        });
      }
    }

    const created = await prisma.$transaction(async (tx) => {
      const results: Array<{
        id: string;
        kind: Kind;
        fromTerm: string;
        toTerm: string;
        fromLocale: string | null;
        toLocale: string | null;
        bidirectional: boolean;
        enabled: boolean;
        createdByAdminId: number | null;
        createdAt: Date;
        updatedAt: Date;
      }> = [];
      for (const data of rowsToCreate) {
        const row = await tx.marketplaceSearchTermMap.upsert({
          where: {
            kind_fromTerm_toTerm_fromLocale_toLocale: {
              kind: data.kind,
              fromTerm: data.fromTerm,
              toTerm: data.toTerm,
              fromLocale: data.fromLocale,
              toLocale: data.toLocale,
            },
          },
          create: data,
          update: {
            enabled: data.enabled,
            bidirectional: data.bidirectional,
            updatedAt: new Date(),
          },
          select: {
            id: true,
            kind: true,
            fromTerm: true,
            toTerm: true,
            fromLocale: true,
            toLocale: true,
            bidirectional: true,
            enabled: true,
            createdByAdminId: true,
            createdAt: true,
            updatedAt: true,
          },
        });
        results.push(row);
      }
      return results;
    });

    return NextResponse.json(
      {
        rows: created.map((r) => ({
          ...r,
          fromLocale: r.fromLocale && String(r.fromLocale).trim() ? r.fromLocale : null,
          toLocale: r.toLocale && String(r.toLocale).trim() ? r.toLocale : null,
          createdAt: r.createdAt.toISOString(),
          updatedAt: r.updatedAt.toISOString(),
        })),
      },
      { status: 200, headers },
    );
  } catch (err) {
    if (err instanceof Error && err.message === 'UNAUTHORIZED_PLATFORM_ADMIN') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers });
    }
    return NextResponse.json({ error: 'Failed to create term map' }, { status: 500, headers });
  }
}

