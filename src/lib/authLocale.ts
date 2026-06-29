export const AUTH_LOCALE_STORAGE_KEY = 'laku.auth.locale';
export const AUTH_LOCALE_COOKIE_KEY = 'laku.auth.locale';

export type AuthLocale = 'en' | 'id';

export function normalizeAuthLocale(value?: string | null): AuthLocale {
  return value === 'id' ? 'id' : 'en';
}

export function getServerAuthLocale(cookieValue?: string | null): AuthLocale {
  return normalizeAuthLocale(cookieValue);
}

/** Returns null when the user has not explicitly chosen a locale in localStorage. */
export function readStoredAuthLocaleIfSet(): AuthLocale | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(AUTH_LOCALE_STORAGE_KEY);
    if (raw === null) return null;
    return normalizeAuthLocale(raw);
  } catch {
    return null;
  }
}

export function storeAuthLocale(locale: AuthLocale) {
  if (typeof window === 'undefined') return;
  const normalized = normalizeAuthLocale(locale);
  try {
    window.localStorage.setItem(AUTH_LOCALE_STORAGE_KEY, normalized);
  } catch {
    // Ignore blocked or unavailable storage and keep the in-memory locale.
  }
  document.cookie = `${AUTH_LOCALE_COOKIE_KEY}=${normalized};path=/;max-age=${60 * 60 * 24 * 365};SameSite=Lax`;
}
