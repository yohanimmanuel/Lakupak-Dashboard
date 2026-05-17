import { NextResponse } from 'next/server';
import { getMeiliClient, MEILI_DOCS_INDEX } from '@/lib/meili';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get('q')?.trim() ?? '';
  const locale = searchParams.get('locale') === 'id' ? 'id' : 'en';
  const moduleFilter = searchParams.get('module')?.trim();

  if (q.length < 2) {
    return NextResponse.json({ hits: [] });
  }

  const client = getMeiliClient();
  if (!client) {
    return NextResponse.json({ hits: [], warning: 'Search unavailable' });
  }

  try {
    const index = client.index(MEILI_DOCS_INDEX);
    const filterParts = [`locale = "${locale}"`];
    if (moduleFilter) filterParts.push(`module = "${moduleFilter}"`);

    const result = await index.search(q, {
      limit: 12,
      filter: filterParts.join(' AND '),
      attributesToHighlight: ['title', 'content'],
      attributesToCrop: ['content'],
      cropLength: 120,
    });

    const hits = result.hits.map((hit) => {
      const h = hit as Record<string, unknown>;
      return {
        id: String(h.id ?? ''),
        title: String(h.title ?? ''),
        description: String(h.description ?? ''),
        url: String(h.url ?? ''),
        section: typeof h.section === 'string' ? h.section : undefined,
        module: typeof h.module === 'string' ? h.module : undefined,
      };
    });

    return NextResponse.json({ hits });
  } catch {
    return NextResponse.json({ hits: [], warning: 'Search failed' });
  }
}
