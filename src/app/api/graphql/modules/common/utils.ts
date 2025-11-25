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

export const parseMoney = (value: string | number | null | undefined): number => {
  if (typeof value === 'number') {
    return value;
  }
  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value.replace(/,/g, ''));
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
};

export const asISOString = (value?: Date | null) => (value ? value.toISOString() : null);

