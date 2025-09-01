import { getCurrencyConfig, getServerCurrency, formatCurrencyWithLocale } from '@/config/currencyConfig';

// Currency formatting utility
export const formatCurrency = (amount: number, currency?: string): string => {
  // Use server currency if not specified
  const currencyCode = currency || getServerCurrency();
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

// Get the default currency for the server
export const getDefaultCurrency = (): string => {
  return getServerCurrency();
};

// Get currency symbol
export const getCurrencySymbol = (currency?: string): string => {
  const config = getCurrencyConfig(currency);
  return config.symbol;
};
