import { prisma } from '../common/prisma';
import { sanitizePagination, buildPaginationInfo } from '../common/utils';
import { requireDashboardUser } from '../common/auth';
import { GraphQLError } from 'graphql';
import { Prisma, type AutomationWorkflow, type AutomationRun } from '@/lib/prisma-generated';
import { SUBSCRIPTION_PLANS } from '@/config/subscriptionPlans';
import {
  ASSIGN_DRIVER_REQUIRES_DRIVER_MESSAGE,
  collectAutomationDryRunIssues,
  formatAutomationDryRunMessage,
  getDefaultAction,
  getDefaultTrigger,
  hasAssignDriverWithoutDriver,
  isActionAllowed,
  isTriggerAllowed,
  migrateOrderPaidTriggerConfig,
} from '@/lib/automations/catalog';
import { runLakuAgentNode } from '@/lib/automations/runLakuAgent';
import { executeSendCampaign } from '@/lib/automations/sendCampaign';
import { preserveScheduleClaim, scheduledSendAtIdentity } from '@/lib/automations/scheduleTime';
import {
  CHANNEL_MESSAGE_ACTIONS,
  executeChannelBuyerMessage,
} from '@/lib/automations/deliverBuyerMessage';
import { AUTOMATION_RUN_STATUSES, type WorkflowType } from '@/components/automations/automationTypes';
import { normalizeConditionConfig } from '@/components/automations/builder/canvasTypes';

const WORKFLOW_TYPES = new Set(['product_offers', 'lead_management', 'order_logistics', 'marketing']);
const WORKFLOW_STATUSES = new Set(['active', 'paused', 'draft']);
const RUN_STATUSES = new Set<string>(AUTOMATION_RUN_STATUSES);

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

/** Empty → null; non-empty must be a basic valid email address. */
function normalizeGmailEmail(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  // Practical address check (local@domain.tld); rejects spaces and missing TLD.
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
    throw new GraphQLError('gmailEmail must be a valid email address.', {
      extensions: { code: 'BAD_USER_INPUT' },
    });
  }
  return trimmed;
}

/**
 * Empty → null; non-empty must be E.164 (+ and 8–15 digits total after +).
 * Spaces, dashes, and parentheses are stripped before validation.
 */
function normalizeWhatsAppPhone(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const compact = trimmed.replace(/[\s\-()]/g, '');
  if (!/^\+[1-9]\d{7,14}$/.test(compact)) {
    throw new GraphQLError(
      'whatsappPhone must be an E.164 number (e.g. +6281234567890).',
      { extensions: { code: 'BAD_USER_INPUT' } },
    );
  }
  return compact;
}

function canvasNodesFromAgentConfig(agentConfig: unknown): Array<{
  id?: string;
  data?: { kind?: string; catalogType?: string; config?: Record<string, unknown> };
}> {
  const root = asRecord(agentConfig);
  const canvas = asRecord(root?.__canvas);
  const nodes = canvas?.nodes;
  if (!Array.isArray(nodes)) return [];
  return nodes.map((n) => {
    const row = asRecord(n);
    const data = asRecord(row?.data) ?? undefined;
    const kind = typeof data?.kind === 'string' ? data.kind : undefined;
    const catalogType =
      typeof data?.catalogType === 'string' ? data.catalogType : undefined;
    const rawConfig = asRecord(data?.config) ?? undefined;
    let config = rawConfig;
    if (kind === 'condition') {
      config = normalizeConditionConfig(rawConfig);
    } else if (kind === 'trigger' && catalogType === 'order_paid') {
      config = migrateOrderPaidTriggerConfig(rawConfig);
    }
    return {
      id: typeof row?.id === 'string' ? row.id : undefined,
      data: data
        ? {
            kind,
            catalogType,
            config,
          }
        : undefined,
    };
  });
}

