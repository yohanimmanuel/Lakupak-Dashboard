'use client';

import { useTranslations } from 'next-intl';

export function useAutomationTranslations() {
  const tPage = useTranslations('dashboard.automation.page');

  return {
    tPage,
  };
}
