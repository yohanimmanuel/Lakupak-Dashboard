'use client';

import { useTranslations } from 'next-intl';

export function useOffersTranslations() {
  const tHub = useTranslations('dashboard.offers.hub');
  const tList = useTranslations('dashboard.offers.list');
  const tShared = useTranslations('dashboard.offers.shared');
  const tTable = useTranslations('dashboard.offers.table');
  const tCards = useTranslations('dashboard.offers.cards');
  const tCreatePage = useTranslations('dashboard.offers.createPage');
  const tDetailsPage = useTranslations('dashboard.offers.detailsPage');
  const tType = useTranslations('dashboard.offers.type');
  const tAnalytics = useTranslations('dashboard.offers.analytics');
  const tTypeModal = useTranslations('dashboard.offers.typeModal');
  const tDateRangeModal = useTranslations('dashboard.offers.dateRangeModal');
  const tRange = useTranslations('dashboard.offers.range');
  const tProducts = useTranslations('dashboard.offers.products');
  const tTour = useTranslations('dashboard.offers.tour');
  const tCommon = useTranslations('dashboard.common');

  const translateStatusTab = (tab: string) =>
    tShared.has(`statusTabs.${tab}`) ? tShared(`statusTabs.${tab}`) : tab;

  const translateDateFilter = (filter: string) =>
    tShared.has(`dateFilters.${filter}`) ? tShared(`dateFilters.${filter}`) : filter;

  const translatePageTab = (tab: string) =>
    tShared.has(`pageTabs.${tab}`) ? tShared(`pageTabs.${tab}`) : tab;

  const translateOfferStatus = (status: string) => {
    const key = status.toLowerCase();
    return tShared.has(`offerStatus.${key}`) ? tShared(`offerStatus.${key}`) : status;
  };

  const translateUsageStatus = (status: string) =>
    tShared.has(`usageStatus.${status}`) ? tShared(`usageStatus.${status}`) : status;

  const translateOfferType = (type: string) => {
    const key = type.toLowerCase();
    return tShared.has(`offerTypes.${key}`) ? tShared(`offerTypes.${key}`) : type;
  };

  const translateDiscountType = (type: string) =>
    tShared.has(`discountTypes.${type}`) ? tShared(`discountTypes.${type}`) : type;

  const translateOfferBadge = (badge: string) =>
    tShared.has(`offerBadges.${badge}`) ? tShared(`offerBadges.${badge}`) : badge;

  const translateRecordStatus = (status: string) => {
    const key = status.charAt(0).toUpperCase() + status.slice(1).toLowerCase();
    return tShared.has(`recordStatus.${key}`) ? tShared(`recordStatus.${key}`) : status;
  };

  const translateStockStatus = (status: string) =>
    tShared.has(`stockStatus.${status}`) ? tShared(`stockStatus.${status}`) : status;

  const translateFilter = (filter: string) =>
    tShared.has(`filters.${filter}`) ? tShared(`filters.${filter}`) : filter;

  const translateWizardTab = (tab: string) =>
    tShared.has(`wizardTabs.${tab}`) ? tShared(`wizardTabs.${tab}`) : tab;

  const translateWizardTabDesc = (tab: string) =>
    tShared.has(`wizardTabDescriptions.${tab}`) ? tShared(`wizardTabDescriptions.${tab}`) : tab;

  return {
    tHub,
    tList,
    tShared,
    tTable,
    tCards,
    tCreatePage,
    tDetailsPage,
    tType,
    tAnalytics,
    tTypeModal,
    tDateRangeModal,
    tRange,
    tProducts,
    tTour,
    tCommon,
    translateStatusTab,
    translateDateFilter,
    translatePageTab,
    translateOfferStatus,
    translateUsageStatus,
    translateOfferType,
    translateDiscountType,
    translateOfferBadge,
    translateRecordStatus,
    translateStockStatus,
    translateFilter,
    translateWizardTab,
    translateWizardTabDesc,
  };
}
