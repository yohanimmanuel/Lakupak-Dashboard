import type { SupplyDetail } from '@/types/client';

export function parseSuppliesJson(raw: string | null | undefined): SupplyDetail[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as SupplyDetail[]) : [];
  } catch {
    return [];
  }
}

export function getSupplyRecordType(row: SupplyDetail): 'history' | 'summary' {
  if (row.recordType === 'history' || row.recordType === 'summary') return row.recordType;
  const no = String(row.suppliesno || '');
  // Legacy product↔supplier sync rows
  if (no.startsWith('AUTO-')) return 'summary';
  return 'history';
}

export function isSupplyHistoryRow(row: SupplyDetail): boolean {
  return getSupplyRecordType(row) === 'history';
}

export function isSupplySummaryRow(row: SupplyDetail): boolean {
  return getSupplyRecordType(row) === 'summary';
}

export function partitionSupplies(rows: SupplyDetail[]): {
  history: SupplyDetail[];
  summary: SupplyDetail[];
} {
  const history: SupplyDetail[] = [];
  const summary: SupplyDetail[] = [];
  for (const row of rows) {
    if (isSupplyHistoryRow(row)) history.push(row);
    else summary.push(row);
  }
  return { history, summary };
}

const toQty = (value: unknown): number => {
  const n = Number(String(value ?? '').replace(/[^\d.-]/g, ''));
  return Number.isFinite(n) ? n : 0;
};

const summaryKey = (row: Pick<SupplyDetail, 'sku' | 'product' | 'productId' | 'variantName'>): string => {
  const productId = String(row.productId || '').trim();
  const variantName = String(row.variantName || '').trim();
  if (productId) return `id:${productId}|${variantName}`.toLowerCase();
  const sku = String(row.sku || '').trim().toLowerCase();
  const product = String(row.product || '').trim().toLowerCase();
  return `sku:${sku}|${product}`;
};

/** Add qty/value onto an existing summary row, or create one. */
export function upsertSummaryFromSupplyEvent(
  supplies: SupplyDetail[],
  event: {
    sku: string;
    product: string;
    quantity: number;
    totalValue: number;
    productId?: string;
    variantName?: string;
    status?: string;
  },
): SupplyDetail[] {
  return applySummaryDelta(supplies, {
    ...event,
    quantity: Math.max(0, Math.floor(event.quantity)),
    totalValue: Math.max(0, Number(event.totalValue) || 0),
  });
}

/** Apply a signed qty/value delta to the matching summary row (clamped at 0). */
export function applySummaryDelta(
  supplies: SupplyDetail[],
  event: {
    sku: string;
    product: string;
    quantity: number;
    totalValue: number;
    productId?: string;
    variantName?: string;
    status?: string;
  },
): SupplyDetail[] {
  const qty = Math.trunc(Number(event.quantity) || 0);
  const rawValue = Number(event.totalValue) || 0;
  const value = Number.isFinite(rawValue) ? rawValue : 0;
  if (qty === 0 && value === 0) return supplies;

  const key = summaryKey(event);
  const out = supplies.map((row) => ({ ...row }));
  const idx = out.findIndex(
    (row) => isSupplySummaryRow(row) && summaryKey(row) === key,
  );

  if (idx >= 0) {
    const current = out[idx];
    const nextQty = Math.max(0, toQty(current.totalSupplied) + qty);
    const nextValue = Math.max(0, toQty(current.totalValue) + value);
    out[idx] = {
      ...current,
      recordType: 'summary',
      sku: event.sku || current.sku,
      product: event.product || current.product,
      productId: event.productId || current.productId,
      variantName: event.variantName || current.variantName,
      totalSupplied: String(nextQty),
      totalValue: String(nextValue),
      status: current.status || event.status || 'Active',
    };
    return out;
  }

  if (qty <= 0 && value <= 0) return out;

  out.push({
    suppliesno: `SUM-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    sku: event.sku,
    product: event.product,
    totalSupplied: String(Math.max(0, qty)),
    totalValue: String(Math.max(0, value)),
    lastDelivery: '',
    status: event.status || 'Active',
    recordType: 'summary',
    productId: event.productId,
    variantName: event.variantName,
  });
  return out;
}

export function shouldUpdateCurrentStock(row: Pick<SupplyDetail, 'updateCurrentStock'>): boolean {
  return row.updateCurrentStock === true;
}

export function createHistorySupplyRow(input: {
  sku: string;
  product: string;
  quantity: number;
  totalValue: number;
  suppliedDate: string;
  productId?: string;
  variantName?: string;
  status?: string;
  updateCurrentStock?: boolean;
  /** Set true only after a successful product-stock increment. */
  stockApplied?: boolean;
}): SupplyDetail {
  const qty = Math.max(0, Math.floor(input.quantity));
  const rawValue = Number(input.totalValue);
  const value = Math.max(0, Number.isFinite(rawValue) ? rawValue : 0);
  return {
    suppliesno: `HIST-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    sku: input.sku,
    product: input.product,
    totalSupplied: String(qty),
    totalValue: String(value),
    lastDelivery: input.suppliedDate,
    status: input.status || 'Active',
    recordType: 'history',
    productId: input.productId,
    variantName: input.variantName,
    // Always persist explicitly so SupplyRecord / API payloads keep the flag.
    updateCurrentStock: input.updateCurrentStock === true,
    stockApplied: input.stockApplied === true,
  };
}

/** Normalize a history row for durable SupplyRecord storage. */
export function serializeHistorySupplyForStorage(row: SupplyDetail): SupplyDetail {
  return {
    suppliesno: String(row.suppliesno || ''),
    sku: String(row.sku || ''),
    product: String(row.product || ''),
    totalSupplied: String(row.totalSupplied || ''),
    totalValue: String(row.totalValue || ''),
    lastDelivery: String(row.lastDelivery || ''),
    status: String(row.status || 'Active'),
    recordType: 'history',
    productId: row.productId ? String(row.productId) : undefined,
    variantName: row.variantName ? String(row.variantName) : undefined,
    updateCurrentStock: row.updateCurrentStock === true,
    stockApplied: row.stockApplied === true,
  };
}

/** Calendar today in Asia/Jakarta as YYYY-MM-DD (browser date inputs for ID users). */
export function todayYmdJakarta(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

/**
 * Accept only a full YYYY-MM-DD string that is a real calendar day (rejects Feb 30, trailing junk).
 * Returns the normalized date or null.
 */
export function parseSupplyDateYmd(value: unknown): string | null {
  const raw = String(value ?? '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const year = Number(raw.slice(0, 4));
  const month = Number(raw.slice(5, 7));
  const day = Number(raw.slice(8, 10));
  const utc = new Date(Date.UTC(year, month - 1, day));
  if (
    utc.getUTCFullYear() !== year ||
    utc.getUTCMonth() !== month - 1 ||
    utc.getUTCDate() !== day
  ) {
    return null;
  }
  return raw;
}

/** True when suppliedDate is calendar-today (Jakarta YMD by default — not UTC). */
export function isSupplyReceivedToday(
  suppliedDate: string,
  todayYmd: string = todayYmdJakarta(),
): boolean {
  const parsed = parseSupplyDateYmd(suppliedDate);
  return parsed != null && parsed === todayYmd;
}
