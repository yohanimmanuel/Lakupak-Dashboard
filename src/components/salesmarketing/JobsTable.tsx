'use client';

import React, { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Briefcase, Check, ChevronDown, ChevronLeft, ChevronRight, Filter, Search, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import {
  OPEN_SALES_JOB_STATUSES,
  SALES_JOB_STATUSES,
  SALES_JOB_TYPES,
  SalesJobRow,
  SalesJobStatus,
} from './salesJobTypes';

const STATUS_TABS = ['all', ...SALES_JOB_STATUSES] as const;
const ROWS_PER_PAGE = 5;

const TYPE_BADGE: Record<string, string> = {
  take_order: 'bg-blue-100 text-blue-800',
  collect_payment: 'bg-emerald-100 text-emerald-800',
  promote_product: 'bg-purple-100 text-purple-800',
  stock_check: 'bg-amber-100 text-amber-800',
  prospect_new_outlet: 'bg-gray-100 text-gray-700',
};

const STATUS_BADGE: Record<string, string> = {
  suggested: 'bg-amber-100 text-amber-700',
  approved: 'bg-blue-100 text-blue-800',
  dispatched: 'bg-purple-100 text-purple-800',
  in_progress: 'bg-yellow-100 text-yellow-800',
  completed: 'bg-green-100 text-green-800',
  skipped: 'bg-gray-100 text-gray-700',
};

export default function JobsTable({
  jobs,
  onApproveAction,
  onRejectAction,
  onCompleteAction,
}: {
  jobs: SalesJobRow[];
  onApproveAction?: (ids: string[]) => void;
  onRejectAction?: (ids: string[]) => void;
  onCompleteAction?: (job: SalesJobRow) => void;
}) {
  const t = useTranslations('dashboard.marketing.salesJobs');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [selectedTab, setSelectedTab] = useState<(typeof STATUS_TABS)[number]>('all');
  const [typeFilter, setTypeFilter] = useState<(typeof SALES_JOB_TYPES)[number] | 'all'>('all');
  const [showFilterDropdown, setShowFilterDropdown] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [indicatorStyle, setIndicatorStyle] = useState({ left: 0, width: 0 });

  const filteredRows = useMemo(() => {
    let filtered = jobs;
    if (selectedTab !== 'all') filtered = filtered.filter((job) => job.status === selectedTab);
    if (typeFilter !== 'all') filtered = filtered.filter((job) => job.jobType === typeFilter);
    if (search.trim()) {
      const query = search.toLowerCase();
      filtered = filtered.filter(
        (job) =>
          job.clientName.toLowerCase().includes(query) ||
          job.agentName.toLowerCase().includes(query) ||
          (job.priorityReason || '').toLowerCase().includes(query),
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

  const suggestedSelection = selectedIds.filter((id) => jobs.find((job) => job.id === id)?.status === 'suggested');

  const typeLabel = (jobType: string) => t(`types.${jobType}` as 'types.take_order');
  const statusLabel = (status: string) => t(`status.${status}` as 'status.suggested');

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
                  if (suggestedSelection.length === 0) return;
                  onApproveAction?.(suggestedSelection);
                  setSelectedIds([]);
                }}
                className="flex items-center gap-2 px-4 py-2 bg-[#0a61d7] text-white font-semibold text-sm rounded-lg hover:bg-[#084ba6] transition-colors"
              >
                <Check className="w-4 h-4" />
                {t('approve')}
              </button>
              <button
                onClick={() => {
                  if (suggestedSelection.length === 0) return;
                  onRejectAction?.(suggestedSelection);
                  setSelectedIds([]);
                }}
                className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white font-semibold text-sm rounded-lg hover:bg-red-700 transition-colors"
              >
                <X className="w-4 h-4" />
                {t('reject')}
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
                const canReview = row.status === 'suggested';
                const canComplete = (OPEN_SALES_JOB_STATUSES as readonly string[]).includes(row.status);
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
                      <div className="text-gray-500 max-w-[280px] truncate" title={row.priorityReason || ''}>
                        {row.priorityReason || row.clientStatus}
                      </div>
                    </td>
                    <td className="py-4 px-4">
                      <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${TYPE_BADGE[row.jobType] || TYPE_BADGE.prospect_new_outlet}`}>
                        {typeLabel(row.jobType)}
                      </span>
                    </td>
                    <td className="py-4 px-4 text-gray-700">{row.agentName}</td>
                    <td className="py-4 px-4">
                      <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${STATUS_BADGE[row.status] || STATUS_BADGE.skipped}`}>
                        {statusLabel(row.status as SalesJobStatus)}
                      </span>
                    </td>
                    <td className="py-4 px-4 text-gray-700 whitespace-normal">
                      {row.schedules && row.schedules.length > 0 ? (
                        <div className="flex flex-col gap-0.5">
                          {row.schedules.map((schedule) => (
                            <span key={`${schedule.date}-${schedule.reminderTime}`}>
                              {schedule.date} · {schedule.reminderTime}
                            </span>
                          ))}
                        </div>
                      ) : (
                        row.scheduledDate
                      )}
                    </td>
                    <td className="py-4 px-4">
                      <div className="flex items-center gap-2 justify-center">
                        {canReview && (
                          <>
                            <button
                              onClick={(event) => {
                                event.stopPropagation();
                                onApproveAction?.([row.id]);
                              }}
                              className="inline-flex items-center justify-center rounded-lg p-2 hover:bg-gray-100 transition-colors"
                              title={t('approve')}
                            >
                              <Check className="w-4 h-4 text-[#0a61d7]" />
                            </button>
                            <button
                              onClick={(event) => {
                                event.stopPropagation();
                                onRejectAction?.([row.id]);
                              }}
                              className="inline-flex items-center justify-center rounded-lg p-2 hover:bg-red-100 transition-colors"
                              title={t('reject')}
                            >
                              <X className="w-4 h-4 text-red-600" />
                            </button>
                          </>
                        )}
                        {canComplete && (
                          <button
                            onClick={(event) => {
                              event.stopPropagation();
                              onCompleteAction?.(row);
                            }}
                            className="px-3 py-1.5 rounded-lg border border-[#e6e6e6] text-xs font-medium text-[#0a61d7] hover:bg-gray-100"
                          >
                            {t('complete')}
                          </button>
                        )}
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
    </div>
  );
}
