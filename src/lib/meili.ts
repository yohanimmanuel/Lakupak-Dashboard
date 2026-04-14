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

