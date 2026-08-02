import type { Prisma } from '@/lib/db';
import { prisma } from '../../common/prisma';
import { safeParsePrice } from '@/utils/currencyUtils';
import { calculateSoldCounts, calculateProductReviewStats, calculateDistributorReviewStats, updateProductPricesFromOffers, deactivateExpiredOffers } from '@/utils/marketplaceMetrics';
import { sanitizePagination, buildPaginationInfo } from '../../common/utils';
import { getTodayBoundaries, getStartOfDay, getEndOfDay } from '@/lib/dateUtils';
import {
  getCachedMarketplaceSearch,
  setCachedMarketplaceSearch,
  invalidateSearchCache,
} from '@/utils/searchCache';
import { getMeiliClient, MEILI_PRODUCTS_INDEX, getMarketplaceSearchEngineMode } from '@/lib/meili';
import type { SearchParams } from 'meilisearch';
import { getSecurityHeaders } from '@/utils/auth-security';
import { verifyAccessToken } from '@/lib/jwt';
import { validateOfferForProduct, trackOfferUsage as trackOfferUsageUtil, trackOfferUsageForAllTypes, updateOfferStatusesBasedOnLimits } from '@/utils/offerValidation';
import { parseNumberByCurrency } from '@/config/currencyConfig';
import { validateVariant } from '@/services/variantService';
import { syncOrderToBuyerProfile, buildMobileBuyerId } from '@/utils/buyerSync';
import { broadcastOrderUpdate } from '@/utils/websocketBroadcast';
import { buildBuyXGetYPromotionDetails } from '@/utils/promotionUtils';
import { enqueueSideEffect } from '@/lib/sideEffectQueue';
import { expandCategoryFilterValues } from '@/utils/categoryUtils';

function isSafeCategoryFilterToken(value: string): boolean {
  return value.length > 0 && value.length <= 64 && /^[\p{L}\p{N}\s&\-_/]+$/u.test(value);
}

/** Meili filter matching canonical + legacy productType aliases. */
function buildMeiliCategoryFilter(category: string | undefined | null): string | undefined {
  if (!category || category === 'All') return undefined;
  const tokens = expandCategoryFilterValues(category).filter(isSafeCategoryFilterToken);
  if (tokens.length === 0) return undefined;
  const clauses = tokens.map((token) => `productType = "${token.replace(/"/g, '\\"')}"`);
  return clauses.length === 1 ? clauses[0] : `(${clauses.join(' OR ')})`;
}

type OfferForMarketplace = Prisma.OfferGetPayload<{
  include: {
    offerProducts: true;
    offerDiscountTypes: true;
    dateRanges: true;
  };
}>;

type MarketplaceOfferDiscountType = OfferForMarketplace['offerDiscountTypes'][number];

const marketplaceProductInclude = {
  variants: true,
  // Only surface sellable variant options. Options tied to past orders that the distributor
  // "removed" are deactivated (isActive=false) rather than deleted, and must not appear in the marketplace.
  variantOptions: { where: { isActive: true } },
  user: {
    select: {
      firstName: true,
      lastName: true,
      company: {
        select: {
          name: true,
          businessAddress: true,
          businessPhone: true,
          businessEmail: true,
          industryType: true,
          shippingPreferences: true,
          pickupAddress: true,
          logo: true,
          bannerImage: true,
          defaultDeliveryLeadTimeMinDays: true,
          defaultDeliveryLeadTimeMaxDays: true,
        },
      },
    },
  },
} satisfies Prisma.ProductInclude;

type MarketplaceProductRow = Prisma.ProductGetPayload<{ include: typeof marketplaceProductInclude }>;

/** Meili returns `[]` when there are no hits — that is truthy in JS, so never use `if (!ids)` alone. */
function hasMarketplaceSearchHitIds(ids: string[] | null | undefined): ids is string[] {
  return Array.isArray(ids) && ids.length > 0;
}

/** Only set when env is explicit — wrong defaults can 400 older Meilisearch (e.g. `locales`) and force pg_trgm. */
function parseMarketplaceMeiliMatchingStrategy(): 'last' | 'all' | 'frequency' | undefined {
  const raw = process.env.MARKETPLACE_MEILI_MATCHING_STRATEGY?.trim().toLowerCase();
  if (raw === 'last' || raw === 'all' || raw === 'frequency') return raw;
  return undefined;
}

/**
 * Query-time locales (Meili 1.8+). Default **none** — sending `locales` on unsupported servers breaks search silently.
 * Set `MARKETPLACE_MEILI_SEARCH_LOCALES=id,en` when your Meili version supports it.
 */
function parseMarketplaceMeiliSearchLocales(): string[] {
  const raw = process.env.MARKETPLACE_MEILI_SEARCH_LOCALES?.trim();
  if (!raw) return [];
  return raw.split(',').map((s) => s.trim()).filter(Boolean);
}

/** Meili returns `{}` or all-zero facet maps when `estimatedTotalHits` is 0 — still truthy, so pills sorted A–Z. */
function facetDistributionHasHits(m: Record<string, number> | null | undefined): boolean {
  if (!m || typeof m !== 'object') return false;
  return Object.values(m).some((n) => typeof n === 'number' && n > 0);
}

function normSearchTerm(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ');
}

function boundedEditDistance(aRaw: string, bRaw: string, maxDist: number): number {
  const a = normSearchTerm(aRaw);
  const b = normSearchTerm(bRaw);
  if (!a || !b) return maxDist + 1;
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > maxDist) return maxDist + 1;

  const m = a.length;
  const n = b.length;
  const prev = new Array(n + 1);
  const cur = new Array(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    cur[0] = i;
    let rowMin = cur[0];
    const ca = a.charCodeAt(i - 1);
    for (let j = 1; j <= n; j++) {
      const cost = ca === b.charCodeAt(j - 1) ? 0 : 1;
      const v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      cur[j] = v;
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > maxDist) return maxDist + 1;
    for (let j = 0; j <= n; j++) prev[j] = cur[j];
  }
  return prev[n];
}

function pickDidYouMeanCandidate(qNorm: string, candidates: Array<string | null | undefined>): string | null {
  const q = normSearchTerm(qNorm);
  if (!q) return null;
  const maxDist = q.length <= 8 ? 2 : q.length <= 14 ? 3 : 4;

  let best: { text: string; dist: number; len: number } | null = null;
  for (const cRaw of candidates) {
    const c = typeof cRaw === 'string' ? cRaw.trim() : '';
    if (!c) continue;
    const cNorm = normSearchTerm(c);
    if (!cNorm || cNorm === q) continue;
    // Basic typo-likeness: keep first char consistent for short queries
    if (q.length <= 10 && cNorm.charAt(0) !== q.charAt(0)) continue;
    const d = boundedEditDistance(q, cNorm, maxDist);
    if (d > maxDist) continue;
    const item = { text: c, dist: d, len: cNorm.length };
    if (!best) best = item;
    else if (item.dist < best.dist) best = item;
    else if (item.dist === best.dist && item.len > best.len) best = item;
  }
  return best ? best.text : null;
}

