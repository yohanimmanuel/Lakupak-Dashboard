'use client';
import React, { useState, useRef, useLayoutEffect, useCallback, useMemo, useEffect } from "react";
import { useRouter } from 'next/navigation';
import { Search, Eye, Filter, Calendar, ChevronDown, ChevronLeft, ChevronRight, Trash, AlertCircle, Loader2 } from "lucide-react";
import * as XLSX from 'xlsx';
import { useUserStore } from '@/store/userStore';
import { format } from 'date-fns';
import { Buyer, BuyerTableRow, OrderDetail } from '@/types/client';
import { formatCurrency, getDefaultCurrency } from '@/utils/currencyUtils';
import { parseNumberByCurrency } from '@/config/currencyConfig';
import { fetchGraphQL } from '@/lib/graphqlClient';

const statusTabs = [
  { label: "All" },
  { label: "Active" },
  { label: "Inactive" },
  { label: "Blocked" },
];

interface BuyerTableProps {
  buyers?: Buyer[];
  setBuyers?: (fn: (prev: Buyer[]) => Buyer[]) => void;
  onSelectBuyer?: (buyer: Buyer) => void;
  onExportXLSX?: (wb: XLSX.WorkBook, filename: string) => void;
  profileToTableRow: (buyer: Buyer) => BuyerTableRow;
  onRefresh?: () => void;
}

