// Currency configuration based on server location
export interface CurrencyConfig {
  code: string;
  symbol: string;
  name: string;
  locale: string;
  formatOptions: Intl.NumberFormatOptions;
}

// Default currency configurations - matches all currencies from regionConfig.ts
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
  },
  'THB': {
    code: 'THB',
    symbol: '฿',
    name: 'Thai Baht',
    locale: 'th-TH',
    formatOptions: {
      style: 'currency',
      currency: 'THB',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }
  },
  'PHP': {
    code: 'PHP',
    symbol: '₱',
    name: 'Philippine Peso',
    locale: 'en-PH',
    formatOptions: {
      style: 'currency',
      currency: 'PHP',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }
  },
  'VND': {
    code: 'VND',
    symbol: '₫',
    name: 'Vietnamese Dong',
    locale: 'vi-VN',
    formatOptions: {
      style: 'currency',
      currency: 'VND',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }
  },
  'JPY': {
    code: 'JPY',
    symbol: '¥',
    name: 'Japanese Yen',
    locale: 'ja-JP',
    formatOptions: {
      style: 'currency',
      currency: 'JPY',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }
  },
  'KRW': {
    code: 'KRW',
    symbol: '₩',
    name: 'South Korean Won',
    locale: 'ko-KR',
    formatOptions: {
      style: 'currency',
      currency: 'KRW',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }
  },
  'AUD': {
    code: 'AUD',
    symbol: 'A$',
    name: 'Australian Dollar',
    locale: 'en-AU',
    formatOptions: {
      style: 'currency',
      currency: 'AUD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }
  },
  'GBP': {
    code: 'GBP',
    symbol: '£',
    name: 'British Pound Sterling',
    locale: 'en-GB',
    formatOptions: {
      style: 'currency',
      currency: 'GBP',
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
    'Asia/Bangkok': 'THB',
    'Asia/Manila': 'PHP',
    'Asia/Ho_Chi_Minh': 'VND',
    'Asia/Tokyo': 'JPY',
    'Asia/Seoul': 'KRW',
    'Australia/Sydney': 'AUD',
    'Europe/London': 'GBP',
    'Europe/Berlin': 'EUR',
    'America/New_York': 'USD'
  };

  return timezoneCurrencyMap[timezone] || 'IDR'; // Default to IDR for Indonesian market
};

// Get currency configuration
export const getCurrencyConfig = (currencyCode?: string): CurrencyConfig => {
  const code = currencyCode || getServerCurrency();
  return CURRENCY_CONFIGS[code] || CURRENCY_CONFIGS['IDR'];
};

// Format currency with proper locale
export const formatCurrencyWithLocale = (amount: number | string, currencyCode?: string): string => {
  const config = getCurrencyConfig(currencyCode);
  
  // Ensure amount is a number
  const numericAmount = typeof amount === 'string' ? parseFloat(amount) || 0 : (amount || 0);
  
  // Validate that we have a valid number
  if (isNaN(numericAmount) || !isFinite(numericAmount)) {
    return `${config.symbol}0`;
  }
  
  try {
    // For currencies with custom symbols, use custom formatting
    if (currencyCode === 'SGD' || currencyCode === 'AUD') {
      return `${config.symbol}${numericAmount.toLocaleString(config.locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }
    
    // For currencies with 0 decimal places, use custom formatting
    if (currencyCode === 'IDR' || currencyCode === 'VND' || currencyCode === 'JPY' || currencyCode === 'KRW') {
      // For IDR, use dots as thousands separators
      if (currencyCode === 'IDR') {
        const formatted = numericAmount.toLocaleString('id-ID', { 
          minimumFractionDigits: 0, 
          maximumFractionDigits: 0,
          useGrouping: true
        });
        return `${config.symbol}${formatted}`;
      }
      return `${config.symbol}${numericAmount.toLocaleString(config.locale, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
    }
    
    // For other currencies, use Intl.NumberFormat
    return new Intl.NumberFormat(config.locale, config.formatOptions).format(numericAmount);
  } catch (error) {
    // Fallback to simple formatting
    return `${config.symbol} ${numericAmount.toLocaleString(config.locale)}`;
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

// Format number according to currency locale (without currency symbol)
export const formatNumberByCurrency = (value: string | number, currencyCode?: string): string => {
  const config = getCurrencyConfig(currencyCode);
  const num = typeof value === 'string' ? parseFloat(value.replace(/[^\d.-]/g, '')) : value;
  if (isNaN(num)) return '0';
  
  try {
    // For IDR, explicitly use Indonesian locale with dots as thousands separators
    if (currencyCode === 'IDR' || config.locale === 'id-ID') {
      return num.toLocaleString('id-ID', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
        useGrouping: true
      });
    }
    
    // For other currencies, use commas as thousands separators
    return num.toLocaleString(config.locale, {
      minimumFractionDigits: config.formatOptions.minimumFractionDigits,
      maximumFractionDigits: config.formatOptions.maximumFractionDigits,
      useGrouping: true
    });
  } catch (error) {
    return num.toLocaleString(config.locale);
  }
};

// Parse formatted number back to number according to currency rules
export const parseNumberByCurrency = (value: string, currencyCode?: string): number => {
  const config = getCurrencyConfig(currencyCode);
  const trimmed = String(value ?? '').trim();
  if (!trimmed) return 0;

  // For IDR (Indonesian), dots are thousands separators and commas are decimals.
  // Excel exports often use US-style decimals (e.g. 96000.000000), which must not
  // be treated as thousands grouping or values overflow Decimal(12, 2).
  if (config.locale === 'id-ID') {
    const hasComma = trimmed.includes(',');
    const hasPeriod = trimmed.includes('.');

    if (hasComma && hasPeriod) {
      const lastComma = trimmed.lastIndexOf(',');
      const lastPeriod = trimmed.lastIndexOf('.');
      if (lastComma > lastPeriod) {
        // Indonesian: dots group thousands, comma is decimal (e.g. 1.000,50)
        const cleaned = trimmed.replace(/\./g, '').replace(/,/g, '.');
        return parseFloat(cleaned) || 0;
      }
      // US/Excel: commas group thousands, dot is decimal (e.g. 1,000.50)
      const cleaned = trimmed.replace(/,/g, '');
      return parseFloat(cleaned) || 0;
    }

    if (hasComma) {
      const cleaned = trimmed.replace(/\./g, '').replace(/,/g, '.');
      return parseFloat(cleaned) || 0;
    }

    if (hasPeriod) {
      const parts = trimmed.split('.');
      const isThousandsGrouped =
        parts.length >= 2 && parts.slice(1).every((part) => /^\d{3}$/.test(part));

      if (isThousandsGrouped) {
        return parseFloat(parts.join('')) || 0;
      }

      return parseFloat(trimmed) || 0;
    }

    return parseFloat(trimmed.replace(/[^\d-]/g, '')) || 0;
  }

  // For other currencies, use standard parsing (commas for thousands, dots for decimals)
  const cleaned = trimmed.replace(/[^\d.-]/g, '');
  return parseFloat(cleaned) || 0;
};

// Get placeholder text for price input based on currency
export const getPricePlaceholder = (currencyCode?: string): string => {
  const config = getCurrencyConfig(currencyCode);
  
  if (config.locale === 'id-ID') {
    return "e.g., 150.000 or 25,50";
  }
  
  return "e.g., 150,000 or 25.00";
};