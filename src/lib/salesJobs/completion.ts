export const SALES_JOB_TYPES = [
  'take_order',
  'collect_payment',
  'promote_product',
  'stock_check',
  'prospect_new_outlet',
  'returns_pickup',
  'competitor_intel',
  'new_product_activation',
  'scheme_reconciliation',
] as const;

export type SalesJobType = (typeof SALES_JOB_TYPES)[number];

export const RETURN_REASONS = ['expired', 'damaged', 'unsold_near_expiry', 'other'] as const;
export type ReturnReason = (typeof RETURN_REASONS)[number];

export type ReturnedItem = {
  product_id: string;
  quantity: number;
  reason: ReturnReason;
};

export type StockCount = {
  product_id: string;
  checked: boolean;
  counted: number | null;
};

export const OPEN_JOB_STATUSES = ['pending', 'approved', 'suggested', 'dispatched', 'in_progress'] as const;

export type CompletionData = {
  order_placed: boolean;
  order_amount: number | null;
  payment_collected: boolean;
  payment_amount: number | null;
  stock_checked: boolean;
  products_demoed: number;
  notes: string;
  delivered?: boolean;
  promoted?: boolean;
  returned?: boolean;
  product_given?: boolean;
  stock_counts?: StockCount[];
  items_returned?: ReturnedItem[];
  replacement_issued?: boolean;
  replacement_value?: number | null;
  competitor_name?: string;
  competitor_product?: string;
  observed_price?: number | null;
  observed_promo?: string;
  shelf_share_observation?: string;
  product_id?: string;
  product_ids?: string[];
  display_setup_completed?: boolean;
  samples_given?: number | null;
  retailer_briefed?: boolean;
  scheme_reference?: string;
  execution_confirmed?: boolean;
  claim_amount?: number | null;
};

