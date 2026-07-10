export type WorkflowType =
  | 'product_offers'
  | 'lead_management'
  | 'order_logistics'
  | 'marketing';

export type WorkflowStatus = 'active' | 'paused' | 'draft';

export interface AutomationWorkflow {
  id: string;
  name: string;
  description: string;
  type: WorkflowType;
  /** Human-readable trigger label (mock string for now). */
  trigger: string;
  status: WorkflowStatus;
  /** Total number of times this workflow has executed. */
  runs: number;
  /** ISO date string of the last execution, or null if it never ran. */
  lastRun: string | null;
  createdAt: string;
}

export const WORKFLOW_TYPES: WorkflowType[] = [
  'product_offers',
  'lead_management',
  'order_logistics',
  'marketing',
];
