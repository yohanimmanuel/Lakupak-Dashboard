'use client';
import React, { useState, useRef, useLayoutEffect } from "react";
import { useRouter } from 'next/navigation';
import { Search, Eye, Filter, Calendar, ChevronDown, ChevronLeft, ChevronRight, Trash } from "lucide-react";
import * as XLSX from 'xlsx';
import { useUserStore } from '@/store/userStore';
import { format } from 'date-fns';
import { Supplier, SupplierTableRow, SupplyDetail } from '@/types/client';
import { formatCurrency, getDefaultCurrency } from '@/utils/currencyUtils';

// Use suppliers prop or state, not suppliersMock
// Add explicit types for all map/filter parameters

const statusTabs = [
  { label: "All" },
  { label: "Active" },
  { label: "Inactive" },
  { label: "Blocked" },
];

export default function SupplierTable({ suppliers = [], setSuppliers, onSelectSupplier, onExportXLSX, profileToTableRow }: { suppliers?: Supplier[]; setSuppliers?: (fn: (prev: Supplier[]) => Supplier[]) => void; onSelectSupplier?: (supplier: Supplier) => void; onExportXLSX?: (wb: XLSX.WorkBook, filename: string) => void; profileToTableRow: (supplier: Supplier) => SupplierTableRow }) {
  const user = useUserStore(state => state.user);
  
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

  const handleDeleteClick = (supplier: SupplierTableRow) => {
    setSupplierToDelete(supplier);
    setShowDeleteModal(true);
  };

  const handleDeleteConfirm = async () => {
    if (!user?.id) return;
    
    if (isBulkDelete) {
      // Bulk delete - delete all selected suppliers
      for (const supplierId of selectedSuppliers) {
        const supplier = pagedSuppliers.find(s => String(s.id) === supplierId);
        if (supplier) {
          const res = await fetch(`/api/suppliers?id=${supplier.id}&userId=${user.id}`, { method: 'DELETE' });
          if (res.ok && setSuppliers) {
            setSuppliers(prev => prev.filter(s => s.supplierId !== supplier.supplierId));
          }
        }
      }
      setSelectedSuppliers([]); // Clear selection after deleting
    } else {
      // Single delete - delete one supplier
      if (!supplierToDelete) return;
      const res = await fetch(`/api/suppliers?id=${supplierToDelete.id}&userId=${user.id}`, { method: 'DELETE' });
      if (res.ok && setSuppliers) {
        setSuppliers(prev => prev.filter(s => s.supplierId !== supplierToDelete.supplierId));
      }
      setSupplierToDelete(null);
    }
    
    setShowDeleteModal(false);
    setIsBulkDelete(false);
  };

  const handleDeleteCancel = () => {
    setShowDeleteModal(false);
    setSupplierToDelete(null);
    setIsBulkDelete(false);
  };

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

  const handleSelectAll = () => {
    if (selectedSuppliers.length === pagedSuppliers.length) {
      setSelectedSuppliers([]);
    } else {
      setSelectedSuppliers(pagedSuppliers.map(supplier => String(supplier.id)));
    }
  };

  const handleBulkRemove = () => {
    setIsBulkDelete(true);
    setShowDeleteModal(true);
  };
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
    <div className="w-full mx-auto bg-white rounded-lg shadow-sm border border-gray-200 p-4 mt-3">
      
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
                onClick={() => {
                  setSelectedTab(tab.label);
                  setSelectedSuppliers([]); // Reset selection when switching tabs
                }}
                className={`relative z-10 flex-1 px-6 py-2 font-medium text-[14px] transition-colors duration-200 focus:outline-none ${
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
              type="text"
              placeholder="Search suppliers..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2 rounded-lg border border-[#e6e6e6] text-sm text-black focus:outline-none focus:ring-2 focus:ring-[#0a61d7] bg-white"
            />
            <Search className="absolute left-3 top-2 text-gray-400 w-5 h-5" />
          </div>
          {/* Filter Dropdown */}
          <div className="relative">
            <button
              className="flex items-center gap-1 px-3 py-2 rounded-lg border border-[#e6e6e6] bg-white text-gray-700 hover:bg-gray-100 text-sm"
              onClick={() => {
                setShowFilterDropdown(v => !v);
                setShowPeriodDropdown(false);
              }}
            >
              <Filter className="w-4 h-4" />
              {filter}
              <ChevronDown className="w-4 h-4 ml-1 text-gray-500" />
            </button>
            {showFilterDropdown && (
              <div className="absolute right-0 mt-2 w-46.5 bg-white border border-gray-200 rounded-lg shadow z-20">
                {uniqueBusinessTypes.map(opt => (
                  <button
                    key={opt}
                    onClick={() => { setFilter(opt); setShowFilterDropdown(false); }}
                    className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-100 ${filter === opt ? 'font-bold text-[#0a61d7]' : 'text-gray-700'}`}
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
              className="flex items-center gap-1 px-3 py-2 rounded-lg border border-[#e6e6e6] bg-white text-gray-700 hover:bg-gray-100 text-sm"
              onClick={() => {
                setShowPeriodDropdown(v => !v);
                setShowFilterDropdown(false);
              }}
            >
              <Calendar className="w-4 h-4" />
              {period}
              <ChevronDown className="w-4 h-4 ml-1 text-gray-500" />
            </button>
            {showPeriodDropdown && (
              <div className="absolute right-0 mt-2 w-40 bg-white border border-gray-200 rounded-lg shadow z-20">
                {periodOptions.map(opt => (
                  <button
                    key={opt}
                    onClick={() => { setPeriod(opt); setShowPeriodDropdown(false); }}
                    className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-100 ${period === opt ? 'font-bold text-[#0a61d7]' : 'text-gray-700'}`}
                  >
                    {opt}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Bulk Action Bar */}
      {selectedSuppliers.length > 0 && (
        <div className="bg-gradient-to-r from-green-500 to-green-400 rounded-lg p-3 md:p-4 mb-2">
          {/* Mobile Layout */}
          <div className="md:hidden space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1">
                <div className="flex items-center justify-center text-sm font-semibold text-white">
                  {selectedSuppliers.length}
                </div>
                <span className="text-sm font-semibold text-white">
                  {selectedSuppliers.length === 1 ? 'supplier' : 'suppliers'} selected
                </span>
              </div>
            </div>
            <div className="text-white text-xs font-semibold leading-relaxed">
              {selectedSuppliers.length === 1 
                ? 'Select supplier to be removed.'
                : 'Select suppliers to be removed.'
              }
            </div>
            <button
              onClick={handleBulkRemove}
              className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-red-600 text-white font-semibold text-sm rounded-lg hover:bg-red-700 transition-colors"
            >
              <Trash className="w-4 h-4" />
              {selectedSuppliers.length === 1 ? 'Remove Supplier' : 'Remove Selected'}
            </button>
          </div>
          
          {/* Desktop Layout */}
          <div className="hidden md:flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1">
                <div className="text-white flex items-center justify-center text-sm font-semibold">
                  {selectedSuppliers.length}
                </div>
                <span className="text-sm font-semibold text-white">
                  {selectedSuppliers.length === 1 ? 'supplier' : 'suppliers'} selected
                </span>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <span className="text-white text-xs md:text-sm font-semibold">
                {selectedSuppliers.length === 1 
                  ? 'Select supplier to be removed.'
                  : 'Select suppliers to be removed.'
                }
              </span>
              <button
                onClick={handleBulkRemove}
                className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white font-semibold text-sm rounded-lg hover:bg-red-700 transition-colors"
              >
                <Trash className="w-4 h-4" />
                {selectedSuppliers.length === 1 ? 'Remove Supplier' : 'Remove Selected'}
              </button>
            </div>
          </div>
        </div>
      )}

      
      {/* Missing Data Indicator - Only show when there's missing data */}
      {(() => {
        // Get the original supplier data for the current page
        const currentPageSupplierIds = pagedSuppliers.map(s => s.supplierId);
        const currentPageOriginalSuppliers = suppliers.filter(s => currentPageSupplierIds.includes(s.supplierId));
        
        const missingDataCount = currentPageOriginalSuppliers.filter(supplier => {
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
            <p className="text-amber-700 text-sm">
              ⚠️ <strong>Data Completion:</strong> {missingDataCount} supplier{missingDataCount !== 1 ? 's' : ''} in this view have missing data that could be completed.
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
                    selectedSuppliers.length === pagedSuppliers.length && pagedSuppliers.length > 0
                      ? 'bg-green-500 border-green-500'
                      : 'bg-white border-gray-300 hover:border-green-400'
                  }`}
                >
                  {selectedSuppliers.length === pagedSuppliers.length && pagedSuppliers.length > 0 && (
                    <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  )}
                </button>
              </th>
              <th className="py-3 px-4 font-medium uppercase">ID</th>
              <th className="py-3 px-4 font-medium uppercase">Name</th>
              <th className="py-3 px-4 font-medium uppercase">Business Type</th>
              <th className="py-3 px-4 font-medium uppercase">Location</th>
              <th className="py-3 px-4 font-medium uppercase">Total Supplies</th>
              <th className="py-3 px-4 font-medium uppercase">Total Purchases</th>
              <th className="py-3 px-4 font-medium uppercase">Created At</th>
              <th className="py-3 px-4 font-medium uppercase">Status</th>
              <th className="py-3 px-4 font-medium uppercase text-center">Actions</th>
            </tr>
          </thead>
          <tbody className="bg-white">
            {pagedSuppliers.map((supplier: SupplierTableRow) => {
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
                        <span className="text-red-600 font-bold">Missing Name</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-black">
                      {String(supplier.businessType).trim() ? (
                        String(supplier.businessType)
                      ) : (
                        <span className="text-red-600 font-bold">Missing Business Type</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-black max-w-40 truncate">
                      {String(supplier.address).trim() ? (
                        String(supplier.address)
                      ) : (
                        <span className="text-red-600 font-bold">Missing Address</span>
                      )}
                    </td>
                <td className="py-3 px-4 text-black font-medium">{String(supplier.totalSupplies)}</td>
                <td className="py-3 px-4 text-[#0a61d7] font-semibold">{formatCurrency(parseFloat(String(supplier.totalPurchases)) || 0, userCurrency)}</td>
                <td className="py-3 px-4 text-black">{String(supplier.createdAt).split('T')[0]}</td>
                <td className="py-3 px-4">
                  <span className={`inline-block px-2 py-1 rounded-full text-xs font-bold ${statusBadge(supplier.status)}`}>{String(supplier.status)}</span>
                </td>
                <td className="py-3 px-4 text-center">
                  <button
                    className="inline-flex items-center justify-center rounded-lg p-2 hover:bg-blue-100 transition"
                    onClick={() => handleView(supplier)}
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
      {/* Mobile Cards */}
      <div className="md:hidden">
        {/* Select All for Mobile View */}
        <div className="flex items-center gap-2 mb-3">
          <button
            onClick={handleSelectAll}
            className={`w-4 h-4 border-2 rounded transition-all duration-200 flex items-center justify-center ${
              selectedSuppliers.length === pagedSuppliers.length && pagedSuppliers.length > 0
                ? 'bg-green-500 border-green-500'
                : 'bg-white border-gray-300 hover:border-green-400'
            }`}
          >
            {selectedSuppliers.length === pagedSuppliers.length && pagedSuppliers.length > 0 && (
              <svg className="w-2.5 h-2.5 text-white" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
            )}
          </button>
          <span className="text-sm font-medium text-gray-700">
            Select All ({pagedSuppliers.length} suppliers)
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
                className={`rounded-lg shadow p-4 flex flex-col gap-2 relative cursor-pointer transition ${
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
            <div className="text-xs text-gray-500">ID: <span className="text-black font-medium">{supplier.supplierId}</span></div>
            <div className="flex items-center justify-between">
                              <span className="font-bold text-[#0a61d7]">
                  {String(supplier.name).trim() ? (
                    supplier.name
                  ) : (
                    <span className="text-red-600 font-bold">Missing Name</span>
                  )}
                </span>
              <div className="flex items-center gap-2">
              <button
                className="inline-flex items-center justify-center rounded-lg p-2 hover:bg-blue-100 transition"
                onClick={() => handleView(supplier)}
              >
                <Eye className="w-4 h-4 text-[#0a61d7]" />
              </button>
              </div>
            </div>
                            <div className="text-xs text-gray-500">Business Type: <span className="text-black font-medium">
                  {String(supplier.businessType).trim() ? (
                    supplier.businessType
                  ) : (
                    <span className="text-red-600 font-bold">Missing Business Type</span>
                  )}
                </span></div>
                          <div className="text-xs text-gray-500">Location: <span className="text-black font-medium">
                {String(supplier.address).trim() ? (
                  supplier.address
                ) : (
                  <span className="text-red-600 font-bold">Missing Address</span>
                )}
              </span></div>
            <div className="text-xs text-gray-500">Total Supplies: <span className="text-black font-medium">{supplier.totalSupplies}</span></div>
            <div className="text-xs text-gray-500">Total Purchases: <span className="text-[#0a61d7] font-semibold">{formatCurrency(parseFloat(String(supplier.totalPurchases)) || 0, userCurrency)}</span></div>
            <div className="text-xs text-gray-500">Created At: <span className="text-black font-medium">{String(supplier.createdAt).split('T')[0]}</span></div>
            <div className="text-xs text-gray-500">
              Status: <span className={`inline-block px-2 py-1 rounded-full font-bold ${statusBadge(supplier.status)}`}>{supplier.status}</span>
            </div>
            </div>
            );
          })}
        </div>
      </div>
      {/* Pagination */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between mt-6 gap-2">
        {/* Left: Showing X to Y of Z */}
        <div className="text-sm text-gray-500">
          Showing {fromRow} to {toRow} of {totalRows}
        </div>
        {/* Right: Pagination Controls */}
        <div className="flex items-center gap-3">
          <button
            className="p-2 rounded-lg hover:bg-gray-100 disabled:opacity-50"
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1}
            aria-label="Previous page"
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
            aria-label="Next page"
          >
            <ChevronRight className="w-4 h-4 text-gray-500" />
          </button>
        </div>
      </div>
      {/* Hidden export trigger for parent */}
      {onExportXLSX && <span style={{ display: 'none' }} id="supplier-table-export-xlsx-trigger" onClick={handleExportXLSX}></span>}
      {showDeleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-lg shadow-lg p-4 w-full max-w-sm">
            <h2 className="text-lg font-bold mb-2 text-red-500">
              {isBulkDelete ? 'Delete Suppliers' : 'Delete Supplier'}
            </h2>
            <p className="mb-4 text-gray-500">
              {isBulkDelete 
                ? `Are you sure you want to delete ${selectedSuppliers.length} supplier${selectedSuppliers.length === 1 ? '' : 's'}? This action cannot be undone.`
                : 'Are you sure you want to delete this supplier? This action cannot be undone.'
              }
            </p>
            <div className="flex justify-end gap-2">
              <button
                className="px-4 py-2 rounded-lg bg-gray-200 text-gray-700 hover:bg-gray-300"
                onClick={handleDeleteCancel}
              >
                Cancel
              </button>
              <button
                className="px-4 py-2 rounded-lg bg-red-600 text-white hover:bg-red-700"
                onClick={handleDeleteConfirm}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
