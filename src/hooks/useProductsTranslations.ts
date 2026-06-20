'use client';

import { useTranslations } from 'next-intl';

export function useProductsTranslations() {
  const tList = useTranslations('dashboard.products.list');
  const tShared = useTranslations('dashboard.products.shared');
  const tTable = useTranslations('dashboard.products.table');
  const tCards = useTranslations('dashboard.products.cards');
  const tImport = useTranslations('dashboard.products.import');
  const tCatalog = useTranslations('dashboard.products.catalog');
  const tMarketplace = useTranslations('dashboard.products.marketplace');
  const tDeleted = useTranslations('dashboard.products.deleted');
  const tDetailsPage = useTranslations('dashboard.products.detailsPage');
  const tCategories = useTranslations('dashboard.products.categories');
  const tCommon = useTranslations('dashboard.common');

  const translateStatus = (status: string) =>
    tShared.has(`recordStatus.${status}`) ? tShared(`recordStatus.${status}`) : status;

  const translateStatusTab = (tab: string) =>
    tShared.has(`statusTabs.${tab}`) ? tShared(`statusTabs.${tab}`) : tab;

  const translateStockFilter = (filter: string) =>
    tShared.has(`stockFilters.${filter}`) ? tShared(`stockFilters.${filter}`) : filter;

  const translateOfferFilter = (filter: string) =>
    tShared.has(`offerFilters.${filter}`) ? tShared(`offerFilters.${filter}`) : filter;

  const translateFilter = (filter: string) =>
    tShared.has(`filters.${filter}`) ? tShared(`filters.${filter}`) : filter;

  const translateStockStatus = (status: string) =>
    tShared.has(`stockStatus.${status}`) ? tShared(`stockStatus.${status}`) : status;

  const translateCategory = (category: string) =>
    tCategories.has(category) ? tCategories(category) : category;

  const translateFieldName = (key: string) =>
    tCatalog.has(`fields.${key}`) ? tCatalog(`fields.${key}`) : key;

  return {
    tList,
    tShared,
    tTable,
    tCards,
    tImport,
    tCatalog,
    tMarketplace,
    tDeleted,
    tDetailsPage,
    tCategories,
    tCommon,
    translateStatus,
    translateStatusTab,
    translateStockFilter,
    translateOfferFilter,
    translateFilter,
    translateStockStatus,
    translateCategory,
    translateFieldName,
  };
}
