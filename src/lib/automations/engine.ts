import { prisma } from '@/lib/db';
import { Prisma, type AutomationWorkflow } from '@/lib/prisma-generated';
import { getVariantStockStatus } from '@/utils/stockUtils';
import {
  broadcastDashboardNotification,
  broadcastOrderUpdate,
  broadcastProductUpdate,
  broadcastNotification,
} from '@/utils/websocketBroadcast';
import { enqueueSideEffect } from '@/lib/sideEffectQueue';
import { parseMarketplaceUserIdFromBuyerId } from '@/utils/buyerSync';
import {
  getMarketplaceUserPushLanguage,
  sendExpoPushToMarketplaceUser,
} from '@/utils/expoPush';
import { translateMarketplacePaymentConfirmed } from '@/utils/marketplacePushTranslations';
import { migrateOrderPaidTriggerConfig } from '@/lib/automations/catalog';
import { isLiveActionType } from '@/lib/automations/liveActions';

type JsonRecord = Record<string, unknown>;

type CanvasNodeLite = {
  id?: string;
  data?: {
    kind?: string;
    catalogType?: string;
    config?: JsonRecord;
  };
};

export type StockBelowEvent = {
  userId: number;
  productId: string;
  productName: string;
  previousStock: number;
  newStock: number;
  lowStockThreshold: number;
  variantName?: string;
  variantOptionId?: number;
};

export type OrderPaidProofEvent = {
  userId: number;
  orderId: string;
  orderNumericId?: number;
};

function asRecord(value: unknown): JsonRecord | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as JsonRecord;
}

function canvasNodesFromAgentConfig(agentConfig: unknown): CanvasNodeLite[] {
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
    if (kind === 'trigger' && catalogType === 'order_paid') {
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

function pickedProducts(config: JsonRecord | null | undefined): Array<{
  productId: string;
  variantId: string;
}> {
  const list = config?.selectedProducts;
  if (Array.isArray(list) && list.length > 0) {
    return list
      .map((item) => {
        if (!item || typeof item !== 'object') return null;
        const row = item as JsonRecord;
        const productId = String(row.productId ?? '').trim();
        if (!productId) return null;
        return {
          productId,
          variantId: String(row.variantId ?? '').trim(),
        };
      })
      .filter((row): row is { productId: string; variantId: string } => row != null);
  }
  const productId = String(config?.productId ?? '').trim();
  if (!productId) return [];
  return [
    {
      productId,
      variantId: String(config?.variantId ?? '').trim(),
    },
  ];
}

function workflowSteps(workflow: AutomationWorkflow): {
  triggers: Array<{ type: string; config: JsonRecord }>;
  actions: Array<{ type: string; config: JsonRecord }>;
} {
  const nodes = canvasNodesFromAgentConfig(workflow.agentConfig);
  const triggerNodes = nodes.filter((n) => n.data?.kind === 'trigger');
  const actionNodes = nodes.filter((n) => n.data?.kind === 'action');

  const triggers =
    triggerNodes.length > 0
      ? triggerNodes.map((n) => ({
          type: String(n.data?.catalogType ?? ''),
          config: n.data?.config ?? {},
        }))
      : [
          {
            type: workflow.triggerType,
            config:
              (asRecord(workflow.triggerConfig) as JsonRecord) ??
              ({} as JsonRecord),
          },
        ];

  const actions =
    actionNodes.length > 0
      ? actionNodes.map((n) => ({
          type: String(n.data?.catalogType ?? ''),
          config: n.data?.config ?? {},
        }))
      : [
          {
            type: workflow.actionType,
            config:
              (asRecord(workflow.actionConfig) as JsonRecord) ??
              ({} as JsonRecord),
          },
        ];

  return { triggers, actions };
}

function crossedIntoLowOrOut(event: StockBelowEvent): boolean {
  const { previousStock, newStock, lowStockThreshold } = event;
  const wasOutOfStock = previousStock === 0;
  const wasCritical =
    previousStock > 0 && lowStockThreshold > 0 && previousStock < lowStockThreshold * 0.5;
  const wasLowStock =
    previousStock > 0 && lowStockThreshold > 0 && previousStock <= lowStockThreshold;

  const isOutOfStock = newStock === 0;
  const isCritical =
    newStock > 0 && lowStockThreshold > 0 && newStock < lowStockThreshold * 0.5;
  const isLowStock =
    newStock > 0 && lowStockThreshold > 0 && newStock <= lowStockThreshold;

  if (isOutOfStock && !wasOutOfStock) return true;
  if (isCritical && !wasCritical && !wasOutOfStock) return true;
  if (isLowStock && !wasLowStock && !wasOutOfStock && !wasCritical) return true;
  return false;
}

function stockTriggerMatches(config: JsonRecord, event: StockBelowEvent): boolean {
  const products = pickedProducts(config);
  if (products.length === 0) return false;
  return products.some((p) => {
    if (p.productId !== event.productId) return false;
    if (!p.variantId) return true;
    if (event.variantOptionId != null && p.variantId === String(event.variantOptionId)) {
      return true;
    }
    return false;
  });
}

function orderPaidTriggerMatches(config: JsonRecord): boolean {
  const migrated = migrateOrderPaidTriggerConfig(config);
  const paidWhen = String(migrated.paidWhen ?? 'proof_submitted').trim();
  return paidWhen === 'proof_submitted';
}

async function recordRun(
  workflowId: string,
  status: 'success' | 'failed' | 'skipped',
  message: string,
) {
  await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    await tx.automationRun.create({
      data: { workflowId, status, message },
    });
    await tx.automationWorkflow.update({
      where: { id: workflowId },
      data: {
        runs: { increment: 1 },
        lastRunAt: new Date(),
      },
    });
  });
}

