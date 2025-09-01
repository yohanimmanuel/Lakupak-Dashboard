import { SupplierFormData } from '@/types/client';

// Security headers for supplier API responses
export function getSupplierSecurityHeaders() {
  return {
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'X-XSS-Protection': '1; mode=block',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline';"
  };
}

// Input validation for supplier data (flexible for MVP)
export function validateSupplierInput(data: Partial<SupplierFormData>): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Basic validation - allow blank fields but validate format if present
  if (data.email && data.email.trim()) {
    if (!data.email.includes('@') || !data.email.includes('.')) {
      errors.push('Invalid email format');
    }
  }

  if (data.phone && data.phone.trim()) {
    if (data.phone.length < 5) {
      errors.push('Phone number too short');
    }
  }

  // Allow all other fields to be blank for MVP flexibility
  return {
    isValid: errors.length === 0,
    errors
  };
}

// Input sanitization for supplier data
export function sanitizeSupplierData(data: Partial<SupplierFormData>): Partial<SupplierFormData> {
  const sanitized: Partial<SupplierFormData> = {};

  // Sanitize string fields
  if (typeof data.supplierName === 'string') {
    sanitized.supplierName = data.supplierName.trim();
  }
  if (typeof data.contact === 'string') {
    sanitized.contact = data.contact.trim();
  }
  if (typeof data.phone === 'string') {
    sanitized.phone = data.phone.trim();
  }
  if (typeof data.email === 'string') {
    sanitized.email = data.email.trim().toLowerCase();
  }
  if (typeof data.businessType === 'string') {
    sanitized.businessType = data.businessType.trim();
  }
  if (typeof data.address === 'string') {
    sanitized.address = data.address.trim();
  }
  if (typeof data.status === 'string') {
    sanitized.status = data.status.trim();
  }
  if (typeof data.notes === 'string') {
    sanitized.notes = data.notes.trim();
  }


  return sanitized;
}

// Update validation (same flexible approach)
export function validateSupplierUpdate(data: Partial<SupplierFormData>): { isValid: boolean; errors: string[] } {
  return validateSupplierInput(data);
}

// Generate unique supplier ID
export function generateUniqueSupplierId(): string {
  return 'LKS-' + Math.floor(10000000 + Math.random() * 90000000).toString();
}
