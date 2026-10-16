'use client';

import React, { useMemo, useRef, useState, useLayoutEffect } from 'react';
import { Search, Filter, ChevronDown, ChevronLeft, ChevronRight, Edit, Trash2, Trash, Workflow, PlayCircle, PauseCircle } from 'lucide-react';
import { format } from 'date-fns';
import { useAutomationTranslations } from '@/hooks/useAutomationTranslations';
import { AutomationWorkflowRow, WorkflowStatus, WorkflowType, WORKFLOW_TYPES } from './automationTypes';

const statusTabs: { label: string; status: WorkflowStatus | 'all' }[] = [
  { label: 'All', status: 'all' },
  { label: 'Active', status: 'active' },
  { label: 'Paused', status: 'paused' },
  { label: 'Draft', status: 'draft' },
];

const TYPE_BADGE: Record<WorkflowType, string> = {
  product_offers: 'bg-blue-100 text-blue-800',
  lead_management: 'bg-purple-100 text-purple-800',
  order_logistics: 'bg-amber-100 text-amber-800',
  sales: 'bg-emerald-100 text-emerald-800',
};

const STATUS_BADGE: Record<WorkflowStatus, string> = {
  active: 'bg-green-100 text-green-800',
  paused: 'bg-yellow-100 text-yellow-800',
  draft: 'bg-gray-100 text-gray-700',
};

const ROWS_PER_PAGE = 5;

