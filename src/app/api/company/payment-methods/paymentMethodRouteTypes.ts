import type { CompanyPaymentMethodKind, CompanyPaymentMethodStatus } from '@prisma/client';

export type CompanyPaymentMethodKindJson = CompanyPaymentMethodKind;

export type CompanyPaymentMethodStatusJson = CompanyPaymentMethodStatus;

/** Row shape returned to the dashboard (no secrets). */
export interface CompanyPaymentMethodResponseJson {
  id: string;
  companyId: number;
  kind: CompanyPaymentMethodKindJson;
  label: string;
  last4: string | null;
  expiryMonth: number | null;
  expiryYear: number | null;
  bankName: string | null;
  accountHolderName: string | null;
  accountNumberLast4: string | null;
  ewalletProvider: string | null;
  isDefault: boolean;
  status: CompanyPaymentMethodStatusJson;
  createdAt: string;
  updatedAt: string;
}

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function parsePositiveInt(value: unknown): number | null {
  if (typeof value === 'number' && Number.isInteger(value) && value > 0) return value;
  if (typeof value === 'string' && /^\d+$/.test(value)) {
    const n = parseInt(value, 10);
    return Number.isInteger(n) && n > 0 ? n : null;
  }
  return null;
}

export function parseKind(value: unknown): CompanyPaymentMethodKindJson | null {
  if (value === 'CARD' || value === 'BANK_TRANSFER' || value === 'EWALLET') return value;
  return null;
}

export function parseStatus(value: unknown): CompanyPaymentMethodStatusJson | null {
  if (value === 'ACTIVE' || value === 'EXPIRED' || value === 'PENDING') return value;
  return null;
}

export function readOptionalTrimmedString(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string') return undefined;
  const t = value.trim();
  return t.length > 0 ? t : undefined;
}

export function readOptionalTrimmedStringOrNull(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== 'string') return undefined;
  const t = value.trim();
  return t.length > 0 ? t : null;
}

export function readOptionalInt(value: unknown): number | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value === 'number' && Number.isInteger(value)) return value;
  if (typeof value === 'string' && /^-?\d+$/.test(value)) return parseInt(value, 10);
  return undefined;
}

export function lastDigitsFromAccountInput(raw: string, maxLen: number): string | null {
  if (maxLen <= 0) return null;
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 0) return null;
  return digits.slice(-Math.min(maxLen, digits.length));
}

/** System display string derived from type + details (no custom display label from clients). */
export function buildPaymentMethodLabel(input: {
  kind: CompanyPaymentMethodKindJson;
  last4?: string | null;
  bankName?: string | null;
  ewalletProvider?: string | null;
}): string {
  if (input.kind === 'CARD') {
    const last4 = input.last4?.trim();
    return last4 && last4.length >= 4 ? `Card ····${last4.slice(-4)}` : 'Card';
  }
  if (input.kind === 'BANK_TRANSFER') {
    const bank = input.bankName?.trim();
    return bank || 'Bank transfer';
  }
  const provider = input.ewalletProvider?.trim();
  return provider || 'E-Wallet';
}

export function isValidCardExpiry(month: number | null | undefined, year: number | null | undefined): boolean {
  if (month == null || year == null) return false;
  if (!Number.isInteger(month) || month < 1 || month > 12) return false;
  if (!Number.isInteger(year) || year < 2000 || year > 2100) return false;
  return true;
}
