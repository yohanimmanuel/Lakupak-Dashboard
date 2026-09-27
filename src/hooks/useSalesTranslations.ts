'use client';

import { useTranslations } from 'next-intl';

export function useSalesTranslations() {
  const tHub = useTranslations('dashboard.sales.hub');
  const tTeam = useTranslations('dashboard.sales.team');
  const tTeamList = useTranslations('dashboard.sales.teamList');
  const tAgentForm = useTranslations('dashboard.sales.agentForm');
  const tBasicProfile = useTranslations('dashboard.sales.basicProfile');
  const tFavouriteProducts = useTranslations('dashboard.sales.favouriteProducts');
  const tSalesReporting = useTranslations('dashboard.sales.salesReporting');
  const tSalesTarget = useTranslations('dashboard.sales.salesTarget');
  const tSalesDetails = useTranslations('dashboard.sales.salesDetails');
  const tShared = useTranslations('dashboard.sales.shared');
  const tCommon = useTranslations('dashboard.common');

  const translateStatusTab = (tab: string) =>
    tShared.has(`statusTabs.${tab}`) ? tShared(`statusTabs.${tab}`) : tab;

  const translateTeamTab = (tab: string) =>
    tShared.has(`teamTabs.${tab}`) ? tShared(`teamTabs.${tab}`) : tab;

  const translateRoleFilter = (role: string) =>
    tShared.has(`roleFilters.${role}`) ? tShared(`roleFilters.${role}`) : role;

  const translateStatusFilter = (status: string) =>
    tShared.has(`statusFilters.${status}`) ? tShared(`statusFilters.${status}`) : status;

  const translateAgentRole = (role: string) =>
    tShared.has(`agentRoles.${role}`) ? tShared(`agentRoles.${role}`) : role;

  const translateAgentStatus = (status: string) => {
    const key = status.charAt(0).toUpperCase() + status.slice(1).toLowerCase();
    if (tShared.has(`agentStatus.${key}`)) return tShared(`agentStatus.${key}`);
    if (tShared.has(`agentStatus.${status}`)) return tShared(`agentStatus.${status}`);
    return status;
  };

  const translateWizardTab = (tab: string) =>
    tAgentForm.has(`wizardTabs.${tab}`) ? tAgentForm(`wizardTabs.${tab}`) : tab;

  const translateWizardTabDesc = (tab: string) =>
    tAgentForm.has(`wizardTabDescriptions.${tab}`) ? tAgentForm(`wizardTabDescriptions.${tab}`) : tab;

  const translateFilter = (filter: string) =>
    tShared.has(`filters.${filter}`) ? tShared(`filters.${filter}`) : filter;

  return {
    tHub,
    tTeam,
    tTeamList,
    tAgentForm,
    tBasicProfile,
    tFavouriteProducts,
    tSalesReporting,
    tSalesTarget,
    tSalesDetails,
    tShared,
    tCommon,
    translateStatusTab,
    translateTeamTab,
    translateRoleFilter,
    translateStatusFilter,
    translateAgentRole,
    translateAgentStatus,
    translateWizardTab,
    translateWizardTabDesc,
    translateFilter,
  };
}
