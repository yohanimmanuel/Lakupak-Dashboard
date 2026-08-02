import type { WorkflowType } from '@/components/automations/automationTypes';

export type TriggerType =
  | 'stock_below'
  | 'new_buyer'
  | 'buyer_questions'
  | 'order_paid'
  | 'order_packed'
  | 'return_accepted'
  | 'cart_idle'
  | 'campaign_schedule'
  // Legacy (still allowed for existing saved workflows)
  | 'schedule_cron'
  | 'buyer_inactive'
  | 'order_pending_too_long'
  | 'campaign_ended';

export type ActionType =
  | 'replenish_stock'
  | 'whatsapp_buyer'
  | 'draft_activate_offer'
  | 'assign_agent_whatsapp'
  | 'buyer_question_reply'
  | 'assign_logistic'
  | 'assign_driver'
  | 'return_confirm_whatsapp'
  | 'cart_winback'
  | 'send_campaign'
  | 'notify_dashboard'
  // Legacy
  | 'assign_fleet'
  | 'draft_offer_flag'
  | 'assign_sales_agent_flag'
  | 'flag_for_fleet';

export type CatalogField = {
  key: string;
  kind: 'number' | 'text' | 'textarea' | 'select' | 'buyer' | 'fleet';
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

/** A buyer only exists once they place a first order, so there is no separate mode to pick. */
const NEW_BUYER_TRIGGER: TriggerDefinition = {
  type: 'new_buyer',
  fields: [],
};

const ORDER_PAID_TRIGGER: TriggerDefinition = {
  type: 'order_paid',
  fields: [
    {
      key: 'paidWhen',
      kind: 'select',
      options: ['status_paid', 'proof_submitted'],
    },
  ],
};

const CART_IDLE_TRIGGER: TriggerDefinition = {
  type: 'cart_idle',
  fields: [{ key: 'hours', kind: 'number' }],
};

/** Available in every workflow area so the picker always offers these. */
const SHARED_TRIGGERS: TriggerDefinition[] = [
  NEW_BUYER_TRIGGER,
  ORDER_PAID_TRIGGER,
  CART_IDLE_TRIGGER,
];

const TRIGGERS_BY_WORKFLOW: Record<WorkflowType, TriggerDefinition[]> = {
  product_offers: [
    {
      type: 'stock_below',
      fields: [
        { key: 'productId', kind: 'text' },
        { key: 'variantId', kind: 'text' },
      ],
    },
  ],
  lead_management: [
    { type: 'buyer_questions', fields: [] },
  ],
  order_logistics: [
    { type: 'order_packed', fields: [] },
    { type: 'return_accepted', fields: [] },
  ],
  marketing: [
    {
      type: 'campaign_schedule',
      fields: [{ key: 'sendAt', kind: 'text' }],
    },
  ],
};

const ACTIONS_BY_WORKFLOW: Record<WorkflowType, ActionDefinition[]> = {
  product_offers: [
    { type: 'replenish_stock', fields: [{ key: 'replenishQty', kind: 'number' }] },
    {
      type: 'whatsapp_buyer',
      fields: [
        { key: 'buyerId', kind: 'buyer' },
        { key: 'messageTemplate', kind: 'textarea' },
      ],
    },
    {
      type: 'draft_activate_offer',
      fields: [
        { key: 'discountPercent', kind: 'number' },
        { key: 'windowDays', kind: 'number' },
        { key: 'offerNote', kind: 'text' },
      ],
    },
    { type: 'notify_dashboard', fields: [{ key: 'message', kind: 'textarea' }] },
  ],
  lead_management: [
    {
      type: 'assign_agent_whatsapp',
      fields: [
        {
          key: 'assignmentRule',
          kind: 'select',
          options: ['territory', 'load', 'round_robin'],
        },
        { key: 'messageTemplate', kind: 'textarea' },
      ],
    },
    {
      type: 'buyer_question_reply',
      fields: [
        { key: 'messageTemplate', kind: 'textarea' },
        {
          key: 'escalateOutOfScope',
          kind: 'select',
          options: ['yes', 'no'],
        },
      ],
    },
    { type: 'notify_dashboard', fields: [{ key: 'message', kind: 'textarea' }] },
  ],
  order_logistics: [
    {
      type: 'assign_logistic',
      fields: [{ key: 'fleetId', kind: 'fleet' }],
    },
    {
      type: 'assign_driver',
      fields: [{ key: 'fleetId', kind: 'fleet' }],
    },
    {
      type: 'return_confirm_whatsapp',
      fields: [{ key: 'messageTemplate', kind: 'textarea' }],
    },
    { type: 'notify_dashboard', fields: [{ key: 'message', kind: 'textarea' }] },
  ],
  marketing: [
    {
      type: 'cart_winback',
      fields: [
        { key: 'messageTemplate', kind: 'textarea' },
        { key: 'offerId', kind: 'text' },
        { key: 'agentAssignThreshold', kind: 'number' },
      ],
    },
    {
      type: 'send_campaign',
      fields: [
        { key: 'campaignId', kind: 'text' },
        {
          key: 'channel',
          kind: 'select',
          options: ['whatsapp', 'email'],
        },
      ],
    },
    { type: 'notify_dashboard', fields: [{ key: 'message', kind: 'textarea' }] },
  ],
};

/** Allowed on save for workflows created before the recipe catalog refresh. */
const LEGACY_TRIGGERS_BY_WORKFLOW: Record<WorkflowType, TriggerType[]> = {
  product_offers: ['schedule_cron'],
  lead_management: ['buyer_inactive'],
  order_logistics: ['order_pending_too_long'],
  marketing: ['campaign_ended'],
};

const LEGACY_ACTIONS_BY_WORKFLOW: Record<WorkflowType, ActionType[]> = {
  product_offers: ['draft_offer_flag'],
  lead_management: ['assign_sales_agent_flag'],
  order_logistics: ['flag_for_fleet', 'assign_fleet'],
  marketing: [],
};

/** Field schemas for legacy action types still present on saved workflows. */
const LEGACY_ACTION_DEFINITIONS: Partial<Record<ActionType, ActionDefinition>> = {
  assign_fleet: {
    type: 'assign_fleet',
    fields: [
      {
        key: 'matchBy',
        kind: 'select',
        options: ['capacity', 'area', 'load'],
      },
      { key: 'etaNote', kind: 'text' },
    ],
  },
  flag_for_fleet: { type: 'flag_for_fleet', fields: [] },
  draft_offer_flag: { type: 'draft_offer_flag', fields: [] },
  assign_sales_agent_flag: { type: 'assign_sales_agent_flag', fields: [] },
};

export function getTriggersForType(type: WorkflowType): TriggerDefinition[] {
  const specific = TRIGGERS_BY_WORKFLOW[type] ?? [];
  const seen = new Set(specific.map((t) => t.type));
  return [...specific, ...SHARED_TRIGGERS.filter((t) => !seen.has(t.type))];
}

export function getActionsForType(type: WorkflowType): ActionDefinition[] {
  return ACTIONS_BY_WORKFLOW[type] ?? [];
}

/** Resolve current or legacy action field definitions for an existing node. */
export function getActionDefinition(
  type: WorkflowType,
  actionType: string,
): ActionDefinition | undefined {
  const current = getActionsForType(type).find((a) => a.type === actionType);
  if (current) return current;
  if (!isActionAllowed(type, actionType)) return undefined;
  return LEGACY_ACTION_DEFINITIONS[actionType as ActionType];
}

/**
 * Actions shown in the inspector for a selected node.
 * Includes a legacy action only when that node already uses it (not for new picks).
 */
export function getActionsForInspector(
  type: WorkflowType,
  currentActionType?: string,
): ActionDefinition[] {
  const actions = getActionsForType(type);
  if (!currentActionType || actions.some((a) => a.type === currentActionType)) {
    return actions;
  }
  const legacy = getActionDefinition(type, currentActionType);
  return legacy ? [...actions, legacy] : actions;
}

export function getDefaultTrigger(type: WorkflowType): {
  triggerType: TriggerType;
  triggerConfig: Record<string, unknown>;
} {
  const first = getTriggersForType(type)[0];
  return {
    triggerType: first?.type ?? 'new_buyer',
    triggerConfig: defaultConfigForFields(first?.fields ?? []),
  };
}

export function getDefaultAction(type: WorkflowType): {
  actionType: ActionType;
  actionConfig: Record<string, unknown>;
} {
  const first = getActionsForType(type)[0];
  return {
    actionType: first?.type ?? 'notify_dashboard',
    actionConfig: defaultConfigForFields(first?.fields ?? []),
  };
}

export function defaultConfigForFields(fields: CatalogField[]): Record<string, unknown> {
  const config: Record<string, unknown> = {};
  for (const field of fields) {
    if (field.kind === 'number') config[field.key] = '';
    else if (field.kind === 'select') config[field.key] = field.options?.[0] ?? '';
    else config[field.key] = '';
  }
  return config;
}

export function isTriggerAllowed(type: WorkflowType, triggerType: string): boolean {
  if (getTriggersForType(type).some((t) => t.type === triggerType)) return true;
  return (LEGACY_TRIGGERS_BY_WORKFLOW[type] ?? []).includes(triggerType as TriggerType);
}

export function isActionAllowed(type: WorkflowType, actionType: string): boolean {
  if (getActionsForType(type).some((a) => a.type === actionType)) return true;
  return (LEGACY_ACTIONS_BY_WORKFLOW[type] ?? []).includes(actionType as ActionType);
}

/** assign_driver must target a fleet that already has a driverId. */
export function assignDriverNeedsDriver(
  actionType: string,
  config: Record<string, unknown> | null | undefined,
): boolean {
  if (actionType !== 'assign_driver') return false;
  return !String(config?.driverId ?? '').trim();
}

/**
 * True when any action node is assign_driver without a driverId.
 * Also checks the flat first-action pair used by the API columns.
 */
export function hasAssignDriverWithoutDriver(args: {
  actionType?: string | null;
  actionConfig?: Record<string, unknown> | null;
  nodes?: Array<{ data?: { kind?: string; catalogType?: string; config?: Record<string, unknown> } }>;
}): boolean {
  if (assignDriverNeedsDriver(args.actionType ?? '', args.actionConfig)) return true;
  return (args.nodes ?? []).some(
    (n) =>
      n.data?.kind === 'action' &&
      assignDriverNeedsDriver(String(n.data.catalogType ?? ''), n.data.config),
  );
}

export const ASSIGN_DRIVER_REQUIRES_DRIVER_MESSAGE =
  'Auto-assign driver requires a fleet that already has a driver assigned.';

export const ALL_TRIGGER_TYPES = Array.from(
  new Set([
    ...Object.values(TRIGGERS_BY_WORKFLOW).flatMap((list) => list.map((t) => t.type)),
    ...SHARED_TRIGGERS.map((t) => t.type),
    ...Object.values(LEGACY_TRIGGERS_BY_WORKFLOW).flat(),
  ]),
);

export const ALL_ACTION_TYPES = Array.from(
  new Set([
    ...Object.values(ACTIONS_BY_WORKFLOW).flatMap((list) => list.map((a) => a.type)),
    ...Object.values(LEGACY_ACTIONS_BY_WORKFLOW).flat(),
  ]),
);