function assertAssignDriverHasDriver(args: {
  actionType?: string | null;
  actionConfig?: unknown;
  agentConfig?: unknown;
}) {
  if (
    hasAssignDriverWithoutDriver({
      actionType: args.actionType,
      actionConfig: asRecord(args.actionConfig) ?? undefined,
      nodes: canvasNodesFromAgentConfig(args.agentConfig),
    })
  ) {
    throw new GraphQLError(ASSIGN_DRIVER_REQUIRES_DRIVER_MESSAGE, {
      extensions: { code: 'BAD_USER_INPUT' },
    });
  }
}

/** Until billing plan is stored on User, enforce starter automationRules quota. */
function getAutomationRulesQuota(): number | null {
  return SUBSCRIPTION_PLANS.find((p) => p.id === 'starter')?.quotas.automationRules ?? 10;
}

export const automationsTypeDefs = /* GraphQL */ `
  type AutomationWorkflow {
    id: String!
    userId: Int!
    name: String!
    description: String!
    type: String!
    status: String!
    triggerType: String!
    triggerConfig: JSONObject
    agentConfig: JSONObject
    actionType: String!
    actionConfig: JSONObject
    whatsappPhone: String
    gmailEmail: String
    runs: Int!
    lastRunAt: String
    createdAt: String!
    updatedAt: String!
  }

  type AutomationRun {
    id: String!
    workflowId: String!
    status: String!
    message: String
    createdAt: String!
  }

  type AutomationWorkflowConnection {
    nodes: [AutomationWorkflow!]!
    pagination: PaginationInfo!
  }

  type DeleteAutomationWorkflowResult {
    success: Boolean!
    deleted: AutomationWorkflow
  }

  type DeleteAutomationRunResult {
    success: Boolean!
    deleted: AutomationRun
  }

  type ClearAutomationRunsResult {
    success: Boolean!
    deletedCount: Int!
  }

  type SetAutomationWorkflowStatusResult {
    success: Boolean!
    updatedCount: Int!
  }

  extend type Query {
    automationWorkflows(
      page: Int = 1
      limit: Int = 50
      status: String
      type: String
    ): AutomationWorkflowConnection!

    automationWorkflow(id: String!): AutomationWorkflow

    automationRuns(workflowId: String!, limit: Int = 20): [AutomationRun!]!
  }

  extend type Mutation {
    createAutomationWorkflow(
      name: String!
      description: String
      type: String!
      status: String
      triggerType: String
      triggerConfig: JSONObject
      agentConfig: JSONObject
      actionType: String
      actionConfig: JSONObject
      whatsappPhone: String
      gmailEmail: String
    ): AutomationWorkflow!

    updateAutomationWorkflow(
      id: String!
      name: String
      description: String
      type: String
      status: String
      triggerType: String
      triggerConfig: JSONObject
      agentConfig: JSONObject
      actionType: String
      actionConfig: JSONObject
      whatsappPhone: String
      gmailEmail: String
    ): AutomationWorkflow!

    deleteAutomationWorkflow(id: String!): DeleteAutomationWorkflowResult!

    setAutomationWorkflowStatus(
      ids: [String!]!
      status: String!
    ): SetAutomationWorkflowStatusResult!

    testAutomationWorkflow(id: String!, locale: String, live: Boolean): AutomationRun!

    deleteAutomationRun(id: String!): DeleteAutomationRunResult!

    clearAutomationRuns(workflowId: String!): ClearAutomationRunsResult!
  }
`;

function collectScheduleClaims(agentConfig: unknown, triggerConfig: unknown): Map<string, string> {
  const claims = new Map<string, string>();
  const flat = asRecord(triggerConfig);
  if (flat) {
    const sendAt = scheduledSendAtIdentity(flat);
    const key = String(flat.scheduleClaimKey ?? '').trim();
    if (sendAt && key) claims.set(sendAt, key);
  }
  for (const node of canvasNodesFromAgentConfig(agentConfig)) {
    if (node.data?.kind !== 'trigger' || node.data.catalogType !== 'campaign_schedule') continue;
    const config = node.data.config ?? {};
    const sendAt = scheduledSendAtIdentity(config);
    const key = String(config.scheduleClaimKey ?? '').trim();
    if (sendAt && key) claims.set(sendAt, key);
  }
  return claims;
}

