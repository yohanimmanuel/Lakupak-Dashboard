'use client';
import React, { useMemo } from 'react';
import { Package, DollarSign, CheckCircle, BadgeCheck, Clock } from 'lucide-react';
import { Order } from '@/types/order';
import { formatCurrency, formatCompactCurrency, getDefaultCurrency } from '@/utils/currencyUtils';
import { orderAmountPaid, sumOrderVolume } from '@/utils/orderCalculations';
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
  const { tCards, tCommon } = useOrdersTranslations();
  const user = useUserStore((state) => state.user);

  const validOrders = Array.isArray(orders) ? orders : [];

  const totalOrders = validOrders.length;
  const completedOrders = validOrders.filter((o) => isCompletedOrder(o.orderStatus)).length;
  const completionRate = totalOrders > 0 ? (completedOrders / totalOrders) * 100 : 0;

  const orderVolume = sumOrderVolume(validOrders);
  const paidVolume = validOrders.reduce((sum, order) => sum + orderAmountPaid(order), 0);
  const unpaidVolume = orderVolume - paidVolume;
  const averageOrderVolume = totalOrders > 0 ? orderVolume / totalOrders : 0;

  const growth = useMemo(() => computeOrdersListGrowth(validOrders), [validOrders]);

  const displayCurrency = user?.currency || getDefaultCurrency();
  const comparisonProps = {
    thisMonthLabel: tCommon('thisMonth'),
    lastMonthLabel: tCommon('vsLastMonth'),
    vsLabel: tCommon('monthComparisonVs'),
    naLabel: tCommon('notAvailable'),
  };

  return (
    <div className="grid grid-cols-1 gap-3 @3xl/main:grid-cols-2 @5xl/main:grid-cols-3">
      <AnalyticsMetricCard
        title={tCards('totalOrders')}
        value={totalOrders.toLocaleString()}
        change={growth.ordersGrowth}
        currentValue={growth.ordersCurrent.toLocaleString()}
        previousValue={growth.ordersPrevious.toLocaleString()}
        icon={<Package className={`w-6 h-6 ${STAT_ICON_BLUE}`} />}
        color={STAT_ICON_BG_BLUE}
        {...comparisonProps}
      />
      <AnalyticsMetricCard
        title={tCards('paid')}
        value={formatCurrency(paidVolume, displayCurrency)}
        change={growth.paidGrowth}
        currentValue={formatCompactCurrency(growth.paidCurrent, displayCurrency)}
        previousValue={formatCompactCurrency(growth.paidPrevious, displayCurrency)}
        icon={<BadgeCheck className={`w-6 h-6 ${STAT_ICON_GREEN}`} />}
        color={STAT_ICON_BG_GREEN}
        {...comparisonProps}
      />
      <AnalyticsMetricCard
        title={tCards('unpaid')}
        value={formatCurrency(unpaidVolume, displayCurrency)}
        change={growth.unpaidGrowth}
        currentValue={formatCompactCurrency(growth.unpaidCurrent, displayCurrency)}
        previousValue={formatCompactCurrency(growth.unpaidPrevious, displayCurrency)}
        icon={<Clock className={`w-6 h-6 ${STAT_ICON_BLUE}`} />}
        color={STAT_ICON_BG_BLUE}
        {...comparisonProps}
      />
      <AnalyticsMetricCard
        title={tCards('orderVolume')}
        value={formatCurrency(orderVolume, displayCurrency)}
        change={growth.orderVolumeGrowth}
        currentValue={formatCompactCurrency(growth.orderVolumeCurrent, displayCurrency)}
        previousValue={formatCompactCurrency(growth.orderVolumePrevious, displayCurrency)}
        icon={<DollarSign className={`w-6 h-6 ${STAT_ICON_BLUE}`} />}
        color={STAT_ICON_BG_BLUE}
        {...comparisonProps}
      />
      <AnalyticsMetricCard
        title={tCards('averageOrderVolume')}
        value={formatCurrency(averageOrderVolume, displayCurrency)}
        change={growth.averageOrderVolumeGrowth}
        currentValue={formatCompactCurrency(growth.averageOrderVolumeCurrent, displayCurrency)}
        previousValue={formatCompactCurrency(growth.averageOrderVolumePrevious, displayCurrency)}
        icon={<DollarSign className={`w-6 h-6 ${STAT_ICON_BLUE}`} />}
        color={STAT_ICON_BG_BLUE}
        {...comparisonProps}
      />
      <OperationalMetricCard
        title={tCards('completionRate')}
        value={`${completionRate.toFixed(1)}%`}
        change={growth.completionGrowth}
        currentValue={`${growth.completionCurrent.toFixed(1)}%`}
        previousValue={`${growth.completionPrevious.toFixed(1)}%`}
        icon={<CheckCircle className={`w-6 h-6 ${STAT_ICON_GREEN}`} />}
        color={STAT_ICON_BG_GREEN}
        {...comparisonProps}
      />
    </div>
  );
}
