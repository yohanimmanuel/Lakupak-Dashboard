'use client';

import { useTranslations } from 'next-intl';

export function useMarketingTranslations() {
  const tHub = useTranslations('dashboard.marketing.hub');
  const tTeam = useTranslations('dashboard.marketing.team');
  const tTeamList = useTranslations('dashboard.marketing.teamList');
  const tAgentForm = useTranslations('dashboard.marketing.agentForm');
  const tBasicProfile = useTranslations('dashboard.marketing.basicProfile');
  const tFavouriteProducts = useTranslations('dashboard.marketing.favouriteProducts');
  const tSalesReporting = useTranslations('dashboard.marketing.salesReporting');
  const tSalesTarget = useTranslations('dashboard.marketing.salesTarget');
  const tSalesDetails = useTranslations('dashboard.marketing.salesDetails');
  const tShared = useTranslations('dashboard.marketing.shared');
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
