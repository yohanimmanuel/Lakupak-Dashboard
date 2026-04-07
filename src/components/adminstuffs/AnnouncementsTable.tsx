'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Edit, Trash2, EyeOff, Filter, ChevronDown, Zap, X, ChevronLeft, ChevronRight } from 'lucide-react';
import AnnouncementPublishModal from '@/components/adminstuffs/AnnouncementPublishModal';

export type AnnouncementRow = {
  id: number;
  title: string;
  body: string;
  category: string;
  imageUrl: string | null;
  linkUrl: string | null;
  isPublished: boolean;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

function formatCategoryLabel(category: string) {
  const t = category.trim();
  if (!t) return '';
  return t.charAt(0).toUpperCase() + t.slice(1).toLowerCase();
}

export default function AnnouncementsTable({
  rows,
  searchQuery,
  onEditAction,
  onRefreshAction,
  onApplyRowsAction,
}: {
  rows: AnnouncementRow[];
  searchQuery: string;
  onEditAction: (row: AnnouncementRow) => void;
  onRefreshAction: () => void;
  onApplyRowsAction: (updater: (prev: AnnouncementRow[]) => AnnouncementRow[]) => void;
}) {
  const [selectedTab, setSelectedTab] = useState<'All' | 'Published' | 'Draft'>('All');
  const [selectedCategory, setSelectedCategory] = useState('All Categories');
  const [showCategoryDropdown, setShowCategoryDropdown] = useState(false);

  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [publishOpen, setPublishOpen] = useState(false);
  const [unpublishOpen, setUnpublishOpen] = useState(false);
  const [modalItems, setModalItems] = useState<AnnouncementRow[]>([]);
  const [unpublishSubmitting, setUnpublishSubmitting] = useState(false);
  const [unpublishError, setUnpublishError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AnnouncementRow | null>(null);
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const rowsPerPage = 8;
  const [listPage, setListPage] = useState(1);

  const counts = useMemo(() => {
    const published = rows.filter((r) => r.isPublished).length;
    return { total: rows.length, published, draft: Math.max(0, rows.length - published) };
  }, [rows]);

  const categoryOptions = useMemo(() => {
    const unique = Array.from(new Set(rows.map((r) => (r.category ?? '').trim()).filter(Boolean)));
    unique.sort((a, b) => a.localeCompare(b));
    return ['All Categories', ...unique];
  }, [rows]);

  const filteredRows = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    let next = rows;

    if (selectedTab !== 'All') {
      next = next.filter((r) => (selectedTab === 'Published' ? r.isPublished : !r.isPublished));
    }

    if (selectedCategory !== 'All Categories') {
      next = next.filter((r) => (r.category ?? '').trim() === selectedCategory);
    }

    if (!q) return next;
    return next.filter((r) => {
      const hay = `${r.title} ${r.body} ${r.category}`.toLowerCase();
      return hay.includes(q);
    });
  }, [rows, searchQuery, selectedTab, selectedCategory]);

  const totalRows = filteredRows.length;
  const totalPages = Math.max(1, Math.ceil(totalRows / rowsPerPage));
  const pagedRows = useMemo(
    () => filteredRows.slice((listPage - 1) * rowsPerPage, listPage * rowsPerPage),
    [filteredRows, listPage, rowsPerPage]
  );
  const fromRow = totalRows === 0 ? 0 : (listPage - 1) * rowsPerPage + 1;
  const toRow = Math.min(listPage * rowsPerPage, totalRows);

  useEffect(() => {
    setListPage(1);
  }, [selectedTab, selectedCategory, searchQuery]);

  useEffect(() => {
    const tp = Math.max(1, Math.ceil(filteredRows.length / rowsPerPage));
    setListPage((p) => Math.min(p, tp));
  }, [filteredRows.length, rowsPerPage]);

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

  const openPublishModal = () => {
    if (selectedRows.length === 0) return;
    setModalItems(selectedRows);
    setPublishOpen(true);
  };

  const openUnpublishModal = () => {
    if (selectedRows.length === 0) return;
    setModalItems(selectedRows);
    setUnpublishError(null);
    setUnpublishSubmitting(false);
    setUnpublishOpen(true);
  };

  const confirmUnpublish = async () => {
    setUnpublishSubmitting(true);
    setUnpublishError(null);
    try {
      const targets = modalItems.filter((a) => a.isPublished);
      const settled = await Promise.allSettled(
        targets.map(async (a) => {
          const res = await fetch(`/api/platform-admin/announcements/${a.id}`, {
            method: 'PATCH',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ isPublished: false }),
          });
          if (!res.ok) {
            const d = await res.json().catch(() => ({}));
            throw new Error(d?.error || `Unpublish failed (id ${a.id})`);
          }
          return a.id;
        })
      );

      const succeededIds: number[] = [];
      const failures: Array<{ id: number; message: string }> = [];
      settled.forEach((r, idx) => {
        const id = targets[idx]?.id;
        if (!id) return;
        if (r.status === 'fulfilled') succeededIds.push(r.value);
        else failures.push({ id, message: r.reason instanceof Error ? r.reason.message : String(r.reason) });
      });

      if (succeededIds.length === 0 && failures.length > 0) {
        const details = failures.map((f) => `#${f.id}: ${f.message}`).join(' | ');
        throw new Error(`Unpublish failed: ${details}`);
      }
      const now = new Date().toISOString();
      if (succeededIds.length > 0) {
        onApplyRowsAction((prev) =>
          prev.map((r) =>
            succeededIds.includes(r.id) ? { ...r, isPublished: false, publishedAt: null, updatedAt: now } : r
          )
        );
        setSelectedIds((prev) => prev.filter((id) => !succeededIds.includes(id)));
        setModalItems((prev) => prev.map((a) => (succeededIds.includes(a.id) ? { ...a, isPublished: false } : a)));
      }

      if (failures.length > 0) {
        const details = failures.map((f) => `#${f.id}: ${f.message}`).join(' | ');
        throw new Error(`Some announcements failed to unpublish: ${details}`);
      }

      setUnpublishOpen(false);
    } catch (e) {
      setUnpublishError(e instanceof Error ? e.message : 'Unpublish failed');
    } finally {
      setUnpublishSubmitting(false);
    }
  };

  const openBulkDelete = () => {
    if (selectedRows.length === 0) return;
    setDeleteError(null);
    // Use a synthetic target for bulk delete; we’ll show count in the modal.
    setDeleteTarget({
      id: -1,
      title:
        selectedRows.length === 1 ? selectedRows[0]!.title : `${selectedRows.length} announcements`,
      body: '',
      category: '',
      imageUrl: null,
      linkUrl: null,
      isPublished: false,
      publishedAt: null,
      createdAt: '',
      updatedAt: '',
    });
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleteSubmitting(true);
    setDeleteError(null);
    try {
      const idsToDelete =
        deleteTarget.id === -1 ? [...selectedIds] : [deleteTarget.id];

      const settled = await Promise.allSettled(
        idsToDelete.map(async (id) => {
          const res = await fetch(`/api/platform-admin/announcements/${id}`, { method: 'DELETE' });
          const data = res.ok ? null : await res.json().catch(() => ({}));
          if (!res.ok) {
            throw new Error((data as any)?.error || `Delete failed (id ${id})`);
          }
          return id;
        })
      );

      const succeededIds: number[] = [];
      const failures: Array<{ id: number; message: string }> = [];

      settled.forEach((r, idx) => {
        const id = idsToDelete[idx]!;
        if (r.status === 'fulfilled') succeededIds.push(r.value);
        else failures.push({ id, message: r.reason instanceof Error ? r.reason.message : String(r.reason) });
      });

      if (succeededIds.length > 0) {
        setSelectedIds((prev) => prev.filter((id) => !succeededIds.includes(id)));
        onApplyRowsAction((prev) => prev.filter((row) => !succeededIds.includes(row.id)));
      }

      if (failures.length > 0) {
        const details = failures.map((f) => `#${f.id}: ${f.message}`).join(' | ');
        throw new Error(`Some deletions failed: ${details}`);
      }

      // Only close modal on full success
      setDeleteTarget(null);
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : 'Delete failed');
    } finally {
      setDeleteSubmitting(false);
    }
  };

  return (
    <>
      <div className="bg-white border border-[#e6e6e6] rounded-lg overflow-hidden">
        <div className="px-5 py-4 border-b border-[#e6e6e6] flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-gray-900">Announcements</p>
            <p className="text-xs text-gray-600 mt-1">
              Total: {counts.total} <span className="text-gray-300">•</span> Published: {counts.published}{' '}
              <span className="text-gray-300">•</span> Draft: {counts.draft}
            </p>
          </div>
        </div>

        <div className="px-5 py-3 border-b border-[#e6e6e6]">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="relative w-full sm:w-auto flex items-center min-w-0">
              <div className="absolute inset-0 bg-gray-100 rounded-lg" />
              {(['All', 'Published', 'Draft'] as const).map((tab, idx, arr) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setSelectedTab(tab)}
                  className={`relative z-10 flex-1 px-4 sm:px-6 py-2 font-medium text-[14px] transition-colors duration-200 focus:outline-none ${
                    selectedTab === tab ? 'text-white' : 'text-gray-700 hover:text-[#0a61d7]'
                  } ${idx === 0 ? 'rounded-l-lg' : idx === arr.length - 1 ? 'rounded-r-lg' : ''}`}
                >
                  <span
                    className={`absolute inset-0 rounded-lg transition-all duration-200 ${
                      selectedTab === tab ? 'bg-[#0a61d7]' : 'bg-transparent'
                    }`}
                    aria-hidden="true"
                  />
                  <span className="relative">{tab}</span>
                </button>
              ))}
            </div>

            <div className="relative shrink-0">
              <button
                type="button"
                className="flex items-center gap-1 px-3 py-2 rounded-lg border border-[#e6e6e6] bg-white text-gray-700 hover:bg-gray-100 text-sm"
                onClick={() => setShowCategoryDropdown((v) => !v)}

