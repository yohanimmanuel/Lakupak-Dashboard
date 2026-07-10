'use client';

import { useTranslations } from 'next-intl';

export function useAutomationTranslations() {
  const tPage = useTranslations('dashboard.automation.page');
  const tStats = useTranslations('dashboard.automation.stats');
  const tTable = useTranslations('dashboard.automation.table');
  const tBulk = useTranslations('dashboard.automation.bulk');
  const tFilters = useTranslations('dashboard.automation.filters');
  const tStatusTabs = useTranslations('dashboard.automation.statusTabs');
  const tStatus = useTranslations('dashboard.automation.status');
  const tTypes = useTranslations('dashboard.automation.types');
  const tShared = useTranslations('dashboard.automation.shared');

  const translateStatusTab = (tab: string) =>
    tStatusTabs.has(tab) ? tStatusTabs(tab) : tab;

  const translateStatus = (status: string) =>
    tStatus.has(status) ? tStatus(status) : status;

  const translateType = (type: string) =>
    tTypes.has(type) ? tTypes(type) : type;

  return {
    tPage,
    tStats,
    tTable,
    tBulk,
    tFilters,
    tStatus,
    tTypes,
    tShared,
    translateStatusTab,
    translateStatus,
    translateType,
  };
}
