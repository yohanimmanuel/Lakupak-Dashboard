'use client';

import React, { createContext, useCallback, useContext, useLayoutEffect, useMemo, useState } from 'react';
import { NextIntlClientProvider } from 'next-intl';
import authEn from '@/messages/auth-en.json';
import authId from '@/messages/auth-id.json';
import {
  type AuthLocale,
  normalizeAuthLocale,
  readStoredAuthLocale,
  storeAuthLocale,
} from '@/lib/authLocale';

type AuthIntlContextValue = {
  locale: AuthLocale;
  setLocale: (locale: AuthLocale) => void;
};

const AuthIntlContext = createContext<AuthIntlContextValue | null>(null);

const MESSAGES: Record<AuthLocale, Record<string, unknown>> = {
  en: authEn,
  id: authId,
};

export function AuthIntlProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<AuthLocale>(() => readStoredAuthLocale());

  useLayoutEffect(() => {
    const stored = readStoredAuthLocale();
    setLocaleState((current) => (current === stored ? current : stored));
  }, []);

  const setLocale = useCallback((next: AuthLocale) => {
    const normalized = normalizeAuthLocale(next);
    storeAuthLocale(normalized);
    setLocaleState(normalized);
  }, []);

  const value = useMemo(() => ({ locale, setLocale }), [locale, setLocale]);

  return (
    <AuthIntlContext.Provider value={value}>
      <NextIntlClientProvider locale={locale} messages={MESSAGES[locale]}>
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
