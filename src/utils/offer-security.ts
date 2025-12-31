import { OfferFormData } from '@/types/offer';

/**
 * Sanitize and validate offer form data
 */
export function sanitizeOfferData(data: OfferFormData): OfferFormData {
  return {
    name: sanitizeString(data.name, 100),
    description: data.description ? sanitizeString(data.description, 500) : undefined,
    type: data.type, // Already validated as array
    discountTypes: data.discountTypes.map(dt => ({
      discountType: validateDiscountType(dt.discountType),
      discountValue: validateDiscountValue(dt.discountValue, dt.discountType),
      isActive: dt.isActive,
      priority: dt.priority
    })),
    minOrderValue: data.minOrderValue ? validatePositiveStringNumber(data.minOrderValue) : undefined,
    minQuantity: data.minQuantity ? validatePositiveInteger(data.minQuantity) : undefined,
    startDate: validateDate(data.startDate),
    endDate: validateDate(data.endDate),
    productIds: validateProductIds(data.productIds),
  };
}

/**
 * Sanitize string input
 */
function sanitizeString(input: string, maxLength: number): string {
  if (typeof input !== 'string') {
    throw new Error('Invalid input type');
  }

  // Remove potentially dangerous characters
  const sanitized = input
    .replace(/[<>]/g, '') // Remove HTML tags
    .replace(/javascript:/gi, '') // Remove javascript: protocol
    .replace(/on\w+=/gi, '') // Remove event handlers
    .trim();

  if (sanitized.length === 0) {
    throw new Error('Input cannot be empty');
  }

  if (sanitized.length > maxLength) {
    throw new Error(`Input exceeds maximum length of ${maxLength} characters`);
  }

  return sanitized;
}

/**
 * Validate offer type
 */
function validateOfferType(type: string): 'discount' | 'promotion' {
  if (type !== 'discount' && type !== 'promotion') {
    throw new Error('Invalid offer type. Must be "discount" or "promotion"');
  }
  return type;
}

/**
 * Validate discount type
 */
function validateDiscountType(discountType: string): 'percentage' | 'fixed' | 'buy_x_get_y' {
  const validTypes = ['percentage', 'fixed', 'buy_x_get_y'];
  if (!validTypes.includes(discountType)) {
    throw new Error('Invalid discount type. Must be "percentage", "fixed", or "buy_x_get_y"');
  }
  return discountType as 'percentage' | 'fixed' | 'buy_x_get_y';
}

/**
 * Validate discount value
 */
function validateDiscountValue(value: number, discountType: string): number {
  if (typeof value !== 'number' || isNaN(value) || value <= 0) {
    throw new Error('Discount value must be a positive number');
  }

  if (discountType === 'percentage' && value > 100) {
    throw new Error('Percentage discount cannot exceed 100%');
  }

  return Math.round(value * 100) / 100; // Round to 2 decimal places
}

/**
 * Validate positive number
 */
function validatePositiveNumber(value: number): number {
  if (typeof value !== 'number' || isNaN(value) || value <= 0) {
    throw new Error('Value must be a positive number');
  }
  return Math.round(value * 100) / 100; // Round to 2 decimal places
}

/**
 * Validate positive string number (handles commas, dots, etc.)
 */
function validatePositiveStringNumber(value: string): string {
  if (typeof value !== 'string') {
    throw new Error('Value must be a string');
  }

  // Remove all non-numeric characters except dots and commas
  const cleanValue = value.replace(/[^\d.,]/g, '');
  
  if (cleanValue.length === 0) {
    throw new Error('Value cannot be empty');
  }

  // Convert to number for validation (replace comma with dot for parsing)
  const numericValue = parseFloat(cleanValue.replace(',', '.'));
  
  if (isNaN(numericValue) || numericValue <= 0) {
    throw new Error('Value must be a positive number');
  }

  // Return the original string (with formatting intact)
  return value.trim();
}

/**
 * Validate positive integer
 */
function validatePositiveInteger(value: number): number {
  if (typeof value !== 'number' || isNaN(value) || !Number.isInteger(value) || value <= 0) {
    throw new Error('Value must be a positive integer');
  }
  return value;
}

