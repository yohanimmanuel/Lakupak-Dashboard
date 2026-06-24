'use client';
import React, { useState, useRef, useLayoutEffect, useEffect } from "react";
import { useRouter } from 'next/navigation';
import { Search, Edit, Filter, ChevronDown, ChevronLeft, ChevronRight, Archive, Trash, Trash2, ShoppingCart } from "lucide-react";
import * as XLSX from 'xlsx';
import { useUserStore } from '@/store/userStore';
import { formatDateLong } from '@/utils/dateUtils';
import { formatCurrency, getDefaultCurrency } from '@/utils/currencyUtils';
import { parseNumberByCurrency } from '@/config/currencyConfig';
import { Order, OrderTableRow } from '@/types/order';
import { useOrdersTranslations } from '@/hooks/useOrdersTranslations';

const statusTabs = [
  { label: "All" },
  { label: "Pending" },
  { label: "Confirmed" },
  { label: "Packed" },
  { label: "Shipped" },
  { label: "Delivered" },
  { label: "Failed" },
  { label: "Cancelled" },
  { label: "Returned" },
];

const paymentTabs = [
  { label: "All" },
  { label: "Unpaid" },
  { label: "Paid" },
];

const deliveryMethodTabs = [
  { label: "All Methods" },
  { label: "Self Pickup" },
  { label: "Seller/Distributor Delivery" },
  { label: "Buyer-arranged Courier" },
];

const bulkOrderStatusOptions = [
  'Pending',
  'Confirmed',
  'Packed',
  'Shipped',
  'Delivered',
  'Failed',
  'Cancelled',
  'Returned',
] as const;

const bulkPaymentStatusOptions = ['Unpaid', 'Paid'] as const;

