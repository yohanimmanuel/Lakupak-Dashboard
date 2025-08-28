'use client';
import React, { useState, useRef, useLayoutEffect } from "react";
import { useRouter } from 'next/navigation';
import { Search, Eye, Filter, Calendar, ChevronDown, ChevronLeft, ChevronRight, Download } from "lucide-react";
import * as XLSX from 'xlsx';
import { useUserStore } from '@/store/userStore';
import { formatDateLong, formatNumber } from '@/utils/dateUtils';
import { Order, OrderTableRow } from '@/types/order';

const statusTabs = [
  { label: "All" },
  { label: "Pending" },
  { label: "Confirmed" },
  { label: "Packed" },
  { label: "Shipped" },
  { label: "Delivered" },
  { label: "Cancelled" },
  { label: "Returned" },
];

const paymentTabs = [
  { label: "All" },
  { label: "Unpaid" },
  { label: "Paid" },
  { label: "Overdue" },
];

export default function OrdersTable({ 
  orders = [], 
  setOrders, 
  onSelectOrder, 
  onExportXLSX, 
  orderToTableRow 
}: { 
  orders?: Order[]; 
  setOrders?: (fn: (prev: Order[]) => Order[]) => void; 
  onSelectOrder?: (order: Order) => void; 
  onExportXLSX?: (wb: XLSX.WorkBook, filename: string) => void; 
  orderToTableRow: (order: Order) => OrderTableRow 
}) {
  const user = useUserStore(state => state.user);
  
  const tableRows = orders.map(orderToTableRow);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [selectedStatusTab, setSelectedStatusTab] = useState("All");
  const [selectedPaymentTab, setSelectedPaymentTab] = useState("All");
  const [showFilterDropdown, setShowFilterDropdown] = useState(false);
  const [showPaymentDropdown, setShowPaymentDropdown] = useState(false);
  
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
  
  // Apply search filter
  if (search) {
    filteredOrders = filteredOrders.filter((o: OrderTableRow) => 
      String(o.orderId).toLowerCase().includes(search.toLowerCase()) ||
      String(o.buyerName).toLowerCase().includes(search.toLowerCase()) ||
      String(o.trackingNumber).toLowerCase().includes(search.toLowerCase())
    );
  }
  
  const totalRows = filteredOrders.length;
  const totalPages = Math.max(1, Math.ceil(totalRows / rowsPerPage));
  const pagedOrders = filteredOrders.slice((page - 1) * rowsPerPage, page * rowsPerPage);
  const fromRow = totalRows === 0 ? 0 : (page - 1) * rowsPerPage + 1;
  const toRow = Math.min(page * rowsPerPage, totalRows);

  const [selectedOrders, setSelectedOrders] = useState<string[]>([]);
  
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
      case 'Cancelled': return 'bg-red-100 text-red-500';
      case 'Returned': return 'bg-orange-100 text-orange-500';
      default: return 'bg-gray-100 text-gray-500';
    }
  };

  const getPaymentStatusColor = (status: string) => {
    switch (status) {
      case 'Unpaid': return 'bg-red-100 text-red-500';
      case 'Paid': return 'bg-green-100 text-green-500';
      case 'Overdue': return 'bg-orange-100 text-orange-500';
      default: return 'bg-gray-100 text-gray-500';
    }
  };

  const handleExport = () => {
    if (onExportXLSX) {
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(filteredOrders);
      XLSX.utils.book_append_sheet(wb, ws, "Orders");
              onExportXLSX(wb, `orders_${new Date().toISOString().split('T')[0]}.xlsx`);
    }
  };

  const handleOrderClick = (order: OrderTableRow) => {
    const originalOrder = orders.find(o => o.id === order.id);
    if (originalOrder && onSelectOrder) {
      onSelectOrder(originalOrder);
    }
  };

  const handleOrderSelect = (orderId: string) => {
    setSelectedOrders(prev => 
      prev.includes(orderId) 
        ? prev.filter(id => id !== orderId)
        : [...prev, orderId]
    );
  };

  const handleRowClick = (orderId: string, event: React.MouseEvent) => {
    // Don't trigger row selection if clicking on action buttons or checkbox
    if ((event.target as HTMLElement).closest('button') || (event.target as HTMLElement).closest('th')) {
      return;
    }
    handleOrderSelect(orderId);
  };

  const handleSelectAll = () => {
    if (selectedOrders.length === pagedOrders.length) {
      setSelectedOrders([]);
    } else {
      setSelectedOrders(pagedOrders.map(order => order.id));
    }
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
                ref={(el) => { tabRefs.current[idx] = el; }}
                onClick={() => {
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
              placeholder="Search orders..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2 rounded-lg border border-[#e6e6e6] text-sm text-black focus:outline-none focus:ring-2 focus:ring-[#0a61d7] bg-white"
            />
            <Search className="absolute left-3 top-2 text-gray-400 w-5 h-5" />
          </div>
          
          {/* Payment Status Filter */}
          <div className="relative">
            <button
              className="flex items-center gap-1 px-3 py-2 rounded-lg border border-[#e6e6e6] bg-white text-gray-700 hover:bg-gray-100 text-sm"
              onClick={() => {
                setShowPaymentDropdown(v => !v);
                setShowFilterDropdown(false);
              }}
            >
              <Filter className="w-4 h-4" />
              {selectedPaymentTab}
              <ChevronDown className="w-4 h-4 ml-1 text-gray-500" />
            </button>
            {showPaymentDropdown && (
              <div className="absolute right-0 mt-2 w-31.5 bg-white border border-gray-200 rounded-lg shadow z-20">
                {paymentTabs.map(opt => (
                  <button
                    key={opt.label}
                    onClick={() => { setSelectedPaymentTab(opt.label); setShowPaymentDropdown(false); }}
                    className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-100 ${selectedPaymentTab === opt.label ? 'font-bold text-[#0a61d7]' : 'text-gray-700'}`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="overflow-x-auto hidden md:block rounded-lg">
        <table className="min-w-full text-sm text-left whitespace-nowrap text-xs">
          <thead className="bg-gray-100 text-gray-500 whitespace-nowrap">
            <tr>
              <th className="py-3 px-4 font-medium uppercase">
                <button
                  onClick={handleSelectAll}
                  className={`w-4 h-4 border-2 rounded transition-all duration-200 flex items-center justify-center ${
                    selectedOrders.length === pagedOrders.length && pagedOrders.length > 0
                      ? 'bg-green-500 border-green-500'
                      : 'bg-white border-gray-300 hover:border-green-400'
                  }`}
                >
                  {selectedOrders.length === pagedOrders.length && pagedOrders.length > 0 && (
                    <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  )}
                </button>
              </th>
                             <th className="py-3 px-4 font-medium uppercase">Order</th>
               <th className="py-3 px-4 font-medium uppercase">Date</th>
               <th className="py-3 px-4 font-medium uppercase">Buyer</th>
               <th className="py-3 px-4 font-medium uppercase">Status</th>
               <th className="py-3 px-4 font-medium uppercase">Total</th>
               <th className="py-3 px-4 font-medium uppercase">Items</th>
               <th className="py-3 px-4 font-medium uppercase">Delivery</th>
               <th className="py-3 px-4 font-medium uppercase">Tracking</th>
               <th className="py-3 px-4 font-medium uppercase">Payment</th>
               <th className="py-3 px-4 font-medium uppercase text-center">Actions</th>
            </tr>
          </thead>
          <tbody className="bg-white">
            {pagedOrders.map((order) => (
              <tr 
                key={order.id} 
                className={`border-b transition cursor-pointer ${
                  selectedOrders.includes(order.id) 
                    ? 'bg-blue-50' 
                    : 'hover:bg-gray-50'
                }`} 
                onClick={(e) => handleRowClick(order.id, e)}
              >
                <td className="py-3 px-4 text-xs">
                  <button
                    onClick={() => handleOrderSelect(order.id)}
                    className={`w-4 h-4 border-2 rounded transition-all duration-200 flex items-center justify-center ${
                      selectedOrders.includes(order.id)
                        ? 'bg-green-500 border-green-500'
                        : 'bg-white border-gray-300 hover:border-green-400'
                    }`}
                  >
                    {selectedOrders.includes(order.id) && (
                      <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    )}
                  </button>
                </td>
                                 <td className="max-w-30 py-3 px-4 font-medium text-black truncate">#{order.orderId}</td>
                 <td className="py-3 px-4 text-black">{formatDateLong(order.orderDate)}</td>
                 <td className="max-w-30 py-3 px-4 font-medium text-black truncate">{order.buyerName}</td>
                 <td className="py-3 px-4">
                   <span className={`inline-block px-2 py-1 rounded-full text-xs font-bold ${getStatusColor(order.orderStatus)}`}>
                     {order.orderStatus}
                   </span>
                 </td>
                                   <td className="py-3 px-4 text-[#0a61d7] font-semibold">${formatNumber(parseFloat(order.totalAmount))}</td>
                 <td className="py-3 px-4 text-black">{order.items}</td>
                 <td className="py-3 px-4 text-black">{order.deliveryMethod}</td>
                 <td className="py-3 px-4 text-black">{order.trackingNumber || 'N/A'}</td>
                 <td className="py-3 px-4">
                   <span className={`inline-block px-2 py-1 rounded-full text-xs font-bold ${getPaymentStatusColor(order.paymentStatus)}`}>
                     {order.paymentStatus}
                   </span>
                 </td>
                 <td className="py-3 px-4 text-center">
                  <button
                    className="inline-flex items-center justify-center rounded-lg p-2 hover:bg-blue-100 transition"
                    onClick={() => handleOrderClick(order)}
                  >
                    <Eye className="w-4 h-4 text-[#0a61d7]" />
                  </button>
                </td>
              </tr>
            ))}
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
              selectedOrders.length === pagedOrders.length && pagedOrders.length > 0
                ? 'bg-green-500 border-green-500'
                : 'bg-white border-gray-300 hover:border-green-400'
            }`}
          >
            {selectedOrders.length === pagedOrders.length && pagedOrders.length > 0 && (
              <svg className="w-2.5 h-2.5 text-white" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
            )}
          </button>
          <span className="text-sm font-medium text-gray-700">
            Select All ({pagedOrders.length} orders)
          </span>
        </div>
        
        <div className="flex flex-col gap-4">
          {pagedOrders.map(order => (
            <div 
              key={order.id} 
              className={`rounded-lg shadow p-4 flex flex-col gap-2 relative cursor-pointer transition ${
                selectedOrders.includes(order.id) 
                  ? 'bg-blue-50' 
                  : 'bg-white hover:bg-gray-50'
              }`}
              onClick={() => handleOrderSelect(order.id)}
            >
              {/* Checkbox - Top Right Corner */}
              <div className="absolute top-3 right-3 z-10">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleOrderSelect(order.id);
                  }}
                  className={`w-4 h-4 border-2 rounded transition-all duration-200 flex items-center justify-center ${
                    selectedOrders.includes(order.id)
                      ? 'bg-green-500 border-green-500'
                      : 'bg-white border-gray-300 hover:border-green-400'
                  }`}
                >
                  {selectedOrders.includes(order.id) && (
                    <svg className="w-2.5 h-2.5 text-white" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  )}
                </button>
              </div>
              
              <div className="text-xs text-gray-500">Order: <span className="text-black font-medium">#{order.orderId}</span></div>
              <div className="flex items-center justify-between">
                <span className="font-bold text-[#0a61d7]">{order.buyerName}</span>
                <div className="flex items-center gap-2">
                  <button
                    className="inline-flex items-center justify-center rounded-lg p-2 hover:bg-blue-100 transition"
                    onClick={() => handleOrderClick(order)}
                  >
                    <Eye className="w-4 h-4 text-[#0a61d7]" />
                  </button>
                </div>
              </div>
                             <div className="text-xs text-gray-500">Date: <span className="text-black font-medium">{formatDateLong(order.orderDate)}</span></div>
               <div className="text-xs text-gray-500">Status: <span className={`inline-block px-2 py-1 rounded-full font-bold ${getStatusColor(order.orderStatus)}`}>{order.orderStatus}</span></div>
                               <div className="text-xs text-gray-500">Total: <span className="text-[#0a61d7] font-semibold">${formatNumber(parseFloat(order.totalAmount))}</span></div>
               <div className="text-xs text-gray-500">Items: <span className="text-black font-medium">{order.items}</span></div>
               <div className="text-xs text-gray-500">Delivery: <span className="text-black font-medium">{order.deliveryMethod}</span></div>
               <div className="text-xs text-gray-500">Tracking: <span className="text-black font-medium">{order.trackingNumber || 'N/A'}</span></div>
               <div className="text-xs text-gray-500">Payment: <span className={`inline-block px-2 py-1 rounded-full font-bold ${getPaymentStatusColor(order.paymentStatus)}`}>{order.paymentStatus}</span></div>
            </div>
          ))}
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
    </div>
  );
}
