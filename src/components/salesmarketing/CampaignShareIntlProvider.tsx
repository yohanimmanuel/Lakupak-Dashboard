'use client';

import React from 'react';
import { NextIntlClientProvider } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import {
  CAMPAIGN_SHARE_MESSAGES,
  normalizeCampaignShareLocale,
  type CampaignShareLocale,
} from '@/lib/campaignShareMessages';

function resolveLocale(searchParams: URLSearchParams | null): CampaignShareLocale {
  const fromUrl = searchParams?.get('lang');
  if (fromUrl) return normalizeCampaignShareLocale(fromUrl);
  if (typeof window !== 'undefined') {
    const browser = window.navigator.language.toLowerCase();
    if (browser.startsWith('id')) return 'id';
  }
  return 'en';
}

function CampaignShareIntlProviderInner({ children }: { children: React.ReactNode }) {
  const searchParams = useSearchParams();
  const locale = resolveLocale(searchParams);

  return (
    <NextIntlClientProvider locale={locale} messages={CAMPAIGN_SHARE_MESSAGES[locale]}>
      {children}
    </NextIntlClientProvider>
  );
}

export default function CampaignShareIntlProvider({ children }: { children: React.ReactNode }) {
  return <CampaignShareIntlProviderInner>{children}</CampaignShareIntlProviderInner>;
}
