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

export function getSupplyRecordType(row: Pick<SupplyDetail, 'suppliesno' | 'recordType'>): 'history' | 'summary' {
  const no = String(row.suppliesno || '').trim().toUpperCase();
  // AUTO/HIST identifiers are the stable legacy discriminator. In older rows,
  // SupplyRecord.recordType could inherit its DB default ('history') even for AUTO.
  if (no.startsWith('AUTO-')) return 'summary';
  if (no.startsWith('HIST-')) return 'history';
  if (row.recordType === 'history' || row.recordType === 'summary') return row.recordType;
  return 'history';
}

export function isSupplyHistoryRow(row: SupplyDetail): boolean {
  return getSupplyRecordType(row) === 'history';
}

export function isSupplySummaryRow(row: SupplyDetail): boolean {
  return getSupplyRecordType(row) === 'summary';
}

/**
 * Return the supplier-entered receipt quantity/unit for display and storage.
 * Older SupplyRecord rows may have an empty-string receivedQuantity (the DB
 * default) even though totalSupplied contains the canonical Pieces quantity.
 * In that legacy case, expose the canonical amount as Pieces; never pair a
 * piece-total with a stale Carton/Box unit because that would multiply it again.
 */
export function getSupplyReceivedInput(
  row: Pick<SupplyDetail, 'receivedQuantity' | 'receivedUnit' | 'totalSupplied'>,
): { receivedQuantity: string; receivedUnit: string } {
  const enteredQuantity = String(row.receivedQuantity ?? '').trim();
  if (enteredQuantity) {
    return {
      receivedQuantity: enteredQuantity,
      receivedUnit: String(row.receivedUnit || 'Pieces').trim() || 'Pieces',
    };
  }
  return {
    receivedQuantity: String(row.totalSupplied ?? '').trim(),
    receivedUnit: 'Pieces',
  };
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

const normKey = (value: unknown): string => String(value ?? '').trim().toLowerCase();

/**
 * Receipt helpers intentionally do not produce supplier opening balances or
 * AUTO summary rows. Supplier reporting is performed from receipt history only.
 */
export function serializeHistorySupplyForStorage(row: SupplyDetail): SupplyDetail {
  const receivedInput = getSupplyReceivedInput(row);
  return {
    suppliesno: String(row.suppliesno || ''),
    sku: String(row.sku || ''),
    product: String(row.product || ''),
    // Keep the canonical Pieces total for inventory, but also persist exactly what
    // the supplier entered and selected so the UI can restore the chosen stock level.
    totalSupplied: String(row.totalSupplied || ''),
    receivedQuantity: receivedInput.receivedQuantity,
    receivedUnit: receivedInput.receivedUnit,
    totalValue: String(row.totalValue || ''),
    lastSuppliedDate: String(row.lastSuppliedDate || row.lastDelivery || ''),
    status: String(row.status || 'Active'),
    recordType: 'history',
    productId: row.productId ? String(row.productId) : undefined,
    variantName: row.variantName ? String(row.variantName) : undefined,
    // These IDs are the inventory identity. Omitting them makes the visible
    // SKU/variant labels look selected while the saved receipt loses its live
    // target, so stock updates are rejected and the checkbox is cleared.
    variantOptionId: row.variantOptionId == null ? undefined : Number(row.variantOptionId),
    historicalVariantOptionId: row.historicalVariantOptionId == null
      ? (row.variantOptionId == null ? undefined : Number(row.variantOptionId))
      : Number(row.historicalVariantOptionId),
    stockAppliedVariantOptionId: row.stockAppliedVariantOptionId == null
      ? undefined
      : Number(row.stockAppliedVariantOptionId),
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