async function getMarketplaceSearchExpansions(
  prismaClient: typeof prisma,
  rawQuery: string,
  cap: number,
): Promise<string[]> {
  const q = normSearchTerm(rawQuery);
  if (!q) return [];

  const tokens = q.split(' ').filter(Boolean);
  const candidates = Array.from(new Set([q, ...tokens])).slice(0, 12);

  const rows = await prismaClient.marketplaceSearchTermMap.findMany({
    where: {
      enabled: true,
      fromTerm: { in: candidates },
    },
    select: { toTerm: true },
  });

  const out: string[] = [];
  const seen = new Set<string>();
  for (const r of rows) {
    const t = normSearchTerm(r.toTerm);
    if (!t) continue;
    if (t === q) continue;
    if (seen.has(t)) continue;
    seen.add(t);
    out.push(t);
    if (out.length >= cap) break;
  }
  return out;
}

/**
 * Category pill counts aligned with pg_trgm product matching (no category chip filter — same idea as Meili facet pass).
 */
async function trgmFacetCountsByProductType(
  prismaClient: typeof prisma,
  q: string,
  extraTerms: string[],
  minScore: number,
): Promise<Record<string, number>> {
  try {
    const terms = [normSearchTerm(q), ...extraTerms.map(normSearchTerm)].filter(Boolean).slice(0, 6);
    if (terms.length === 0) return {};
    const rows = await prismaClient.$queryRaw<Array<{ productType: string; cnt: bigint }>>`
      SELECT
        trim(p."productType") AS "productType",
        COUNT(DISTINCT p."productId")::bigint AS "cnt"
      FROM "public"."Product" p
      CROSS JOIN LATERAL unnest(${terms}::text[]) AS t("term")
      WHERE p."marketplaceStatus" = 'Published'
        AND p."status" = 'Published'
        AND trim(COALESCE(p."productType", '')) <> ''
        AND GREATEST(
          similarity(lower(p."name"), t."term"),
          similarity(lower(COALESCE(p."brand", '')), t."term"),
          similarity(lower(COALESCE(p."productType", '')), t."term"),
          similarity(lower(COALESCE(p."description", '')), t."term")
        ) >= ${minScore}
      GROUP BY trim(p."productType")
    `;
    const m: Record<string, number> = {};
    for (const r of rows) {
      const k = r.productType != null ? String(r.productType).trim() : '';
      if (!k) continue;
      m[k] = typeof r.cnt === 'bigint' ? Number(r.cnt) : Number(r.cnt);
    }
    return m;
  } catch {
    return {};
  }
}

