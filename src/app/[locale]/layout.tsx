import { NextIntlClientProvider } from 'next-intl';

export const metadata = {
  title: "Laku-Laku | Distribute More. Restock Faster. Grow Smarter."
};

export default async function LocaleLayout(props: { children: React.ReactNode; params: { locale: string } }) {
  const { children, params } = props;
  const locale = params.locale;
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

