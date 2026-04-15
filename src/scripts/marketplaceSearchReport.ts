import 'dotenv/config';
import { prisma } from '@/app/api/graphql/modules/common/prisma';

function daysAgo(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

async function main() {
  const since = daysAgo(7);

  const rows = await prisma.marketplaceSearchQueryLog.findMany({
    where: { createdAt: { gte: since } },
    select: { query: true, resultCount: true, engine: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
    take: 50_000,
  });

  const norm = (s: string) => s.trim().toLowerCase();
  const map = new Map<
    string,
    { query: string; searches: number; zero: number; avgResults: number; engines: Record<string, number> }
  >();

  for (const r of rows) {
    const q = norm(r.query);
    if (!q) continue;
    const prev = map.get(q) ?? {
      query: q,
      searches: 0,
      zero: 0,
      avgResults: 0,
      engines: {},
    };
    prev.searches += 1;
    // `resultCount` is non-nullable in Prisma schema, but guard anyway to avoid NaN if runtime data is unexpected.
    const rc = Number((r as { resultCount?: unknown }).resultCount ?? 0);
    const safeRc = Number.isFinite(rc) ? rc : 0;
    if (safeRc === 0) prev.zero += 1;
    prev.avgResults += safeRc;
    prev.engines[r.engine] = (prev.engines[r.engine] ?? 0) + 1;
    map.set(q, prev);
  }

  const list = Array.from(map.values())
    .map((x) => ({ ...x, avgResults: x.searches ? x.avgResults / x.searches : 0 }))
    .sort((a, b) => {
      // prioritize high volume + high zero-rate
      const aScore = a.searches * (a.zero / Math.max(1, a.searches));
      const bScore = b.searches * (b.zero / Math.max(1, b.searches));
      if (bScore !== aScore) return bScore - aScore;
      return b.searches - a.searches;
    })
    .slice(0, 50);

  console.log(`Marketplace search report (last 7 days since ${since.toISOString()})`);
  console.log('Top problematic queries (volume * zero-rate):\n');
  for (const x of list) {
    const zeroRate = ((x.zero / Math.max(1, x.searches)) * 100).toFixed(0);
    const engines = Object.entries(x.engines)
      .sort((a, b) => b[1] - a[1])
      .map(([k, v]) => `${k}:${v}`)
      .join(', ');
    console.log(
      `- "${x.query}"  searches=${x.searches}  zero=${x.zero} (${zeroRate}%)  avgResults=${x.avgResults.toFixed(
        1,
      )}  engines=[${engines}]`,
    );
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
    process.exit(0);
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });

