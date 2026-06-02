import { Meilisearch } from 'meilisearch';

function getEnv(name: string): string | null {
  const v = process.env[name];
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

export function getMeiliClient(): Meilisearch | null {
  const host = getEnv('MEILI_HOST');
  const apiKey = getEnv('MEILI_MASTER_KEY') ?? getEnv('MEILI_API_KEY');
  if (!host) return null;
  return new Meilisearch({ host, apiKey: apiKey ?? undefined });
}

export const MEILI_PRODUCTS_INDEX = 'marketplace_products';
export const MEILI_DOCS_INDEX = 'laku_docs';

export type MarketplaceSearchEngineMode = 'auto' | 'meili';

/**
 * Deterministic search-mode selector.
 * - `auto` (default): Meili → pg_trgm → JS scorer → Prisma. Silent fallback is acceptable.
 * - `meili` (strict): Meili is the contract. If Meili can't serve, results may still come from a
 *   fallback engine, but the response is flagged `degraded: true` so the drop is never silent.
 */
export function getMarketplaceSearchEngineMode(): MarketplaceSearchEngineMode {
  const raw = (getEnv('MARKETPLACE_SEARCH_ENGINE') ?? '').toLowerCase();
  return raw === 'meili' ? 'meili' : 'auto';
}

/** True when a Meili host is configured (does not imply reachability). */
export function isMeiliConfigured(): boolean {
  return getEnv('MEILI_HOST') !== null;
}

export type MeiliHealth = {
  configured: boolean;
  reachable: boolean;
  status: string | null;
  error: string | null;
};

/** Ping Meili's /health with a hard timeout so an unreachable host never blocks the request. */
export async function checkMeiliHealth(timeoutMs = 1500): Promise<MeiliHealth> {
  const client = getMeiliClient();
  if (!client) {
    return { configured: false, reachable: false, status: null, error: 'MEILI_HOST not set' };
  }
  try {
    const health = await Promise.race([
      client.health(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`Meili health timeout after ${timeoutMs}ms`)), timeoutMs),
      ),
    ]);
    const status = (health as { status?: string } | null)?.status ?? null;
    return { configured: true, reachable: status === 'available', status, error: null };
  } catch (err) {
    return {
      configured: true,
      reachable: false,
      status: null,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

