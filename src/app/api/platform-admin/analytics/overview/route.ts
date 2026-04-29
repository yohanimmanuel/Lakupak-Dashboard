import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSecurityHeaders } from '@/utils/auth-security';
import { requirePlatformAdminId } from '@/utils/platform-admin-auth';
import { platformAdminReadRateLimiter } from '@/utils/rateLimiter';

type Grain = 'day';

function parseGrain(req: NextRequest): Grain {
  const { searchParams } = new URL(req.url);
  const g = (searchParams.get('grain') ?? 'day').toLowerCase();
  return g === 'day' ? 'day' : 'day';
}

function parseWindowDays(req: NextRequest): number | null {
  const raw = new URL(req.url).searchParams.get('days');
  if (!raw) return null;
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  const whole = Math.floor(n);
  if (![1, 3, 7, 30, 60].includes(whole)) return null;
  return whole;
}

function startOfUtcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0));
}

function addUtcDays(d: Date, deltaDays: number): Date {
  const x = new Date(d.getTime());
  x.setUTCDate(x.getUTCDate() + deltaDays);
  return x;
}

function parseUntil(req: NextRequest): Date {
  const raw = new URL(req.url).searchParams.get('until');
  const d = raw ? new Date(raw) : new Date();
  if (Number.isNaN(d.getTime())) return new Date();
  return d;
}

function parseSince(req: NextRequest, until: Date): Date {
  const days = parseWindowDays(req);
  if (days) {
    const untilDay = startOfUtcDay(until);
    // Inclusive calendar window: N days including "today" (UTC day bucket).
    return addUtcDays(untilDay, -(days - 1));
  }
  const raw = new URL(req.url).searchParams.get('since');
  if (raw) {
    const d = new Date(raw);
    if (!Number.isNaN(d.getTime())) return d;
  }
  const untilDay = startOfUtcDay(until);
  return addUtcDays(untilDay, -29);
}

function isoDay(d: Date): string {
  // YYYY-MM-DD (UTC)
  return d.toISOString().slice(0, 10);
}

function buildDaySeries(since: Date, until: Date): string[] {
  const start = new Date(Date.UTC(since.getUTCFullYear(), since.getUTCMonth(), since.getUTCDate()));
  const end = new Date(Date.UTC(until.getUTCFullYear(), until.getUTCMonth(), until.getUTCDate()));
  const days: string[] = [];
  for (let t = start.getTime(); t <= end.getTime(); t += 24 * 60 * 60 * 1000) {
    days.push(isoDay(new Date(t)));
  }
  return days;
}