function applyScheduleClaimsToAgentConfig(
  agentConfig: Prisma.InputJsonValue,
  claims: Map<string, string>,
): Prisma.InputJsonValue {
  if (claims.size === 0) return agentConfig;
  const root = asRecord(agentConfig);
  if (!root) return agentConfig;
  const canvas = asRecord(root.__canvas);
  if (!canvas || !Array.isArray(canvas.nodes)) return agentConfig;
  const nodes = canvas.nodes.map((n) => {
    const row = asRecord(n);
    if (!row) return n;
    const data = asRecord(row.data);
    if (!data || data.kind !== 'trigger' || data.catalogType !== 'campaign_schedule') {
      return n;
    }
    const config = asRecord(data.config) ?? {};
    const sendAt = scheduledSendAtIdentity(config);
    const key = sendAt ? claims.get(sendAt) : undefined;
    if (!key) return n;
    return {
      ...row,
      data: {
        ...data,
        config: { ...config, scheduleClaimKey: key },
      },
    };
  });
  return { ...root, __canvas: { ...canvas, nodes } } as Prisma.InputJsonValue;
}

function asJsonObject(value: unknown): Prisma.InputJsonValue {
  if (value == null) return {};
  if (typeof value === 'object') return value as Prisma.InputJsonValue;
  return {};
}

