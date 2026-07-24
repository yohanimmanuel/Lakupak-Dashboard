import type { WorkflowType } from '@/components/automations/automationTypes';

export type TriggerType =
  | 'stock_below'
  | 'schedule_cron'
  | 'new_buyer'
  | 'buyer_inactive'
  | 'order_paid'
  | 'order_pending_too_long'
  | 'cart_idle'
  | 'campaign_ended';

export type ActionType =
  | 'notify_dashboard'
  | 'draft_offer_flag'
  | 'assign_sales_agent_flag'
  | 'flag_for_fleet';

export type CatalogField = {
  key: string;
  kind: 'number' | 'text' | 'select';
  options?: string[];
};

export type TriggerDefinition = {
  type: TriggerType;
  fields: CatalogField[];
};

export type ActionDefinition = {
  type: ActionType;
  fields: CatalogField[];
};

const TRIGGERS_BY_WORKFLOW: Record<WorkflowType, TriggerDefinition[]> = {
  product_offers: [
    { type: 'stock_below', fields: [{ key: 'threshold', kind: 'number' }] },
    { type: 'schedule_cron', fields: [{ key: 'cron', kind: 'text' }] },
  ],
  lead_management: [
    { type: 'new_buyer', fields: [] },
    { type: 'buyer_inactive', fields: [{ key: 'days', kind: 'number' }] },
  ],
  order_logistics: [
    { type: 'order_paid', fields: [] },
    { type: 'order_pending_too_long', fields: [{ key: 'hours', kind: 'number' }] },
  ],
  marketing: [
    { type: 'cart_idle', fields: [{ key: 'hours', kind: 'number' }] },
    { type: 'campaign_ended', fields: [] },
  ],
};

const ACTIONS_BY_WORKFLOW: Record<WorkflowType, ActionDefinition[]> = {
  product_offers: [
    { type: 'notify_dashboard', fields: [{ key: 'message', kind: 'text' }] },
    { type: 'draft_offer_flag', fields: [{ key: 'note', kind: 'text' }] },
  ],
  lead_management: [
    { type: 'notify_dashboard', fields: [{ key: 'message', kind: 'text' }] },
    { type: 'assign_sales_agent_flag', fields: [{ key: 'note', kind: 'text' }] },
  ],
  order_logistics: [
    { type: 'notify_dashboard', fields: [{ key: 'message', kind: 'text' }] },
    { type: 'flag_for_fleet', fields: [{ key: 'note', kind: 'text' }] },
  ],
  marketing: [
    { type: 'notify_dashboard', fields: [{ key: 'message', kind: 'text' }] },
  ],
};

export function getTriggersForType(type: WorkflowType): TriggerDefinition[] {
  return TRIGGERS_BY_WORKFLOW[type] ?? [];
}

export function getActionsForType(type: WorkflowType): ActionDefinition[] {
  return ACTIONS_BY_WORKFLOW[type] ?? [];
}

export function getDefaultTrigger(type: WorkflowType): { triggerType: TriggerType; triggerConfig: Record<string, unknown> } {
  const first = getTriggersForType(type)[0];
  return {
    triggerType: first?.type ?? 'new_buyer',
    triggerConfig: {},
  };
}

export function getDefaultAction(type: WorkflowType): { actionType: ActionType; actionConfig: Record<string, unknown> } {
  const first = getActionsForType(type)[0];
  return {
    actionType: first?.type ?? 'notify_dashboard',
    actionConfig: first?.type === 'notify_dashboard' ? { message: '' } : {},
  };
}

export function isTriggerAllowed(type: WorkflowType, triggerType: string): boolean {
  return getTriggersForType(type).some((t) => t.type === triggerType);
}

export function isActionAllowed(type: WorkflowType, actionType: string): boolean {
  return getActionsForType(type).some((a) => a.type === actionType);
}

export const ALL_TRIGGER_TYPES = Array.from(
  new Set(Object.values(TRIGGERS_BY_WORKFLOW).flatMap((list) => list.map((t) => t.type))),
);

export const ALL_ACTION_TYPES = Array.from(
  new Set(Object.values(ACTIONS_BY_WORKFLOW).flatMap((list) => list.map((a) => a.type))),
);