>
                <Filter className="w-4 h-4" />
                {selectedCategory === 'All Categories' ? 'All Categories' : formatCategoryLabel(selectedCategory)}
                <ChevronDown className="w-4 h-4 ml-1 text-gray-500" />
              </button>
              {showCategoryDropdown ? (
                <div className="absolute right-0 mt-2 w-40 bg-white border border-[#e6e6e6] rounded-lg shadow z-20 max-h-60 overflow-y-auto">
                  {categoryOptions.map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => {
                        setSelectedCategory(cat);
                        setShowCategoryDropdown(false);
                      }}
                      className={`w-full text-left px-4 py-2 text-sm first:rounded-t-lg last:rounded-b-lg ${
                        selectedCategory === cat
                          ? 'text-[#0a61d7] font-semibold hover:bg-gray-100'
                          : 'text-gray-700 hover:bg-gray-100'
                      }`}
                    >
                      {cat === 'All Categories' ? 'All Categories' : formatCategoryLabel(cat)}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        </div>

        {selectedIds.length > 0 && (
          <div className="bg-gradient-to-r from-green-500 to-green-400 rounded-lg p-3 md:p-4 m-4 mb-2">
            {/* Mobile Layout */}
            <div className="md:hidden space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1">
                  <div className="text-white flex items-center justify-center text-sm font-semibold">
                    {selectedIds.length}
                  </div>
                  <span className="text-sm font-semibold text-white">
                    {selectedIds.length === 1 ? 'announcement' : 'announcements'} selected
                  </span>
                </div>
              </div>
              <div className="text-white text-xs font-semibold leading-relaxed">
                {bulkState.mixed
                  ? 'Mixed draft and published selected. Only deletion is allowed for safety.'
                  : bulkState.canPublish
                    ? 'Your update will be published in the Marketplace app. 😉'
                    : bulkState.canUnpublish
                      ? 'Select announcements to unpublish from the marketplace.'
                      : 'Select announcements to delete.'}
              </div>
              <div className="flex gap-2">
                {bulkState.canPublish ? (
                  <button
                    type="button"
                    onClick={openPublishModal}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-emerald-600 text-white font-semibold text-sm rounded-lg hover:bg-emerald-700 transition-colors disabled:opacity-60"
                  >
                    <Zap className="w-4 h-4 text-white" />
                    Publish
                  </button>
                ) : null}
                {bulkState.canUnpublish ? (
                  <button
                    type="button"
                    onClick={openUnpublishModal}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-orange-600 text-white font-semibold text-sm rounded-lg hover:bg-orange-700 transition-colors disabled:opacity-60"
                  >
                    <EyeOff className="w-4 h-4 text-white" />
                    Unpublish
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={openBulkDelete}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-red-600 text-white font-semibold text-sm rounded-lg hover:bg-red-700 transition-colors disabled:opacity-60"
                >
                  <Trash2 className="w-4 h-4 text-white" />
                  Delete
                </button>
              </div>
            </div>

            {/* Desktop Layout */}
            <div className="hidden md:flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1">
                  <div className="text-white flex items-center justify-center text-sm font-semibold">
                    {selectedIds.length}
                  </div>
                  <span className="text-sm font-semibold text-white">
                    {selectedIds.length === 1 ? 'announcement' : 'announcements'} selected
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <span className="text-white text-xs md:text-sm font-semibold">
                  {bulkState.mixed
                    ? 'Mixed draft and published selected. Only deletion is allowed for safety.'
                    : bulkState.canPublish
                      ? 'Your update will be published in the Marketplace app. 😉'
                      : bulkState.canUnpublish
                        ? 'Select announcements to unpublish (change to Draft status).'
                        : 'Select announcements to delete.'}
                </span>
                <div className="flex gap-2">
                  {bulkState.canPublish ? (
                    <button
                      type="button"
                      onClick={openPublishModal}
                      className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white font-semibold text-sm rounded-lg hover:bg-emerald-700 transition-colors disabled:opacity-60"
                    >
                      <Zap className="w-4 h-4 text-white" />
                      Publish
                    </button>
                  ) : null}
                  {bulkState.canUnpublish ? (
                    <button
                      type="button"
                      onClick={openUnpublishModal}
                      className="flex items-center gap-2 px-4 py-2 bg-orange-600 text-white font-semibold text-sm rounded-lg hover:bg-orange-700 transition-colors disabled:opacity-60"
                    >
                      <EyeOff className="w-4 h-4 text-white" />
                      Unpublish
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={openBulkDelete}
                    className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white font-semibold text-sm rounded-lg hover:bg-red-700 transition-colors disabled:opacity-60"
                  >
                    <Trash2 className="w-4 h-4 text-white" />
                    Delete
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="overflow-auto p-4">
          <div className="rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-100 text-xs text-gray-600">
                <tr>
                  <th className="w-10 px-3 py-3 text-center">
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
                  <th className="text-left font-medium px-5 py-3 uppercase">Title</th>
                  <th className="text-left font-medium px-4 py-3 uppercase">Category</th>
                  <th className="text-left font-medium px-4 py-3 uppercase">Status</th>
                  <th className="text-center font-medium px-5 py-3 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredRows.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-5 py-8 text-gray-500">
                      {rows.length === 0
                        ? 'No announcements yet. Create your first update.'
                        : 'No announcements match your filters.'}
                    </td>
                  </tr>
                ) : (
                  pagedRows.map((r) => (
                    <tr
                      key={r.id}
                      onClick={() => toggleSelect(r.id)}
                      className={`cursor-pointer transition ${
                        selectedIds.includes(r.id)
                          ? 'bg-blue-50 hover:bg-blue-50/80'
                          : 'hover:bg-gray-50/50'
                      }`}
                    >
                      <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
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
                      <td className="px-5 py-3">
                        <p className="font-semibold text-gray-900">{r.title}</p>
                        <p className="text-xs text-gray-600 line-clamp-1 mt-0.5">{r.body}</p>
                      </td>
                      <td className="px-4 py-3 text-gray-700">{formatCategoryLabel(r.category)}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`text-xs px-2 py-0.5 rounded-full ${
                            r.isPublished ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
                          }`}
                        >
                          {r.isPublished ? 'Published' : 'Draft'}
                        </span>
                      </td>
                      <td className="px-5 py-3" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-center gap-2">
                          <button
                            type="button"
                            onClick={() => onEditAction(r)}
                            className="inline-flex items-center justify-center rounded-lg p-2 hover:bg-gray-100 transition-colors focus:outline-none disabled:opacity-50"
                            aria-label={`Edit “${r.title}”`}
                            title="Edit"
                          >
                            <Edit className="w-4 h-4 text-gray-500" />
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setDeleteError(null);
                              setDeleteTarget(r);
                            }}
                            className="inline-flex items-center justify-center rounded-lg p-2 hover:bg-red-100 transition-colors focus:outline-none disabled:opacity-50"
                            aria-label={`Delete “${r.title}”`}
                            title="Delete"
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

          <div className="flex items-center justify-between mt-4">
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
              <div className="flex items-center gap-1">
                {(() => {
                  // Sliding 5-wide window centered on current page (as possible).
                  let start = Math.max(1, listPage - 2);
                  let end = Math.min(totalPages, start + 4);
                  start = Math.max(1, end - 4);

                  const windowPages = Array.from({ length: Math.max(0, end - start + 1) }, (_, i) => start + i);
                  const showFirst = start > 1;
                  const showLeadingDots = start > 2;
                  const showLast = end < totalPages;
                  const showTrailingDots = end < totalPages - 1;

                  return (
                    <>
                      {showFirst ? (
                        <button
                          key={1}
                          type="button"
                          onClick={() => setListPage(1)}
                          className={`px-3 py-2 text-sm rounded-lg ${
                            listPage === 1
                              ? 'bg-[#0a61d7] text-white'
                              : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
                          }`}
                        >
                          1
                        </button>
                      ) : null}
                      {showLeadingDots ? <span className="px-2 text-gray-500">...</span> : null}

                      {windowPages.map((pageNum) => (
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

                      {showTrailingDots ? <span className="px-2 text-gray-500">...</span> : null}
                      {showLast ? (
                        <button
                          key={totalPages}
                          type="button"
                          onClick={() => setListPage(totalPages)}
                          className={`px-3 py-2 text-sm rounded-lg ${
                            listPage === totalPages
                              ? 'bg-[#0a61d7] text-white'
                              : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
                          }`}
                        >
                          {totalPages}
                        </button>
                      ) : null}
                    </>
                  );
                })()}
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
        </div>
      </div>

      <AnnouncementPublishModal
        isOpen={publishOpen}
        announcements={modalItems}
        onCloseAction={() => setPublishOpen(false)}
        onPublishedAction={() => {
          const now = new Date().toISOString();
          const ids = modalItems.map((a) => a.id);
          onApplyRowsAction((prev) =>
            prev.map((r) => (ids.includes(r.id) ? { ...r, isPublished: true, publishedAt: now, updatedAt: now } : r))
          );
          setSelectedIds([]);
        }}
      />

      {unpublishOpen ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-md bg-white rounded-lg border border-[#e6e6e6] shadow-xl overflow-hidden">
            <div className="h-14 px-4 flex items-center justify-between border-b border-[#e6e6e6]">
              <h2 className="text-base font-semibold text-gray-900">Unpublish announcements</h2>
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
                You’re about to unpublish{' '}
                <span className="font-semibold text-gray-900">
                  {modalItems.filter((a) => a.isPublished).length}
                </span>{' '}
                announcement{modalItems.filter((a) => a.isPublished).length !== 1 ? 's' : ''}. They will no longer appear in the Marketplace app.
              </p>
              {unpublishError ? (
                <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                  {unpublishError}
                </p>
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
          aria-labelledby="announcement-delete-heading"
        >
          <div className="w-full max-w-md bg-white rounded-lg border border-[#e6e6e6] shadow-xl overflow-hidden">
            <div className="h-14 px-4 flex items-center justify-between border-b border-[#e6e6e6]">
              <h2 id="announcement-delete-heading" className="text-base font-semibold text-gray-900">
                Delete announcement
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
                Are you sure you want to delete{' '}
                <span className="font-semibold text-gray-900">“{deleteTarget.title}”</span>? This cannot be undone.
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
                onClick={() => void confirmDelete()}
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
