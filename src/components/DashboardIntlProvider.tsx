'use client';

import { NextIntlClientProvider } from 'next-intl';
import { useUserStore } from '@/store/userStore';
import enMessages from '@/messages/en.json';
import idMessages from '@/messages/id.json';
import dashboardEn from '@/messages/dashboard/en.json';
import dashboardId from '@/messages/dashboard/id.json';
import clientsEn from '@/messages/dashboard/clients-en.json';
import clientsId from '@/messages/dashboard/clients-id.json';
import productsEn from '@/messages/dashboard/products-en.json';
import productsId from '@/messages/dashboard/products-id.json';
import ordersEn from '@/messages/dashboard/orders-en.json';
import ordersId from '@/messages/dashboard/orders-id.json';
import offersEn from '@/messages/dashboard/offers-en.json';
import offersId from '@/messages/dashboard/offers-id.json';
import marketingEn from '@/messages/dashboard/marketing-en.json';
import marketingId from '@/messages/dashboard/marketing-id.json';
import analyticsEn from '@/messages/dashboard/analytics-en.json';
import analyticsId from '@/messages/dashboard/analytics-id.json';

type SupportedLocale = 'en' | 'id';

function normalizeLocale(language?: string | null): SupportedLocale {
  return language === 'id' ? 'id' : 'en';
}

const MESSAGES: Record<SupportedLocale, Record<string, unknown>> = {
  en: { ...enMessages, dashboard: { ...dashboardEn, clients: clientsEn, products: productsEn, orders: ordersEn, offers: offersEn, marketing: marketingEn, analytics: analyticsEn } },
  id: { ...idMessages, dashboard: { ...dashboardId, clients: clientsId, products: productsId, orders: ordersId, offers: offersId, marketing: marketingId, analytics: analyticsId } },
};

export function DashboardIntlProvider({ children }: { children: React.ReactNode }) {
  const userLanguage = useUserStore((state) => state.user?.language);
  const locale = normalizeLocale(userLanguage);

  return (
    <NextIntlClientProvider locale={locale} messages={MESSAGES[locale]}>
      {children}
    </NextIntlClientProvider>
  );
}
