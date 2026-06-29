'use client';

import { useAuthIntl } from '@/components/auth/AuthIntlProvider';
import type { AuthLocale } from '@/lib/authLocale';

type AuthLanguageSwitcherProps = {
  variant: 'login' | 'register';
};

function LocaleLink({
  code,
  active,
  onSelect,
}: {
  code: AuthLocale;
  active: boolean;
  onSelect: (code: AuthLocale) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(code)}
      className={`text-sm uppercase ${
        active
          ? 'font-semibold text-[#0a61d7]'
          : 'text-gray-500 hover:text-[#0a61d7] hover:underline'
      }`}
      aria-pressed={active}
      aria-label={code === 'en' ? 'English' : 'Bahasa Indonesia'}
    >
      {code}
    </button>
  );
}

export function AuthLanguageSwitcher({ variant }: AuthLanguageSwitcherProps) {
  const { locale, setLocale } = useAuthIntl();

  const links = (
    <div className="flex items-center gap-2">
      <LocaleLink code="en" active={locale === 'en'} onSelect={setLocale} />
      <span className="text-gray-300" aria-hidden>
        |
      </span>
      <LocaleLink code="id" active={locale === 'id'} onSelect={setLocale} />
    </div>
  );

  if (variant === 'login') {
    return <div className="mt-2 flex justify-center">{links}</div>;
  }

  return links;
}
