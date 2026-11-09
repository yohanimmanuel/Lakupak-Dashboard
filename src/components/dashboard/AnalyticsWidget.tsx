'use client';

import type { ComponentProps } from 'react';
import { useTranslations } from 'next-intl';
import {
  AnalyticsRevenueTrendChart,
  formatCurrency,
} from '@/components/analyticsperformance/FinancialAnalytics';

type AnalyticsWidgetProps = {
  revenueData: ComponentProps<typeof AnalyticsRevenueTrendChart>['revenueData'];
  totalRevenue: number;
  userCurrency: string;
  hasData: boolean;
};

export default function AnalyticsWidget({
  revenueData,
  totalRevenue,
  userCurrency,
  hasData,
}: AnalyticsWidgetProps) {
  const t = useTranslations('dashboard.home.widgets.analytics');

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-xs text-gray-500">
        <span className="font-semibold uppercase tracking-wide text-gray-600">
          {t('thisYear')}
        </span>
        <span>
          {t('totalOrderVolume')}{' '}
          <span className="font-semibold text-black">
            {formatCurrency(totalRevenue, userCurrency)}
          </span>
        </span>
      </div>
      <AnalyticsRevenueTrendChart
        revenueData={revenueData}
        userCurrency={userCurrency}
        hasData={hasData}
      />
    </div>
  );
}
