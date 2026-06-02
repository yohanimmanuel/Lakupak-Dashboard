'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronLeft, ChevronRight, Plus, RefreshCw, Search as SearchIcon, Trash2, X } from 'lucide-react';
import SlidingSegmentedControl from '@/components/SlidingSegmentedControl';

type SearchQueryRow = {
  query: string;
  searches: number;
  zero: number;
  zeroRate: number;
  avgResults: number;
};

type QueriesResponse = {
  since: string;
  days: number;
  rows: SearchQueryRow[];
};

type TermMapKind = 'SYNONYM' | 'TRANSLATION';
type TermMapRow = {
  id: string;
  kind: TermMapKind;
  fromTerm: string;
  toTerm: string;
  fromLocale: string | null;
  toLocale: string | null;
  bidirectional: boolean;
  enabled: boolean;
  createdByAdminId: number | null;
  createdAt: string;
  updatedAt: string;
};

type TermMapListResponse = { totalCount: number; rows: TermMapRow[] };

type EngineStatusResponse = {
  mode: 'auto' | 'meili';
  meili: { configured: boolean; reachable: boolean; status: string | null; error: string | null };
  indexedProducts: number | null;
  since: string;
  days: number;
  totalSearches: number;
  engineBreakdown: Array<{ engine: string; count: number }>;
  degradedRate: number;
};

const TABS = [
  { key: 'logs', label: 'Logs' },
  { key: 'synonyms', label: 'Synonyms' },
  { key: 'translations', label: 'Translations' },
] as const;

function formatPct(p: number) {
  if (!Number.isFinite(p)) return '—';
  return `${Math.round(p * 100)}%`;
}

