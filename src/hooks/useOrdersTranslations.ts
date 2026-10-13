'use client';

import { useTranslations } from 'next-intl';

export function useOrdersTranslations() {
  const tList = useTranslations('dashboard.orders.list');
  const tShared = useTranslations('dashboard.orders.shared');
  const tTable = useTranslations('dashboard.orders.table');
  const tCards = useTranslations('dashboard.orders.cards');
  const tGps = useTranslations('dashboard.orders.gps');
  const tTour = useTranslations('dashboard.orders.tour');
  const tDetailsPage = useTranslations('dashboard.orders.detailsPage');
  const tDetails = useTranslations('dashboard.orders.details');
  const tCreate = useTranslations('dashboard.orders.create');
  const tCommon = useTranslations('dashboard.common');

  /** Order status values are standard English across apps — do not translate. */
  const translateStatusTab = (tab: string) =>
    tab === 'All' && tShared.has('statusTabs.All') ? tShared('statusTabs.All') : tab;

  /** Paid / Unpaid are standard English across apps — do not translate. */
  const translatePaymentTab = (tab: string) =>
    tab === 'All' && tShared.has('paymentTabs.All') ? tShared('paymentTabs.All') : tab;

  const translateOrderStatus = (status: string) => status;

  const translatePaymentStatus = (status: string) => status;

  const translateDeliveryMethod = (method: string) =>
    tShared.has(`deliveryMethods.${method}`) ? tShared(`deliveryMethods.${method}`) : method;

  /** GPS status filter: only translate the "all" option label. */
  const translateGpsStatusFilter = (value: string) =>
    value === 'all' && tGps.has('statusFilters.all') ? tGps('statusFilters.all') : value;

  const translateReturnReason = (code: string) =>
    tShared.has(`returnReasons.${code}`) ? tShared(`returnReasons.${code}`) : code;

  const translateFieldName = (key: string) =>
    tShared.has(`fields.${key}`) ? tShared(`fields.${key}`) : key;

  return {
    tList,
    tShared,
    tTable,
    tCards,
    tGps,
    tTour,
    tDetailsPage,
    tDetails,
    tCreate,
    tCommon,
    translateStatusTab,
    translatePaymentTab,
    translateOrderStatus,
    translatePaymentStatus,
    translateDeliveryMethod,
    translateGpsStatusFilter,
    translateReturnReason,
    translateFieldName,
  };
}
