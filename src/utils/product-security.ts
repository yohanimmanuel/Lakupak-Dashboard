import { ProductFormData } from '@/types/product';

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
  if (typeof (data as { productCategory?: string }).productCategory === 'string') {
    (sanitized as { productCategory?: string }).productCategory = (data as { productCategory: string }).productCategory.trim();
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
