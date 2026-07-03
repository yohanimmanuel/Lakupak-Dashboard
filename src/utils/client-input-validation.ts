import { validateAuthInput } from '@/utils/auth-security';

export type FieldValidationResult = { valid: boolean; error?: string };

const PHONE_CHARS_REGEX = /^[\d\s+\-().]+$/;
const MIN_PHONE_DIGITS = 5;
const MAX_PHONE_LENGTH = 20;

function validatePhoneValue(value: string, required: boolean): FieldValidationResult {
  const trimmed = value.trim();

  if (!trimmed) {
    return required ? { valid: false, error: 'Phone is required' } : { valid: true };
  }

  if (trimmed.length > MAX_PHONE_LENGTH) {
    return { valid: false, error: 'Phone number must be less than 20 characters' };
  }

  if (!PHONE_CHARS_REGEX.test(trimmed)) {
    return { valid: false, error: 'Please enter a valid phone number' };
  }

  const digitCount = trimmed.replace(/\D/g, '').length;
  if (digitCount < MIN_PHONE_DIGITS) {
    return { valid: false, error: 'Phone number is too short' };
  }

  return { valid: true };
}

export function validateRequiredField(value: string, fieldLabel: string): FieldValidationResult {
  if (!value || !value.trim()) {
    return { valid: false, error: `${fieldLabel} is required` };
  }
  return { valid: true };
}

export function validateOptionalEmail(value: string): FieldValidationResult {
  const trimmed = value.trim();
  if (!trimmed) return { valid: true };
  return validateAuthInput.email(trimmed);
}

export function validateRequiredEmail(value: string): FieldValidationResult {
  return validateAuthInput.email(value);
}

export function validateOptionalPhone(value: string): FieldValidationResult {
  return validatePhoneValue(value, false);
}

export function validateRequiredPhone(value: string): FieldValidationResult {
  return validatePhoneValue(value, true);
}

export function mapContactFieldError(message: string): 'email' | 'phone' | null {
  const lower = message.toLowerCase();
  if (lower.includes('email')) return 'email';
  if (lower.includes('phone')) return 'phone';
  return null;
}

export function mapSupplierFieldError(message: string): string | null {
  const contactField = mapContactFieldError(message);
  if (contactField) return contactField;

  const lower = message.toLowerCase();
  if (lower.includes('supplier name') || lower.includes('name is required')) return 'supplierName';
  if (lower.includes('contact')) return 'contact';
  if (lower.includes('address')) return 'address';
  return null;
}

export function mapBuyerFieldError(message: string): string | null {
  const contactField = mapContactFieldError(message);
  if (contactField) return contactField;

  const lower = message.toLowerCase();
  if (lower.includes('store name')) return 'storeName';
  if (lower.includes('owner')) return 'owner';
  if (lower.includes('address')) return 'address';
  return null;
}

export function clearValidationField(
  errors: Record<string, string>,
  field: string,
): Record<string, string> {
  if (!errors[field]) return errors;
  const next = { ...errors };
  delete next[field];
  return next;
}
