'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, RefreshCw, Search, UserPlus } from 'lucide-react';
import SlidingSegmentedControl from '@/components/SlidingSegmentedControl';
import CreatePlatformAdminModal from '@/components/adminstuffs/CreatePlatformAdminModal';

type AdminRow = {
  id: number;
  email: string;
  name: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

const FILTER_TABS = [
  { key: 'all', label: 'All' },
  { key: 'active', label: 'Active' },
  { key: 'inactive', label: 'Inactive' },
] as const;

function formatDate(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function displayName(row: AdminRow) {
  const n = row.name?.trim();
  if (n) return n;
  const local = row.email.split('@')[0];
  return local || row.email;
}

export default function PlatformAdminsTable() {
  const [admins, setAdmins] = useState<AdminRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updatingAdminIds, setUpdatingAdminIds] = useState<Set<number>>(new Set());
  const [tab, setTab] = useState<(typeof FILTER_TABS)[number]['key']>('all');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);
  const rowsPerPage = 8;

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim().toLowerCase()), 300);
    return () => clearTimeout(t);
  }, [search]);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/platform-admin/admins');
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Failed to load admins');
      setAdmins(data.admins || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load admins');
      setAdmins([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const filtered = useMemo(() => {
    let list = admins;
    if (tab === 'active') list = list.filter((a) => a.isActive);
    if (tab === 'inactive') list = list.filter((a) => !a.isActive);
    if (debouncedSearch) {
      list = list.filter((a) => {
        const q = debouncedSearch;
        return (
          a.email.toLowerCase().includes(q) ||
          (a.name?.toLowerCase().includes(q) ?? false) ||
          String(a.id).includes(q)
        );
      });
    }
    return list;
  }, [admins, tab, debouncedSearch]);

  useEffect(() => {
    setPage(1);
  }, [tab, debouncedSearch]);

  const paged = useMemo(() => {
    const start = (page - 1) * rowsPerPage;
    return filtered.slice(start, start + rowsPerPage);
  }, [filtered, page]);

  const totalRows = filtered.length;
  const totalPages = Math.max(1, Math.ceil(totalRows / rowsPerPage));
  const fromRow = totalRows === 0 ? 0 : (page - 1) * rowsPerPage + 1;
  const toRow = Math.min(page * rowsPerPage, totalRows);
  const activeCount = useMemo(() => admins.filter((a) => a.isActive).length, [admins]);

  const setActive = async (adminId: number, isActive: boolean) => {
    if (updatingAdminIds.has(adminId)) return;
    setError(null);
    setUpdatingAdminIds((prev) => {
      const next = new Set(prev);
      next.add(adminId);
      return next;
    });
    const previous = admins;
    setAdmins((rows) => rows.map((r) => (r.id === adminId ? { ...r, isActive } : r)));
    try {
      const res = await fetch(`/api/platform-admin/admins/${adminId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || 'Failed to update admin');
      await refresh();
    } catch (e) {
      setAdmins(previous);
      setError(e instanceof Error ? e.message : 'Failed to update admin');
    } finally {
      setUpdatingAdminIds((prev) => {
        const next = new Set(prev);
        next.delete(adminId);
        return next;
      });
    }
  };

  return (
    <>
      <div className="bg-white border border-[#e6e6e6] rounded-lg overflow-hidden">
        <div className="px-5 py-4 border-b border-[#e6e6e6] flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-gray-900">Admin list</p>
            <p className="text-xs text-gray-600 mt-1">
              Platform admin accounts. Active: {activeCount} of {admins.length}.
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto sm:items-center sm:justify-end">
            <div className="relative w-full sm:w-64">
              <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search admin…"
                className="w-full border border-[#e6e6e6] rounded-lg pl-9 pr-3 py-2 text-sm text-black outline-none focus:ring-1 focus:ring-[#0a61d7] focus:border-[#0a61d7] bg-white"
              />
            </div>
            <div className="flex gap-2 shrink-0">
              <button
                type="button"
                onClick={() => void refresh()}
                disabled={loading}
                className="inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border border-[#e6e6e6] text-gray-700 bg-white hover:bg-gray-50 hover:border-gray-300 transition-colors disabled:opacity-50"
              >
                <RefreshCw className={`w-4 h-4 shrink-0 ${loading ? 'animate-spin' : ''}`} />
                Refresh
              </button>
              <button
                type="button"
                onClick={() => setCreateOpen(true)}
                className="inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg bg-[#0a61d7] text-white hover:bg-[#084ba6] transition-colors"
              >
                <UserPlus className="w-4 h-4 shrink-0" />
                Add admin
              </button>
            </div>
          </div>
        </div>

        <div className="px-5 py-3 border-b border-[#e6e6e6]">
          <SlidingSegmentedControl
            size="compact"
            items={FILTER_TABS.map((t) => ({ key: t.key, label: t.label }))}
            value={tab}
            onChange={(key) => setTab(key as (typeof FILTER_TABS)[number]['key'])}
          />
        </div>

        {error ? (
          <div className="p-4 text-sm text-red-600 bg-red-50/80 border-b border-red-100">{error}</div>
        ) : null}

        {loading ? (
          <div className="p-4 py-10 text-sm text-gray-600 text-center">Loading…</div>
        ) : (
          <div className="overflow-auto p-4">
            <div className="rounded-lg overflow-hidden">
              <table className="w-full text-sm min-w-[800px]">
                <thead className="bg-gray-100 text-xs text-gray-600">
                  <tr>
                    <th className="text-left font-medium px-5 py-3 w-12 uppercase">No</th>
                    <th className="text-left font-medium px-4 py-3 uppercase">Profile</th>
                    <th className="text-left font-medium px-4 py-3 uppercase">Email</th>
                    <th className="text-left font-medium px-4 py-3 uppercase">Status</th>
                    <th className="text-left font-medium px-4 py-3 uppercase">Created</th>
                    <th className="text-left font-medium px-4 py-3 uppercase">Updated</th>
                    <th className="text-center font-medium px-5 py-3 uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {paged.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-5 py-8 text-center text-gray-500">
                        No admins found.
                      </td>
                    </tr>
                  ) : (
                    paged.map((a, i) => {
                      const no = (page - 1) * rowsPerPage + i + 1;
                      const title = displayName(a);
                      const initial = (title || '?').charAt(0).toUpperCase();
                      const isUpdating = updatingAdminIds.has(a.id);
                      return (
                        <tr key={a.id} className="hover:bg-gray-50/80">
                          <td className="px-5 py-3 text-gray-700">{no}</td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-3">
                              <div className="h-9 w-9 rounded-full bg-gray-200 overflow-hidden shrink-0 flex items-center justify-center text-xs font-semibold text-gray-600">
                                {initial}
                              </div>
                              <div className="min-w-0">
                                <p className="font-medium text-gray-900 truncate">{title}</p>
                                <p className="text-xs text-gray-500 truncate">Platform admin · ID {a.id}</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-xs text-gray-800">{a.email}</td>
                          <td className="px-4 py-3">
                            <span
                              className={`inline-block text-xs font-semibold px-2 py-1 rounded-full ${
                                a.isActive ? 'bg-emerald-100 text-emerald-800' : 'bg-gray-100 text-gray-600'
                              }`}
                            >
                              {a.isActive ? 'Active' : 'Inactive'}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-xs text-gray-700 whitespace-nowrap">{formatDate(a.createdAt)}</td>
                          <td className="px-4 py-3 text-xs text-gray-700 whitespace-nowrap">{formatDate(a.updatedAt)}</td>
                          <td className="px-5 py-3 text-center">
                            <button
                              type="button"
                              onClick={() => void setActive(a.id, !a.isActive)}
                              disabled={isUpdating}
                              className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-[#e6e6e6] text-gray-700 bg-white hover:bg-gray-50 hover:border-gray-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              {isUpdating ? 'Updating…' : a.isActive ? 'Deactivate' : 'Activate'}
                            </button>
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
                  {Array.from({ length: Math.min(5, totalPages) }, (_, idx) => {
                    const pageNum = idx + 1;
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

      <CreatePlatformAdminModal
        open={createOpen}
        onCloseAction={() => setCreateOpen(false)}
        onCreatedAction={async () => {
          setPage(1);
          await refresh();
        }}
      />
    </>
  );
}
