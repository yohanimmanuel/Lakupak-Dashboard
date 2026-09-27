export type WorkflowType =
  | 'product_offers'
  | 'lead_management'
  | 'order_logistics'
  | 'sales';

export type WorkflowStatus = 'active' | 'paused' | 'draft';

export type BuilderNodeKind = 'trigger' | 'agent' | 'action';

export interface AutomationWorkflow {
  id: string;
  userId: number;
  name: string;
  description: string;
  type: WorkflowType;
  status: WorkflowStatus;
  triggerType: string;
  triggerConfig: Record<string, unknown> | null;
  agentConfig: Record<string, unknown> | null;
  actionType: string;
  actionConfig: Record<string, unknown> | null;
  whatsappPhone?: string | null;
  gmailEmail?: string | null;
  runs: number;
  lastRunAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export const AUTOMATION_RUN_STATUSES = ['success', 'failed', 'skipped', 'in_progress'] as const;
export type AutomationRunStatus = (typeof AUTOMATION_RUN_STATUSES)[number];

export interface AutomationRun {
  id: string;
  workflowId: string;
  status: string;
  message: string | null;
  createdAt: string;
}

/** Table row shape used by AutomationTable (derived trigger label). */
export interface AutomationWorkflowRow {
  id: string;
  name: string;
  description: string;
  type: WorkflowType;
  trigger: string;
  status: WorkflowStatus;
  runs: number;
  lastRun: string | null;
  createdAt: string;
}

export const WORKFLOW_TYPES: WorkflowType[] = [
  'product_offers',
  'lead_management',
  'order_logistics',
  'sales',
];

export function toWorkflowRow(
  workflow: AutomationWorkflow,
  triggerLabel: string,
): AutomationWorkflowRow {
  return {
    id: workflow.id,
    name: workflow.name,
    description: workflow.description,
    type: workflow.type,
    trigger: triggerLabel,
    status: workflow.status,
    runs: workflow.runs,
    lastRun: workflow.lastRunAt,
    createdAt: workflow.createdAt,
  };
}
