import { getCurrencyConfig, getServerCurrency, formatCurrencyWithLocale, parseNumberByCurrency } from '@/config/currencyConfig';

// Currency formatting utility
export const formatCurrency = (amount: number | string, currency?: string): string => {
  // Use provided currency or default to IDR if not specified
  const currencyCode = currency || 'IDR';
  return formatCurrencyWithLocale(amount, currencyCode);
};

// Enhanced price parsing utility that handles all currency formats consistently
export const parsePrice = (price: string | number | { toNumber?: () => number; toString?: () => string } | null | undefined, currency?: string): number => {
  // Handle null/undefined
  if (price === null || price === undefined) {
    return 0;
  }
  
  // If already a number, validate it
  if (typeof price === 'number') {
    if (!Number.isFinite(price) || isNaN(price)) {
      return 0;
    }
    return price;
  }
  
  // Handle Prisma Decimal type (Decimal.js object)
  if (typeof price === 'object' && price !== null) {
    try {
      if (typeof (price as { toNumber?: () => number }).toNumber === 'function') {
        const num = (price as { toNumber: () => number }).toNumber();
        if (!Number.isFinite(num) || isNaN(num)) {
          return 0;
        }
        return num;
      }
      if (typeof (price as { toString?: () => string }).toString === 'function') {
        const str = (price as { toString: () => string }).toString();
        const parsed = parseNumberByCurrency(str, currency);
        if (!Number.isFinite(parsed) || isNaN(parsed)) {
          return 0;
        }
        return parsed;
      }
    } catch {
      return 0;
    }
  }
  
  // If string, use the existing parseNumberByCurrency function
  if (typeof price === 'string') {
    const parsed = parseNumberByCurrency(price, currency);
    if (!Number.isFinite(parsed) || isNaN(parsed)) {
      return 0;
    }
    return parsed;
  }
  
  return 0;
};

// Safe price parsing that handles edge cases and provides fallbacks
export const safeParsePrice = (price: string | number | null | undefined | { toNumber?: () => number; toString?: () => string }, currency?: string): number => {
  if (price === null || price === undefined) {
    return 0;
  }
  
  // Handle Prisma Decimal type (can be Decimal.js object)
  if (typeof price === 'object' && price !== null) {
    try {
      if (typeof (price as { toNumber?: () => number }).toNumber === 'function') {
        const num = (price as { toNumber: () => number }).toNumber();
        if (!Number.isFinite(num) || isNaN(num)) {
          return 0;
        }
        return num;
      }
      if (typeof (price as { toString?: () => string }).toString === 'function') {
        const str = (price as { toString: () => string }).toString();
        const parsed = parsePrice(str, currency);
        if (!Number.isFinite(parsed) || isNaN(parsed)) {
          return 0;
        }
        return parsed;
      }
    } catch {
      return 0;
    }
  }
  
  try {
    const parsed = parsePrice(price, currency);
    // Ensure we never return NaN or Infinity
    if (!Number.isFinite(parsed) || isNaN(parsed)) {
      return 0;
    }
    return parsed;
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

// Type for Decimal-like objects (Prisma Decimal type)
export type DecimalLike = { toNumber?: () => number; toString?: () => string };

// Type for currency values that can be parsed
export type CurrencyValue = string | number | DecimalLike | null | undefined;

/**
 * Safely parse amount values to numbers, handling:
 * - Numbers (validates finite)
 * - null/undefined (returns 0)
 * - Decimal-like objects (Prisma Decimal) with toNumber() and/or toString()
 * - Currency strings (delegates to parsePrice for proper decimal separator detection)
 */
export const parseAmountSafely = (amount: unknown, currency?: string): number => {
  // Handle null/undefined
  if (amount == null) {
    return 0;
  }

  // Handle numbers
  if (typeof amount === 'number') {
    return Number.isFinite(amount) ? amount : 0;
  }

  // Handle Decimal-like objects (Prisma Decimal type)
  if (typeof amount === 'object' && amount !== null) {
    try {
      // Try toNumber() first if available
      if (typeof (amount as DecimalLike).toNumber === 'function') {
        const num = (amount as DecimalLike).toNumber!();
        return Number.isFinite(num) ? num : 0;
      }
      // Fallback to toString() if available
      if (typeof (amount as DecimalLike).toString === 'function') {
        const str = (amount as DecimalLike).toString!();
        // Delegate to parsePrice for proper currency string parsing
        return parsePrice(str, currency);
      }
    } catch {
      return 0;
    }
    // If object but no toNumber/toString, return 0
    return 0;
  }

  // Handle strings - delegate to parsePrice for proper currency parsing
  if (typeof amount === 'string') {
    return parsePrice(amount, currency);
  }

  // Fallback: try to convert to string and parse
  try {
    return parsePrice(String(amount), currency);
  } catch {
    return 0;
  }
};
