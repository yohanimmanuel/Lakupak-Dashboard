export const REMEMBERED_LOGIN_KEY = 'laku.auth.rememberedLogin';

export type RememberedLogin = {
  email: string;
  firstName: string;
  lastName: string;
};

export function readRememberedLogin(): RememberedLogin | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(REMEMBERED_LOGIN_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<RememberedLogin>;
    if (typeof parsed.email !== 'string' || !parsed.email.trim()) return null;
    return {
      email: parsed.email.trim(),
      firstName: typeof parsed.firstName === 'string' ? parsed.firstName : '',
      lastName: typeof parsed.lastName === 'string' ? parsed.lastName : '',
    };
  } catch {
    return null;
  }
}

export function storeRememberedLogin(account: RememberedLogin) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(
      REMEMBERED_LOGIN_KEY,
      JSON.stringify({
        email: account.email.trim(),
        firstName: account.firstName.trim(),
        lastName: account.lastName.trim(),
      }),
    );
  } catch {
    // Ignore unavailable storage.
  }
}

export function clearRememberedLogin() {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(REMEMBERED_LOGIN_KEY);
  } catch {
    // Ignore unavailable storage.
  }
}

export function getRememberedDisplayName(account: RememberedLogin): string {
  const name = `${account.firstName} ${account.lastName}`.trim();
  return name || account.email;
}
