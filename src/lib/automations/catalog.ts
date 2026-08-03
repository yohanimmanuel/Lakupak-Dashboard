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
  | 'share_product_whatsapp'
  | 'assign_agent_whatsapp'
  | 'cs_24h_window'
  | 'return_confirm_whatsapp'
  | 'cart_winback'
  | 'send_campaign'
  | 'notify_dashboard'
  // Legacy (still allowed for existing saved workflows)
  | 'assign_logistic'
  | 'draft_activate_offer'
  | 'assign_driver'
  | 'buyer_question_reply'
  | 'assign_fleet'
  | 'draft_offer_flag'
  | 'assign_sales_agent_flag'
  | 'flag_for_fleet';

export type CatalogField = {
  key: string;
  kind: 'number' | 'text' | 'textarea' | 'select' | 'buyer' | 'fleet' | 'product' | 'campaign' | 'datetime';
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
      fields: [{ key: 'productId', kind: 'product' }],
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
      fields: [{ key: 'sendAt', kind: 'datetime' }],
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
      type: 'share_product_whatsapp',
      fields: [
        { key: 'productId', kind: 'product' },
        { key: 'messageTemplate', kind: 'textarea' },
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
      type: 'cs_24h_window',
      fields: [
        { key: 'welcomeMessage', kind: 'textarea' },
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
        { key: 'campaignId', kind: 'campaign' },
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
  product_offers: ['draft_offer_flag', 'draft_activate_offer'],
  lead_management: ['assign_sales_agent_flag', 'buyer_question_reply'],
  order_logistics: ['flag_for_fleet', 'assign_fleet', 'assign_driver', 'assign_logistic'],
  marketing: [],
};

/** Field schemas for legacy action types still present on saved workflows. */
const LEGACY_ACTION_DEFINITIONS: Partial<Record<ActionType, ActionDefinition>> = {
  assign_logistic: {
    type: 'assign_logistic',
    fields: [{ key: 'fleetId', kind: 'fleet' }],
  },
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
  assign_driver: {
    type: 'assign_driver',
    fields: [{ key: 'fleetId', kind: 'fleet' }],
  },
  draft_activate_offer: {
    type: 'draft_activate_offer',
    fields: [
      { key: 'discountPercent', kind: 'number' },
      { key: 'windowDays', kind: 'number' },
      { key: 'offerNote', kind: 'text' },
    ],
  },
  buyer_question_reply: {
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
  flag_for_fleet: { type: 'flag_for_fleet', fields: [] },
  draft_offer_flag: { type: 'draft_offer_flag', fields: [] },
  assign_sales_agent_flag: { type: 'assign_sales_agent_flag', fields: [] },
};

export function getTriggersForType(type: WorkflowType): TriggerDefinition[] {
  const specific = TRIGGERS_BY_WORKFLOW[type] ?? [];
  const seen = new Set(specific.map((t) => t.type));
  return [...specific, ...SHARED_TRIGGERS.filter((t) => !seen.has(t.type))];
}

/** All trigger recipes across workflow areas (deduped). Used by the canvas picker. */
export function getAllTriggers(): TriggerDefinition[] {
  const byType = new Map<TriggerType, TriggerDefinition>();
  for (const list of Object.values(TRIGGERS_BY_WORKFLOW)) {
    for (const trigger of list) byType.set(trigger.type, trigger);
  }
  for (const trigger of SHARED_TRIGGERS) {
    if (!byType.has(trigger.type)) byType.set(trigger.type, trigger);
  }
  return Array.from(byType.values());
}

export function getActionsForType(type: WorkflowType): ActionDefinition[] {
  return ACTIONS_BY_WORKFLOW[type] ?? [];
}

/** All action recipes across workflow areas (deduped). Used by the canvas picker. */
export function getAllActions(): ActionDefinition[] {
  const byType = new Map<ActionType, ActionDefinition>();
  for (const list of Object.values(ACTIONS_BY_WORKFLOW)) {
    for (const action of list) byType.set(action.type, action);
  }
  return Array.from(byType.values());
}

/** Resolve current or legacy action field definitions for an existing node. */
export function getActionDefinition(
  type: WorkflowType,
  actionType: string,
): ActionDefinition | undefined {
  const current =
    getAllActions().find((a) => a.type === actionType) ??
    getActionsForType(type).find((a) => a.type === actionType);
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
  const actions = getAllActions();
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
    else if (field.kind === 'product') {
      config[field.key] = '';
      config.productLabel = '';
      config.variantId = '';
      config.variantLabel = '';
      config.selectedProducts = [];
    } else if (field.kind === 'campaign') {
      config[field.key] = '';
      config.campaignLabel = '';
      config.campaignStatus = '';
      config.selectedCampaigns = [];
    } else if (field.kind === 'fleet') {
      config[field.key] = '';
      config.fleetLabel = '';
      config.fleetStatus = '';
      config.driverId = '';
      config.driverName = '';
      config.assignedLogistics = '';
      config.selectedFleets = [];
    } else if (field.kind === 'buyer') {
      config[field.key] = '';
      config.buyerLabel = '';
      config.buyerPhone = '';
      config.selectedBuyers = [];
    } else config[field.key] = '';
  }
  return config;
}

export function isTriggerAllowed(_type: WorkflowType, triggerType: string): boolean {
  if (getAllTriggers().some((t) => t.type === triggerType)) return true;
  return Object.values(LEGACY_TRIGGERS_BY_WORKFLOW).some((list) =>
    list.includes(triggerType as TriggerType),
  );
}

export function isActionAllowed(_type: WorkflowType, actionType: string): boolean {
  if (getAllActions().some((a) => a.type === actionType)) return true;
  if (LEGACY_ACTION_DEFINITIONS[actionType as ActionType]) return true;
  return Object.values(LEGACY_ACTIONS_BY_WORKFLOW).some((list) =>
    list.includes(actionType as ActionType),
  );
}

/** assign_driver must target a fleet that already has a driverId. */
export function assignDriverNeedsDriver(
  actionType: string,
  config: Record<string, unknown> | null | undefined,
): boolean {
  if (actionType !== 'assign_driver') return false;
  const list = config?.selectedFleets;
  if (Array.isArray(list) && list.length > 0) {
    return list.some((item) => {
      if (!item || typeof item !== 'object') return true;
      return !String((item as Record<string, unknown>).driverId ?? '').trim();
    });
  }
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

export type AutomationCanvasNodeLite = {
  id?: string;
  data?: { kind?: string; catalogType?: string; config?: Record<string, unknown> };
};

function configMissing(config: Record<string, unknown> | null | undefined, key: string): boolean {
  return !String(config?.[key] ?? '').trim();
}

function buyersMissing(config: Record<string, unknown> | null | undefined): boolean {
  const list = config?.selectedBuyers;
  if (Array.isArray(list) && list.length > 0) return false;
  return configMissing(config, 'buyerId');
}

function productsMissing(
  config: Record<string, unknown> | null | undefined,
  opts?: { requireVariant?: boolean },
): boolean {
  const requireVariant = Boolean(opts?.requireVariant);
  const list = config?.selectedProducts;
  if (Array.isArray(list) && list.length > 0) {
    return list.some((item) => {
      if (!item || typeof item !== 'object') return true;
      const row = item as Record<string, unknown>;
      if (!String(row.productId ?? '').trim()) return true;
      if (requireVariant && !String(row.variantId ?? '').trim()) return true;
      return false;
    });
  }
  if (configMissing(config, 'productId')) return true;
  if (requireVariant && configMissing(config, 'variantId')) return true;
  return false;
}

function fleetsMissing(config: Record<string, unknown> | null | undefined): boolean {
  const list = config?.selectedFleets;
  if (Array.isArray(list) && list.length > 0) {
    return list.some((item) => {
      if (!item || typeof item !== 'object') return true;
      return !String((item as Record<string, unknown>).fleetId ?? '').trim();
    });
  }
  return configMissing(config, 'fleetId');
}

function campaignsMissing(config: Record<string, unknown> | null | undefined): boolean {
  const list = config?.selectedCampaigns;
  if (Array.isArray(list) && list.length > 0) {
    return list.some((item) => {
      if (!item || typeof item !== 'object') return true;
      return !String((item as Record<string, unknown>).campaignId ?? '').trim();
    });
  }
  return configMissing(config, 'campaignId');
}

function nodeIssueLabel(nodeId: string | undefined, index: number, kind: string): string {
  const id = String(nodeId ?? '').trim();
  return id ? `${kind} "${id}"` : `${kind} #${index + 1}`;
}

/** Collect dry-run config issues (no side effects). Empty = pass. */
export function collectAutomationDryRunIssues(args: {
  triggerType?: string | null;
  triggerConfig?: Record<string, unknown> | null;
  actionType?: string | null;
  actionConfig?: Record<string, unknown> | null;
  nodes?: AutomationCanvasNodeLite[];
}): string[] {
  const issues: string[] = [];
  const nodes = args.nodes ?? [];
  const triggerNodes = nodes.filter((n) => n.data?.kind === 'trigger');
  const actionNodes = nodes.filter((n) => n.data?.kind === 'action');

  const triggersToCheck =
    triggerNodes.length > 0
      ? triggerNodes.map((n, index) => ({
          id: n.id,
          index,
          type: String(n.data?.catalogType ?? ''),
          config: n.data?.config,
        }))
      : [
          {
            id: undefined as string | undefined,
            index: 0,
            type: String(args.triggerType ?? ''),
            config: args.triggerConfig ?? undefined,
          },
        ];

  const actionsToCheck =
    actionNodes.length > 0
      ? actionNodes.map((n, index) => ({
          id: n.id,
          index,
          type: String(n.data?.catalogType ?? ''),
          config: n.data?.config,
        }))
      : [
          {
            id: undefined as string | undefined,
            index: 0,
            type: String(args.actionType ?? ''),
            config: args.actionConfig ?? undefined,
          },
        ];

  for (const trigger of triggersToCheck) {
    const label = nodeIssueLabel(trigger.id, trigger.index, 'Trigger');
    if (!trigger.type) {
      issues.push(`${label}: Add a trigger step.`);
      continue;
    }
    if (trigger.type === 'stock_below') {
      if (productsMissing(trigger.config, { requireVariant: false })) {
        issues.push(`${label}: Low stock trigger needs at least one product.`);
      }
    }
    if (trigger.type === 'cart_idle' && configMissing(trigger.config, 'hours')) {
      issues.push(`${label}: Cart idle trigger needs idle hours.`);
    }
    if (trigger.type === 'campaign_schedule' && configMissing(trigger.config, 'sendAt')) {
      issues.push(`${label}: Scheduled campaign trigger needs a send time.`);
    }
  }

  for (const action of actionsToCheck) {
    const label = nodeIssueLabel(action.id, action.index, 'Action');
    if (!action.type) {
      issues.push(`${label}: Add an action step.`);
      continue;
    }
    if (action.type === 'whatsapp_buyer' && buyersMissing(action.config)) {
      issues.push(`${label}: WhatsApp buyer action needs at least one buyer.`);
    }
    if (action.type === 'share_product_whatsapp') {
      if (productsMissing(action.config, { requireVariant: false })) {
        issues.push(`${label}: Share product on WhatsApp needs at least one product.`);
      }
      if (configMissing(action.config, 'messageTemplate')) {
        issues.push(`${label}: Share product on WhatsApp needs a message template.`);
      }
    }
    if (action.type === 'assign_logistic' && fleetsMissing(action.config)) {
      issues.push(`${label}: Auto-assign logistic needs a fleet.`);
    }
    if (action.type === 'assign_driver' && assignDriverNeedsDriver(action.type, action.config)) {
      issues.push(`${label}: ${ASSIGN_DRIVER_REQUIRES_DRIVER_MESSAGE}`);
    }
    if (action.type === 'send_campaign' && campaignsMissing(action.config)) {
      issues.push(`${label}: Send campaign needs a campaign.`);
    }
    if (action.type === 'notify_dashboard' && configMissing(action.config, 'message')) {
      issues.push(`${label}: Notify on Dashboard needs a message.`);
    }
    if (
      (action.type === 'return_confirm_whatsapp' ||
        action.type === 'buyer_question_reply' ||
        action.type === 'cs_24h_window' ||
        action.type === 'assign_agent_whatsapp' ||
        action.type === 'cart_winback') &&
      configMissing(
        action.config,
        action.type === 'cs_24h_window' ? 'welcomeMessage' : 'messageTemplate',
      )
    ) {
      issues.push(
        action.type === 'cs_24h_window'
          ? `${label}: 24h customer service window needs a welcome message.`
          : `${label}: ${action.type} needs a message template.`,
      );
    }
  }

  let appIndex = 0;
  for (const node of nodes) {
    if (node.data?.kind !== 'app') continue;
    const label = nodeIssueLabel(node.id, appIndex, 'App');
    appIndex += 1;
    if (node.data.catalogType === 'app_webhook' && configMissing(node.data.config, 'phone')) {
      issues.push(`${label}: WhatsApp app needs the business phone number used for automations.`);
    }
    if (node.data.catalogType === 'app_email' && configMissing(node.data.config, 'email')) {
      issues.push(`${label}: Gmail app needs the business email used for automations.`);
    }
  }

  return issues;
}

export function formatAutomationDryRunMessage(args: {
  issues: string[];
  triggerType?: string | null;
  actionType?: string | null;
}): { status: 'success' | 'failed'; message: string } {
  if (args.issues.length > 0) {
    return {
      status: 'failed',
      message: `Dry run failed: ${args.issues.join(' ')}`,
    };
  }
  const trigger = args.triggerType?.trim() || 'trigger';
  const action = args.actionType?.trim() || 'action';
  return {
    status: 'success',
    message: `Dry run OK — ${trigger} → ${action}. Execution engine not live yet.`,
  };
}

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