export default function OrdersTable({ 
  orders = [], 
  setOrdersAction, 
  onExportXLSXAction, 
  orderToTableRowAction 
}: { 
  orders?: Order[]; 
  setOrdersAction?: (fn: (prev: Order[]) => Order[]) => void; 
  onExportXLSXAction?: (wb: XLSX.WorkBook, filename: string) => void; 
  orderToTableRowAction: (order: Order) => OrderTableRow 
}) {
  const {
    tShared,
    tTable,
    translateStatusTab,
    translateOrderStatus,
    translatePaymentStatus,
    translatePaymentTab,
    translateDeliveryMethod,
  } = useOrdersTranslations();
  const user = useUserStore(state => state.user);
  
  // Get user currency for display - safe to use on both server and client
  const userCurrency = user?.currency || getDefaultCurrency();
  
  const tableRows = orders.map(orderToTableRowAction);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [selectedStatusTab, setSelectedStatusTab] = useState("All");
  const [selectedPaymentTab, setSelectedPaymentTab] = useState("All");
  const [selectedDeliveryMethod, setSelectedDeliveryMethod] = useState("All Methods");
  const [showFilterDropdown, setShowFilterDropdown] = useState(false);
  const [showPaymentDropdown, setShowPaymentDropdown] = useState(false);
  const [showDeliveryDropdown, setShowDeliveryDropdown] = useState(false);
  
  const router = useRouter();
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [indicatorStyle, setIndicatorStyle] = useState({ left: 0, width: 0 });
  const rowsPerPage = 8;
  
  let filteredOrders = tableRows;
  
  // Apply status filter
  if (selectedStatusTab !== "All") {
    filteredOrders = filteredOrders.filter((o: OrderTableRow) => o.orderStatus === selectedStatusTab);
  }
  
  // Apply payment filter
  if (selectedPaymentTab !== "All") {
    filteredOrders = filteredOrders.filter((o: OrderTableRow) => o.paymentStatus === selectedPaymentTab);
  }
  
  // Apply delivery method filter
  if (selectedDeliveryMethod !== "All Methods") {
    filteredOrders = filteredOrders.filter((o: OrderTableRow) => o.deliveryMethod === selectedDeliveryMethod);
  }
  
  // Apply search filter with sanitization
  if (search && search.trim().length > 0) {
    const sanitizedSearch = search.trim().toLowerCase();
    filteredOrders = filteredOrders.filter((o: OrderTableRow) => 
      String(o.orderId || '').toLowerCase().includes(sanitizedSearch) ||
      String(o.buyerName || '').toLowerCase().includes(sanitizedSearch) ||
      String(o.trackingNumber || '').toLowerCase().includes(sanitizedSearch)
    );
  }
  
  const totalRows = filteredOrders.length;
  const totalPages = Math.max(1, Math.ceil(totalRows / rowsPerPage));
  const pagedOrders = filteredOrders.slice((page - 1) * rowsPerPage, page * rowsPerPage);
  const fromRow = totalRows === 0 ? 0 : (page - 1) * rowsPerPage + 1;
  const toRow = Math.min(page * rowsPerPage, totalRows);

  const [selectedOrders, setSelectedOrders] = useState<string[]>([]); // stores orderId values
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [orderToDelete, setOrderToDelete] = useState<OrderTableRow | null>(null);
  const [showBulkOrderStatusDropdown, setShowBulkOrderStatusDropdown] = useState(false);
  const [showBulkPaymentStatusDropdown, setShowBulkPaymentStatusDropdown] = useState(false);
  const [isBulkUpdating, setIsBulkUpdating] = useState(false);
  
  // Handle tab indicator animation
  useLayoutEffect(() => {
    if (tabRefs.current.length > 0) {
      const activeTab = tabRefs.current.find((tab, index) => 
        statusTabs[index]?.label === selectedStatusTab
      );
      if (activeTab) {
        setIndicatorStyle({
          left: activeTab.offsetLeft,
          width: activeTab.offsetWidth,
        });
      }
    }
  }, [selectedStatusTab]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Pending': return 'bg-yellow-100 text-yellow-500';
      case 'Confirmed': return 'bg-blue-100 text-blue-500';
      case 'Packed': return 'bg-purple-100 text-purple-500';
      case 'Shipped': return 'bg-indigo-100 text-indigo-500';
      case 'Delivered': return 'bg-green-100 text-green-500';
      case 'Received': return 'bg-green-100 text-green-500';
      case 'Failed': return 'bg-red-100 text-red-500';
      case 'Cancelled': return 'bg-red-100 text-red-500';
      case 'Returned': return 'bg-orange-100 text-orange-500';
      default: return 'bg-gray-100 text-gray-500';
    }
  };

  const getPaymentStatusColor = (status: string) => {
    switch (status) {
      case 'Unpaid': return 'bg-red-100 text-red-500';
      case 'Paid': return 'bg-green-100 text-green-500';
      default: return 'bg-gray-100 text-gray-500';
    }
  };

  const handleExport = () => {
    if (!user?.id) {
      return;
    }
    
    if (onExportXLSXAction) {
      try {
        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.json_to_sheet(filteredOrders);
        XLSX.utils.book_append_sheet(wb, ws, "Orders");
        onExportXLSXAction(wb, `orders_${new Date().toISOString().split('T')[0]}.xlsx`);
      } catch (error) {
      }
    }
  };

  const handleOrderClick = (order: OrderTableRow) => {
    // Validate orderId format before navigation
    if (!order.orderId || typeof order.orderId !== 'string') {
      return;
    }
    
    // Navigate to order details page using orderId instead of id
    router.push(`/orders/details/${order.orderId}`);
  };

  const handleOrderSelect = (orderId: string) => {
    if (isBulkUpdating) return;
    setSelectedOrders(prev => 
      prev.includes(orderId) 
        ? prev.filter(id => id !== orderId)
        : [...prev, orderId]
    );
  };

  const handleRowClick = (orderId: string, event: React.MouseEvent) => {
    if (isBulkUpdating) return;
    // Don't trigger row selection if clicking on action buttons or checkbox
    if ((event.target as HTMLElement).closest('button') || (event.target as HTMLElement).closest('th')) {
      return;
    }
    handleOrderSelect(orderId);
  };

  // Check if all filtered orders are selected (not just current page)
  const allFilteredOrderIds = React.useMemo(() => 
    filteredOrders.map(order => order.orderId), 
    [filteredOrders]
  );
  const allFilteredSelected = React.useMemo(() => 
    allFilteredOrderIds.length > 0 && allFilteredOrderIds.every(id => selectedOrders.includes(id)),
    [allFilteredOrderIds, selectedOrders]
  );

  const handleSelectAll = () => {
    if (isBulkUpdating) return;
    if (allFilteredSelected) {
      // Deselect all filtered orders
      setSelectedOrders(prev => prev.filter(id => !allFilteredOrderIds.includes(id)));
    } else {
      // Select all filtered orders (add to existing selection)
      setSelectedOrders(prev => {
        const newSelection = [...prev];
        allFilteredOrderIds.forEach(id => {
          if (!newSelection.includes(id)) {
            newSelection.push(id);
          }
        });
        return newSelection;
      });
    }
  };

  const bulkUpdateSelectedOrders = async (
    field: 'orderStatus' | 'paymentStatus',
    value: string,
  ) => {
    if (selectedOrders.length === 0 || !user?.id || isBulkUpdating) return;

    const batchOrderIds = [...selectedOrders];
    setIsBulkUpdating(true);
    setShowBulkOrderStatusDropdown(false);
    setShowBulkPaymentStatusDropdown(false);

    try {
      const CONCURRENCY = 10;
      const results: PromiseSettledResult<string>[] = [];

      for (let i = 0; i < batchOrderIds.length; i += CONCURRENCY) {
        const chunk = batchOrderIds.slice(i, i + CONCURRENCY);
        results.push(
          ...(await Promise.allSettled(
            chunk.map(async (orderId) => {
              const res = await fetch('/api/orders', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ orderId, userId: user.id, [field]: value }),
              });
              if (!res.ok) throw new Error(String(res.status));
              return orderId;
            }),
          )),
        );
      }

      const successes = results
        .filter((result): result is PromiseFulfilledResult<string> => result.status === 'fulfilled')
        .map((result) => result.value);
      const failedCount = batchOrderIds.length - successes.length;

      if (successes.length > 0 && setOrdersAction) {
        setOrdersAction((prev) =>
          prev.map((order) =>
            successes.includes(order.orderId)
              ? { ...order, [field]: value }
              : order,
          ),
        );
      }

      setSelectedOrders((prev) => prev.filter((id) => !successes.includes(id)));

      if (failedCount > 0) {
        const message =
          successes.length > 0
            ? tTable('bulkActions.updatePartialSuccess', {
                success: successes.length,
                failed: failedCount,
              })
            : tTable('bulkActions.updateFailed', { count: failedCount });
        alert(message);
      }
    } catch {
      alert(tTable('bulkActions.updateFailed', { count: batchOrderIds.length }));
    } finally {
      setIsBulkUpdating(false);
    }
  };

  const handleBulkArchive = async () => {
    if (selectedOrders.length === 0) return;
    try {
      const successes: string[] = [];
      for (const orderId of selectedOrders) {
        const row = pagedOrders.find(o => o.orderId === orderId);
        const res = await fetch('/api/orders', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ orderId, id: row ? Number(row.id) : undefined, archive: true, userId: user?.id })
        });
        if (res.ok) successes.push(orderId);
      }
      if (successes.length > 0 && setOrdersAction) {
        setOrdersAction(prev => prev.filter(o => !successes.includes(o.orderId)));
      }
      setSelectedOrders(prev => prev.filter(id => !successes.includes(id)));
    } catch {}
  };

  const handleDelete = (order: OrderTableRow) => {
    // Only allow deleting cancelled orders
    if (order.orderStatus !== 'Cancelled') {
      return;
    }
    setOrderToDelete(order);
    setShowDeleteModal(true);
  };

  const handleBulkDelete = async () => {
    const ordersToDelete = orderToDelete 
      ? [orderToDelete.orderId]
      : selectedOrders.filter(orderId => {
          const order = pagedOrders.find(o => o.orderId === orderId);
          return order?.orderStatus === 'Cancelled';
        });
    
    if (ordersToDelete.length === 0) {
      setShowDeleteModal(false);
      setOrderToDelete(null);
      return;
    }
    
    try {
      const successes: string[] = [];
      for (const orderId of ordersToDelete) {
        const res = await fetch('/api/orders', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ orderId })
        });
        if (res.ok) successes.push(orderId);
      }
      if (successes.length > 0 && setOrdersAction) {
        setOrdersAction(prev => prev.filter(o => !successes.includes(o.orderId)));
      }
      setSelectedOrders(prev => prev.filter(id => !successes.includes(id)));
      setShowDeleteModal(false);
      setOrderToDelete(null);
    } catch {}
  };

  return (
    <div className="w-full mx-auto bg-white rounded-lg border border-[#e6e6e6] p-4 mt-3" data-tour="orders-table">
      {/* Status Tabs - Segmented Control */}
      <div className="mb-4">
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
                ref={(el) => { tabRefs.current[idx] = el; }}
                onClick={() => {
                  if (isBulkUpdating) return;
                  setSelectedStatusTab(tab.label);
                  setSelectedOrders([]); // Reset selection when switching tabs
                }}
                className={`relative z-10 flex-1 px-6 py-2 font-medium text-[14px] transition-colors duration-200 focus:outline-none ${
                  selectedStatusTab === tab.label
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
                {translateStatusTab(tab.label)}
              </button>
            ))}
          </div>
        </div>
      </div>
      
      {/* Search and Filters */}
      <div className="flex gap-2 w-full md:w-auto items-center justify-start mb-4">
        <div className="relative w-full md:w-64 shrink-0">
          <input
            type="text"
            placeholder={tTable('searchPlaceholder')}
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 rounded-lg border border-[#e6e6e6] text-sm text-black focus:outline-none focus:ring-2 focus:ring-[#0a61d7] bg-white"
            aria-label={tTable('searchAriaLabel')}
            maxLength={100}
          />
          <Search className="absolute left-3 top-2 text-gray-400 w-5 h-5" />
        </div>
        
        {/* Payment Status Filter */}
        <div className="relative">
          <button
            className="flex items-center gap-1 px-3 py-2 rounded-lg border border-[#e6e6e6] bg-white text-gray-700 hover:bg-gray-100 text-sm whitespace-nowrap"
            onClick={() => {
              setShowPaymentDropdown(v => !v);
              setShowFilterDropdown(false);
              setShowDeliveryDropdown(false);
            }}
          >
            <Filter className="w-4 h-4" />
            {translatePaymentTab(selectedPaymentTab)}
            <ChevronDown className="w-4 h-4 ml-1 text-gray-500" />
          </button>
          {showPaymentDropdown && (
            <div className="absolute right-0 mt-2 w-31.5 bg-white border border-[#e6e6e6] rounded-lg shadow z-20">
              {paymentTabs.map(opt => (
                <button
                  key={opt.label}
                  onClick={() => { setSelectedPaymentTab(opt.label); setShowPaymentDropdown(false); }}
                  className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-100 ${selectedPaymentTab === opt.label ? 'font-bold text-[#0a61d7]' : 'text-gray-700'}`}
                >
                  {translatePaymentTab(opt.label)}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Delivery Method Filter */}
        <div className="relative">
          <button
            className="flex items-center gap-1 px-3 py-2 rounded-lg border border-[#e6e6e6] bg-white text-gray-700 hover:bg-gray-100 text-sm whitespace-nowrap"
            onClick={() => {
              setShowDeliveryDropdown(v => !v);
              setShowFilterDropdown(false);
              setShowPaymentDropdown(false);
            }}
          >
            <Filter className="w-4 h-4" />
            {translateDeliveryMethod(selectedDeliveryMethod)}
            <ChevronDown className="w-4 h-4 ml-1 text-gray-500" />
          </button>
          {showDeliveryDropdown && (
            <div className="absolute right-0 mt-2 w-48 bg-white border border-[#e6e6e6] rounded-lg shadow z-20">
              {deliveryMethodTabs.map(opt => (
                <button
                  key={opt.label}
                  onClick={() => { setSelectedDeliveryMethod(opt.label); setShowDeliveryDropdown(false); }}
                  className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-100 ${selectedDeliveryMethod === opt.label ? 'font-bold text-[#0a61d7]' : 'text-gray-700'}`}
                >
                  {translateDeliveryMethod(opt.label)}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
      
      {/* Bulk Action Bar - match ProductTable style */}
      {(selectedOrders.length > 0 || isBulkUpdating) && (
        <div className="bg-gradient-to-r from-green-500 to-green-400 rounded-lg p-3 md:p-4 mb-2 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="text-white text-sm font-semibold">
            {isBulkUpdating
              ? tTable('bulkActions.updating')
              : tTable('bulkActions.selected', { count: selectedOrders.length })}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <button
                type="button"
                disabled={isBulkUpdating}
                onClick={() => {
                  setShowBulkPaymentStatusDropdown(false);
                  setShowBulkOrderStatusDropdown((v) => !v);
                }}
                className="inline-flex items-center gap-2 px-4 py-2 bg-white text-gray-800 font-semibold text-sm rounded-lg hover:bg-gray-100 transition-colors disabled:opacity-60"
              >
                {tTable('bulkActions.setOrderStatus')}
                <ChevronDown className="w-4 h-4 text-gray-500" />
              </button>
              {showBulkOrderStatusDropdown && (
                <div className="absolute left-0 md:right-0 md:left-auto mt-2 w-44 bg-white border border-[#e6e6e6] rounded-lg shadow-lg z-30 max-h-64 overflow-y-auto">
                  {bulkOrderStatusOptions.map((status) => (
                    <button
                      key={status}
                      type="button"
                      onClick={() => bulkUpdateSelectedOrders('orderStatus', status)}
                      className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 first:rounded-t-lg last:rounded-b-lg"
                    >
                      {translateOrderStatus(status)}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="relative">
              <button
                type="button"
                disabled={isBulkUpdating}
                onClick={() => {
                  setShowBulkOrderStatusDropdown(false);
                  setShowBulkPaymentStatusDropdown((v) => !v);
                }}
                className="inline-flex items-center gap-2 px-4 py-2 bg-white text-gray-800 font-semibold text-sm rounded-lg hover:bg-gray-100 transition-colors disabled:opacity-60"
              >
                {tTable('bulkActions.setPaymentStatus')}
                <ChevronDown className="w-4 h-4 text-gray-500" />
              </button>
              {showBulkPaymentStatusDropdown && (
                <div className="absolute left-0 md:right-0 md:left-auto mt-2 w-40 bg-white border border-[#e6e6e6] rounded-lg shadow-lg z-30">
                  {bulkPaymentStatusOptions.map((status) => (
                    <button
                      key={status}
                      type="button"
                      onClick={() => bulkUpdateSelectedOrders('paymentStatus', status)}
                      className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 first:rounded-t-lg last:rounded-b-lg"
                    >
                      {translatePaymentStatus(status)}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button
              onClick={handleBulkArchive}
              disabled={isBulkUpdating}
              className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white font-semibold text-sm rounded-lg hover:bg-emerald-700 transition-colors disabled:opacity-60"
            >
              <Archive className="w-4 h-4" /> {tTable('bulkActions.archiveOrders')}
            </button>
            {/* Show delete button when cancelled orders are selected (even with mixed statuses) */}
            {selectedOrders.some(orderId => {
              const order = pagedOrders.find(o => o.orderId === orderId);
              return order?.orderStatus === 'Cancelled';
            }) && (
              <button
                onClick={() => setShowDeleteModal(true)}
                disabled={isBulkUpdating}
                className="inline-flex items-center gap-2 px-4 py-2 bg-red-600 text-white font-semibold text-sm rounded-lg hover:bg-red-700 transition-colors disabled:opacity-60"
              >
                <Trash className="w-4 h-4" /> {tTable('bulkActions.deleteCancelled')}
              </button>
            )}
          </div>
        </div>
      )}
      
      <div className="overflow-x-auto hidden md:block rounded-lg">
        {filteredOrders.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <ShoppingCart className="w-12 h-12 mx-auto mb-4 text-gray-400" />
            <p className="text-sm">{tTable('empty')}</p>
          </div>
        ) : (
          <table className="min-w-full text-sm text-left whitespace-nowrap text-xs">
            <thead className="bg-gray-100 text-gray-500 whitespace-nowrap">
              <tr>
                <th className="py-3 px-4 font-medium uppercase">
                  <button
                    type="button"
                    disabled={isBulkUpdating}
                    onClick={handleSelectAll}
                    className={`w-4 h-4 border-2 rounded transition-all duration-200 flex items-center justify-center disabled:opacity-60 disabled:cursor-not-allowed ${
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
                               <th className="py-3 px-4 font-medium uppercase">{tTable('columns.order')}</th>
                 <th className="py-3 px-4 font-medium uppercase">{tTable('columns.date')}</th>
                 <th className="py-3 px-4 font-medium uppercase">{tTable('columns.buyer')}</th>
                 <th className="py-3 px-4 font-medium uppercase">{tTable('columns.status')}</th>
                 <th className="py-3 px-4 font-medium uppercase">{tTable('columns.total')}</th>
                 <th className="py-3 px-4 font-medium uppercase">{tTable('columns.items')}</th>
                 <th className="py-3 px-4 font-medium uppercase">{tTable('columns.delivery')}</th>
                 <th className="py-3 px-4 font-medium uppercase">{tTable('columns.tracking')}</th>
                 <th className="py-3 px-4 font-medium uppercase">{tTable('columns.payment')}</th>
                 <th className="py-3 px-4 font-medium uppercase text-center">{tShared('actions')}</th>
              </tr>
            </thead>
            <tbody className="bg-white">
              {pagedOrders.map((order) => (
              <tr 
                key={order.orderId} 
                className={`border-b transition ${
                  isBulkUpdating ? 'cursor-default' : 'cursor-pointer'
                } ${
                  selectedOrders.includes(order.orderId) 
                    ? 'bg-blue-50' 
                    : 'hover:bg-gray-50'
                }`} 
                onClick={(e) => handleRowClick(order.orderId, e)}
              >
                <td className="py-3 px-4 text-xs">
                  <button
                    type="button"
                    disabled={isBulkUpdating}
                    onClick={() => handleOrderSelect(order.orderId)}
                    className={`w-4 h-4 border-2 rounded transition-all duration-200 flex items-center justify-center disabled:opacity-60 disabled:cursor-not-allowed ${
                      selectedOrders.includes(order.orderId)
                        ? 'bg-green-500 border-green-500'
                        : 'bg-white border-gray-300 hover:border-green-400'
                    }`}
                  >
                    {selectedOrders.includes(order.orderId) && (
                      <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    )}
                  </button>
                </td>
                                 <td className="max-w-30 py-3 px-4 font-medium text-black truncate">{order.orderId}</td>
                 <td className="py-3 px-4 text-black">{formatDateLong(order.orderDate)}</td>
                 <td className="max-w-30 py-3 px-4 font-medium text-black truncate">{order.buyerName}</td>
                 <td className="py-3 px-4">
                   <span className={`inline-block px-2 py-1 rounded-full text-xs font-bold ${getStatusColor(order.orderStatus)}`}>
                     {translateOrderStatus(order.orderStatus)}
                   </span>
                 </td>
                 <td className="py-3 px-4 text-[#0a61d7] font-semibold">{formatCurrency(parseNumberByCurrency(String(order.totalAmount), userCurrency), userCurrency)}</td>
                 <td className="py-3 px-4 text-black">{order.items}</td>
                 <td className="py-3 px-4 text-black">{translateDeliveryMethod(order.deliveryMethod)}</td>
                 <td className="py-3 px-4 text-black">{order.trackingNumber || tShared('notAvailable')}</td>
                 <td className="py-3 px-4">
                   <span className={`inline-block px-2 py-1 rounded-full text-xs font-bold ${getPaymentStatusColor(order.paymentStatus)}`}>
                     {translatePaymentStatus(order.paymentStatus)}
                   </span>
                 </td>
                 <td className="py-3 px-4 text-center">
                  <div className="flex items-center justify-center gap-2">
                    <button
                      className="inline-flex items-center justify-center rounded-lg p-2 hover:bg-gray-100 transition-colors focus:outline-none"
                      onClick={() => handleOrderClick(order)}
                      aria-label={tTable('editOrder', { orderId: order.orderId })}
                      title={tTable('editOrder', { orderId: order.orderId })}
                    >
                      <Edit className="w-4 h-4 text-gray-500" />
                    </button>
                    {order.orderStatus === 'Cancelled' && (
                      <button
                        className="inline-flex items-center justify-center rounded-lg p-2 hover:bg-red-100 transition-colors focus:outline-none"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(order);
                        }}
                        aria-label={tTable('deleteOrder', { orderId: order.orderId })}
                        title={tTable('deleteOrder', { orderId: order.orderId })}
                      >
                        <Trash2 className="w-4 h-4 text-red-600" />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        )}
      </div>

      {/* Mobile Cards */}
      <div className="md:hidden">
        {filteredOrders.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <ShoppingCart className="w-12 h-12 mx-auto mb-4 text-gray-400" />
            <p className="text-sm">{tTable('empty')}</p>
          </div>
        ) : (
          <>
            {/* Select All for Mobile View */}
            <div className="flex items-center gap-2 mb-3">
              <button
                type="button"
                disabled={isBulkUpdating}
                onClick={handleSelectAll}
                className={`w-4 h-4 border-2 rounded transition-all duration-200 flex items-center justify-center disabled:opacity-60 disabled:cursor-not-allowed ${
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
                {tTable('selection.selectAllCount', { count: filteredOrders.length })}
              </span>
            </div>
            
            <div className="flex flex-col gap-4">
              {pagedOrders.map(order => (
            <div 
              key={order.orderId} 
              className={`rounded-lg border border-[#e6e6e6] p-4 flex flex-col gap-2 relative transition ${
                isBulkUpdating ? 'cursor-default' : 'cursor-pointer'
              } ${
                selectedOrders.includes(order.orderId) 
                  ? 'bg-blue-50' 
                  : 'bg-white hover:bg-gray-50'
              }`}
              onClick={() => handleOrderSelect(order.orderId)}
            >
              {/* Checkbox - Top Right Corner */}
              <div className="absolute top-3 right-3 z-10">
                <button
                  type="button"
                  disabled={isBulkUpdating}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleOrderSelect(order.orderId);
                  }}
                  className={`w-4 h-4 border-2 rounded transition-all duration-200 flex items-center justify-center disabled:opacity-60 disabled:cursor-not-allowed ${
                    selectedOrders.includes(order.orderId)
                      ? 'bg-green-500 border-green-500'
                      : 'bg-white border-gray-300 hover:border-green-400'
                  }`}
                >
                  {selectedOrders.includes(order.orderId) && (
                    <svg className="w-2.5 h-2.5 text-white" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  )}
                </button>
              </div>
              
              <div className="text-xs text-gray-500">{tTable('mobileLabels.order')} <span className="text-black font-medium">{order.orderId}</span></div>
              <div className="flex items-center justify-between">
                <span className="font-bold text-[#0a61d7]">{order.buyerName}</span>
                <div className="flex items-center gap-2">
                  <button
                    className="inline-flex items-center justify-center rounded-lg p-2 hover:bg-gray-100 transition-colors focus:outline-none"
                    onClick={() => handleOrderClick(order)}
                    aria-label={tTable('editOrder', { orderId: order.orderId })}
                    title={tTable('editOrder', { orderId: order.orderId })}
                  >
                    <Edit className="w-4 h-4 text-gray-500" />
                  </button>
                  {order.orderStatus === 'Cancelled' && (
                    <button
                      className="inline-flex items-center justify-center rounded-lg p-2 hover:bg-red-100 transition-colors focus:outline-none"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(order);
                      }}
                      aria-label={tTable('deleteOrder', { orderId: order.orderId })}
                      title={tTable('deleteOrder', { orderId: order.orderId })}
                    >
                      <Trash2 className="w-4 h-4 text-red-600" />
                    </button>
                  )}
                </div>
              </div>
                             <div className="text-xs text-gray-500">{tTable('mobileLabels.date')} <span className="text-black font-medium">{formatDateLong(order.orderDate)}</span></div>
               <div className="text-xs text-gray-500">{tTable('mobileLabels.status')} <span className={`inline-block px-2 py-1 rounded-full font-bold ${getStatusColor(order.orderStatus)}`}>{translateOrderStatus(order.orderStatus)}</span></div>
                               <div className="text-xs text-gray-500">{tTable('mobileLabels.total')} <span className="text-[#0a61d7] font-semibold">{formatCurrency(parseNumberByCurrency(String(order.totalAmount), userCurrency), userCurrency)}</span></div>
               <div className="text-xs text-gray-500">{tTable('mobileLabels.items')} <span className="text-black font-medium">{order.items}</span></div>
               <div className="text-xs text-gray-500">{tTable('mobileLabels.delivery')} <span className="text-black font-medium">{translateDeliveryMethod(order.deliveryMethod)}</span></div>
               <div className="text-xs text-gray-500">{tTable('mobileLabels.tracking')} <span className="text-black font-medium">{order.trackingNumber || tShared('notAvailable')}</span></div>
               <div className="text-xs text-gray-500">{tTable('mobileLabels.payment')} <span className={`inline-block px-2 py-1 rounded-full font-bold ${getPaymentStatusColor(order.paymentStatus)}`}>{translatePaymentStatus(order.paymentStatus)}</span></div>
            </div>
          ))}
        </div>
        </>
        )}
      </div>

      {/* Pagination */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between mt-6 gap-2">
        {/* Left: Showing X to Y of Z */}
        <div className="text-sm text-gray-500">
          {tTable('pagination.showing', { from: fromRow, to: toRow, total: totalRows })}
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

      {/* Delete Confirmation Modal */}
      {showDeleteModal && (() => {
        const isSingleDelete = orderToDelete !== null;
        const cancelledCount = isSingleDelete 
          ? 1
          : selectedOrders.filter(orderId => {
              const order = pagedOrders.find(o => o.orderId === orderId);
              return order?.orderStatus === 'Cancelled';
            }).length;
        
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div className="bg-white rounded-lg border border-[#e6e6e6] p-4 w-full max-w-sm">
              <h2 className="text-lg font-bold mb-2 text-red-500">
                {isSingleDelete
                  ? tTable('deleteModal.titleSingle')
                  : tTable('deleteModal.titleBulk')}
              </h2>
              <p className="mb-4 text-gray-500">
                {isSingleDelete
                  ? tTable('deleteModal.confirmSingle')
                  : tTable('deleteModal.confirmBulk', { count: cancelledCount })}
              </p>
            <p className="mb-4 text-xs text-orange-600 bg-orange-50 p-2 rounded">
              <strong>{tTable('deleteModal.warningLabel')}</strong>{' '}
              {isSingleDelete
                ? tTable('deleteModal.warningSingle')
                : tTable('deleteModal.warningBulk', { count: cancelledCount })}
            </p>
            <div className="flex justify-end gap-2">
              <button
                className="px-4 py-2 rounded-lg bg-gray-200 text-gray-700 hover:bg-gray-300"
                onClick={() => {
                  setShowDeleteModal(false);
                  setOrderToDelete(null);
                }}
              >
                {tShared('cancel')}
              </button>
              <button
                className="px-4 py-2 rounded-lg bg-red-600 text-white hover:bg-red-700"
                onClick={handleBulkDelete}
              >
                {tTable('deleteModal.deleteButton')}
              </button>
            </div>
          </div>
        </div>
        );
      })()}
    </div>
  );
}
