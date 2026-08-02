import { prisma } from '../common/prisma';
import { sanitizePagination, buildPaginationInfo } from '../common/utils';
import { requireDashboardUser } from '../common/auth';
import { GraphQLError } from 'graphql';
import { Prisma, type AutomationWorkflow, type AutomationRun } from '@/lib/prisma-generated';
import { SUBSCRIPTION_PLANS } from '@/config/subscriptionPlans';
import {
  ASSIGN_DRIVER_REQUIRES_DRIVER_MESSAGE,
  getDefaultAction,
  getDefaultTrigger,
  hasAssignDriverWithoutDriver,
  isActionAllowed,
  isTriggerAllowed,
} from '@/lib/automations/catalog';
import type { WorkflowType } from '@/components/automations/automationTypes';

const WORKFLOW_TYPES = new Set(['product_offers', 'lead_management', 'order_logistics', 'marketing']);
const WORKFLOW_STATUSES = new Set(['active', 'paused', 'draft']);
const RUN_STATUSES = new Set(['success', 'failed', 'skipped']);

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function canvasNodesFromAgentConfig(agentConfig: unknown): Array<{
  data?: { kind?: string; catalogType?: string; config?: Record<string, unknown> };
}> {
  const root = asRecord(agentConfig);
  const canvas = asRecord(root?.__canvas);
  const nodes = canvas?.nodes;
  if (!Array.isArray(nodes)) return [];
  return nodes.map((n) => {
    const row = asRecord(n);
    const data = asRecord(row?.data) ?? undefined;
    return {
      data: data
        ? {
            kind: typeof data.kind === 'string' ? data.kind : undefined,
            catalogType: typeof data.catalogType === 'string' ? data.catalogType : undefined,
            config: asRecord(data.config) ?? undefined,
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
    ): AutomationWorkflow!

    deleteAutomationWorkflow(id: String!): DeleteAutomationWorkflowResult!

    setAutomationWorkflowStatus(
      ids: [String!]!
      status: String!
    ): SetAutomationWorkflowStatusResult!

    testAutomationWorkflow(id: String!): AutomationRun!
  }
`;

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
  const triggerType = args.triggerType || defaultsTrigger.triggerType;
  const actionType = args.actionType || defaultsAction.actionType;

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

  const nextTrigger = args.triggerType ?? existing.triggerType;
  const nextAction = args.actionType ?? existing.actionType;
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

  const nextActionConfig =
    args.actionConfig !== undefined ? asJsonObject(args.actionConfig) : existing.actionConfig;
  const nextAgentConfig =
    args.agentConfig !== undefined
      ? args.agentConfig == null
        ? null
        : asJsonObject(args.agentConfig)
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
  if (args.triggerType != null) data.triggerType = args.triggerType;
  if (args.triggerConfig !== undefined) data.triggerConfig = asJsonObject(args.triggerConfig);
  if (args.agentConfig !== undefined) {
    data.agentConfig = args.agentConfig == null ? Prisma.JsonNull : asJsonObject(args.agentConfig);
  }
  if (args.actionType != null) data.actionType = args.actionType;
  if (args.actionConfig !== undefined) data.actionConfig = asJsonObject(args.actionConfig);

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

async function testWorkflow(args: { userId: number; id: string }) {
  const existing = await prisma.automationWorkflow.findFirst({
    where: { id: args.id, userId: args.userId },
  });
  if (!existing) {
    throw new GraphQLError('Workflow not found', { extensions: { code: 'NOT_FOUND' } });
  }

  const run = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const created = await tx.automationRun.create({
      data: {
        workflowId: existing.id,
        status: 'success',
        message: 'Manual test run (execution engine not live yet).',
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
    testAutomationWorkflow: async (_: unknown, args: { id: string }, ctx: unknown) => {
      const userId = requireDashboardUser(ctx);
      return testWorkflow({ ...args, userId });
    },
  },
};

// Silence unused in case tree-shaking — RUN_STATUSES reserved for future validation
void RUN_STATUSES;
