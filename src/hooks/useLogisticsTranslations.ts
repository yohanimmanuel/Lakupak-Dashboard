'use client';

import { useTranslations } from 'next-intl';

export function useLogisticsTranslations() {
  const tShared = useTranslations('dashboard.logistics.shared');
  const tPage = useTranslations('dashboard.logistics.page');
  const tDetailsPage = useTranslations('dashboard.logistics.detailsPage');
  const tCreatePage = useTranslations('dashboard.logistics.createPage');
  const tEditPage = useTranslations('dashboard.logistics.editPage');
  const tWizard = useTranslations('dashboard.logistics.wizard');
  const tList = useTranslations('dashboard.logistics.list');
  const tFleetDetails = useTranslations('dashboard.logistics.fleetDetails');
  const tOrderfleetDetails = useTranslations('dashboard.logistics.orderfleetDetails');
  const tBasicInfo = useTranslations('dashboard.logistics.basicInfo');
  const tVehicleInfo = useTranslations('dashboard.logistics.vehicleInfo');
  const tDriverInfo = useTranslations('dashboard.logistics.driverInfo');
  const tOrderSelection = useTranslations('dashboard.logistics.orderSelection');
  const tTripSummaryModal = useTranslations('dashboard.logistics.tripSummaryModal');
  const tTripInfo = useTranslations('dashboard.logistics.tripInfo');
  const tRouteMap = useTranslations('dashboard.logistics.routeMap');
  const tCommon = useTranslations('dashboard.common');

  const translateFleetStatus = (status: string) =>
    tShared.has(`fleetStatus.${status}`) ? tShared(`fleetStatus.${status}`) : status;

  const translateDeliveryType = (type: string) =>
    tShared.has(`deliveryTypes.${type}`) ? tShared(`deliveryTypes.${type}`) : type;

  const translateVehicleType = (key: string) =>
    tShared.has(`vehicleTypes.${key}`) ? tShared(`vehicleTypes.${key}`) : key;

  const translateWizardTab = (tab: string) =>
    tWizard.has(`wizardTabs.${tab}`) ? tWizard(`wizardTabs.${tab}`) : tab;

  const translateWizardTabDesc = (tab: string) =>
    tWizard.has(`wizardTabDescriptions.${tab}`) ? tWizard(`wizardTabDescriptions.${tab}`) : tab;

  return {
    tShared,
    tPage,
    tDetailsPage,
    tCreatePage,
    tEditPage,
    tWizard,
    tList,
    tFleetDetails,
    tOrderfleetDetails,
    tBasicInfo,
    tVehicleInfo,
    tDriverInfo,
    tOrderSelection,
    tTripSummaryModal,
    tTripInfo,
    tRouteMap,
    tCommon,
    translateFleetStatus,
    translateDeliveryType,
    translateVehicleType,
    translateWizardTab,
    translateWizardTabDesc,
  };
}