/**
 * Validate date
 */
function validateDate(dateString: string): string {
  const date = new Date(dateString);
  if (isNaN(date.getTime())) {
    throw new Error('Invalid date format');
  }
  return date.toISOString();
}

/**
 * Validate product IDs array
 */
function validateProductIds(productIds: string[]): string[] {
  if (!Array.isArray(productIds)) {
    throw new Error('Product IDs must be an array');
  }

  if (productIds.length === 0) {
    throw new Error('At least one product must be selected');
  }

  // Validate each product ID
  const sanitizedIds = productIds.map(id => {
    if (typeof id !== 'string' || id.trim().length === 0) {
      throw new Error('Invalid product ID');
    }
    return id.trim();
  });

  // Remove duplicates
  const uniqueIds = [...new Set(sanitizedIds)];
  if (uniqueIds.length !== productIds.length) {
    throw new Error('Duplicate product IDs are not allowed');
  }

  return uniqueIds;
}

/**
 * Validate date range
 */
export function validateDateRange(startDate: string, endDate: string): void {
  const start = new Date(startDate);
  const end = new Date(endDate);
  
  if (start >= end) {
    throw new Error('End date must be after start date');
  }

  // Check if start date is not in the past (optional validation)
  const now = new Date();
  if (start < now) {
    throw new Error('Start date cannot be in the past');
  }
}

/**
 * Validate offer status transition
 * Allow flexible transitions - users can reactivate expired offers by changing date ranges
 */
export function validateStatusTransition(currentStatus: string, newStatus: string): void {
  // Allow all transitions for flexibility - users can manually control status
  // Expired offers can be reactivated by changing date ranges
  const validStatuses = ['active', 'inactive', 'expired'];
  if (!validStatuses.includes(newStatus)) {
    throw new Error(`Invalid status: ${newStatus}`);
  }
  // No restriction on transitions - maximum flexibility
}

/**
 * Calculate offer expiration status
 * Uses Asia/Jakarta timezone (WIB, UTC+7) to match Indonesian business hours
 */
export function calculateOfferStatus(startDate: string, endDate: string, currentStatus?: string): 'active' | 'expired' | 'inactive' {
  // Import Luxon for timezone-aware date handling
  const { DateTime } = require('luxon');
  
  // Get current time in Asia/Jakarta timezone
  const now = DateTime.now().setZone('Asia/Jakarta');
  
  const start = DateTime.fromISO(startDate, { zone: 'Asia/Jakarta' }).startOf('day');
  const end = DateTime.fromISO(endDate, { zone: 'Asia/Jakarta' }).endOf('day');

  // If manually set to inactive, keep it inactive
  if (currentStatus === 'inactive') {
    return 'inactive';
  }

  // If past end date, it's expired
  if (now > end) {
    return 'expired';
  }

  // If before start date or between start and end, it's active
  return 'active';
}

/**
 * Generate unique offer ID
 */
export function generateOfferId(): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substr(2, 9);
  return `OFF-${timestamp}-${random}`.toUpperCase();
}

/**
 * Format discount display text
 */
export function formatDiscountDisplay(discountType: string, discountValue: number): string {
  switch (discountType) {
    case 'percentage':
      return `${discountValue}%`;
    case 'fixed':
      return `$${discountValue.toFixed(2)}`;
    case 'buy_x_get_y':
      return `Buy ${discountValue} Get 1`;
    default:
      return `${discountValue}`;
  }
}

/**
 * Calculate discount amount for a given price
 */
export function calculateDiscountAmount(
  originalPrice: number,
  discountType: string,
  discountValue: number,
  quantity: number = 1
): number {
  switch (discountType) {
    case 'percentage':
      return (originalPrice * discountValue / 100) * quantity;
    case 'fixed':
      return discountValue * quantity;
    case 'buy_x_get_y':
      // For buy_x_get_y, calculate how many free items the customer gets
      const freeItems = Math.floor(quantity / (discountValue + 1));
      return originalPrice * freeItems;
    default:
      return 0;
  }
}
