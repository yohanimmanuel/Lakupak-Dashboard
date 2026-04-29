import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSecurityHeaders } from '@/utils/auth-security';
import { requirePlatformAdminId, UnauthorizedPlatformAdminError } from '@/utils/platform-admin-auth';
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
  if (![3, 7, 30, 60].includes(whole)) return null;
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

    const rateLimitResponse = await platformAdminReadRateLimiter(req, adminId, 'analytics-operational');
    if (rateLimitResponse) return rateLimitResponse;

    const grain = parseGrain(req);
    const until = parseUntil(req);
    const since = parseSince(req, until);

    if (grain !== 'day') {
      return NextResponse.json({ error: 'Unsupported grain' }, { status: 400, headers });
    }

    const days = buildDaySeries(since, until);

    const mapByDay = (rows: Array<{ day: Date; value: number }>) => {
      const m = new Map<string, number>();
      for (const r of rows) m.set(isoDay(r.day), r.value);
      return m;
    };

    const [
      ordersCreatedDaily,
      ordersAcceptedDaily,
      ordersDeliveredDaily,
      ordersCancelledDaily,
      buyerCancellationsDaily,
      buyerReturnRequestsDaily,
      driverFailuresDaily,
      activeDriversDaily,
      fleetStatusCounts,
      kpiBacklog,
      kpiTimeToAccept,
      kpiTimeToDeliver,
      kpiDeliveredToReceived,
      kpiLowStock,
    ] = await Promise.all([
      prisma.$queryRaw<Array<{ day: Date; count: bigint }>>`
        SELECT date_trunc('day', "createdAt") AS "day", COUNT(*)::bigint AS "count"
        FROM "public"."Order"
        WHERE "isDeleted" = false AND "createdAt" >= ${since} AND "createdAt" <= ${until}
        GROUP BY 1
        ORDER BY 1 ASC
      `,
      prisma.$queryRaw<Array<{ day: Date; count: bigint }>>`
        SELECT date_trunc('day', "acceptedAt") AS "day", COUNT(*)::bigint AS "count"
        FROM "public"."Order"
        WHERE "isDeleted" = false AND "acceptedAt" IS NOT NULL AND "acceptedAt" >= ${since} AND "acceptedAt" <= ${until}
        GROUP BY 1
        ORDER BY 1 ASC
      `,
      prisma.$queryRaw<Array<{ day: Date; count: bigint }>>`
        SELECT date_trunc('day', "deliveredAt") AS "day", COUNT(*)::bigint AS "count"
        FROM "public"."Order"
        WHERE "isDeleted" = false AND "deliveredAt" IS NOT NULL AND "deliveredAt" >= ${since} AND "deliveredAt" <= ${until}
        GROUP BY 1
        ORDER BY 1 ASC
      `,
      prisma.$queryRaw<Array<{ day: Date; count: bigint }>>`
        SELECT date_trunc('day', COALESCE("cancelledAt", "updatedAt")) AS "day", COUNT(*)::bigint AS "count"
        FROM "public"."Order"
        WHERE "isDeleted" = false
          AND "orderStatus" = 'Cancelled'
          AND COALESCE("cancelledAt", "updatedAt") >= ${since}
          AND COALESCE("cancelledAt", "updatedAt") <= ${until}
        GROUP BY 1
        ORDER BY 1 ASC
      `,
      prisma.$queryRaw<Array<{ day: Date; count: bigint }>>`
        SELECT date_trunc('day', "createdAt") AS "day", COUNT(*)::bigint AS "count"
        FROM "public"."OrderCancellation"
        WHERE "createdAt" >= ${since} AND "createdAt" <= ${until}
        GROUP BY 1
        ORDER BY 1 ASC
      `,
      prisma.$queryRaw<Array<{ day: Date; count: bigint }>>`
        SELECT date_trunc('day', "createdAt") AS "day", COUNT(*)::bigint AS "count"
        FROM "public"."OrderReturnRequest"
        WHERE "createdAt" >= ${since} AND "createdAt" <= ${until}
        GROUP BY 1
        ORDER BY 1 ASC
      `,
      prisma.$queryRaw<Array<{ day: Date; count: bigint }>>`
        SELECT date_trunc('day', "createdAt") AS "day", COUNT(*)::bigint AS "count"
        FROM "public"."OrderFailedReason"
        WHERE "createdAt" >= ${since} AND "createdAt" <= ${until}
        GROUP BY 1
        ORDER BY 1 ASC
      `,
      prisma.$queryRaw<Array<{ day: Date; count: bigint }>>`
        SELECT date_trunc('day', "lastLocationAt") AS "day", COUNT(DISTINCT "id")::bigint AS "count"
        FROM "public"."Driver"
        WHERE "lastLocationAt" IS NOT NULL AND "lastLocationAt" >= ${since} AND "lastLocationAt" <= ${until}
        GROUP BY 1
        ORDER BY 1 ASC
      `,
      prisma.$queryRaw<Array<{ status: string; count: bigint }>>`
        SELECT COALESCE("status", 'Unknown')::text AS "status", COUNT(*)::bigint AS "count"
        FROM "public"."Fleet"
        GROUP BY 1
        ORDER BY 2 DESC
      `,
      prisma.$queryRaw<Array<{ count: bigint }>>`
        SELECT COUNT(*)::bigint AS "count"
        FROM "public"."Order"
        WHERE "isDeleted" = false
          AND "orderStatus" <> 'Cancelled'
          AND "cancelledAt" IS NULL
          AND "deliveredAt" IS NULL
      `.then((r) => Number(r?.[0]?.count ?? 0)),
      prisma.$queryRaw<Array<{ p50Sec: number | null }>>`
        SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM ("acceptedAt" - "createdAt")))::float AS "p50Sec"
        FROM "public"."Order"
        WHERE "isDeleted" = false
          AND "acceptedAt" IS NOT NULL
          AND "createdAt" >= ${since} AND "createdAt" <= ${until}
      `.then((r) => Number(r?.[0]?.p50Sec ?? 0)),
      prisma.$queryRaw<Array<{ p50Sec: number | null }>>`
        SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM ("deliveredAt" - "acceptedAt")))::float AS "p50Sec"
        FROM "public"."Order"
        WHERE "isDeleted" = false
          AND "acceptedAt" IS NOT NULL
          AND "deliveredAt" IS NOT NULL
          AND "acceptedAt" >= ${since} AND "acceptedAt" <= ${until}
      `.then((r) => Number(r?.[0]?.p50Sec ?? 0)),
      prisma.$queryRaw<Array<{ p50Sec: number | null }>>`
        SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM ("receivedAt" - "deliveredAt")))::float AS "p50Sec"
        FROM "public"."Order"
        WHERE "isDeleted" = false
          AND "deliveredAt" IS NOT NULL
          AND "receivedAt" IS NOT NULL
          AND "deliveredAt" >= ${since} AND "deliveredAt" <= ${until}
      `.then((r) => Number(r?.[0]?.p50Sec ?? 0)),
      prisma.$queryRaw<Array<{ low: bigint; out: bigint }>>`
        SELECT
          SUM(CASE WHEN "isActive" = true AND "stockQuantity" > 0 AND "lowStockThreshold" > 0 AND "stockQuantity" <= "lowStockThreshold" THEN 1 ELSE 0 END)::bigint AS "low",
          SUM(CASE WHEN "isActive" = true AND "stockQuantity" <= 0 THEN 1 ELSE 0 END)::bigint AS "out"
        FROM "public"."VariantOption"
      `.then((r) => ({ low: Number(r?.[0]?.low ?? 0), out: Number(r?.[0]?.out ?? 0) })),
    ]);

    const createdMap = mapByDay(ordersCreatedDaily.map((r) => ({ day: r.day, value: Number(r.count ?? 0) })));
    const acceptedMap = mapByDay(ordersAcceptedDaily.map((r) => ({ day: r.day, value: Number(r.count ?? 0) })));
    const deliveredMap = mapByDay(ordersDeliveredDaily.map((r) => ({ day: r.day, value: Number(r.count ?? 0) })));
    const cancelledMap = mapByDay(ordersCancelledDaily.map((r) => ({ day: r.day, value: Number(r.count ?? 0) })));
    const cancelsMap = mapByDay(buyerCancellationsDaily.map((r) => ({ day: r.day, value: Number(r.count ?? 0) })));
    const returnsMap = mapByDay(buyerReturnRequestsDaily.map((r) => ({ day: r.day, value: Number(r.count ?? 0) })));
    const failuresMap = mapByDay(driverFailuresDaily.map((r) => ({ day: r.day, value: Number(r.count ?? 0) })));
    const activeDriversMap = mapByDay(activeDriversDaily.map((r) => ({ day: r.day, value: Number(r.count ?? 0) })));

    const series = days.map((d) => ({
      day: d,
      ordersCreated: createdMap.get(d) ?? 0,
      ordersAccepted: acceptedMap.get(d) ?? 0,
      ordersDelivered: deliveredMap.get(d) ?? 0,
      ordersCancelled: cancelledMap.get(d) ?? 0,
      buyerCancellations: cancelsMap.get(d) ?? 0,
      buyerReturnRequests: returnsMap.get(d) ?? 0,
      driverFailures: failuresMap.get(d) ?? 0,
      activeDrivers: activeDriversMap.get(d) ?? 0,
    }));

    const fleetStatuses = fleetStatusCounts.map((r) => ({ status: String(r.status ?? 'Unknown'), count: Number(r.count ?? 0) }));

    return NextResponse.json(
      {
        params: { since: since.toISOString(), until: until.toISOString(), grain },
        kpis: {
          distributors: {
            openOrders: kpiBacklog,
            medianTimeToAcceptSec: Number.isFinite(kpiTimeToAccept) ? kpiTimeToAccept : 0,
            medianTimeToDeliverSec: Number.isFinite(kpiTimeToDeliver) ? kpiTimeToDeliver : 0,
            lowStockVariants: kpiLowStock.low,
            outOfStockVariants: kpiLowStock.out,
          },
          buyers: {
            cancellations: series.reduce((s, r) => s + r.buyerCancellations, 0),
            returnRequests: series.reduce((s, r) => s + r.buyerReturnRequests, 0),
            medianDeliveredToReceivedSec: Number.isFinite(kpiDeliveredToReceived) ? kpiDeliveredToReceived : 0,
          },
          drivers: {
            failures: series.reduce((s, r) => s + r.driverFailures, 0),
            activeDriversInPeriod: Array.from(activeDriversMap.values()).reduce((m, v) => Math.max(m, v), 0),
            fleetStatuses,
          },
        },
        series,
      },
      { status: 200, headers }
    );
  } catch (err) {
    if (err instanceof UnauthorizedPlatformAdminError) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers });
    }
    console.error('[PlatformAdmin][OperationalAnalytics] Failed to load operational analytics', err);
    return NextResponse.json({ error: 'Failed to load operational analytics' }, { status: 500, headers });
  }
}

