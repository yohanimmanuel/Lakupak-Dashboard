'use client';
import React, { useMemo } from 'react';
import { Package, DollarSign, CheckCircle } from 'lucide-react';
import { Order } from '@/types/order';
import { formatCurrency, formatCompactCurrency, getDefaultCurrency } from '@/utils/currencyUtils';
import { calculateOrderTotalAmount } from '@/utils/orderCalculations';
import { useUserStore } from '@/store/userStore';
import { AnalyticsMetricCard } from '@/components/analyticsperformance/FinancialAnalytics';
import { OperationalMetricCard } from '@/components/analyticsperformance/OperationalPerformanceAnalytics';
import { isDeliveryStopComplete } from '@/utils/deliveryCompletion';
import { computeOrdersListGrowth } from '@/utils/monthOverMonthGrowth';
import { useOrdersTranslations } from '@/hooks/useOrdersTranslations';
import {
  STAT_ICON_BG_BLUE,
  STAT_ICON_BG_GREEN,
  STAT_ICON_BLUE,
  STAT_ICON_GREEN,
} from '@/utils/statCardStyles';

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

  const growth = useMemo(() => computeOrdersListGrowth(validOrders), [validOrders]);

  const displayCurrency = user?.currency || getDefaultCurrency();

  return (
    <div className="grid grid-cols-1 gap-3 @3xl/main:grid-cols-2 @5xl/main:grid-cols-4">
      <AnalyticsMetricCard
        title={tCards('totalOrders')}
        value={totalOrders.toLocaleString()}
        change={growth.ordersGrowth}
        previousValue={
          growth.ordersPrevious != null ? growth.ordersPrevious.toLocaleString() : undefined
        }
        icon={<Package className={`w-6 h-6 ${STAT_ICON_BLUE}`} />}
        color={STAT_ICON_BG_BLUE}
      />
      <AnalyticsMetricCard
        title={tCards('orderVolume')}
        value={formatCurrency(orderVolume, displayCurrency)}
        change={growth.orderVolumeGrowth}
        previousValue={
          growth.orderVolumePrevious != null
            ? formatCompactCurrency(growth.orderVolumePrevious, displayCurrency)
            : undefined
        }
        icon={<DollarSign className={`w-6 h-6 ${STAT_ICON_BLUE}`} />}
        color={STAT_ICON_BG_BLUE}
      />
      <OperationalMetricCard
        title={tCards('completionRate')}
        value={`${completionRate.toFixed(1)}%`}
        change={growth.completionGrowth}
        previousValue={
          growth.completionPrevious != null
            ? `${growth.completionPrevious.toFixed(1)}%`
            : undefined
        }
        icon={<CheckCircle className={`w-6 h-6 ${STAT_ICON_GREEN}`} />}
        color={STAT_ICON_BG_GREEN}
      />
      <AnalyticsMetricCard
        title={tCards('averageOrderVolume')}
        value={formatCurrency(averageOrderVolume, displayCurrency)}
        change={growth.averageOrderVolumeGrowth}
        previousValue={
          growth.averageOrderVolumePrevious != null
            ? formatCompactCurrency(growth.averageOrderVolumePrevious, displayCurrency)
            : undefined
        }
        icon={<DollarSign className={`w-6 h-6 ${STAT_ICON_BLUE}`} />}
        color={STAT_ICON_BG_BLUE}
      />
    </div>
  );
}
