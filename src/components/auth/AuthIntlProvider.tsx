'use client';

import React, { createContext, useCallback, useContext, useLayoutEffect, useMemo, useState } from 'react';
import { NextIntlClientProvider } from 'next-intl';
import authEn from '@/messages/auth-en.json';
import authId from '@/messages/auth-id.json';
import {
  type AuthLocale,
  normalizeAuthLocale,
  readStoredAuthLocaleIfSet,
  storeAuthLocale,
} from '@/lib/authLocale';
import { DEFAULT_TIME_ZONE } from '@/i18n/config';

type AuthIntlContextValue = {
  locale: AuthLocale;
  setLocale: (locale: AuthLocale) => void;
};

const AuthIntlContext = createContext<AuthIntlContextValue | null>(null);

const MESSAGES: Record<AuthLocale, Record<string, unknown>> = {
  en: authEn,
  id: authId,
};

export function AuthIntlProvider({
  children,
  initialLocale = 'en',
}: {
  children: React.ReactNode;
  initialLocale?: AuthLocale;
}) {
  const [locale, setLocaleState] = useState<AuthLocale>(initialLocale);

  useLayoutEffect(() => {
    const stored = readStoredAuthLocaleIfSet();
    if (stored !== null) {
      setLocaleState(stored);
      storeAuthLocale(stored);
    }
  }, []);

  const setLocale = useCallback((next: AuthLocale) => {
    const normalized = normalizeAuthLocale(next);
    storeAuthLocale(normalized);
    setLocaleState(normalized);
  }, []);

  const value = useMemo(() => ({ locale, setLocale }), [locale, setLocale]);

  return (
    <AuthIntlContext.Provider value={value}>
      <NextIntlClientProvider locale={locale} messages={MESSAGES[locale]} timeZone={DEFAULT_TIME_ZONE}>
        {children}
      </NextIntlClientProvider>
    </AuthIntlContext.Provider>
  );
}

export function useAuthIntl() {
  const ctx = useContext(AuthIntlContext);
  if (!ctx) {
    throw new Error('useAuthIntl must be used within AuthIntlProvider');
  }
  return ctx;
}
