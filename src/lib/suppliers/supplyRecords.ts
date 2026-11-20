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
 * A supplier summary represents one catalog product + its SKU/variant.
 * Distributor-facing product labels can differ, so the label must not split a
 * catalog-linked row when both productId and SKU are identical. Different SKUs
 * under the same productId remain separate variants.
 */
const summaryKey = (row: SummaryIdentity): string => {
  const productId = normKey(row.productId);
  const sku = normKey(row.sku);
  const variantName = normKey(row.variantName);
  const product = normKey(row.product);
  if (row.variantOptionId != null) return `variant-option:${row.variantOptionId}`;
  if (productId && variantName) return `id:${productId}|variant:${variantName}`;
  if (productId && sku) return `id:${productId}|sku:${sku}`;
  if (productId) return `id:${productId}|variant:${variantName || product}`;
  // Without a catalog ID, retain the label as a safety discriminator because
  // legacy suppliers may reuse a generic SKU across unrelated products.
  return `sku:${sku}|product:${product}`;
};

type SummaryIdentity = Pick<SupplyDetail, 'sku' | 'product' | 'productId' | 'variantName' | 'variantOptionId'>;

const incompatibleVariantIds = (a: SummaryIdentity, b: SummaryIdentity): boolean =>
  a.variantOptionId != null && b.variantOptionId != null &&
  String(a.variantOptionId) !== String(b.variantOptionId);

// An explicitly linked historical variant must never be adopted by another
// variant, even if its SKU and display name were reused.
const compatibleVariantIds = (a: SummaryIdentity, b: SummaryIdentity): boolean =>
  (a.variantOptionId == null && b.variantOptionId == null) ||
  (a.variantOptionId != null && b.variantOptionId != null && !incompatibleVariantIds(a, b));


/** Never combine the same distributor SKU across two different catalog products. */
const sameCatalogProductOrUnlinked = (a: SummaryIdentity, b: SummaryIdentity): boolean => {
  const aId = normKey(a.productId);
  const bId = normKey(b.productId);
  return !aId || !bId || aId === bId;
};

/**
 * Find the summary row a supply event rolls into:
 * 1. same catalog product + SKU identity,
 * 2. exact SKU for imported rows when it identifies one unambiguous catalog product,
 * 3. product label as a fallback for rows without a usable SKU.
 * Returns -1 when nothing matches (caller creates a new total).
 */
function findSummaryIndex(rows: SupplyDetail[], target: SummaryIdentity): number {
  const key = summaryKey(target);
  const byIdentity = rows.findIndex((row) => isSupplySummaryRow(row) && compatibleVariantIds(row, target) && summaryKey(row) === key);
  if (byIdentity >= 0) return byIdentity;

  // A shared SKU is not a variant identity. Never merge distinct named
  // variants on SKU fallback, even when only one candidate exists.
  if (normKey(target.variantName)) return -1;
  const sku = normKey(target.sku);
  if (!sku) return -1;
  const bySku: number[] = [];
  rows.forEach((row, index) => {
    if (!isSupplySummaryRow(row)) return;
    if (normKey(row.sku) !== sku) return;
    if (!sameCatalogProductOrUnlinked(row, target) || !compatibleVariantIds(row, target)) return;
    bySku.push(index);
  });
  const product = normKey(target.product);
  const exactProductLabel = bySku.find((index) => normKey(rows[index].product) === product);
  if (exactProductLabel != null) return exactProductLabel;
  if (bySku.length === 1) {
    const candidate = rows[bySku[0]];
    // Without either catalog ID, matching on SKU alone is unsafe when the labels
    // disagree: legacy supplier workbooks can reuse a generic SKU for variants.
    if (!normKey(target.productId) && !normKey(candidate.productId)) return -1;
    return bySku[0];
  }
  return -1;
}

/**
 * Fold duplicate product-stock snapshots into one row. Duplicate AUTO rows represent
 * the same current variant stock, so they are not additive; HIST receipts are projected
 * separately and summed exactly once by buildSupplySummaryFromHistory().
 */
