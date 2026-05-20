'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Search } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { searchDashboard, type DashboardSearchHit } from '@/lib/dashboard/search';

type DropdownRect = { top: number; left: number; width: number };

export function DashboardSearchBar({
  className,
  placeholder = 'Quick Search...',
  dropdownLimit = 8,
}: {
  className?: string;
  placeholder?: string;
  dropdownLimit?: number;
}) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<DashboardSearchHit[]>([]);
  const [open, setOpen] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLUListElement>(null);
  const [mounted, setMounted] = useState(false);
  const [menuRect, setMenuRect] = useState<DropdownRect | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  const runSearch = useCallback(
    (q: string) => {
      const trimmed = q.trim();
      if (trimmed.length < 2) {
        setHits([]);
        setOpen(false);
        return;
      }
      setHits(searchDashboard(trimmed, dropdownLimit));
      setOpen(true);
    },
    [dropdownLimit],
  );

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      runSearch(query);
    }, 180);
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

  const updateMenuRect = useCallback(() => {
    if (!wrapRef.current) return;
    const rect = wrapRef.current.getBoundingClientRect();
    setMenuRect({
      top: rect.bottom + 8,
      left: rect.left,
      width: rect.width,
    });
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

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (hits.length > 0) {
      router.push(hits[0].url);
      setOpen(false);
    }
  };

  return (
    <div ref={wrapRef} className={className ?? 'relative w-[300px] max-w-full'}>
      <form onSubmit={onSubmit} className="relative">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-[15px] w-[15px] -translate-y-1/2 text-gray-400"
          aria-hidden
        />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => {
            if (trimmedQuery.length >= 2) {
              runSearch(query);
              setOpen(true);
            }
          }}
          placeholder={placeholder}
          className="w-full rounded-lg border border-gray-200 bg-white py-2 pl-9 pr-4 text-xs text-black outline-none focus:border-[#0a61d7] focus:ring-2 focus:ring-[#0a61d7]"
          aria-label="Search dashboard"
          aria-expanded={showDropdown}
          aria-controls="dashboard-search-results"
          autoComplete="off"
        />
      </form>

      {mounted && showDropdown && menuRect
        ? createPortal(
            <ul
              ref={dropdownRef}
              id="dashboard-search-results"
              role="listbox"
              style={{
                position: 'fixed',
                top: menuRect.top,
                left: menuRect.left,
                width: menuRect.width,
              }}
              className="z-[9999] max-h-80 overflow-auto rounded-xl border border-gray-200 bg-white py-1 shadow-2xl"
            >
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

              {hits.length === 0 ? (
                <li className="px-4 py-3 text-sm text-gray-500">No results found.</li>
              ) : null}
            </ul>,
            document.body,
          )
        : null}
    </div>
  );
}