export async function GET(req: NextRequest) {
  const headers = getSecurityHeaders();
  try {
    const adminId = requirePlatformAdminId(req);

    const rateLimitResponse = await platformAdminReadRateLimiter(req, adminId, 'analytics-overview');
    if (rateLimitResponse) return rateLimitResponse;

    const grain = parseGrain(req);
    const until = parseUntil(req);
    const since = parseSince(req, until);
    const untilDay = startOfUtcDay(until);
    const wauSince = addUtcDays(untilDay, -6);

    if (grain !== 'day') {
      return NextResponse.json({ error: 'Unsupported grain' }, { status: 400, headers });
    }

    const days = buildDaySeries(since, until);

    const [
      totals,
      activatedDistributors,
      activatedBuyers,
      activatedDrivers,
      buyerDauByDay,
      searchByDay,
    ] = await Promise.all([
      Promise.all([
        prisma.user.count(),
        prisma.marketplaceUser.count(),
        prisma.driver.count(),
        prisma.user.count({ where: { isSuspended: true } }),
        prisma.marketplaceUser.count({ where: { isSuspended: true } }),
      ]).then(([distributorsTotal, buyersTotal, driversTotal, distributorsSuspended, buyersSuspended]) => ({
        distributorsTotal,
        buyersTotal,
        driversTotal,
        distributorsSuspended,
        buyersSuspended,
      })),

      prisma.$queryRaw<Array<{ count: bigint }>>`
        SELECT COUNT(DISTINCT "userId")::bigint AS "count"
        FROM (
          SELECT "userId" FROM "public"."Product" WHERE "createdAt" >= ${since} AND "createdAt" <= ${until} AND "userId" IS NOT NULL
          UNION
          SELECT "userId" FROM "public"."Product" WHERE "publishedAt" IS NOT NULL AND "publishedAt" >= ${since} AND "publishedAt" <= ${until} AND "userId" IS NOT NULL
          UNION
          SELECT "userId" FROM "public"."Order" WHERE "createdAt" >= ${since} AND "createdAt" <= ${until}
          UNION
          SELECT "userId" FROM "public"."Offer" WHERE "createdAt" >= ${since} AND "createdAt" <= ${until} AND "userId" IS NOT NULL
        ) t
      `.then((r) => Number(r?.[0]?.count ?? 0)),

      prisma.$queryRaw<Array<{ count: bigint }>>`
        SELECT COUNT(DISTINCT "marketplaceUserId")::bigint AS "count"
        FROM (
          SELECT "userId" AS "marketplaceUserId" FROM "public"."UserActivity" WHERE "createdAt" >= ${since} AND "createdAt" <= ${until}
          UNION
          SELECT "marketplaceUserId" FROM "public"."MarketplaceSearchQueryLog"
          WHERE "marketplaceUserId" IS NOT NULL AND "createdAt" >= ${since} AND "createdAt" <= ${until}
        ) t
      `.then((r) => Number(r?.[0]?.count ?? 0)),

      prisma.$queryRaw<Array<{ count: bigint }>>`
        SELECT COUNT(DISTINCT "driverId")::bigint AS "count"
        FROM (
          SELECT "driverId" FROM "public"."Fleet"
          WHERE "driverId" IS NOT NULL AND "createdAt" >= ${since} AND "createdAt" <= ${until}
          UNION
          SELECT "id" AS "driverId" FROM "public"."Driver"
          WHERE "lastLocationAt" IS NOT NULL AND "lastLocationAt" >= ${since} AND "lastLocationAt" <= ${until}
        ) t
      `.then((r) => Number(r?.[0]?.count ?? 0)),

      prisma.$queryRaw<Array<{ day: Date; dau: bigint }>>`
        SELECT date_trunc('day', t."createdAt") AS "day", COUNT(DISTINCT t."marketplaceUserId")::bigint AS "dau"
        FROM (
          SELECT "createdAt", "userId" AS "marketplaceUserId"
          FROM "public"."UserActivity"
          WHERE "createdAt" >= ${since} AND "createdAt" <= ${until}
          UNION ALL
          SELECT "createdAt", "marketplaceUserId"
          FROM "public"."MarketplaceSearchQueryLog"
          WHERE "marketplaceUserId" IS NOT NULL AND "createdAt" >= ${since} AND "createdAt" <= ${until}
        ) t
        GROUP BY 1
        ORDER BY 1 ASC
      `,

      prisma.$queryRaw<Array<{ day: Date; searches: bigint; zero: bigint }>>`
        SELECT date_trunc('day', "createdAt") AS "day",
          COUNT(*)::bigint AS "searches",
          SUM(CASE WHEN "resultCount" = 0 THEN 1 ELSE 0 END)::bigint AS "zero"
        FROM "public"."MarketplaceSearchQueryLog"
        WHERE "createdAt" >= ${since} AND "createdAt" <= ${until}
        GROUP BY 1
        ORDER BY 1 ASC
      `,
    ]);

    // Replace the prisma groupBy placeholders with raw queries that properly bucket by day.
    const [
      newDistributorsDaily,
      newBuyersDaily,
      newDriversDaily,
      suspendedDistributorsDaily,
      suspendedBuyersDaily,
      activeDistributorsDaily,
      activeDriversDaily,
    ] = await Promise.all([
      prisma.$queryRaw<Array<{ day: Date; count: bigint }>>`
        SELECT date_trunc('day', "createdAt") AS "day", COUNT(*)::bigint AS "count"
        FROM "public"."User"
        WHERE "createdAt" >= ${since} AND "createdAt" <= ${until}
        GROUP BY 1
        ORDER BY 1 ASC
      `,
      prisma.$queryRaw<Array<{ day: Date; count: bigint }>>`
        SELECT date_trunc('day', "createdAt") AS "day", COUNT(*)::bigint AS "count"
        FROM "public"."MarketplaceUser"
        WHERE "createdAt" >= ${since} AND "createdAt" <= ${until}
        GROUP BY 1
        ORDER BY 1 ASC
      `,
      prisma.$queryRaw<Array<{ day: Date; count: bigint }>>`
        SELECT date_trunc('day', "createdAt") AS "day", COUNT(*)::bigint AS "count"
        FROM "public"."Driver"
        WHERE "createdAt" >= ${since} AND "createdAt" <= ${until}
        GROUP BY 1
        ORDER BY 1 ASC
      `,
      prisma.$queryRaw<Array<{ day: Date; count: bigint }>>`
        SELECT date_trunc('day', "suspendedAt") AS "day", COUNT(*)::bigint AS "count"
        FROM "public"."User"
        WHERE "suspendedAt" IS NOT NULL AND "suspendedAt" >= ${since} AND "suspendedAt" <= ${until}
        GROUP BY 1
        ORDER BY 1 ASC
      `,
      prisma.$queryRaw<Array<{ day: Date; count: bigint }>>`
        SELECT date_trunc('day', "suspendedAt") AS "day", COUNT(*)::bigint AS "count"
        FROM "public"."MarketplaceUser"
        WHERE "suspendedAt" IS NOT NULL AND "suspendedAt" >= ${since} AND "suspendedAt" <= ${until}
        GROUP BY 1
        ORDER BY 1 ASC
      `,
      prisma.$queryRaw<Array<{ day: Date; count: bigint }>>`
        SELECT date_trunc('day', t."createdAt") AS "day", COUNT(DISTINCT t."userId")::bigint AS "count"
        FROM (
          SELECT "createdAt", "userId" FROM "public"."Product" WHERE "createdAt" >= ${since} AND "createdAt" <= ${until} AND "userId" IS NOT NULL
          UNION ALL
          SELECT "publishedAt" AS "createdAt", "userId" FROM "public"."Product" WHERE "publishedAt" IS NOT NULL AND "publishedAt" >= ${since} AND "publishedAt" <= ${until} AND "userId" IS NOT NULL
          UNION ALL
          SELECT "createdAt", "userId" FROM "public"."Order" WHERE "createdAt" >= ${since} AND "createdAt" <= ${until}
          UNION ALL
          SELECT "createdAt", "userId" FROM "public"."Offer" WHERE "createdAt" >= ${since} AND "createdAt" <= ${until} AND "userId" IS NOT NULL
        ) t
        GROUP BY 1
        ORDER BY 1 ASC
      `,
      prisma.$queryRaw<Array<{ day: Date; count: bigint }>>`
        SELECT date_trunc('day', t."createdAt") AS "day", COUNT(DISTINCT t."driverId")::bigint AS "count"
        FROM (
          SELECT "createdAt", "driverId" FROM "public"."Fleet"
          WHERE "driverId" IS NOT NULL AND "createdAt" >= ${since} AND "createdAt" <= ${until}
          UNION ALL
          SELECT "lastLocationAt" AS "createdAt", "id" AS "driverId" FROM "public"."Driver"
          WHERE "lastLocationAt" IS NOT NULL AND "lastLocationAt" >= ${since} AND "lastLocationAt" <= ${until}
        ) t
        GROUP BY 1
        ORDER BY 1 ASC
      `,
    ]);

    const mapByDay = (rows: Array<{ day: Date; value: number }>) => {
      const m = new Map<string, number>();
      for (const r of rows) m.set(isoDay(r.day), r.value);
      return m;
    };

    const distributorsNewMap = mapByDay(newDistributorsDaily.map((r) => ({ day: r.day, value: Number(r.count ?? 0) })));
    const buyersNewMap = mapByDay(newBuyersDaily.map((r) => ({ day: r.day, value: Number(r.count ?? 0) })));
    const driversNewMap = mapByDay(newDriversDaily.map((r) => ({ day: r.day, value: Number(r.count ?? 0) })));
    const distributorsSuspendedMap = mapByDay(suspendedDistributorsDaily.map((r) => ({ day: r.day, value: Number(r.count ?? 0) })));
    const buyersSuspendedMap = mapByDay(suspendedBuyersDaily.map((r) => ({ day: r.day, value: Number(r.count ?? 0) })));
    const distributorsActiveMap = mapByDay(activeDistributorsDaily.map((r) => ({ day: r.day, value: Number(r.count ?? 0) })));
    const driversActiveMap = mapByDay(activeDriversDaily.map((r) => ({ day: r.day, value: Number(r.count ?? 0) })));
    const dauMap = mapByDay(buyerDauByDay.map((r) => ({ day: r.day, value: Number(r.dau ?? 0) })));
    const searchMap = mapByDay(searchByDay.map((r) => ({ day: r.day, value: Number(r.searches ?? 0) })));
    const searchZeroMap = mapByDay(searchByDay.map((r) => ({ day: r.day, value: Number(r.zero ?? 0) })));

    const series = days.map((d) => {
      const searches = searchMap.get(d) ?? 0;
      const zero = searchZeroMap.get(d) ?? 0;
      const newTotal =
        (distributorsNewMap.get(d) ?? 0) + (buyersNewMap.get(d) ?? 0) + (driversNewMap.get(d) ?? 0);
      const suspendedTotal =
        (distributorsSuspendedMap.get(d) ?? 0) + (buyersSuspendedMap.get(d) ?? 0);
      const netGrowth = newTotal - suspendedTotal;
      const activeTotal =
        (distributorsActiveMap.get(d) ?? 0) + (dauMap.get(d) ?? 0) + (driversActiveMap.get(d) ?? 0);
      const growthEfficiency = activeTotal > 0 ? newTotal / activeTotal : 0;
      return {
        day: d,
        newDistributors: distributorsNewMap.get(d) ?? 0,
        newMarketplaceBuyers: buyersNewMap.get(d) ?? 0,
        newDrivers: driversNewMap.get(d) ?? 0,
        netGrowth,
        growthEfficiency,
        buyerDAU: dauMap.get(d) ?? 0,
        searchVolume: searches,
        searchZeroRate: searches > 0 ? zero / searches : 0,
      };
    });

    const newDistributorsInPeriod = series.reduce((s, r) => s + r.newDistributors, 0);
    const newBuyersInPeriod = series.reduce((s, r) => s + r.newMarketplaceBuyers, 0);
    const newDriversInPeriod = series.reduce((s, r) => s + r.newDrivers, 0);

    const activation = {
      distributorsActivated: activatedDistributors,
      buyersActivated: activatedBuyers,
      driversActivated: activatedDrivers,
      distributorsActivationRate: totals.distributorsTotal > 0 ? activatedDistributors / totals.distributorsTotal : 0,
      buyersActivationRate: totals.buyersTotal > 0 ? activatedBuyers / totals.buyersTotal : 0,
      driversActivationRate: totals.driversTotal > 0 ? activatedDrivers / totals.driversTotal : 0,
    };

    const mauSince = addUtcDays(untilDay, -29);

    const [
      wauBuyers,
      mauBuyers,
      sessionDailyByApp,
      sessionPeriodByApp,
    ] = await Promise.all([
      prisma.$queryRaw<Array<{ count: bigint }>>`
        SELECT COUNT(DISTINCT t."marketplaceUserId")::bigint AS "count"
        FROM (
          SELECT "userId" AS "marketplaceUserId" FROM "public"."UserActivity"
          WHERE "createdAt" >= ${wauSince} AND "createdAt" <= ${until}
          UNION
          SELECT "marketplaceUserId" FROM "public"."MarketplaceSearchQueryLog"
          WHERE "marketplaceUserId" IS NOT NULL
            AND "createdAt" >= ${wauSince} AND "createdAt" <= ${until}
        ) t
      `.then((r) => Number(r?.[0]?.count ?? 0)),

      prisma.$queryRaw<Array<{ count: bigint }>>`
        SELECT COUNT(DISTINCT t."marketplaceUserId")::bigint AS "count"
        FROM (
          SELECT "userId" AS "marketplaceUserId" FROM "public"."UserActivity"
          WHERE "createdAt" >= ${mauSince} AND "createdAt" <= ${until}
          UNION
          SELECT "marketplaceUserId" FROM "public"."MarketplaceSearchQueryLog"
          WHERE "marketplaceUserId" IS NOT NULL AND "createdAt" >= ${mauSince} AND "createdAt" <= ${until}
        ) t
      `.then((r) => Number(r?.[0]?.count ?? 0)),

      prisma.$queryRaw<
        Array<{ day: Date; app: string; avgSec: number | null; samples: bigint }>
      >`
        SELECT date_trunc('day', s."startedAt") AS "day",
          s."app"::text AS "app",
          AVG(s."durationSec")::float AS "avgSec",
          COUNT(*)::bigint AS "samples"
        FROM "public"."AppSessionSample" s
        WHERE s."startedAt" >= ${since} AND s."startedAt" <= ${until}
        GROUP BY 1, 2
        ORDER BY 1 ASC, 2 ASC
      `,

      prisma.$queryRaw<Array<{ app: string; avgSec: number | null; samples: bigint }>>`
        SELECT s."app"::text AS "app",
          AVG(s."durationSec")::float AS "avgSec",
          COUNT(*)::bigint AS "samples"
        FROM "public"."AppSessionSample" s
        WHERE s."startedAt" >= ${since} AND s."startedAt" <= ${until}
        GROUP BY 1
      `,
    ]);

    const sessionDayMap = new Map<string, { avgSec: number; samples: number }>();
    for (const r of sessionDailyByApp) {
      const app = String(r.app ?? '');
      const key = `${app}|${isoDay(r.day)}`;
      sessionDayMap.set(key, {
        avgSec: Number(r.avgSec ?? 0),
        samples: Number(r.samples ?? 0),
      });
    }

    const buildSessionSeries = (
      app: 'DASHBOARD' | 'MARKETPLACE' | 'DRIVER'
    ): Array<{ day: string; avgSec: number; samples: number }> =>
      days.map((d) => {
        const x = sessionDayMap.get(`${app}|${d}`);
        return { day: d, avgSec: x?.avgSec ?? 0, samples: x?.samples ?? 0 };
      });

    const sessionPeriodMap = new Map<string, { avgSec: number; samples: number }>();
    for (const r of sessionPeriodByApp) {
      sessionPeriodMap.set(String(r.app ?? ''), {
        avgSec: Number(r.avgSec ?? 0),
        samples: Number(r.samples ?? 0),
      });
    }

    const sessionKpi = (app: 'DASHBOARD' | 'MARKETPLACE' | 'DRIVER') => {
      const x = sessionPeriodMap.get(app);
      if (!x || x.samples <= 0) return { avgSec: null as number | null, samples: 0 };
      return { avgSec: x.avgSec, samples: x.samples };
    };

    return NextResponse.json(
      {
        params: {
          since: since.toISOString(),
          until: until.toISOString(),
          grain,
        },
        kpis: {
          totals,
          newInPeriod: {
            distributors: newDistributorsInPeriod,
            marketplaceBuyers: newBuyersInPeriod,
            drivers: newDriversInPeriod,
          },
          activation,
          retention: {
            buyersWAU: wauBuyers,
            buyersMAU: mauBuyers,
            buyersStickyRatio: mauBuyers > 0 ? wauBuyers / mauBuyers : 0,
          },
          sessionUsage: {
            dashboard: sessionKpi('DASHBOARD'),
            marketplace: sessionKpi('MARKETPLACE'),
            driver: sessionKpi('DRIVER'),
          },
        },
        sessionSeries: {
          dashboard: buildSessionSeries('DASHBOARD'),
          marketplace: buildSessionSeries('MARKETPLACE'),
          driver: buildSessionSeries('DRIVER'),
        },
        series,
      },
      { status: 200, headers }
    );
  } catch (err) {
    if (err instanceof Error && err.message === 'UNAUTHORIZED_PLATFORM_ADMIN') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers });
    }
    return NextResponse.json({ error: 'Failed to load analytics' }, { status: 500, headers });
  }
}

