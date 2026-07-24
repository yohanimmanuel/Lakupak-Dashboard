'use client';

import { useCallback } from 'react';
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
  const tBuilder = useTranslations('dashboard.automation.builder');
  const tTriggers = useTranslations('dashboard.automation.triggers');
  const tActions = useTranslations('dashboard.automation.actions');
  const tFields = useTranslations('dashboard.automation.fields');
  const tRuns = useTranslations('dashboard.automation.runs');

  const translateStatusTab = useCallback(
    (tab: string) => (tStatusTabs.has(tab) ? tStatusTabs(tab) : tab),
    [tStatusTabs],
  );

  const translateStatus = useCallback(
    (status: string) => (tStatus.has(status) ? tStatus(status) : status),
    [tStatus],
  );

  const translateType = useCallback(
    (type: string) => (tTypes.has(type) ? tTypes(type) : type),
    [tTypes],
  );

  const translateTrigger = useCallback(
    (triggerType: string) =>
      tTriggers.has(triggerType) ? tTriggers(triggerType) : triggerType,
    [tTriggers],
  );

  const translateAction = useCallback(
    (actionType: string) =>
      tActions.has(actionType) ? tActions(actionType) : actionType,
    [tActions],
  );

  return {
    tPage,
    tStats,
    tTable,
    tBulk,
    tFilters,
    tStatus,
    tTypes,
    tShared,
    tBuilder,
    tTriggers,
    tActions,
    tFields,
    tRuns,
    translateStatusTab,
    translateStatus,
    translateType,
    translateTrigger,
    translateAction,
  };
}