export function emptyCompletion(): CompletionData {
  return {
    order_placed: false,
    order_amount: null,
    payment_collected: false,
    payment_amount: null,
    stock_checked: false,
    products_demoed: 0,
    notes: '',
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function finiteAmount(value: unknown): number | null {
  if (value == null || value === '') return null;
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : null;
}

function optionalText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function parseStockCounts(value: unknown): StockCount[] {
  if (!Array.isArray(value)) return [];
  const lines: StockCount[] = [];
  for (const entry of value) {
    const row = asRecord(entry);
    if (!row) continue;
    const productId = optionalText(row.product_id);
    if (!productId) continue;
    const counted = row.counted == null || row.counted === '' ? null : finiteAmount(row.counted);
    lines.push({
      product_id: productId,
      checked: row.checked !== false,
      counted: counted == null ? null : Math.max(0, Math.floor(counted)),
    });
  }
  return lines;
}

function parseReturnedItems(value: unknown): ReturnedItem[] {
  if (!Array.isArray(value)) return [];
  const items: ReturnedItem[] = [];
  for (const entry of value) {
    const row = asRecord(entry);
    if (!row) continue;
    const productId = optionalText(row.product_id);
    const quantity = finiteAmount(row.quantity);
    const reason = optionalText(row.reason);
    if (!productId || quantity == null || quantity <= 0) continue;
    if (!(RETURN_REASONS as readonly string[]).includes(reason)) continue;
    items.push({ product_id: productId, quantity: Math.floor(quantity), reason: reason as ReturnReason });
  }
  return items;
}

export function readCompletion(value: unknown): CompletionData {
  const base = emptyCompletion();
  const row = asRecord(value);
  if (!row) return base;
  const productsDemoed = finiteAmount(row.products_demoed);
  const data: CompletionData = {
    order_placed: row.order_placed === true,
    order_amount: finiteAmount(row.order_amount),
    payment_collected: row.payment_collected === true,
    payment_amount: finiteAmount(row.payment_amount),
    stock_checked: row.stock_checked === true,
    products_demoed: productsDemoed == null ? 0 : Math.max(0, Math.floor(productsDemoed)),
    notes: typeof row.notes === 'string' ? row.notes : '',
  };
  if (Array.isArray(row.stock_counts)) data.stock_counts = parseStockCounts(row.stock_counts);
  if (typeof row.delivered === 'boolean') data.delivered = row.delivered;
  if (typeof row.promoted === 'boolean') data.promoted = row.promoted;
  if (typeof row.returned === 'boolean') data.returned = row.returned;
  if (typeof row.product_given === 'boolean') data.product_given = row.product_given;
  if (Array.isArray(row.items_returned)) data.items_returned = parseReturnedItems(row.items_returned);
  if (typeof row.replacement_issued === 'boolean') data.replacement_issued = row.replacement_issued;
  if (row.replacement_value != null && row.replacement_value !== '') data.replacement_value = finiteAmount(row.replacement_value);
  if (typeof row.competitor_name === 'string') data.competitor_name = row.competitor_name;
  if (typeof row.competitor_product === 'string') data.competitor_product = row.competitor_product;
  if (row.observed_price != null && row.observed_price !== '') data.observed_price = finiteAmount(row.observed_price);
  if (typeof row.observed_promo === 'string') data.observed_promo = row.observed_promo;
  if (typeof row.shelf_share_observation === 'string') data.shelf_share_observation = row.shelf_share_observation;
  if (typeof row.product_id === 'string') data.product_id = row.product_id;
  if (Array.isArray(row.product_ids)) {
    data.product_ids = row.product_ids.map((id) => optionalText(id)).filter(Boolean);
  }
  if (typeof row.display_setup_completed === 'boolean') data.display_setup_completed = row.display_setup_completed;
  if (row.samples_given != null && row.samples_given !== '') data.samples_given = finiteAmount(row.samples_given);
  if (typeof row.retailer_briefed === 'boolean') data.retailer_briefed = row.retailer_briefed;
  if (typeof row.scheme_reference === 'string') data.scheme_reference = row.scheme_reference;
  if (typeof row.execution_confirmed === 'boolean') data.execution_confirmed = row.execution_confirmed;
  if (row.claim_amount != null && row.claim_amount !== '') data.claim_amount = finiteAmount(row.claim_amount);
  return data;
}

function rejectNegative(value: number | null, label: string) {
  if (value != null && value < 0) throw new Error(`${label} cannot be negative`);
}

function strictStockCounts(value: unknown): StockCount[] {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => {
    const row = asRecord(entry);
    const productId = optionalText(row?.product_id);
    if (!productId) throw new Error('Each stock line needs a product');
    const counted = row?.counted == null || row?.counted === '' ? null : finiteAmount(row?.counted);
    if (counted != null && (!Number.isInteger(counted) || counted < 0)) throw new Error('Counted stock cannot be negative');
    return { product_id: productId, checked: row?.checked !== false, counted: counted == null ? null : Math.floor(counted) };
  });
}

function cleared(notes: string): CompletionData {
  return {
    order_placed: false,
    order_amount: null,
    payment_collected: false,
    payment_amount: null,
    stock_checked: false,
    products_demoed: 0,
    notes,
  };
}

/** Keeps the shared completion fields and adds only the block for this job type. */
export function buildStoredCompletion(jobType: string, value: unknown): CompletionData {
  const row = asRecord(value);
  const notes = typeof row?.notes === 'string' ? row.notes : '';

  if (jobType === 'take_order') {
    const delivered = row?.delivered === true || (row?.delivered == null && row?.order_placed === true);
    return { ...cleared(notes), delivered, order_placed: delivered, order_amount: finiteAmount(row?.order_amount) };
  }

  if (jobType === 'collect_payment') {
    return { ...cleared(notes), payment_collected: row?.payment_collected === true, payment_amount: null };
  }

  if (jobType === 'promote_product') {
    return { ...cleared(notes), promoted: row?.promoted === true };
  }

  if (jobType === 'stock_check') {
    return {
      ...cleared(notes),
      stock_checked: row?.stock_checked === true,
      stock_counts: strictStockCounts(row?.stock_counts),
    };
  }

  if (jobType === 'returns_pickup') {
    return { ...cleared(notes), returned: row?.returned === true, items_returned: [] };
  }

  if (jobType === 'competitor_intel') {
    const competitorName = optionalText(row?.competitor_name);
    if (!competitorName) throw new Error('Name the competitor');
    const observedPrice = finiteAmount(row?.observed_price);
    rejectNegative(observedPrice, 'Observed price');
    return {
      ...cleared(notes),
      competitor_name: competitorName,
      competitor_product: optionalText(row?.competitor_product),
      observed_price: observedPrice,
      observed_promo: optionalText(row?.observed_promo),
      shelf_share_observation: optionalText(row?.shelf_share_observation),
    };
  }

  if (jobType === 'new_product_activation') {
    const samplesGiven = finiteAmount(row?.samples_given);
    if (samplesGiven != null && (!Number.isInteger(samplesGiven) || samplesGiven < 0)) {
      throw new Error('Product given cannot be negative');
    }
    return {
      ...cleared(notes),
      product_given: row?.product_given === true,
      samples_given: samplesGiven == null ? null : Math.floor(samplesGiven),
      retailer_briefed: false,
    };
  }

  if (jobType === 'scheme_reconciliation') {
    const claimAmount = finiteAmount(row?.claim_amount);
    rejectNegative(claimAmount, 'Claim amount');
    return {
      ...cleared(notes),
      scheme_reference: optionalText(row?.scheme_reference),
      execution_confirmed: row?.execution_confirmed === true,
      claim_amount: claimAmount,
    };
  }

  return cleared(notes);
}

export function isFieldRep(role: string): boolean {
  const normalized = role.toLowerCase();
  if (normalized.includes('manager')) return false;
  return normalized.includes('rep') || normalized.includes('canvass') || normalized.includes('sales');
}