function mapWorkflow(row: AutomationWorkflow) {
  return {
    id: row.id,
    userId: row.userId,
    name: row.name,
    description: row.description ?? '',
    type: row.type,
    status: row.status,
    triggerType: row.triggerType,
    triggerConfig: row.triggerConfig,
    agentConfig: row.agentConfig,
    actionType: row.actionType,
    actionConfig: row.actionConfig,
    whatsappPhone: row.whatsappPhone ?? null,
    gmailEmail: row.gmailEmail ?? null,
    runs: row.runs ?? 0,
    lastRunAt: row.lastRunAt ? row.lastRunAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function mapRun(row: AutomationRun) {
  return {
    id: row.id,
    workflowId: row.workflowId,
    status: row.status,
    message: row.message,
    createdAt: row.createdAt.toISOString(),
  };
}

function assertWorkflowType(type: string): asserts type is WorkflowType {
  if (!WORKFLOW_TYPES.has(type)) {
    throw new GraphQLError(`Invalid workflow type: ${type}`, {
      extensions: { code: 'BAD_USER_INPUT' },
    });
  }
}

function assertStatus(status: string) {
  if (!WORKFLOW_STATUSES.has(status)) {
    throw new GraphQLError(`Invalid workflow status: ${status}`, {
      extensions: { code: 'BAD_USER_INPUT' },
    });
  }
}

async function fetchWorkflowsConnection(args: {
  userId: number;
  page?: number;
  limit?: number;
  status?: string | null;
  type?: string | null;
}) {
  const { userId, status, type } = args;
  const { page, limit } = sanitizePagination(args.page, args.limit);
  const where: Prisma.AutomationWorkflowWhereInput = { userId };
  if (status && status !== 'all') {
    assertStatus(status);
    where.status = status;
  }
  if (type && type !== 'all') {
    assertWorkflowType(type);
    where.type = type;
  }

  const [totalCount, nodes] = await Promise.all([
    prisma.automationWorkflow.count({ where }),
    prisma.automationWorkflow.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
  ]);

  return {
    nodes: nodes.map(mapWorkflow),
    pagination: buildPaginationInfo(page, limit, totalCount),
  };
}

async function fetchWorkflow(args: { userId: number; id: string }) {
  const row = await prisma.automationWorkflow.findFirst({
    where: { id: args.id, userId: args.userId },
  });
  return row ? mapWorkflow(row) : null;
}

async function fetchRuns(args: { userId: number; workflowId: string; limit?: number }) {
  const workflow = await prisma.automationWorkflow.findFirst({
    where: { id: args.workflowId, userId: args.userId },
    select: { id: true },
  });
  if (!workflow) {
    throw new GraphQLError('Workflow not found', { extensions: { code: 'NOT_FOUND' } });
  }
  const limit = Math.min(Math.max(args.limit ?? 20, 1), 100);
  const rows = await prisma.automationRun.findMany({
    where: { workflowId: args.workflowId },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });
  return rows.map(mapRun);
}

async function createWorkflow(args: {
  userId: number;
  name: string;
  description?: string | null;
  type: string;
  status?: string | null;
  triggerType?: string | null;
  triggerConfig?: unknown;
  agentConfig?: unknown;
  actionType?: string | null;
  actionConfig?: unknown;
  whatsappPhone?: string | null;
  gmailEmail?: string | null;
}) {
  assertWorkflowType(args.type);
  const status = args.status ?? 'draft';
  assertStatus(status);

  const quota = getAutomationRulesQuota();
  if (quota != null) {
    const count = await prisma.automationWorkflow.count({ where: { userId: args.userId } });
    if (count >= quota) {
      throw new GraphQLError(
        `Automation rule limit reached (${quota}). Upgrade your plan or delete unused workflows.`,
        { extensions: { code: 'QUOTA_EXCEEDED' } },
      );
    }
  }

  const defaultsTrigger = getDefaultTrigger(args.type);
  const defaultsAction = getDefaultAction(args.type);
  const triggerType = String(args.triggerType ?? '').trim();
  const actionType = String(args.actionType ?? '').trim() || defaultsAction.actionType;

  if (!triggerType) {
    throw new GraphQLError('Required: A trigger must be defined.', {
      extensions: { code: 'BAD_USER_INPUT' },
    });
  }
  if (!isTriggerAllowed(args.type, triggerType)) {
    throw new GraphQLError(`Trigger ${triggerType} is not allowed for ${args.type}`, {
      extensions: { code: 'BAD_USER_INPUT' },
    });
  }
  if (!isActionAllowed(args.type, actionType)) {
    throw new GraphQLError(`Action ${actionType} is not allowed for ${args.type}`, {
      extensions: { code: 'BAD_USER_INPUT' },
    });
  }

  const actionConfig = asJsonObject(args.actionConfig ?? defaultsAction.actionConfig);
  const agentConfig =
    args.agentConfig == null ? null : asJsonObject(args.agentConfig);
  assertAssignDriverHasDriver({
    actionType,
    actionConfig,
    agentConfig,
  });

  const row = await prisma.automationWorkflow.create({
    data: {
      userId: args.userId,
      name: args.name.trim(),
      description: (args.description ?? '').trim(),
      type: args.type,
      status,
      triggerType,
      triggerConfig: asJsonObject(args.triggerConfig ?? defaultsTrigger.triggerConfig),
      agentConfig: agentConfig == null ? Prisma.JsonNull : agentConfig,
      actionType,
      actionConfig,
      whatsappPhone: normalizeWhatsAppPhone(args.whatsappPhone),
      gmailEmail: normalizeGmailEmail(args.gmailEmail),
    },
  });

  return mapWorkflow(row);
}

async function updateWorkflow(args: {
  userId: number;
  id: string;
  name?: string | null;
  description?: string | null;
  type?: string | null;
  status?: string | null;
  triggerType?: string | null;
  triggerConfig?: unknown;
  agentConfig?: unknown;
  actionType?: string | null;
  actionConfig?: unknown;
  whatsappPhone?: string | null;
  gmailEmail?: string | null;
}) {
  const existing = await prisma.automationWorkflow.findFirst({
    where: { id: args.id, userId: args.userId },
  });
  if (!existing) {
    throw new GraphQLError('Workflow not found', { extensions: { code: 'NOT_FOUND' } });
  }

  const nextType = (args.type ?? existing.type) as WorkflowType;
  if (args.type) assertWorkflowType(args.type);
  if (args.status) assertStatus(args.status);

  const nextTrigger = String(
    args.triggerType !== undefined && args.triggerType !== null
      ? args.triggerType
      : existing.triggerType,
  ).trim();
  const nextAction = args.actionType ?? existing.actionType;
  if (!nextTrigger) {
    throw new GraphQLError('Required: A trigger must be defined.', {
      extensions: { code: 'BAD_USER_INPUT' },
    });
  }
  if (!isTriggerAllowed(nextType, nextTrigger)) {
    throw new GraphQLError(`Trigger ${nextTrigger} is not allowed for ${nextType}`, {
      extensions: { code: 'BAD_USER_INPUT' },
    });
  }
  if (!isActionAllowed(nextType, nextAction)) {
    throw new GraphQLError(`Action ${nextAction} is not allowed for ${nextType}`, {
      extensions: { code: 'BAD_USER_INPUT' },
    });
  }

  const claims = collectScheduleClaims(existing.agentConfig, existing.triggerConfig);

  const nextActionConfig =
    args.actionConfig !== undefined ? asJsonObject(args.actionConfig) : existing.actionConfig;
  const nextAgentConfig =
    args.agentConfig !== undefined
      ? args.agentConfig == null
        ? null
        : applyScheduleClaimsToAgentConfig(asJsonObject(args.agentConfig), claims)
      : existing.agentConfig;
  assertAssignDriverHasDriver({
    actionType: nextAction,
    actionConfig: nextActionConfig,
    agentConfig: nextAgentConfig,
  });

  const data: Prisma.AutomationWorkflowUpdateInput = {};
  if (args.name != null) data.name = args.name.trim();
  if (args.description != null) data.description = args.description.trim();
  if (args.type != null) data.type = args.type;
  if (args.status != null) data.status = args.status;
  if (args.triggerType != null) data.triggerType = nextTrigger;
  if (args.triggerConfig !== undefined) {
    data.triggerConfig = preserveScheduleClaim(
      asRecord(existing.triggerConfig),
      asJsonObject(args.triggerConfig) as Record<string, unknown>,
    ) as Prisma.InputJsonValue;
  }
  if (args.agentConfig !== undefined) {
    data.agentConfig =
      nextAgentConfig == null ? Prisma.JsonNull : (nextAgentConfig as Prisma.InputJsonValue);
  }
  if (args.actionType != null) data.actionType = args.actionType;
  if (args.actionConfig !== undefined) data.actionConfig = asJsonObject(args.actionConfig);
  if (args.whatsappPhone !== undefined) {
    data.whatsappPhone = normalizeWhatsAppPhone(args.whatsappPhone);
  }
  if (args.gmailEmail !== undefined) {
    data.gmailEmail = normalizeGmailEmail(args.gmailEmail);
  }

  const row = await prisma.automationWorkflow.update({
    where: { id: existing.id },
    data,
  });
  return mapWorkflow(row);
}

async function deleteWorkflow(args: { userId: number; id: string }) {
  const existing = await prisma.automationWorkflow.findFirst({
    where: { id: args.id, userId: args.userId },
  });
  if (!existing) {
    return { success: false, deleted: null };
  }
  await prisma.automationWorkflow.delete({ where: { id: existing.id } });
  return { success: true, deleted: mapWorkflow(existing) };
}

async function setStatus(args: { userId: number; ids: string[]; status: string }) {
  assertStatus(args.status);
  const result = await prisma.automationWorkflow.updateMany({
    where: { userId: args.userId, id: { in: args.ids } },
    data: { status: args.status },
  });
  return { success: true, updatedCount: result.count };
}

async function testWorkflow(args: {
  userId: number;
  id: string;
  locale?: string | null;
  live?: boolean | null;
}) {
  const existing = await prisma.automationWorkflow.findFirst({
    where: { id: args.id, userId: args.userId },
  });
  if (!existing) {
    throw new GraphQLError('Workflow not found', { extensions: { code: 'NOT_FOUND' } });
  }

  const triggerConfig = asRecord(existing.triggerConfig);
  const actionConfig = asRecord(existing.actionConfig);
  const nodes = canvasNodesFromAgentConfig(existing.agentConfig);
  const issues = collectAutomationDryRunIssues({
    triggerType: existing.triggerType,
    triggerConfig,
    actionType: existing.actionType,
    actionConfig,
    nodes,
  });
  const dryRun = formatAutomationDryRunMessage({
    issues,
    triggerType: existing.triggerType,
    actionType: existing.actionType,
    actionTypes:
      nodes.filter((n) => n.data?.kind === 'action').length > 0
        ? nodes
            .filter((n) => n.data?.kind === 'action')
            .map((n) => n.data?.catalogType)
        : [existing.actionType],
  });

  let status: 'success' | 'failed' = dryRun.status;
  let message = dryRun.message;

  if (dryRun.status === 'success') {
    const agentResult = await runLakuAgentNode({
      userId: args.userId,
      nodes,
      workflowName: existing.name,
      triggerType: existing.triggerType,
      actionType: existing.actionType,
      locale: args.locale,
    });

    if (agentResult.ran) {
      if (agentResult.error) {
        status = 'failed';
        message = `Dry run OK, but Lakupak AI failed: ${agentResult.error}`;
      } else {
        message = [dryRun.message, agentResult.reply].filter(Boolean).join('\n\n');
      }
    } else if (agentResult.skippedCode && agentResult.skippedCode !== 'no_agent_node') {
      message = `${dryRun.message} Lakupak AI skipped: ${agentResult.skippedReason ?? agentResult.skippedCode}`;
    }

    const testMode = !args.live;
    if (testMode) {
      message = `Test mode (not sent). ${message}`;
    } else {
      message = `Live send. ${message}`;
    }

    const outboundActions =
      nodes.filter((n) => n.data?.kind === 'action').length > 0
        ? nodes
            .filter((n) => n.data?.kind === 'action')
            .map((n) => ({
              type: String(n.data?.catalogType ?? ''),
              config: asRecord(n.data?.config) ?? {},
            }))
        : [{ type: existing.actionType, config: actionConfig ?? {} }];

    for (const action of outboundActions.filter((a) => a.type === 'send_campaign')) {
      try {
        const sent = await executeSendCampaign(existing, action.config, { testMode });
        message = `${message} ${sent}`;
      } catch (err) {
        status = 'failed';
        const detail = err instanceof Error ? err.message : String(err);
        message = `${message} send_campaign failed: ${detail}`;
      }
    }

    for (const action of outboundActions.filter((a) => CHANNEL_MESSAGE_ACTIONS.has(a.type))) {
      try {
        const sent = await executeChannelBuyerMessage(
          existing,
          action.type,
          action.config,
          undefined,
          { testMode },
        );
        message = `${message} ${sent}`;
      } catch (err) {
        status = 'failed';
        const detail = err instanceof Error ? err.message : String(err);
        message = `${message} ${action.type} failed: ${detail}`;
      }
    }
  }

  const run = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const created = await tx.automationRun.create({
      data: {
        workflowId: existing.id,
        status,
        message,
      },
    });
    await tx.automationWorkflow.update({
      where: { id: existing.id },
      data: {
        runs: { increment: 1 },
        lastRunAt: new Date(),
      },
    });
    return created;
  });

  return mapRun(run);
}

