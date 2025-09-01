import { getCurrencyConfig, getServerCurrency, formatCurrencyWithLocale } from '@/config/currencyConfig';

// Currency formatting utility
export const formatCurrency = (amount: number, currency?: string): string => {
  // Use provided currency or default to IDR if not specified
  const currencyCode = currency || 'IDR';
  return formatCurrencyWithLocale(amount, currencyCode);
};

// Format currency without symbol (just the number)
export const formatCurrencyAmount = (amount: number, currency?: string): string => {
  const config = getCurrencyConfig(currency);
  
  try {
    return new Intl.NumberFormat(config.locale, {
      minimumFractionDigits: config.formatOptions.minimumFractionDigits,
      maximumFractionDigits: config.formatOptions.maximumFractionDigits
    }).format(amount);
  } catch (error) {
    // Fallback to simple formatting
    return amount.toLocaleString(config.locale);
  }
};

// Get the default currency (IDR as fallback)
export const getDefaultCurrency = (): string => {
  return 'IDR';
};

// Get currency symbol
export const getCurrencySymbol = (currency?: string): string => {
  const config = getCurrencyConfig(currency);
  return config.symbol;
};
