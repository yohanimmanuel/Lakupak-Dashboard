'use client';
import React, { useMemo } from 'react';
import { Package, DollarSign, ShoppingCart } from 'lucide-react';
import { Order } from '@/types/order';
import { formatCurrency, getDefaultCurrency } from '@/utils/currencyUtils';
import { calculateOrderTotalAmount } from '@/utils/orderCalculations';
import { useUserStore } from '@/store/userStore';
import { AnalyticsMetricCard } from '@/components/analyticsperformance/FinancialAnalytics';
import { OperationalMetricCard } from '@/components/analyticsperformance/OperationalPerformanceAnalytics';
import { isDeliveryStopComplete } from '@/utils/deliveryCompletion';
import { computeOrderMonthOverMonthGrowth } from '@/utils/monthOverMonthGrowth';
import { useOrdersTranslations } from '@/hooks/useOrdersTranslations';

interface OrdersCardsProps {
  orders: Order[];
}

function isCompletedOrder(status: string): boolean {
  return status === 'Shipped' || isDeliveryStopComplete(status);
}

export default function OrdersCards({ orders }: OrdersCardsProps) {
  const { tCards } = useOrdersTranslations();
  const user = useUserStore((state) => state.user);

  const validOrders = Array.isArray(orders) ? orders : [];

  const totalOrders = validOrders.length;
  const completedOrders = validOrders.filter((o) => isCompletedOrder(o.orderStatus)).length;
  const completionRate = totalOrders > 0 ? (completedOrders / totalOrders) * 100 : 0;

  const orderVolume = validOrders.reduce((sum, order) => sum + calculateOrderTotalAmount(order), 0);
  const averageOrderVolume = totalOrders > 0 ? orderVolume / totalOrders : 0;

  const growth = useMemo(() => computeOrderMonthOverMonthGrowth(validOrders), [validOrders]);

  const displayCurrency = user?.currency || getDefaultCurrency();

  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">
      <AnalyticsMetricCard
        title={tCards('totalOrders')}
        value={totalOrders.toLocaleString()}
        change={growth.ordersGrowth}
        icon={<Package className="w-6 h-6 text-emerald-600" />}
        color="bg-white"
      />
      <AnalyticsMetricCard
        title={tCards('orderVolume')}
        value={formatCurrency(orderVolume, displayCurrency)}
        change={growth.orderVolumeGrowth}
        icon={<DollarSign className="w-6 h-6 text-[#0a61d7]" />}
        color="bg-[#f7faff]"
      />
      <OperationalMetricCard
        title={tCards('completionRate')}
        value={`${completionRate.toFixed(1)}%`}
        change={growth.completionGrowth}
        icon={<ShoppingCart className="w-6 h-6 text-green-600" />}
        color="bg-white"
      />
      <AnalyticsMetricCard
        title={tCards('averageOrderVolume')}
        value={formatCurrency(averageOrderVolume, displayCurrency)}
        change={growth.averageOrderVolumeGrowth}
        icon={<DollarSign className="w-6 h-6 text-emerald-600" />}
        color="bg-[#e6f7ec]"
      />
    </div>
  );
}
