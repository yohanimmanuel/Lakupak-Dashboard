'use client';
import React, { useState, useEffect } from 'react';
import { Download } from 'lucide-react';
import OrdersCards from '@/components/ordershipment/OrdersCards';
import OrdersGPS from '@/components/ordershipment/OrdersGPS';
import OrdersTable from '@/components/ordershipment/OrdersTable';
import { Order, OrderTableRow } from '@/types/order';
import { calculateOrderTotalAmount } from '@/utils/orderUtils';
import * as XLSX from 'xlsx';
import { useUserStore } from '@/store/userStore';

export default function OrdersPage() {
  const user = useUserStore(state => state.user);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch orders from database
  useEffect(() => {
    const fetchOrders = async () => {
      try {
        setLoading(true);
        // For backward compatibility, fetch orders without userId if user not authenticated
        const url = user?.id ? `/api/orders?userId=${user.id}` : '/api/orders';
        
        const response = await fetch(url);
        
        if (!response.ok) {
          throw new Error('Failed to fetch orders');
        }
        
        const data = await response.json();
        setOrders(data.orders || []);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch orders');
        setOrders([]);
      } finally {
        setLoading(false);
      }
    };

    fetchOrders();
  }, [user?.id]);

  const orderToTableRow = (order: Order): OrderTableRow => {
    return {
      id: order.id,
      orderId: order.orderId,
      buyerId: order.buyerId,
      buyerName: order.contactPerson,
      orderDate: new Date(order.orderDate).toISOString(), // Convert string to Date first
      orderStatus: order.orderStatus,
      paymentStatus: order.paymentStatus,
      totalAmount: calculateOrderTotalAmount(order).toFixed(2),
      currency: user?.currency || 'IDR', // Use user's currency instead of order's
      items: `${order.orderItems.length} items`,
      deliveryMethod: order.deliveryMethod,
      trackingNumber: order.trackingNumber,
      createdAt: new Date(order.createdAt).toISOString(), // Convert string to Date first
      updatedAt: new Date(order.updatedAt).toISOString()  // Convert string to Date first
    };
  };

  const handleExportXLSX = (workbook: XLSX.WorkBook, filename: string) => {
    XLSX.writeFile(workbook, filename);
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white p-4">
      <div className="w-full mx-auto">
        {/* Header Section */}
        <div className="mb-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Orders Management</h1>
              <p className="text-sm text-gray-600 mt-2">
                Track and manage all your B2B marketplace orders
              </p>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => handleExportXLSX(
                  XLSX.utils.book_new(),
                  `orders_${new Date().toISOString().split('T')[0]}.xlsx`
                )}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-[#0a61d7] rounded-lg hover:bg-[#0851b8] transition-colors"
              >
                <Download className="w-4 h-4" />
                Export Data
              </button>
            </div>
          </div>
        </div>

        {/* Loading State */}
        {loading && (
          <div className="flex items-center justify-center h-64">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#0a61d7] mx-auto mb-4"></div>
              <p className="text-gray-600">Loading orders...</p>
            </div>
          </div>
        )}

        {/* Error State */}
        {error && !loading && (
          <div className="text-center py-12">
            <div className="text-red-600 mb-4">
              <p className="text-lg font-semibold">Error loading orders</p>
              <p className="text-sm">{error}</p>
            </div>
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 bg-[#0a61d7] text-white rounded-lg hover:bg-[#0851b8] transition-colors"
            >
              Retry
            </button>
          </div>
        )}

        {/* Orders Content */}
        {!loading && !error && (
          <>
            {/* Orders GPS and Cards Section */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
              {/* GPS Map - Left Side */}
              <div className="lg:col-span-2">
                <OrdersGPS orders={orders} />
              </div>
              
              {/* Stat Cards - Right Side */}
              <div>
                <OrdersCards orders={orders} />
              </div>
            </div>

            {/* Orders Table Section */}
            <OrdersTable
              orders={orders}
              setOrders={setOrders}
              onExportXLSX={handleExportXLSX}
              orderToTableRow={orderToTableRow}
            />
          </>
        )}
      </div>
    </div>
  );
}
