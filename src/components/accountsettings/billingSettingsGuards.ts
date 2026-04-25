import type { CompanyPaymentMethodKind, CompanyPaymentMethodStatus } from '@prisma/client';

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function readApiErrorMessage(json: unknown): string | undefined {
  if (!isPlainObject(json)) return undefined;
  const err = json.error;
  return typeof err === 'string' ? err : undefined;
}

/** Company row returned by GET `/api/company` for billing settings (subset + billing fields). */
export interface CompanyBillingApiResponse {
  id: number;
  name: string;
  logo: string | null;
  bannerImage: string | null;
  businessAddress: string | null;
  businessPhone: string | null;
  businessEmail: string | null;
  pickupAddress: string | null;
  billingBankName: string | null;
  billingBankAccountName: string | null;
  billingBankAccountNumber: string | null;
  billingCompanyName: string | null;
  billingAddressLine1: string | null;
  billingCity: string | null;
  billingState: string | null;
  billingPostalCode: string | null;
  billingCountry: string | null;
  billingContactPhone: string | null;
  billingContactEmail: string | null;
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === 'string';
}

export function isCompanyBillingApiResponse(value: unknown): value is CompanyBillingApiResponse {
  if (!isPlainObject(value)) return false;
  if (typeof value.id !== 'number' || !Number.isInteger(value.id) || value.id <= 0) return false;
  if (typeof value.name !== 'string') return false;

  // Ensure all declared keys exist and have correct runtime types.
  if (!('logo' in value) || !isNullableString(value.logo)) return false;
  if (!('bannerImage' in value) || !isNullableString(value.bannerImage)) return false;
  if (!('businessAddress' in value) || !isNullableString(value.businessAddress)) return false;
  if (!('businessPhone' in value) || !isNullableString(value.businessPhone)) return false;
  if (!('businessEmail' in value) || !isNullableString(value.businessEmail)) return false;
  if (!('pickupAddress' in value) || !isNullableString(value.pickupAddress)) return false;

  if (!('billingBankName' in value) || !isNullableString(value.billingBankName)) return false;
  if (!('billingBankAccountName' in value) || !isNullableString(value.billingBankAccountName)) return false;
  if (!('billingBankAccountNumber' in value) || !isNullableString(value.billingBankAccountNumber)) return false;

  if (!('billingCompanyName' in value) || !isNullableString(value.billingCompanyName)) return false;
  if (!('billingAddressLine1' in value) || !isNullableString(value.billingAddressLine1)) return false;
  if (!('billingCity' in value) || !isNullableString(value.billingCity)) return false;
  if (!('billingState' in value) || !isNullableString(value.billingState)) return false;
  if (!('billingPostalCode' in value) || !isNullableString(value.billingPostalCode)) return false;
  if (!('billingCountry' in value) || !isNullableString(value.billingCountry)) return false;
  if (!('billingContactPhone' in value) || !isNullableString(value.billingContactPhone)) return false;
  if (!('billingContactEmail' in value) || !isNullableString(value.billingContactEmail)) return false;

  return true;
}

export interface CompanyPaymentMethodApiRow {
  id: string;
  companyId: number;
  kind: CompanyPaymentMethodKind;
  label: string;
  last4: string | null;
  expiryMonth: number | null;
  expiryYear: number | null;
  bankName: string | null;
  accountHolderName: string | null;
  accountNumberLast4: string | null;
  ewalletProvider: string | null;
  isDefault: boolean;
  status: CompanyPaymentMethodStatus;
  createdAt: string;
  updatedAt: string;
}

function isPaymentMethodKind(value: unknown): value is CompanyPaymentMethodKind {
  return value === 'CARD' || value === 'BANK_TRANSFER' || value === 'EWALLET';
}

function isPaymentMethodStatus(value: unknown): value is CompanyPaymentMethodStatus {
  return value === 'ACTIVE' || value === 'EXPIRED' || value === 'PENDING';
}

export function isCompanyPaymentMethodApiRow(value: unknown): value is CompanyPaymentMethodApiRow {
  if (!isPlainObject(value)) return false;
  if (typeof value.id !== 'string' || value.id.length === 0) return false;
  if (typeof value.companyId !== 'number' || !Number.isInteger(value.companyId) || value.companyId <= 0) return false;
  if (!isPaymentMethodKind(value.kind)) return false;
  if (typeof value.label !== 'string') return false;
  if (value.last4 != null && typeof value.last4 !== 'string') return false;
  if (value.expiryMonth != null && typeof value.expiryMonth !== 'number') return false;
  if (value.expiryYear != null && typeof value.expiryYear !== 'number') return false;
  if (value.bankName != null && typeof value.bankName !== 'string') return false;
  if (value.accountHolderName != null && typeof value.accountHolderName !== 'string') return false;
  if (value.accountNumberLast4 != null && typeof value.accountNumberLast4 !== 'string') return false;
  if (value.ewalletProvider != null && typeof value.ewalletProvider !== 'string') return false;
  if (typeof value.isDefault !== 'boolean') return false;
  if (!isPaymentMethodStatus(value.status)) return false;
  if (typeof value.createdAt !== 'string') return false;
  if (typeof value.updatedAt !== 'string') return false;
  return true;
}

export function isCompanyPaymentMethodApiRowArray(value: unknown): value is CompanyPaymentMethodApiRow[] {
  if (!Array.isArray(value)) return false;
  for (const item of value) {
    if (!isCompanyPaymentMethodApiRow(item)) return false;
  }
  return true;
}