export function mergeDuplicateSummaryRows(supplies: SupplyDetail[]): SupplyDetail[] {
  const out: SupplyDetail[] = [];
  let merged = false;
  for (const row of supplies) {
    const idx = isSupplySummaryRow(row) ? findSummaryIndex(out, row) : -1;
    if (idx < 0) {
      out.push(row);
      continue;
    }
    const current = out[idx];
    // Keep the catalog-linked row as the base so its AUTO id / label survive.
    const rowIsLinked = Boolean(normKey(row.productId)) && !normKey(current.productId);
    const other = rowIsLinked ? current : row;
    // Duplicate AUTO rows are repeated snapshots of the same product variant,
    // not separate receipts. Adding their quantities on every reconciliation
    // inflates supplier totals. Keep one deterministic snapshot; dated HIST rows
    // are aggregated separately by buildSupplySummaryFromHistory().
    const preferred = rowIsLinked ? row : current;
    out[idx] = {
      ...preferred,
      recordType: 'summary',
      sku: preferred.sku || other.sku,
      product: preferred.product || other.product,
      productId: preferred.productId || other.productId,
      variantName: preferred.variantName || other.variantName,
      variantOptionId: preferred.variantOptionId ?? other.variantOptionId,
      totalSupplied: String(Math.max(toQty(current.totalSupplied), toQty(row.totalSupplied))),
      totalValue: String(Math.max(toQty(current.totalValue), toQty(row.totalValue))),
    };
    merged = true;
  }
  return merged ? out : supplies;
}

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
    variantOptionId?: number | null;
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
    variantOptionId?: number | null;
    status?: string;
  },
): SupplyDetail[] {
  const qty = Math.trunc(Number(event.quantity) || 0);
  const rawValue = Number(event.totalValue) || 0;
  const value = Number.isFinite(rawValue) ? rawValue : 0;
  if (qty === 0 && value === 0) return supplies;

  const out = supplies.map((row) => ({ ...row }));
  const idx = findSummaryIndex(out, event);

  if (idx >= 0) {
    const current = out[idx];
    const nextQty = Math.max(0, toQty(current.totalSupplied) + qty);
    const nextValue = Math.max(0, toQty(current.totalValue) + value);
    // An unlinked event (e.g. import) matched by SKU must not relabel a catalog-linked total.
    const keepCurrentLabels = Boolean(normKey(current.productId)) && !normKey(event.productId);
    out[idx] = {
      ...current,
      recordType: 'summary',
      sku: keepCurrentLabels ? current.sku || event.sku : event.sku || current.sku,
      product: keepCurrentLabels
        ? current.product || event.product
        : event.product || current.product,
      productId: event.productId || current.productId,
      variantName: event.variantName || current.variantName,
      variantOptionId: current.variantOptionId ?? event.variantOptionId,
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
    lastSuppliedDate: '',
    status: event.status || 'Active',
    recordType: 'summary',
    productId: event.productId,
    variantName: event.variantName,
    variantOptionId: event.variantOptionId,
  });
  return out;
}


/**
 * Build the supplier-facing summary from persisted supplier totals and receipt history.
 *
 * Supplier reporting combines opening snapshots and every distinct historical receipt.
 * The stockApplied flag controls catalog inventory updates, not supplier reporting.
 * All quantities remain canonical Pieces; the profile converts them for display.
 * Callers must ensure opening snapshots represent opening stock, not current stock
 * already including the receipts, to avoid counting the same physical units twice.
 */