export const fetchMarketplaceProducts = async (args: {
  page?: number;
  limit?: number;
  category?: string;
  search?: string;
  productId?: string;
  marketplaceUserId?: number;
}) => {
  const { page = 1, limit = 20, category, search, productId } = args;
  // Deterministic search mode: 'auto' allows silent fallback; 'meili' (strict) flags any non-Meili
  // result as degraded so relevance/latency drops are observable instead of silent.
  const engineRequested = getMarketplaceSearchEngineMode();
  let engineUsed: 'meili' | 'pg_trgm' | 'js_score' | 'prisma' | 'cache' = 'prisma';
  const meiliTimeoutMs = (() => {
    const raw = process.env.MEILI_SEARCH_TIMEOUT_MS;
    const n = raw ? Number(raw) : NaN;
    return Number.isFinite(n) && n > 0 ? n : 800;
  })();
  const fallbackTrigramMinScore = (() => {
    const raw = process.env.MARKETPLACE_SEARCH_FALLBACK_TRIGRAM_MIN_SCORE;
    const n = raw ? Number(raw) : NaN;
    // Trigram similarity is in [0,1]. 0.2 is a reasonable "typo-ish" threshold for short queries.
    return Number.isFinite(n) && n > 0 ? n : 0.2;
  })();
  
  // ONLY use cache for search queries (when search parameter is provided)
  // Regular marketplace listings should always be fresh to show real-time offer/price updates
  let cachedResult = null;
  if (search && search.trim()) {
    cachedResult = await getCachedMarketplaceSearch<{
    nodes: unknown[];
    pagination: ReturnType<typeof buildPaginationInfo>;
    timestamp?: string;
  }>({ search: search || null, category: category || null, page, limit });
  
  if (cachedResult) {
    if (search && search.trim()) engineUsed = 'cache';
    return {
      ...cachedResult,
      engine: engineUsed,
      engineRequested,
      // A cached payload originally came from a healthy engine; serving it is never "degraded".
      degraded: false,
      timestamp: new Date().toISOString()
    };
    }
  }
  
  // Try Meilisearch first for search queries (better relevance + typos + facets).
  // Fall back to Prisma when MEILI_HOST isn't set or Meili is unreachable.
  let meiliHitIds: string[] | null = null;
  let meiliTotalCount: number | null = null;
  let meiliFacetProductTypeCounts: Record<string, number> | null = null;
  let meiliTopHitName: string | null = null;
  let meiliTopHitBrand: string | null = null;
  let meiliTopHitSellerName: string | null = null;
  let meiliTopHitProductType: string | null = null;
  /** When pg_trgm serves results, pills use these counts so ordering matches the fuzzy match set (not empty Meili facets). */
  let trgmFacetProductTypeCounts: Record<string, number> | null = null;
  const queryExpansions =
    search && search.trim() ? await getMarketplaceSearchExpansions(prisma, search, 4).catch(() => []) : [];
  const searchTerms = search && search.trim() ? [search.trim(), ...queryExpansions] : [];
  if (search && search.trim()) {
    const client = getMeiliClient();
    if (client) {
      try {
        const index = client.index(MEILI_PRODUCTS_INDEX);
        const filterParts: string[] = [];
        const categoryFilter = buildMeiliCategoryFilter(category);
        if (categoryFilter) filterParts.push(categoryFilter);
        const filter = filterParts.length ? filterParts.join(' AND ') : undefined;
        const primaryQ = search.trim();
        const meiliMatchingStrategy = parseMarketplaceMeiliMatchingStrategy();
        const meiliLocales = parseMarketplaceMeiliSearchLocales();
        const meiliOptionalParams: SearchParams = {
          ...(meiliMatchingStrategy ? { matchingStrategy: meiliMatchingStrategy } : {}),
          ...(meiliLocales.length ? { locales: meiliLocales } : {}),
        };
        const meiliRace = <T>(p: Promise<T>) =>
          Promise.race([
            p,
            new Promise<never>((_, reject) =>
              setTimeout(() => reject(new Error(`Meili search timeout after ${meiliTimeoutMs}ms`)), meiliTimeoutMs),
            ),
          ]);
        const meiliSearchBase = {
          limit,
          offset: (page - 1) * limit,
          filter,
          facets: ['productType'],
        };
        // If optional params 400 on older Meilisearch, retry without them so Meili is used instead of silent pg fallback.
        const runMeili = async (q: string) => {
          try {
            return await meiliRace(index.search(q, { ...meiliSearchBase, ...meiliOptionalParams }));
          } catch (err) {
            const isBadRequest =
              err instanceof Error && (err.message.includes('400') || err.message.includes('Bad Request'));
            if (isBadRequest && Object.keys(meiliOptionalParams).length > 0) {
              return await meiliRace(index.search(q, meiliSearchBase));
            }
            throw err;
          }
        };

        const meiliResPrimary = await runMeili(primaryQ);
        const hits = (meiliResPrimary.hits ?? []) as unknown as Array<{
          id?: string;
          name?: unknown;
          brand?: unknown;
          companyName?: unknown;
          productType?: unknown;
        }>;
        const topHit = hits[0];
        meiliTopHitName = (() => {
          const nm = typeof topHit?.name === 'string' ? topHit.name.trim() : '';
          return nm ? nm : null;
        })();
        meiliTopHitBrand = (() => {
          const nm = typeof topHit?.brand === 'string' ? topHit.brand.trim() : '';
          return nm ? nm : null;
        })();
        meiliTopHitSellerName = (() => {
          const nm = typeof topHit?.companyName === 'string' ? topHit.companyName.trim() : '';
          return nm ? nm : null;
        })();
        meiliTopHitProductType = (() => {
          const nm = typeof topHit?.productType === 'string' ? topHit.productType.trim() : '';
          return nm ? nm : null;
        })();
        const extraQs = queryExpansions.slice(0, 2);
        const extraRes = await Promise.all(
          extraQs.map(async (q2) => {
            try {
              return await runMeili(q2);
            } catch {
              return null;
            }
          }),
        );

        const mergedIds: string[] = [];
        const seen = new Set<string>();
        const pushHits = (res: unknown) => {
          const rr = res as { hits?: unknown } | null | undefined;
          const ids = (rr?.hits as Array<{ id?: string }> | undefined)
            ?.map((h) => h.id)
            .filter((v): v is string => typeof v === 'string' && v.length > 0);
          if (!ids) return;
          for (const id of ids) {
            if (seen.has(id)) continue;
            seen.add(id);
            mergedIds.push(id);
          }
        };
        pushHits(meiliResPrimary);
        for (const r of extraRes) pushHits(r);

        meiliHitIds = mergedIds;
        engineUsed = 'meili';
        meiliTotalCount =
          typeof (meiliResPrimary as { estimatedTotalHits?: unknown }).estimatedTotalHits === 'number'
            ? ((meiliResPrimary as { estimatedTotalHits?: number }).estimatedTotalHits as number)
            : meiliHitIds.length;

        // If a category filter is applied, `facetDistribution` will only reflect that filtered scope.
        // For Shopee-style "show all categories but rank relevant ones on top", fetch facets without the category filter.
        const meiliFacetBase: SearchParams = { limit: 0, offset: 0, facets: ['productType'] };
        let meiliResFacets: typeof meiliResPrimary = meiliResPrimary;
        if (category && category !== 'All') {
          try {
            try {
              meiliResFacets = await meiliRace(
                index.search(primaryQ, { ...meiliFacetBase, ...meiliOptionalParams }),
              );
            } catch {
              if (Object.keys(meiliOptionalParams).length > 0) {
                meiliResFacets = await meiliRace(index.search(primaryQ, meiliFacetBase));
              }
              // Keep meiliResHits-derived facets if facet-only query still fails — do not drop main Meili results.
            }
          } catch {
            meiliResFacets = meiliResPrimary;
          }
        }

        const facetDist = (meiliResFacets.facetDistribution ?? {}) as Record<string, Record<string, number> | undefined>;
        meiliFacetProductTypeCounts = facetDist.productType ?? {};
      } catch {
        // ignore and fall back
        meiliHitIds = null;
        meiliTotalCount = null;
        meiliFacetProductTypeCounts = null;
        engineUsed = 'prisma';
      }
    }
  }

  // Build where clause for published products only
  const whereClause: Prisma.ProductWhereInput = {
    marketplaceStatus: 'Published',
    status: 'Published',
  };

  // Direct lookup by productId: neither Prisma substring search nor the Meili index
  // covers the id, so shareable product links resolve through this exact match.
  if (productId && productId.trim()) {
    whereClause.productId = productId.trim();
  }

  // Search term = OR across searchable fields (Meili/pg_trgm handle relevance; Prisma path is substring match).
  if (search && search.trim()) {
    const ors: Prisma.ProductWhereInput[] = [];
    for (const t of (searchTerms.length ? searchTerms : [search.trim()]).slice(0, 5)) {
      ors.push({ name: { contains: t, mode: 'insensitive' } });
      ors.push({ description: { contains: t, mode: 'insensitive' } });
      ors.push({ brand: { contains: t, mode: 'insensitive' } });
      ors.push({ productType: { contains: t, mode: 'insensitive' } });
    }
    whereClause.OR = ors;
  }

  // For category pills during search, we want "all categories" ranked by relevance for this query,
  // so we compute facet counts from a where clause that does NOT include the selected category filter.
  const facetWhereClause: Prisma.ProductWhereInput = { ...whereClause };

  // Category filter = productType only (sales channel is a separate filter on client).
  // Expand to legacy aliases so new taxonomy names still match older productType tags.
  if (category && category !== 'All') {
    const categoryValues = expandCategoryFilterValues(category);
    if (categoryValues.length > 0) {
      const existingAnd = Array.isArray(whereClause.AND)
        ? whereClause.AND
        : whereClause.AND
          ? [whereClause.AND]
          : [];
      whereClause.AND = [
        ...existingAnd,
        { productType: { in: categoryValues } },
      ];
    }
  }
  
  const { page: safePage, limit: safeLimit } = sanitizePagination(page, limit);
  const skip = (safePage - 1) * safeLimit;
  const take = safeLimit;

  // If Meili is unavailable, errors, or returns **zero** hits, fall back to pg_trgm (then JS scorer).
  // Important: Meili uses `[]` for no hits — `[]` is truthy, so we must use length checks, not `if (!ids)`.
  if (!hasMarketplaceSearchHitIds(meiliHitIds) && search && search.trim()) {
    // 1) Try typo-ish fallback using Postgres pg_trgm similarity (if available).
    // Supabase typically supports enabling pg_trgm, but we must not hard-require it at runtime.
    // If the extension/functions aren't available, we fall back to the lightweight JS scorer below.
    try {
      const q = search.trim().toLowerCase();
      const terms = [normSearchTerm(q), ...queryExpansions.map(normSearchTerm)].filter(Boolean).slice(0, 6);
      const cats =
        category && category !== 'All' ? expandCategoryFilterValues(category) : [];

      const rows = await prisma.$queryRaw<Array<{ productId: string; score: number }>>`
        SELECT
          p."productId" as "productId",
          MAX(
            GREATEST(
              similarity(lower(p."name"), t."term"),
              similarity(lower(COALESCE(p."brand", '')), t."term"),
              similarity(lower(COALESCE(p."productType", '')), t."term"),
              similarity(lower(COALESCE(p."description", '')), t."term")
            )
          ) as "score"
        FROM "public"."Product" p
        CROSS JOIN LATERAL unnest(${terms}::text[]) AS t("term")
        WHERE p."marketplaceStatus" = 'Published'
          AND p."status" = 'Published'
          AND (
            cardinality(${cats}::text[]) = 0
            OR p."productType" = ANY(${cats}::text[])
          )
        GROUP BY p."productId", p."lastSyncAt", p."publishedAt"
        HAVING MAX(
          GREATEST(
            similarity(lower(p."name"), t."term"),
            similarity(lower(COALESCE(p."brand", '')), t."term"),
            similarity(lower(COALESCE(p."productType", '')), t."term"),
            similarity(lower(COALESCE(p."description", '')), t."term")
          )
        ) >= ${fallbackTrigramMinScore}
        ORDER BY "score" DESC, p."lastSyncAt" DESC NULLS LAST, p."publishedAt" DESC NULLS LAST
        LIMIT ${take} OFFSET ${skip}
      `;

      const countRows = await prisma.$queryRaw<Array<{ total: bigint }>>`
        SELECT COUNT(DISTINCT p."productId")::bigint as "total"
        FROM "public"."Product" p
        CROSS JOIN LATERAL unnest(${terms}::text[]) AS t("term")
        WHERE p."marketplaceStatus" = 'Published'
          AND p."status" = 'Published'
          AND (
            cardinality(${cats}::text[]) = 0
            OR p."productType" = ANY(${cats}::text[])
          )
          AND GREATEST(
            similarity(lower(p."name"), t."term"),
            similarity(lower(COALESCE(p."brand", '')), t."term"),
            similarity(lower(COALESCE(p."productType", '')), t."term"),
            similarity(lower(COALESCE(p."description", '')), t."term")
          ) >= ${fallbackTrigramMinScore}
      `;

      const ids = rows.map((r) => r.productId).filter(Boolean);
      if (ids.length > 0) {
        meiliHitIds = ids;
        engineUsed = 'pg_trgm';
        const total = countRows?.[0]?.total;
        meiliTotalCount = typeof total === 'bigint' ? Number(total) : Number(total ?? ids.length);
        trgmFacetProductTypeCounts = await trgmFacetCountsByProductType(prisma, q, queryExpansions, fallbackTrigramMinScore);
      }
    } catch {
      // ignore; extension might not be enabled
    }

    if (hasMarketplaceSearchHitIds(meiliHitIds)) {
      // Skip JS scorer if trigram fallback succeeded.
    } else {
    const q = search.trim().toLowerCase();
    const tokens = q.split(/\s+/g).filter(Boolean).slice(0, 8);
    const maxCandidates = Math.min(500, Math.max(80, safePage * safeLimit * 10));

    const candidates = await prisma.product.findMany({
      where: whereClause,
      select: {
        productId: true,
        name: true,
        description: true,
        brand: true,
        productType: true,
        lastSyncAt: true,
        publishedAt: true,
        user: { select: { company: { select: { name: true } } } },
      },
      take: maxCandidates,
      orderBy: [{ lastSyncAt: 'desc' }, { publishedAt: 'desc' }],
    });

    const scoreText = (haystack: string, w: number) => {
      let s = 0;
      if (!haystack) return 0;
      if (haystack.includes(q)) s += 10 * w;
      for (const t of tokens) {
        if (t.length >= 2 && haystack.includes(t)) s += 2 * w;
      }
      if (haystack.startsWith(q)) s += 6 * w;
      return s;
    };

    const scored = candidates
      .map((p) => {
        const name = String(p.name ?? '').toLowerCase();
        const brand = String(p.brand ?? '').toLowerCase();
        const type = String(p.productType ?? '').toLowerCase();
        const desc = String(p.description ?? '').toLowerCase();
        const seller = String(p.user?.company?.name ?? '').toLowerCase();
        const score =
          scoreText(name, 6) +
          scoreText(brand, 3) +
          scoreText(type, 3) +
          scoreText(seller, 2) +
          scoreText(desc, 1);
        return { id: p.productId, score };
      })
      .sort((a, b) => b.score - a.score)
      .filter((x) => x.score > 0);

    const orderedIds = scored.map((s) => s.id);
    meiliTotalCount = orderedIds.length;
    const pageIds = orderedIds.slice(skip, skip + take);
    meiliHitIds = pageIds.length ? pageIds : null;
    if (meiliHitIds) engineUsed = 'js_score';
    }
  }

  // Facets for "category pills"
  // - When searching: show ALL categories, rank relevant ones on top (Shopee-style).
  // - When not searching: keep it lightweight (top categories only).
  const facetProductTypes: Array<{ value: string; count: number }> = await (async () => {
    const isSearching = !!(search && search.trim());

    if (!isSearching) {
      return prisma.product
        .groupBy({
          by: ['productType'],
          where: whereClause,
          _count: { productType: true },
          orderBy: { _count: { productType: 'desc' } },
          take: 12,
        })
        .then((rows) =>
          rows
            .filter((r) => !!r.productType && String(r.productType).trim().length > 0)
            .map((r) => ({ value: String(r.productType), count: r._count.productType })),
        )
        .catch(() => []);
    }

    const allTypes = await prisma.product
      .findMany({
        where: { marketplaceStatus: 'Published', status: 'Published' },
        distinct: ['productType'],
        select: { productType: true },
      })
      .then((rows) =>
        rows
          .map((r) => (r.productType != null ? String(r.productType).trim() : ''))
          .filter((v) => v.length > 0),
      )
      .then((vals) => Array.from(new Set(vals)).sort((a, b) => a.localeCompare(b)))
      .catch(() => []);

    const counts =
      (facetDistributionHasHits(trgmFacetProductTypeCounts) ? trgmFacetProductTypeCounts : null) ??
      (facetDistributionHasHits(meiliFacetProductTypeCounts) ? meiliFacetProductTypeCounts : null) ??
      (await prisma.product
        .groupBy({
          by: ['productType'],
          where: facetWhereClause,
          _count: { productType: true },
        })
        .then((rows) => {
          const m: Record<string, number> = {};
          for (const r of rows) {
            const k = r.productType != null ? String(r.productType).trim() : '';
            if (k) m[k] = r._count.productType;
          }
          return m;
        })
        .catch(() => ({} as Record<string, number>)));

    return allTypes
      .map((value) => ({ value, count: counts[value] ?? 0 }))
      .sort((a, b) => (b.count - a.count) || a.value.localeCompare(b.value));
  })();
  
  const products: Promise<MarketplaceProductRow[]> = hasMarketplaceSearchHitIds(meiliHitIds)
    ? (() => {
        const ids = meiliHitIds;
        return prisma.product
          .findMany({
            where: {
              productId: { in: ids },
              marketplaceStatus: 'Published',
              status: 'Published',
            },
            include: marketplaceProductInclude,
          })
          .then((rows) => {
            const byId = new Map(rows.map((p) => [p.productId, p]));
            return ids.map((id) => byId.get(id)).filter((p): p is MarketplaceProductRow => Boolean(p));
          });
      })()
    : prisma.product.findMany({
        where: whereClause,
        include: marketplaceProductInclude,
        skip,
        take,
        orderBy: [{ lastSyncAt: 'desc' }, { publishedAt: 'desc' }],
      });

  const resolvedProducts = await products;
  
  // Get active offers for all products
  const productIds = resolvedProducts.map((p) => p.productId);
  const userIds = [...new Set(resolvedProducts.map((p) => p.userId).filter((id): id is number => id != null))];
  const [soldCountMap, productReviewStats, distributorReviewStats] = await Promise.all([
    calculateSoldCounts(prisma, productIds),
    calculateProductReviewStats(prisma, productIds),
    calculateDistributorReviewStats(prisma, userIds),
  ]);
  
  // Get only ACTIVE offers to check real-time status
  const { startOfToday, endOfToday } = getTodayBoundaries(); // Uses Asia/Jakarta timezone by default
  const allOffers = await prisma.offer.findMany({
    where: {
      userId: { in: userIds },
      status: 'active',
      offerProducts: {
        some: {
          productId: { in: productIds }
        }
      },
      // Filter by date ranges: offer is active if it has no date ranges (unlimited) OR has at least one active date range that's currently valid
      OR: [
        {
          dateRanges: {
            none: {}, // No date ranges = unlimited offer
          },
        },
        {
          dateRanges: {
            some: {
              isActive: true,
              startDate: { lte: endOfToday }, // Start date is on or before today
              endDate: { gte: startOfToday }, // End date is on or after today (includes entire day)
            },
          },
        },
      ],
    },
    include: {
      offerProducts: true,
      offerDiscountTypes: true,
      dateRanges: true,
    },
  });

  // Deactivate expired offers based on date ranges
  // Await to ensure broadcasts complete before returning results
  try {
      const { broadcastOfferUpdate, broadcastPriceUpdate, broadcastProductUpdate } = await import('@/utils/websocketBroadcast');
    
    await Promise.all(
    userIds.map(async (userId) => {
      const result = await deactivateExpiredOffers(prisma, userId);
      
      // Broadcast websocket updates for activated and deactivated offers
        // Do this BEFORE querying so clients get updates immediately
        // Collect all broadcasts to run in parallel
        const broadcastPromises: Promise<void>[] = [];
      
      for (const { offerId, productIds } of result.activatedOffers) {
          // Run all broadcasts in parallel for this offer
          broadcastPromises.push(
            broadcastOfferUpdate(offerId, productIds),
            broadcastPriceUpdate(productIds),
            broadcastProductUpdate(productIds)
          );
      }
      
      // Broadcast for deactivated offers (active → scheduled/inactive)
      for (const { offerId, productIds } of result.deactivatedOffers) {
          // Run all broadcasts in parallel for this offer
          broadcastPromises.push(
            broadcastOfferUpdate(offerId, productIds),
            broadcastPriceUpdate(productIds),
            broadcastProductUpdate(productIds)
          );
        }
        
        // Wait for all broadcasts to complete
        if (broadcastPromises.length > 0) {
          await Promise.allSettled(broadcastPromises);
          // Invalidate search cache when offers change (only search queries use cache)
          await invalidateSearchCache('search-cache:marketplace:*');
      }
      
      return result;
    })
    );
  } catch (error) {
    console.error('[Marketplace] Background offer deactivation failed:', error);
  }

  // Helper function to check if current time is within any active date range
  const isWithinActiveDateRange = (dateRanges: Array<{ startDate: Date | string; endDate: Date | string; isActive: boolean }>): boolean => {
    if (!dateRanges || dateRanges.length === 0) {
      return true; // No date ranges means offer is always active (within main dates)
    }
    
    const { startOfToday, endOfToday } = getTodayBoundaries();
    
    return dateRanges.some(range => {
      if (!range.isActive) return false;
      
      // Convert to Date objects (they come as strings from database)
      const startDate = new Date(range.startDate);
      const endDate = new Date(range.endDate);
      
      // Normalize to start/end of day in business timezone
      const rangeStart = getStartOfDay(startDate);
      const rangeEnd = getEndOfDay(endDate);
      
      // Check if today intersects with the date range
      return !(rangeEnd < startOfToday || rangeStart > endOfToday);
    });
  };

  // Filter offers - keep offer if at least one discount type is still usable AND date constraints are met
  const validOffers: OfferForMarketplace[] = [];

  for (const offer of allOffers) {
    // Check date ranges if they exist
    // Note: Date ranges are used for filtering active offers in marketplace
    // If offer has date ranges, at least one must be active for the offer to be valid
    const hasActiveDateRange = isWithinActiveDateRange(offer.dateRanges || []);
    if (!hasActiveDateRange) {
      continue; // Skip this offer if no active date range matches (for marketplace display only)
    }
    
    // Check if at least one discount type is active
    let hasValidDiscountType = false;
    
    for (const discountType of offer.offerDiscountTypes) {
      if (discountType.isActive === true) {
        hasValidDiscountType = true;
        break;
      }
    }
    
    if (!hasValidDiscountType) {
      try {
        await prisma.offer.update({
          where: { id: offer.id },
          data: { status: 'inactive' },
        });
      } catch (error) {
        console.error(`[Marketplace] Failed to deactivate offer ${offer.id}:`, error);
      }
    } else {
      validOffers.push(offer);
    }
  }
  
  // Note: Price updates are handled by offer activation/deactivation mutations
  // We don't update prices here to avoid race conditions and ensure consistency
  
  // Create a map of product offers using only valid offers
  const productOffersMap = new Map<string, OfferForMarketplace[]>();
  validOffers.forEach((offer) => {
    offer.offerProducts.forEach((op) => {
      if (!productOffersMap.has(op.productId)) {
        productOffersMap.set(op.productId, []);
      }
      productOffersMap.get(op.productId)!.push(offer);
    });
  });
  
  // Transform products for marketplace format
  const marketplaceProducts = await Promise.all(resolvedProducts.map(async (product) => {
    const variantOptions = product.variantOptions || [];
    
    if (variantOptions.length === 0) {
      return null;
    }
    
    const firstVariantOption = variantOptions.find((vo) => vo.isDefault) || variantOptions[0];
    const sellingPrice = safeParsePrice(firstVariantOption.sellingPrice);
    const purchasePrice = safeParsePrice(firstVariantOption.purchasePrice);
    const storedOriginalPrice = firstVariantOption.originalSellingPrice 
      ? safeParsePrice(firstVariantOption.originalSellingPrice) 
      : null;
    
    const productOffers = productOffersMap.get(product.productId) ?? [];
    let offerBadge = undefined;
    let hasActiveOffer = false;
    let offerId = undefined;
    let offerName = undefined;
    let originalSellingPrice = undefined;
    let discountType = undefined;
    let discountValue = undefined;
    let hasPriceDiscounts = false;
    let promotionDetails = undefined;
    
    if (productOffers.length > 0) {
      const primaryOffer = productOffers[0];
      
      const activeDiscountTypes: MarketplaceOfferDiscountType[] = [];
      for (const dt of primaryOffer.offerDiscountTypes) {
        if (dt.isActive === true) {
          activeDiscountTypes.push(dt);
        }
      }
      
      if (activeDiscountTypes.length === 0) {
        try {
          await prisma.offer.update({
            where: { id: primaryOffer.id },
            data: { status: 'inactive' }
          });

          // Keep behavior consistent with `deactivateExpiredOffers`: broadcast offer/price/product updates
          // and invalidate marketplace search cache so clients don't see stale offer pricing.
          enqueueSideEffect(
            `offerDeactivated(primaryOffer=${String(primaryOffer.id)})`,
            async () => {
              const { broadcastOfferUpdate, broadcastPriceUpdate, broadcastProductUpdate } = await import(
                '@/utils/websocketBroadcast'
              );
              const productIds: string[] = Array.isArray(primaryOffer.offerProducts)
                ? primaryOffer.offerProducts.map((op) => String(op.productId))
                : [];
              if (productIds.length === 0) return;

              await Promise.allSettled([
                broadcastOfferUpdate(primaryOffer.id, productIds),
                broadcastPriceUpdate(productIds),
                broadcastProductUpdate(productIds),
              ]);
              await invalidateSearchCache('search-cache:marketplace:*');
            },
            { retries: 2 },
          );
        } catch (error) {
          console.error(`[Marketplace] Failed to deactivate offer ${primaryOffer.id}:`, error);
        }
      }
      
      if (activeDiscountTypes.length > 0) {
        hasPriceDiscounts = activeDiscountTypes.some((dt) => dt.discountType === 'percentage' || dt.discountType === 'fixed');
        const hasPromotions = activeDiscountTypes.some((dt) => dt.discountType === 'buy_x_get_y');
        
        // Determine badge type based on active discount types
        if (hasPriceDiscounts && hasPromotions) {
          offerBadge = 'All Offers';
        } else if (hasPromotions) {
          offerBadge = 'Promotion';
        } else if (hasPriceDiscounts) {
          offerBadge = 'Discount';
        } else {
          offerBadge = 'Offer';
        }
        
        // Set discount information if there are price discounts
        if (hasPriceDiscounts) {
          const fixedDiscount = activeDiscountTypes.find((dt) => dt.discountType === 'fixed');
          const percentageDiscount = activeDiscountTypes.find((dt) => dt.discountType === 'percentage');
          discountType = fixedDiscount ? 'fixed' : (percentageDiscount ? 'percentage' : undefined);
          // Convert Decimal to number for GraphQL Float type
          const rawDiscountValue = fixedDiscount ? fixedDiscount.discountValue : (percentageDiscount ? percentageDiscount.discountValue : undefined);
          discountValue = rawDiscountValue !== undefined 
            ? safeParsePrice(rawDiscountValue as string | number | { toNumber?: () => number; toString?: () => string } | null | undefined)
            : undefined;
        }
        
        // Set promotion details if there are buy X get Y promotions
        const buyXGetYPromo = activeDiscountTypes.find((dt) => dt.discountType === 'buy_x_get_y');
        if (buyXGetYPromo) {
          promotionDetails = buildBuyXGetYPromotionDetails(buyXGetYPromo);
        }
      
        hasActiveOffer = true;
        offerId = primaryOffer.id;
        offerName = primaryOffer.name;
      }
    }
    
    // Only show originalSellingPrice (strikethrough) if:
    // 1. There's an active offer with price discounts, AND
    // 2. The stored original price exists and is greater than selling price
    // Otherwise, don't show strikethrough (no offer or no price discount)
    if (hasActiveOffer && hasPriceDiscounts && storedOriginalPrice && storedOriginalPrice > sellingPrice) {
      originalSellingPrice = storedOriginalPrice;
    } else {
      originalSellingPrice = undefined; // No strikethrough when no offer
    }
    
    const totalStock = variantOptions.reduce((sum, vo) => sum + (vo.stockQuantity || 0), 0);
    const totalLowStockThreshold = variantOptions.reduce((max, vo) => Math.max(max, vo.lowStockThreshold || 0), 0);
    
    let stockStatus = 'In Stock';
    if (totalStock === 0) stockStatus = 'Out of Stock';
    else if (totalLowStockThreshold > 0 && totalStock <= totalLowStockThreshold) stockStatus = 'Low Stock';
    
    const reviewStats = productReviewStats.get(product.productId) ?? {
      overallRating: 0,
      totalReviews: 0,
      breakdown: { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 },
    };
    const sellerStats =
      product.userId != null
        ? distributorReviewStats.get(product.userId)
        : undefined;

    return {
      id: product.productId,
      name: product.name,
      description: product.description,
      userId: product.userId,
      sellingPrice: sellingPrice,
      originalSellingPrice: originalSellingPrice, // Only set if there's an active offer with price discount
      price: sellingPrice,
      originalPrice: purchasePrice,
      offerBadge,
      hasActiveOffer,
      offerId,
      offerName,
      discountType,
      discountValue,
      promotionDetails,
      rating: reviewStats.overallRating,
      reviewCount: reviewStats.totalReviews,
      soldCount: soldCountMap.get(product.productId) || '0',
      stock: totalStock,
      stockStatus,
      variants: product.variants || [],
      variantOptions: product.variantOptions || [],
      variantOptionsFormatted: variantOptions.map((vo) => ({
        id: vo.id,
        sku: vo.sku,
        purchasePrice: safeParsePrice(vo.purchasePrice),
        sellingPrice: safeParsePrice(vo.sellingPrice),
        originalSellingPrice: safeParsePrice(vo.originalSellingPrice),
        moq: vo.moq,
        stockQuantity: vo.stockQuantity || 0,
        lowStockThreshold: vo.lowStockThreshold || 0,
        stockStatus: vo.stockStatus || 'In Stock',
        attributes: vo.attributes,
        isDefault: vo.isDefault,
        isActive: vo.isActive
      })),
      images: product.images || [],
      category: product.productType || 'Uncategorized',
      productCategory: product.productCategory || '',
      salesChannel: product.productCategory || 'Retail',
      brand: product.brand,
      unit: 'Piece',
      sku: product.sku,
      supplier: product.supplier,
      publishedAt: product.publishedAt?.toISOString() || null,
      lastSyncAt: product.lastSyncAt?.toISOString() || null,
      piecesPerPackage: 1,
      packageType: 'Piece',
      seller: {
        name: product.user?.company?.name || 'Unknown Company',
        avatar: '/default-avatar.png',
        rating: sellerStats?.overallRating ?? 0,
        reviewCount: sellerStats?.totalReviews ?? 0,
        isOfficial: true,
        responseTime: 'N/A',
        deliverySpeed: 'N/A',
        returnPolicy: `${product.returnPolicyDays || 7} days return policy`,
        company: product.user?.company ? {
          name: product.user.company.name,
          businessAddress: product.user.company.businessAddress,
          businessPhone: product.user.company.businessPhone,
          businessEmail: product.user.company.businessEmail,
          industryType: product.user.company.industryType,
          pickupAddress: product.user.company.pickupAddress,
          logo: product.user.company.logo || null,
          bannerImage: product.user.company.bannerImage || null,
        } : undefined
      },
      shipping: (() => {
        const c = product.user?.company;
        let prefs: string[] = [];
        if (c?.shippingPreferences) {
          try {
            prefs = JSON.parse(c.shippingPreferences) as string[];
          } catch {
            prefs = [];
          }
        }
        const num = (v: number | null | undefined) => (v != null && !Number.isNaN(Number(v)) ? Number(v) : null);
        return {
          preferences: prefs,
          selfPickup: {
            available: prefs.includes('Self Pickup'),
            minDays: null,
            maxDays: null,
          },
          sellerDelivery: {
            available: prefs.includes('Seller/Distributor Delivery'),
            minDays: num(c?.defaultDeliveryLeadTimeMinDays),
            maxDays: num(c?.defaultDeliveryLeadTimeMaxDays),
          },
          buyerCourier: {
            available: prefs.includes('Buyer-arranged Courier'),
            minDays: null,
            maxDays: null,
          },
          leadTimeMinDays: num(c?.defaultDeliveryLeadTimeMinDays),
          leadTimeMaxDays: num(c?.defaultDeliveryLeadTimeMaxDays),
        };
      })(),
      shippingInfo: {
        location: 'Indonesia'
      },
      assurance: {
        halalCertified: product.halalCertified || false,
        bpomApproved: product.bpomApproved || false,
        returnPolicyDays: product.returnPolicyDays || 7,
        originalProduct: product.originalProduct !== false
      },
      reviews: {
        overallRating: reviewStats.overallRating,
        totalReviews: reviewStats.totalReviews,
        breakdown: reviewStats.breakdown,
        sampleReview: null,
        hasReviews: reviewStats.totalReviews > 0
      }
    };
  }));
  
  const totalCount = meiliTotalCount ?? (await prisma.product.count({ where: whereClause }));
  const pagination = buildPaginationInfo(page, limit, totalCount);

  let didYouMean: string | null = null;
  if (search && search.trim()) {
    const nodesCount = Array.isArray(marketplaceProducts) ? marketplaceProducts.length : 0;
    const qNorm = normSearchTerm(search);
    const allowNonZero =
      (() => {
        const raw = process.env.MARKETPLACE_DID_YOU_MEAN_MAX_RESULTS?.trim();
        const n = raw ? Number(raw) : NaN;
        // Default allows suggestions even when some results exist (typo tolerance can still return matches).
        return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 20;
      })();

    // If we can strongly infer a typo correction from the top hit, allow it even without query logs
    // and even when many results exist (Meili typo tolerance may still return a lot of hits).
    if (!didYouMean && qNorm.length >= 3 && nodesCount > 0) {
      // Company/distributor names are often longer/multi-word, so allow a slightly looser typo threshold.
      // We only use the single top hit to avoid noisy suggestions.
      if (meiliTopHitSellerName) {
        const maxDist = qNorm.length <= 10 ? 2 : 3;
        if (boundedEditDistance(qNorm, meiliTopHitSellerName, maxDist) <= maxDist) {
          didYouMean = meiliTopHitSellerName;
        }
      }

      // If top hit isn't from the intended distributor (common when query matches product fields),
      // try suggesting a distributor/company name directly from the DB (pg_trgm over Company.name).
      // This catches cases like "tanjung peson jaay" -> "cv. tanjung pesona jaya".
      if (!didYouMean) {
        try {
          const rows = await prisma.$queryRaw<Array<{ name: string; score: number }>>`
            SELECT
              c."name" AS "name",
              GREATEST(
                similarity(lower(c."name"), ${qNorm}),
                word_similarity(lower(c."name"), ${qNorm})
              ) AS "score"
            FROM "public"."Company" c
            WHERE EXISTS (
              SELECT 1
              FROM "public"."User" u
              JOIN "public"."Product" p ON p."userId" = u."id"
              WHERE u."companyId" = c."id"
                AND p."marketplaceStatus" = 'Published'
                AND p."status" = 'Published'
            )
              AND length(trim(c."name")) >= 3
            ORDER BY "score" DESC, c."updatedAt" DESC
            LIMIT 25
          `;
          const best = rows.find((r) => {
            const cand = normSearchTerm(r.name);
            if (!cand || cand === qNorm) return false;
            const score = Number(r.score);
            if (!Number.isFinite(score) || score < 0.55 || score > 0.92) return false;
            // Suppress plain completions.
            if (cand.startsWith(qNorm) && cand.length > qNorm.length) return false;
            if (qNorm.length <= 10 && cand.charAt(0) !== qNorm.charAt(0)) return false;
            return true;
          });
          if (best?.name) {
            didYouMean = best.name.trim();
          }
        } catch {
          // ignore
        }
      }

      if (!didYouMean) {
        const topCand = pickDidYouMeanCandidate(qNorm, [
          meiliTopHitName,
          meiliTopHitBrand,
          meiliTopHitProductType,
        ]);
        if (topCand) {
          const maxDist = qNorm.length <= 8 ? 1 : 2;
          if (boundedEditDistance(qNorm, topCand, maxDist) <= maxDist) {
            didYouMean = topCand;
          }
        }
      }
    }

    if (!didYouMean && qNorm.length >= 3 && nodesCount <= allowNonZero) {
      // Noise control:
      // - When results are non-zero, show only "typo-like" corrections (query-log similarity),
      //   NOT synonym/translation expansions (those would appear too often).
      // - When results are zero, allow term-map expansions first.
      if (nodesCount === 0 && queryExpansions.length > 0) {
        didYouMean = queryExpansions[0];
      } else {
        // 0) If we already have results, prefer suggesting the top hit name (works even without pg_trgm).
        if (!didYouMean && nodesCount > 0) {
          didYouMean = pickDidYouMeanCandidate(qNorm, [
            meiliTopHitName,
            meiliTopHitBrand,
            meiliTopHitSellerName,
            meiliTopHitProductType,
          ]);
        }

        // 1) Prefer suggesting actual product names (ground truth) via pg_trgm.
        try {
          const rows = await prisma.$queryRaw<Array<{ name: string; score: number }>>`
            SELECT
              p."name" AS "name",
              GREATEST(
                similarity(lower(p."name"), ${qNorm}),
                word_similarity(lower(p."name"), ${qNorm})
              ) AS "score"
            FROM "public"."Product" p
            WHERE p."marketplaceStatus" = 'Published'
              AND p."status" = 'Published'
              AND length(trim(p."name")) >= 3
            ORDER BY "score" DESC, p."lastSyncAt" DESC NULLS LAST, p."publishedAt" DESC NULLS LAST
            LIMIT 25
          `;
          const best = rows.find((r) => {
            const cand = normSearchTerm(r.name);
            if (!cand || cand === qNorm) return false;
            const score = Number(r.score);
            if (!Number.isFinite(score) || score < 0.42 || score > 0.92) return false;
            // Suppress plain completions: "shoe" -> "shoes"
            if (cand.startsWith(qNorm) && cand.length > qNorm.length) return false;
            if (nodesCount > 0) {
              // For non-zero results, only show very typo-like suggestions.
              if (score < 0.65) return false;
              if (cand.charAt(0) !== qNorm.charAt(0)) return false;
            }
            return true;
          });
          if (best?.name) {
            didYouMean = best.name.trim();
          }
        } catch {
          // ignore
        }

        // 2) Try pg_trgm suggestion from past search logs (best-effort; may not exist on some DBs).
        if (!didYouMean) try {
          const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
          const rows = await prisma.$queryRaw<
            Array<{ query: string; score: number; searches: bigint; zero: bigint; avgResults: number }>
          >`
            WITH agg AS (
              SELECT
                lower(trim("query")) AS "query",
                COUNT(*)::bigint AS "searches",
                SUM(CASE WHEN "resultCount" = 0 THEN 1 ELSE 0 END)::bigint AS "zero",
                AVG("resultCount")::float8 AS "avgResults",
                MAX("createdAt") AS "lastSeenAt"
              FROM "public"."MarketplaceSearchQueryLog"
              WHERE "createdAt" >= ${since}
              GROUP BY lower(trim("query"))
            )
            SELECT
              a."query" AS "query",
              GREATEST(
                similarity(a."query", ${qNorm}),
                word_similarity(a."query", ${qNorm})
              ) AS "score",
              a."searches" AS "searches",
              a."zero" AS "zero",
              a."avgResults" AS "avgResults"
            FROM agg a
            ORDER BY "score" DESC, a."lastSeenAt" DESC
            LIMIT 25
          `;
          const cur = rows.find((r) => normSearchTerm(r.query) === qNorm);
          const curSearches = Number(cur?.searches ?? 0);
          const curZero = Number(cur?.zero ?? 0);
          const curZeroRate = curSearches > 0 ? curZero / curSearches : 1;
          const curAvg = Number(cur?.avgResults ?? 0);
          const best = rows.find((r) => {
            const cand = normSearchTerm(r.query);
            if (!cand || cand === qNorm) return false;
            const score = Number(r.score);
            // Show only when it looks like a typo correction (not too weak, not near-identical).
            if (!Number.isFinite(score) || score < 0.42 || score > 0.92) return false;
            // Suppress plain completions: "shoe" -> "shoes"
            if (cand.startsWith(qNorm) && cand.length > qNorm.length) return false;
            // Prevent "reverse suggestions": if we already have results, don't suggest queries that historically return none.
            if (nodesCount > 0) {
              // If the current query already behaves well historically, don't suggest anything.
              if (Number.isFinite(curAvg) && curAvg >= 1 && curZeroRate <= 0.3) return false;
              // For non-zero results, only show very typo-like suggestions.
              if (score < 0.65) return false;
              if (cand.charAt(0) !== qNorm.charAt(0)) return false;

              const avg = Number(r.avgResults ?? 0);
              if (!Number.isFinite(avg) || avg < 1) return false;
              const searches = Number(r.searches ?? 0);
              const zero = Number(r.zero ?? 0);
              const zeroRate = searches > 0 ? zero / searches : 1;
              if (zeroRate > 0.6) return false;
            }
            return true;
          });
          if (best?.query) didYouMean = normSearchTerm(best.query);
        } catch {
          // ignore
        }
      }
    }
  }

  const result = {
    nodes: marketplaceProducts.filter(product => product !== null),
    pagination,
    facets: {
      productTypes: facetProductTypes,
      // Back-compat: mirror productTypes so the app never sees empty.
      productCategories: facetProductTypes,
    },
    didYouMean,
    engine: engineUsed,
    engineRequested,
    // Strict mode promises Meili; if a real search ended up on any other engine, surface the drop.
    // (The cache short-circuit already returned earlier, so engineUsed can't be 'cache' here.)
    degraded:
      engineRequested === 'meili' &&
      !!(search && search.trim()) &&
      engineUsed !== 'meili',
    timestamp: new Date().toISOString()
  };

  // Fire-and-forget search telemetry for building real synonyms from real user queries.
  if (search && search.trim()) {
    prisma.marketplaceSearchQueryLog
      .create({
        data: {
          marketplaceUserId: args.marketplaceUserId ?? null,
          query: search.trim(),
          category: category && category !== 'All' ? String(category) : null,
          page,
          limit,
          resultCount: result.nodes.length,
          engine: engineUsed,
        },
      })
      .catch(() => {});
  }
  
  // ONLY cache search queries (when search parameter is provided)
  // Regular marketplace listings should always be fresh to show real-time offer/price updates
  if (search && search.trim()) {
  await setCachedMarketplaceSearch({ search: search || null, category: category || null, page, limit }, result);
  }
  
  return result;
};

