import { getCurrencyConfig, getServerCurrency, formatCurrencyWithLocale, parseNumberByCurrency } from '@/config/currencyConfig';

// Currency formatting utility
export const formatCurrency = (amount: number | string, currency?: string): string => {
  // Use provided currency or default to IDR if not specified
  const currencyCode = currency || 'IDR';
  return formatCurrencyWithLocale(amount, currencyCode);
};

// Enhanced price parsing utility that handles all currency formats consistently
export const parsePrice = (price: string | number, currency?: string): number => {
  // If already a number, return it
  if (typeof price === 'number') {
    return price;
  }
  
  // If string, use the existing parseNumberByCurrency function
  if (typeof price === 'string') {
    return parseNumberByCurrency(price, currency);
  }
  
  return 0;
};

// Safe price parsing that handles edge cases and provides fallbacks
export const safeParsePrice = (price: string | number | null | undefined, currency?: string): number => {
  if (price === null || price === undefined) {
    return 0;
  }
  
  try {
    return parsePrice(price, currency);
  } catch (error) {
    return 0;
  }
};

// Validate if a price string is in correct format for the currency
export const isValidPriceFormat = (price: string, currency?: string): boolean => {
  try {
    const parsed = parsePrice(price, currency);
    return !isNaN(parsed) && isFinite(parsed) && parsed >= 0;
  } catch {
    return false;
  }
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
