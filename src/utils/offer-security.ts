import { OfferFormData, OfferDiscountType } from '@/types/offer';

const ALLOWED: OfferDiscountType[] = [
  'percentage',
  'fixed_amount',
  'buy_x_get_y',
];

/**
 * Sanitize and validate per-retailer offer form data
 */
export function sanitizeOfferData(data: OfferFormData): OfferFormData {
  const discountType = validateDiscountType(data.discountType);
  return {
    buyerId: data.buyerId ? sanitizeString(data.buyerId, 100) : null,
    productId: data.productId ? sanitizeString(data.productId, 100) : null,
    categoryId: data.categoryId ? sanitizeString(data.categoryId, 100) : null,
    discountType,
    discountValue: validateDiscountValue(data.discountValue, discountType),
    buyQuantity:
      discountType === 'buy_x_get_y' ||
      (data.buyQuantity != null &&
        data.freeQuantity != null &&
        Number(data.buyQuantity) > 0 &&
        Number(data.freeQuantity) > 0)
        ? validatePositiveInteger(data.buyQuantity ?? 0)
        : data.buyQuantity ?? null,
    freeQuantity:
      discountType === 'buy_x_get_y' ||
      (data.buyQuantity != null &&
        data.freeQuantity != null &&
        Number(data.buyQuantity) > 0 &&
        Number(data.freeQuantity) > 0)
        ? validatePositiveInteger(
            data.freeQuantity ??
              (discountType === 'buy_x_get_y' ? Math.round(data.discountValue) : 0),
          )
        : data.freeQuantity ?? null,
    startDate: validateDate(data.startDate),
    endDate: data.endDate ? validateDate(data.endDate) : null,
    status: data.status,
    notes: data.notes ? sanitizeString(data.notes, 500) : undefined,
    description: data.description ? sanitizeString(data.description, 500) : undefined,
  };
}

function sanitizeString(input: string, maxLength: number): string {
  if (typeof input !== 'string') {
    throw new Error('Invalid input type');
  }

  const sanitized = input
    .replace(/[<>]/g, '')
    .replace(/javascript:/gi, '')
    .replace(/on\w+=/gi, '')
    .trim();

  if (sanitized.length === 0) {
    throw new Error('Input cannot be empty');
  }

  if (sanitized.length > maxLength) {
    throw new Error(`Input exceeds maximum length of ${maxLength}`);
  }

  return sanitized;
}

function validateDiscountType(type: string): OfferDiscountType {
  if (!ALLOWED.includes(type as OfferDiscountType)) {
    throw new Error('Invalid discount type');
  }
  return type as OfferDiscountType;
}

function validateDiscountValue(value: number, type: OfferDiscountType): number {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error('Discount value must be greater than 0');
  }
  if (type === 'percentage' && value > 100) {
    throw new Error('Percentage discount cannot exceed 100');
  }
  return value;
}

function validatePositiveInteger(value: number): number {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n) || n < 1) {
    throw new Error('Value must be a positive integer');
  }
  return n;
}

function validateDate(date: string): string {
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) {
    throw new Error('Invalid date');
  }
  return d.toISOString();
}

/**
 * Validate date range (end optional / standing)
 */
export function validateDateRange(startDate: string, endDate: string): void {
  const start = new Date(startDate);
  const end = new Date(endDate);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    throw new Error('Invalid date range');
  }
  if (end < start) {
    throw new Error('End date must be on or after start date');
  }
}
