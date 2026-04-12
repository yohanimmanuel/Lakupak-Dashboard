'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ChevronLeft, ChevronRight, FileText, Search } from 'lucide-react';
import SlidingSegmentedControl from '@/components/SlidingSegmentedControl';

type PlatformUserSource = 'dashboard' | 'marketplace' | 'driver';

type PlatformUserRow = {
  source: PlatformUserSource;
  dbId: number;
  name: string;
  subtitle: string | null;
  email: string | null;
  phone: string | null;
  roleLabel: string;
  status: string | null;
  avatar: string | null;
  createdAt: string;
};

const TABS = [
  { key: 'all', label: 'All' },
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'marketplace', label: 'Marketplace' },
  { key: 'driver', label: 'Driver' },
] as const;

function sourceBadgeClass(source: PlatformUserSource) {
  switch (source) {
    case 'dashboard':
      return 'bg-blue-100 text-blue-800';
    case 'marketplace':
      return 'bg-emerald-100 text-emerald-800';
    case 'driver':
      return 'bg-orange-100 text-orange-800';
    default:
      return 'bg-gray-100 text-gray-700';
  }
}

function formatJoined(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

export default function ManageUsersTable() {
  const [tab, setTab] = useState<(typeof TABS)[number]['key']>('all');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [rows, setRows] = useState<PlatformUserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const rowsPerPage = 8;

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set('source', tab);
      if (debouncedSearch) params.set('search', debouncedSearch);
      const res = await fetch(`/api/platform-admin/users?${params.toString()}`);
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || 'Failed to load users');
      setRows((data?.users ?? []) as PlatformUserRow[]);
      setPage(1);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load users');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [tab, debouncedSearch]);

  useEffect(() => {
    load().catch(() => {});
  }, [load]);

  const paged = useMemo(() => {
    const start = (page - 1) * rowsPerPage;
    return rows.slice(start, start + rowsPerPage);
  }, [rows, page]);

  const totalRows = rows.length;
  const totalPages = Math.max(1, Math.ceil(totalRows / rowsPerPage));
  const fromRow = totalRows === 0 ? 0 : (page - 1) * rowsPerPage + 1;
  const toRow = Math.min(page * rowsPerPage, totalRows);

  return (
    <div className="bg-white border border-[#e6e6e6] rounded-lg overflow-hidden">
      <div className="px-5 py-4 border-b border-[#e6e6e6] flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-gray-900">User list</p>
          <p className="text-xs text-gray-600 mt-1">
            Distributors (dashboard), marketplace buyers, and driver app accounts.
          </p>
        </div>
        <div className="relative w-full sm:w-64">
          <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search user…"
            className="w-full border border-[#e6e6e6] rounded-lg pl-9 pr-3 py-2 text-sm text-black outline-none focus:ring-1 focus:ring-[#0a61d7] focus:border-[#0a61d7] bg-white"
          />
        </div>
      </div>

      <div className="px-5 py-3 border-b border-[#e6e6e6]">
        <SlidingSegmentedControl
          size="compact"
          items={TABS.map((t) => ({ key: t.key, label: t.label }))}
          value={tab}
          onChange={(key) => setTab(key as (typeof TABS)[number]['key'])}
        />
      </div>

      {error ? (
        <div className="p-4 text-sm text-red-600">{error}</div>
      ) : loading ? (
        <div className="p-4 py-10 text-sm text-gray-600 text-center">Loading…</div>
      ) : (
        <div className="overflow-auto p-4">
          <div className="rounded-lg overflow-hidden">
            <table className="w-full text-sm min-w-[720px]">
              <thead className="bg-gray-100 text-xs text-gray-600">
                <tr>
                  <th className="text-left font-medium px-5 py-3 w-12 uppercase">No</th>
                  <th className="text-left font-medium px-4 py-3 uppercase">Profile</th>
                  <th className="text-left font-medium px-4 py-3 uppercase">Email</th>
                  <th className="text-left font-medium px-4 py-3 uppercase">Phone</th>
                  <th className="text-left font-medium px-4 py-3 uppercase">Role</th>
                  <th className="text-left font-medium px-4 py-3 uppercase">Source</th>
                  <th className="text-left font-medium px-5 py-3 uppercase">Joined</th>
                  <th className="text-center font-medium px-5 py-3 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {paged.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-5 py-8 text-center text-gray-500">
                      No users found.
                    </td>
                  </tr>
                ) : (
                  paged.map((r, i) => {
                    const no = (page - 1) * rowsPerPage + i + 1;
                    return (
                      <tr key={`${r.source}-${r.dbId}`} className="hover:bg-gray-50/80">
                        <td className="px-5 py-3 text-gray-700">{no}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <div className="h-9 w-9 rounded-full bg-gray-200 overflow-hidden shrink-0 flex items-center justify-center text-xs font-semibold text-gray-600">
                              {r.avatar ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={r.avatar} alt="" className="h-full w-full object-cover" />
                              ) : (
                                (r.name || '?').charAt(0).toUpperCase()
                              )}
                            </div>
                            <div className="min-w-0">
                              <p className="font-medium text-gray-900 truncate">{r.name}</p>
                              {r.subtitle ? (
                                <p className="text-xs text-gray-500 truncate">{r.subtitle}</p>
                              ) : null}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-800">{r.email ?? '—'}</td>
                        <td className="px-4 py-3 text-xs text-gray-700">{r.phone ?? '—'}</td>
                        <td className="px-4 py-3">
                          <span className="text-xs text-gray-800">{r.roleLabel}</span>
                          {r.status ? (
                            <span className="ml-2 text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                              {r.status}
                            </span>
                          ) : null}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-block text-xs font-semibold px-2 py-1 rounded-full capitalize ${sourceBadgeClass(r.source)}`}
                          >
                            {r.source}
                          </span>
                        </td>
                        <td className="px-5 py-3 text-xs text-gray-700 whitespace-nowrap">{formatJoined(r.createdAt)}</td>
                        <td className="px-5 py-3 text-center">
                          <Link
                            href={`/admin/users/${r.source}/${r.dbId}`}
                            className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-[#e6e6e6] text-gray-700 bg-white hover:bg-gray-50 hover:border-gray-300 transition-colors"
                            title="View details"
                            aria-label={`Details for ${r.name}`}
                          >
                            <FileText className="w-4 h-4 text-[#0a61d7] shrink-0" />
                            Details
                          </Link>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between mt-4">
            <div className="text-sm text-gray-500">
              Showing {fromRow} to {toRow} of {totalRows} results
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPage(Math.max(1, page - 1))}
                disabled={page === 1}
                className="px-3 py-1 text-sm text-gray-500 hover:text-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
                aria-label="Previous page"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <div className="flex items-center gap-1">
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  const pageNum = i + 1;
                  return (
                    <button
                      key={pageNum}
                      type="button"
                      onClick={() => setPage(pageNum)}
                      className={`px-3 py-2 text-sm rounded-lg ${
                        page === pageNum
                          ? 'bg-[#0a61d7] text-white'
                          : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
                      }`}
                    >
                      {pageNum}
                    </button>
                  );
                })}
                {totalPages > 5 && (
                  <>
                    {totalPages > 6 ? <span className="px-2 text-gray-500">...</span> : null}
                    <button
                      type="button"
                      onClick={() => setPage(totalPages)}
                      className={`px-3 py-1 text-sm rounded ${
                        page === totalPages
                          ? 'bg-[#0a61d7] text-white'
                          : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
                      }`}
                    >
                      {totalPages}
                    </button>
                  </>
                )}
              </div>
              <button
                type="button"
                onClick={() => setPage(Math.min(totalPages, page + 1))}
                disabled={page === totalPages}
                className="px-3 py-1 text-sm text-gray-500 hover:text-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
                aria-label="Next page"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
