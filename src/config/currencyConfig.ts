// Currency configuration based on server location
export interface CurrencyConfig {
  code: string;
  symbol: string;
  name: string;
  locale: string;
  formatOptions: Intl.NumberFormatOptions;
}

// Default currency configurations
export const CURRENCY_CONFIGS: Record<string, CurrencyConfig> = {
  'IDR': {
    code: 'IDR',
    symbol: 'Rp',
    name: 'Indonesian Rupiah',
    locale: 'id-ID',
    formatOptions: {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }
  },
  'USD': {
    code: 'USD',
    symbol: '$',
    name: 'US Dollar',
    locale: 'en-US',
    formatOptions: {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }
  },
  'EUR': {
    code: 'EUR',
    symbol: '€',
    name: 'Euro',
    locale: 'de-DE',
    formatOptions: {
      style: 'currency',
      currency: 'EUR',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }
  },
  'SGD': {
    code: 'SGD',
    symbol: 'S$',
    name: 'Singapore Dollar',
    locale: 'en-SG',
    formatOptions: {
      style: 'currency',
      currency: 'SGD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }
  },
  'MYR': {
    code: 'MYR',
    symbol: 'RM',
    name: 'Malaysian Ringgit',
    locale: 'ms-MY',
    formatOptions: {
      style: 'currency',
      currency: 'MYR',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }
  }
};

// Server-based currency detection
export const getServerCurrency = (): string => {
  // Check environment variable first
  const envCurrency = process.env.DEFAULT_CURRENCY;
  if (envCurrency && CURRENCY_CONFIGS[envCurrency]) {
    return envCurrency;
  }

  // Check server location/timezone
  const timezone = process.env.TZ || 'Asia/Jakarta';
  
  // Map timezones to currencies
  const timezoneCurrencyMap: Record<string, string> = {
    'Asia/Jakarta': 'IDR',
    'Asia/Singapore': 'SGD',
    'Asia/Kuala_Lumpur': 'MYR',
    'America/New_York': 'USD',
    'Europe/Berlin': 'EUR'
  };

  return timezoneCurrencyMap[timezone] || 'IDR'; // Default to IDR for Indonesian market
};

// Get currency configuration
export const getCurrencyConfig = (currencyCode?: string): CurrencyConfig => {
  const code = currencyCode || getServerCurrency();
  return CURRENCY_CONFIGS[code] || CURRENCY_CONFIGS['IDR'];
};

// Format currency with proper locale
export const formatCurrencyWithLocale = (amount: number, currencyCode?: string): string => {
  const config = getCurrencyConfig(currencyCode);
  
  try {
    return new Intl.NumberFormat(config.locale, config.formatOptions).format(amount);
  } catch (error) {
    // Fallback to simple formatting
    return `${config.symbol} ${amount.toLocaleString(config.locale)}`;
  }
};

// Get currency symbol
export const getCurrencySymbol = (currencyCode?: string): string => {
  const config = getCurrencyConfig(currencyCode);
  return config.symbol;
};

// Validate currency code
export const isValidCurrency = (currencyCode: string): boolean => {
  return currencyCode in CURRENCY_CONFIGS;
};
