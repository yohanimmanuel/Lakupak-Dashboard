import type { ProspectFormFill } from '@/lib/salesJobs/prospectFormFill';

const STORAGE_KEY = 'laku-ai-prospect-fill';

function parseFill(value: unknown): ProspectFormFill | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const customerNumber = typeof row.customerNumber === 'string' ? row.customerNumber.trim() : '';
  const name = typeof row.name === 'string' ? row.name.trim() : '';
  const storeName = typeof row.storeName === 'string' ? row.storeName.trim() : '';
  if (!customerNumber && !name && !storeName) return null;
  return {
    buyerId: typeof row.buyerId === 'string' && row.buyerId.trim() ? row.buyerId.trim() : null,
    customerNumber,
    name,
    storeName,
    phone: typeof row.phone === 'string' ? row.phone : '',
    address: typeof row.address === 'string' ? row.address : '',
    region: typeof row.region === 'string' ? row.region : '',
    buyerType: typeof row.buyerType === 'string' ? row.buyerType : '',
    notes: typeof row.notes === 'string' ? row.notes : '',
  };
}

/** Hands a prospect fill from any AI chat surface to the prospect form. */
export function writePendingProspectFill(fill: ProspectFormFill): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(fill));
  } catch {
    // Navigation still opens the form; a blocked store only skips the fill.
  }
}

export function takePendingProspectFill(): ProspectFormFill | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    window.sessionStorage.removeItem(STORAGE_KEY);
    if (!raw) return null;
    return parseFill(JSON.parse(raw));
  } catch {
    return null;
  }
}
