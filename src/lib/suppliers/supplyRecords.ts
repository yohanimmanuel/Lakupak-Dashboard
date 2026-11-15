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

type SummaryIdentity = Pick<SupplyDetail, 'sku' | 'product' | 'productId' | 'variantName'>;

const normKey = (value: unknown): string => String(value ?? '').trim().toLowerCase();

/** False only when both rows are linked to the catalog and point at different variants. */
const sameCatalogVariantOrUnlinked = (a: SummaryIdentity, b: SummaryIdentity): boolean => {
  const aId = normKey(a.productId);
  const bId = normKey(b.productId);
  if (!aId || !bId) return true;
  if (aId !== bId) return false;
  const aVariant = normKey(a.variantName);
  const bVariant = normKey(b.variantName);
  return !aVariant || !bVariant || aVariant === bVariant;
};

/**
 * Find the summary row a supply event rolls into:
 * 1. same catalog identity (productId + variantName),
 * 2. exact SKU — so imported rows without a productId still land on the linked total.
 *    A row linked to a different catalog variant is never reused (variants can share a SKU);
 *    if several rows qualify, the one with the same product label wins.
 * 3. rows without a SKU fall back to the product label.
 * Returns -1 when nothing matches (caller creates a new total).
 */
function findSummaryIndex(rows: SupplyDetail[], target: SummaryIdentity): number {
  const key = summaryKey(target);
  const byIdentity = rows.findIndex((row) => isSupplySummaryRow(row) && summaryKey(row) === key);
  if (byIdentity >= 0) return byIdentity;

  const sku = normKey(target.sku);
  if (!sku) return -1;
  const bySku: number[] = [];
  rows.forEach((row, index) => {
    if (!isSupplySummaryRow(row)) return;
    if (normKey(row.sku) !== sku) return;
    if (!sameCatalogVariantOrUnlinked(row, target)) return;
    bySku.push(index);
  });
  if (bySku.length <= 1) return bySku[0] ?? -1;
  const product = normKey(target.product);
  return bySku.find((index) => normKey(rows[index].product) === product) ?? bySku[0];
}

/**
 * Build the supplier-facing summary from persisted supplier totals and receipt history.
 *
 * Product-linked summary rows are the authoritative running totals: when a product
 * variant is first linked to a supplier, they contain its opening supply balance;
 * finalizeSupplierSuppliesSave then applies each receipt/edit/delete delta to that
 * same summary row. Therefore, adding history to a linked summary would double-count
 * receipts. History is aggregated only for variants that do not yet have a summary row.
 *
 * All stored quantities remain canonical Pieces. UI components convert these totals
 * into the product's configured package-level quantities for display.
 */
