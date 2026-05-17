'use client';

import { useParams, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { DocsSearchHit } from '@/components/docs/DocsSearchBar';
import type { DocLocale } from '@/lib/docs/types';

export default function DocsSearchPage() {
  const routeParams = useParams();
  const searchParams = useSearchParams();
  const q = searchParams?.get('q') ?? '';
  const locale = (routeParams?.locale === 'id' ? 'id' : 'en') as DocLocale;
  const [hits, setHits] = useState<DocsSearchHit[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const trimmed = q.trim();
    if (trimmed.length < 2) {
      setHits([]);
      return;
    }
    setLoading(true);
    fetch(`/api/docs/search?q=${encodeURIComponent(trimmed)}&locale=${locale}`)
      .then((r) => (r.ok ? r.json() : { hits: [] }))
      .then((data: { hits?: DocsSearchHit[] }) => setHits(data.hits ?? []))
      .catch(() => setHits([]))
      .finally(() => setLoading(false));
  }, [q, locale]);

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="text-2xl font-bold text-gray-900">Search results</h1>
      {q.trim().length < 2 ? (
        <p className="mt-6 text-gray-600">Enter at least 2 characters to search.</p>
      ) : loading ? (
        <p className="mt-6 text-gray-600">Searching…</p>
      ) : hits.length === 0 ? (
        <p className="mt-6 text-gray-600">No results for &ldquo;{q}&rdquo;.</p>
      ) : (
        <ul className="mt-6 divide-y divide-gray-200 rounded-lg border border-gray-200 bg-white">
          {hits.map((hit) => (
            <li key={hit.id}>
              <Link href={hit.url} className="block px-4 py-4 hover:bg-gray-50">
                <p className="font-medium text-[#0a61d7]">{hit.title}</p>
                {hit.description ? <p className="mt-1 text-sm text-gray-600">{hit.description}</p> : null}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
