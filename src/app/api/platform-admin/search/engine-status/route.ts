import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSecurityHeaders } from '@/utils/auth-security';
import { requirePlatformAdminId } from '@/utils/platform-admin-auth';
import { platformAdminReadRateLimiter } from '@/utils/rateLimiter';
import {
  checkMeiliHealth,
  getMarketplaceSearchEngineMode,
  getMeiliClient,
  MEILI_PRODUCTS_INDEX,
} from '@/lib/meili';

function parseDays(req: NextRequest): number {
  const raw = new URL(req.url).searchParams.get('days');
  const n = raw ? Number(raw) : 7;
  if (!Number.isFinite(n)) return 7;
  return Math.min(Math.max(1, Math.floor(n)), 90);
}

export async function GET(req: NextRequest) {
  const headers = getSecurityHeaders();
  try {
    const adminId = requirePlatformAdminId(req);

    const rateLimitResponse = await platformAdminReadRateLimiter(req, adminId, 'search-engine-status');
    if (rateLimitResponse) return rateLimitResponse;

    const days = parseDays(req);
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const mode = getMarketplaceSearchEngineMode();
    const health = await checkMeiliHealth();

    // Index stats (document count) — only meaningful when Meili is reachable.
    let indexedProducts: number | null = null;
    if (health.reachable) {
      try {
        const client = getMeiliClient();
        if (client) {
          const stats = await client.index(MEILI_PRODUCTS_INDEX).getStats();
          indexedProducts =
            typeof (stats as { numberOfDocuments?: number }).numberOfDocuments === 'number'
              ? (stats as { numberOfDocuments: number }).numberOfDocuments
              : null;
        }
      } catch {
        indexedProducts = null;
      }
    }

    // Which engines actually answered queries recently (debuggability for silent fallback).
    const engineRows = await prisma.marketplaceSearchQueryLog.groupBy({
      by: ['engine'],
      where: { createdAt: { gte: since } },
      _count: { engine: true },
    });
    const engineBreakdown = engineRows
      .map((r) => ({ engine: r.engine, count: r._count.engine }))
      .sort((a, b) => b.count - a.count);
    const totalSearches = engineBreakdown.reduce((sum, r) => sum + r.count, 0);

    // In strict mode, any search not served by Meili (or cache) is a degraded answer.
    const nonMeiliSearches = engineBreakdown
      .filter((r) => r.engine !== 'meili' && r.engine !== 'cache')
      .reduce((sum, r) => sum + r.count, 0);
    const degradedRate = totalSearches > 0 ? nonMeiliSearches / totalSearches : 0;

    return NextResponse.json(
      {
        mode,
        meili: health,
        indexedProducts,
        since: since.toISOString(),
        days,
        totalSearches,
        engineBreakdown,
        degradedRate,
      },
      { status: 200, headers },
    );
  } catch (err) {
    if (err instanceof Error && err.message === 'UNAUTHORIZED_PLATFORM_ADMIN') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers });
    }
    return NextResponse.json({ error: 'Failed to load search engine status' }, { status: 500, headers });
  }
}
