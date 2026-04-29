import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSecurityHeaders } from '@/utils/auth-security';
import { requirePlatformAdminId } from '@/utils/platform-admin-auth';
import { platformAdminReadRateLimiter } from '@/utils/rateLimiter';

function parseDays(req: NextRequest): number {
  const raw = new URL(req.url).searchParams.get('days');
  const n = raw ? Number(raw) : 7;
  if (!Number.isFinite(n)) return 7;
  return Math.min(Math.max(1, Math.floor(n)), 90);
}

function parseLimit(req: NextRequest): number {
  const raw = new URL(req.url).searchParams.get('limit');
  const n = raw ? Number(raw) : 50;
  if (!Number.isFinite(n)) return 50;
  return Math.min(Math.max(1, Math.floor(n)), 200);
}

export async function GET(req: NextRequest) {
  const headers = getSecurityHeaders();
  try {
    const adminId = requirePlatformAdminId(req);

    const rateLimitResponse = await platformAdminReadRateLimiter(req, adminId, 'search-queries');
    if (rateLimitResponse) return rateLimitResponse;

    const days = parseDays(req);
    const limit = parseLimit(req);
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const rows = await prisma.$queryRaw<
      Array<{
        query: string;
        searches: bigint;
        zero: bigint;
        avgResults: number;
      }>
    >`
      SELECT
        lower(trim("query")) as "query",
        COUNT(*)::bigint as "searches",
        SUM(CASE WHEN "resultCount" = 0 THEN 1 ELSE 0 END)::bigint as "zero",
        AVG("resultCount")::float8 as "avgResults"
      FROM "public"."MarketplaceSearchQueryLog"
      WHERE "createdAt" >= ${since}
      GROUP BY lower(trim("query"))
      ORDER BY (COUNT(*)::float8 * (SUM(CASE WHEN "resultCount" = 0 THEN 1 ELSE 0 END)::float8 / GREATEST(COUNT(*)::float8, 1))) DESC,
               COUNT(*) DESC
      LIMIT ${limit}
    `;

    return NextResponse.json(
      {
        since: since.toISOString(),
        days,
        rows: rows.map((r) => ({
          query: r.query,
          searches: Number(r.searches),
          zero: Number(r.zero),
          zeroRate: Number(r.searches) > 0 ? Number(r.zero) / Number(r.searches) : 0,
          avgResults: Number(r.avgResults ?? 0),
        })),
      },
      { status: 200, headers },
    );
  } catch (err) {
    if (err instanceof Error && err.message === 'UNAUTHORIZED_PLATFORM_ADMIN') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers });
    }
    return NextResponse.json({ error: 'Failed to load search queries' }, { status: 500, headers });
  }
}

