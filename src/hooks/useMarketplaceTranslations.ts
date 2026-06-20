'use client';

import { useTranslations } from 'next-intl';

export function useMarketplaceTranslations() {
  const tShared = useTranslations('dashboard.marketplace.shared');
  const tPage = useTranslations('dashboard.marketplace.page');
  const tProductsList = useTranslations('dashboard.marketplace.productsList');
  const tPerformance = useTranslations('dashboard.marketplace.performance');
  const tDistributor = useTranslations('dashboard.marketplace.distributor');
  const tCommon = useTranslations('dashboard.common');

  const translateTimeRange = (value: string) =>
    tShared.has(`timeRanges.${value}`) ? tShared(`timeRanges.${value}`) : value;

  const translateSortOption = (value: string) =>
    tShared.has(`sortOptions.${value}`) ? tShared(`sortOptions.${value}`) : value;

  const translateShippingOption = (key: string) =>
    tShared.has(`shippingOptions.${key}`) ? tShared(`shippingOptions.${key}`) : key;

  return {
    tShared,
    tPage,
    tProductsList,
    tPerformance,
    tDistributor,
    tCommon,
    translateTimeRange,
    translateSortOption,
    translateShippingOption,
  };
}
