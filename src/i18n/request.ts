import { getRequestConfig } from 'next-intl/server';
import { DEFAULT_TIME_ZONE } from './config';

export default getRequestConfig(async ({ locale }) => {
  const safeLocale = locale || 'en'; // fallback to 'en' if undefined
  // Locale parameter processed
  return {
    messages: (await import(`../messages/${safeLocale}.json`)).default,
    locale: safeLocale as string,
    timeZone: DEFAULT_TIME_ZONE,
  };
});
