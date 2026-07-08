'use client';

import { useTranslations } from 'next-intl';

export function useMarketingTranslations() {
  const tHub = useTranslations('dashboard.marketing.hub');
  const tCampaigns = useTranslations('dashboard.marketing.campaigns');
  const tCampaignTable = useTranslations('dashboard.marketing.campaignTable');
  const tCampaignDetails = useTranslations('dashboard.marketing.campaignDetails');
  const tCampaignBuilder = useTranslations('dashboard.marketing.campaignBuilder');
  const tSendModal = useTranslations('dashboard.marketing.sendModal');
  const tTeam = useTranslations('dashboard.marketing.team');
  const tTeamList = useTranslations('dashboard.marketing.teamList');
  const tAgentForm = useTranslations('dashboard.marketing.agentForm');
  const tBasicProfile = useTranslations('dashboard.marketing.basicProfile');
  const tFavouriteProducts = useTranslations('dashboard.marketing.favouriteProducts');
  const tSalesReporting = useTranslations('dashboard.marketing.salesReporting');
  const tSalesTarget = useTranslations('dashboard.marketing.salesTarget');
  const tSalesDetails = useTranslations('dashboard.marketing.salesDetails');
  const tShared = useTranslations('dashboard.marketing.shared');
  const tCampaignPreview = useTranslations('dashboard.marketing.campaignPreview');
  const tCommon = useTranslations('dashboard.common');

  const translateStatusTab = (tab: string) =>
    tShared.has(`statusTabs.${tab}`) ? tShared(`statusTabs.${tab}`) : tab;

  const translateCampaignStatus = (status: string) =>
    tShared.has(`campaignStatus.${status}`) ? tShared(`campaignStatus.${status}`) : status;

  const translateRecipientOption = (option: string) =>
    tShared.has(`recipientOptions.${option}`) ? tShared(`recipientOptions.${option}`) : option;

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

  const translateBlockType = (type: string) =>
    tCampaignBuilder.has(`blockTypes.${type}.label`)
      ? tCampaignBuilder(`blockTypes.${type}.label`)
      : type;

  const translateBlockDescription = (type: string) =>
    tCampaignBuilder.has(`blockTypes.${type}.description`)
      ? tCampaignBuilder(`blockTypes.${type}.description`)
      : type;

  const translateTemplateName = (key: string) =>
    tCampaignBuilder.has(`templates.${key}.name`) ? tCampaignBuilder(`templates.${key}.name`) : key;

  const translateTemplateDescription = (key: string) =>
    tCampaignBuilder.has(`templates.${key}.description`)
      ? tCampaignBuilder(`templates.${key}.description`)
      : key;

  return {
    tHub,
    tCampaigns,
    tCampaignTable,
    tCampaignDetails,
    tCampaignBuilder,
    tSendModal,
    tTeam,
    tTeamList,
    tAgentForm,
    tBasicProfile,
    tFavouriteProducts,
    tSalesReporting,
    tSalesTarget,
    tSalesDetails,
    tShared,
    tCampaignPreview,
    tCommon,
    translateStatusTab,
    translateCampaignStatus,
    translateRecipientOption,
    translateTeamTab,
    translateRoleFilter,
    translateStatusFilter,
    translateAgentRole,
    translateAgentStatus,
    translateWizardTab,
    translateWizardTabDesc,
    translateFilter,
    translateBlockType,
    translateBlockDescription,
    translateTemplateName,
    translateTemplateDescription,
  };
}
