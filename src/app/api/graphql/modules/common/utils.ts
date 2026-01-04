export const MAX_DEFAULT_LIMIT = 100;
export const MAX_PRODUCT_LIMIT = 1000;
export const MAX_MARKETPLACE_LIMIT = 200;

export const sanitizePagination = (page = 1, limit = 20, max = MAX_DEFAULT_LIMIT) => {
  const safePage = Number.isFinite(page) && page > 0 ? Math.floor(page) : 1;
  const safeLimit = Number.isFinite(limit) && limit > 0 ? Math.min(Math.floor(limit), max) : Math.min(20, max);
  return { page: safePage, limit: safeLimit };
};

export const buildPaginationInfo = (page: number, limit: number, totalCount: number) => ({
  page,
  limit,
  totalCount,
  totalPages: Math.max(1, Math.ceil(totalCount / limit)),
});

export const isNumericId = (value: string) => /^\d+$/.test(value);

export const parseMoney = (value: string | number | null | undefined | { toNumber?: () => number; toString?: () => string }): number => {
  // Handle Prisma Decimal type (can be number or Decimal.js object)
  if (value === null || value === undefined) {
    return 0;
  }
  if (typeof value === 'number') {
    // Check for NaN and Infinity explicitly
    if (!Number.isFinite(value) || isNaN(value)) {
      return 0;
    }
    return value;
  }
  if (typeof value === 'string') {
    // Handle empty strings
    if (value.trim() === '' || value === 'null' || value === 'undefined') {
      return 0;
    }
    const parsed = Number.parseFloat(value.replace(/,/g, ''));
    // Check for NaN and Infinity
    if (!Number.isFinite(parsed) || isNaN(parsed)) {
      return 0;
    }
    return parsed;
  }
  // Handle Decimal.js objects (if Prisma returns them)
  if (typeof value === 'object' && value !== null) {
    try {
      if (typeof (value as { toNumber?: () => number }).toNumber === 'function') {
        const num = (value as { toNumber: () => number }).toNumber();
        if (!Number.isFinite(num) || isNaN(num)) {
          return 0;
        }
        return num;
      }
      if (typeof (value as { toString?: () => string }).toString === 'function') {
        const str = (value as { toString: () => string }).toString();
        if (str === '' || str === 'null' || str === 'undefined') {
          return 0;
        }
        const parsed = Number.parseFloat(str.replace(/,/g, ''));
        if (!Number.isFinite(parsed) || isNaN(parsed)) {
          return 0;
        }
        return parsed;
      }
    } catch {
      // If conversion fails, return 0
      return 0;
    }
  }
  // Fallback: try to convert to number
  try {
    const num = Number(value);
    if (!Number.isFinite(num) || isNaN(num)) {
      return 0;
    }
    return num;
  } catch {
    return 0;
  }
};

export const asISOString = (value?: Date | null) => (value ? value.toISOString() : null);

