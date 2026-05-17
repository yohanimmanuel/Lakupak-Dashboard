import { NextResponse } from 'next/server';
import { getMeiliClient, MEILI_DOCS_INDEX } from '@/lib/meili';
import { searchDocsLocal, type DocsSearchHit } from '@/lib/docs/search';
import type { DocLocale } from '@/lib/docs/types';

function mapMeiliHits(hits: Record<string, unknown>[]): DocsSearchHit[] {
  return hits.map((h) => ({
    id: String(h.id ?? ''),
    title: String(h.title ?? ''),
    description: typeof h.description === 'string' ? h.description : undefined,
    url: String(h.url ?? ''),
    section: typeof h.section === 'string' ? h.section : undefined,
    module: typeof h.module === 'string' ? h.module : undefined,
    snippet: (() => {
      const formatted = h._formatted as Record<string, string> | undefined;
      const cropped = formatted?.content;
      return typeof cropped === 'string' ? cropped.replace(/<[^>]+>/g, '') : undefined;
    })(),
  }));
}

async function searchMeili(
  locale: DocLocale,
  q: string,
  limit: number,
  moduleFilter?: string,
): Promise<DocsSearchHit[]> {
  const client = getMeiliClient();
  if (!client) return [];

  try {
    const index = client.index(MEILI_DOCS_INDEX);
    const filterParts = [`locale = "${locale}"`];
    if (moduleFilter) filterParts.push(`module = "${moduleFilter}"`);

    const result = await index.search(q, {
      limit,
      filter: filterParts.join(' AND '),
      attributesToHighlight: ['title', 'content'],
      attributesToCrop: ['content'],
      cropLength: 120,
    });

    return mapMeiliHits(result.hits as Record<string, unknown>[]);
  } catch {
    return [];
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get('q')?.trim() ?? '';
  const locale = (searchParams.get('locale') === 'id' ? 'id' : 'en') as DocLocale;
  const moduleFilter = searchParams.get('module')?.trim();
  const limitRaw = parseInt(searchParams.get('limit') ?? '12', 10);
  const limit = Number.isFinite(limitRaw) ? Math.min(50, Math.max(1, limitRaw)) : 12;

  if (q.length < 2) {
    return NextResponse.json({ hits: [], total: 0 });
  }

  let hits = await searchMeili(locale, q, limit, moduleFilter);
  let source: 'meili' | 'local' = hits.length > 0 ? 'meili' : 'local';

  if (hits.length === 0) {
    hits = searchDocsLocal(locale, q, limit);
    if (moduleFilter) {
      hits = hits.filter((h) => h.module === moduleFilter);
    }
  }

  return NextResponse.json({ hits, total: hits.length, source });
}
