export type SalesJobReturnedItem = {
  product_id: string;
  quantity: number;
  reason: 'expired' | 'damaged' | 'unsold_near_expiry' | 'other';
};

export type SalesJobStockCount = {
  product_id: string;
  checked: boolean;
  counted: number | null;
};

export type SalesJobCompletion = {
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
  stock_counts?: SalesJobStockCount[];
  items_returned?: SalesJobReturnedItem[];
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
  given_counts?: { product_id: string; quantity: number }[];
  retailer_briefed?: boolean;
  scheme_reference?: string;
  execution_confirmed?: boolean;
  claim_amount?: number | null;
};

export type SalesJobSchedule = {
  date: string;
  reminderTime: string;
};

export type SalesJobRow = {
  id: string;
  assignedTo: string;
  agentName: string;
  clientId: string;
  clientCustomerNumber?: string;
  clientName: string;
  clientOwner?: string;
  clientPhone?: string;
  clientAddress?: string;
  clientStatus: string;
  linkedClients?: { name: string; status: string }[];
  jobType: string;
  priorityReason: string | null;
  suggestedProducts?: string[];
  orderIds?: string[];
  clientIds?: string[];
  orderId?: string | null;
  suggestedProductNames: string[];
  createdBy: string;
  status: string;
  scheduledDate: string;
  createdAt: string;
  updatedAt?: string;
  listGroupId?: string;
  schedules?: SalesJobSchedule[];
  completionData: SalesJobCompletion;
  dispatchNote: string | null;
};

export const SALES_JOB_TYPES = [
  'take_order',
  'collect_payment',
  'promote_product',
  'stock_check',
  'prospect_new_outlet',
  'returns_pickup',
  'competitor_intel',
  'new_product_activation',
] as const;

export const SALES_JOB_STATUSES = [
  'pending',
  'dispatched',
  'in_progress',
  'completed',
  'skipped',
] as const;

export type SalesJobStatus = (typeof SALES_JOB_STATUSES)[number];

export const PENDING_SALES_JOB_STATUSES = ['pending', 'approved', 'suggested'] as const;

export const OPEN_SALES_JOB_STATUSES = ['pending', 'approved', 'suggested', 'dispatched', 'in_progress'] as const;

export function salesJobStatusKey(status: string): string {
  if (status === 'approved' || status === 'suggested') return 'pending';
  return status;
}
