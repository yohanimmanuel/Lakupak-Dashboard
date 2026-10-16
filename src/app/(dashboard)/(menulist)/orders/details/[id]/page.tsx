'use client';
import React, { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import OrderDetails from '@/components/ordershipment/OrderDetails';
import { SkeletonOrderDetailPage } from '@/components/skeleton/SkeletonOrderDetailPage';
import { Order } from '@/types/order';
import { useUserStore } from '@/store/userStore';

import { useOrdersTranslations } from '@/hooks/useOrdersTranslations';

export default function OrderDetailsPage() {
  const { tDetailsPage } = useOrdersTranslations();
  const user = useUserStore(state => state.user);
  const params = useParams();
  const router = useRouter();
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);

  const orderIdParam = (params?.id as string | undefined) ?? null; // Full orderId e.g. "LKO-12345678"

  // Fetch real order data from database
  useEffect(() => {
    if (!orderIdParam) {
      setOrder(null);
      setLoading(false);
      return;
    }

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
      } catch (error) {
        setOrder(null);
      } finally {
        setLoading(false);
      }
    };

    fetchOrder();
  }, [orderIdParam, user?.id]);

  const handleBack = () => {
    router.push('/orders');
  };

  if (loading) {
    return <SkeletonOrderDetailPage />;
  }

  if (!order) {
    return (
      <div className="flex min-h-full w-full min-w-0 flex-col bg-gradient-to-b from-gray-50 to-white p-4">
        <div className="w-full min-w-0">
          <div className="text-center py-12">
            <h2 className="text-2xl font-semibold text-gray-900 mb-2">{tDetailsPage('notFoundTitle')}</h2>
            <p className="text-gray-600 mb-4">{tDetailsPage('notFoundDescription')}</p>
            <button
              onClick={handleBack}
              className="px-4 py-2 bg-[#0a61d7] text-white rounded-lg hover:bg-[#0851b8] transition-colors"
            >
              {tDetailsPage('backToOrders')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-full w-full min-w-0 flex-col bg-gradient-to-b from-gray-50 to-white p-4">
      <div className="w-full min-w-0">
        <OrderDetails order={order} onBack={handleBack} />
      </div>
    </div>
  );
}
