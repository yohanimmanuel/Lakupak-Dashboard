import { NextIntlClientProvider } from 'next-intl';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: "Laku-Laku | Distribute More. Restock Faster. Grow Smarter."
};

export default async function LocaleLayout(props: { children: React.ReactNode; params: { locale: string } }) {
  const { children } = props;
  const { locale } = await props.params;
  let messages;
  try {
    messages = (await import(`../../messages/${locale}.json`)).default;
  } catch (error) {
    messages = (await import(`../../messages/en.json`)).default;
  }

  return (
    <NextIntlClientProvider locale={locale} messages={messages}>
      {children}
    </NextIntlClientProvider>
  );
}

