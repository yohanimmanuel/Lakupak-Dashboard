import { cookies } from 'next/headers';
import { AuthIntlProvider } from '@/components/auth/AuthIntlProvider';
import { AUTH_LOCALE_COOKIE_KEY, getServerAuthLocale } from '@/lib/authLocale';

export default async function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cookieStore = await cookies();
  const initialLocale = getServerAuthLocale(
    cookieStore.get(AUTH_LOCALE_COOKIE_KEY)?.value,
  );

  return <AuthIntlProvider initialLocale={initialLocale}>{children}</AuthIntlProvider>;
}
