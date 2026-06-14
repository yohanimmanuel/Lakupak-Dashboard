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

interface OrdersCardsProps {
  orders: Order[];
}

function isCompletedOrder(status: string): boolean {
  return status === 'Shipped' || isDeliveryStopComplete(status);
}

export default function OrdersCards({ orders }: OrdersCardsProps) {
  const user = useUserStore((state) => state.user);

  const validOrders = Array.isArray(orders) ? orders : [];

  const totalOrders = validOrders.length;
  const completedOrders = validOrders.filter((o) => isCompletedOrder(o.orderStatus)).length;
  const completionRate = totalOrders > 0 ? (completedOrders / totalOrders) * 100 : 0;

  const orderVolume = validOrders.reduce((sum, order) => sum + calculateOrderTotalAmount(order), 0);
  const averageOrderVolume = totalOrders > 0 ? orderVolume / totalOrders : 0;

  const growth = useMemo(() => {
    const safeOrders = Array.isArray(orders) ? orders : [];
    if (!safeOrders.length) {
      return {
        ordersGrowth: 0,
        orderVolumeGrowth: 0,
        completionGrowth: 0,
        averageOrderVolumeGrowth: 0,
      };
    }

    const byMonth: Record<string, { orders: number; orderVolume: number; completed: number }> = {};

    safeOrders.forEach((order) => {
      const d = new Date(order.orderDate);
      if (Number.isNaN(d.getTime())) return;
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      if (!byMonth[key]) {
        byMonth[key] = { orders: 0, orderVolume: 0, completed: 0 };
      }
      const bucket = byMonth[key];
      bucket.orders += 1;
      bucket.orderVolume += calculateOrderTotalAmount(order);
      if (isCompletedOrder(order.orderStatus)) {
        bucket.completed += 1;
      }
    });

    const keys = Object.keys(byMonth).sort();
    if (keys.length < 2) {
      return {
        ordersGrowth: 0,
        orderVolumeGrowth: 0,
        completionGrowth: 0,
        averageOrderVolumeGrowth: 0,
      };
    }

    const last = byMonth[keys[keys.length - 1]];
    const prev = byMonth[keys[keys.length - 2]];

    const ordersGrowth = prev.orders > 0 ? ((last.orders - prev.orders) / prev.orders) * 100 : 0;
    const orderVolumeGrowth =
      prev.orderVolume > 0 ? ((last.orderVolume - prev.orderVolume) / prev.orderVolume) * 100 : 0;

    const completionLast = last.orders > 0 ? (last.completed / last.orders) * 100 : 0;
    const completionPrev = prev.orders > 0 ? (prev.completed / prev.orders) * 100 : 0;
    const completionGrowth =
      completionPrev !== 0
        ? ((completionLast - completionPrev) / Math.abs(completionPrev)) * 100
        : 0;

    const avgLast = last.orders > 0 ? last.orderVolume / last.orders : 0;
    const avgPrev = prev.orders > 0 ? prev.orderVolume / prev.orders : 0;
    const averageOrderVolumeGrowth =
      avgPrev !== 0 ? ((avgLast - avgPrev) / Math.abs(avgPrev)) * 100 : 0;

    return {
      ordersGrowth,
      orderVolumeGrowth,
      completionGrowth,
      averageOrderVolumeGrowth,
    };
  }, [orders]);

  const displayCurrency = user?.currency || getDefaultCurrency();

  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">
      <AnalyticsMetricCard
        title="Total Orders"
        value={totalOrders.toLocaleString()}
        change={growth.ordersGrowth}
        icon={<Package className="w-6 h-6 text-emerald-600" />}
        color="bg-white"
      />
      <AnalyticsMetricCard
        title="Order Volume"
        value={formatCurrency(orderVolume, displayCurrency)}
        change={growth.orderVolumeGrowth}
        icon={<DollarSign className="w-6 h-6 text-[#0a61d7]" />}
        color="bg-[#f7faff]"
      />
      <OperationalMetricCard
        title="Order Completion Rate"
        value={`${completionRate.toFixed(1)}%`}
        change={growth.completionGrowth}
        icon={<ShoppingCart className="w-6 h-6 text-green-600" />}
        color="bg-white"
      />
      <AnalyticsMetricCard
        title="Average Order Volume"
        value={formatCurrency(averageOrderVolume, displayCurrency)}
        change={growth.averageOrderVolumeGrowth}
        icon={<DollarSign className="w-6 h-6 text-emerald-600" />}
        color="bg-[#e6f7ec]"
      />
    </div>
  );
}
