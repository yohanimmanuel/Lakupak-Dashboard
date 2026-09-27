export const SALES_JOB_TYPES = [
  'take_order',
  'collect_payment',
  'promote_product',
  'stock_check',
  'prospect_new_outlet',
] as const;

export type SalesJobType = (typeof SALES_JOB_TYPES)[number];

export const OPEN_JOB_STATUSES = ['suggested', 'approved', 'dispatched', 'in_progress'] as const;

export type CompletionData = {
  order_placed: boolean;
  order_amount: number | null;
  payment_collected: boolean;
  payment_amount: number | null;
  stock_checked: boolean;
  products_demoed: number;
  notes: string;
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

export function readCompletion(value: unknown): CompletionData {
  const base = emptyCompletion();
  if (!value || typeof value !== 'object' || Array.isArray(value)) return base;
  const row = value as Record<string, unknown>;
  const amount = (key: string) => {
    const n = Number(row[key]);
    return Number.isFinite(n) ? n : null;
  };
  return {
    order_placed: row.order_placed === true,
    order_amount: amount('order_amount'),
    payment_collected: row.payment_collected === true,
    payment_amount: amount('payment_amount'),
    stock_checked: row.stock_checked === true,
    products_demoed: Number.isFinite(Number(row.products_demoed)) ? Math.max(0, Math.floor(Number(row.products_demoed))) : 0,
    notes: typeof row.notes === 'string' ? row.notes : '',
  };
}

export function isFieldRep(role: string): boolean {
  const normalized = role.toLowerCase();
  if (normalized.includes('manager')) return false;
  return normalized.includes('rep') || normalized.includes('canvass') || normalized.includes('sales');
}
