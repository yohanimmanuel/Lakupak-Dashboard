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
  const tCommon = useTranslations('dashboard.common');

  const translateStatusTab = (tab: string) =>
    tShared.has(`statusTabs.${tab}`) ? tShared(`statusTabs.${tab}`) : tab;

  const translatePaymentTab = (tab: string) =>
    tShared.has(`paymentTabs.${tab}`) ? tShared(`paymentTabs.${tab}`) : tab;

  const translateOrderStatus = (status: string) =>
    tShared.has(`orderStatus.${status}`) ? tShared(`orderStatus.${status}`) : status;

  const translatePaymentStatus = (status: string) =>
    tShared.has(`paymentStatus.${status}`) ? tShared(`paymentStatus.${status}`) : status;

  const translateDeliveryMethod = (method: string) =>
    tShared.has(`deliveryMethods.${method}`) ? tShared(`deliveryMethods.${method}`) : method;

  const translateGpsStatusFilter = (value: string) =>
    tGps.has(`statusFilters.${value}`) ? tGps(`statusFilters.${value}`) : value;

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
