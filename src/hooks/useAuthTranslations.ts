'use client';

import { useTranslations } from 'next-intl';
import { useAuthIntl } from '@/components/auth/AuthIntlProvider';

export function useAuthTranslations() {
  const t = useTranslations('auth');
  const { locale } = useAuthIntl();

  const translateIndustry = (value: string) => {
    const key = `register.options.industry.${slugifyOption(value)}` as Parameters<typeof t>[0];
    return t.has(key) ? t(key) : value;
  };

  const translateCompanySize = (value: string) => {
    const key = `register.options.companySize.${slugifyOption(value)}` as Parameters<typeof t>[0];
    return t.has(key) ? t(key) : value;
  };

  const translateShipping = (value: string) => {
    const key = `register.options.shipping.${slugifyOption(value)}` as Parameters<typeof t>[0];
    return t.has(key) ? t(key) : value;
  };

  const translateTimeSlot = (value: string) => {
    const key = `register.options.timeSlot.${slugifyOption(value)}` as Parameters<typeof t>[0];
    return t.has(key) ? t(key) : value;
  };

  const translateDay = (value: string) => {
    const key = `register.options.day.${value.toLowerCase()}` as Parameters<typeof t>[0];
    return t.has(key) ? t(key) : value;
  };

  return {
    locale,
    tLogin: (key: string, values?: Record<string, string | number>) =>
      t(`login.${key}` as Parameters<typeof t>[0], values),
    tRegister: (key: string, values?: Record<string, string | number>) =>
      t(`register.${key}` as Parameters<typeof t>[0], values),
    tRegisterStep: (index: number) =>
      t(`register.steps.${index}` as Parameters<typeof t>[0]),
    tRegisterError: (key: string, values?: Record<string, string | number>) =>
      t(`register.errors.${key}` as Parameters<typeof t>[0], values),
    translateIndustry,
    translateCompanySize,
    translateShipping,
    translateTimeSlot,
    translateDay,
  };
}

function slugifyOption(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
}
