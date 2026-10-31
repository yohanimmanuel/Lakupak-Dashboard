'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Edit,
  EyeOff,
  Gift,
  Search,
  Trash2,
  X,
  Zap,
} from 'lucide-react';
import { OfferPreviewIcon } from '@/utils/offerPreviewIcons';
import { cssSafeUrl } from '@/utils/cssSafeUrl';
import SlidingSegmentedControl from '@/components/SlidingSegmentedControl';
import {
  MarketplaceHomeOfferRowPreview as OfferRowPreview,
  normalizeHex,
} from '@/components/adminstuffs/MarketplaceHomeOfferRowPreview';
import { TABLE_PAGE_SIZE, getVisiblePageNumbers } from '@/utils/tablePagination';
import { formatDate } from '@/utils/dateUtils';

export type CampaignOfferRow = {
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

function OfferPublishStripPreview({ row }: { row: CampaignOfferRow }) {
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

type Props = {
  rows: CampaignOfferRow[];
  loading?: boolean;
  onRefreshAction: () => Promise<void> | void;
};

export default function OfferCampaignTable({ rows, loading = false, onRefreshAction }: Props) {
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
    null,
  );
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const anyBusy = publishSubmitting || unpublishSubmitting || deleteSubmitting;

  const filteredRows = useMemo(() => {
    let next = rows;
    if (selectedTab !== 'All') {
      next = next.filter((r) => (selectedTab === 'Published' ? r.isPublished : !r.isPublished));
    }
    const q = query.trim().toLowerCase();
    if (!q) return next;
    return next.filter((r) => `${r.title} ${r.subtitle} ${r.id}`.toLowerCase().includes(q));
  }, [rows, query, selectedTab]);

  const totalRows = filteredRows.length;
  const totalPages = Math.max(1, Math.ceil(totalRows / rowsPerPage));
  const pagedRows = useMemo(
    () => filteredRows.slice((listPage - 1) * rowsPerPage, listPage * rowsPerPage),
    [filteredRows, listPage],
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
    [filteredRows, selectedIds],
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
    const res = await fetch(`/api/offers/campaigns/${id}`, {
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
    const res = await fetch(`/api/offers/campaigns/${id}`, { method: 'DELETE' });
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
        await onRefreshAction();
        return;
      }
      setPublishOpen(false);
      setSelectedIds([]);
      await onRefreshAction();
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
      await onRefreshAction();
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
      await onRefreshAction();
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
      await onRefreshAction();
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : 'Failed to delete');
    } finally {
      setDeleteSubmitting(false);
    }
  };

  return (
    <>
      <div className="mx-auto mt-3 w-full min-w-0 rounded-lg border border-[#e6e6e6] bg-white p-4">
        <div className="mb-4 w-full min-w-0">
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

        <div className="relative mb-4 w-full">
          <Search className="absolute left-3 top-2 h-5 w-5 text-gray-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search campaigns…"
            className="w-full rounded-lg border border-[#e6e6e6] bg-white py-2 pl-10 pr-4 text-sm text-black focus:outline-none focus:ring-2 focus:ring-[#0a61d7]"
          />
        </div>

        {selectedIds.length > 0 && (
          <div className="mb-3 rounded-lg border border-[#e6e6e6] border-l-4 border-l-green-500 bg-white p-3 shadow-sm md:p-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <span className="text-sm font-semibold text-[#0a61d7]">
                {selectedIds.length} {selectedIds.length === 1 ? 'campaign' : 'campaigns'} selected
              </span>
              <div className="flex items-center gap-2 md:gap-4">
                <span className="hidden text-xs font-semibold text-gray-600 md:block">
                  {bulkState.mixed
                    ? 'Mixed draft and published. Only removal is allowed.'
                    : bulkState.canPublish
                      ? 'Publish selected campaigns to your storefront.'
                      : bulkState.canUnpublish
                        ? 'Unpublish selected campaigns.'
                        : 'Remove selected campaigns.'}
                </span>
                <div className="flex flex-wrap gap-2">
                  {bulkState.canPublish ? (
                    <button
                      type="button"
                      disabled={anyBusy}
                      onClick={() => {
                        setPublishError(null);
                        setPublishOpen(true);
                      }}
                      className="flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-green-700 disabled:opacity-50"
                    >
                      <Zap className="h-4 w-4" />
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
                      className="flex items-center gap-2 rounded-lg bg-yellow-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-yellow-700 disabled:opacity-50"
                    >
                      <EyeOff className="h-4 w-4" />
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
                    className="flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-700 disabled:opacity-50"
                  >
                    <Trash2 className="h-4 w-4" />
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
            <div className="overflow-auto">
              <div className="min-w-[860px] overflow-hidden rounded-lg">
                <table className="w-full text-sm">
                  <thead className="bg-gray-100 text-xs text-gray-600">
                    <tr>
                      <th className="w-10 px-4 py-3 font-medium uppercase">
                        <button
                          type="button"
                          onClick={toggleSelectAll}
                          className={`flex h-4 w-4 items-center justify-center rounded border-2 transition-all duration-200 ${
                            allSelected ? 'border-green-500 bg-green-500' : 'border-gray-300 bg-white hover:border-green-400'
                          }`}
                          aria-label={allSelected ? 'Deselect all' : 'Select all'}
                        >
                          {allSelected ? <Check className="h-3 w-3 text-white" /> : null}
                        </button>
                      </th>
                      <th className="w-16 px-4 py-3 text-left font-medium uppercase">Sort</th>
                      <th className="w-[104px] px-4 py-3 text-left font-medium uppercase">Preview</th>
                      <th className="min-w-[200px] px-5 py-3 text-left font-medium uppercase">Title</th>
                      <th className="px-4 py-3 text-left font-medium uppercase">Status</th>
                      <th className="whitespace-nowrap px-4 py-3 text-left text-xs font-medium uppercase">Last Updated</th>
                      <th className="w-[120px] px-5 py-3 text-center font-medium uppercase">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {pagedRows.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="py-12 text-center text-gray-500">
                          <div className="flex flex-col items-center gap-2">
                            <Gift className="h-12 w-12 text-gray-400" />
                            <p className="text-sm">
                              {rows.length === 0 ? 'No campaigns yet' : 'No campaigns match your filters.'}
                            </p>
                          </div>
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
                              className={`mx-auto flex h-4 w-4 items-center justify-center rounded border-2 transition-all duration-200 ${
                                selectedIds.includes(r.id)
                                  ? 'border-green-500 bg-green-500'
                                  : 'border-gray-300 bg-white hover:border-green-400'
                              }`}
                              aria-label={selectedIds.includes(r.id) ? 'Deselect row' : 'Select row'}
                            >
                              {selectedIds.includes(r.id) ? <Check className="h-3 w-3 text-white" /> : null}
                            </button>
                          </td>
                          <td className="px-4 py-3 align-middle tabular-nums text-gray-800">{r.sortOrder}</td>
                          <td className="px-4 py-3 align-middle">
                            <OfferRowPreview row={r} />
                          </td>
                          <td className="px-5 py-3 align-middle">
                            <p className="font-semibold text-gray-900">{r.title}</p>
                            <p className="mt-0.5 line-clamp-2 text-xs text-gray-600">{r.subtitle || '—'}</p>
                          </td>
                          <td className="px-4 py-3 align-middle">
                            <span
                              className={`rounded-full px-2 py-0.5 text-xs ${
                                r.isPublished ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
                              }`}
                            >
                              {r.isPublished ? 'Published' : 'Draft'}
                            </span>
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 align-middle text-xs text-gray-700">
                            {formatDate(r.updatedAt) || 'N/A'}
                          </td>
                          <td className="px-5 py-3 align-middle" onClick={(e) => e.stopPropagation()}>
                            <div className="flex items-center justify-center gap-2">
                              <Link
                                href={`/offers/campaign/${r.id}/edit`}
                                className="inline-flex items-center justify-center rounded-lg p-2 transition-colors hover:bg-gray-100 focus:outline-none"
                                title="Edit"
                                aria-label={`Edit “${r.title}”`}
                              >
                                <Edit className="h-4 w-4 text-gray-500" />
                              </Link>
                              <button
                                type="button"
                                onClick={() => {
                                  setDeleteError(null);
                                  setDeleteTarget({ kind: 'one', id: r.id, title: r.title });
                                }}
                                className="inline-flex items-center justify-center rounded-lg p-2 transition-colors hover:bg-red-100"
                                title="Delete"
                                aria-label={`Delete “${r.title}”`}
                              >
                                <Trash2 className="h-4 w-4 text-red-600" />
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
                <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                  <div className="text-sm text-gray-500">
                    Showing {fromRow} to {toRow} of {totalRows} results
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setListPage(Math.max(1, listPage - 1))}
                      disabled={listPage === 1}
                      className="px-3 py-1 text-sm text-gray-500 hover:text-gray-700 disabled:cursor-not-allowed disabled:opacity-50"
                      aria-label="Previous page"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </button>
                    <div className="flex flex-wrap items-center gap-1">
                      {getVisiblePageNumbers(listPage, totalPages).map((pageNum) => (
                        <button
                          key={pageNum}
                          type="button"
                          onClick={() => setListPage(pageNum)}
                          className={`rounded-lg px-3 py-2 text-sm ${
                            listPage === pageNum
                              ? 'bg-[#0a61d7] text-white'
                              : 'text-gray-500 hover:bg-gray-100 hover:text-gray-700'
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
                      className="px-3 py-1 text-sm text-gray-500 hover:text-gray-700 disabled:cursor-not-allowed disabled:opacity-50"
                      aria-label="Next page"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          </>
        )}
      </div>

      {publishOpen ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-labelledby="publish-dialog-heading">
          <div className="flex max-h-[min(90vh,720px)] w-full max-w-lg flex-col overflow-hidden rounded-lg border border-[#e6e6e6] bg-white shadow-xl">
            <div className="flex h-14 shrink-0 items-center justify-between border-b border-[#e6e6e6] px-4">
              <h2 id="publish-dialog-heading" className="text-base font-semibold text-gray-900">
                Publish preview ({selectedRows.length} draft{selectedRows.length !== 1 ? 's' : ''})
              </h2>
              <button
                type="button"
                onClick={() => !publishSubmitting && setPublishOpen(false)}
                className="rounded-lg p-2 text-gray-700 hover:bg-gray-100 disabled:opacity-50"
                aria-label="Close"
                disabled={publishSubmitting}
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
              <p className="text-sm text-gray-700">
                These banners will go live on your Marketplace storefront. On home, the{' '}
                <span className="font-semibold text-gray-900">lowest sort order</span> among published offers wins the
                banner slot.
              </p>
              {publishError ? (
                <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">{publishError}</p>
              ) : null}
              {selectedRows.map((row) => (
                <div key={row.id} className="overflow-hidden rounded-xl border border-[#e6e6e6] bg-white">
                  <OfferPublishStripPreview row={row} />
                  <div className="border-t border-[#e6e6e6] bg-gray-50/90 px-4 py-3">
                    {row.customBannerImageUrl?.trim() ? (
                      <div className="mb-2">
                        <p className="text-sm font-semibold text-gray-900">{row.title}</p>
                        {row.subtitle.trim() ? <p className="mt-1 text-xs text-gray-600">{row.subtitle}</p> : null}
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
            <div className="flex shrink-0 justify-end gap-2 border-t border-[#e6e6e6] bg-white px-4 py-3">
              <button
                type="button"
                onClick={() => setPublishOpen(false)}
                disabled={publishSubmitting}
                className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void confirmPublish()}
                disabled={publishSubmitting}
                className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                <Zap className="h-4 w-4" />
                {publishSubmitting ? 'Publishing…' : 'Publish'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {unpublishOpen ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-md overflow-hidden rounded-lg border border-[#e6e6e6] bg-white shadow-xl">
            <div className="flex h-14 items-center justify-between border-b border-[#e6e6e6] px-4">
              <h2 className="text-base font-semibold text-gray-900">Unpublish offers</h2>
              <button
                type="button"
                onClick={() => !unpublishSubmitting && setUnpublishOpen(false)}
                className="rounded-lg p-2 text-gray-700 hover:bg-gray-100 disabled:opacity-50"
                aria-label="Close"
                disabled={unpublishSubmitting}
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-3 p-4">
              <p className="text-sm text-gray-700">
                You&apos;re about to unpublish{' '}
                <span className="font-semibold text-gray-900">{selectedIds.length}</span> offer
                {selectedIds.length !== 1 ? 's' : ''}. They will no longer appear as published (draft).
              </p>
              {unpublishError ? (
                <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">{unpublishError}</p>
              ) : null}
            </div>
            <div className="flex justify-end gap-2 border-t border-[#e6e6e6] px-4 py-3">
              <button
                type="button"
                onClick={() => setUnpublishOpen(false)}
                disabled={unpublishSubmitting}
                className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void confirmUnpublish()}
                disabled={unpublishSubmitting}
                className="rounded-lg bg-orange-600 px-4 py-2 text-sm font-medium text-white hover:bg-orange-700 disabled:opacity-50"
              >
                {unpublishSubmitting ? 'Unpublishing…' : 'Unpublish'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {deleteTarget ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-sm rounded-lg border border-[#e6e6e6] bg-white p-4">
            <h2 className="mb-2 text-lg font-bold text-red-500">
              {deleteTarget.kind === 'bulk' ? 'Delete campaigns' : 'Delete campaign'}
            </h2>
            {deleteError ? (
              <div className="mb-4 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-3">
                <span className="text-sm text-red-700">{deleteError}</span>
              </div>
            ) : null}
            <p className="mb-4 text-gray-500">
              {deleteTarget.kind === 'bulk'
                ? `Delete ${selectedIds.length} campaign${selectedIds.length === 1 ? '' : 's'}? This cannot be undone.`
                : `Are you sure you want to delete “${deleteTarget.title}”? This cannot be undone.`}
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                className="rounded-lg bg-gray-200 px-4 py-2 text-gray-700 transition-colors hover:bg-gray-300 focus:outline-none focus:ring-2 focus:ring-gray-500"
                onClick={() => setDeleteTarget(null)}
                disabled={deleteSubmitting}
              >
                Cancel
              </button>
              <button
                type="button"
                className="flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-white transition-colors hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 disabled:opacity-50"
                onClick={() => void (deleteTarget.kind === 'bulk' ? confirmBulkDelete() : confirmOneDelete())}
                disabled={deleteSubmitting}
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
