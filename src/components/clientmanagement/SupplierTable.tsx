'use client';
import React, { useState, useRef, useLayoutEffect, useCallback, useEffect } from "react";
import { useRouter } from 'next/navigation';
import { Search, Edit, Filter, Calendar, ChevronDown, ChevronLeft, ChevronRight, Trash, Trash2, Users, AlertCircle, Loader2 } from "lucide-react";
import * as XLSX from 'xlsx';
import { useUserStore } from '@/store/userStore';
import { format } from 'date-fns';
import { Supplier, SupplierTableRow, SupplyDetail } from '@/types/client';
import { formatCurrency, getDefaultCurrency } from '@/utils/currencyUtils';
import { parseNumberByCurrency } from '@/config/currencyConfig';
import { fetchGraphQL } from '@/lib/graphqlClient';
import { useClientsTranslations } from '@/hooks/useClientsTranslations';

// Use suppliers prop or state, not suppliersMock
// Add explicit types for all map/filter parameters

const statusTabs = [
  { label: "All" },
  { label: "Active" },
  { label: "Inactive" },
  { label: "Blocked" },
];

interface SupplierTableProps {
  suppliers?: Supplier[];
  setSuppliers?: (fn: (prev: Supplier[]) => Supplier[]) => void;
  onSelectSupplier?: (supplier: Supplier) => void;
  onExportXLSX?: (wb: XLSX.WorkBook, filename: string) => void;
  profileToTableRow: (supplier: Supplier) => SupplierTableRow;
  onRefresh?: () => void;
}