/** Stable key so side-effect retries do not re-run the same stock_below event per workflow. */
function stockBelowRunKey(workflowId: string, event: StockBelowEvent): string {
  const variant =
    event.variantOptionId != null
      ? `vo:${event.variantOptionId}`
      : `vn:${event.variantName ?? ''}`;
  return `stock_below:${workflowId}:${event.productId}:${variant}:${event.previousStock}->${event.newStock}`;
}

async function hasExistingRun(workflowId: string, runKey: string): Promise<boolean> {
  const existing = await prisma.automationRun.findFirst({
    where: {
      workflowId,
      message: { startsWith: `[${runKey}]` },
    },
    select: { id: true },
  });
  return existing != null;
}

async function executeReplenishStock(
  userId: number,
  config: JsonRecord,
  event: StockBelowEvent,
): Promise<string> {
  const rawQty = config.replenishQty;
  const qty =
    typeof rawQty === 'number'
      ? rawQty
      : parseInt(String(rawQty ?? '').trim(), 10);
  if (!Number.isFinite(qty) || qty <= 0) {
    throw new Error('replenish_stock needs a positive replenishQty.');
  }

  let variantOptionId = event.variantOptionId ?? null;
  if (variantOptionId == null && event.variantName) {
    const product = await prisma.product.findFirst({
      where: { productId: event.productId, userId },
      select: {
        variantOptions: { select: { id: true, variantName: true } },
      },
    });
    const match = product?.variantOptions.find((v) => v.variantName === event.variantName);
    variantOptionId = match?.id ?? null;
  }

  if (variantOptionId == null) {
    throw new Error(
      `Cannot resolve the variant for product ${event.productId}; replenish skipped to avoid updating the wrong SKU.`,
    );
  }

  const owned = await prisma.variantOption.findFirst({
    where: {
      id: variantOptionId,
      product: { productId: event.productId, userId },
    },
    select: {
      id: true,
      stockQuantity: true,
      lowStockThreshold: true,
      variantName: true,
    },
  });
  if (!owned) {
    throw new Error(`Variant ${variantOptionId} not found for product ${event.productId}.`);
  }

  const previousStock = owned.stockQuantity ?? 0;
  const newStock = previousStock + qty;
  const stockStatus = getVariantStockStatus(newStock, owned.lowStockThreshold);

  await prisma.variantOption.update({
    where: { id: owned.id },
    data: { stockQuantity: newStock, stockStatus },
  });

  try {
    await broadcastProductUpdate([event.productId]);
  } catch {
    // best-effort
  }

  return `Replenished ${qty} units on ${event.productName}${owned.variantName ? ` (${owned.variantName})` : ''}: ${previousStock} → ${newStock}.`;
}

