'use client';
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Download, Archive, Eye, Check, RefreshCw } from 'lucide-react';
import { formatCurrency, getDefaultCurrency } from '@/utils/currencyUtils';
import { parseNumberByCurrency } from '@/config/currencyConfig';
import OrdersCards from '@/components/ordershipment/OrdersCards';
import OrdersGPS from '@/components/ordershipment/OrdersGPS';
import OrdersTable from '@/components/ordershipment/OrdersTable';
import { Order, OrderTableRow } from '@/types/order';
import { calculateOrderTotalAmount } from '@/utils/orderCalculations';
import * as XLSX from 'xlsx';
import { useUserStore } from '@/store/userStore';
import { OrdersTourBanner } from '@/components/tours/OrdersTourBanner';
import { usePendingDashboardTourStart } from '@/hooks/usePendingDashboardTourStart';
import { useOrdersTranslations } from '@/hooks/useOrdersTranslations';

export default function OrdersPage() {
  const { tList } = useOrdersTranslations();
  const user = useUserStore(state => state.user);
  const [orders, setOrders] = useState<Order[]>([]);
  const [showArchivedModal, setShowArchivedModal] = useState(false);
  const [archivedOrders, setArchivedOrders] = useState<Order[]>([]);
  const userCurrency = (useUserStore.getState().user?.currency) || getDefaultCurrency();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showOverlay, setShowOverlay] = useState(false);
  const [overlayMessage, setOverlayMessage] = useState('');
  const [isSlidingIn, setIsSlidingIn] = useState(false);
  const [isSlidingOut, setIsSlidingOut] = useState(false);
  const overlayTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const hasLoadedOrdersRef = useRef(false);

  // Unified fetch function (used on load and by Refresh button)
  const fetchOrders = useCallback(async () => {
    try {
      setLoading(true);
      if (overlayTimeoutRef.current) {
        clearTimeout(overlayTimeoutRef.current);
      }
      if (hasLoadedOrdersRef.current) {
        setIsSlidingOut(false);
        setIsSlidingIn(true);
        setOverlayMessage(tList('refreshingOverlay'));
      } else {
        setIsSlidingIn(true);
        setOverlayMessage(tList('loadingOverlay'));
      }

      // For backward compatibility, fetch orders without userId if user not authenticated
      const url = user?.id ? `/api/orders?userId=${user.id}` : '/api/orders';
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error('Failed to fetch orders');
      }
      const data = await response.json();
      const list: Order[] = data.orders || [];
      setOrders(list);
      hasLoadedOrdersRef.current = true;
      setOverlayMessage(tList('loadedOverlay', { count: list.length }));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : tList('errorOverlay'));
      setOrders([]);
      setOverlayMessage(tList('errorOverlay'));
    } finally {
      setLoading(false);
      // Complete slide-in animation and show overlay
      setTimeout(() => {
        setIsSlidingIn(false);
        setShowOverlay(true);
      }, 1500);
      // Auto-hide overlay after 2.5 seconds
      overlayTimeoutRef.current = setTimeout(() => {
        setIsSlidingOut(true);
        setShowOverlay(false);
        setTimeout(() => {
          setIsSlidingOut(false);
        }, 500);
      }, 2500);
    }
  }, [user?.id, tList]);

  // Fetch orders from database on mount/user change
  useEffect(() => {
    fetchOrders();
    return () => {
      if (overlayTimeoutRef.current) {
        clearTimeout(overlayTimeoutRef.current);
      }
    };
  }, [fetchOrders]); // Now fetchOrders is properly memoized, so we can include it

  usePendingDashboardTourStart('orders', { ready: !loading && !error });

  const fetchArchived = async () => {
    try {
      const ts = Date.now();
      const url = user?.id ? `/api/orders?userId=${user.id}&archived=1&_=${ts}` : `/api/orders?archived=1&_=${ts}`;
      const response = await fetch(url);
      if (!response.ok) throw new Error('Failed to fetch archived orders');
      const data = await response.json();
      setArchivedOrders(data.orders || []);
    } catch {}
  };

  const orderToTableRow = (order: Order): OrderTableRow => {
    return {
      id: order.id,
      orderId: order.orderId,
      buyerId: order.buyerId,
      buyerName: order.contactPerson,
      orderDate: new Date(order.orderDate).toISOString(), // Convert string to Date first
      orderStatus: order.orderStatus,
      paymentStatus: order.paymentStatus,
      totalAmount: order.totalAmount.toString(),
 // Use user's currency instead of order's
      items: `${order.orderItems.length} items`,
      deliveryMethod: order.deliveryMethod,
      trackingNumber: order.trackingNumber,
      createdAt: new Date(order.createdAt).toISOString(), // Convert string to Date first
      updatedAt: new Date(order.updatedAt).toISOString()  // Convert string to Date first
    };
  };

  // Export current orders to XLSX (parent-level export)
  const exportOrdersXLSX = () => {
    try {
      // Shape rows with human-friendly headers
      const rows = orders.map(o => ({
        OrderID: o.orderId,
        Buyer: o.contactPerson,
        OrderDate: new Date(o.orderDate).toISOString().split('T')[0],
        Status: o.orderStatus,
        PaymentStatus: o.paymentStatus,
        Items: o.orderItems.length,
        TotalAmount: Number(calculateOrderTotalAmount(o)),
        DeliveryMethod: o.deliveryMethod,
        TrackingNumber: o.trackingNumber || ''
      }));

      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(rows);
      XLSX.utils.book_append_sheet(wb, ws, 'Orders');
      XLSX.writeFile(wb, `orders_${new Date().toISOString().split('T')[0]}.xlsx`);
    } catch (_) {
      // noop per user preference to avoid console logs
    }
  };

  const handleExportXLSX = (workbook: XLSX.WorkBook, filename: string) => {
    XLSX.writeFile(workbook, filename);
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white p-4">
      <div className="w-full mx-auto">
        {/* Header Section */}
        <OrdersTourBanner />

        <div className="mb-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div data-tour="orders-page-header">
              <h1 className="text-2xl font-bold text-gray-900">{tList('title')}</h1>
              <p className="text-sm text-gray-600 mt-2">
                {tList('subtitle')}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3" data-tour="orders-actions">
              <button
                onClick={fetchOrders}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white border border-[#e6e6e6] text-black font-medium hover:bg-gray-100 transition text-sm"
                disabled={loading}
              >
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                {tList('refresh')}
              </button>
              <button
                onClick={async () => { await fetchArchived(); setShowArchivedModal(true); }}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white border border-[#e6e6e6] text-black font-medium hover:bg-gray-100 transition text-sm"
              >
                <Archive className="w-4 h-4" />
                {tList('archivedOrders')}
              </button>
              <button
                onClick={exportOrdersXLSX}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-[#0a61d7] rounded-lg hover:bg-[#0851b8] transition-colors"
              >
                <Download className="w-4 h-4" />
                {tList('exportData')}
              </button>
            </div>
          </div>
        </div>

        {/* Error State */}
        {error && !loading && (
          <div className="text-center py-12">
            <div className="text-red-600 mb-4">
              <p className="text-lg font-semibold">{tList('errorTitle')}</p>
              <p className="text-sm">{error}</p>
            </div>
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 bg-[#0a61d7] text-white rounded-lg hover:bg-[#0851b8] transition-colors"
            >
              {tList('retry')}
            </button>
          </div>
        )}

        {/* Orders Content — keep mounted while loading so product-tour anchors exist */}
        {!error && (
          <>
            {/* Stat cards above full-width map */}
            <div className="mb-3" data-tour="orders-cards">
              <OrdersCards orders={orders} />
            </div>

            <div className="mb-3 w-full" data-tour="orders-map">
              <OrdersGPS orders={orders} />
            </div>

            {/* Orders Table Section */}
            <OrdersTable
              orders={orders}
              setOrdersAction={setOrders}
              onExportXLSXAction={handleExportXLSX}
              orderToTableRowAction={orderToTableRow}
              onRefreshAction={fetchOrders}
            />
          </>
        )}

        {/* Data Status Overlay */}
        {(showOverlay || isSlidingIn || isSlidingOut) && (
          <div className={`fixed top-20 right-6 z-50 bg-white border border-green-300 rounded-lg shadow-lg p-4 min-w-[280px] transform transition-all duration-500 ease-out ${
            isSlidingIn ? 'translate-x-0 opacity-100' : 
            isSlidingOut ? 'translate-x-full opacity-0' : 
            'translate-x-full opacity-0'
          }`}>
            <div className="flex items-center gap-3">
              {loading ? (
                <div className="w-5 h-5 border-2 border-[#0a61d7] border-t-transparent rounded-full animate-spin"></div>
              ) : (
                <div className="w-6 h-6 bg-green-500 rounded-full flex items-center justify-center">
                  <Check className="w-4 h-4 text-white" />
                </div>
              )}
              <div>
                <p className="text-sm font-medium text-gray-900">{overlayMessage}</p>
                <p className="text-xs text-gray-500">
                  {loading ? tList('pleaseWait') : orders.length === 1 ? tList('ordersLoaded', { count: orders.length }) : tList('ordersLoadedPlural', { count: orders.length })}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Archived Modal */}
        {showArchivedModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg border border-[#e6e6e6] w-[95vw] max-w-4xl max-h-[85vh] overflow-hidden">
              <div className="p-4 border-b flex items-center justify-between">
                <h3 className="text-lg font-semibold text-gray-900">{tList('archivedTitle')}</h3>
                <button onClick={() => setShowArchivedModal(false)} className="px-4 py-2 border border-[#e6e6e6] rounded-lg text-sm text-gray-700 hover:bg-gray-100">{tList('close')}</button>
              </div>
              <div className="p-4 overflow-auto" style={{maxHeight:'70vh'}}>
                {archivedOrders.length === 0 ? (
                  <div className="text-center text-gray-500 text-sm py-8">{tList('noArchived')}</div>
                ) : (
                  <ul className="divide-y divide-gray-200">
                    {archivedOrders.map((o) => (
                      <li key={o.id} className="py-3 flex items-center justify-between">
                        <div className="min-w-0">
                          <div className="text-sm font-semibold text-gray-900">{o.orderId}</div>
                          <div className="text-xs text-gray-500">
                            {o.contactPerson} • {new Date(o.orderDate).toLocaleDateString()} • {tList('itemsCount', { count: o.orderItems.length })}
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="text-sm font-semibold text-[#0a61d7]">
                            {formatCurrency(parseNumberByCurrency(String(o.totalAmount), userCurrency), userCurrency)}
                          </div>
                          <button
                            onClick={() => window.location.href = `/orders/details/${o.orderId}`}
                            className="px-3 py-1 text-sm text-[#0a61d7] border border-[#e6e6e6] rounded-lg hover:bg-gray-50 inline-flex items-center gap-1"
                          >
                            <Eye className="w-4 h-4" /> {tList('view')}
                          </button>
                          <button
                            onClick={async () => {
                              await fetch('/api/orders', {
                                method: 'PUT',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ orderId: o.orderId, unarchive: true, userId: user?.id })
                              });
                              // Move back to active list immediately
                              setArchivedOrders(prev => prev.filter(x => x.orderId !== o.orderId));
                              setOrders(prev => [{ ...o, archivedAt: null }, ...prev]);
                            }}
                            className="px-3 py-1 text-sm text-gray-700 border border-[#e6e6e6] rounded-lg hover:bg-gray-50"
                          >
                            {tList('unarchive')}
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
