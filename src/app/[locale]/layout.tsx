import { NextIntlClientProvider } from 'next-intl';
import type { Metadata } from 'next';
import { DEFAULT_TIME_ZONE } from '@/i18n/config';

export async function generateMetadata(props: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await props.params;
  let messages: { meta?: { title?: string } };
  try {
    messages = (await import(`../../messages/${locale}.json`)).default;
  } catch {
    messages = (await import(`../../messages/en.json`)).default;
  }

  return {
    title:
      messages.meta?.title ??
      'Lakupak | Your Whole Business, Sales, Distribution Made Simple And Connected.',
  };
}

export default async function LocaleLayout(props: { children: React.ReactNode; params: Promise<{ locale: string }> }) {
  const { children } = props;
  const { locale } = await props.params;
  let messages;
  try {
    messages = (await import(`../../messages/${locale}.json`)).default;
  } catch (error) {
    messages = (await import(`../../messages/en.json`)).default;
  }

  return (
    <NextIntlClientProvider locale={locale} messages={messages} timeZone={DEFAULT_TIME_ZONE}>
      {children}
    </NextIntlClientProvider>
  );
}
