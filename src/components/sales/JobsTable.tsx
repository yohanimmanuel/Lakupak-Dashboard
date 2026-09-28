'use client';

import React, { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Briefcase, ChevronDown, ChevronLeft, ChevronRight, Edit, Filter, Search, Trash, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import {
  OPEN_SALES_JOB_STATUSES,
  SALES_JOB_STATUSES,
  SALES_JOB_TYPES,
  SalesJobRow,
  salesJobStatusKey,
} from './salesJobTypes';

const STATUS_TABS = ['all', ...SALES_JOB_STATUSES] as const;
const ROWS_PER_PAGE = 5;

const TYPE_BADGE: Record<string, string> = {
  take_order: 'bg-blue-100 text-blue-800',
  collect_payment: 'bg-emerald-100 text-emerald-800',
  promote_product: 'bg-purple-100 text-purple-800',
  stock_check: 'bg-amber-100 text-amber-800',
  prospect_new_outlet: 'bg-gray-100 text-gray-700',
  returns_pickup: 'bg-rose-100 text-rose-800',
  competitor_intel: 'bg-sky-100 text-sky-800',
  new_product_activation: 'bg-indigo-100 text-indigo-800',
  scheme_reconciliation: 'bg-teal-100 text-teal-800',
};

const STATUS_BADGE: Record<string, string> = {
  pending: 'bg-blue-100 text-blue-800',
  suggested: 'bg-blue-100 text-blue-800',
  approved: 'bg-blue-100 text-blue-800',
  dispatched: 'bg-purple-100 text-purple-800',
  in_progress: 'bg-yellow-100 text-yellow-800',
  completed: 'bg-green-100 text-green-800',
  skipped: 'bg-gray-100 text-gray-700',
};

type JobGroup = {
  id: string;
  jobs: SalesJobRow[];
  jobIds: string[];
  clientName: string;
  clientStatus: string;
  agentName: string;
  assignedTo: string;
  clientId: string;
  reasons: string[];
  jobTypes: string[];
  statuses: string[];
  createdDates: string[];
};

function groupJobs(jobs: SalesJobRow[]): JobGroup[] {
  const order: string[] = [];
  const grouped = new Map<string, SalesJobRow[]>();
  for (const job of jobs) {
    const id = `${job.assignedTo}::${job.clientId}`;
    const list = grouped.get(id);
    if (list) list.push(job);
    else {
      grouped.set(id, [job]);
      order.push(id);
    }
  }
  return order.map((id) => {
    const rows = grouped.get(id) ?? [];
    const first = rows[0];
    const jobTypes: string[] = [];
    const statuses: string[] = [];
    const reasons: string[] = [];
    const createdDates: string[] = [];
    const seenDates = new Set<string>();
    for (const row of rows) {
      if (!jobTypes.includes(row.jobType)) jobTypes.push(row.jobType);
      const status = salesJobStatusKey(row.status);
      if (!statuses.includes(status)) statuses.push(status);
      const reason = row.priorityReason?.trim();
      if (reason && !reasons.includes(reason)) reasons.push(reason);
      const date = row.createdAt?.trim();
      if (!date || seenDates.has(date)) continue;
      seenDates.add(date);
      createdDates.push(date);
    }
    createdDates.sort();
    return {
      id,
      jobs: rows,
      jobIds: rows.map((row) => row.id),
      clientName: first.clientName,
      clientStatus: first.clientStatus,
      agentName: first.agentName,
      assignedTo: first.assignedTo,
      clientId: first.clientId,
      reasons,
      jobTypes,
      statuses,
      createdDates,
    };
  });
}

export default function JobsTable({
  jobs,
  onPendingAction,
  onCompleteAction,
  onEditAction,
  onDeleteAction,
}: {
  jobs: SalesJobRow[];
  onPendingAction?: (ids: string[]) => void;
  onCompleteAction?: (jobs: SalesJobRow[]) => void;
  onEditAction?: (group: { assignedTo: string; clientId: string }) => void;
  onDeleteAction?: (ids: string[]) => void;
}) {
  const t = useTranslations('dashboard.sales.salesJobs');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [selectedTab, setSelectedTab] = useState<(typeof STATUS_TABS)[number]>('all');
  const [typeFilter, setTypeFilter] = useState<(typeof SALES_JOB_TYPES)[number] | 'all'>('all');
  const [showFilterDropdown, setShowFilterDropdown] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [deleteTarget, setDeleteTarget] = useState<{ ids: string[]; name: string; bulk: boolean } | null>(null);
  const deleteDialogRef = useRef<HTMLDivElement>(null);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [indicatorStyle, setIndicatorStyle] = useState({ left: 0, width: 0 });

  const filteredRows = useMemo(() => {
    let filtered = groupJobs(jobs);
    if (selectedTab !== 'all') filtered = filtered.filter((group) => group.statuses.includes(selectedTab));
    if (typeFilter !== 'all') filtered = filtered.filter((group) => group.jobTypes.includes(typeFilter));
    if (search.trim()) {
      const query = search.toLowerCase();
      filtered = filtered.filter(
        (group) =>
          group.clientName.toLowerCase().includes(query) ||
          group.agentName.toLowerCase().includes(query) ||
          group.reasons.some((reason) => reason.toLowerCase().includes(query)),
      );
    }
    return filtered;
  }, [jobs, selectedTab, typeFilter, search]);

  const totalRows = filteredRows.length;
  const totalPages = Math.max(1, Math.ceil(totalRows / ROWS_PER_PAGE));
  const safePage = Math.min(page, totalPages);
  const pagedRows = filteredRows.slice((safePage - 1) * ROWS_PER_PAGE, safePage * ROWS_PER_PAGE);
  const fromRow = totalRows === 0 ? 0 : (safePage - 1) * ROWS_PER_PAGE + 1;
  const toRow = Math.min(safePage * ROWS_PER_PAGE, totalRows);
  const allFilteredIds = useMemo(() => filteredRows.map((row) => row.id), [filteredRows]);
  const allFilteredSelected = allFilteredIds.length > 0 && allFilteredIds.every((id) => selectedIds.includes(id));

  useLayoutEffect(() => {
    const idx = STATUS_TABS.findIndex((tab) => tab === selectedTab);
    const node = tabRefs.current[idx];
    if (node) setIndicatorStyle({ left: node.offsetLeft, width: node.offsetWidth });
  }, [selectedTab]);

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]));
  };

  const handleSelectAll = () => {
    if (allFilteredSelected) {
      setSelectedIds((prev) => prev.filter((id) => !allFilteredIds.includes(id)));
      return;
    }
    setSelectedIds((prev) => {
      const next = [...prev];
      allFilteredIds.forEach((id) => {
        if (!next.includes(id)) next.push(id);
      });
      return next;
    });
  };

  const selectedGroups = useMemo(
    () => groupJobs(jobs).filter((group) => selectedIds.includes(group.id)),
    [jobs, selectedIds],
  );
  const selectedJobIds = selectedGroups.flatMap((group) => group.jobIds);

  const confirmDelete = () => {
    if (!deleteTarget) return;
    onDeleteAction?.(deleteTarget.ids);
    if (deleteTarget.bulk) setSelectedIds([]);
    setDeleteTarget(null);
  };

  useLayoutEffect(() => {
    if (!deleteTarget) return;
    const root = deleteDialogRef.current;
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const getFocusable = () => {
      if (!root) return [];
      return Array.from(
        root.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((el) => !el.hasAttribute('disabled') && el.getAttribute('aria-hidden') !== 'true');
    };
    const frame = window.requestAnimationFrame(() => {
      const focusable = getFocusable();
      (focusable[0] ?? root)?.focus();
    });
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setDeleteTarget(null);
        return;
      }
      if (event.key !== 'Tab' || !root) return;
      const focusable = getFocusable();
      if (focusable.length === 0) {
        event.preventDefault();
        root.focus();
        return;
      }
      if (!root.contains(document.activeElement)) {
        event.preventDefault();
        focusable[0]?.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener('keydown', onKeyDown, true);
      previouslyFocused?.focus();
    };
  }, [deleteTarget]);

  const typeLabel = (jobType: string) => t(`types.${jobType}` as 'types.take_order');
  const statusLabel = (status: string) => t(`status.${salesJobStatusKey(status)}` as 'status.pending');

  return (
    <div className="w-full mx-auto bg-white rounded-lg border border-[#e6e6e6] p-4 mt-3">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-4">
        <div className="relative w-full md:w-auto flex items-center overflow-x-auto">
          <div className="flex w-max bg-gray-100 rounded-lg overflow-hidden relative">
            <div
              className="absolute top-0 h-full transition-all duration-300"
              style={{ left: indicatorStyle.left, width: indicatorStyle.width, background: '#0a61d7', borderRadius: '0.75rem', zIndex: 1 }}
            />
            {STATUS_TABS.map((tab, idx) => (
              <button
                key={tab}
                ref={(el) => {
                  tabRefs.current[idx] = el;
                }}
                onClick={() => {
                  setSelectedTab(tab);
                  setPage(1);
                  setSelectedIds([]);
                }}
                className={`relative z-10 px-4 py-2 font-medium text-[14px] transition-colors duration-200 focus:outline-none whitespace-nowrap ${
                  selectedTab === tab ? 'text-white' : 'text-gray-700 hover:text-[#0a61d7]'
                } ${idx === 0 ? 'rounded-l-lg' : idx === STATUS_TABS.length - 1 ? 'rounded-r-lg' : ''}`}
                style={{ background: 'transparent', boxShadow: 'none' }}
              >
                {tab === 'all' ? t('tabs.all') : statusLabel(tab)}
              </button>
            ))}
          </div>
        </div>

        <div className="flex gap-2 w-full md:w-auto items-center justify-end">
          <div className="relative w-full md:w-64 shrink-0">
            <input
              type="text"
              placeholder={t('table.searchPlaceholder')}
              aria-label={t('table.searchPlaceholder')}
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
              className="w-full pl-10 pr-4 py-2 rounded-lg border border-[#e6e6e6] text-sm text-black focus:outline-none focus:ring-2 focus:ring-[#0a61d7] bg-white"
            />
            <Search className="absolute left-3 top-2 text-gray-400 w-5 h-5" />
          </div>
          <div className="relative">
            <button
              className="flex items-center gap-1 px-3 py-2 rounded-lg border border-[#e6e6e6] bg-white text-gray-700 hover:bg-gray-100 text-sm"
              onClick={() => setShowFilterDropdown(!showFilterDropdown)}
            >
              <Filter className="w-4 h-4" />
              {typeFilter === 'all' ? t('table.allTypes') : typeLabel(typeFilter)}
              <ChevronDown className="w-4 h-4 ml-1 text-gray-500" />
            </button>
            {showFilterDropdown && (
              <div className="absolute right-0 mt-2 w-52 bg-white border border-[#e6e6e6] rounded-lg shadow z-20">
                <button
                  onClick={() => {
                    setTypeFilter('all');
                    setShowFilterDropdown(false);
                    setPage(1);
                  }}
                  className={`w-full text-left px-4 py-2 text-sm first:rounded-t-lg ${typeFilter === 'all' ? 'text-[#0a61d7] font-semibold hover:bg-gray-100' : 'text-gray-700 hover:bg-gray-100'}`}
                >
                  {t('table.allTypes')}
                </button>
                {SALES_JOB_TYPES.map((type) => (
                  <button
                    key={type}
                    onClick={() => {
                      setTypeFilter(type);
                      setShowFilterDropdown(false);
                      setPage(1);
                    }}
                    className={`w-full text-left px-4 py-2 text-sm last:rounded-b-lg ${typeFilter === type ? 'text-[#0a61d7] font-semibold hover:bg-gray-100' : 'text-gray-700 hover:bg-gray-100'}`}
                  >
                    {typeLabel(type)}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {selectedIds.length > 0 && (
        <div className="bg-white border border-[#e6e6e6] border-l-4 border-l-green-500 rounded-lg p-3 md:p-4 mb-2 shadow-sm">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <span className="text-sm font-semibold text-[#0a61d7]">
              {t('table.selected', { count: selectedIds.length })}
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  const openJobs = selectedGroups.flatMap((group) =>
                    group.jobs.filter((job) => (OPEN_SALES_JOB_STATUSES as readonly string[]).includes(job.status)),
                  );
                  if (openJobs.length === 0) return;
                  onCompleteAction?.(openJobs);
                  setSelectedIds([]);
                }}
                className="flex items-center gap-2 px-4 py-2 bg-[#0a61d7] text-white font-semibold text-sm rounded-lg hover:bg-[#084ba6] transition-colors"
              >
                {t('complete')}
              </button>
              <button
                onClick={() => {
                  if (selectedJobIds.length === 0) return;
                  onPendingAction?.(selectedJobIds);
                  setSelectedIds([]);
                }}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white border border-[#e6e6e6] text-black font-medium text-sm hover:bg-gray-100 transition-colors"
              >
                {t('pending')}
              </button>
              <button
                onClick={() => {
                  if (selectedJobIds.length === 0) return;
                  setDeleteTarget({ ids: selectedJobIds, name: '', bulk: true });
                }}
                className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white font-semibold text-sm rounded-lg hover:bg-red-700 transition-colors"
              >
                <Trash className="w-4 h-4" />
                {t('table.delete')}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="overflow-x-auto rounded-lg">
        <table className="w-full">
          <thead>
            <tr className="bg-gray-100 text-gray-500 whitespace-nowrap">
              <th className="text-left py-3 px-4 font-medium text-xs uppercase">
                <button
                  onClick={handleSelectAll}
                  aria-label={t('table.selectAll')}
                  className={`w-4 h-4 border-2 rounded transition-all duration-200 flex items-center justify-center ${
                    allFilteredSelected ? 'bg-green-500 border-green-500' : 'bg-white border-gray-300 hover:border-green-400'
                  }`}
                >
                  {allFilteredSelected && (
                    <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  )}
                </button>
              </th>
              <th className="text-left py-3 px-4 font-medium text-xs uppercase">{t('client')}</th>
              <th className="text-left py-3 px-4 font-medium text-xs uppercase">{t('type')}</th>
              <th className="text-left py-3 px-4 font-medium text-xs uppercase">{t('rep')}</th>
              <th className="text-left py-3 px-4 font-medium text-xs uppercase">{t('table.status')}</th>
              <th className="text-left py-3 px-4 font-medium text-xs uppercase">{t('date')}</th>
              <th className="text-center py-3 px-4 font-medium text-xs uppercase">{t('table.actions')}</th>
            </tr>
          </thead>
          <tbody className="text-xs whitespace-nowrap">
            {filteredRows.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-12 text-center text-gray-500">
                  <div className="flex flex-col items-center gap-2">
                    <Briefcase className="w-12 h-12 text-gray-400" />
                    <p className="text-sm font-medium">{t('table.empty')}</p>
                    <p className="text-xs">{t('table.emptyHint')}</p>
                  </div>
                </td>
              </tr>
            ) : (
              pagedRows.map((row) => {
                return (
                  <tr
                    key={row.id}
                    onClick={(event) => {
                      if ((event.target as HTMLElement).closest('button')) return;
                      toggleSelect(row.id);
                    }}
                    className={`border-b border-[#e6e6e6] transition cursor-pointer ${selectedIds.includes(row.id) ? 'bg-blue-50' : 'hover:bg-gray-50'}`}
                  >
                    <td className="py-4 px-4">
                      <button
                        onClick={(event) => {
                          event.stopPropagation();
                          toggleSelect(row.id);
                        }}
                        aria-label={t('table.selectRow')}
                        className={`w-4 h-4 border-2 rounded transition-all duration-200 flex items-center justify-center ${
                          selectedIds.includes(row.id) ? 'bg-green-500 border-green-500' : 'bg-white border-gray-300 hover:border-green-400'
                        }`}
                      >
                        {selectedIds.includes(row.id) && (
                          <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                          </svg>
                        )}
                      </button>
                    </td>
                    <td className="py-4 px-4">
                      <div className="font-medium text-gray-900">{row.clientName}</div>
                      <div className="text-gray-500 max-w-[280px] truncate" title={row.reasons.join('. ')}>
                        {row.reasons.join('. ') || row.clientStatus}
                      </div>
                    </td>
                    <td className="py-4 px-4 whitespace-nowrap">
                      <div className="flex flex-nowrap items-center gap-1">
                        {row.jobTypes.slice(0, 3).map((jobType) => (
                          <span
                            key={jobType}
                            className={`inline-flex shrink-0 px-2 py-1 text-xs font-semibold rounded-full ${TYPE_BADGE[jobType] || TYPE_BADGE.prospect_new_outlet}`}
                          >
                            {typeLabel(jobType)}
                          </span>
                        ))}
                        {row.jobTypes.length > 3 && (
                          <span
                            className="shrink-0 text-xs font-medium text-gray-500"
                            title={row.jobTypes.slice(3).map((jobType) => typeLabel(jobType)).join(', ')}
                          >
                            {t('table.moreTypes')}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-4 px-4 text-gray-700">{row.agentName}</td>
                    <td className="py-4 px-4 whitespace-normal">
                      <div className="flex flex-wrap gap-1">
                        {row.statuses.map((status) => (
                          <span
                            key={status}
                            className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${STATUS_BADGE[status] || STATUS_BADGE.skipped}`}
                          >
                            {statusLabel(status)}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="py-4 px-4 text-gray-700 whitespace-normal">
                      {row.createdDates.length > 0 ? (
                        <div className="flex flex-col gap-0.5">
                          {row.createdDates.map((date) => (
                            <span key={date}>{date}</span>
                          ))}
                        </div>
                      ) : null}
                    </td>
                    <td className="py-4 px-4">
                      <div className="flex items-center gap-2 justify-center">
                        <button
                          onClick={(event) => {
                            event.stopPropagation();
                            onEditAction?.({ assignedTo: row.assignedTo, clientId: row.clientId });
                          }}
                          className="inline-flex items-center justify-center rounded-lg p-2 hover:bg-gray-100 transition-colors"
                          title={t('table.edit')}
                        >
                          <Edit className="w-4 h-4 text-gray-500" />
                        </button>
                        <button
                          onClick={(event) => {
                            event.stopPropagation();
                            setDeleteTarget({ ids: row.jobIds, name: row.clientName || row.agentName, bulk: false });
                          }}
                          className="inline-flex items-center justify-center rounded-lg p-2 hover:bg-red-100 transition-colors"
                          title={t('table.remove')}
                        >
                          <Trash2 className="w-4 h-4 text-red-600" />
                        </button>
                      </div>
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
          {t('table.showing', { from: fromRow, to: toRow, total: totalRows })}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setPage(Math.max(1, safePage - 1))}
            disabled={safePage === 1}
            aria-label={t('table.previousPage')}
            className="px-3 py-1 text-sm text-gray-500 hover:text-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <div className="flex items-center gap-1">
            {Array.from({ length: totalPages }, (_, index) => index + 1).map((pageNum) => (
              <button
                key={pageNum}
                onClick={() => setPage(pageNum)}
                className={`px-3 py-2 text-sm rounded-lg ${safePage === pageNum ? 'bg-[#0a61d7] text-white' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'}`}
              >
                {pageNum}
              </button>
            ))}
          </div>
          <button
            onClick={() => setPage(Math.min(totalPages, safePage + 1))}
            disabled={safePage === totalPages}
            aria-label={t('table.nextPage')}
            className="px-3 py-1 text-sm text-gray-500 hover:text-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {deleteTarget && (
        <div
          ref={deleteDialogRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby="jobs-delete-title"
          tabIndex={-1}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
        >
          <div className="bg-white rounded-lg border border-[#e6e6e6] p-4 w-full max-w-sm">
            <h2 id="jobs-delete-title" className="text-lg font-bold mb-2 text-red-500">
              {deleteTarget.bulk || deleteTarget.ids.length > 1 ? t('table.deleteBulkTitle') : t('table.deleteTitle')}
            </h2>
            <p className="mb-4 text-gray-500">
              {deleteTarget.bulk
                ? t('table.deleteBulkConfirm', { count: deleteTarget.ids.length })
                : t('table.deleteConfirm', { name: deleteTarget.name })}
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                className="px-4 py-2 rounded-lg bg-gray-200 text-gray-700 hover:bg-gray-300 transition-colors focus:outline-none focus:ring-2 focus:ring-gray-500"
                onClick={() => setDeleteTarget(null)}
              >
                {t('table.cancel')}
              </button>
              <button
                type="button"
                className="px-4 py-2 rounded-lg bg-red-600 text-white hover:bg-red-700 transition-colors focus:outline-none focus:ring-2 focus:ring-red-500"
                onClick={confirmDelete}
              >
                {t('table.delete')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
