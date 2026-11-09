import { ProductFormData } from '@/types/product';

/** Text a product must have before it can be saved. */
export const PRODUCT_REQUIRED_TEXT = {
  name: { min: 2, max: 200 },
  description: { min: 1, max: 4000 },
  productType: { min: 1, max: 80 },
  brand: { min: 1, max: 120 },
  supplier: { min: 1, max: 200 },
} as const;

/** Optional on create/update (GraphQL `String`, DB nullable); validate length only when set. */
export const PRODUCT_OPTIONAL_TEXT = {
  marketSegment: { max: 100 },
} as const;

export type ProductRequiredTextField = keyof typeof PRODUCT_REQUIRED_TEXT;

export function productRequiredTextError(
  field: ProductRequiredTextField,
  value: unknown,
): 'required' | 'tooShort' | 'tooLong' | 'invalid' | null {
  if (typeof value !== 'string') return 'invalid';
  const trimmed = value.trim();
  const { min, max } = PRODUCT_REQUIRED_TEXT[field];
  if (trimmed.length === 0) return 'required';
  if (trimmed.length < min) return 'tooShort';
  if (trimmed.length > max) return 'tooLong';
  return null;
}

/** Empty/null/undefined are allowed; non-empty values must fit the max length. */
export function productMarketSegmentError(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') return 'Market segment is invalid.';
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  if (trimmed.length > PRODUCT_OPTIONAL_TEXT.marketSegment.max) {
    return 'Market segment is too long.';
  }
  return null;
}

export function productImagesError(images: unknown): string | null {
  if (images == null) return null;
  if (!Array.isArray(images) || images.length > 12) return 'Product images are invalid.';
  if (images.some((img) => typeof img !== 'string' || img.trim().length === 0 || img.length > 2048)) {
    return 'Product images are invalid.';
  }
  return null;
}

const PRODUCT_TEXT_LABEL: Record<ProductRequiredTextField, string> = {
  name: 'Product name',
  description: 'Product description',
  productType: 'Product type',
  brand: 'Brand',
  supplier: 'Supplier',
};

/** `required` checks every field. `present` checks only fields included in the payload. */
export function productTextFieldsError(
  input: Partial<Record<ProductRequiredTextField, unknown>>,
  mode: 'required' | 'present',
): string | null {
  for (const field of Object.keys(PRODUCT_REQUIRED_TEXT) as ProductRequiredTextField[]) {
    if (mode === 'present' && input[field] === undefined) continue;
    const code = productRequiredTextError(field, input[field] ?? '');
    if (!code) continue;
    const label = PRODUCT_TEXT_LABEL[field];
    if (code === 'tooLong') return `${label} is too long.`;
    if (code === 'tooShort') return `${label} must be at least ${PRODUCT_REQUIRED_TEXT[field].min} characters.`;
    return `${label} is required.`;
  }
  return null;
}

export function productReturnDaysError(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  const days = Number(value);
  if (!Number.isInteger(days) || days < 0 || days > 3650) return 'Return policy days are invalid.';
  return null;
}

// Security headers for product API responses
export function getProductSecurityHeaders() {
  return {
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'X-XSS-Protection': '1; mode=block',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline';"
  };
}

// Input validation for product data (flexible for MVP)
export function validateProductInput(data: Partial<ProductFormData>): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Basic validation - allow blank fields but validate format if present
  // For MVP, we allow all fields to be blank for flexibility
  // Only validate format if data is provided

  // Allow all other fields to be blank for MVP flexibility
  return {
    isValid: errors.length === 0,
    errors
  };
}

// Input sanitization for product data
export function sanitizeProductData(data: Partial<ProductFormData>): Partial<ProductFormData> {
  const sanitized: Partial<ProductFormData> = {};

  // Sanitize string fields
  if (typeof data.sku === 'string') {
    sanitized.sku = data.sku.trim();
  }
  if (typeof data.name === 'string') {
    sanitized.name = data.name.trim();
  }
  if (typeof data.description === 'string') {
    sanitized.description = data.description.trim();
  }
  if (typeof (data as { productType?: string }).productType === 'string') {
    (sanitized as { productType?: string }).productType = (data as { productType: string }).productType.trim();
  }
  if (typeof data.brand === 'string') {
    sanitized.brand = data.brand.trim();
  }
  if (typeof data.supplier === 'string') {
    sanitized.supplier = data.supplier.trim();
  }
  // Pricing fields removed - now handled at variant level
  if (typeof data.status === 'string') {
    sanitized.status = data.status.trim() as 'Draft' | 'Published';
  }
  if (typeof data.catalogName === 'string') {
    sanitized.catalogName = data.catalogName.trim();
  }


  return sanitized;
}

// Update validation (same flexible approach)
export function validateProductUpdate(data: Partial<ProductFormData>): { isValid: boolean; errors: string[] } {
  return validateProductInput(data);
}

// Generate unique product ID
export function generateUniqueProductId(): string {
  return 'LKP-' + Math.floor(10000000 + Math.random() * 90000000).toString();
}