async function syncWorkflowRunStats(
  tx: Prisma.TransactionClient,
  workflowId: string,
) {
  const remaining = await tx.automationRun.count({ where: { workflowId } });
  // Keep lastRunAt: the automations table Last Run is persistent and must not
  // reset when run-history entries are deleted from workflow details.
  await tx.automationWorkflow.update({
    where: { id: workflowId },
    data: { runs: remaining },
  });
}

async function deleteRun(args: { userId: number; id: string }) {
  return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const existing = await tx.automationRun.findFirst({
      where: { id: args.id, workflow: { userId: args.userId } },
    });
    if (!existing) {
      return { success: false, deleted: null };
    }

    if (existing.status === 'in_progress') {
      return { success: false, deleted: null };
    }

    await tx.automationRun.delete({ where: { id: existing.id } });
    await syncWorkflowRunStats(tx, existing.workflowId);
    return { success: true, deleted: mapRun(existing) };
  });
}

async function clearRuns(args: { userId: number; workflowId: string }) {
  const workflow = await prisma.automationWorkflow.findFirst({
    where: { id: args.workflowId, userId: args.userId },
    select: { id: true },
  });
  if (!workflow) {
    throw new GraphQLError('Workflow not found', { extensions: { code: 'NOT_FOUND' } });
  }

  const deletedCount = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const result = await tx.automationRun.deleteMany({
      where: { workflowId: workflow.id, status: { not: 'in_progress' } },
    });
    await syncWorkflowRunStats(tx, workflow.id);
    return result.count;
  });

  return { success: true, deletedCount };
}

