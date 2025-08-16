import { getRequestConfig } from 'next-intl/server';

export default getRequestConfig(async ({ locale }) => {
  const safeLocale = locale || 'en'; // fallback to 'en' if undefined
  console.log('next-intl locale param:', safeLocale);
  return {
    messages: (await import(`../messages/${safeLocale}.json`)).default,
    locale: safeLocale as string
  };
});