export default function BuyerTable({ buyers = [], setBuyers, onSelectBuyer, onExportXLSX, profileToTableRow, onRefresh }: BuyerTableProps) {
  const user = useUserStore(state => state.user);
  const router = useRouter();
  const [isClient, setIsClient] = useState(false);
  
  // Prevent hydration mismatch by only using user currency on client
  useEffect(() => {
    setIsClient(true);
  }, []);
  
  // Get user currency for display (only on client)
  const userCurrency = isClient ? (user?.currency || getDefaultCurrency()) : getDefaultCurrency();
  
  // Enhanced state management
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [selectedTab, setSelectedTab] = useState("All");
  const [filter, setFilter] = useState("All Types");
  const [period, setPeriod] = useState("All Months");
  const [showFilterDropdown, setShowFilterDropdown] = useState(false);
  const [showPeriodDropdown, setShowPeriodDropdown] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [buyerToDelete, setBuyerToDelete] = useState<BuyerTableRow | null>(null);
  const [isBulkDelete, setIsBulkDelete] = useState(false);
  const [selectedBuyers, setSelectedBuyers] = useState<string[]>([]);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  
  // Enhanced refs
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const searchInputRef = useRef<HTMLInputElement>(null);
  
  // Enhanced computed values with useMemo for performance
  const tableRows = useMemo(() => buyers.map(profileToTableRow), [buyers, profileToTableRow]);
  
  const businessTypeSet = useMemo(() => {
    const types = tableRows.map((b: BuyerTableRow) => b.businessType).filter(Boolean);
    return new Set(types);
  }, [tableRows]);
  
  const filterOptions = useMemo(() => ["All Types", ...Array.from(businessTypeSet)], [businessTypeSet]);
  
  const today = useMemo(() => new Date(), []);
  
  const periodOptions = useMemo(() => ["All Months", "This Month", "Last Month"], []);
  
  // Enhanced filtering logic
  const filteredBuyers = useMemo(() => {
    // Sort buyers by most recent first (newest created/updated at top)
    const sortedBuyers = [...tableRows].sort((a, b) => {
      const dateA = new Date(a.createdAt || a.lastUpdated || 0);
      const dateB = new Date(b.createdAt || b.lastUpdated || 0);
      return dateB.getTime() - dateA.getTime(); // Most recent first
    });
    
    let filtered = sortedBuyers.filter((b: BuyerTableRow) => 
      String(b.name).toLowerCase().includes(search.toLowerCase())
    );
    
    if (selectedTab !== "All") {
      filtered = filtered.filter((b: BuyerTableRow) => b.status === selectedTab);
    }
    
    if (filter !== "All Types") {
      filtered = filtered.filter((b: BuyerTableRow) => b.businessType === filter);
    }
    
    if (period !== "All Months") {
      // Filter by the original buyer data's createdAt date, not the formatted string
      filtered = filtered.filter((b: BuyerTableRow) => {
        // Find the original buyer data to get the actual createdAt date
        const originalBuyer = buyers.find(buyer => buyer.id === b.id);
        if (!originalBuyer?.createdAt) return false;
        
        try {
          const buyerDate = new Date(originalBuyer.createdAt);
          if (isNaN(buyerDate.getTime())) return false;
          
          const buyerYear = buyerDate.getFullYear();
          const buyerMonth = buyerDate.getMonth();
          
          if (period === 'This Month') {
            const currentYear = today.getFullYear();
            const currentMonth = today.getMonth();
            return buyerYear === currentYear && buyerMonth === currentMonth;
          } else if (period === 'Last Month') {
            const lastMonthYear = today.getFullYear();
            const lastMonthMonth = today.getMonth() - 1;
            // Handle year boundary (December -> January)
            if (lastMonthMonth < 0) {
              return buyerYear === lastMonthYear - 1 && buyerMonth === 11;
            }
            return buyerYear === lastMonthYear && buyerMonth === lastMonthMonth;
          }
        } catch (error) {
          return false;
        }
        
        return false;
      });
    }
    
    return filtered;
  }, [tableRows, search, selectedTab, filter, period, today, buyers]);
  
  // Enhanced pagination
  const rowsPerPage = 8;
  const totalRows = filteredBuyers.length;
  const totalPages = Math.max(1, Math.ceil(totalRows / rowsPerPage));
  const pagedBuyers = useMemo(() => 
    filteredBuyers.slice((page - 1) * rowsPerPage, page * rowsPerPage), 
    [filteredBuyers, page, rowsPerPage]
  );
  
  const fromRow = totalRows === 0 ? 0 : (page - 1) * rowsPerPage + 1;
  const toRow = Math.min(page * rowsPerPage, totalRows);

  // Enhanced indicator style
  const [indicatorStyle, setIndicatorStyle] = useState({ left: 0, width: 0 });
  
  // Enhanced handlers with useCallback
  const handleDeleteConfirm = useCallback(async () => {
    if (!user?.id) return;
    
    setIsDeleting(true);
    setDeleteError('');
    
    try {
    const DELETE_BUYER_MUTATION = `
      mutation DeleteBuyer($userId: Int!, $id: String!) {
        deleteBuyer(userId: $userId, id: $id) {
          success
          deleted {
            id
            buyerId
          }
        }
      }
    `;

    if (isBulkDelete) {
      // Bulk delete - delete all selected buyers
        const deletePromises = selectedBuyers.map(async (buyerId) => {
        const buyer = pagedBuyers.find(b => String(b.id) === buyerId);
        if (buyer) {
            await fetchGraphQL(DELETE_BUYER_MUTATION, {
              userId: user.id,
              id: buyer.buyerId,
            });
            return buyer.buyerId;
          }
        });
        
        await Promise.all(deletePromises);
        
        // After successful bulk delete, refresh the data
        if (onRefresh) {
          onRefresh();
        }
        setSelectedBuyers([]);
    } else {
      // Single delete - delete one buyer
      if (!buyerToDelete) return;
        await fetchGraphQL(DELETE_BUYER_MUTATION, {
          userId: user.id,
          id: buyerToDelete.buyerId,
        });
        
        // After successful single delete, refresh the data
        if (onRefresh) {
          onRefresh();
      }
      setBuyerToDelete(null);
    }
    
      // Reset pagination to first page if current page becomes empty
      if (page > 1 && pagedBuyers.length <= 1) {
        setPage(1);
      }
      
      // Close modal and reset states immediately
    setShowDeleteModal(false);
    setIsBulkDelete(false);
      
      // Refresh data to ensure UI is in sync
      if (onRefresh) {
        onRefresh();
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to delete buyer(s)';
      setDeleteError(errorMessage);
    } finally {
      setIsDeleting(false);
    }
  }, [user?.id, isBulkDelete, selectedBuyers, pagedBuyers, setBuyers, buyerToDelete]);

  const handleDeleteCancel = useCallback(() => {
    setShowDeleteModal(false);
    setBuyerToDelete(null);
    setIsBulkDelete(false);
    setDeleteError('');
  }, []);

  const handleBuyerSelect = useCallback((buyerId: string) => {
    setSelectedBuyers(prev => 
      prev.includes(buyerId) 
        ? prev.filter(id => id !== buyerId)
        : [...prev, buyerId]
    );
  }, []);

  const handleRowClick = useCallback((buyerId: string, event: React.MouseEvent) => {
    // Don't trigger row selection if clicking on action buttons or checkbox
    if ((event.target as HTMLElement).closest('button') || (event.target as HTMLElement).closest('th')) {
      return;
    }
    handleBuyerSelect(buyerId);
  }, [handleBuyerSelect]);

  const handleSelectAll = useCallback(() => {
    if (selectedBuyers.length === pagedBuyers.length) {
      setSelectedBuyers([]);
    } else {
      setSelectedBuyers(pagedBuyers.map(buyer => String(buyer.id)));
    }
  }, [selectedBuyers.length, pagedBuyers]);

  const handleBulkRemove = useCallback(() => {
    setIsBulkDelete(true);
    setShowDeleteModal(true);
  }, []);

  const handleView = useCallback((buyer: BuyerTableRow) => {
    router.push(`/clients/buyers/details/${buyer.buyerId}`);
  }, [router]);

  const handleDelete = useCallback((buyer: BuyerTableRow) => {
    setBuyerToDelete(buyer);
    setIsBulkDelete(false);
    setShowDeleteModal(true);
  }, []);

  const handleExportXLSX = useCallback(() => {
    const headers = ['ID', 'Name', 'Address', 'Business Type', 'Total Orders', 'Total Spend', 'Outstanding', 'Created At', 'Status'];
    const rows = filteredBuyers.map((b: BuyerTableRow) => [
      b.buyerId,
      b.name,
      b.address,
      b.businessType,
      b.totalOrders,
      b.totalSpend,
      b.outstanding,
      b.createdAt,
      b.status
    ]);
    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Buyers');
    if (onExportXLSX) onExportXLSX(wb, 'buyers.xlsx');
  }, [filteredBuyers, onExportXLSX]);

  // Enhanced search handling
  const handleSearchChange = useCallback((value: string) => {
    setSearch(value);
    setPage(1); // Reset to first page when searching
  }, []);

  // Enhanced tab handling
  const handleTabChange = useCallback((tabLabel: string) => {
    setSelectedTab(tabLabel);
    setSelectedBuyers([]); // Reset selection when switching tabs
    setPage(1); // Reset to first page when changing tabs
  }, []);

  // Enhanced filter handling
  const handleFilterChange = useCallback((filterValue: string) => {
    setFilter(filterValue);
    setShowFilterDropdown(false);
    setPage(1); // Reset to first page when changing filter
  }, []);

  // Enhanced period handling
  const handlePeriodChange = useCallback((periodValue: string) => {
    setPeriod(periodValue);
    setShowPeriodDropdown(false);
    setPage(1); // Reset to first page when changing period
  }, []);

  // Enhanced page handling
  const handlePageChange = useCallback((newPage: number) => {
    setPage(newPage);
    // Scroll to top of table when changing pages
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  // Enhanced dropdown handling
  const handleDropdownToggle = useCallback((dropdownType: 'filter' | 'period') => {
    if (dropdownType === 'filter') {
      setShowFilterDropdown(v => !v);
      setShowPeriodDropdown(false);
    } else {
      setShowPeriodDropdown(v => !v);
      setShowFilterDropdown(false);
    }
  }, []);

  // Enhanced keyboard navigation
  const handleKeyDown = useCallback((e: React.KeyboardEvent, action: () => void) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      action();
    }
  }, []);

  // Enhanced layout effect for indicator
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

  // Enhanced status color helper
  const statusBadge = useCallback((status: string) => {
    if (status === "Active") return "bg-green-100 text-green-500";
    if (status === "Inactive") return "bg-gray-100 text-gray-500";
    if (status === "Blocked") return "bg-red-100 text-red-500";
    return "bg-gray-100 text-gray-500";
  }, []);

  // Enhanced accessibility
  const getAriaLabel = useCallback((action: string, buyer?: BuyerTableRow) => {
    if (buyer) {
      return `${action} buyer ${buyer.name} (${buyer.buyerId})`;
    }
    return action;
  }, []);

  return (
    <div className="w-full mx-auto bg-white rounded-lg shadow-sm border border-gray-200 p-4 mt-3">
      {/* Enhanced Header Section */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-4">
        {/* Status Tabs - Segmented Control */}
        <div className="relative w-full md:w-auto flex items-center">
          <div className="flex w-full md:w-auto bg-gray-100 rounded-lg overflow-hidden relative">
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
                onClick={() => handleTabChange(tab.label)}
                className={`relative z-10 flex-1 px-6 py-2 font-medium text-[14px] transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
                  selectedTab === tab.label
                    ? 'text-white'
                    : 'text-gray-700 hover:text-[#0a61d7]'
                } ${
                  idx === 0 ? 'rounded-l-lg' : idx === statusTabs.length - 1 ? 'rounded-r-lg' : ''
                }`}
                style={{
                  background: 'transparent',
                  boxShadow: 'none',
                  minWidth: 0,
                  flex: 'unset',
                }}
                aria-pressed={selectedTab === tab.label}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
        
        {/* Search and Filters */}
        <div className="flex gap-2 w-full md:w-auto items-center justify-end">
          <div className="relative w-full md:w-64">
            <input
              ref={searchInputRef}
              type="text"
              placeholder="Search buyers..."
              value={search}
              onChange={e => handleSearchChange(e.target.value)}
              className="w-full pl-10 pr-4 py-2 rounded-lg border border-[#e6e6e6] text-sm text-black focus:outline-none focus:ring-2 focus:ring-[#0a61d7] bg-white transition-colors"
              aria-label="Search buyers"
            />
            <Search className="absolute left-3 top-2 text-gray-400 w-5 h-5" />
          </div>
          
          {/* Filter Dropdown */}
          <div className="relative">
            <button
              className="flex items-center gap-1 px-3 py-2 rounded-lg border border-[#e6e6e6] bg-white text-gray-700 hover:bg-gray-100 text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
              onClick={() => handleDropdownToggle('filter')}
              aria-haspopup="true"
              aria-expanded={showFilterDropdown}
              aria-label="Filter by business type"
            >
              <Filter className="w-4 h-4" />
              {filter}
              <ChevronDown className="w-4 h-4 ml-1 text-gray-500" />
            </button>
            {showFilterDropdown && (
              <div className="absolute right-0 mt-2 w-31.5 bg-white border border-gray-200 rounded-lg shadow z-20">
                {filterOptions.map(opt => (
                  <button
                    key={opt}
                    onClick={() => handleFilterChange(opt)}
                    className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-100 transition-colors ${
                      filter === opt ? 'font-bold text-[#0a61d7]' : 'text-gray-700'
                    }`}
                  >
                    {opt}
                  </button>
                ))}
              </div>
            )}
          </div>
          
          {/* Period Dropdown */}
          <div className="relative">
            <button
              className="flex items-center gap-1 px-3 py-2 rounded-lg border border-[#e6e6e6] bg-white text-gray-700 hover:bg-gray-100 text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
              onClick={() => handleDropdownToggle('period')}
              aria-haspopup="true"
              aria-expanded={showPeriodDropdown}
              aria-label="Filter by period"
            >
              <Calendar className="w-4 h-4" />
              {period}
              <ChevronDown className="w-4 h-4 ml-1 text-gray-500" />
            </button>
            {showPeriodDropdown && (
              <div className="absolute right-0 mt-2 w-35 bg-white border border-gray-200 rounded-lg shadow z-20">
                {periodOptions.map(opt => (
                  <button
                    key={opt}
                    onClick={() => handlePeriodChange(opt)}
                    className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-100 transition-colors ${
                      period === opt ? 'font-bold text-[#0a61d7]' : 'text-gray-700'
                    }`}
                  >
                    {opt}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Enhanced Bulk Action Bar */}
      {selectedBuyers.length > 0 && (
        <div className="bg-gradient-to-r from-green-500 to-green-400 rounded-lg p-3 md:p-4 mb-2">
          {/* Mobile Layout */}
          <div className="md:hidden space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1">
                <div className="flex items-center justify-center text-sm font-semibold text-white">
                  {selectedBuyers.length}
                </div>
                <span className="text-sm font-semibold text-white">
                  {selectedBuyers.length === 1 ? 'buyer' : 'buyers'} selected
                </span>
              </div>
            </div>
            <div className="text-white text-xs font-semibold leading-relaxed">
              {selectedBuyers.length === 1 
                ? 'Select buyer to be removed.'
                : 'Select buyers to be removed.'
              }
            </div>
            <button
              onClick={handleBulkRemove}
              className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-red-600 text-white font-semibold text-sm rounded-lg hover:bg-red-700 transition-colors focus:outline-none focus:ring-2 focus:ring-red-500"
              aria-label={`Remove ${selectedBuyers.length} selected buyer${selectedBuyers.length === 1 ? '' : 's'}`}
            >
              <Trash className="w-4 h-4" />
              {selectedBuyers.length === 1 ? 'Remove Buyer' : 'Remove Selected'}
            </button>
          </div>
          
          {/* Desktop Layout */}
          <div className="hidden md:flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1">
                <div className="text-white flex items-center justify-center text-sm font-semibold">
                  {selectedBuyers.length}
                </div>
                <span className="text-sm font-semibold text-white">
                  {selectedBuyers.length === 1 ? 'buyer' : 'buyers'} selected
                </span>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <span className="text-white text-xs md:text-sm font-semibold">
                {selectedBuyers.length === 1 
                  ? 'Select buyer to be removed. '
                  : 'Select buyers to be removed. '
                }
              </span>
              <button
                onClick={handleBulkRemove}
                className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white font-semibold text-sm rounded-lg hover:bg-red-700 transition-colors focus:outline-none focus:ring-2 focus:ring-red-500"
                aria-label={`Remove ${selectedBuyers.length} selected buyer${selectedBuyers.length === 1 ? '' : 's'}`}
              >
                <Trash className="w-4 h-4" />
                {selectedBuyers.length === 1 ? 'Remove Buyer' : 'Remove Selected'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Missing Data Indicator - Only show when there's missing data */}
      {(() => {
        // Get the original buyer data for the current page
        const currentPageBuyerIds = pagedBuyers.map(b => b.id).filter(id => id !== undefined);
        const currentPageOriginalBuyers = buyers.filter(b => b.id && currentPageBuyerIds.includes(b.id));
        
        const missingDataCount = currentPageOriginalBuyers.filter(buyer => {
          // Check all profile fields for missing data
          const basicFields = [
            !String(buyer.storeName).trim(),
            !String(buyer.owner).trim(),
            !String(buyer.address).trim(),
            !String(buyer.businessType).trim(),
            !String(buyer.email).trim(),
            !String(buyer.phone).trim()
          ];
          
          // Check if any basic fields are missing
          const hasMissingBasicFields = basicFields.some(field => field);
          
          // Check logistics fields (preferredDays, lastOrderDate, shipmentSuccess)
          let hasMissingLogistics = false;
          try {
            if (buyer.logistics) {
              const logistics = JSON.parse(buyer.logistics);
              
              // Calculate if there's a valid last order date from order details
              let hasValidLastOrderDate = false;
              if (buyer.orderDetails) {
                try {
                  const orderDetails = JSON.parse(buyer.orderDetails);
                  if (Array.isArray(orderDetails)) {
                    const validDates = orderDetails
                      .map((order: OrderDetail) => order.lastOrderDate)
                      .filter((date: string) => date && String(date).trim());
                    hasValidLastOrderDate = validDates.length > 0;
                  }
                } catch {}
              }
              
              // For MVP, only check if we have order details with valid dates
              // Logistics preferences are optional
              hasMissingLogistics = !hasValidLastOrderDate;
            } else {
              hasMissingLogistics = true; // No logistics data at all
            }
          } catch {
            hasMissingLogistics = true; // Invalid logistics data
          }
          
          // Check order details - must have actual order items with content
          let hasMissingOrders = false;
          try {
            if (buyer.orderDetails) {
              const orderDetails = JSON.parse(buyer.orderDetails);
              if (!Array.isArray(orderDetails) || orderDetails.length === 0) {
                hasMissingOrders = true; // No order details data
              } else {
                // Check if orders have meaningful content
                const hasValidOrders = orderDetails.some((order: OrderDetail) => 
                  order.product && String(order.product).trim() &&
                  order.totalOrders && String(order.totalOrders).trim() &&
                  order.totalSpend && String(order.totalSpend).trim()
                );
                hasMissingOrders = !hasValidOrders;
              }
            } else {
              hasMissingOrders = true; // No order details data at all
            }
          } catch {
            hasMissingOrders = true; // Invalid order details data
          }
          
          return hasMissingBasicFields || hasMissingLogistics || hasMissingOrders;
        }).length;
        
        return missingDataCount > 0 ? (
          <div className="mb-3 p-3 bg-amber-50 border border-amber-200 rounded-lg">
            <p className="text-amber-700 text-sm">
              ⚠️ <strong>Data Completion:</strong> {missingDataCount} buyer{missingDataCount !== 1 ? 's' : ''} in this view have missing data that could be completed.
            </p>
          </div>
        ) : null;
      })()}

      {/* Enhanced Desktop Table */}
      <div className="overflow-x-auto hidden md:block rounded-lg">
        <table className="min-w-full text-sm text-left whitespace-nowrap text-xs">
          <thead className="bg-gray-100 text-gray-500 whitespace-nowrap">
            <tr>
              <th className="py-3 px-4 font-medium uppercase">
                <button
                  onClick={handleSelectAll}
                  className={`w-4 h-4 border-2 rounded transition-all duration-200 flex items-center justify-center focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                    selectedBuyers.length === pagedBuyers.length && pagedBuyers.length > 0
                      ? 'bg-green-500 border-green-500'
                      : 'bg-white border-gray-300 hover:border-green-400'
                  }`}
                  aria-label={selectedBuyers.length === pagedBuyers.length ? 'Deselect all buyers' : 'Select all buyers'}
                >
                  {selectedBuyers.length === pagedBuyers.length && pagedBuyers.length > 0 && (
                    <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  )}
                </button>
              </th>
              <th className="py-3 px-4 font-medium uppercase">ID</th>
              <th className="py-3 px-4 font-medium uppercase">Name</th>
              <th className="py-3 px-4 font-medium uppercase">Address</th>
              <th className="py-3 px-4 font-medium uppercase">Business Type</th>
              <th className="py-3 px-4 font-medium uppercase">Total Orders</th>
              <th className="py-3 px-4 font-medium uppercase">Total Spend</th>
              <th className="py-3 px-4 font-medium uppercase">Outstanding</th>
              <th className="py-3 px-4 font-medium uppercase">Created At</th>
              <th className="py-3 px-4 font-medium uppercase">Status</th>
              <th className="py-3 px-4 font-medium uppercase text-center">Actions</th>
            </tr>
          </thead>
          <tbody className="bg-white">
            {pagedBuyers.map((buyer: BuyerTableRow) => {
              // Get the original buyer data to check for missing data
              const originalBuyer = buyers.find(b => b.id === buyer.id);
              
              const hasIncompleteData = originalBuyer ? (() => {
                // Check all profile fields for missing data (excluding notes and pictures)
                const basicFields = [
                  !String(originalBuyer.storeName).trim(),
                  !String(originalBuyer.owner).trim(),
                  !String(originalBuyer.address).trim(),
                  !String(originalBuyer.businessType).trim(),
                  !String(originalBuyer.email).trim(),
                  !String(originalBuyer.phone).trim()
                ];
                
                // Check if any basic fields are missing
                const hasMissingBasicFields = basicFields.some(field => field);
                
                // Check logistics fields (preferredDays, lastOrderDate, shipmentSuccess)
                let hasMissingLogistics = false;
                try {
                  if (originalBuyer.logistics) {
                    const logistics = JSON.parse(originalBuyer.logistics);
                    
                    // Calculate if there's a valid last order date from order details
                    let hasValidLastOrderDate = false;
                    if (originalBuyer.orderDetails) {
                      try {
                        const orderDetails = JSON.parse(originalBuyer.orderDetails);
                        if (Array.isArray(orderDetails)) {
                          const validDates = orderDetails
                            .map((order: OrderDetail) => order.lastOrderDate)
                            .filter((date: string) => date && String(date).trim());
                          hasValidLastOrderDate = validDates.length > 0;
                        }
                      } catch {}
                    }
                    
                    // For MVP, only check if we have order details with valid dates
                    // Logistics preferences are optional
                    hasMissingLogistics = !hasValidLastOrderDate;
                  } else {
                    hasMissingLogistics = true; // No logistics data at all
                  }
                } catch {
                  hasMissingLogistics = true; // Invalid logistics data
                }
                
                // Check order details - must have actual order items with content
                let hasMissingOrders = false;
                try {
                  if (originalBuyer.orderDetails) {
                    const orderDetails = JSON.parse(originalBuyer.orderDetails);
                    if (!Array.isArray(orderDetails) || orderDetails.length === 0) {
                      hasMissingOrders = true; // No order details data
                    } else {
                      // Check if orders have meaningful content
                      const hasValidOrders = orderDetails.some((order: OrderDetail) => 
                        order.product && String(order.product).trim() &&
                        order.totalOrders && String(order.totalOrders).trim() &&
                        order.totalSpend && String(order.totalSpend).trim()
                      );
                      hasMissingOrders = !hasValidOrders;
                    }
                  } else {
                    hasMissingOrders = true; // No order details data at all
                  }
                } catch {
                  hasMissingOrders = true; // Invalid order details data
                }
                
                return hasMissingBasicFields || hasMissingLogistics || hasMissingOrders;
              })() : false;
              
              return (
              <tr 
                key={String(buyer.id)} 
                className={`border-b transition cursor-pointer ${
                  selectedBuyers.includes(String(buyer.id)) 
                    ? 'bg-blue-50' 
                      : hasIncompleteData
                      ? 'bg-amber-50' // Highlight incomplete rows with amber background
                    : 'hover:bg-gray-50'
                }`} 
                onClick={(e) => handleRowClick(String(buyer.id), e)}
              >
                <td className="py-3 px-4 text-xs">
                  <button
                    onClick={() => handleBuyerSelect(String(buyer.id))}
                    className={`w-4 h-4 border-2 rounded transition-all duration-200 flex items-center justify-center focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                      selectedBuyers.includes(String(buyer.id))
                        ? 'bg-green-500 border-green-500'
                        : 'bg-white border-gray-300 hover:border-green-400'
                    }`}
                    aria-label={selectedBuyers.includes(String(buyer.id)) ? `Deselect ${buyer.name}` : `Select ${buyer.name}`}
                  >
                    {selectedBuyers.includes(String(buyer.id)) && (
                      <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    )}
                  </button>
                </td>
                <td className="max-w-25 py-3 px-4 font-medium text-black truncate">{String(buyer.buyerId)}</td>
                <td className="max-w-30 py-3 px-4 font-medium text-black truncate">
                  {String(buyer.name).trim() ? (
                    String(buyer.name)
                  ) : (
                    <span className="text-red-600 font-bold">Missing Name</span>
                  )}
                </td>
                <td className="py-3 px-4 text-black max-w-35 truncate">
                  {String(buyer.address).trim() ? (
                    String(buyer.address)
                  ) : (
                    <span className="text-red-600 font-bold">Missing Address</span>
                  )}
                </td>
                <td className="max-w-25 py-3 px-4 text-black truncate">
                  {String(buyer.businessType).trim() ? (
                    String(buyer.businessType)
                  ) : (
                    <span className="text-red-600 font-bold">Missing Business Type</span>
                  )}
                </td>
                <td className="py-3 px-4 text-black">{String(buyer.totalOrders)}</td>
                <td className="py-3 px-4 text-[#0a61d7] font-semibold">{formatCurrency(parseNumberByCurrency(String(buyer.totalSpend), userCurrency), userCurrency)}</td>
                <td className="py-3 px-4 text-[#f65911] font-semibold">{formatCurrency(parseNumberByCurrency(String(buyer.outstanding), userCurrency), userCurrency)}</td>
                <td className="py-3 px-4 text-black">{String(buyer.createdAt).split('T')[0]}</td>
                <td className="py-3 px-4">
                  <span className={`inline-block px-2 py-1 rounded-full text-xs font-bold ${statusBadge(buyer.status)}`}>
                    {String(buyer.status)}
                  </span>
                </td>
                <td className="py-3 px-4 text-center">
                  <button
                    className="inline-flex items-center justify-center rounded-lg p-2 hover:bg-blue-100 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
                    onClick={() => handleView(buyer)}
                    aria-label={getAriaLabel('View', buyer)}
                  >
                    <Eye className="w-4 h-4 text-[#0a61d7]" />
                  </button>
                </td>
              </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      
      {/* Enhanced Mobile Cards */}
      <div className="md:hidden">
        {/* Select All for Mobile View */}
        <div className="flex items-center gap-2 mb-3">
          <button
            onClick={handleSelectAll}
            className={`w-4 h-4 border-2 rounded transition-all duration-200 flex items-center justify-center focus:outline-none focus:ring-2 focus:ring-blue-500 ${
              selectedBuyers.length === pagedBuyers.length && pagedBuyers.length > 0
                ? 'bg-green-500 border-green-500'
                : 'bg-white border-gray-300 hover:border-green-400'
            }`}
            aria-label={selectedBuyers.length === pagedBuyers.length ? 'Deselect all buyers' : 'Select all buyers'}
          >
            {selectedBuyers.length === pagedBuyers.length && pagedBuyers.length > 0 && (
              <svg className="w-2.5 h-2.5 text-white" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
            )}
          </button>
          <span className="text-sm font-medium text-gray-700">
            Select All ({pagedBuyers.length} buyers)
          </span>
        </div>
        
        <div className="flex flex-col gap-4">
          {pagedBuyers.map(buyer => {
            // Get the original buyer data to check for missing data
            const originalBuyer = buyers.find(b => b.id === buyer.id);
            
            const hasIncompleteData = originalBuyer ? (() => {
              // Check all profile fields for missing data (excluding notes and pictures)
              const basicFields = [
                !String(originalBuyer.storeName).trim(),
                !String(originalBuyer.owner).trim(),
                !String(originalBuyer.address).trim(),
                !String(originalBuyer.businessType).trim(),
                !String(originalBuyer.email).trim(),
                !String(originalBuyer.phone).trim()
              ];
              
              // Check if any basic fields are missing
              const hasMissingBasicFields = basicFields.some(field => field);
              
              // Check logistics fields (preferredDays, lastOrderDate, shipmentSuccess)
              let hasMissingLogistics = false;
              try {
                if (originalBuyer.logistics) {
                  const logistics = JSON.parse(originalBuyer.logistics);
                  
                  // Calculate if there's a valid last order date from order details
                  let hasValidLastOrderDate = false;
                  if (originalBuyer.orderDetails) {
                    try {
                      const orderDetails = JSON.parse(originalBuyer.orderDetails);
                      if (Array.isArray(orderDetails)) {
                        const validDates = orderDetails
                          .map((order: OrderDetail) => order.lastOrderDate)
                          .filter((date: string) => date && String(date).trim());
                        hasValidLastOrderDate = validDates.length > 0;
                      }
                    } catch {}
                  }
                  
                  // For MVP, only check if we have order details with valid dates
                  // Logistics preferences are optional
                  hasMissingLogistics = !hasValidLastOrderDate;
                } else {
                  hasMissingLogistics = true; // No logistics data at all
                }
              } catch {
                hasMissingLogistics = true; // Invalid logistics data
              }
              
              // Check order details - must have actual order items with content
              let hasMissingOrders = false;
              try {
                if (originalBuyer.orderDetails) {
                  const orderDetails = JSON.parse(originalBuyer.orderDetails);
                  if (!Array.isArray(orderDetails) || orderDetails.length === 0) {
                    hasMissingOrders = true; // No order details data
                  } else {
                    // Check if orders have meaningful content
                    const hasValidOrders = orderDetails.some((order: OrderDetail) => 
                      order.product && String(order.product).trim() &&
                      order.totalOrders && String(order.totalOrders).trim() &&
                      order.totalSpend && String(order.totalSpend).trim()
                    );
                    hasMissingOrders = !hasValidOrders;
                  }
                } else {
                  hasMissingOrders = true; // No order details data at all
                }
              } catch {
                hasMissingOrders = true; // Invalid order details data
              }
              
              return hasMissingBasicFields || hasMissingLogistics || hasMissingOrders;
            })() : false;
            
            return (
          <div 
            key={String(buyer.id)} 
            className={`rounded-lg shadow p-4 flex flex-col gap-2 relative cursor-pointer transition ${
              selectedBuyers.includes(String(buyer.id)) 
                ? 'bg-blue-50' 
                    : hasIncompleteData
                    ? 'bg-amber-50' // Highlight incomplete cards with amber background
                : 'bg-white hover:bg-gray-50'
            }`}
            onClick={() => handleBuyerSelect(String(buyer.id))}
          >
            {/* Checkbox - Top Right Corner */}
            <div className="absolute top-3 right-3 z-10">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleBuyerSelect(String(buyer.id));
                }}
                  className={`w-4 h-4 border-2 rounded transition-all duration-200 flex items-center justify-center focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  selectedBuyers.includes(String(buyer.id))
                    ? 'bg-green-500 border-green-500'
                    : 'bg-white border-gray-300 hover:border-green-400'
                }`}
                  aria-label={selectedBuyers.includes(String(buyer.id)) ? `Deselect ${buyer.name}` : `Select ${buyer.name}`}
              >
                {selectedBuyers.includes(String(buyer.id)) && (
                  <svg className="w-2.5 h-2.5 text-white" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                )}
              </button>
            </div>
            
            <div className="text-xs text-gray-500">ID: <span className="text-black font-medium">{buyer.buyerId}</span></div>
            <div className="flex items-center justify-between">
                <span className={`font-bold ${String(buyer.name).trim() ? 'text-[#0a61d7]' : 'text-red-600'}`}>
                  {String(buyer.name).trim() ? (
                    buyer.name
                  ) : (
                    <span className="font-bold">Missing Name</span>
                  )}
                </span>
              <div className="flex items-center gap-2">
              <button
                    className="inline-flex items-center justify-center rounded-lg p-2 hover:bg-blue-100 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
                onClick={() => handleView(buyer)}
                    aria-label={getAriaLabel('View', buyer)}
              >
                <Eye className="w-4 h-4 text-[#0a61d7]" />
              </button>
              </div>
            </div>
              <div className="text-xs text-gray-500">Address: <span className={`font-medium w-30 truncate ${String(buyer.address).trim() ? 'text-black' : 'text-red-600 font-bold'}`}>{String(buyer.address).trim() ? buyer.address : 'Missing Address'}</span></div>
              <div className="text-xs text-gray-500">Business Type: <span className={`font-medium ${String(buyer.businessType).trim() ? 'text-black' : 'text-red-600 font-bold'}`}>{String(buyer.businessType).trim() ? buyer.businessType : 'Missing Business Type'}</span></div>
            <div className="text-xs text-gray-500">Total Orders: <span className="text-black font-medium">{buyer.totalOrders}</span></div>
            <div className="text-xs text-gray-500">Total Spend: <span className="text-[#0a61d7] font-semibold">{formatCurrency(parseNumberByCurrency(String(buyer.totalSpend), userCurrency), userCurrency)}</span></div>
            <div className="text-xs text-gray-500">Outstanding: <span className="text-[#f65911] font-semibold">{formatCurrency(parseNumberByCurrency(String(buyer.outstanding), userCurrency), userCurrency)}</span></div>
            <div className="text-xs text-gray-500">Created At: <span className="text-black font-medium">{String(buyer.createdAt).split('T')[0]}</span></div>
            <div className="text-xs text-gray-500">
              Status: <span className={`inline-block px-2 py-1 rounded-full font-bold ${statusBadge(buyer.status)}`}>{buyer.status}</span>
            </div>
          </div>
            );
          })}
        </div>
      </div>
      
      {/* Enhanced Pagination */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between mt-6 gap-2">
        {/* Left: Showing X to Y of Z */}
        <div className="text-sm text-gray-500">
          Showing {fromRow} to {toRow} of {totalRows}
          {(search || selectedTab !== 'All' || filter !== 'All Types' || period !== 'All Months') && (
            <span className="ml-2 text-blue-600">
              (filtered from {tableRows.length} total)
            </span>
          )}
        </div>
        {/* Right: Pagination Controls */}
        <div className="flex items-center gap-3">
          <button
            className="p-2 rounded-lg hover:bg-gray-100 disabled:opacity-50 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
            onClick={() => handlePageChange(page - 1)}
            disabled={page === 1}
            aria-label="Previous page"
          >
            <ChevronLeft className="w-4 h-4 text-gray-500" />
          </button>
          {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
            <button
              key={p}
              className={`px-3 py-2 rounded-lg font-semibold text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                p === page ? 'bg-[#0a61d7] text-white' : 'bg-white text-[#0a61d7] hover:bg-[#f7faff]'
              }`}
              onClick={() => handlePageChange(p)}
              aria-label={`Page ${p}`}
              aria-current={p === page ? 'page' : undefined}
            >
              {p}
            </button>
          ))}
          <button
            className="p-2 rounded-lg hover:bg-gray-100 disabled:opacity-50 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
            onClick={() => handlePageChange(page + 1)}
            disabled={page === totalPages}
            aria-label="Next page"
          >
            <ChevronRight className="w-4 h-4 text-gray-500" />
          </button>
        </div>
      </div>
      
      {/* Hidden export trigger for parent */}
      {onExportXLSX && <span style={{ display: 'none' }} id="buyer-table-export-xlsx-trigger" onClick={handleExportXLSX}></span>}
      
      {/* Enhanced Delete Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-lg shadow-lg p-4 w-full max-w-sm">
            <h2 className="text-lg font-bold mb-2 text-red-500">
              {isBulkDelete ? 'Delete Buyers' : 'Delete Buyer'}
            </h2>
            
            {deleteError && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2">
                <AlertCircle className="w-5 h-5 text-red-500" />
                <span className="text-red-700 text-sm">{deleteError}</span>
              </div>
            )}
            
            <p className="mb-4 text-gray-500">
              {isBulkDelete 
                ? `Are you sure you want to delete ${selectedBuyers.length} buyer${selectedBuyers.length === 1 ? '' : 's'}? This action cannot be undone.`
                : 'Are you sure you want to delete this buyer? This action cannot be undone.'
              }
            </p>
            <div className="flex justify-end gap-2">
              <button
                className="px-4 py-2 rounded-lg bg-gray-200 text-gray-700 hover:bg-gray-300 transition-colors focus:outline-none focus:ring-2 focus:ring-gray-500"
                onClick={handleDeleteCancel}
                disabled={isDeleting}
              >
                Cancel
              </button>
              <button
                className="px-4 py-2 rounded-lg bg-red-600 text-white hover:bg-red-700 transition-colors focus:outline-none focus:ring-2 focus:ring-red-500 flex items-center gap-2 disabled:opacity-50"
                onClick={handleDeleteConfirm}
                disabled={isDeleting}
              >
                {isDeleting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Deleting...
                  </>
                ) : (
                  'Delete'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
