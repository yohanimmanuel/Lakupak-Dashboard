'use client';

import { useLocale, useTranslations } from 'next-intl';

export type HomeWidgetId =
  | 'analytics'
  | 'orders'
  | 'products'
  | 'buyers'
  | 'suppliers'
  | 'logistics'
  | 'inventory'
  | 'marketing';

export function useHomeTranslations() {
  const t = useTranslations('dashboard.home');
  const tCommon = useTranslations('dashboard.common');
  const tOrderStatus = useTranslations('dashboard.home.orderStatus');
  const tRecordStatus = useTranslations('dashboard.home.recordStatus');
  const locale = useLocale();
  const dateLocale = locale === 'id' ? 'id-ID' : 'en-US';

  const formatOrderDate = (date: Date) =>
    new Intl.DateTimeFormat(dateLocale, {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    }).format(date);

  const widgetName = (id: HomeWidgetId) => t(`widgets.${id}.name`);
  const widgetDescription = (id: HomeWidgetId) => t(`widgets.${id}.description`);
  const widgetText = (id: HomeWidgetId, key: string) => t(`widgets.${id}.${key}`);

  const translateOrderStatus = (status: string) =>
    tOrderStatus.has(status) ? tOrderStatus(status) : status;

  const translateRecordStatus = (status: string) =>
    tRecordStatus.has(status) ? tRecordStatus(status) : status;

  return {
    t,
    tCommon,
    locale,
    dateLocale,
    formatOrderDate,
    widgetName,
    widgetDescription,
    widgetText,
    translateOrderStatus,
    translateRecordStatus,
  };
}