export function buildSupplySummaryFromHistory(
  historyRows: SupplyDetail[],
  linkedSummaryRows: SupplyDetail[] = [],
): SupplyDetail[] {
  const grouped = new Map<string, SupplyDetail>();
  const summaryBackedIdentities = new Set<string>();
  const aliasToIdentity = new Map<string, string>();
  const ambiguousAliases = new Set<string>();

  const primaryIdentity = (row: SupplyDetail): string => {
    const productId = normKey(row.productId);
    const variantName = normKey(row.variantName);
    const sku = normKey(row.sku);
    const product = normKey(row.product);

    if (productId && variantName) return `id:${productId}|${variantName}`;
    // A shared SKU is not a variant identity. Include the variant/product label
    // whenever the catalog identity is unavailable (legacy rows often share SKUs).
    if (sku && product) return `sku:${sku}|product:${product}`;
    if (productId && product) return `id:${productId}|product:${product}`;
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

    if (sku && product) aliases.push(`sku-product:${sku}|${product}`);
    if (product) aliases.push(`product:${product}`);
    if (productId && variantName) aliases.push(`id:${productId}|${variantName}`);
    // SKU-only matching is retained only as a possible fallback. It is marked
    // ambiguous below when multiple variants share that SKU.
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

  // Preserve the product-linked summary row as the opening/running supplier balance.
  // syncProductSupplies creates it when the product variant is first linked; subsequent
  // supply-history changes are already applied to it by finalizeSupplierSuppliesSave.
  // A zero-valued linked row can still use history as a fallback for older records
  // whose first receipt predates summary-delta persistence.
  for (const row of linkedSummaryRows) {
    if (!isSupplySummaryRow(row)) continue;
    const identity = primaryIdentity(row);
    if (!identity) continue;

    const existing = grouped.get(identity);
    if (!existing) {
      const openingOrRunningQuantity = Math.max(0, Math.trunc(toQty(row.totalSupplied)));
      const openingOrRunningValue = Math.max(0, Math.round(toQty(row.totalValue)));
      grouped.set(identity, {
        ...row,
        totalSupplied: String(openingOrRunningQuantity),
        totalValue: String(openingOrRunningValue),
        lastDelivery: String(row.lastDelivery || ''),
        recordType: 'summary',
      });
      if (openingOrRunningQuantity > 0 || openingOrRunningValue > 0) {
        summaryBackedIdentities.add(identity);
      }
    }
    for (const alias of aliasesFor(row)) registerAlias(alias, identity);
  }

  for (const row of historyRows) {
    if (!isSupplyHistoryRow(row)) continue;

    const directIdentity = primaryIdentity(row);
    const matchedIdentity = directIdentity && grouped.has(directIdentity)
      ? directIdentity
      : aliasesFor(row)
          .filter((alias) => !alias.startsWith('sku-only:'))
          .map((alias) => aliasToIdentity.get(alias))
          .find((identity): identity is string => Boolean(identity))
        || (!normKey(row.product) && normKey(row.sku)
          ? aliasToIdentity.get(`sku-only:${normKey(row.sku)}`)
          : undefined)
        || directIdentity;

    if (!matchedIdentity) continue;

    const quantity = Math.max(0, Math.trunc(toQty(row.totalSupplied)));
    const value = Math.max(0, Math.round(toQty(row.totalValue)));
    if (quantity === 0 && value === 0) continue;

    const current = grouped.get(matchedIdentity);
    if (current) {
      // The stored linked summary is already opening balance + receipt deltas. Do not
      // add the same history event again. For a zero-valued legacy summary placeholder,
      // aggregate history to reconstruct the receipt total.
      if (!summaryBackedIdentities.has(matchedIdentity)) {
        current.totalSupplied = String(toQty(current.totalSupplied) + quantity);
        current.totalValue = String(toQty(current.totalValue) + value);
      }
      if (String(row.lastDelivery || '') > String(current.lastDelivery || '')) {
        current.lastDelivery = String(row.lastDelivery || '');
      }
      // Fill missing legacy labels/identity without replacing catalog-linked labels.
      current.sku = current.sku || String(row.sku || '');
      current.product = current.product || String(row.product || '');
      current.productId = current.productId || row.productId;
      current.variantName = current.variantName || row.variantName;
      continue;
    }

    grouped.set(matchedIdentity, {
      suppliesno: `SUPPLY-SUMMARY-${grouped.size + 1}`,
      sku: String(row.sku || ''),
      product: String(row.product || ''),
      totalSupplied: String(quantity),
      totalValue: String(value),
      lastDelivery: String(row.lastDelivery || ''),
      status: String(row.status || 'Active'),
      recordType: 'summary',
      productId: row.productId,
      variantName: row.variantName,
    });
    for (const alias of aliasesFor(row)) registerAlias(alias, matchedIdentity);
  }

  return Array.from(grouped.values()).sort((a, b) =>
    String(a.sku || '').localeCompare(String(b.sku || '')) ||
    String(a.product || '').localeCompare(String(b.product || '')),
  );
}

/**
 * Fold legacy persisted summary rows that resolve to the same total into one row.
 * Kept for persistence/transfer compatibility; supplier-facing summaries should use
 * buildSupplySummaryFromHistory so product-linked opening/running balances are preserved
 * without counting the same history events twice.
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
    const base = rowIsLinked ? row : current;
    const other = rowIsLinked ? current : row;
    out[idx] = {
      ...base,
      recordType: 'summary',
      sku: base.sku || other.sku,
      product: base.product || other.product,
      productId: base.productId || other.productId,
      variantName: base.variantName || other.variantName,
      totalSupplied: String(toQty(current.totalSupplied) + toQty(row.totalSupplied)),
      totalValue: String(toQty(current.totalValue) + toQty(row.totalValue)),
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
  receivedQuantity?: string;
  receivedUnit?: string;
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
    receivedQuantity: String(input.receivedQuantity ?? qty),
    receivedUnit: String(input.receivedUnit || 'Pieces'),
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
    receivedQuantity: String(row.receivedQuantity ?? row.totalSupplied ?? ''),
    receivedUnit: String(row.receivedUnit || 'Pieces'),
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