export default function AdminSearchLogsPage() {
  const [tab, setTab] = useState<(typeof TABS)[number]['key']>('logs');
  const [tabCoverLoading, setTabCoverLoading] = useState(false);
  const prevTabRef = useRef<(typeof TABS)[number]['key']>(tab);

  const [days, setDays] = useState(7);
  const [limit, setLimit] = useState(50);
  const [showDaysDropdown, setShowDaysDropdown] = useState(false);
  const [showLimitDropdown, setShowLimitDropdown] = useState(false);
  const daysDropdownRef = useRef<HTMLDivElement | null>(null);
  const limitDropdownRef = useRef<HTMLDivElement | null>(null);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  const [rows, setRows] = useState<SearchQueryRow[]>([]);
  const [since, setSince] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [termQ, setTermQ] = useState('');
  const [debouncedTermQ, setDebouncedTermQ] = useState('');
  const [termRows, setTermRows] = useState<TermMapRow[]>([]);
  const [termLoading, setTermLoading] = useState(false);
  const [termError, setTermError] = useState<string | null>(null);
  const [termTotalCount, setTermTotalCount] = useState(0);
  const [termPage, setTermPage] = useState(1);
  const termRowsPerPage = 20;

  const [addOpen, setAddOpen] = useState(false);
  const [addKind, setAddKind] = useState<TermMapKind>('SYNONYM');
  const [addFromTerm, setAddFromTerm] = useState('');
  const [addToTerm, setAddToTerm] = useState('');
  const [addConsolidate, setAddConsolidate] = useState(false);
  const [addToTerms, setAddToTerms] = useState<string[]>(['']);
  const [addFromLocale, setAddFromLocale] = useState('id');
  const [addToLocale, setAddToLocale] = useState('en');
  const [addBidirectional, setAddBidirectional] = useState(true);
  const [addEnabled, setAddEnabled] = useState(true);
  const [addSubmitting, setAddSubmitting] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [modalLogs, setModalLogs] = useState<SearchQueryRow[]>([]);
  const [modalLogsBusy, setModalLogsBusy] = useState(false);
  const [modalLogsErr, setModalLogsErr] = useState<string | null>(null);

  const [engineStatus, setEngineStatus] = useState<EngineStatusResponse | null>(null);
  const [engineStatusBusy, setEngineStatusBusy] = useState(false);

  const loadEngineStatus = useCallback(async () => {
    setEngineStatusBusy(true);
    try {
      const res = await fetch(`/api/platform-admin/search/engine-status?days=${days}`);
      const data = (await res.json().catch(() => null)) as EngineStatusResponse | null;
      if (res.ok && data) setEngineStatus(data);
    } catch {
      // Non-fatal: the status banner is best-effort.
    } finally {
      setEngineStatusBusy(false);
    }
  }, [days]);

  useEffect(() => {
    loadEngineStatus().catch(() => {});
  }, [loadEngineStatus]);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim().toLowerCase()), 250);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedTermQ(termQ.trim().toLowerCase()), 250);
    return () => clearTimeout(t);
  }, [termQ]);

  useEffect(() => {
    // Reset pagination when searching term maps.
    setTermPage(1);
  }, [debouncedTermQ]);

  const loadLogs = useCallback(async (opts?: { cover?: boolean }) => {
    const cover = opts?.cover === true;
    if (cover) setTabCoverLoading(true);
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set('days', String(days));
      params.set('limit', String(limit));
      const res = await fetch(`/api/platform-admin/search/queries?${params.toString()}`);
      const data = (await res.json().catch(() => null)) as QueriesResponse | null;
      if (!res.ok) {
        const apiError = (data as unknown as { error?: string } | null)?.error;
        throw new Error(apiError || 'Failed to load search logs');
      }
      setRows(Array.isArray(data?.rows) ? data!.rows : []);
      setSince(typeof data?.since === 'string' ? data!.since : null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load search logs');
      setRows([]);
      setSince(null);
    } finally {
      setLoading(false);
      if (cover) setTabCoverLoading(false);
    }
  }, [days, limit]);

  useEffect(() => {
    const prevTab = prevTabRef.current;
    prevTabRef.current = tab;
    if (tab !== 'logs') return;
    // Only do the "cover + clear" behavior on an actual tab switch into Logs.
    if (prevTab !== 'logs') {
      setRows([]);
      setError(null);
      loadLogs({ cover: true }).catch(() => {});
      return;
    }
    // When already on Logs, changes like days/limit should reload without nuking the table.
    loadLogs().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, days, limit]);

  useEffect(() => {
    const onDocMouseDown = (e: MouseEvent) => {
      const t = e.target as Node | null;
      if (t && daysDropdownRef.current && daysDropdownRef.current.contains(t)) return;
      if (t && limitDropdownRef.current && limitDropdownRef.current.contains(t)) return;
      setShowDaysDropdown(false);
      setShowLimitDropdown(false);
    };
    document.addEventListener('mousedown', onDocMouseDown);
    return () => document.removeEventListener('mousedown', onDocMouseDown);
  }, []);

  const loadTermMaps = useCallback(
    async (kind: TermMapKind, opts?: { cover?: boolean; page?: number }) => {
      const cover = opts?.cover === true;
      const pageArg = typeof opts?.page === 'number' && Number.isFinite(opts.page) ? Math.floor(opts.page) : 1;
      if (cover) setTabCoverLoading(true);
      setTermLoading(true);
      setTermError(null);
      try {
        const params = new URLSearchParams();
        params.set('kind', kind);
        if (debouncedTermQ) params.set('q', debouncedTermQ);
        params.set('limit', String(termRowsPerPage));
        params.set('offset', String((Math.max(1, pageArg) - 1) * termRowsPerPage));
        const res = await fetch(`/api/platform-admin/search/term-maps?${params.toString()}`);
        const data = (await res.json().catch(() => null)) as TermMapListResponse | null;
        if (!res.ok) {
          const apiError = (data as unknown as { error?: string } | null)?.error;
          throw new Error(apiError || 'Failed to load term maps');
        }
        setTermRows(Array.isArray(data?.rows) ? data!.rows : []);
        setTermTotalCount(typeof data?.totalCount === 'number' ? data.totalCount : 0);
      } catch (e) {
        setTermError(e instanceof Error ? e.message : 'Failed to load term maps');
        setTermRows([]);
        setTermTotalCount(0);
      } finally {
        setTermLoading(false);
        if (cover) setTabCoverLoading(false);
      }
    },
    [debouncedTermQ],
  );

  useEffect(() => {
    if (tab === 'synonyms') {
      setTermRows([]);
      setTermError(null);
      setTermTotalCount(0);
      setTermPage(1);
      loadTermMaps('SYNONYM', { cover: true, page: 1 }).catch(() => {});
    }
    if (tab === 'translations') {
      setTermRows([]);
      setTermError(null);
      setTermTotalCount(0);
      setTermPage(1);
      loadTermMaps('TRANSLATION', { cover: true, page: 1 }).catch(() => {});
    }
  }, [tab, debouncedTermQ]);

  useEffect(() => {
    // Skip if this is triggered by debouncedTermQ change (handled by the other effect)
    if (tab === 'synonyms') loadTermMaps('SYNONYM', { page: termPage }).catch(() => {});
    if (tab === 'translations') loadTermMaps('TRANSLATION', { page: termPage }).catch(() => {});
  }, [tab, termPage]); // eslint-disable-line react-hooks/exhaustive-deps

  const filteredRows = useMemo(() => {
    if (!debouncedSearch) return rows;
    return rows.filter((r) => (r.query ?? '').toLowerCase().includes(debouncedSearch));
  }, [rows, debouncedSearch]);

  const openAddFor = (kind: TermMapKind, fromTerm?: string) => {
    setAddKind(kind);
    setAddFromTerm(fromTerm ?? '');
    setAddToTerm('');
    setAddConsolidate(false);
    setAddToTerms(['']);
    setAddFromLocale('id');
    setAddToLocale('en');
    setAddBidirectional(true);
    setAddEnabled(true);
    setAddError(null);
    setModalLogsErr(null);
    if (modalLogs.length === 0) {
      void loadModalLogs();
    }
    setAddOpen(true);
  };

  const loadModalLogs = useCallback(async () => {
    setModalLogsBusy(true);
    setModalLogsErr(null);
    try {
      const params = new URLSearchParams();
      params.set('days', '14');
      params.set('limit', '100');
      const res = await fetch(`/api/platform-admin/search/queries?${params.toString()}`);
      const data = (await res.json().catch(() => null)) as QueriesResponse | null;
      if (!res.ok) {
        const apiError = (data as unknown as { error?: string } | null)?.error;
        throw new Error(apiError || 'Failed to load search logs');
      }
      setModalLogs(Array.isArray(data?.rows) ? data!.rows : []);
    } catch (e) {
      setModalLogsErr(e instanceof Error ? e.message : 'Failed to load search logs');
      setModalLogs([]);
    } finally {
      setModalLogsBusy(false);
    }
  }, []);

  const submitAdd = async () => {
    setAddSubmitting(true);
    setAddError(null);
    try {
      const from = addFromTerm.trim();
      const to = addToTerm.trim();
      const bulk = addToTerms.map((s) => s.trim()).filter(Boolean);
      const fromLoc = addFromLocale.trim();
      const toLoc = addToLocale.trim();

      if (!from) {
        setAddError('From term is required.');
        setAddSubmitting(false);
        return;
      }
      if (addConsolidate) {
        if (bulk.length === 0) {
          setAddError('Add at least one “To term” to consolidate.');
          setAddSubmitting(false);
          return;
        }
      } else if (!to) {
        setAddError('To term is required.');
        setAddSubmitting(false);
        return;
      }
      if (addKind === 'TRANSLATION') {
        if (!fromLoc) {
          setAddError('From locale is required for translations.');
          setAddSubmitting(false);
          return;
        }
        if (!toLoc) {
          setAddError('To locale is required for translations.');
          setAddSubmitting(false);
          return;
        }
      }

      const payload: Record<string, unknown> = {
        kind: addKind,
        fromTerm: addFromTerm,
        toTerm: addToTerm,
        bidirectional: addBidirectional,
        enabled: addEnabled,
      };
      if (addConsolidate) {
        if (bulk.length > 0) payload.toTerms = bulk;
      }
      if (addKind === 'TRANSLATION') {
        payload.fromLocale = addFromLocale;
        payload.toLocale = addToLocale;
      }
      const res = await fetch('/api/platform-admin/search/term-maps', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || 'Failed to create mapping');
      setAddOpen(false);
      if (tab === 'synonyms') await loadTermMaps('SYNONYM');
      if (tab === 'translations') await loadTermMaps('TRANSLATION');
    } catch (e) {
      setAddError(e instanceof Error ? e.message : 'Failed to create mapping');
    } finally {
      setAddSubmitting(false);
    }
  };

  const toggleEnabled = async (row: TermMapRow) => {
    const next = !row.enabled;
    setTermRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, enabled: next } : r)));
    try {
      const res = await fetch(`/api/platform-admin/search/term-maps/${row.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: next }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || 'Failed to update');
    } catch {
      setTermRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, enabled: row.enabled } : r)));
    }
  };

  const deleteRow = async (row: TermMapRow) => {
    const prev = termRows;
    setTermRows((r) => r.filter((x) => x.id !== row.id));
    try {
      const res = await fetch(`/api/platform-admin/search/term-maps/${row.id}`, { method: 'DELETE' });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || 'Failed to delete');
    } catch {
      setTermRows(prev);
    }
  };

  return (
    <div className="space-y-3">
      {engineStatus ? (
        <div className="bg-white border border-[#e6e6e6] rounded-xl p-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span
                  className={`inline-block w-2.5 h-2.5 rounded-full ${
                    !engineStatus.meili.configured
                      ? 'bg-gray-400'
                      : engineStatus.meili.reachable
                        ? 'bg-emerald-500'
                        : 'bg-red-500'
                  }`}
                />
                <p className="text-sm font-semibold text-gray-900">Search engine status</p>
                <span
                  className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                    engineStatus.mode === 'meili'
                      ? 'bg-[#0a61d7]/10 text-[#0a61d7]'
                      : 'bg-gray-100 text-gray-700'
                  }`}
                >
                  Mode: {engineStatus.mode}
                </span>
                {engineStatus.degradedRate > 0 ? (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-100 text-amber-800">
                    Degraded {formatPct(engineStatus.degradedRate)}
                  </span>
                ) : null}
              </div>
              <p className="text-xs text-gray-600 mt-1">
                {!engineStatus.meili.configured
                  ? 'Meilisearch is not configured (MEILI_HOST unset) — search runs on Postgres fallback.'
                  : engineStatus.meili.reachable
                    ? `Meilisearch reachable${
                        engineStatus.indexedProducts != null
                          ? ` · ${engineStatus.indexedProducts.toLocaleString()} products indexed`
                          : ''
                      }`
                    : `Meilisearch unreachable${engineStatus.meili.error ? ` — ${engineStatus.meili.error}` : ''}`}
              </p>
              <div className="flex flex-wrap items-center gap-1.5 mt-2">
                {engineStatus.engineBreakdown.length === 0 ? (
                  <span className="text-[11px] text-gray-500">No searches in last {engineStatus.days}d.</span>
                ) : (
                  engineStatus.engineBreakdown.map((e) => (
                    <span
                      key={e.engine}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-gray-100 text-gray-700"
                    >
                      {e.engine}
                      <span className="tabular-nums text-gray-500">{e.count}</span>
                    </span>
                  ))
                )}
              </div>
            </div>
            <button
              type="button"
              onClick={() => loadEngineStatus()}
              disabled={engineStatusBusy}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-[#e6e6e6] bg-white text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-60 self-start"
            >
              <RefreshCw className={`w-4 h-4 ${engineStatusBusy ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
        </div>
      ) : null}

      <div className="bg-white border border-[#e6e6e6] rounded-xl p-4">
        <p className="text-sm font-semibold text-gray-900">Search logs</p>
        <p className="text-xs text-gray-600 mt-1">
          Review common queries and improve search quality with synonyms and translations.
        </p>
        <div className="mt-3">
          <SlidingSegmentedControl
            items={TABS as unknown as Array<{ key: string; label: string }>}
            value={tab}
            onChange={(k) => setTab(k as (typeof TABS)[number]['key'])}
            size="compact"
          />
        </div>
      </div>

      {tab === 'logs' ? (
        <div className="bg-white border border-[#e6e6e6] rounded-lg overflow-hidden">
          <div className="px-5 py-4 border-b border-[#e6e6e6] flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-gray-900">Marketplace queries</p>
              <p className="text-xs text-gray-600 mt-1">
                {since ? (
                  <>
                    Showing last <span className="font-semibold">{days} days</span> (since{' '}
                    <span className="font-semibold">{new Date(since).toLocaleDateString()}</span>)
                  </>
                ) : (
                  <>Showing last {days} days</>
                )}
              </p>
            </div>

            <div className="flex flex-col sm:flex-row gap-2 w-full lg:w-auto">
              <div className="relative w-full sm:w-64">
                <SearchIcon className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search query…"
                  className="w-full border border-[#e6e6e6] rounded-lg pl-9 pr-3 py-2 text-sm text-black outline-none focus:ring-1 focus:ring-[#0a61d7] focus:border-[#0a61d7] bg-white"
                />
              </div>

              <div className="flex gap-2">
                <div ref={daysDropdownRef} className="relative shrink-0">
                  <button
                    type="button"
                    className="flex items-center gap-1 px-3 py-2 rounded-lg border border-[#e6e6e6] bg-white text-gray-700 hover:bg-gray-100 text-sm whitespace-nowrap"
                    onClick={() => {
                      setShowDaysDropdown((v) => !v);
                      setShowLimitDropdown(false);
                    }}
                  >
                    Last {days}d
                    <ChevronDown className="w-4 h-4 ml-1 text-gray-500" />
                  </button>
                  {showDaysDropdown ? (
                    <div className="absolute right-0 mt-2 w-40 bg-white border border-[#e6e6e6] rounded-lg shadow-lg z-50 max-h-60 overflow-y-auto">
                      {[1, 3, 7, 14, 30, 60, 90].map((d) => (
                        <button
                          key={d}
                          type="button"
                          onClick={() => {
                            setDays(d);
                            setShowDaysDropdown(false);
                          }}
                          className={`w-full text-left px-4 py-2 text-sm first:rounded-t-lg last:rounded-b-lg ${
                            days === d
                              ? 'text-[#0a61d7] font-semibold hover:bg-gray-100'
                              : 'text-gray-700 hover:bg-gray-100'
                          }`}
                        >
                          {d} {d === 1 ? 'day' : 'days'}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>

                <div ref={limitDropdownRef} className="relative shrink-0">
                  <button
                    type="button"
                    className="flex items-center gap-1 px-3 py-2 rounded-lg border border-[#e6e6e6] bg-white text-gray-700 hover:bg-gray-100 text-sm whitespace-nowrap"
                    onClick={() => {
                      setShowLimitDropdown((v) => !v);
                      setShowDaysDropdown(false);
                    }}
                  >
                    Limit {limit}
                    <ChevronDown className="w-4 h-4 ml-1 text-gray-500" />
                  </button>
                  {showLimitDropdown ? (
                    <div className="absolute right-0 mt-2 w-40 bg-white border border-[#e6e6e6] rounded-lg shadow-lg z-50 max-h-60 overflow-y-auto">
                      {[25, 50, 100, 200].map((n) => (
                        <button
                          key={n}
                          type="button"
                          onClick={() => {
                            setLimit(n);
                            setShowLimitDropdown(false);
                          }}
                          className={`w-full text-left px-4 py-2 text-sm first:rounded-t-lg last:rounded-b-lg ${
                            limit === n
                              ? 'text-[#0a61d7] font-semibold hover:bg-gray-100'
                              : 'text-gray-700 hover:bg-gray-100'
                          }`}
                        >
                          {n}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>

                <button
                  type="button"
                  onClick={() => loadLogs()}
                  disabled={loading}
                  className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-[#e6e6e6] bg-white text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-60"
                >
                  <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                  Refresh
                </button>
              </div>
            </div>
          </div>

          {error ? (
            <div className="px-5 py-4 text-sm text-red-600">{error}</div>
          ) : null}

          {tabCoverLoading ? (
            <div className="p-4 py-12 text-sm text-gray-600 text-center">Loading…</div>
          ) : loading && rows.length === 0 ? (
            <div className="p-4 py-10 text-sm text-gray-600 text-center">Loading…</div>
          ) : (
            <div className="overflow-auto p-4">
              <div className="rounded-lg overflow-hidden">
                <table className="w-full text-sm min-w-[720px]">
                  <thead className="bg-gray-100 text-xs text-gray-600">
                    <tr>
                      <th className="text-left font-medium px-5 py-3 uppercase">Query</th>
                      <th className="text-right font-medium px-4 py-3 uppercase whitespace-nowrap">Searches</th>
                      <th className="text-right font-medium px-4 py-3 uppercase whitespace-nowrap">Zero rate</th>
                      <th className="text-right font-medium px-5 py-3 uppercase whitespace-nowrap">Avg results</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {filteredRows.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="px-5 py-8 text-center text-gray-500">
                          No queries found.
                        </td>
                      </tr>
                    ) : (
                      filteredRows.map((r) => (
                        <tr key={r.query} className="hover:bg-gray-50/80">
                          <td className="px-5 py-3 text-xs text-gray-900">
                            <span className="font-medium">{r.query}</span>
                          </td>
                          <td className="px-4 py-3 text-xs text-right tabular-nums text-gray-700">{r.searches}</td>
                          <td className="px-4 py-3 text-xs text-right tabular-nums text-gray-700">{formatPct(r.zeroRate)}</td>
                          <td className="px-5 py-3 text-xs text-right tabular-nums text-gray-700">
                            {Number.isFinite(r.avgResults) ? r.avgResults.toFixed(1) : '—'}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="bg-white border border-[#e6e6e6] rounded-lg overflow-hidden">
          <div className="px-5 py-4 border-b border-[#e6e6e6] flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-gray-900">
                {tab === 'synonyms' ? 'Synonyms' : 'Translations'}
              </p>
              <p className="text-xs text-gray-600 mt-1">
                {tab === 'synonyms'
                  ? 'Two-way term mappings used to expand Marketplace search.'
                  : 'Locale-aware mappings (e.g. id ↔ en) used to expand Marketplace search.'}
              </p>
            </div>

            <div className="flex flex-col sm:flex-row gap-2 w-full lg:w-auto">
              <div className="relative w-full sm:w-72">
                <SearchIcon className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  value={termQ}
                  onChange={(e) => setTermQ(e.target.value)}
                  placeholder="Search mappings…"
                  className="w-full border border-[#e6e6e6] rounded-lg pl-9 pr-3 py-2 text-sm text-black outline-none focus:ring-1 focus:ring-[#0a61d7] focus:border-[#0a61d7] bg-white"
                />
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => openAddFor(tab === 'synonyms' ? 'SYNONYM' : 'TRANSLATION')}
                  className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-[#0a61d7] text-white text-sm font-medium hover:bg-[#0957bf]"
                >
                  <Plus className="w-4 h-4" />
                  Add
                </button>
                <button
                  type="button"
                  onClick={() => loadTermMaps(tab === 'synonyms' ? 'SYNONYM' : 'TRANSLATION')}
                  disabled={termLoading}
                  className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-[#e6e6e6] bg-white text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-60"
                >
                  <RefreshCw className={`w-4 h-4 ${termLoading ? 'animate-spin' : ''}`} />
                  Refresh
                </button>
              </div>
            </div>
          </div>

          {termError ? <div className="px-5 py-4 text-sm text-red-600">{termError}</div> : null}

          {tabCoverLoading ? (
            <div className="p-4 py-12 text-sm text-gray-600 text-center">Loading…</div>
          ) : termLoading && termRows.length === 0 ? (
            <div className="p-4 py-10 text-sm text-gray-600 text-center">Loading…</div>
          ) : (
            <div className="overflow-auto p-4">
              <div className="rounded-lg overflow-hidden">
                <table className={`w-full text-sm ${tab === 'translations' ? 'min-w-[860px]' : 'min-w-[720px]'}`}>
                  <thead className="bg-gray-100 text-xs text-gray-600">
                    <tr>
                      <th className="text-left font-medium px-5 py-3 uppercase">From</th>
                      <th className="text-left font-medium px-4 py-3 uppercase">To</th>
                      {tab === 'translations' ? (
                        <th className="text-left font-medium px-4 py-3 uppercase whitespace-nowrap">Locales</th>
                      ) : null}
                      <th className="text-center font-medium px-5 py-3 uppercase whitespace-nowrap">Enabled</th>
                      <th className="text-center font-medium px-5 py-3 uppercase whitespace-nowrap">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {termRows.length === 0 ? (
                      <tr>
                        <td colSpan={tab === 'translations' ? 5 : 4} className="px-5 py-8 text-center text-gray-500">
                          No mappings yet.
                        </td>
                      </tr>
                    ) : (
                      termRows.map((r) => (
                        <tr key={r.id} className="hover:bg-gray-50/80">
                          <td className="px-5 py-3 text-gray-900">
                            <span className="text-xs font-medium">{r.fromTerm}</span>
                          </td>
                          <td className="px-4 py-3 text-gray-900">
                            <span className="text-xs font-medium">{r.toTerm}</span>
                          </td>
                          {tab === 'translations' ? (
                            <td className="px-4 py-3 text-gray-900">
                              <span className="inline-flex items-center gap-2 text-xs font-semibold text-gray-700 bg-gray-100 px-2 py-1 rounded-full">
                                {(r.fromLocale ?? '—').toUpperCase()} → {(r.toLocale ?? '—').toUpperCase()}
                              </span>
                            </td>
                          ) : null}
                          <td className="px-5 py-3 text-center">
                            <button
                              type="button"
                              onClick={() => toggleEnabled(r)}
                              className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${
                                r.enabled ? 'bg-emerald-100 text-emerald-800' : 'bg-gray-100 text-gray-700'
                              }`}
                            >
                              {r.enabled ? 'Enabled' : 'Disabled'}
                            </button>
                          </td>
                          <td className="px-5 py-3 text-center">
                            <button
                              type="button"
                              onClick={() => deleteRow(r)}
                              className="inline-flex items-center justify-center w-9 h-9 rounded-lg border border-[#e6e6e6] text-gray-700 bg-white hover:bg-gray-50 hover:border-gray-300 transition-colors"
                              title="Delete"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {/* Pagination (matches Manage users / Offers style) */}
              {termTotalCount > 0 ? (
                <div className="flex items-center justify-between mt-4">
                  <div className="text-sm text-gray-500">
                    {(() => {
                      const totalPages = Math.max(1, Math.ceil(termTotalCount / termRowsPerPage));
                      const safePage = Math.min(Math.max(1, termPage), totalPages);
                      const fromRow = termTotalCount === 0 ? 0 : (safePage - 1) * termRowsPerPage + 1;
                      const toRow = Math.min(safePage * termRowsPerPage, termTotalCount);
                      return (
                        <>
                          Showing {fromRow} to {toRow} of {termTotalCount} results
                        </>
                      );
                    })()}
                  </div>
                  <div className="flex items-center gap-2">
                    {(() => {
                      const totalPages = Math.max(1, Math.ceil(termTotalCount / termRowsPerPage));
                      const safePage = Math.min(Math.max(1, termPage), totalPages);
                      const maxButtons = 5;
                      const pages = Array.from({ length: Math.min(maxButtons, totalPages) }, (_, i) => i + 1);
                      return (
                        <>
                          <button
                            type="button"
                            onClick={() => setTermPage(Math.max(1, safePage - 1))}
                            disabled={safePage === 1}
                            className="px-3 py-1 text-sm text-gray-500 hover:text-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
                            aria-label="Previous page"
                          >
                            <ChevronLeft className="w-4 h-4" />
                          </button>
                          <div className="flex items-center gap-1">
                            {pages.map((p) => (
                              <button
                                key={p}
                                type="button"
                                onClick={() => setTermPage(p)}
                                className={`px-3 py-2 text-sm rounded-lg ${
                                  safePage === p
                                    ? 'bg-[#0a61d7] text-white'
                                    : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
                                }`}
                              >
                                {p}
                              </button>
                            ))}
                            {totalPages > maxButtons ? (
                              <>
                                {totalPages > maxButtons + 1 ? <span className="px-2 text-gray-500">...</span> : null}
                                <button
                                  type="button"
                                  onClick={() => setTermPage(totalPages)}
                                  className={`px-3 py-2 text-sm rounded-lg ${
                                    safePage === totalPages
                                      ? 'bg-[#0a61d7] text-white'
                                      : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
                                  }`}
                                >
                                  {totalPages}
                                </button>
                              </>
                            ) : null}
                          </div>
                          <button
                            type="button"
                            onClick={() => setTermPage(Math.min(totalPages, safePage + 1))}
                            disabled={safePage === totalPages}
                            className="px-3 py-1 text-sm text-gray-500 hover:text-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
                            aria-label="Next page"
                          >
                            <ChevronRight className="w-4 h-4" />
                          </button>
                        </>
                      );
                    })()}
                  </div>
                </div>
              ) : null}
            </div>
          )}
        </div>
      )}

      {addOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => (addSubmitting ? null : setAddOpen(false))} />
          <div className="relative w-full max-w-lg bg-white rounded-xl border border-[#e6e6e6] shadow-lg overflow-hidden max-h-[85vh] flex flex-col">
            <div className="px-5 py-4 border-b border-[#e6e6e6]">
              <p className="text-sm font-semibold text-gray-900">
                Add {addKind === 'SYNONYM' ? 'synonym' : 'translation'}
              </p>
              <p className="text-xs text-gray-600 mt-1">
                {addKind === 'SYNONYM'
                  ? 'Add two terms that should match each other in search.'
                  : 'Add locale-aware terms that should match each other in search.'}
              </p>
            </div>

            <div className="px-5 py-4 space-y-3 overflow-y-auto flex-1">
              {addError ? <div className="text-sm text-red-600">{addError}</div> : null}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <p className="text-xs font-semibold text-gray-700 mb-1">From term</p>
                  <input
                    value={addFromTerm}
                    onChange={(e) => setAddFromTerm(e.target.value)}
                    className="w-full text-black border border-[#e6e6e6] rounded-lg px-3 py-2 text-xs outline-none focus:ring-1 focus:ring-[#0a61d7] focus:border-[#0a61d7]"
                    placeholder="e.g. baju"
                  />
                </div>  
                <div>
                  <p className="text-xs font-semibold text-gray-700 mb-1">To term</p>
                  <input
                    value={addToTerm}
                    onChange={(e) => setAddToTerm(e.target.value)}
                    className={`w-full text-black border border-[#e6e6e6] rounded-lg px-3 py-2 text-xs outline-none focus:ring-1 focus:ring-[#0a61d7] focus:border-[#0a61d7] ${
                      addConsolidate ? 'bg-gray-50 text-gray-500 cursor-not-allowed' : 'bg-white'
                    }`}
                    placeholder={addKind === 'SYNONYM' ? 'e.g. shirt' : 'e.g. shirt'}
                    disabled={addConsolidate}
                  />
                  {addConsolidate ? (
                    <p className="text-[11px] text-gray-500 mt-1">Disabled while consolidating.</p>
                  ) : null}
                </div>
              </div>

              {addKind === 'SYNONYM' || addKind === 'TRANSLATION' ? (
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-gray-900">Consolidate</p>
                      <p className="text-[11px] text-gray-600 mt-0.5">
                        Turn on to map <span className="font-semibold">From term</span> to multiple “To terms”.
                        {addKind === 'TRANSLATION' ? (
                          <>
                            {' '}
                            All rows will use the same <span className="font-semibold">from/to locale</span>.
                          </>
                        ) : null}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setAddConsolidate((v) => {
                          const next = !v;
                          if (next) {
                            const seed = addToTerm.trim();
                            setAddToTerms(seed ? [seed] : ['']);
                            setAddToTerm('');
                          }
                          return next;
                        });
                      }}
                      className={`inline-flex items-center justify-center px-3 py-2 rounded-lg border text-xs font-medium transition-colors ${
                        addConsolidate
                          ? 'bg-[#0a61d7] border-[#0a61d7] text-white'
                          : 'bg-white border-[#e6e6e6] text-gray-700 hover:bg-gray-50'
                      }`}
                    >
                      {addConsolidate ? 'Consolidating' : 'Consolidate'}
                    </button>
                  </div>

                  {addConsolidate ? (
                    <div className="mt-2 space-y-2">
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-semibold text-gray-700">To terms</p>
                        <button
                          type="button"
                          onClick={() => setAddToTerms((prev) => [...prev, ''])}
                          className="inline-flex items-center justify-center w-9 h-9 rounded-lg border border-[#e6e6e6] text-gray-700 bg-white hover:bg-gray-50 hover:border-gray-300 transition-colors"
                          title="Add term"
                        >
                          <Plus className="w-4 h-4" />
                        </button>
                      </div>
                      {addToTerms.map((v, idx) => (
                        <div key={idx} className="flex items-center gap-2">
                          <input
                            value={v}
                            onChange={(e) =>
                              setAddToTerms((prev) => prev.map((x, i) => (i === idx ? e.target.value : x)))
                            }
                            className="flex-1 text-black border border-[#e6e6e6] rounded-lg px-3 py-2 text-xs outline-none focus:ring-1 focus:ring-[#0a61d7] focus:border-[#0a61d7]"
                            placeholder="e.g. shirt"
                          />
                          <button
                            type="button"
                            onClick={() =>
                              setAddToTerms((prev) => {
                                const next = prev.filter((_, i) => i !== idx);
                                return next.length > 0 ? next : [''];
                              })
                            }
                            className="inline-flex items-center justify-center w-9 h-9 rounded-lg border border-[#e6e6e6] text-gray-700 bg-white hover:bg-gray-50 hover:border-gray-300 transition-colors"
                            title="Remove"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                      <p className="text-[11px] text-gray-600">
                        This creates mappings from <span className="font-semibold">From term</span> → each “To term”
                        (and reverse if Two-way is on).
                      </p>
                    </div>
                  ) : null}
                </div>
              ) : null}

              {addKind === 'TRANSLATION' ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <p className="text-xs font-semibold text-gray-700 mb-1">From locale</p>
                    <input
                      value={addFromLocale}
                      onChange={(e) => setAddFromLocale(e.target.value)}
                      className="w-full text-black border border-[#e6e6e6] rounded-lg px-3 py-2 text-xs outline-none focus:ring-1 focus:ring-[#0a61d7] focus:border-[#0a61d7]"
                      placeholder="id"
                    />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-gray-700 mb-1">To locale</p>
                    <input
                      value={addToLocale}
                      onChange={(e) => setAddToLocale(e.target.value)}
                      className="w-full text-black border border-[#e6e6e6] rounded-lg px-3 py-2 text-xs outline-none focus:ring-1 focus:ring-[#0a61d7] focus:border-[#0a61d7]"
                      placeholder="en"
                    />
                  </div>
                </div>
              ) : null}

              <div className="flex flex-col sm:flex-row gap-2 sm:items-center sm:justify-between pt-1">
                <button
                  type="button"
                  onClick={() => setAddBidirectional((v) => !v)}
                  className={`inline-flex items-center justify-center px-3 py-2 rounded-lg border text-xs font-medium transition-colors ${
                    addBidirectional
                      ? 'bg-[#0a61d7] border-[#0a61d7] text-white'
                      : 'bg-white border-[#e6e6e6] text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  Two-way
                </button>
                <button
                  type="button"
                  onClick={() => setAddEnabled((v) => !v)}
                  className={`inline-flex items-center justify-center px-3 py-2 rounded-lg border text-xs font-medium transition-colors ${
                    addEnabled
                      ? 'bg-emerald-600 border-emerald-600 text-white'
                      : 'bg-white border-[#e6e6e6] text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  {addEnabled ? 'Enabled' : 'Disabled'}
                </button>
              </div>

              <div className="pt-1">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-gray-900">Top queries (reference)</p>
                    <p className="text-[11px] text-gray-600 mt-0.5">Click a query to prefill “From term”.</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => loadModalLogs()}
                    disabled={modalLogsBusy}
                    className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-[#e6e6e6] bg-white text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-60"
                  >
                    <RefreshCw className={`w-4 h-4 ${modalLogsBusy ? 'animate-spin' : ''}`} />
                    Refresh
                  </button>
                </div>

                {modalLogsErr ? <div className="text-xs text-red-600 mt-2">{modalLogsErr}</div> : null}

                <div className="mt-2 border border-[#e6e6e6] rounded-lg overflow-hidden">
                  <div className="max-h-[220px] overflow-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-100 text-[11px] text-gray-600">
                        <tr>
                          <th className="text-left font-medium px-4 py-2 uppercase">Query</th>
                          <th className="text-right font-medium px-4 py-2 uppercase whitespace-nowrap">Searches</th>
                          <th className="text-right font-medium px-4 py-2 uppercase whitespace-nowrap">Zero</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {modalLogsBusy && modalLogs.length === 0 ? (
                          <tr>
                            <td colSpan={3} className="px-4 py-6 text-center text-xs text-gray-600">
                              Loading…
                            </td>
                          </tr>
                        ) : modalLogs.length === 0 ? (
                          <tr>
                            <td colSpan={3} className="px-4 py-6 text-center text-xs text-gray-500">
                              No logs loaded yet.
                            </td>
                          </tr>
                        ) : (
                          modalLogs.map((r) => (
                            <tr key={r.query} className="hover:bg-gray-50/80">
                              <td className="px-4 py-2">
                                <button
                                  type="button"
                                  onClick={() => setAddFromTerm(r.query)}
                                  className="text-left text-xs w-full text-gray-900 hover:text-[#0a61d7] font-medium truncate"
                                  title={r.query}
                                >
                                  {r.query}
                                </button>
                              </td>
                              <td className="px-4 py-2 text-xs text-right tabular-nums text-gray-700">{r.searches}</td>
                              <td className="px-4 py-2 text-xs text-right tabular-nums text-gray-700">{formatPct(r.zeroRate)}</td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>

            <div className="px-5 py-4 border-t border-[#e6e6e6] flex items-center justify-end gap-2 bg-white">
              <button
                type="button"
                onClick={() => setAddOpen(false)}
                disabled={addSubmitting}
                className="px-3 py-2 rounded-lg border border-[#e6e6e6] bg-white text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => submitAdd()}
                disabled={addSubmitting}
                className="px-3 py-2 rounded-lg bg-[#0a61d7] text-white text-sm font-medium hover:bg-[#0957bf] disabled:opacity-60"
              >
                {addSubmitting ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

