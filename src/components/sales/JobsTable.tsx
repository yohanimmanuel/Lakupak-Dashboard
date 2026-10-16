'use client';

import React, { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Briefcase, ChevronDown, ChevronLeft, ChevronRight, Edit, Filter, Search, Trash, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { SALES_JOB_TYPES, SalesJobRow, salesJobStatusKey } from './salesJobTypes';

const STATUS_TABS = ['all', 'pending', 'complete'] as const;
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

type JobGroup = {
  id: string;
  jobs: SalesJobRow[];
  jobIds: string[];
  clientName: string;
  clientStatus: string;
  agentName: string;
  assignedTo: string;
  clientId: string;
  clients: { name: string; status: string }[];
  reasons: string[];
  jobTypes: string[];
  statuses: string[];
  updatedAt: string;
};

function groupJobs(jobs: SalesJobRow[]): JobGroup[] {
  const order: string[] = [];
  const grouped = new Map<string, SalesJobRow[]>();
  for (const job of jobs) {
    const id = job.listGroupId?.trim() || `${job.assignedTo}::${job.clientId}`;
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
    const clients: { name: string; status: string }[] = [];
    let updatedAt = '';
    for (const row of rows) {
      if (!jobTypes.includes(row.jobType)) jobTypes.push(row.jobType);
      const status = salesJobStatusKey(row.status);
      if (!statuses.includes(status)) statuses.push(status);
      const reason = row.priorityReason?.trim();
      if (reason && !reasons.includes(reason)) reasons.push(reason);
      const linked = row.linkedClients?.filter((client) => client.name.trim()) ?? [];
      const rowClients = linked.length ? linked : row.clientName?.trim() ? [{ name: row.clientName.trim(), status: row.clientStatus }] : [];
      for (const client of rowClients) {
        if (!clients.some((existing) => existing.name === client.name)) clients.push(client);
      }
      const saved = row.updatedAt?.trim() || row.createdAt?.trim() || '';
      if (saved && (!updatedAt || saved > updatedAt)) updatedAt = saved;
    }
    return {
      id,
      jobs: rows,
      jobIds: rows.map((row) => row.id),
      clientName: clients.map((client) => client.name).join(', ') || first.clientName,
      clientStatus: first.clientStatus,
      clients,
      agentName: first.agentName,
      assignedTo: first.assignedTo,
      clientId: first.clientId,
      reasons,
      jobTypes,
      statuses,
      updatedAt,
    };
  });
}

