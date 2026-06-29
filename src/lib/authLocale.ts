export const AUTH_LOCALE_STORAGE_KEY = 'laku.auth.locale';

export type AuthLocale = 'en' | 'id';

export function normalizeAuthLocale(value?: string | null): AuthLocale {
  return value === 'id' ? 'id' : 'en';
}

export function readStoredAuthLocale(): AuthLocale {
  if (typeof window === 'undefined') return 'en';
  try {
    return normalizeAuthLocale(window.localStorage.getItem(AUTH_LOCALE_STORAGE_KEY));
  } catch {
    return 'en';
  }
}

export function storeAuthLocale(locale: AuthLocale) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(AUTH_LOCALE_STORAGE_KEY, locale);
  } catch {
    // Ignore blocked or unavailable storage and keep the in-memory locale.
  }
}