export default function SupplierTable({ suppliers = [], setSuppliers, onSelectSupplier, onExportXLSX, profileToTableRow, onRefresh }: SupplierTableProps) {
  const user = useUserStore(state => state.user);
  const { tShared, tSuppliers, translateStatus, translateStatusTab, translateFilter, translatePeriod } = useClientsTranslations();
  
  // Get user currency for display
  const userCurrency = user?.currency || getDefaultCurrency();
  
  const tableRows = suppliers.map(profileToTableRow);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [selectedTab, setSelectedTab] = useState("All");
  const uniqueBusinessTypes = [
    "All Business Types",
    ...Array.from(new Set(tableRows.map((s: SupplierTableRow) => s.businessType)))
  ];
  const [filter, setFilter] = useState(uniqueBusinessTypes[0]);
  const today = new Date();
  const thisMonthKey = format(today, 'yyyy-MM');
  const lastMonthDate = new Date(today.getFullYear(), today.getMonth() - 1, 1);
  const lastMonthKey = format(lastMonthDate, 'yyyy-MM');
  const periodOptions = ["All Months", "This Month", "Last Month"];
  const [period, setPeriod] = useState(periodOptions[0]);
  const [showFilterDropdown, setShowFilterDropdown] = useState(false);
  const [showPeriodDropdown, setShowPeriodDropdown] = useState(false);
  const router = useRouter();
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [indicatorStyle, setIndicatorStyle] = useState({ left: 0, width: 0 });
  const rowsPerPage = 8;
  
  // Sort suppliers by most recent first (newest created/updated at top)
  const sortedSuppliers = [...tableRows].sort((a, b) => {
    const dateA = new Date(a.createdAt || a.lastUpdated || 0);
    const dateB = new Date(b.createdAt || b.lastUpdated || 0);
    return dateB.getTime() - dateA.getTime(); // Most recent first
  });
  
  let filteredSuppliers = sortedSuppliers;
  if (selectedTab !== "All") filteredSuppliers = filteredSuppliers.filter((s: SupplierTableRow) => s.status === selectedTab);
  if (filter !== "All Business Types") filteredSuppliers = filteredSuppliers.filter((s: SupplierTableRow) => s.businessType === filter);
  if (search) filteredSuppliers = filteredSuppliers.filter((s: SupplierTableRow) => String(s.name).toLowerCase().includes(search.toLowerCase()));
  if (period !== "All Months") {
    filteredSuppliers = filteredSuppliers.filter((s: SupplierTableRow) => {
      if (!s.createdAt) return false;
      const createdDate = new Date(s.createdAt);
      const currentMonth = new Date();
      const lastMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1);
      
      if (period === 'This Month') {
        return createdDate.getMonth() === currentMonth.getMonth() && 
               createdDate.getFullYear() === currentMonth.getFullYear();
      } else if (period === 'Last Month') {
        return createdDate.getMonth() === lastMonth.getMonth() && 
               createdDate.getFullYear() === lastMonth.getFullYear();
      }
      return true;
    });
  }
  const totalRows = filteredSuppliers.length;
  const totalPages = Math.max(1, Math.ceil(totalRows / rowsPerPage));
  const pagedSuppliers = filteredSuppliers.slice((page - 1) * rowsPerPage, page * rowsPerPage);
  const fromRow = totalRows === 0 ? 0 : (page - 1) * rowsPerPage + 1;
  const toRow = Math.min(page * rowsPerPage, totalRows);
  

  useLayoutEffect(() => {
    const idx = statusTabs.findIndex(tab => tab.label === selectedTab);
    const node = tabRefs.current[idx];
    if (node) {
      setIndicatorStyle({
        left: node.offsetLeft,
        width: node.offsetWidth,
      });
    }
  }, [selectedTab]);
  const statusBadge = (status: string) => {
    if (status === "Active") return "bg-green-100 text-green-500";
    if (status === "Inactive") return "bg-gray-100 text-gray-500";
    if (status === "Blocked") return "bg-red-100 text-red-500";
    return "bg-gray-100 text-gray-500";
  };
  const handleView = (supplier: SupplierTableRow) => {
    router.push(`/clients/suppliers/details/${supplier.supplierId}`);
  };
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [supplierToDelete, setSupplierToDelete] = useState<SupplierTableRow | null>(null);
  const [isBulkDelete, setIsBulkDelete] = useState(false);
  const [selectedSuppliers, setSelectedSuppliers] = useState<string[]>([]);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [showStatusDropdown, setShowStatusDropdown] = useState(false);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  const [statusUpdateError, setStatusUpdateError] = useState('');
  const statusDropdownRef = useRef<HTMLDivElement>(null);

  const handleDeleteClick = (supplier: SupplierTableRow) => {
    setSupplierToDelete(supplier);
    setShowDeleteModal(true);
  };

  const handleDeleteConfirm = useCallback(async () => {
    if (!user?.id) return;

    setIsDeleting(true);
    setDeleteError('');

    try {
      const DELETE_SUPPLIER_MUTATION = `
        mutation DeleteSupplier($userId: Int!, $id: String!) {
          deleteSupplier(userId: $userId, id: $id) {
            success
            deleted {
              id
              supplierId
            }
          }
        }
      `;

      if (isBulkDelete) {
        const deletePromises = selectedSuppliers.map(async (supplierId) => {
          const supplier = filteredSuppliers.find((s) => String(s.id) === supplierId);
          if (supplier) {
            await fetchGraphQL(DELETE_SUPPLIER_MUTATION, {
              userId: user.id,
              id: supplier.supplierId,
            });
            return supplier.supplierId;
          }
        });

        await Promise.all(deletePromises);
        setSelectedSuppliers([]);
      } else {
        if (!supplierToDelete) return;
        await fetchGraphQL(DELETE_SUPPLIER_MUTATION, {
          userId: user.id,
          id: supplierToDelete.supplierId,
        });
        setSupplierToDelete(null);
      }

      if (page > 1 && pagedSuppliers.length <= 1) {
        setPage(1);
      }

      setShowDeleteModal(false);
      setIsBulkDelete(false);

      if (onRefresh) {
        onRefresh();
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to delete supplier(s)';
      setDeleteError(errorMessage);
    } finally {
      setIsDeleting(false);
    }
  }, [user?.id, isBulkDelete, selectedSuppliers, filteredSuppliers, supplierToDelete, page, pagedSuppliers.length, onRefresh]);

  const handleDeleteCancel = useCallback(() => {
    setShowDeleteModal(false);
    setSupplierToDelete(null);
    setIsBulkDelete(false);
    setDeleteError('');
  }, []);

  const handleSupplierSelect = (supplierId: string) => {
    setSelectedSuppliers(prev => 
      prev.includes(supplierId) 
        ? prev.filter(id => id !== supplierId)
        : [...prev, supplierId]
    );
  };

  const handleRowClick = (supplierId: string, event: React.MouseEvent) => {
    // Don't trigger row selection if clicking on action buttons or checkbox
    if ((event.target as HTMLElement).closest('button') || (event.target as HTMLElement).closest('th')) {
      return;
    }
    handleSupplierSelect(supplierId);
  };

  // Check if all filtered suppliers are selected (not just current page)
  const allFilteredSupplierIds = React.useMemo(() => 
    filteredSuppliers.map(supplier => String(supplier.id)), 
    [filteredSuppliers]
  );
  const allFilteredSelected = React.useMemo(() => 
    allFilteredSupplierIds.length > 0 && allFilteredSupplierIds.every(id => selectedSuppliers.includes(id)),
    [allFilteredSupplierIds, selectedSuppliers]
  );

  const handleSelectAll = () => {
    if (allFilteredSelected) {
      // Deselect all filtered suppliers
      setSelectedSuppliers(prev => prev.filter(id => !allFilteredSupplierIds.includes(id)));
    } else {
      // Select all filtered suppliers (add to existing selection)
      setSelectedSuppliers(prev => {
        const newSelection = [...prev];
        allFilteredSupplierIds.forEach(id => {
          if (!newSelection.includes(id)) {
            newSelection.push(id);
          }
        });
        return newSelection;
      });
    }
  };

  const handleBulkRemove = () => {
    setIsBulkDelete(true);
    setShowDeleteModal(true);
  };

  const BULK_STATUS_OPTIONS = ['Active', 'Inactive', 'Blocked'] as const;

  const handleBulkStatusUpdate = useCallback(
    async (status: (typeof BULK_STATUS_OPTIONS)[number]) => {
      if (!user?.id || selectedSuppliers.length === 0) return;

      setIsUpdatingStatus(true);
      setStatusUpdateError('');
      setShowStatusDropdown(false);

      const UPDATE_SUPPLIER_STATUS_MUTATION = `
        mutation UpdateSupplier($userId: Int!, $supplierId: String!, $status: String!) {
          updateSupplier(userId: $userId, supplierId: $supplierId, status: $status) {
            id
            supplierId
            status
          }
        }
      `;

      try {
        const targets = selectedSuppliers
          .map((id) => tableRows.find((s) => String(s.id) === id))
          .filter((s): s is SupplierTableRow => Boolean(s));

        const results = await Promise.allSettled(
          targets.map((supplier) =>
            fetchGraphQL(UPDATE_SUPPLIER_STATUS_MUTATION, {
              userId: user.id,
              supplierId: supplier.supplierId,
              status,
            }),
          ),
        );
        const updatedIds = new Set(
          results.flatMap((result, index) =>
            result.status === 'fulfilled' ? [String(targets[index].id)] : [],
          ),
        );

        setSuppliers?.((prev) =>
          prev.map((supplier) =>
            updatedIds.has(String(supplier.id))
              ? { ...supplier, status }
              : supplier,
          ),
        );
        setSelectedSuppliers([]);

        if (onRefresh) onRefresh();
      } catch (error: unknown) {
        const errorMessage =
          error instanceof Error ? error.message : tShared('selection.bulkStatusFailed');
        setStatusUpdateError(errorMessage);
      } finally {
        setIsUpdatingStatus(false);
      }
    },
    [user?.id, selectedSuppliers, filteredSuppliers, setSuppliers, onRefresh, tShared],
  );

  useEffect(() => {
    if (!showStatusDropdown) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!statusDropdownRef.current?.contains(event.target as Node)) {
        setShowStatusDropdown(false);
      }
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [showStatusDropdown]);

  const handleExportXLSX = () => {
    const headers = ['ID', 'Name', 'Contact Person', 'Business Type', 'Location', 'Total Purchases', 'No. SKU Supplied', 'Created At', 'Status'];
    const rows = filteredSuppliers.map((s: SupplierTableRow) => [
      s.supplierId,
      s.name,
      s.businessType,
      s.address,
      s.totalSupplies,
      s.totalPurchases,
      s.createdAt,
      s.status
    ]);
    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Suppliers');
    if (onExportXLSX) onExportXLSX(wb, 'suppliers.xlsx');
  };
  return (
    <div className="mx-auto mt-3 w-full min-w-0 rounded-lg border border-[#e6e6e6] bg-white p-4">
      
      {/* Status Tabs - full width, scroll horizontally when compressed */}
      <div className="mb-4 w-full min-w-0">
        <div className="w-full overflow-x-auto rounded-lg">
          <div className="relative inline-flex w-max min-w-full bg-gray-100">
            {/* Sliding Indicator */}
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
                ref={el => { tabRefs.current[idx] = el; }}
                onClick={() => {
                  setSelectedTab(tab.label);
                  setSelectedSuppliers([]); // Reset selection when switching tabs
                }}
                className={`relative z-10 shrink-0 whitespace-nowrap px-6 py-2 font-medium text-[14px] transition-colors duration-200 focus:outline-none ${
                  selectedTab === tab.label
                    ? 'text-white'
                    : 'text-gray-700 hover:text-[#0a61d7]'
                } ${
                  idx === 0 ? 'rounded-l-lg' : idx === statusTabs.length - 1 ? 'rounded-r-lg' : ''
                }`}
                style={{
                  background: 'transparent',
                  boxShadow: 'none',
                }}
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
            placeholder={tShared('selection.searchSuppliers')}
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full rounded-lg border border-[#e6e6e6] bg-white py-2 pl-10 pr-4 text-sm text-black focus:outline-none focus:ring-2 focus:ring-[#0a61d7]"
            aria-label={tShared('selection.searchSuppliers')}
          />
          <Search className="absolute left-3 top-2 h-5 w-5 text-gray-400" />
        </div>
        <div className="flex w-full min-w-0 flex-col gap-2 @4xl/main:flex-row @4xl/main:flex-wrap @4xl/main:items-center">
          {/* Filter Dropdown */}
          <div className="relative w-full @4xl/main:w-auto">
            <button
              className="flex w-full items-center justify-between gap-1 rounded-lg border border-[#e6e6e6] bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 @4xl/main:w-auto @4xl/main:justify-start"
              onClick={() => {
                setShowFilterDropdown(v => !v);
                setShowPeriodDropdown(false);
              }}
            >
              <span className="inline-flex items-center gap-1">
                <Filter className="h-4 w-4" />
                {translateFilter(filter)}
              </span>
              <ChevronDown className="ml-1 h-4 w-4 text-gray-500" />
            </button>
            {showFilterDropdown && (
              <div className="absolute left-0 right-0 z-20 mt-2 rounded-lg border border-[#e6e6e6] bg-white shadow @4xl/main:right-auto @4xl/main:w-48">
                {uniqueBusinessTypes.map(opt => (
                  <button
                    key={opt}
                    onClick={() => { setFilter(opt); setShowFilterDropdown(false); }}
                    className={`w-full px-4 py-2 text-left text-sm hover:bg-gray-100 ${filter === opt ? 'font-bold text-[#0a61d7]' : 'text-gray-700'}`}
                  >
                    {translateFilter(opt)}
                  </button>
                ))}
              </div>
            )}
          </div>
          {/* Period Dropdown */}
          <div className="relative w-full @4xl/main:w-auto">
            <button
              className="flex w-full items-center justify-between gap-1 rounded-lg border border-[#e6e6e6] bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 @4xl/main:w-auto @4xl/main:justify-start"
              onClick={() => {
                setShowPeriodDropdown(v => !v);
                setShowFilterDropdown(false);
              }}
            >
              <span className="inline-flex items-center gap-1">
                <Calendar className="h-4 w-4" />
                {translatePeriod(period)}
              </span>
              <ChevronDown className="ml-1 h-4 w-4 text-gray-500" />
            </button>
            {showPeriodDropdown && (
              <div className="absolute left-0 right-0 z-20 mt-2 rounded-lg border border-[#e6e6e6] bg-white shadow @4xl/main:right-auto @4xl/main:w-40">
                {periodOptions.map(opt => (
                  <button
                    key={opt}
                    onClick={() => { setPeriod(opt); setShowPeriodDropdown(false); }}
                    className={`w-full px-4 py-2 text-left text-sm hover:bg-gray-100 ${period === opt ? 'font-bold text-[#0a61d7]' : 'text-gray-700'}`}
                  >
                    {translatePeriod(opt)}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Bulk Action Bar */}
      {selectedSuppliers.length > 0 && (
        <div
          ref={statusDropdownRef}
          className="bg-white border border-[#e6e6e6] border-l-4 border-l-green-500 rounded-lg p-3 md:p-4 mb-2 shadow-sm"
        >
          {/* Mobile Layout */}
          <div className="md:hidden space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-green-700">
                {selectedSuppliers.length === 1
                  ? tShared('selection.supplierSelected', { count: selectedSuppliers.length })
                  : tShared('selection.suppliersSelected', { count: selectedSuppliers.length })}
              </span>
            </div>
            <div className="text-gray-600 text-xs font-semibold leading-relaxed">
              {selectedSuppliers.length === 1
                ? tShared('selection.selectSupplierActions')
                : tShared('selection.selectSuppliersActions')}
            </div>
            {statusUpdateError && (
              <p className="text-xs font-medium text-red-600">{statusUpdateError}</p>
            )}
            <div className="relative">
              <button
                type="button"
                disabled={isUpdatingStatus}
                onClick={() => setShowStatusDropdown((open) => !open)}
                className="mb-2 flex w-full items-center justify-center gap-2 rounded-lg border border-[#e6e6e6] bg-white px-4 py-2 text-sm font-semibold text-black hover:bg-gray-50 disabled:opacity-50"
                aria-haspopup="listbox"
                aria-expanded={showStatusDropdown}
              >
                {isUpdatingStatus ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <ChevronDown className="h-4 w-4" />
                )}
                {isUpdatingStatus
                  ? tShared('selection.updatingStatus')
                  : tShared('selection.updateStatus')}
              </button>
              {showStatusDropdown && !isUpdatingStatus && (
                <div className="absolute bottom-full left-0 right-0 z-30 mb-2 overflow-hidden rounded-lg border border-[#e6e6e6] bg-white shadow-lg">
                  {BULK_STATUS_OPTIONS.map((status) => (
                    <button
                      key={status}
                      type="button"
                      onClick={() => void handleBulkStatusUpdate(status)}
                      className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm text-gray-700 hover:bg-gray-50"
                    >
                      <span
                        className={`inline-block h-2 w-2 rounded-full ${
                          status === 'Active'
                            ? 'bg-green-500'
                            : status === 'Blocked'
                              ? 'bg-red-500'
                              : 'bg-gray-400'
                        }`}
                      />
                      {translateStatus(status)}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button
              onClick={handleBulkRemove}
              disabled={isUpdatingStatus}
              className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-red-600 text-white font-semibold text-sm rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50"
            >
              <Trash className="w-4 h-4" />
              {selectedSuppliers.length === 1 ? tShared('selection.removeSupplier') : tShared('selection.removeSuppliers')}
            </button>
          </div>
          
          {/* Desktop Layout */}
          <div className="hidden md:flex items-center justify-between gap-4">
            <div className="min-w-0">
              <span className="text-sm font-semibold text-green-700">
                {selectedSuppliers.length === 1
                  ? tShared('selection.supplierSelected', { count: selectedSuppliers.length })
                  : tShared('selection.suppliersSelected', { count: selectedSuppliers.length })}
              </span>
              <p className="mt-0.5 text-xs font-semibold text-gray-600">
                {selectedSuppliers.length === 1
                  ? tShared('selection.selectSupplierActions')
                  : tShared('selection.selectSuppliersActions')}
              </p>
              {statusUpdateError && (
                <p className="mt-1 text-xs font-medium text-red-600">{statusUpdateError}</p>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <div className="relative">
                <button
                  type="button"
                  disabled={isUpdatingStatus}
                  onClick={() => setShowStatusDropdown((open) => !open)}
                  className="inline-flex items-center gap-2 rounded-lg border border-[#e6e6e6] bg-white px-4 py-2 text-sm font-semibold text-black hover:bg-gray-50 disabled:opacity-50"
                  aria-haspopup="listbox"
                  aria-expanded={showStatusDropdown}
                >
                  {isUpdatingStatus ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <ChevronDown className="h-4 w-4" />
                  )}
                  {isUpdatingStatus
                    ? tShared('selection.updatingStatus')
                    : tShared('selection.updateStatus')}
                </button>
                {showStatusDropdown && !isUpdatingStatus && (
                  <div className="absolute right-0 z-30 mt-2 w-44 overflow-hidden rounded-lg border border-[#e6e6e6] bg-white shadow-lg">
                    {BULK_STATUS_OPTIONS.map((status) => (
                      <button
                        key={status}
                        type="button"
                        onClick={() => void handleBulkStatusUpdate(status)}
                        className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm text-gray-700 hover:bg-gray-50"
                      >
                        <span
                          className={`inline-block h-2 w-2 rounded-full ${
                            status === 'Active'
                              ? 'bg-green-500'
                              : status === 'Blocked'
                                ? 'bg-red-500'
                                : 'bg-gray-400'
                          }`}
                        />
                        {translateStatus(status)}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <button
                onClick={handleBulkRemove}
                disabled={isUpdatingStatus}
                className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white font-semibold text-sm rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50"
              >
                <Trash className="w-4 h-4" />
                {selectedSuppliers.length === 1 ? tShared('selection.removeSupplier') : tShared('selection.removeSuppliers')}
              </button>
            </div>
          </div>
        </div>
      )}

      
      {/* Missing Data Indicator - count across all filtered suppliers, not only this page */}
      {(() => {
        const filteredSupplierIds = filteredSuppliers.map((s) => s.supplierId);
        const filteredOriginalSuppliers = suppliers.filter((s) =>
          filteredSupplierIds.includes(s.supplierId),
        );

        const missingDataCount = filteredOriginalSuppliers.filter((supplier) => {
          // Check all profile fields for missing data
          const basicFields = [
            !String(supplier.name).trim(),
            !String(supplier.address).trim(),
            !String(supplier.businessType).trim(),
            !String(supplier.contact).trim(),
            !String(supplier.email).trim(),
            !String(supplier.phone).trim()
          ];
          
          // Check if any basic fields are missing
          const hasMissingBasicFields = basicFields.some(field => field);
          
          // Check logistics fields (preferredDays, lastDelivery, deliverySuccess)
          let hasMissingLogistics = false;
          try {
            if (supplier.logistics) {
              const logistics = JSON.parse(supplier.logistics);
              hasMissingLogistics = !logistics?.preferredDays?.trim() || 
                                   !logistics?.lastDelivery?.trim() || 
                                   !logistics?.deliverySuccess?.trim();
            } else {
              hasMissingLogistics = true; // No logistics data at all
            }
          } catch {
            hasMissingLogistics = true; // Invalid logistics data
          }
          
          // Check supplies data - must have actual supply items with content
          let hasMissingSupplies = false;
          try {
            if (supplier.supplies) {
              const supplies = JSON.parse(supplier.supplies);
              if (!Array.isArray(supplies) || supplies.length === 0) {
                hasMissingSupplies = true; // No supplies data
              } else {
                // Check if supplies have meaningful content
                const hasValidSupplies = supplies.some((supply: SupplyDetail) => 
                  supply.sku && String(supply.sku).trim() &&
                  supply.product && String(supply.product).trim() &&
                  supply.totalSupplied && String(supply.totalSupplied).trim() &&
                  supply.totalValue && String(supply.totalValue).trim()
                );
                hasMissingSupplies = !hasValidSupplies;
              }
            } else {
              hasMissingSupplies = true; // No supplies data at all
            }
          } catch {
            hasMissingSupplies = true; // Invalid supplies data
          }
          
          return hasMissingBasicFields || hasMissingLogistics || hasMissingSupplies;
        }).length;
        
        return missingDataCount > 0 ? (
          <div className="mb-3 p-3 bg-amber-50 border border-amber-200 rounded-lg">
            <p className="text-amber-700 text-sm flex items-start gap-2">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>
                <strong>{tShared('missing.dataCompletion')}</strong>{' '}
                {tShared('missing.suppliersIncomplete', { count: missingDataCount })}
              </span>
            </p>
          </div>
        ) : null;
      })()}

      <div className="overflow-x-auto hidden md:block rounded-lg">
          <table className="min-w-full text-sm text-left whitespace-nowrap text-xs">
            <thead className="bg-gray-100 text-gray-500 whitespace-nowrap">
              <tr>
                <th className="py-3 px-4 font-medium uppercase">
                  <button
                    onClick={handleSelectAll}
                    className={`w-4 h-4 border-2 rounded transition-all duration-200 flex items-center justify-center ${
                      allFilteredSelected
                        ? 'bg-green-500 border-green-500'
                        : 'bg-white border-gray-300 hover:border-green-400'
                    }`}
                  >
                    {allFilteredSelected && (
                      <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    )}
                  </button>
                </th>
                <th className="py-3 px-4 font-medium uppercase">{tShared('columns.id')}</th>
                <th className="py-3 px-4 font-medium uppercase">{tShared('columns.name')}</th>
                <th className="py-3 px-4 font-medium uppercase">{tShared('columns.businessType')}</th>
                <th className="py-3 px-4 font-medium uppercase">{tShared('columns.location')}</th>
                <th className="py-3 px-4 font-medium uppercase">{tShared('columns.totalSupplies')}</th>
                <th className="py-3 px-4 font-medium uppercase">{tShared('columns.totalPurchases')}</th>
                <th className="py-3 px-4 font-medium uppercase">{tShared('columns.createdAt')}</th>
                <th className="py-3 px-4 font-medium uppercase">{tShared('columns.status')}</th>
                <th className="py-3 px-4 font-medium uppercase text-center">{tShared('actions')}</th>
              </tr>
            </thead>
            <tbody className="bg-white">
              {filteredSuppliers.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-12 text-center text-gray-500">
                    <div className="flex flex-col items-center gap-2">
                      <Users className="w-12 h-12 text-gray-400" />
                      <p className="text-sm">{tSuppliers('empty')}</p>
                    </div>
                  </td>
                </tr>
              ) : (
              pagedSuppliers.map((supplier: SupplierTableRow) => {
              // Get the original supplier data to check for missing data
              const originalSupplier = suppliers.find(s => s.supplierId === supplier.supplierId);
              
              const hasIncompleteData = originalSupplier ? (() => {
                // Check all profile fields for missing data (excluding notes and pictures)
                const basicFields = [
                  !String(originalSupplier.name).trim(),
                  !String(originalSupplier.address).trim(),
                  !String(originalSupplier.businessType).trim(),
                  !String(originalSupplier.contact).trim(),
                  !String(originalSupplier.email).trim(),
                  !String(originalSupplier.phone).trim()
                ];
                
                // Check if any basic fields are missing
                const hasMissingBasicFields = basicFields.some(field => field);
                
                // Check logistics fields (preferredDays, lastDelivery, deliverySuccess)
                let hasMissingLogistics = false;
                try {
                  if (originalSupplier.logistics) {
                    const logistics = JSON.parse(originalSupplier.logistics);
                    hasMissingLogistics = !logistics?.preferredDays?.trim() || 
                                         !logistics?.lastDelivery?.trim() || 
                                         !logistics?.deliverySuccess?.trim();
                  } else {
                    hasMissingLogistics = true; // No logistics data at all
                  }
                } catch {
                  hasMissingLogistics = true; // Invalid logistics data
                }
                
                // Check supplies data - must have actual supply items with content
                let hasMissingSupplies = false;
                try {
                  if (originalSupplier.supplies) {
                    const supplies = JSON.parse(originalSupplier.supplies);
                    if (!Array.isArray(supplies) || supplies.length === 0) {
                      hasMissingSupplies = true; // No supplies data
                    } else {
                      // Check if supplies have meaningful content
                      const hasValidSupplies = supplies.some((supply: SupplyDetail) => 
                        supply.sku && String(supply.sku).trim() &&
                        supply.product && String(supply.product).trim() &&
                        supply.totalSupplied && String(supply.totalSupplied).trim() &&
                        supply.totalValue && String(supply.totalValue).trim()
                      );
                      hasMissingSupplies = !hasValidSupplies;
                    }
                  } else {
                    hasMissingSupplies = true; // No supplies data at all
                  }
                } catch {
                  hasMissingSupplies = true; // Invalid supplies data
                }
                
                return hasMissingBasicFields || hasMissingLogistics || hasMissingSupplies;
              })() : false;
              
              return (
                <tr 
                  key={String(supplier.id)} 
                  className={`border-b transition cursor-pointer ${
                    selectedSuppliers.includes(String(supplier.id)) 
                      ? 'bg-blue-50' 
                      : hasIncompleteData
                      ? 'bg-amber-50' // Highlight incomplete rows with amber background
                      : 'hover:bg-gray-50'
                  }`} 
                  onClick={(e) => handleRowClick(String(supplier.id), e)}
                >
                <td className="py-3 px-4 text-xs">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleSupplierSelect(String(supplier.id));
                    }}
                    className={`w-4 h-4 border-2 rounded transition-all duration-200 flex items-center justify-center ${
                      selectedSuppliers.includes(String(supplier.id))
                        ? 'bg-green-500 border-green-500'
                        : 'bg-white border-gray-300 hover:border-green-400'
                    }`}
                  >
                    {selectedSuppliers.includes(String(supplier.id)) && (
                      <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    )}
                  </button>
                </td>
                <td className="max-w-30 py-3 px-4 font-medium text-black truncate">{String(supplier.supplierId)}</td>
                                    <td className="max-w-30 py-3 px-4 font-medium text-black truncate">
                      {String(supplier.name).trim() ? (
                        String(supplier.name)
                      ) : (
                        <span className="text-red-600 font-bold">{tShared('missing.name')}</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-black">
                      {String(supplier.businessType).trim() ? (
                        String(supplier.businessType)
                      ) : (
                        <span className="text-red-600 font-bold">{tShared('missing.businessType')}</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-black max-w-40 truncate">
                      {String(supplier.address).trim() ? (
                        String(supplier.address)
                      ) : (
                        <span className="text-red-600 font-bold">{tShared('missing.address')}</span>
                      )}
                    </td>
                <td className="py-3 px-4 text-black font-medium">{String(supplier.totalSupplies)}</td>
                <td className="py-3 px-4 text-[#0a61d7] font-semibold">{formatCurrency(parseNumberByCurrency(String(supplier.totalPurchases), userCurrency), userCurrency)}</td>
                <td className="py-3 px-4 text-black">{String(supplier.createdAt).split('T')[0]}</td>
                <td className="py-3 px-4">
                  <span className={`inline-block px-2 py-1 rounded-full text-xs font-bold ${statusBadge(supplier.status)}`}>{translateStatus(String(supplier.status))}</span>
                </td>
                <td className="py-3 px-4 text-center">
                  <div className="flex items-center justify-center gap-2">
                    <button
                      className="inline-flex items-center justify-center rounded-lg p-2 hover:bg-gray-100 transition-colors focus:outline-none"
                      onClick={() => handleView(supplier)}
                    >
                      <Edit className="w-4 h-4 text-gray-500" />
                    </button>
                    <button
                      className="inline-flex items-center justify-center rounded-lg p-2 hover:bg-red-100 transition-colors focus:outline-none"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteClick(supplier);
                      }}
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
      {/* Mobile Cards */}
      <div className="md:hidden">
        {filteredSuppliers.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <Users className="w-12 h-12 mx-auto mb-4 text-gray-400" />
            <p className="text-sm">{tSuppliers('empty')}</p>
          </div>
        ) : (
          <>
            {/* Select All for Mobile View */}
            <div className="flex items-center gap-2 mb-3">
              <button
                onClick={handleSelectAll}
                className={`w-4 h-4 border-2 rounded transition-all duration-200 flex items-center justify-center ${
                  allFilteredSelected
                    ? 'bg-green-500 border-green-500'
                    : 'bg-white border-gray-300 hover:border-green-400'
                }`}
              >
                {allFilteredSelected && (
                  <svg className="w-2.5 h-2.5 text-white" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                )}
              </button>
              <span className="text-sm font-medium text-gray-700">
                {tShared('selection.selectAllCountSuppliers', { count: filteredSuppliers.length })}
              </span>
            </div>
            
            <div className="flex flex-col gap-4">
              {pagedSuppliers.map(supplier => {
            // Get the original supplier data to check for missing data
            const originalSupplier = suppliers.find(s => s.supplierId === supplier.supplierId);
            
            const hasIncompleteData = originalSupplier ? (() => {
              // Check all profile fields for missing data (excluding notes and pictures)
              const basicFields = [
                !String(originalSupplier.name).trim(),
                !String(originalSupplier.address).trim(),
                !String(originalSupplier.businessType).trim(),
                !String(originalSupplier.contact).trim(),
                !String(originalSupplier.email).trim(),
                !String(originalSupplier.phone).trim()
              ];
              
              // Check if any basic fields are missing
              const hasMissingBasicFields = basicFields.some(field => field);
              
              // Check logistics fields (preferredDays, lastDelivery, deliverySuccess)
              let hasMissingLogistics = false;
              try {
                if (originalSupplier.logistics) {
                  const logistics = JSON.parse(originalSupplier.logistics);
                  hasMissingLogistics = !logistics?.preferredDays?.trim() || 
                                       !logistics?.lastDelivery?.trim() || 
                                       !logistics?.deliverySuccess?.trim();
                } else {
                  hasMissingLogistics = true; // No logistics data at all
                }
              } catch {
                hasMissingLogistics = true; // Invalid logistics data
              }
              
              // Check supplies data - must have actual supply items with content
              let hasMissingSupplies = false;
              try {
                if (originalSupplier.supplies) {
                  const supplies = JSON.parse(originalSupplier.supplies);
                  if (!Array.isArray(supplies) || supplies.length === 0) {
                    hasMissingSupplies = true; // No supplies data
                  } else {
                    // Check if supplies have meaningful content
                    const hasValidSupplies = supplies.some((supply: SupplyDetail) => 
                      supply.sku && String(supply.sku).trim() &&
                      supply.product && String(supply.product).trim() &&
                      supply.totalSupplied && String(supply.totalSupplied).trim() &&
                      supply.totalValue && String(supply.totalValue).trim()
                    );
                    hasMissingSupplies = !hasValidSupplies;
                  }
                } else {
                  hasMissingSupplies = true; // No supplies data at all
                }
              } catch {
                hasMissingSupplies = true; // Invalid supplies data
              }
              
              return hasMissingBasicFields || hasMissingLogistics || hasMissingSupplies;
            })() : false;
            
            return (
              <div 
                key={String(supplier.id)} 
                className={`rounded-lg border border-[#e6e6e6] p-4 flex flex-col gap-2 relative cursor-pointer transition ${
                  selectedSuppliers.includes(String(supplier.id)) 
                    ? 'bg-blue-50' 
                    : hasIncompleteData
                    ? 'bg-amber-50' // Highlight incomplete cards with amber background
                    : 'bg-white hover:bg-gray-50'
                }`}
                onClick={() => handleSupplierSelect(String(supplier.id))}
              >
              {/* Checkbox - Top Right Corner */}
              <div className="absolute top-3 right-3 z-10">
                              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleSupplierSelect(String(supplier.id));
                }}
                className={`w-4 h-4 border-2 rounded transition-all duration-200 flex items-center justify-center ${
                  selectedSuppliers.includes(String(supplier.id))
                    ? 'bg-green-500 border-green-500'
                    : 'bg-white border-gray-300 hover:border-green-400'
                }`}
              >
                  {selectedSuppliers.includes(String(supplier.id)) && (
                    <svg className="w-2.5 h-2.5 text-white" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  )}
                </button>
              </div>
            <div className="text-xs text-gray-500">{tShared('mobileLabels.id')} <span className="text-black font-medium">{supplier.supplierId}</span></div>
            <div className="flex items-center justify-between">
                              <span className="font-bold text-[#0a61d7]">
                  {String(supplier.name).trim() ? (
                    supplier.name
                  ) : (
                    <span className="text-red-600 font-bold">{tShared('missing.name')}</span>
                  )}
                </span>
              <div className="flex items-center gap-2">
                <button
                  className="inline-flex items-center justify-center rounded-lg p-2 hover:bg-gray-100 transition-colors focus:outline-none"
                  onClick={() => handleView(supplier)}
                >
                  <Edit className="w-4 h-4 text-gray-500" />
                </button>
                <button
                  className="inline-flex items-center justify-center rounded-lg p-2 hover:bg-red-100 transition-colors focus:outline-none"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeleteClick(supplier);
                  }}
                >
                  <Trash2 className="w-4 h-4 text-red-600" />
                </button>
              </div>
            </div>
                            <div className="text-xs text-gray-500">{tShared('mobileLabels.businessType')} <span className="text-black font-medium">
                  {String(supplier.businessType).trim() ? (
                    supplier.businessType
                  ) : (
                    <span className="text-red-600 font-bold">{tShared('missing.businessType')}</span>
                  )}
                </span></div>
                          <div className="text-xs text-gray-500">{tShared('columns.location')}: <span className="text-black font-medium">
                {String(supplier.address).trim() ? (
                  supplier.address
                ) : (
                  <span className="text-red-600 font-bold">{tShared('missing.address')}</span>
                )}
              </span></div>
            <div className="text-xs text-gray-500">{tShared('mobileLabels.totalSupplies')} <span className="text-black font-medium">{supplier.totalSupplies}</span></div>
            <div className="text-xs text-gray-500">{tShared('mobileLabels.totalPurchases')} <span className="text-[#0a61d7] font-semibold">{formatCurrency(parseNumberByCurrency(String(supplier.totalPurchases), userCurrency), userCurrency)}</span></div>
            <div className="text-xs text-gray-500">{tShared('mobileLabels.createdAt')} <span className="text-black font-medium">{String(supplier.createdAt).split('T')[0]}</span></div>
            <div className="text-xs text-gray-500">
              {tShared('mobileLabels.status')} <span className={`inline-block px-2 py-1 rounded-full font-bold ${statusBadge(supplier.status)}`}>{translateStatus(String(supplier.status))}</span>
            </div>
            </div>
            );
          })}
        </div>
        </>
        )}
      </div>
      {/* Pagination */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between mt-6 gap-2">
        {/* Left: Showing X to Y of Z */}
        <div className="text-sm text-gray-500">
          {tShared('pagination.showing', { from: fromRow, to: toRow, total: totalRows })}
        </div>
        {/* Right: Pagination Controls */}
        <div className="flex items-center gap-3">
          <button
            className="p-2 rounded-lg hover:bg-gray-100 disabled:opacity-50"
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1}
            aria-label={tShared('previousPage')}
          >
            <ChevronLeft className="w-4 h-4 text-gray-500" />
          </button>
          {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
            <button
              key={p}
              className={`px-3 py-2 rounded-lg font-semibold text-sm transition ${
                p === page ? 'bg-[#0a61d7] text-white' : 'bg-white text-[#0a61d7] hover:bg-[#f7faff]'
              }`}
              onClick={() => setPage(p)}
            >
              {p}
            </button>
          ))}
          <button
            className="p-2 rounded-lg hover:bg-gray-100 disabled:opacity-50"
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            aria-label={tShared('nextPage')}
          >
            <ChevronRight className="w-4 h-4 text-gray-500" />
          </button>
        </div>
      </div>
      {/* Hidden export trigger for parent */}
      {onExportXLSX && <span style={{ display: 'none' }} id="supplier-table-export-xlsx-trigger" onClick={handleExportXLSX}></span>}
      {showDeleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-lg border border-[#e6e6e6] p-4 w-full max-w-sm">
            <h2 className="text-lg font-bold mb-2 text-red-500">
              {isBulkDelete ? tShared('deleteModal.titleBulkSuppliers') : tShared('deleteModal.titleSingleSupplier')}
            </h2>

            {deleteError && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2">
                <AlertCircle className="w-5 h-5 text-red-500" />
                <span className="text-red-700 text-sm">{deleteError}</span>
              </div>
            )}

            <p className="mb-4 text-gray-500">
              {isBulkDelete
                ? tShared('deleteModal.confirmBulkSuppliersCount', { count: selectedSuppliers.length })
                : tShared('deleteModal.confirmSingleSupplier')}
            </p>
            <div className="flex justify-end gap-2">
              <button
                className="px-4 py-2 rounded-lg bg-gray-200 text-gray-700 hover:bg-gray-300 transition-colors focus:outline-none focus:ring-2 focus:ring-gray-500"
                onClick={handleDeleteCancel}
                disabled={isDeleting}
              >
                {tShared('cancel')}
              </button>
              <button
                className="px-4 py-2 rounded-lg bg-red-600 text-white hover:bg-red-700 transition-colors focus:outline-none focus:ring-2 focus:ring-red-500 flex items-center gap-2 disabled:opacity-50"
                onClick={handleDeleteConfirm}
                disabled={isDeleting}
              >
                {isDeleting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    {tShared('deleting')}
                  </>
                ) : (
                  tShared('deleteModal.deleteButton')
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
