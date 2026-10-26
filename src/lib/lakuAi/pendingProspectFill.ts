import type { ProspectFormFill } from '@/lib/salesJobs/prospectFormFill';
import type { Buyer } from '@/types/client';

const STORAGE_KEY = 'laku-ai-prospect-fill';

/** Fired after a pending fill is written so an already-open add/edit page can consume it. */
export const PENDING_PROSPECT_FILL_EVENT = 'laku-ai-prospect-fill';

const BUYER_TYPE_LABELS: Record<string, string> = {
  warung: 'Warung',
  kiosk: 'Kiosk',
  minimarket: 'Minimarket',
  restaurant: 'Restaurant',
  hotel: 'Hotel',
  canteen: 'Canteen',
  other: 'Other',
};

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

/** Hands a prospect fill from any AI chat surface to the Clients buyer form. */
export function writePendingProspectFill(fill: ProspectFormFill): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(fill));
  } catch {
    // Navigation still opens the form; a blocked store only skips the fill.
  }
  window.dispatchEvent(new Event(PENDING_PROSPECT_FILL_EVENT));
}

export function peekPendingProspectFill(): ProspectFormFill | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return parseFill(JSON.parse(raw));
  } catch {
    return null;
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

/** Maps an AI Places fill into a Buyer create/edit prefill (status Prospect). */
export function mapProspectFillToBuyer(fill: ProspectFormFill): Buyer {
  const rawType = fill.buyerType.trim();
  const businessType =
    BUYER_TYPE_LABELS[rawType.toLowerCase()] ||
    (rawType ? rawType.charAt(0).toUpperCase() + rawType.slice(1) : '');
  // Buyer form saves notes by splitting on commas; strip commas inside each part.
  const sanitizeNotePart = (part: string) => part.replace(/,/g, ';').trim();
  const noteParts = [
    fill.notes.trim() ? sanitizeNotePart(fill.notes.trim()) : '',
    fill.region.trim() ? sanitizeNotePart(`Region: ${fill.region.trim()}`) : '',
  ].filter(Boolean);
  return {
    buyerId: fill.buyerId || fill.customerNumber || '',
    owner: fill.name || fill.storeName || '',
    storeName: fill.storeName || fill.name || '',
    phone: fill.phone || '',
    email: '',
    address: fill.address || '',
    businessType,
    status: 'Prospect',
    notes: noteParts.length ? JSON.stringify(noteParts) : '',
  };
}