export function buildSupplySummaryFromHistory(
  historyRows: readonly SupplyDetail[],
  linkedSummaryRows: readonly SupplyDetail[] = [],
): SupplyDetail[] {
  const grouped = new Map<string, SupplyDetail>();
  const aliasToIdentity = new Map<string, string>();
  const ambiguousAliases = new Set<string>();

  const primaryIdentity = (row: SupplyDetail): string => {
    const productId = normKey(row.productId);
    const sku = normKey(row.sku);
    const variantName = normKey(row.variantName);
    const product = normKey(row.product);
    if (row.variantOptionId != null) return `variant-option:${row.variantOptionId}`;
    if (productId && variantName) return `id:${productId}|variant:${variantName}`;
    if (productId && sku) return `id:${productId}|sku:${sku}`;
    if (productId && variantName) return `id:${productId}|variant:${variantName}`;
    if (productId && product) return `id:${productId}|variant:${product}`;
    if (sku && product) return `sku:${sku}|product:${product}`;
    if (product) return `product:${product}`;
    if (sku) return `sku:${sku}`;
    return '';
  };

  const aliasesFor = (row: SupplyDetail): string[] => {
    const aliases: string[] = [];
    const sku = normKey(row.sku);
    const product = normKey(row.product);
    const productId = normKey(row.productId);
    const variantName = normKey(row.variantName);
    if (row.variantOptionId != null) return [`variant-option:${row.variantOptionId}`];
    if (productId && sku) aliases.push(`id:${productId}|sku:${sku}`);
    if (productId && variantName) aliases.push(`id:${productId}|variant:${variantName}`);
    if (sku && product) aliases.push(`sku-product:${sku}|${product}`);
    if (product) aliases.push(`product:${product}`);
    if (sku) aliases.push(`sku-only:${sku}`);
    return aliases;
  };

  const registerAlias = (alias: string, identity: string) => {
    if (ambiguousAliases.has(alias)) return;
    const existing = aliasToIdentity.get(alias);
    if (existing && existing !== identity) {
      aliasToIdentity.delete(alias);
      ambiguousAliases.add(alias);
      return;
    }
    aliasToIdentity.set(alias, identity);
  };

  // AUTO summary rows are a deterministic snapshot of current Product variant
  // stock, not a running total. Receipt history is added below exactly once.
  for (const row of mergeDuplicateSummaryRows([...linkedSummaryRows])) {
    if (!isSupplySummaryRow(row)) continue;
    const identity = primaryIdentity(row);
    if (!identity || grouped.has(identity)) continue;
    grouped.set(identity, {
      ...row,
      totalSupplied: String(Math.max(0, Math.trunc(toQty(row.totalSupplied)))),
      totalValue: String(Math.max(0, Math.round(toQty(row.totalValue)))),
      lastSuppliedDate: String(row.lastSuppliedDate || ''),
      recordType: 'summary',
    });
    for (const alias of aliasesFor(row)) registerAlias(alias, identity);
  }

  for (const row of historyRows) {
    if (!isSupplyHistoryRow(row)) continue;

    const directIdentity = primaryIdentity(row);
    const matchedIdentity = (directIdentity && grouped.has(directIdentity) ? directIdentity : undefined)
      || (row.variantOptionId != null ? undefined : aliasesFor(row)
        .map((alias) => aliasToIdentity.get(alias))
        .find((identity): identity is string => Boolean(identity)))
      || (row.variantOptionId == null && !normKey(row.product) && normKey(row.sku)
        ? aliasToIdentity.get(`sku-only:${normKey(row.sku)}`)
        : undefined)
      || directIdentity;

    if (!matchedIdentity) continue;
    // Supplier reporting counts every persisted receipt once, regardless of whether
    // it also updated catalog inventory. Opening balances are a separate category.
    const quantity = Math.max(0, Math.trunc(toQty(row.totalSupplied)));
    const value = Math.max(0, Math.round(toQty(row.totalValue)));

    const current = grouped.get(matchedIdentity);
    if (current) {
      // Each history receipt contributes once to supplier reporting.
      current.totalSupplied = String(toQty(current.totalSupplied) + quantity);
      current.totalValue = String(toQty(current.totalValue) + value);
      if (String(row.lastSuppliedDate || '') > String(current.lastSuppliedDate || '')) {
        current.lastSuppliedDate = String(row.lastSuppliedDate || '');
      }
      current.sku = current.sku || String(row.sku || '');
      current.product = current.product || String(row.product || '');
      current.productId = current.productId || row.productId;
      current.variantName = current.variantName || row.variantName;
      continue;
    }

    // An unlinked receipt has no Product variant snapshot. Keep a summary made
    // solely from its non-stock-applied history, grouping later matching events.
    if (quantity === 0 && value === 0) continue;
    grouped.set(matchedIdentity, {
      suppliesno: `SUPPLY-SUMMARY-${grouped.size + 1}`,
      sku: String(row.sku || ''),
      product: String(row.product || ''),
      totalSupplied: String(quantity),
      totalValue: String(value),
      lastSuppliedDate: String(row.lastSuppliedDate || ''),
      status: String(row.status || 'Active'),
      recordType: 'summary',
      productId: row.productId,
      variantName: row.variantName,
      variantOptionId: row.variantOptionId,
    });
    for (const alias of aliasesFor(row)) registerAlias(alias, matchedIdentity);
  }

  return Array.from(grouped.values()).sort((a, b) =>
    String(a.sku || '').localeCompare(String(b.sku || '')) ||
    String(a.product || '').localeCompare(String(b.product || '')),
  );
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
  variantOptionId?: number | null;
  status?: string;
  receivedQuantity?: string;
  receivedUnit?: string;
  updateCurrentStock?: boolean;
  /** Set true only after a successful product-stock increment. */
  stockApplied?: boolean;
}): SupplyDetail {
  const qty = Math.max(0, Math.floor(input.quantity));
  const rawValue = Number(input.totalValue);
  const value = Math.max(0, Number.isFinite(rawValue) ? rawValue : 0);
  const enteredQuantity = String(input.receivedQuantity ?? '').trim();
  const receivedInput = enteredQuantity
    ? { receivedQuantity: enteredQuantity, receivedUnit: String(input.receivedUnit || 'Pieces') }
    : { receivedQuantity: String(qty), receivedUnit: 'Pieces' };
  return {
    suppliesno: `HIST-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    sku: input.sku,
    product: input.product,
    totalSupplied: String(qty),
    receivedQuantity: receivedInput.receivedQuantity,
    receivedUnit: receivedInput.receivedUnit,
    totalValue: String(value),
    lastSuppliedDate: input.suppliedDate,
    status: input.status || 'Active',
    recordType: 'history',
    productId: input.productId,
    variantName: input.variantName,
    variantOptionId: input.variantOptionId ?? undefined,
    // Always persist explicitly so SupplyRecord / API payloads keep the flag.
    updateCurrentStock: input.updateCurrentStock === true,
    stockApplied: input.stockApplied === true,
  };
}

/** Normalize a history row for durable SupplyRecord storage. */
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
