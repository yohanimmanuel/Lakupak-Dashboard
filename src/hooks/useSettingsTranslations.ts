'use client';

import { useTranslations } from 'next-intl';

export function useSettingsTranslations() {
  const tPage = useTranslations('dashboard.settings.page');
  const tGeneral = useTranslations('dashboard.settings.general');
  const tLanguage = useTranslations('dashboard.settings.language');
  const tSecurity = useTranslations('dashboard.settings.security');
  const tDistributor = useTranslations('dashboard.settings.distributor');
  const tTeam = useTranslations('dashboard.settings.team');
  const tBilling = useTranslations('dashboard.settings.billing');
  const tTours = useTranslations('dashboard.settings.tours');
  const tCommon = useTranslations('dashboard.common');

  const translateLanguageOption = (code: string) =>
    tLanguage.has(`languageOptions.${code}`) ? tLanguage(`languageOptions.${code}`) : code;

  const translateRegion = (code: string) =>
    tLanguage.has(`regions.${code}`) ? tLanguage(`regions.${code}`) : code;

  const translatePasswordStrength = (feedback: string) => {
    const map: Record<string, string> = {
      'Enter a password': tSecurity('passwordStrengthFeedback.empty'),
      Weak: tSecurity('passwordStrengthFeedback.weak'),
      Fair: tSecurity('passwordStrengthFeedback.fair'),
      Good: tSecurity('passwordStrengthFeedback.good'),
      Strong: tSecurity('passwordStrengthFeedback.strong'),
    };
    return map[feedback] ?? feedback;
  };

  const translateIndustryType = (value: string) =>
    tDistributor.has(`industryTypes.${value}`) ? tDistributor(`industryTypes.${value}`) : value;

  const translateCompanySize = (value: string) =>
    tDistributor.has(`companySizes.${value}`) ? tDistributor(`companySizes.${value}`) : value;

  const translateShippingOption = (value: string) =>
    tDistributor.has(`shippingOptionValues.${value}`) ? tDistributor(`shippingOptionValues.${value}`) : value;

  const translateDeliveryTimeSlot = (value: string) =>
    tDistributor.has(`deliveryTimeSlots.${value}`) ? tDistributor(`deliveryTimeSlots.${value}`) : value;

  const translateDeliveryDay = (value: string) =>
    tDistributor.has(`deliveryDays.${value}`) ? tDistributor(`deliveryDays.${value}`) : value;

  const translateTeamRole = (role: string) =>
    tTeam.has(`roles.${role}`) ? tTeam(`roles.${role}`) : role;

  const translateTeamStatus = (status: string) =>
    tTeam.has(`status.${status}`) ? tTeam(`status.${status}`) : status;

  const translateInvoiceStatus = (status: string) =>
    tBilling.has(`invoices.status.${status}`) ? tBilling(`invoices.status.${status}`) : status;

  const translateTourStatus = (status: 'completed' | 'dismissed' | 'notStarted') => {
    if (status === 'completed') return tTours('statusCompleted');
    if (status === 'dismissed') return tTours('statusDismissed');
    return tTours('statusNotStarted');
  };

  return {
    tPage,
    tGeneral,
    tLanguage,
    tSecurity,
    tDistributor,
    tTeam,
    tBilling,
    tTours,
    tCommon,
    translateLanguageOption,
    translateRegion,
    translatePasswordStrength,
    translateIndustryType,
    translateCompanySize,
    translateShippingOption,
    translateDeliveryTimeSlot,
    translateDeliveryDay,
    translateTeamRole,
    translateTeamStatus,
    translateInvoiceStatus,
    translateTourStatus,
  };
}
