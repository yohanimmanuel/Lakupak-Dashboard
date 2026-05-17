'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Search } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import type { DocLocale } from '@/lib/docs/types';

type DropdownRect = { top: number; left: number; width: number };

export type DocsSearchHit = {
  id: string;
  title: string;
  description?: string;
  url: string;
  section?: string;
  module?: string;
  snippet?: string;
};

export function DocsSearchBar({
  locale,
  large = false,
  placeholder,
  className,
  initialQuery = '',
  dropdownLimit = 8,
}: {
  locale: DocLocale;
  large?: boolean;
  placeholder?: string;
  className?: string;
  initialQuery?: string;
  dropdownLimit?: number;
}) {
  const router = useRouter();
  const t = useTranslations('docs.search');
  const [query, setQuery] = useState(initialQuery);
  const [hits, setHits] = useState<DocsSearchHit[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLUListElement>(null);
  const [mounted, setMounted] = useState(false);
  const [menuRect, setMenuRect] = useState<DropdownRect | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    setQuery(initialQuery);
  }, [initialQuery]);

  const updateMenuRect = useCallback(() => {
    if (!wrapRef.current) return;
    const rect = wrapRef.current.getBoundingClientRect();
    setMenuRect({
      top: rect.bottom + 8,
      left: rect.left,
      width: rect.width,
    });
  }, []);

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
          `/api/docs/search?q=${encodeURIComponent(trimmed)}&locale=${locale}&limit=${dropdownLimit}`,
        );
        if (!res.ok) {
          setHits([]);
          setOpen(true);
          return;
        }
        const data = (await res.json()) as { hits?: DocsSearchHit[] };
        setHits(data.hits ?? []);
        setOpen(true);
      } catch {
        setHits([]);
        setOpen(true);
      } finally {
        setLoading(false);
      }
    },
    [locale, dropdownLimit],
  );

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      void runSearch(query);
    }, 220);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, runSearch]);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (wrapRef.current?.contains(target) || dropdownRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  const trimmedQuery = query.trim();
  const showDropdown = open && trimmedQuery.length >= 2;

  useEffect(() => {
    if (!showDropdown) {
      setMenuRect(null);
      return;
    }
    updateMenuRect();
    window.addEventListener('resize', updateMenuRect);
    window.addEventListener('scroll', updateMenuRect, true);
    return () => {
      window.removeEventListener('resize', updateMenuRect);
      window.removeEventListener('scroll', updateMenuRect, true);
    };
  }, [showDropdown, updateMenuRect, query]);

  const goToResultsPage = () => {
    if (!trimmedQuery) return;
    router.push(`/${locale}/docs/search?q=${encodeURIComponent(trimmedQuery)}`);
    setOpen(false);
  };

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    goToResultsPage();
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
            if (trimmedQuery.length >= 2) {
              void runSearch(query);
              setOpen(true);
            }
          }}
          placeholder={placeholder ?? t('placeholder')}
          className={`w-full rounded-xl border border-gray-200 bg-white pl-11 pr-4 text-gray-900 shadow-sm outline-none ring-[#0a61d7]/20 focus:border-[#0a61d7] focus:ring-2 ${
            large ? 'py-3.5 text-base' : 'py-2 text-sm'
          }`}
          aria-label={t('ariaLabel')}
          aria-expanded={showDropdown}
          aria-controls="docs-search-results"
          autoComplete="off"
        />
      </form>

      {mounted && showDropdown && menuRect
        ? createPortal(
            <ul
              ref={dropdownRef}
              id="docs-search-results"
              role="listbox"
              style={{
                position: 'fixed',
                top: menuRect.top,
                left: menuRect.left,
                width: menuRect.width,
              }}
              className="z-[9999] max-h-96 overflow-auto rounded-xl border border-gray-200 bg-white py-1 shadow-2xl"
            >
              {loading && hits.length === 0 ? (
                <li className="px-4 py-3 text-sm text-gray-500">{t('searching')}</li>
              ) : null}

              {hits.map((hit) => (
                <li key={hit.id} role="option">
                  <Link
                    href={hit.url}
                    className="block px-4 py-2.5 hover:bg-gray-50"
                    onClick={() => setOpen(false)}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-medium text-gray-900">{hit.title}</p>
                      {hit.section ? (
                        <span className="shrink-0 text-[10px] font-medium uppercase tracking-wide text-gray-400">
                          {hit.section}
                        </span>
                      ) : null}
                    </div>
                    {hit.description ? (
                      <p className="mt-0.5 line-clamp-1 text-xs text-gray-500">{hit.description}</p>
                    ) : hit.snippet ? (
                      <p className="mt-0.5 line-clamp-2 text-xs text-gray-500">{hit.snippet}</p>
                    ) : null}
                  </Link>
                </li>
              ))}

              {!loading && hits.length === 0 ? (
                <li className="px-4 py-3 text-sm text-gray-500">{t('noResults')}</li>
              ) : null}

              {!loading && trimmedQuery.length >= 2 ? (
                <li className="border-t border-gray-100">
                  <button
                    type="button"
                    onClick={goToResultsPage}
                    className="w-full px-4 py-3 text-left text-sm font-medium text-[#0a61d7] hover:bg-blue-50"
                  >
                    {t('viewAll', { query: trimmedQuery })}
                  </button>
                </li>
              ) : null}
            </ul>,
            document.body,
          )
        : null}
    </div>
  );
}
