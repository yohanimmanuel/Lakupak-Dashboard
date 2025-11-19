'use client';

import React, { useState, useRef, useLayoutEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Search, Eye, Filter, ChevronDown, ChevronLeft, ChevronRight, Trash, Edit, MoreHorizontal } from 'lucide-react';
import { useUserStore } from '@/store/userStore';
import { formatCurrency, getDefaultCurrency } from '@/utils/currencyUtils';
import { format } from 'date-fns';
import { Offer, OfferTableRow, OfferDiscountType } from '@/types/offer';

// Status tabs for filtering offers by status
const statusTabs = [
  { label: "All" },
  { label: "Active" },
  { label: "Inactive" },
];

const dateRangeFilters = [
  { label: "All Time", value: "all" },
  { label: "Last 7 Days", value: "7days" },
  { label: "Last 30 Days", value: "30days" },
  { label: "Last 3 Months", value: "3months" },
  { label: "This Year", value: "year" },
];


export default function OfferTable({ 
  offers = [], 
  setOffersAction, 
  activeTab = 'all',
  onSelectOfferAction
}: { 
  offers?: Offer[]; 
  setOffersAction?: (fn: (prev: Offer[]) => Offer[]) => void; 
  activeTab?: 'all' | 'discounts' | 'promotions';
  onSelectOfferAction?: (offer: Offer) => void;
}) {
  const user = useUserStore(state => state.user);
  const router = useRouter();
  
  const userCurrency = user?.currency || getDefaultCurrency();
  
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [selectedTab, setSelectedTab] = useState("All");
  const [filter, setFilter] = useState("All Time");
  const [showFilterDropdown, setShowFilterDropdown] = useState(false);
  const [selectedOffers, setSelectedOffers] = useState<string[]>([]);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [offerToDelete, setOfferToDelete] = useState<OfferTableRow | null>(null);
  const [isBulkDelete, setIsBulkDelete] = useState(false);
  
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [indicatorStyle, setIndicatorStyle] = useState({ left: 0, width: 0 });
  const rowsPerPage = 6;

  // Helper function to check if offer has discount types
  const hasDiscountType = (offer: Offer) => {
    const activeDiscountTypes = offer.discountTypes?.filter(dt => dt.isActive) || [];
    return activeDiscountTypes.some(dt => dt.discountType === 'percentage' || dt.discountType === 'fixed');
  };

  // Helper function to check if offer has promotion types
  const hasPromotionType = (offer: Offer) => {
    const activeDiscountTypes = offer.discountTypes?.filter(dt => dt.isActive) || [];
    return activeDiscountTypes.some(dt => dt.discountType === 'buy_x_get_y');
  };

  // Filter offers based on activeTab
  const filteredOffers = React.useMemo(() => {
    let filtered = offers;
    
    if (activeTab === 'discounts') {
      filtered = offers.filter(offer => offer.type.includes('discount') || hasDiscountType(offer));
    } else if (activeTab === 'promotions') {
      filtered = offers.filter(offer => offer.type.includes('promotion') || hasPromotionType(offer));
    }
    
    return filtered;
  }, [offers, activeTab]);

  const tableRows = filteredOffers.map(offerToTableRow);

  // Filter products based on search, status, and type
  let filteredRows = tableRows.filter((row: OfferTableRow) => 
    row.name.toLowerCase().includes(search.toLowerCase())
  );
  
  if (selectedTab !== "All") {
    filteredRows = filteredRows.filter((row: OfferTableRow) => row.status === selectedTab);
  }
  
  if (filter !== "All Time") {
    filteredRows = filteredRows.filter((row: OfferTableRow) => {
      const offer = offers.find(o => o.id === row.id);
      if (!offer) return false;
      
      const offerDate = new Date(offer.createdAt);
      const now = new Date();
      
      switch (filter) {
        case "Last 7 Days":
          const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          return offerDate >= sevenDaysAgo;
        case "Last 30 Days":
          const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
          return offerDate >= thirtyDaysAgo;
        case "Last 3 Months":
          const threeMonthsAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
          return offerDate >= threeMonthsAgo;
        case "This Year":
          const startOfYear = new Date(now.getFullYear(), 0, 1);
          return offerDate >= startOfYear;
        default:
          return true;
      }
    });
  }

  const totalRows = filteredRows.length;
  const totalPages = Math.max(1, Math.ceil(totalRows / rowsPerPage));
  const pagedRows = filteredRows.slice((page - 1) * rowsPerPage, page * rowsPerPage);
  const fromRow = totalRows === 0 ? 0 : (page - 1) * rowsPerPage + 1;
  const toRow = Math.min(page * rowsPerPage, totalRows);

  // Convert offer to table row
  function offerToTableRow(offer: Offer): OfferTableRow {
    // Get the primary discount type (highest priority)
    const primaryDiscount = offer.discountTypes?.find(dt => dt.isActive) || offer.discountTypes?.[0];
    const discountDisplay = primaryDiscount?.discountType === 'percentage' 
      ? `${primaryDiscount.discountValue}%` 
      : primaryDiscount ? formatCurrency(primaryDiscount.discountValue, userCurrency) : 'N/A';
    
    // Get actual total discount given to customers (from database)
    const calculatedTotalDiscount = getTotalDiscountGiven(offer);
    
    // Create color-coded usage display for each discount type
    const usageDisplay = createUsageDisplay(offer);

    return {
      id: offer.id,
      offerId: offer.offerId,
      name: offer.name,
      type: offer.type.length > 0 ? offer.type.map(t => t.charAt(0).toUpperCase() + t.slice(1)).join(', ') : 'Unknown',
      discount: discountDisplay,
      status: offer.status.charAt(0).toUpperCase() + offer.status.slice(1),
      startDate: format(new Date(offer.startDate), 'MMM dd, yyyy'),
      endDate: format(new Date(offer.endDate), 'MMM dd, yyyy'),
      usage: usageDisplay as string, // Cast to string for the table row
      totalDiscount: formatCurrency(calculatedTotalDiscount, userCurrency),
      actions: 'actions'
    };
  }

  // Get actual total discount given to customers (from database)
  function getTotalDiscountGiven(offer: Offer): number {
    // Use the actual totalDiscountGiven field from the database
    // This represents the real cumulative discount amount given to customers
    return offer.totalDiscountGiven || 0;
  }

  // Create color-coded usage display for each discount type
  function createUsageDisplay(offer: Offer): React.ReactNode {
    if (!offer.discountTypes || offer.discountTypes.length === 0) {
      return (
        <span className="text-gray-600 p-1 bg-gray-100 rounded-lg font-medium">
          Limit Reached
        </span>
      );
    }

    const activeDiscountTypes = offer.discountTypes.filter(dt => dt.isActive);
    
    // No usage limits - distributors manage offers manually
    const allLimitsReached = false;
    
    if (allLimitsReached) {
      return (
        <span className="text-gray-600 p-1 bg-gray-100 rounded-lg font-medium">
          Limit Reached
        </span>
      );
    }

    // No usage limits - distributors manage offers manually
    return (
      <span className="text-gray-600 p-1 bg-gray-100 rounded-lg font-medium">
        Active
      </span>
    );

  }

  // Helper function to render type badges
  function renderTypeBadges(offer: Offer) {
    const activeDiscountTypes = offer.discountTypes?.filter(dt => dt.isActive) || [];
    const hasDiscount = activeDiscountTypes.some(dt => dt.discountType === 'percentage' || dt.discountType === 'fixed');
    const hasPromotion = activeDiscountTypes.some(dt => dt.discountType === 'buy_x_get_y');
    
    const badges = [];
    
    if (hasDiscount) {
      badges.push(
        <span key="discount" className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-blue-100 text-blue-800 mr-1">
          Discount
        </span>
      );
    }
    
    if (hasPromotion) {
      badges.push(
        <span key="promotion" className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-purple-100 text-purple-800">
          Promotion
        </span>
      );
    }
    
    // If no badges, show the original type
    if (badges.length === 0) {
      return (
        <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
          offer.type.includes('discount')
            ? 'bg-blue-100 text-blue-800' 
            : 'bg-purple-100 text-purple-800'
        }`}>
          {offer.type.length > 0 ? offer.type.map(t => t.charAt(0).toUpperCase() + t.slice(1)).join(', ') : 'Unknown'}
        </span>
      );
    }
    
    return <div className="flex flex-wrap gap-1">{badges}</div>;
  }

  const handleDeleteConfirm = async () => {
    if (!user?.id) return;
    
    try {
      if (isBulkDelete) {
        // Bulk delete - delete all selected offers
        const deletePromises = selectedOffers.map(offerId => 
          fetch(`/api/offers/${offerId}?userId=${user?.id}`, { method: 'DELETE' })
        );
        
        const responses = await Promise.all(deletePromises);
        const failedDeletes = responses.filter(response => !response.ok);
        
        if (failedDeletes.length > 0) {
          alert(`Failed to delete ${failedDeletes.length} offers. Please try again.`);
          return;
        }
        
        // Update UI state
        if (setOffersAction) {
          setOffersAction(prev => prev.filter(offer => !selectedOffers.includes(offer.id)));
        }
        setSelectedOffers([]);
      } else {
        // Single delete - delete one offer
        if (!offerToDelete) return;
        
        const response = await fetch(`/api/offers/${offerToDelete.id}?userId=${user?.id}`, { method: 'DELETE' });
        
        if (!response.ok) {
          alert('Failed to delete offer. Please try again.');
          return;
        }
        
        // Update UI state
        if (setOffersAction) {
          setOffersAction(prev => prev.filter(offer => offer.id !== offerToDelete.id));
        }
        setOfferToDelete(null);
      }
      
      setShowDeleteModal(false);
      setIsBulkDelete(false);
    } catch (error) {
      alert('Failed to delete offers. Please try again.');
    }
  };

  const handleDeleteCancel = () => {
    setShowDeleteModal(false);
    setOfferToDelete(null);
    setIsBulkDelete(false);
  };

  const handleOfferSelect = (offerId: string) => {
    setSelectedOffers(prev => 
      prev.includes(offerId) 
        ? prev.filter(id => id !== offerId)
        : [...prev, offerId]
    );
  };

  const handleRowClick = (offerId: string, event: React.MouseEvent) => {
    if ((event.target as HTMLElement).closest('button') || (event.target as HTMLElement).closest('th')) {
      return;
    }
    handleOfferSelect(offerId);
  };

  const handleSelectAll = () => {
    if (selectedOffers.length === pagedRows.length) {
      setSelectedOffers([]);
    } else {
      setSelectedOffers(pagedRows.map(offer => offer.id));
    }
  };

  const handleBulkActivate = async () => {
    if (selectedOffers.length === 0) return;
    
    try {
      const updatePromises = selectedOffers.map(offerId =>
        fetch(`/api/offers/${offerId}?type=offer&userId=${user?.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'active' })
        })
      );
      
      await Promise.all(updatePromises);
      
      // Update UI state
      if (setOffersAction) {
        setOffersAction(prev => prev.map(offer => 
          selectedOffers.includes(offer.id) ? { ...offer, status: 'active' } : offer
        ));
      }
      
      setSelectedOffers([]);
    } catch (error) {
      alert('Failed to activate offers. Please try again.');
    }
  };
  
  const handleBulkDeactivate = async () => {
    if (selectedOffers.length === 0) return;
    
    try {
      const updatePromises = selectedOffers.map(offerId =>
        fetch(`/api/offers/${offerId}?type=offer&userId=${user?.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'inactive' })
        })
      );
      
      await Promise.all(updatePromises);
      
      // Update UI state
      if (setOffersAction) {
        setOffersAction(prev => prev.map(offer => 
          selectedOffers.includes(offer.id) ? { ...offer, status: 'inactive' } : offer
        ));
      }
      
      setSelectedOffers([]);
    } catch (error) {
      alert('Failed to deactivate offers. Please try again.');
    }
  };

  const handleBulkRemove = () => {
    setIsBulkDelete(true);
    setShowDeleteModal(true);
  };

  const handleDelete = (offer: OfferTableRow) => {
    setOfferToDelete(offer);
    setShowDeleteModal(true);
  };

  const handleEdit = (offer: OfferTableRow) => {
    // Navigate to edit page or open edit modal
    router.push(`/offers/edit/${offer.id}`);
  };

  const handleView = (offer: OfferTableRow) => {
    router.push(`/offers/details?id=${offer.id}`);
  };

  // Tab indicator animation
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
                  setSelectedOffers([]);
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
              placeholder="Search offers..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2 rounded-lg border border-[#e6e6e6] text-sm text-black focus:outline-none focus:ring-2 focus:ring-[#0a61d7] bg-white"
            />
            <Search className="absolute left-3 top-2 text-gray-400 w-5 h-5" />
          </div>

           {/* Date Range Filter Dropdown */}
           <div className="relative">
             <button
               className="flex items-center gap-1 px-3 py-2 rounded-lg border border-[#e6e6e6] bg-white text-gray-700 hover:bg-gray-100 text-sm"
               onClick={() => setShowFilterDropdown(!showFilterDropdown)}
             >
               <Filter className="w-4 h-4" />
               {filter}
               <ChevronDown className="w-4 h-4 ml-1 text-gray-500" />
             </button>
             {showFilterDropdown && (
               <div className="absolute right-0 mt-2 w-48 bg-white border border-gray-200 rounded-lg shadow z-20">
                 {dateRangeFilters.map((filterOption) => (
                   <button
                     key={filterOption.value}
                     onClick={() => {
                       setFilter(filterOption.label);
                       setShowFilterDropdown(false);
                     }}
                     className={`w-full text-left px-4 py-2 text-sm first:rounded-t-lg last:rounded-b-lg ${
                       filter === filterOption.label
                         ? 'text-[#0a61d7] font-semibold hover:bg-gray-100'
                         : 'text-gray-700 hover:bg-gray-100'
                     }`}
                   >
                     {filterOption.label}
                   </button>
                 ))}
               </div>
             )}
           </div>
        </div>
      </div>

      {/* Bulk Action Bar */}
      {selectedOffers.length > 0 && (
        <div className="bg-gradient-to-r from-green-500 to-green-400 rounded-lg p-3 md:p-4 mb-2">
          {/* Mobile Layout */}
          <div className="md:hidden space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1">
                <div className="text-white flex items-center justify-center text-sm font-semibold">
                  {selectedOffers.length}
                </div>
                <span className="text-sm font-semibold text-white">
                  {selectedOffers.length === 1 ? 'offer' : 'offers'} selected
                </span>
              </div>
            </div>
            <div className="text-white text-xs font-semibold leading-relaxed">
              Select offers to be removed from the system.
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleBulkActivate}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-green-600 text-white font-semibold text-sm rounded-lg hover:bg-green-700 transition-colors"
              >
                Activate
              </button>
              <button
                onClick={handleBulkDeactivate}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-yellow-600 text-white font-semibold text-sm rounded-lg hover:bg-yellow-700 transition-colors"
              >
                Deactivate
              </button>
              <button
                onClick={handleBulkRemove}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-red-600 text-white font-semibold text-sm rounded-lg hover:bg-red-700 transition-colors"
              >
                <Trash className="w-4 h-4 text-white" />
                Remove
              </button>
            </div>
          </div>
          
          {/* Desktop Layout */}
          <div className="hidden md:flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1">
                <div className="text-white flex items-center justify-center text-sm font-semibold">
                  {selectedOffers.length}
                </div>
                <span className="text-sm font-semibold text-white">
                  {selectedOffers.length === 1 ? 'offer' : 'offers'} selected
                </span>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <span className="text-white text-xs md:text-sm font-semibold">
                Select offers to remove from the system.
              </span>
              <div className="flex gap-2">
                <button
                  onClick={handleBulkActivate}
                  className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white font-semibold text-sm rounded-lg hover:bg-green-700 transition-colors"
                >
                  Activate
                </button>
                <button
                  onClick={handleBulkDeactivate}
                  className="flex items-center gap-2 px-4 py-2 bg-yellow-600 text-white font-semibold text-sm rounded-lg hover:bg-yellow-700 transition-colors"
                >
                  Deactivate
                </button>
                <button
                  onClick={handleBulkRemove}
                  className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white font-semibold text-sm rounded-lg hover:bg-red-700 transition-colors"
                >
                  <Trash className="w-4 h-4 text-white" />
                  Remove
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
                  className={`w-4 h-4 border-2 rounded transition-all duration-200 flex items-center justify-center ${
                    selectedOffers.length === pagedRows.length && pagedRows.length > 0
                      ? 'bg-green-500 border-green-500'
                      : 'bg-white border-gray-300 hover:border-green-400'
                  }`}
                >
                  {selectedOffers.length === pagedRows.length && pagedRows.length > 0 && (
                    <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  )}
                </button>
              </th>
              <th className="text-left py-3 px-4 font-medium text-xs uppercase">Name</th>
              <th className="text-left py-3 px-4 font-medium text-xs uppercase">Type</th>
              <th className="text-left py-3 px-4 font-medium text-xs uppercase">Discount</th>
              <th className="text-left py-3 px-4 font-medium text-xs uppercase">Status</th>
              <th className="text-left py-3 px-4 font-medium text-xs uppercase">Duration</th>
              <th className="text-left py-3 px-4 font-medium text-xs uppercase">Usage</th>
              <th className="text-left py-3 px-4 font-medium text-xs uppercase">Total Discount</th>
              <th className="text-center py-3 px-4 font-medium text-xs uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="text-xs whitespace-nowrap">
            {pagedRows.map((row, index) => (
              <tr 
                key={row.id} 
                className={`border-b border-gray-100 transition cursor-pointer ${
                  selectedOffers.includes(row.id) 
                    ? 'bg-blue-50' 
                    : 'hover:bg-gray-50'
                }`}
                onClick={(e) => handleRowClick(row.id, e)}
              >
                <td className="py-4 px-4 text-xs">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleOfferSelect(row.id);
                    }}
                    className={`w-4 h-4 border-2 rounded transition-all duration-200 flex items-center justify-center ${
                      selectedOffers.includes(row.id)
                        ? 'bg-green-500 border-green-500'
                        : 'bg-white border-gray-300 hover:border-green-400'
                    }`}
                  >
                    {selectedOffers.includes(row.id) && (
                      <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    )}
                  </button>
                </td>
                <td className="py-4 px-4 text-xs text-gray-900 font-medium truncate">
                  {row.name}
                </td>
                <td className="py-4 px-4 text-xs text-gray-700">
                  {(() => {
                    const offer = offers.find(o => o.id === row.id);
                    return offer ? renderTypeBadges(offer) : (
                      <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                        row.type === 'Discount' 
                          ? 'bg-blue-100 text-blue-800' 
                          : 'bg-purple-100 text-purple-800'
                      }`}>
                        {row.type}
                      </span>
                    );
                  })()}
                </td>
                <td className="py-4 px-4 text-xs text-gray-900">{row.discount}</td>
                <td className="py-4 px-4 text-xs text-gray-700">
                  <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                    row.status === 'Active' 
                      ? 'bg-green-100 text-green-800'
                      : row.status === 'Inactive'
                      ? 'bg-gray-100 text-gray-800'
                      : 'bg-red-100 text-red-800'
                  }`}>
                    {row.status}
                  </span>
                </td>
                <td className="py-4 px-4 text-xs text-gray-700 truncate">
                  {row.startDate} - {row.endDate}
                </td>
                <td className="py-4 px-4 text-xs text-gray-900">
                  {(() => {
                    const offer = offers.find(o => o.id === row.id);
                    return offer ? createUsageDisplay(offer) : row.usage;
                  })()}
                </td>
                <td className="py-4 px-4 text-xs text-gray-900">{row.totalDiscount}</td>
                <td className="py-4 px-4 text-xs text-gray-700">
                  <div className="flex items-center gap-2 justify-center">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleView(row);
                      }}
                      className="inline-flex items-center justify-center rounded-lg p-2 hover:bg-blue-100 transition"
                      title="View Offer"
                    >
                      <Eye className="w-4 h-4 text-[#0a61d7]" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between mt-4">
        <div className="text-sm text-gray-500">
          Showing {fromRow} to {toRow} of {totalRows} results
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setPage(Math.max(1, page - 1))}
            disabled={page === 1}
            className="px-3 py-1 text-sm text-gray-500 hover:text-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          
          <div className="flex items-center gap-1">
            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              const pageNum = i + 1;
              return (
                <button
                  key={pageNum}
                  onClick={() => setPage(pageNum)}
                  className={`px-3 py-2 text-sm rounded-lg ${
                    page === pageNum
                      ? 'bg-[#0a61d7] text-white'
                      : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
                  }`}
                >
                  {pageNum}
                </button>
              );
            })}
            {totalPages > 5 && (
              <>
                {totalPages > 6 && <span className="px-2 text-gray-500">...</span>}
                <button
                  onClick={() => setPage(totalPages)}
                  className={`px-3 py-1 text-sm rounded ${
                    page === totalPages
                      ? 'bg-[#0a61d7] text-white'
                      : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
                  }`}
                >
                  {totalPages}
                </button>
              </>
            )}
          </div>
          
          <button
            onClick={() => setPage(Math.min(totalPages, page + 1))}
            disabled={page === totalPages}
            className="px-3 py-1 text-sm text-gray-500 hover:text-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Delete Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold text-black mb-4">Delete Offer</h3>
            <p className="text-gray-600 mb-6">
              {isBulkDelete 
                ? `Are you sure you want to delete ${selectedOffers.length} selected offers? This action cannot be undone.`
                : `Are you sure you want to delete "${offerToDelete?.name}"? This action cannot be undone.`
              }
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={handleDeleteCancel}
                className="px-4 py-2 text-gray-600 hover:text-black border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteConfirm}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
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