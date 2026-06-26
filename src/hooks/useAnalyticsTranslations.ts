'use client';

import { useLocale, useTranslations } from 'next-intl';

export function resolveAnalyticsDateLocale(locale: string): string {
  return locale === 'id' ? 'id-ID' : 'en-US';
}

export function useAnalyticsTranslations() {
  const locale = useLocale();
  const dateLocale = resolveAnalyticsDateLocale(locale);
  const tShared = useTranslations('dashboard.analytics.shared');
  const tOverview = useTranslations('dashboard.analytics.overview');
  const tFinancial = useTranslations('dashboard.analytics.financial');
  const tSales = useTranslations('dashboard.analytics.sales');
  const tOperational = useTranslations('dashboard.analytics.operational');
  const tMetrics = useTranslations('dashboard.analytics.metrics');
  const tCharts = useTranslations('dashboard.analytics.charts');
  const tTables = useTranslations('dashboard.analytics.tables');
  const tQualityMetrics = useTranslations('dashboard.analytics.qualityMetrics');
  const tInventoryLegend = useTranslations('dashboard.analytics.inventoryLegend');
  const tCommon = useTranslations('dashboard.common');

  const translateTimeRange = (value: string) =>
    tShared.has(`timeRanges.${value}`) ? tShared(`timeRanges.${value}`) : value;

  const translateCategoryFilter = (value: string) =>
    tShared.has(`categoryFilters.${value}`) ? tShared(`categoryFilters.${value}`) : value;

  const translateOrderStatus = (status: string) =>
    tShared.has(`orderStatus.${status}`) ? tShared(`orderStatus.${status}`) : status;

  const translateForecastTrend = (trend: string) =>
    tShared.has(`forecastTrend.${trend}`) ? tShared(`forecastTrend.${trend}`) : trend;

  const translateQualityMetric = (key: string) => {
    const map: Record<string, string> = {
      'Order Acceptance Rate': 'orderAcceptanceRate',
      'Tracking Coverage': 'trackingCoverage',
      'Data Completeness': 'dataCompleteness',
      'Stock Health': 'stockHealth',
    };
    const translationKey = map[key];
    return translationKey && tQualityMetrics.has(translationKey)
      ? tQualityMetrics(translationKey)
      : key;
  };

  return {
    locale,
    dateLocale,
    tShared,
    tOverview,
    tFinancial,
    tSales,
    tOperational,
    tMetrics,
    tCharts,
    tTables,
    tQualityMetrics,
    tInventoryLegend,
    tCommon,
    translateTimeRange,
    translateCategoryFilter,
    translateOrderStatus,
    translateForecastTrend,
    translateQualityMetric,
  };
}
