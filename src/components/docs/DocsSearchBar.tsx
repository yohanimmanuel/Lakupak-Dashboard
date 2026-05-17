'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Search } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { DocLocale } from '@/lib/docs/types';

export type DocsSearchHit = {
  id: string;
  title: string;
  description?: string;
  url: string;
  section?: string;
};

export function DocsSearchBar({
  locale,
  large = false,
  placeholder,
  className,
}: {
  locale: DocLocale;
  large?: boolean;
  placeholder?: string;
  className?: string;
}) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<DocsSearchHit[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  const runSearch = useCallback(
    async (q: string) => {
      const trimmed = q.trim();
      if (trimmed.length < 2) {
        setHits([]);
        setOpen(false);
        return;
      }
      setLoading(true);
      try {
        const res = await fetch(
          `/api/docs/search?q=${encodeURIComponent(trimmed)}&locale=${locale}`,
        );
        if (!res.ok) {
          setHits([]);
          return;
        }
        const data = (await res.json()) as { hits?: DocsSearchHit[] };
        setHits(data.hits ?? []);
        setOpen(true);
      } catch {
        setHits([]);
      } finally {
        setLoading(false);
      }
    },
    [locale],
  );

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      void runSearch(query);
    }, 280);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, runSearch]);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = query.trim();
    if (!trimmed) return;
    router.push(`/${locale}/docs/search?q=${encodeURIComponent(trimmed)}`);
    setOpen(false);
  };

  return (
    <div
      ref={wrapRef}
      className={`relative w-full ${large ? 'max-w-2xl mx-auto' : className ? className : 'max-w-md'}`}
    >
      <form onSubmit={onSubmit} className="relative">
        <Search
          className={`absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 ${large ? 'h-5 w-5' : 'h-4 w-4'}`}
          aria-hidden
        />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => {
            if (hits.length > 0) setOpen(true);
          }}
          placeholder={placeholder ?? 'Search the docs...'}
          className={`w-full rounded-xl border border-gray-200 bg-white pl-11 pr-4 text-gray-900 shadow-sm outline-none ring-[#0a61d7]/20 focus:border-[#0a61d7] focus:ring-2 ${
            large ? 'py-3.5 text-base' : 'py-2 text-sm'
          }`}
          aria-label="Search documentation"
          autoComplete="off"
        />
      </form>
      {open && (hits.length > 0 || loading) ? (
        <ul
          className="absolute left-0 right-0 z-50 mt-2 max-h-80 overflow-auto rounded-xl border border-gray-200 bg-white py-2 shadow-lg"
          role="listbox"
        >
          {loading && hits.length === 0 ? (
            <li className="px-4 py-3 text-sm text-gray-500">Searching…</li>
          ) : null}
          {hits.map((hit) => (
            <li key={hit.id}>
              <Link
                href={hit.url}
                className="block px-4 py-2.5 hover:bg-gray-50"
                onClick={() => setOpen(false)}
              >
                <p className="text-sm font-medium text-gray-900">{hit.title}</p>
                {hit.description ? (
                  <p className="mt-0.5 line-clamp-2 text-xs text-gray-500">{hit.description}</p>
                ) : null}
              </Link>
            </li>
          ))}
          {query.trim().length >= 2 && !loading && hits.length === 0 ? (
            <li className="px-4 py-3 text-sm text-gray-500">No results found.</li>
          ) : null}
        </ul>
      ) : null}
    </div>
  );
}
