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

export const OPEN_JOB_STATUSES = ['suggested', 'approved', 'dispatched', 'in_progress'] as const;

export type CompletionData = {
  order_placed: boolean;
  order_amount: number | null;
  payment_collected: boolean;
  payment_amount: number | null;
  stock_checked: boolean;
  products_demoed: number;
  notes: string;
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

function strictReturnedItems(value: unknown): ReturnedItem[] {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => {
    const row = asRecord(entry);
    const productId = optionalText(row?.product_id);
    const quantity = finiteAmount(row?.quantity);
    const reason = optionalText(row?.reason);
    if (!productId || quantity == null || !Number.isInteger(quantity) || quantity <= 0 || !(RETURN_REASONS as readonly string[]).includes(reason)) {
      throw new Error('Each returned item needs a product, a quantity, and a reason');
    }
    rejectNegative(quantity, 'Returned quantity');
    return { product_id: productId, quantity: Math.floor(quantity), reason: reason as ReturnReason };
  });
}

/** Keeps the shared completion fields and adds only the block for this job type. */
export function buildStoredCompletion(jobType: string, value: unknown): CompletionData {
  const row = asRecord(value);
  const base = readCompletion(value);
  const shared: CompletionData = {
    order_placed: base.order_placed,
    order_amount: base.order_amount,
    payment_collected: base.payment_collected,
    payment_amount: base.payment_amount,
    stock_checked: base.stock_checked,
    products_demoed: base.products_demoed,
    notes: base.notes,
  };
  rejectNegative(shared.order_amount, 'Completion amounts');
  rejectNegative(shared.payment_amount, 'Completion amounts');

  if (jobType === 'returns_pickup') {
    const replacementIssued = row?.replacement_issued === true;
    const replacementValue = finiteAmount(row?.replacement_value);
    rejectNegative(replacementValue, 'Replacement value');
    return {
      ...shared,
      items_returned: strictReturnedItems(row?.items_returned),
      replacement_issued: replacementIssued,
      replacement_value: replacementIssued ? replacementValue : null,
    };
  }

  if (jobType === 'competitor_intel') {
    const competitorName = optionalText(row?.competitor_name);
    if (!competitorName) throw new Error('Name the competitor');
    const observedPrice = finiteAmount(row?.observed_price);
    rejectNegative(observedPrice, 'Observed price');
    return {
      ...shared,
      competitor_name: competitorName,
      competitor_product: optionalText(row?.competitor_product),
      observed_price: observedPrice,
      observed_promo: optionalText(row?.observed_promo),
      shelf_share_observation: optionalText(row?.shelf_share_observation),
    };
  }

  if (jobType === 'new_product_activation') {
    const listed = Array.isArray(row?.product_ids) ? row.product_ids.map((id) => optionalText(id)).filter(Boolean) : [];
    const productIds = Array.from(new Set([...listed, optionalText(row?.product_id)].filter(Boolean)));
    if (productIds.length === 0) throw new Error('Select at least one product');
    const samplesGiven = finiteAmount(row?.samples_given);
    if (samplesGiven != null && (!Number.isInteger(samplesGiven) || samplesGiven < 0)) {
      throw new Error('Samples given cannot be negative');
    }
    return {
      ...shared,
      product_id: productIds[0],
      product_ids: productIds,
      display_setup_completed: row?.display_setup_completed === true,
      samples_given: samplesGiven == null ? null : Math.floor(samplesGiven),
      retailer_briefed: row?.retailer_briefed === true,
    };
  }

  if (jobType === 'scheme_reconciliation') {
    const claimAmount = finiteAmount(row?.claim_amount);
    rejectNegative(claimAmount, 'Claim amount');
    return {
      ...shared,
      scheme_reference: optionalText(row?.scheme_reference),
      execution_confirmed: row?.execution_confirmed === true,
      claim_amount: claimAmount,
    };
  }

  return shared;
}

export function isFieldRep(role: string): boolean {
  const normalized = role.toLowerCase();
  if (normalized.includes('manager')) return false;
  return normalized.includes('rep') || normalized.includes('canvass') || normalized.includes('sales');
}
