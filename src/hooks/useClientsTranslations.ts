'use client';

import { useTranslations } from 'next-intl';

export function useClientsTranslations() {
  const tHub = useTranslations('dashboard.clients.hub');
  const tShared = useTranslations('dashboard.clients.shared');
  const tBuyers = useTranslations('dashboard.clients.buyers');
  const tSuppliers = useTranslations('dashboard.clients.suppliers');
  const tCommon = useTranslations('dashboard.common');

  const tBuyersProfile = useTranslations('dashboard.clients.buyers.profile');
  const tSuppliersProfile = useTranslations('dashboard.clients.suppliers.profile');
  const tBuyersModal = useTranslations('dashboard.clients.buyers.modal');
  const tSuppliersModal = useTranslations('dashboard.clients.suppliers.modal');
  const tImport = useTranslations('dashboard.clients.import');

  const translateStatus = (status: string) =>
    tShared.has(`recordStatus.${status}`) ? tShared(`recordStatus.${status}`) : status;

  const translateStatusTab = (tab: string) =>
    tShared.has(`statusTabs.${tab}`) ? tShared(`statusTabs.${tab}`) : tab;

  const translateFilter = (filter: string) =>
    tShared.has(`filters.${filter}`) ? tShared(`filters.${filter}`) : filter;

  const translatePeriod = (period: string) =>
    tShared.has(`periods.${period}`) ? tShared(`periods.${period}`) : period;

  return {
    tHub,
    tShared,
    tBuyers,
    tSuppliers,
    tCommon,
    tBuyersProfile,
    tSuppliersProfile,
    tBuyersModal,
    tSuppliersModal,
    tImport,
    translateStatus,
    translateStatusTab,
    translateFilter,
    translatePeriod,
  };
}
