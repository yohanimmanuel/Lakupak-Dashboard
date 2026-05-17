'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { DocsSearchBar, type DocsSearchHit } from '@/components/docs/DocsSearchBar';
import type { DocLocale } from '@/lib/docs/types';

function DocsSearchResults() {
  const routeParams = useParams();
  const searchParams = useSearchParams();
  const t = useTranslations('docs.search');
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
    fetch(`/api/docs/search?q=${encodeURIComponent(trimmed)}&locale=${locale}&limit=50`)
      .then((r) => (r.ok ? r.json() : { hits: [] }))
      .then((data: { hits?: DocsSearchHit[] }) => setHits(data.hits ?? []))
      .catch(() => setHits([]))
      .finally(() => setLoading(false));
  }, [q, locale]);

  const trimmed = q.trim();

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-10 lg:px-10">
      <h1 className="text-2xl font-semibold tracking-tight text-gray-900">{t('resultsTitle')}</h1>
      <div className="mt-4 w-full">
        <DocsSearchBar locale={locale} initialQuery={q} className="max-w-none w-full" />
      </div>

      {trimmed.length < 2 ? (
        <p className="mt-6 text-gray-600">{t('resultsHint')}</p>
      ) : loading ? (
        <p className="mt-6 text-gray-600">{t('searching')}</p>
      ) : hits.length === 0 ? (
        <p className="mt-6 text-gray-600">{t('resultsEmpty', { query: trimmed })}</p>
      ) : (
        <>
          <p className="mt-4 text-sm text-gray-500">
            {t('resultsCount', { count: hits.length, query: trimmed })}
          </p>
          <ul className="mt-4 divide-y divide-gray-200 rounded-xl border border-gray-200 bg-white">
            {hits.map((hit) => (
              <li key={hit.id}>
                <Link href={hit.url} className="block px-4 py-4 hover:bg-gray-50">
                  <div className="flex items-start justify-between gap-3">
                    <p className="font-medium text-[#0a61d7]">{hit.title}</p>
                    {hit.section ? (
                      <span className="shrink-0 text-xs text-gray-400">{hit.section}</span>
                    ) : null}
                  </div>
                  {hit.description ? (
                    <p className="mt-1 text-sm text-gray-600">{hit.description}</p>
                  ) : null}
                  {hit.snippet ? (
                    <p className="mt-1 line-clamp-2 text-sm text-gray-500">{hit.snippet}</p>
                  ) : null}
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

export default function DocsSearchPage() {
  return (
    <Suspense fallback={<div className="px-6 py-10 text-gray-600">Loading…</div>}>
      <DocsSearchResults />
    </Suspense>
  );
}