export const automationsResolvers = {
  Query: {
    automationWorkflows: async (
      _: unknown,
      args: {
        page?: number;
        limit?: number;
        status?: string | null;
        type?: string | null;
      },
      ctx: unknown,
    ) => {
      const userId = requireDashboardUser(ctx);
      return fetchWorkflowsConnection({ ...args, userId });
    },
    automationWorkflow: async (_: unknown, args: { id: string }, ctx: unknown) => {
      const userId = requireDashboardUser(ctx);
      return fetchWorkflow({ ...args, userId });
    },
    automationRuns: async (
      _: unknown,
      args: { workflowId: string; limit?: number },
      ctx: unknown,
    ) => {
      const userId = requireDashboardUser(ctx);
      return fetchRuns({ ...args, userId });
    },
  },
  Mutation: {
    createAutomationWorkflow: async (
      _: unknown,
      args: {
        name: string;
        description?: string | null;
        type: string;
        status?: string | null;
        triggerType?: string | null;
        triggerConfig?: unknown;
        agentConfig?: unknown;
        actionType?: string | null;
        actionConfig?: unknown;
        whatsappPhone?: string | null;
        gmailEmail?: string | null;
      },
      ctx: unknown,
    ) => {
      const userId = requireDashboardUser(ctx);
      return createWorkflow({ ...args, userId });
    },
    updateAutomationWorkflow: async (
      _: unknown,
      args: {
        id: string;
        name?: string | null;
        description?: string | null;
        type?: string | null;
        status?: string | null;
        triggerType?: string | null;
        triggerConfig?: unknown;
        agentConfig?: unknown;
        actionType?: string | null;
        actionConfig?: unknown;
        whatsappPhone?: string | null;
        gmailEmail?: string | null;
      },
      ctx: unknown,
    ) => {
      const userId = requireDashboardUser(ctx);
      return updateWorkflow({ ...args, userId });
    },
    deleteAutomationWorkflow: async (_: unknown, args: { id: string }, ctx: unknown) => {
      const userId = requireDashboardUser(ctx);
      return deleteWorkflow({ ...args, userId });
    },
    setAutomationWorkflowStatus: async (
      _: unknown,
      args: { ids: string[]; status: string },
      ctx: unknown,
    ) => {
      const userId = requireDashboardUser(ctx);
      return setStatus({ ...args, userId });
    },
    testAutomationWorkflow: async (
      _: unknown,
      args: { id: string; locale?: string | null; live?: boolean | null },
      ctx: unknown,
    ) => {
      const userId = requireDashboardUser(ctx);
      return testWorkflow({ ...args, userId });
    },
    deleteAutomationRun: async (_: unknown, args: { id: string }, ctx: unknown) => {
      const userId = requireDashboardUser(ctx);
      return deleteRun({ ...args, userId });
    },
    clearAutomationRuns: async (
      _: unknown,
      args: { workflowId: string },
      ctx: unknown,
    ) => {
      const userId = requireDashboardUser(ctx);
      return clearRuns({ ...args, userId });
    },
  },
};

// Silence unused in case tree-shaking — RUN_STATUSES reserved for future validation
void RUN_STATUSES;
