'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ChevronLeft, ChevronRight, EyeOff, Pencil, Plus, Search, Trash2, X, Zap } from 'lucide-react';
import { OfferPreviewIcon } from '@/utils/offerPreviewIcons';
import { cssSafeUrl } from '@/utils/cssSafeUrl';
import SlidingSegmentedControl from '@/components/SlidingSegmentedControl';
import {
  MarketplaceHomeOfferRowPreview as OfferRowPreview,
  normalizeHex,
} from '@/components/adminstuffs/MarketplaceHomeOfferRowPreview';
import { TABLE_PAGE_SIZE, getVisiblePageNumbers } from '@/utils/tablePagination';

type OfferRow = {
  id: number;
  title: string;
  subtitle: string;
  discountText: string;
  endDateText: string;
  backgroundColor: string;
  textColor: string;
  detailsBody: string;
  bannerImageUrl: string | null;
  customBannerImageUrl: string | null;
  rightIconKey: string;
  discountIconKey: string;
  isPublished: boolean;
  publishedAt: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

const rowsPerPage = TABLE_PAGE_SIZE;

/** Must match API max `limit` in `src/app/api/platform-admin/offers/route.ts`. */
const OFFERS_API_PAGE_SIZE = 100;

/** Wider banner strip for publish confirmation modal (same layout as Marketplace SaleBanner). */
function OfferPublishStripPreview({ row }: { row: OfferRow }) {
  const custom = row.customBannerImageUrl?.trim();
  if (custom) {
    return (
      <div className="w-full h-24 bg-gray-100 overflow-hidden border-b border-[#e6e6e6]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={custom} alt="" className="w-full h-full object-cover object-center" />
      </div>
    );
  }
  const heroUrlCss = cssSafeUrl(row.bannerImageUrl);
  const bg = normalizeHex(row.backgroundColor, '#0a61d7');
  const text = normalizeHex(row.textColor, '#ffffff');
  return (
    <div
      className="w-full min-h-[96px] flex flex-row items-center px-4 py-3 border-b border-[#e6e6e6]"
      style={{
        background: heroUrlCss
          ? `linear-gradient(0deg, ${bg}e6, ${bg}e6), ${heroUrlCss} center/cover`
          : bg,
      }}
    >
      <div className="flex-1 min-w-0 pr-3">
        <p className="text-base font-bold leading-snug line-clamp-2" style={{ color: text }}>
          {row.title || 'Title'}
        </p>
        {row.subtitle.trim() ? (
          <p className="text-sm font-semibold opacity-90 mt-1 line-clamp-2" style={{ color: text }}>
            {row.subtitle}
          </p>
        ) : null}
        <div className="mt-3 inline-flex flex-row items-center gap-1.5 rounded-full bg-white/90 px-3 py-1.5">
          <OfferPreviewIcon
            iconKey={row.discountIconKey}
            fallbackKey="flash"
            size={16}
            style={{ color: bg }}
          />
          <span className="text-xs font-bold" style={{ color: bg }}>
            {row.discountText || 'Promo'}
          </span>
        </div>
      </div>
      <div className="flex flex-col items-center justify-center shrink-0 w-[72px]">
        <div
          className="w-14 h-14 rounded-full flex items-center justify-center mb-1"
          style={{ backgroundColor: 'rgba(255,255,255,0.22)' }}
        >
          <OfferPreviewIcon
            iconKey={row.rightIconKey}
            fallbackKey="gift"
            size={28}
            style={{ color: text }}
          />
        </div>
        {row.endDateText.trim() ? (
          <span className="text-[11px] font-semibold text-center leading-tight px-0.5" style={{ color: text }}>
            {row.endDateText}
          </span>
        ) : null}
      </div>
    </div>
  );
}

export default function PlatformAdminOffersPage() {
  const [rows, setRows] = useState<OfferRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [selectedTab, setSelectedTab] = useState<'All' | 'Published' | 'Draft'>('All');
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [listPage, setListPage] = useState(1);
  const [publishOpen, setPublishOpen] = useState(false);
  const [publishSubmitting, setPublishSubmitting] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [unpublishOpen, setUnpublishOpen] = useState(false);
  const [unpublishSubmitting, setUnpublishSubmitting] = useState(false);
  const [unpublishError, setUnpublishError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<null | { kind: 'bulk' } | { kind: 'one'; id: number; title: string }>(
    null
  );
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const anyBusy = publishSubmitting || unpublishSubmitting || deleteSubmitting;

  const [loadError, setLoadError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const acc: OfferRow[] = [];
      let offset = 0;
      for (;;) {
        const r = await fetch(
          `/api/platform-admin/offers?limit=${OFFERS_API_PAGE_SIZE}&offset=${offset}`
        );
        if (!r.ok) {
          setRows([]);
          setLoadError(`Failed to load offers (${r.status})`);
          return;
        }
        const d = (await r.json()) as { offers?: OfferRow[]; totalCount?: number };
        const chunk = d?.offers ?? [];
        const totalCount = typeof d.totalCount === 'number' ? d.totalCount : undefined;
        acc.push(...chunk);
        if (chunk.length < OFFERS_API_PAGE_SIZE) break;
        if (totalCount !== undefined && acc.length >= totalCount) break;
        offset += OFFERS_API_PAGE_SIZE;
      }
      setRows(acc);
    } catch (e) {
      setRows([]);
      setLoadError(e instanceof Error ? e.message : 'Failed to load offers');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load().catch(() => {});
  }, []);

  const counts = useMemo(() => {
    const published = rows.filter((r) => r.isPublished).length;
    return { total: rows.length, published, draft: Math.max(0, rows.length - published) };
  }, [rows]);

  const filteredRows = useMemo(() => {
    let next = rows;
    if (selectedTab !== 'All') {
      next = next.filter((r) => (selectedTab === 'Published' ? r.isPublished : !r.isPublished));
    }
    const q = query.trim().toLowerCase();
    if (!q) return next;
    return next.filter((r) => {
      const hay = `${r.title} ${r.subtitle} ${r.id}`.toLowerCase();
      return hay.includes(q);
    });
  }, [rows, query, selectedTab]);

  const totalRows = filteredRows.length;
  const totalPages = Math.max(1, Math.ceil(totalRows / rowsPerPage));
  const pagedRows = useMemo(
    () => filteredRows.slice((listPage - 1) * rowsPerPage, listPage * rowsPerPage),
    [filteredRows, listPage]
  );
  const fromRow = totalRows === 0 ? 0 : (listPage - 1) * rowsPerPage + 1;
  const toRow = Math.min(listPage * rowsPerPage, totalRows);

  useEffect(() => {
    setListPage(1);
  }, [selectedTab, query]);

  useEffect(() => {
    setListPage((p) => Math.min(p, totalPages));
  }, [totalPages]);

  const rowIds = useMemo(() => filteredRows.map((r) => r.id), [filteredRows]);
  const allSelected = rowIds.length > 0 && rowIds.every((id) => selectedIds.includes(id));

  const selectedRows = useMemo(
    () => filteredRows.filter((r) => selectedIds.includes(r.id)),
    [filteredRows, selectedIds]
  );

  useEffect(() => {
    const visible = new Set(filteredRows.map((r) => r.id));
    setSelectedIds((prev) => prev.filter((id) => visible.has(id)));
  }, [filteredRows]);

  const bulkState = useMemo(() => {
    if (selectedRows.length === 0) {
      return { canPublish: false, canUnpublish: false, mixed: false };
    }
    const hasDraft = selectedRows.some((r) => !r.isPublished);
    const hasPublished = selectedRows.some((r) => r.isPublished);
    const mixed = hasDraft && hasPublished;
    return {
      canPublish: !mixed && hasDraft && !hasPublished,
      canUnpublish: !mixed && hasPublished && !hasDraft,
      mixed,
    };
  }, [selectedRows]);

  const toggleSelect = (id: number) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const toggleSelectAll = () => {
    if (allSelected) setSelectedIds([]);
    else setSelectedIds([...rowIds]);
  };

  const patchOffer = async (id: number, body: Record<string, unknown>) => {
    const res = await fetch(`/api/platform-admin/offers/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      throw new Error((j as { error?: string }).error || `Update failed (#${id})`);
    }
  };

  const deleteOffer = async (id: number) => {
    const res = await fetch(`/api/platform-admin/offers/${id}`, { method: 'DELETE' });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      throw new Error((j as { error?: string }).error || `Delete failed (#${id})`);
    }
  };

  const confirmPublish = async () => {
    if (!bulkState.canPublish || selectedIds.length === 0) return;
    setPublishSubmitting(true);
    setPublishError(null);
    try {
      const settled = await Promise.allSettled(selectedIds.map((id) => patchOffer(id, { isPublished: true })));
      const failures = settled
        .map((s, i) => (s.status === 'rejected' ? `#${selectedIds[i]}: ${(s.reason as Error)?.message}` : null))
        .filter(Boolean) as string[];
      if (failures.length) {
        setPublishError(failures.join(' · '));
        await load(); // Refresh to show actual state
        return;       // Keep modal open to show error
      }
      setPublishOpen(false);
      setSelectedIds([]);
      await load();
    } catch (e) {
      setPublishError(e instanceof Error ? e.message : 'Publish failed');
    } finally {
      setPublishSubmitting(false);
    }
  };

  const confirmUnpublish = async () => {
    if (!bulkState.canUnpublish || selectedIds.length === 0) return;
    setUnpublishSubmitting(true);
    setUnpublishError(null);
    try {
      const settled = await Promise.allSettled(selectedIds.map((id) => patchOffer(id, { isPublished: false })));
      const failures = settled
        .map((s, i) => (s.status === 'rejected' ? `#${selectedIds[i]}: ${(s.reason as Error)?.message}` : null))
        .filter(Boolean) as string[];
      if (failures.length) {
        setUnpublishError(failures.join(' · '));
        return;
      }
      setUnpublishOpen(false);
      setSelectedIds([]);
      await load();
    } catch (e) {
      setUnpublishError(e instanceof Error ? e.message : 'Unpublish failed');
    } finally {
      setUnpublishSubmitting(false);
    }
  };

  const confirmBulkDelete = async () => {
    if (deleteTarget?.kind !== 'bulk' || selectedIds.length === 0) return;
    setDeleteSubmitting(true);
    setDeleteError(null);
    try {
      const ids = [...selectedIds];
      const settled = await Promise.allSettled(ids.map((id) => deleteOffer(id)));
      const failures = settled
        .map((s, i) => (s.status === 'rejected' ? `#${ids[i]}: ${(s.reason as Error)?.message}` : null))
        .filter(Boolean) as string[];
      if (failures.length) {
        setDeleteError(failures.join(' · '));
        return;
      }
      setDeleteTarget(null);
      setSelectedIds([]);
      await load();
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : 'Delete failed');
    } finally {
      setDeleteSubmitting(false);
    }
  };

  const confirmOneDelete = async () => {
    if (deleteTarget?.kind !== 'one') return;
    const { id } = deleteTarget;
    setDeleteSubmitting(true);
    setDeleteError(null);
    try {
      await deleteOffer(id);
      setDeleteTarget(null);
      setSelectedIds((prev) => prev.filter((x) => x !== id));
      await load();
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : 'Failed to delete');
    } finally {
      setDeleteSubmitting(false);
    }
  };

  return (
    <>
    <div className="space-y-3">
      <div className="flex items-start md:items-center justify-between gap-3 flex-col md:flex-row">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Offers</h1>
          <p className="text-sm text-gray-600 mt-1">
            Manage the homepage sale banner in the Marketplace app. The first published offer (lowest sort order) is
            shown on Home.
          </p>
        </div>

        <div className="flex items-center gap-2 w-full md:w-auto">
          <div className="relative flex-1 md:w-[340px]">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search offers…"
              className="w-full border border-gray-200 rounded-lg pl-9 pr-3 py-2 text-sm text-black outline-none focus:ring-1 focus:ring-[#0a61d7] focus:border-[#0a61d7] bg-white"
            />
          </div>

          <Link
            href="/admin/offers/new"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#0a61d7] text-white text-sm font-semibold hover:bg-[#084ba6] shrink-0"
          >
            <Plus className="w-4 h-4" />
            New offer
          </Link>
        </div>
      </div>

      <div className="bg-white border border-[#e6e6e6] rounded-lg overflow-hidden">
        <div className="px-5 py-4 border-b border-[#e6e6e6] flex items-center justify-between gap-3 flex-wrap">
          <div>
            <p className="text-sm font-semibold text-gray-900">All offers</p>
            <p className="text-xs text-gray-600 mt-1">
              Total: {counts.total} <span className="text-gray-300">•</span> Published: {counts.published}{' '}
              <span className="text-gray-300">•</span> Draft: {counts.draft}
            </p>
          </div>
        </div>

        <div className="px-5 py-3 border-b border-[#e6e6e6]">
          <SlidingSegmentedControl
            className="max-w-md"
            items={[
              { key: 'All', label: 'All' },
              { key: 'Published', label: 'Published' },
              { key: 'Draft', label: 'Draft' },
            ]}
            value={selectedTab}
            onChange={(key) => setSelectedTab(key as typeof selectedTab)}
          />
        </div>

        {selectedIds.length > 0 && (
          <div className="bg-gradient-to-r from-green-500 to-green-400 rounded-lg p-3 md:p-4 m-4 mb-2">
            <div className="md:hidden space-y-3">
              <div className="flex items-center gap-1">
                <div className="text-white text-sm font-semibold">{selectedIds.length}</div>
                <span className="text-sm font-semibold text-white">
                  {selectedIds.length === 1 ? 'offer' : 'offers'} selected
                </span>
              </div>
              <div className="text-white text-xs font-semibold leading-relaxed">
                {bulkState.mixed
                  ? 'Mixed draft and published selected. Only removal is allowed.'
                  : bulkState.canPublish
                    ? 'Publish selected offers to the Marketplace home (by sort order).'
                    : bulkState.canUnpublish
                      ? 'Unpublish selected offers (draft).'
                      : 'Remove selected offers.'}
              </div>
              <div className="flex gap-2 flex-wrap">
                {bulkState.canPublish ? (
                  <button
                    type="button"
                    disabled={anyBusy}
                    onClick={() => {
                      setPublishError(null);
                      setPublishOpen(true);
                    }}
                    className="flex-1 min-w-[100px] flex items-center justify-center gap-2 px-4 py-2 bg-emerald-600 text-white font-semibold text-sm rounded-lg hover:bg-emerald-700 disabled:opacity-60"
                  >
                    <Zap className="w-4 h-4 text-white" />
                    Publish
                  </button>
                ) : null}
                {bulkState.canUnpublish ? (
                  <button
                    type="button"
                    disabled={anyBusy}
                    onClick={() => {
                      setUnpublishError(null);
                      setUnpublishOpen(true);
                    }}
                    className="flex-1 min-w-[100px] flex items-center justify-center gap-2 px-4 py-2 bg-orange-600 text-white font-semibold text-sm rounded-lg hover:bg-orange-700 disabled:opacity-60"
                  >
                    <EyeOff className="w-4 h-4 text-white" />
                    Unpublish
                  </button>
                ) : null}
                <button
                  type="button"
                  disabled={anyBusy}
                  onClick={() => {
                    setDeleteError(null);
                    setDeleteTarget({ kind: 'bulk' });
                  }}
                  className="flex-1 min-w-[100px] flex items-center justify-center gap-2 px-4 py-2 bg-red-600 text-white font-semibold text-sm rounded-lg hover:bg-red-700 disabled:opacity-60"
                >
                  <Trash2 className="w-4 h-4 text-white" />
                  Remove
                </button>
              </div>
            </div>

            <div className="hidden md:flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="text-white text-sm font-semibold">{selectedIds.length}</div>
                <span className="text-sm font-semibold text-white">
                  {selectedIds.length === 1 ? 'offer' : 'offers'} selected
                </span>
              </div>
              <div className="flex items-center gap-4 flex-wrap justify-end">
                <span className="text-white text-xs md:text-sm font-semibold max-w-xl text-right">
                  {bulkState.mixed
                    ? 'Mixed draft and published selected. Only removal is allowed.'
                    : bulkState.canPublish
                      ? 'Publish selected offers to the Marketplace home (by sort order).'
                      : bulkState.canUnpublish
                        ? 'Unpublish selected offers (draft).'
                        : 'Remove selected offers.'}
                </span>
                <div className="flex gap-2 flex-wrap">
                  {bulkState.canPublish ? (
                    <button
                      type="button"
                      disabled={anyBusy}
                      onClick={() => {
                        setPublishError(null);
                        setPublishOpen(true);
                      }}
                      className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white font-semibold text-sm rounded-lg hover:bg-emerald-700 disabled:opacity-60"
                    >
                      <Zap className="w-4 h-4 text-white" />
                      Publish
                    </button>
                  ) : null}
                  {bulkState.canUnpublish ? (
                    <button
                      type="button"
                      disabled={anyBusy}
                      onClick={() => {
                        setUnpublishError(null);
                        setUnpublishOpen(true);
                      }}
                      className="flex items-center gap-2 px-4 py-2 bg-orange-600 text-white font-semibold text-sm rounded-lg hover:bg-orange-700 disabled:opacity-60"
                    >
                      <EyeOff className="w-4 h-4 text-white" />
                      Unpublish
                    </button>
                  ) : null}
                  <button
                    type="button"
                    disabled={anyBusy}
                    onClick={() => {
                      setDeleteError(null);
                      setDeleteTarget({ kind: 'bulk' });
                    }}
                    className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white font-semibold text-sm rounded-lg hover:bg-red-700 disabled:opacity-60"
                  >
                    <Trash2 className="w-4 h-4 text-white" />
                    Remove
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {loading ? (
          <div className="p-5 text-sm text-gray-600">Loading…</div>
        ) : (
          <>
            <div className="overflow-auto p-4">
              <div className="rounded-lg overflow-hidden min-w-[720px]">
                <table className="w-full text-sm">
                  <thead className="bg-gray-100 text-xs text-gray-600">
                    <tr>
                      <th className="w-10 px-3 py-3 text-center align-middle">
                        <span className="sr-only">Select</span>
                        {filteredRows.length > 0 ? (
                          <button
                            type="button"
                            onClick={toggleSelectAll}
                            className={`w-4 h-4 border-2 rounded transition-all duration-200 flex items-center justify-center mx-auto ${
                              allSelected ? 'bg-green-500 border-green-500' : 'bg-white border-gray-300 hover:border-green-400'
                            }`}
                            aria-label={allSelected ? 'Deselect all' : 'Select all'}
                          >
                            {allSelected ? (
                              <svg className="w-2.5 h-2.5 text-white" fill="currentColor" viewBox="0 0 20 20">
                                <path
                                  fillRule="evenodd"
                                  d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                                  clipRule="evenodd"
                                />
                              </svg>
                            ) : null}
                          </button>
                        ) : null}
                      </th>
                      <th className="text-left font-medium px-4 py-3 uppercase w-16">Sort</th>
                      <th className="text-left font-medium px-4 py-3 uppercase w-[104px]">Preview</th>
                      <th className="text-left font-medium px-5 py-3 uppercase min-w-[200px]">Title</th>
                      <th className="text-left font-medium px-4 py-3 uppercase">Status</th>
                      <th className="text-center font-medium px-5 py-3 uppercase w-[120px]">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {pagedRows.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-5 py-8 text-center text-gray-500">
                          {rows.length === 0 ? (
                            <>
                              No offers yet.{' '}
                              <Link href="/admin/offers/new" className="text-[#0a61d7] font-medium hover:underline">
                                Create one
                              </Link>{' '}
                              to show on the Marketplace home screen.
                            </>
                          ) : (
                            'No offers match your filters.'
                          )}
                        </td>
                      </tr>
                    ) : (
                      pagedRows.map((r) => (
                        <tr
                          key={r.id}
                          onClick={() => toggleSelect(r.id)}
                          className={`cursor-pointer transition ${
                            selectedIds.includes(r.id) ? 'bg-blue-50 hover:bg-blue-50/80' : 'hover:bg-gray-50/50'
                          }`}
                        >
                          <td className="px-3 py-3 align-middle" onClick={(e) => e.stopPropagation()}>
                            <button
                              type="button"
                              onClick={() => toggleSelect(r.id)}
                              className={`w-4 h-4 border-2 rounded transition-all duration-200 flex items-center justify-center mx-auto ${
                                selectedIds.includes(r.id)
                                  ? 'bg-green-500 border-green-500'
                                  : 'bg-white border-gray-300 hover:border-green-400'
                              }`}
                              aria-label={selectedIds.includes(r.id) ? 'Deselect row' : 'Select row'}
                            >
                              {selectedIds.includes(r.id) ? (
                                <svg className="w-2.5 h-2.5 text-white" fill="currentColor" viewBox="0 0 20 20">
                                  <path
                                    fillRule="evenodd"
                                    d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                                    clipRule="evenodd"
                                  />
                                </svg>
                              ) : null}
                            </button>
                          </td>
                          <td className="px-4 py-3 align-middle text-gray-800 tabular-nums">{r.sortOrder}</td>
                          <td className="px-4 py-3 align-middle">
                            <OfferRowPreview row={r} />
                          </td>
                          <td className="px-5 py-3 align-middle">
                            <p className="font-semibold text-gray-900">{r.title}</p>
                            <p className="text-xs text-gray-600 mt-0.5 line-clamp-2">{r.subtitle || '—'}</p>
                          </td>
                          <td className="px-4 py-3 align-middle">
                            <span
                              className={`text-xs px-2 py-0.5 rounded-full ${
                                r.isPublished ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
                              }`}
                            >
                              {r.isPublished ? 'Published' : 'Draft'}
                            </span>
                          </td>
                          <td className="px-5 py-3 align-middle" onClick={(e) => e.stopPropagation()}>
                            <div className="flex items-center justify-center gap-2">
                              <Link
                                href={`/admin/offers/${r.id}/edit`}
                                className="inline-flex items-center justify-center rounded-lg p-2 hover:bg-gray-100 transition-colors"
                                title="Edit"
                                aria-label={`Edit “${r.title}”`}
                              >
                                <Pencil className="w-4 h-4 text-gray-500" />
                              </Link>
                              <button
                                type="button"
                                onClick={() => {
                                  setDeleteError(null);
                                  setDeleteTarget({ kind: 'one', id: r.id, title: r.title });
                                }}
                                className="inline-flex items-center justify-center rounded-lg p-2 hover:bg-red-100 transition-colors"
                                title="Delete"
                                aria-label={`Delete “${r.title}”`}
                              >
                                <Trash2 className="w-4 h-4 text-red-600" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

            {totalRows > 0 ? (
              <div className="flex items-center justify-between mt-4 flex-wrap gap-3">
                <div className="text-sm text-gray-500">
                  Showing {fromRow} to {toRow} of {totalRows} results
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setListPage(Math.max(1, listPage - 1))}
                    disabled={listPage === 1}
                    className="px-3 py-1 text-sm text-gray-500 hover:text-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    aria-label="Previous page"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <div className="flex items-center gap-1 flex-wrap">
                    {getVisiblePageNumbers(listPage, totalPages).map((pageNum) => (
                      <button
                        key={pageNum}
                        type="button"
                        onClick={() => setListPage(pageNum)}
                        className={`px-3 py-2 text-sm rounded-lg ${
                          listPage === pageNum
                            ? 'bg-[#0a61d7] text-white'
                            : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
                        }`}
                      >
                        {pageNum}
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() => setListPage(Math.min(totalPages, listPage + 1))}
                    disabled={listPage === totalPages}
                    className="px-3 py-1 text-sm text-gray-500 hover:text-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    aria-label="Next page"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ) : null}
            </div>
          </>
        )}
      </div>
    </div>

    {publishOpen ? (
      <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-labelledby="publish-dialog-heading">
        <div className="w-full max-w-lg bg-white rounded-lg border border-[#e6e6e6] shadow-xl overflow-hidden flex flex-col max-h-[min(90vh,720px)]">
          <div className="h-14 px-4 flex items-center justify-between border-b border-[#e6e6e6] shrink-0">
            <h2 id="publish-dialog-heading" className="text-base font-semibold text-gray-900">
              Publish preview ({selectedRows.length} draft{selectedRows.length !== 1 ? 's' : ''})
            </h2>
            <button
              type="button"
              onClick={() => !publishSubmitting && setPublishOpen(false)}
              className="p-2 rounded-lg hover:bg-gray-100 text-gray-700 disabled:opacity-50"
              aria-label="Close"
              disabled={publishSubmitting}
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="overflow-y-auto flex-1 min-h-0 p-4 space-y-3">
            <p className="text-sm text-gray-700">
              These offers will go live for buyers. On Marketplace home, the{' '}
              <span className="font-semibold text-gray-900">lowest sort order</span> among published offers wins the
              banner slot.
            </p>
            {publishError ? (
              <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{publishError}</p>
            ) : null}
            {selectedRows.map((row) => (
              <div key={row.id} className="border border-[#e6e6e6] rounded-xl overflow-hidden bg-white">
                <OfferPublishStripPreview row={row} />
                <div className="px-4 py-3 bg-gray-50/90 border-t border-[#e6e6e6]">
                  {row.customBannerImageUrl?.trim() ? (
                    <div className="mb-2">
                      <p className="text-sm font-semibold text-gray-900">{row.title}</p>
                      {row.subtitle.trim() ? (
                        <p className="text-xs text-gray-600 mt-1">{row.subtitle}</p>
                      ) : null}
                    </div>
                  ) : null}
                  <p className="text-xs text-gray-600">
                    <span className="font-medium text-gray-800">Sort order {row.sortOrder}</span>
                    {' · '}
                    Home shows one banner; the published offer with the smallest number is chosen first.
                  </p>
                </div>
              </div>
            ))}
          </div>
          <div className="px-4 py-3 border-t border-[#e6e6e6] flex justify-end gap-2 shrink-0 bg-white">
            <button
              type="button"
              onClick={() => setPublishOpen(false)}
              disabled={publishSubmitting}
              className="px-4 py-2 rounded-lg border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void confirmPublish()}
              disabled={publishSubmitting}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 disabled:opacity-50"
            >
              <Zap className="w-4 h-4" />
              {publishSubmitting ? 'Publishing…' : 'Publish'}
            </button>
          </div>
        </div>
      </div>
    ) : null}

    {unpublishOpen ? (
      <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true">
        <div className="w-full max-w-md bg-white rounded-lg border border-[#e6e6e6] shadow-xl overflow-hidden">
          <div className="h-14 px-4 flex items-center justify-between border-b border-[#e6e6e6]">
            <h2 className="text-base font-semibold text-gray-900">Unpublish offers</h2>
            <button
              type="button"
              onClick={() => !unpublishSubmitting && setUnpublishOpen(false)}
              className="p-2 rounded-lg hover:bg-gray-100 text-gray-700 disabled:opacity-50"
              aria-label="Close"
              disabled={unpublishSubmitting}
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="p-4 space-y-3">
            <p className="text-sm text-gray-700">
              You&apos;re about to unpublish{' '}
              <span className="font-semibold text-gray-900">{selectedIds.length}</span> offer
              {selectedIds.length !== 1 ? 's' : ''}. They will no longer appear as published (draft).
            </p>
            {unpublishError ? (
              <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{unpublishError}</p>
            ) : null}
          </div>
          <div className="px-4 py-3 border-t border-[#e6e6e6] flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setUnpublishOpen(false)}
              disabled={unpublishSubmitting}
              className="px-4 py-2 rounded-lg border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void confirmUnpublish()}
              disabled={unpublishSubmitting}
              className="px-4 py-2 rounded-lg bg-orange-600 text-white text-sm font-medium hover:bg-orange-700 disabled:opacity-50"
            >
              {unpublishSubmitting ? 'Unpublishing…' : 'Unpublish'}
            </button>
          </div>
        </div>
      </div>
    ) : null}

    {deleteTarget ? (
      <div
        className="fixed inset-0 z-[70] bg-black/50 flex items-center justify-center p-4"
        role="dialog"
        aria-modal="true"
        aria-labelledby="offers-delete-heading"
      >
        <div className="w-full max-w-md bg-white rounded-lg border border-[#e6e6e6] shadow-xl overflow-hidden">
          <div className="h-14 px-4 flex items-center justify-between border-b border-[#e6e6e6]">
            <h2 id="offers-delete-heading" className="text-base font-semibold text-gray-900">
              {deleteTarget.kind === 'bulk' ? 'Delete offers' : 'Delete offer'}
            </h2>
            <button
              type="button"
              onClick={() => !deleteSubmitting && setDeleteTarget(null)}
              className="p-2 rounded-lg hover:bg-gray-100 text-gray-700 disabled:opacity-50"
              aria-label="Close"
              disabled={deleteSubmitting}
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="p-4 space-y-3">
            <p className="text-sm text-gray-700">
              {deleteTarget.kind === 'bulk' ? (
                <>
                  Delete <span className="font-semibold text-gray-900">{selectedIds.length}</span> offer
                  {selectedIds.length !== 1 ? 's' : ''}? The Marketplace home banner will update for all users. This
                  cannot be undone.
                </>
              ) : (
                <>
                  Are you sure you want to delete{' '}
                  <span className="font-semibold text-gray-900">&ldquo;{deleteTarget.title}&rdquo;</span>? The home banner
                  may change for all users. This cannot be undone.
                </>
              )}
            </p>
            {deleteError ? (
              <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{deleteError}</p>
            ) : null}
          </div>
          <div className="px-4 py-3 border-t border-[#e6e6e6] flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setDeleteTarget(null)}
              disabled={deleteSubmitting}
              className="px-4 py-2 rounded-lg border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void (deleteTarget.kind === 'bulk' ? confirmBulkDelete() : confirmOneDelete())}
              disabled={deleteSubmitting}
              className="px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-700 disabled:opacity-50"
            >
              {deleteSubmitting ? 'Deleting…' : 'Delete'}
            </button>
          </div>
        </div>
      </div>
    ) : null}
    </>
  );
}