async function executeMarkPaidFromProof(event: OrderPaidProofEvent): Promise<string> {
  const order = await prisma.order.findFirst({
    where: {
      orderId: event.orderId,
      userId: event.userId,
    },
    select: {
      orderId: true,
      buyerId: true,
      paymentStatus: true,
    },
  });
  if (!order) {
    throw new Error(`Order ${event.orderId} not found.`);
  }

  const previous = String(order.paymentStatus ?? '');
  if (previous === 'Paid') {
    return `Order #${order.orderId} already Paid; skipped.`;
  }

  await prisma.order.update({
    where: { orderId: order.orderId },
    data: {
      paymentStatus: 'Paid',
      paidAt: new Date(),
    },
  });

  try {
    await broadcastOrderUpdate([order.orderId]);
  } catch {
    // best-effort
  }

  enqueueSideEffect('automationMarketplacePaymentConfirmed', async () => {
    const marketplaceUserId = parseMarketplaceUserIdFromBuyerId(order.buyerId);
    if (marketplaceUserId == null) return;
    const payload = { orderId: order.orderId, paymentStatus: 'Paid', type: 'payment' };
    const payTranslations = translateMarketplacePaymentConfirmed({ orderId: order.orderId });
    const { tokenCount } = await sendExpoPushToMarketplaceUser(
      marketplaceUserId,
      payTranslations,
      payload,
    );
    if (tokenCount === 0) {
      const wsLang = await getMarketplaceUserPushLanguage(marketplaceUserId);
      const wsCopy = payTranslations[wsLang] ?? payTranslations.en;
      await broadcastNotification(
        'payment',
        wsCopy.title,
        wsCopy.body,
        payload,
        marketplaceUserId,
        'marketplace',
      );
    }
  });

  return `Marked order #${order.orderId} Paid (was ${previous || 'unknown'}).`;
}

async function defaultNotifyBody(
  ctx:
    | { kind: 'stock_below'; event: StockBelowEvent }
    | { kind: 'order_paid'; event: OrderPaidProofEvent },
): Promise<string> {
  if (ctx.kind === 'stock_below') {
    const e = ctx.event;
    const variant = e.variantName ? ` (${e.variantName})` : '';
    return `Low stock on ${e.productName}${variant}: ${e.newStock} units (threshold ${e.lowStockThreshold}).`;
  }
  return `Payment proof received for order #${ctx.event.orderId}.`;
}

async function executeNotifyDashboard(
  userId: number,
  workflowName: string,
  body: string,
  contextLabel: string,
  workflowId?: string,
): Promise<void> {
  const message = body.trim();
  if (!message) {
    throw new Error('notify_dashboard needs a message body.');
  }

  await prisma.notification.create({
    data: {
      userId,
      type: 'system',
      title: workflowName || 'Automation',
      message,
      metadata: { source: 'automation', context: contextLabel, workflowId: workflowId ?? null },
      actionUrl: workflowId
        ? `/automation/details?id=${encodeURIComponent(workflowId)}`
        : '/automation',
    },
  });
  broadcastDashboardNotification(userId).catch(() => {
    /* best-effort */
  });
}