export default function AutomationTable({
  workflows,
  onDeleteAction,
  onBulkDeleteAction,
  onStatusChangeAction,
  onEditAction,
}: {
  workflows: AutomationWorkflowRow[];
  onDeleteAction?: (id: string) => void;
  onBulkDeleteAction?: (ids: string[]) => void;
  onStatusChangeAction?: (ids: string[], status: WorkflowStatus) => void;
  onEditAction?: (id: string) => void;
}) {
  const {
    tTable,
    tFilters,
    tShared,
    tBulk,
    translateStatusTab,
    translateStatus,
    translateType,
  } = useAutomationTranslations();

  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [selectedTab, setSelectedTab] = useState('All');
  const [typeFilter, setTypeFilter] = useState<WorkflowType | 'all'>('all');
  const [showFilterDropdown, setShowFilterDropdown] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [workflowToDelete, setWorkflowToDelete] = useState<AutomationWorkflowRow | null>(null);
  const [isBulkDelete, setIsBulkDelete] = useState(false);

  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [indicatorStyle, setIndicatorStyle] = useState({ left: 0, width: 0 });

  const filteredRows = useMemo(() => {
    let filtered = workflows;

    if (selectedTab !== 'All') {
      const tabStatus = statusTabs.find((t) => t.label === selectedTab)?.status;
      if (tabStatus && tabStatus !== 'all') {
        filtered = filtered.filter((w) => w.status === tabStatus);
      }
    }

    if (typeFilter !== 'all') {
      filtered = filtered.filter((w) => w.type === typeFilter);
    }

    if (search.trim()) {
      const q = search.toLowerCase();
      filtered = filtered.filter(
        (w) =>
          w.name.toLowerCase().includes(q) ||
          w.description.toLowerCase().includes(q) ||
          w.trigger.toLowerCase().includes(q),
      );
    }

    return filtered;
  }, [workflows, selectedTab, typeFilter, search]);

  const totalRows = filteredRows.length;
  const totalPages = Math.max(1, Math.ceil(totalRows / ROWS_PER_PAGE));
  const safePage = Math.min(page, totalPages);
  const pagedRows = filteredRows.slice((safePage - 1) * ROWS_PER_PAGE, safePage * ROWS_PER_PAGE);
  const fromRow = totalRows === 0 ? 0 : (safePage - 1) * ROWS_PER_PAGE + 1;
  const toRow = Math.min(safePage * ROWS_PER_PAGE, totalRows);

  const allFilteredIds = useMemo(() => filteredRows.map((r) => r.id), [filteredRows]);
  const allFilteredSelected =
    allFilteredIds.length > 0 && allFilteredIds.every((id) => selectedIds.includes(id));

  useLayoutEffect(() => {
    const idx = statusTabs.findIndex((tab) => tab.label === selectedTab);
    const node = tabRefs.current[idx];
    if (node) {
      setIndicatorStyle({ left: node.offsetLeft, width: node.offsetWidth });
    }
  }, [selectedTab]);

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const handleSelectAll = () => {
    if (allFilteredSelected) {
      setSelectedIds((prev) => prev.filter((id) => !allFilteredIds.includes(id)));
    } else {
      setSelectedIds((prev) => {
        const next = [...prev];
        allFilteredIds.forEach((id) => {
          if (!next.includes(id)) next.push(id);
        });
        return next;
      });
    }
  };

  const handleRowClick = (id: string, event: React.MouseEvent) => {
    if ((event.target as HTMLElement).closest('button')) return;
    toggleSelect(id);
  };

  const handleBulkStatusChange = (status: WorkflowStatus) => {
    if (selectedIds.length === 0) return;
    onStatusChangeAction?.(selectedIds, status);
    setSelectedIds([]);
  };

  const handleBulkRemove = () => {
    setIsBulkDelete(true);
    setWorkflowToDelete(null);
  };

  const handleConfirmDelete = () => {
    if (isBulkDelete) {
      if (onBulkDeleteAction) onBulkDeleteAction(selectedIds);
      else selectedIds.forEach((id) => onDeleteAction?.(id));
      setSelectedIds([]);
      setIsBulkDelete(false);
    } else if (workflowToDelete) {
      onDeleteAction?.(workflowToDelete.id);
      setWorkflowToDelete(null);
    }
  };

  const closeDeleteModal = () => {
    setWorkflowToDelete(null);
    setIsBulkDelete(false);
  };

  const typeFilterLabel = typeFilter === 'all' ? tFilters('allTypes') : translateType(typeFilter);
  const showDeleteModal = isBulkDelete || workflowToDelete != null;

  return (
    <div className="mx-auto mt-3 w-full min-w-0 rounded-lg border border-[#e6e6e6] bg-white p-4">
      {/* Status Tabs - compact to label width; scroll horizontally when AI panel narrows the card */}
      <div className="mb-4 w-full min-w-0">
        <div className="w-full overflow-x-auto">
          <div className="relative inline-flex w-max overflow-hidden rounded-lg bg-gray-100">
            <div
              className="absolute top-0 h-full transition-all duration-300"
              style={{
                left: indicatorStyle.left,
                width: indicatorStyle.width,
                background: '#0a61d7',
                borderRadius: '0.75rem',
                zIndex: 1,
              }}
            />
            {statusTabs.map((tab, idx) => (
              <button
                key={tab.label}
                ref={(el) => {
                  tabRefs.current[idx] = el;
                }}
                onClick={() => {
                  setSelectedTab(tab.label);
                  setPage(1);
                  setSelectedIds([]);
                }}
                className={`relative z-10 shrink-0 whitespace-nowrap px-4 py-2 text-[14px] font-medium transition-colors duration-200 focus:outline-none ${
                  selectedTab === tab.label ? 'text-white' : 'text-gray-700 hover:text-[#0a61d7]'
                }`}
                style={{ background: 'transparent', boxShadow: 'none' }}
              >
                {translateStatusTab(tab.label)}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Search full width; filters stack below */}
      <div className="mb-4 flex w-full min-w-0 flex-col gap-3">
        <div className="relative w-full">
          <input
            type="text"
            placeholder={tTable('searchPlaceholder')}
            aria-label={tTable('searchPlaceholder')}
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
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
              onClick={() => setShowFilterDropdown(!showFilterDropdown)}
            >
              <span className="inline-flex items-center gap-1">
                <Filter className="h-4 w-4" />
                {typeFilterLabel}
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
                  className={`w-full px-4 py-2 text-left text-sm first:rounded-t-lg ${
                    typeFilter === 'all' ? 'font-semibold text-[#0a61d7] hover:bg-gray-100' : 'text-gray-700 hover:bg-gray-100'
                  }`}
                >
                  {tFilters('allTypes')}
                </button>
                {WORKFLOW_TYPES.map((type) => (
                  <button
                    key={type}
                    onClick={() => {
                      setTypeFilter(type);
                      setShowFilterDropdown(false);
                      setPage(1);
                    }}
                    className={`w-full px-4 py-2 text-left text-sm last:rounded-b-lg ${
                      typeFilter === type ? 'font-semibold text-[#0a61d7] hover:bg-gray-100' : 'text-gray-700 hover:bg-gray-100'
                    }`}
                  >
                    {translateType(type)}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Bulk Action Bar */}
      {selectedIds.length > 0 && (
        <div className="bg-white border border-[#e6e6e6] border-l-4 border-l-green-500 rounded-lg p-3 md:p-4 mb-2 shadow-sm">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <span className="text-sm font-semibold text-[#0a61d7]">
              {selectedIds.length}{' '}
              {selectedIds.length === 1 ? tBulk('selectedSingular') : tBulk('selectedPlural')}{' '}
              {tBulk('selected')}
            </span>
            <div className="flex items-center gap-2 md:gap-4">
              <span className="hidden md:block text-gray-600 text-xs font-semibold">{tBulk('hint')}</span>
              <div className="flex gap-2">
                <button
                  onClick={() => handleBulkStatusChange('active')}
                  className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white font-semibold text-sm rounded-lg hover:bg-green-700 transition-colors"
                >
                  <PlayCircle className="w-4 h-4" />
                  {tBulk('activate')}
                </button>
                <button
                  onClick={() => handleBulkStatusChange('paused')}
                  className="flex items-center gap-2 px-4 py-2 bg-yellow-600 text-white font-semibold text-sm rounded-lg hover:bg-yellow-700 transition-colors"
                >
                  <PauseCircle className="w-4 h-4" />
                  {tBulk('pause')}
                </button>
                <button
                  onClick={handleBulkRemove}
                  className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white font-semibold text-sm rounded-lg hover:bg-red-700 transition-colors"
                >
                  <Trash className="w-4 h-4" />
                  {tBulk('remove')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto rounded-lg">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-100 text-gray-500 whitespace-nowrap">
                <th className="text-left py-3 px-4 font-medium text-xs uppercase">
                  <button
                    onClick={handleSelectAll}
                    aria-label={tBulk('selectAll')}
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
                <th className="text-left py-3 px-4 font-medium text-xs uppercase">{tTable('columns.name')}</th>
                <th className="text-left py-3 px-4 font-medium text-xs uppercase">{tTable('columns.type')}</th>
                <th className="text-left py-3 px-4 font-medium text-xs uppercase">{tTable('columns.trigger')}</th>
                <th className="text-left py-3 px-4 font-medium text-xs uppercase">{tTable('columns.status')}</th>
                <th className="text-left py-3 px-4 font-medium text-xs uppercase">{tTable('columns.lastRun')}</th>
                <th className="text-center py-3 px-4 font-medium text-xs uppercase">{tShared('actions')}</th>
              </tr>
            </thead>
            <tbody className="text-xs whitespace-nowrap">
              {filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-gray-500">
                    <div className="flex flex-col items-center gap-2">
                      <Workflow className="w-12 h-12 text-gray-400" />
                      <p className="text-sm font-medium">{tTable('empty')}</p>
                      <p className="text-xs">{tTable('emptyHint')}</p>
                    </div>
                  </td>
                </tr>
              ) : (
              pagedRows.map((row) => (
                <tr
                  key={row.id}
                  onClick={(e) => handleRowClick(row.id, e)}
                  className={`border-b border-[#e6e6e6] transition cursor-pointer ${
                    selectedIds.includes(row.id) ? 'bg-blue-50' : 'hover:bg-gray-50'
                  }`}
                >
                  <td className="py-4 px-4">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleSelect(row.id);
                      }}
                      aria-label={tBulk('selectRow')}
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
                    <div className="font-medium text-gray-900">{row.name}</div>
                    <div className="text-gray-500 max-w-[280px] truncate" title={row.description}>
                      {row.description}
                    </div>
                  </td>
                  <td className="py-4 px-4">
                    <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${TYPE_BADGE[row.type]}`}>
                      {translateType(row.type)}
                    </span>
                  </td>
                  <td className="py-4 px-4 text-gray-700">{row.trigger}</td>
                  <td className="py-4 px-4">
                    <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${STATUS_BADGE[row.status]}`}>
                      {translateStatus(row.status)}
                    </span>
                  </td>
                  <td className="py-4 px-4 text-gray-700">
                    {row.lastRun ? format(new Date(row.lastRun), 'MMM dd, yyyy') : tTable('never')}
                  </td>
                  <td className="py-4 px-4">
                    <div className="flex items-center gap-2 justify-center">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onEditAction?.(row.id);
                        }}
                        className="inline-flex items-center justify-center rounded-lg p-2 hover:bg-gray-100 transition-colors focus:outline-none"
                        title={tTable('editWorkflow')}
                      >
                        <Edit className="w-4 h-4 text-gray-500" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setIsBulkDelete(false);
                          setWorkflowToDelete(row);
                        }}
                        className="inline-flex items-center justify-center rounded-lg p-2 hover:bg-red-100 transition-colors focus:outline-none"
                        title={tTable('deleteWorkflow')}
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

      {/* Pagination */}
      <div className="flex items-center justify-between mt-4">
        <div className="text-sm text-gray-500">
          {tShared('pagination.showing', { from: fromRow, to: toRow, total: totalRows })}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setPage(Math.max(1, safePage - 1))}
            disabled={safePage === 1}
            aria-label={tShared('previousPage')}
            className="px-3 py-1 text-sm text-gray-500 hover:text-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <div className="flex items-center gap-1">
            {Array.from({ length: totalPages }, (_, i) => i + 1).map((pageNum) => (
              <button
                key={pageNum}
                onClick={() => setPage(pageNum)}
                className={`px-3 py-2 text-sm rounded-lg ${
                  safePage === pageNum ? 'bg-[#0a61d7] text-white' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
                }`}
              >
                {pageNum}
              </button>
            ))}
          </div>
          <button
            onClick={() => setPage(Math.min(totalPages, safePage + 1))}
            disabled={safePage === totalPages}
            aria-label={tShared('nextPage')}
            className="px-3 py-1 text-sm text-gray-500 hover:text-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Delete Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-lg border border-[#e6e6e6] p-4 w-full max-w-sm">
            <h2 className="text-lg font-bold mb-2 text-red-500">
              {isBulkDelete ? tTable('deleteBulkTitle') : tTable('deleteTitle')}
            </h2>
            <p className="mb-4 text-gray-500">
              {isBulkDelete
                ? tTable('deleteBulkConfirm', { count: selectedIds.length })
                : tTable('deleteConfirm', { name: workflowToDelete?.name ?? tTable('thisWorkflow') })}
            </p>
            <div className="flex justify-end gap-2">
              <button
                className="px-4 py-2 rounded-lg bg-gray-200 text-gray-700 hover:bg-gray-300 transition-colors focus:outline-none focus:ring-2 focus:ring-gray-500"
                onClick={closeDeleteModal}
              >
                {tShared('cancel')}
              </button>
              <button
                className="px-4 py-2 rounded-lg bg-red-600 text-white hover:bg-red-700 transition-colors focus:outline-none focus:ring-2 focus:ring-red-500"
                onClick={handleConfirmDelete}
              >
                {tTable('delete')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
