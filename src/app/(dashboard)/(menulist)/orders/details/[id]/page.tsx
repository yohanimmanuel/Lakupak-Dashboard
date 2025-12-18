'use client';
import React, { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import OrderDetails from '@/components/ordershipment/OrderDetails';
import { Order } from '@/types/order';
import { useUserStore } from '@/store/userStore';

export default function OrderDetailsPage() {
  const user = useUserStore(state => state.user);
  const params = useParams();
  const router = useRouter();
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);

  const orderIdParam = params.id as string; // This will be the full orderId like "LKO-12345678"

  // Fetch real order data from database
  useEffect(() => {
    const fetchOrder = async () => {
      try {
        setLoading(true);
        // For backward compatibility, fetch order without userId if user not authenticated
        const url = user?.id 
          ? `/api/orders?id=${orderIdParam}&userId=${user.id}`
          : `/api/orders?id=${orderIdParam}`;
        
        const response = await fetch(url);
        
        if (!response.ok) {
          throw new Error('Failed to fetch order');
        }
        
        const orderData = await response.json();
        
        // Convert string dates to Date objects for the frontend
        const orderWithDates = {
          ...orderData,
          orderDate: new Date(orderData.orderDate),
          createdAt: new Date(orderData.createdAt),
          updatedAt: new Date(orderData.updatedAt),
          acceptedAt: orderData.acceptedAt ? new Date(orderData.acceptedAt) : null
        };
        
        setOrder(orderWithDates);
        setLoading(false);
      } catch (error) {
        setLoading(false);
      }
    };

    if (orderIdParam) {
      fetchOrder();
    }
  }, [orderIdParam, user?.id]);

  const handleBack = () => {
    router.push('/orders');
  };

  if (loading) {
    return (
      <div className="w-full mx-auto p-4 bg-gray-50 min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-[#0a61d7] border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600">Loading order details...</p>
        </div>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white p-4">
        <div className="w-full mx-auto">
          <div className="text-center py-12">
            <h2 className="text-2xl font-semibold text-gray-900 mb-2">Order Not Found</h2>
            <p className="text-gray-600 mb-4">The order you're looking for doesn't exist.</p>
            <button
              onClick={handleBack}
              className="px-4 py-2 bg-[#0a61d7] text-white rounded-lg hover:bg-[#0851b8] transition-colors"
            >
              Back to Orders
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white p-4">
      <div className="w-full mx-auto">
        <OrderDetails order={order} onBack={handleBack} />
      </div>
    </div>
  );
}