async function runWorkflowActions(
  workflow: AutomationWorkflow,
  actions: Array<{ type: string; config: JsonRecord }>,
  ctx:
    | { kind: 'stock_below'; event: StockBelowEvent }
    | { kind: 'order_paid'; event: OrderPaidProofEvent },
): Promise<{ status: 'success' | 'failed' | 'skipped'; message: string }> {
  const liveActions = actions.filter((a) => isLiveActionType(a.type));
  const skippedWa = actions.filter((a) => a.type && !isLiveActionType(a.type));

  if (liveActions.length === 0) {
    return {
      status: 'skipped',
      message: `No live actions to run.${
        skippedWa.length
          ? ` Skipped (not supported yet): ${skippedWa.map((a) => a.type).join(', ')}.`
          : ''
      }`,
    };
  }

  const parts: string[] = [];
  try {
    const notifyActions = liveActions.filter((a) => a.type === 'notify_dashboard');
    const workActions = liveActions.filter((a) => a.type !== 'notify_dashboard');

    for (const action of workActions) {
      if (action.type === 'replenish_stock') {
        if (ctx.kind !== 'stock_below') {
          parts.push('replenish_stock skipped (wrong trigger context).');
          continue;
        }
        parts.push(await executeReplenishStock(workflow.userId, action.config, ctx.event));
      } else if (action.type === 'mark_paid_from_proof') {
        if (ctx.kind !== 'order_paid') {
          parts.push('mark_paid_from_proof skipped (wrong trigger context).');
          continue;
        }
        parts.push(await executeMarkPaidFromProof(ctx.event));
      }
    }

    if (notifyActions.length > 0) {
      const label =
        ctx.kind === 'stock_below'
          ? `stock_below:${ctx.event.productId}`
          : `order_paid:${ctx.event.orderId}`;
      const body = parts.length > 0 ? parts.join(' ') : await defaultNotifyBody(ctx);
      // One dashboard notification per run (even if multiple notify nodes are on the canvas).
      await executeNotifyDashboard(workflow.userId, workflow.name, body, label, workflow.id);
      if (parts.length === 0) {
        parts.push(body);
      }
    }

    if (skippedWa.length > 0) {
      parts.push(`Skipped (not supported yet): ${skippedWa.map((a) => a.type).join(', ')}.`);
    }
    return { status: 'success', message: parts.join(' ') };
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return {
      status: 'failed',
      message: `${parts.length ? `${parts.join(' ')} ` : ''}Failed: ${detail}`,
    };
  }
}

async function loadActiveWorkflows(userId: number): Promise<AutomationWorkflow[]> {
  return prisma.automationWorkflow.findMany({
    where: { userId, status: 'active' },
  });
}

/** Fire active stock_below workflows when inventory crosses into low/critical/out. */
export async function dispatchStockBelowAutomations(event: StockBelowEvent): Promise<void> {
  if (!crossedIntoLowOrOut(event)) return;

  const workflows = await loadActiveWorkflows(event.userId);
  for (const workflow of workflows) {
    let runKey: string | null = null;
    try {
      const { triggers, actions } = workflowSteps(workflow);
      const matching = triggers.filter(
        (t) => t.type === 'stock_below' && stockTriggerMatches(t.config, event),
      );
      if (matching.length === 0) continue;

      runKey = stockBelowRunKey(workflow.id, event);
      if (await hasExistingRun(workflow.id, runKey)) continue;

      // Claim before side effects so a retry after replenish cannot run again.
      await recordRun(workflow.id, 'skipped', `[${runKey}] in_progress`);

      const result = await runWorkflowActions(workflow, actions, {
        kind: 'stock_below',
        event,
      });
      await prisma.automationRun.updateMany({
        where: {
          workflowId: workflow.id,
          message: `[${runKey}] in_progress`,
        },
        data: {
          status: result.status,
          message: `[${runKey}] ${result.message}`,
        },
      });
    } catch (err) {
      if (runKey) {
        const detail = err instanceof Error ? err.message : String(err);
        try {
          await prisma.automationRun.updateMany({
            where: {
              workflowId: workflow.id,
              message: `[${runKey}] in_progress`,
            },
            data: {
              status: 'failed',
              message: `[${runKey}] Failed: ${detail}`,
            },
          });
        } catch {
          // best-effort finalize
        }
      }
      // Keep other matching workflows running if one workflow or recordRun fails.
      console.error(
        `[automations] stock_below workflow ${workflow.id} failed`,
        err,
      );
    }
  }
}

/** Fire active order_paid (proof_submitted) workflows after payment proof upload. */
export async function dispatchOrderPaidProofAutomations(
  event: OrderPaidProofEvent,
): Promise<void> {
  if (!event.userId || !event.orderId) return;

  const workflows = await loadActiveWorkflows(event.userId);
  for (const workflow of workflows) {
    const { triggers, actions } = workflowSteps(workflow);
    const matching = triggers.filter(
      (t) => t.type === 'order_paid' && orderPaidTriggerMatches(t.config),
    );
    if (matching.length === 0) continue;

    const result = await runWorkflowActions(workflow, actions, {
      kind: 'order_paid',
      event,
    });
    await recordRun(workflow.id, result.status, result.message);
  }
}
