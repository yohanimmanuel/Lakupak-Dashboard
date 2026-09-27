export type SalesJobCompletion = {
  order_placed: boolean;
  order_amount: number | null;
  payment_collected: boolean;
  payment_amount: number | null;
  stock_checked: boolean;
  products_demoed: number;
  notes: string;
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
  clientName: string;
  clientStatus: string;
  jobType: string;
  priorityReason: string | null;
  suggestedProductNames: string[];
  createdBy: string;
  status: string;
  scheduledDate: string;
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
] as const;

export const SALES_JOB_STATUSES = [
  'suggested',
  'approved',
  'dispatched',
  'in_progress',
  'completed',
  'skipped',
] as const;

export type SalesJobStatus = (typeof SALES_JOB_STATUSES)[number];

export const OPEN_SALES_JOB_STATUSES = ['approved', 'dispatched', 'in_progress'] as const;