export default function JobsTable({
  jobs,
  onEditAction,
  onDeleteAction,
}: {
  jobs: SalesJobRow[];
  onEditAction?: (group: { assignedTo: string; clientId: string; listGroupId: string }) => void;
  onDeleteAction?: (ids: string[]) => void;
}) {
  const t = useTranslations('dashboard.sales.salesJobs');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [selectedTab, setSelectedTab] = useState<(typeof STATUS_TABS)[number]>('all');
  const [typeFilter, setTypeFilter] = useState<(typeof SALES_JOB_TYPES)[number] | 'all'>('all');
  const [repFilter, setRepFilter] = useState('all');
  const [showFilterDropdown, setShowFilterDropdown] = useState(false);
  const [showRepDropdown, setShowRepDropdown] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [deleteTarget, setDeleteTarget] = useState<{ ids: string[]; name: string; bulk: boolean } | null>(null);
  const deleteDialogRef = useRef<HTMLDivElement>(null);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [indicatorStyle, setIndicatorStyle] = useState({ left: 0, width: 0 });

  const reps = useMemo(() => {
    const seen = new Map<string, string>();
    for (const job of jobs) {
      if (!job.assignedTo || seen.has(job.assignedTo)) continue;
      seen.set(job.assignedTo, job.agentName || job.assignedTo);
    }
    return Array.from(seen, ([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [jobs]);

  const filteredRows = useMemo(() => {
    let filtered = groupJobs(jobs);
    if (selectedTab === 'complete') {
      filtered = filtered.filter(
        (group) => group.jobs.length > 0 && group.jobs.every((job) => salesJobStatusKey(job.status) === 'completed'),
      );
    } else if (selectedTab === 'pending') {
      filtered = filtered.filter(
        (group) => group.jobs.some((job) => salesJobStatusKey(job.status) !== 'completed'),
      );
    }
    if (typeFilter !== 'all') filtered = filtered.filter((group) => group.jobTypes.includes(typeFilter));
    if (repFilter !== 'all') filtered = filtered.filter((group) => group.assignedTo === repFilter);
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
  }, [jobs, selectedTab, typeFilter, repFilter, search]);

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
  const repLabel = reps.find((rep) => rep.id === repFilter)?.name || t('table.allReps');

  return (
    <div className="mx-auto mt-3 w-full min-w-0 rounded-lg border border-[#e6e6e6] bg-white p-4">
      <div className="mb-4 w-full min-w-0">
        <div className="w-full overflow-x-auto rounded-lg">
          <div className="relative inline-flex w-max min-w-full bg-gray-100">
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
                className={`relative z-10 shrink-0 whitespace-nowrap px-4 py-2 font-medium text-[14px] transition-colors duration-200 focus:outline-none ${
                  selectedTab === tab ? 'text-white' : 'text-gray-700 hover:text-[#0a61d7]'
                } ${idx === 0 ? 'rounded-l-lg' : idx === STATUS_TABS.length - 1 ? 'rounded-r-lg' : ''}`}
                style={{ background: 'transparent', boxShadow: 'none' }}
              >
                {t(`tabs.${tab}`)}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="mb-4 flex w-full min-w-0 flex-col gap-3">
        <div className="relative w-full">
          <input
            type="text"
            placeholder={t('table.searchPlaceholder')}
            aria-label={t('table.searchPlaceholder')}
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
            className="w-full rounded-lg border border-[#e6e6e6] bg-white py-2 pl-10 pr-4 text-sm text-black focus:outline-none focus:ring-2 focus:ring-[#0a61d7]"
          />
          <Search className="absolute left-3 top-2 h-5 w-5 text-gray-400" />
        </div>
        <div className="flex w-full min-w-0 flex-col gap-2 @4xl/main:flex-row @4xl/main:flex-wrap @4xl/main:items-center">
          <div className="relative w-full @4xl/main:w-auto">
            <button
              className="flex w-full items-center justify-between gap-1 rounded-lg border border-[#e6e6e6] bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 @4xl/main:w-auto @4xl/main:justify-start"
              onClick={() => {
                setShowRepDropdown(false);
                setShowFilterDropdown((open) => !open);
              }}
            >
              <span className="inline-flex items-center gap-1">
                <Filter className="h-4 w-4" />
                {typeFilter === 'all' ? t('table.allTypes') : typeLabel(typeFilter)}
              </span>
              <ChevronDown className="ml-1 h-4 w-4 text-gray-500" />
            </button>
            {showFilterDropdown && (
              <div className="absolute left-0 right-0 z-20 mt-2 rounded-lg border border-[#e6e6e6] bg-white shadow @4xl/main:left-auto @4xl/main:right-0 @4xl/main:w-52">
                <button
                  onClick={() => {
                    setTypeFilter('all');
                    setShowFilterDropdown(false);
                    setPage(1);
                  }}
                  className={`w-full px-4 py-2 text-left text-sm first:rounded-t-lg ${typeFilter === 'all' ? 'font-semibold text-[#0a61d7] hover:bg-gray-100' : 'text-gray-700 hover:bg-gray-100'}`}
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
                    className={`w-full px-4 py-2 text-left text-sm last:rounded-b-lg ${typeFilter === type ? 'font-semibold text-[#0a61d7] hover:bg-gray-100' : 'text-gray-700 hover:bg-gray-100'}`}
                  >
                    {typeLabel(type)}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="relative w-full @4xl/main:w-auto">
            <button
              type="button"
              className="flex w-full items-center justify-between gap-1 whitespace-nowrap rounded-lg border border-[#e6e6e6] bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 @4xl/main:w-auto @4xl/main:justify-start"
              onClick={() => {
                setShowFilterDropdown(false);
                setShowRepDropdown((open) => !open);
              }}
            >
              <span>{repLabel}</span>
              <ChevronDown className="ml-1 h-4 w-4 text-gray-500" />
            </button>
            {showRepDropdown && (
              <div className="absolute left-0 right-0 z-20 mt-2 max-h-64 overflow-y-auto rounded-lg border border-[#e6e6e6] bg-white shadow @4xl/main:left-auto @4xl/main:right-0 @4xl/main:w-52">
                <button
                  type="button"
                  onClick={() => {
                    setRepFilter('all');
                    setShowRepDropdown(false);
                    setPage(1);
                  }}
                  className={`w-full px-4 py-2 text-left text-sm first:rounded-t-lg ${repFilter === 'all' ? 'bg-gray-50 font-semibold text-[#0a61d7]' : 'text-gray-700 hover:bg-gray-100'}`}
                >
                  {t('table.allReps')}
                </button>
                {reps.map((rep) => (
                  <button
                    key={rep.id}
                    type="button"
                    onClick={() => {
                      setRepFilter(rep.id);
                      setShowRepDropdown(false);
                      setPage(1);
                    }}
                    className={`w-full px-4 py-2 text-left text-sm last:rounded-b-lg ${repFilter === rep.id ? 'bg-gray-50 font-semibold text-[#0a61d7]' : 'text-gray-700 hover:bg-gray-100'}`}
                  >
                    {rep.name}
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
              <th className="text-left py-3 px-4 font-medium text-xs uppercase">{t('rep')}</th>
              <th className="text-left py-3 px-4 font-medium text-xs uppercase">{t('type')}</th>
              <th className="text-left py-3 px-4 font-medium text-xs uppercase">{t('client')}</th>
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
                const completedCount = row.jobs.filter((job) => salesJobStatusKey(job.status) === 'completed').length;
                const totalJobs = row.jobs.length;
                const allComplete = totalJobs > 0 && completedCount === totalJobs;
                const clients = row.clients.length ? row.clients : [{ name: row.clientName, status: row.clientStatus }];
                const visibleClients = clients.slice(0, 2);
                const hiddenClients = clients.slice(2);
                const reason = row.reasons.join('. ');
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
                    <td className="py-4 px-4 text-gray-700">{row.agentName}</td>
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
                    <td className="py-4 px-4">
                      <div className="flex items-start gap-3 min-w-0 max-w-[280px]">
                        {visibleClients.map((client) => {
                          const subtitle = clients.length === 1 ? reason || client.status : client.status;
                          return (
                            <div key={client.name} className="min-w-0">
                              <div className="font-medium text-gray-900 truncate" title={client.name}>
                                {client.name}
                              </div>
                              <div className="text-gray-500 truncate" title={subtitle}>
                                {subtitle}
                              </div>
                            </div>
                          );
                        })}
                        {hiddenClients.length > 0 && (
                          <span
                            className="shrink-0 self-center text-xs font-medium text-gray-500"
                            title={hiddenClients.map((client) => client.name).join(', ')}
                          >
                            {t('table.moreClients', { count: hiddenClients.length })}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-4 px-4 whitespace-normal">
                      <span
                        className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                          allComplete ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'
                        }`}
                        title={t('table.statusCount', { done: completedCount, total: totalJobs })}
                      >
                        {completedCount}/{totalJobs}
                      </span>
                    </td>
                    <td className="py-4 px-4 text-gray-700 whitespace-normal">{row.updatedAt}</td>
                    <td className="py-4 px-4">
                      <div className="flex items-center gap-2 justify-center">
                        <button
                          onClick={(event) => {
                            event.stopPropagation();
                            onEditAction?.({
                              assignedTo: row.assignedTo,
                              clientId: row.clientId,
                              listGroupId: row.jobs[0]?.listGroupId?.trim() || '',
                            });
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
