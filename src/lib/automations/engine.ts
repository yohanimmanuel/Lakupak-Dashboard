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
import { migrateOrderPaidTriggerConfig, parseIdleHours } from '@/lib/automations/catalog';
import { isLiveActionType } from '@/lib/automations/liveActions';
import { executeChannelBuyerMessage } from '@/lib/automations/deliverBuyerMessage';
import { syncWorkflowBuyers } from '@/lib/automations/syncWorkflowBuyers';
import {
  cartIdleRunKey,
  findIdleCartsForDistributor,
  MAX_CART_IDLE_SENDS_PER_TICK,
  type IdleCart,
} from '@/lib/automations/idleCarts';
import {
  isCampaignScheduleDue,
  parseScheduledSendAtMs,
  scheduleClaimMatches,
  scheduledSendAtIdentity,
  withScheduleClaim,
} from '@/lib/automations/scheduleTime';
import {
  credentialsFromWhatsAppAppConfig,
  normalizeE164Phone,
  sendTextMessage,
} from '@/lib/whatsapp/cloudApi';

type JsonRecord = Record<string, unknown>;

const RUN_STATUS_IN_PROGRESS = 'in_progress';
type TerminalRunStatus = 'success' | 'failed' | 'skipped';

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

export type ReturnAcceptedEvent = {
  userId: number;
  orderId: string;
  buyerId: string;
};

export type CartIdleEvent = {
  userId: number;
  idleHours: number;
  cart: IdleCart;
};

type ScheduleContext = { kind: 'schedule'; sendAt: string };

type WorkflowRunContext =
  | { kind: 'stock_below'; event: StockBelowEvent }
  | { kind: 'order_paid'; event: OrderPaidProofEvent }
  | { kind: 'return_accepted'; event: ReturnAcceptedEvent }
  | { kind: 'cart_idle'; event: CartIdleEvent }
  | ScheduleContext;

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

function pickedBuyerIds(config: JsonRecord | null | undefined): string[] {
  const list = config?.selectedBuyers;
  if (Array.isArray(list) && list.length > 0) {
    return list
      .map((item) => {
        if (!item || typeof item !== 'object') return '';
        return String((item as JsonRecord).buyerId ?? '').trim();
      })
      .filter(Boolean);
  }
  const buyerId = String(config?.buyerId ?? '').trim();
  return buyerId ? [buyerId] : [];
}

function whatsappAppConfigFromWorkflow(workflow: AutomationWorkflow): JsonRecord | null {
  const nodes = canvasNodesFromAgentConfig(workflow.agentConfig);
  const app = nodes.find(
    (n) => n.data?.kind === 'app' && n.data?.catalogType === 'app_webhook',
  );
  return app?.data?.config ?? null;
}

function interpolateWhatsAppMessage(
  template: string,
  vars: Record<string, string>,
): string {
  let out = template;
  for (const [key, value] of Object.entries(vars)) {
    out = out.replaceAll(`{{${key}}}`, value);
  }
  return out;
}

async function executeWhatsAppBuyer(
  workflow: AutomationWorkflow,
  config: JsonRecord,
  ctx:
    | { kind: 'stock_below'; event: StockBelowEvent }
    | { kind: 'order_paid'; event: OrderPaidProofEvent },
): Promise<string> {
  const creds = credentialsFromWhatsAppAppConfig(whatsappAppConfigFromWorkflow(workflow));
  if (!creds?.accessToken || !creds.phoneNumberId) {
    throw new Error(
      'whatsapp_buyer needs Cloud API credentials on the WhatsApp app node (accessToken + phoneNumberId), or WHATSAPP_CLOUD_* env vars.',
    );
  }

  const messageTemplate = String(config.messageTemplate ?? '').trim();
  if (!messageTemplate) {
    throw new Error('whatsapp_buyer needs a messageTemplate.');
  }

  const buyerIds = pickedBuyerIds(config);
  if (buyerIds.length === 0) {
    throw new Error('whatsapp_buyer needs at least one buyer.');
  }

  let buyers = await prisma.buyer.findMany({
    where: {
      buyerId: { in: buyerIds },
      userId: workflow.userId,
    },
    select: {
      buyerId: true,
      phone: true,
      storeName: true,
      owner: true,
      userId: true,
    },
  });

  if (buyers.length === 0) {
    buyers = await prisma.buyer.findMany({
      where: { userId: workflow.userId },
      select: {
        buyerId: true,
        phone: true,
        storeName: true,
        owner: true,
        userId: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  if (buyers.length === 0) {
    throw new Error('No matching buyers found in database for whatsapp_buyer.');
  }

  const contextVars: Record<string, string> = {
    productName: ctx.kind === 'stock_below' ? ctx.event.productName : '',
    productId: ctx.kind === 'stock_below' ? ctx.event.productId : '',
    stock: ctx.kind === 'stock_below' ? String(ctx.event.newStock) : '',
    orderId: ctx.kind === 'order_paid' ? ctx.event.orderId : '',
    workflowName: workflow.name || 'Lakupak',
  };

  const sent: string[] = [];
  const failed: string[] = [];

  for (const buyer of buyers) {
    const phone = normalizeE164Phone(buyer.phone);
    if (!phone) {
      failed.push(`${buyer.buyerId} (invalid phone)`);
      continue;
    }
    const body = interpolateWhatsAppMessage(messageTemplate, {
      ...contextVars,
      buyerName: buyer.owner || buyer.storeName || buyer.buyerId,
      storeName: buyer.storeName || '',
    });
    try {
      const result = await sendTextMessage({
        accessToken: creds.accessToken,
        phoneNumberId: creds.phoneNumberId,
        to: phone,
        body,
      });
      sent.push(`${buyer.buyerId}:${result.messageId}`);
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      failed.push(`${buyer.buyerId} (${detail})`);
    }
  }

  if (sent.length === 0) {
    throw new Error(
      `whatsapp_buyer sent 0 messages.${failed.length ? ` Failures: ${failed.join('; ')}` : ''}`,
    );
  }

  return `whatsapp_buyer sent ${sent.length} message(s) [${sent.join(', ')}]${
    failed.length ? `; failed: ${failed.join('; ')}` : ''
  }.`;
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

function campaignScheduleRunKey(workflowId: string, sendAtMs: number): string {
  return `campaign_schedule:${workflowId}:${new Date(sendAtMs).toISOString()}`;
}

function stampAgentConfigScheduleClaim(
  agentConfig: unknown,
  runKey: string,
  sendAtIdentity: string,
): Prisma.InputJsonValue {
  const root = asRecord(agentConfig) ?? {};
  const canvas = asRecord(root.__canvas);
  if (!canvas || !Array.isArray(canvas.nodes) || !sendAtIdentity) {
    return root as Prisma.InputJsonValue;
  }
  const nodes = canvas.nodes.map((n) => {
    const row = asRecord(n);
    if (!row) return n;
    const data = asRecord(row.data);
    if (!data || data.kind !== 'trigger' || data.catalogType !== 'campaign_schedule') {
      return n;
    }
    const config = asRecord(data.config);
    if (scheduledSendAtIdentity(config) !== sendAtIdentity) return n;
    return {
      ...row,
      data: {
        ...data,
        config: withScheduleClaim(config, runKey),
      },
    };
  });
  return { ...root, __canvas: { ...canvas, nodes } } as Prisma.InputJsonValue;
}

const SCHEDULE_CLAIM_MAX_ATTEMPTS = 5;

class ScheduleClaimConflictError extends Error {
  constructor() {
    super('schedule claim conflict');
    this.name = 'ScheduleClaimConflictError';
  }
}

export type ClaimScheduleSlotOptions = {
  /** Test seam: runs after the in-transaction workflow read, before the conditional update. */
  afterWorkflowRead?: (workflowId: string) => Promise<void>;
};

/** One send per Send-at time. Survives cleared run history and overlapping ticks. */
export async function claimCampaignScheduleSlot(
  workflowId: string,
  runKey: string,
  sendAtIdentity: string,
  opts?: ClaimScheduleSlotOptions,
): Promise<boolean> {
  const workflow = await prisma.automationWorkflow.findUnique({
    where: { id: workflowId },
  });
  if (!workflow) return false;
  const { triggers } = workflowSteps(workflow);
  if (
    scheduleClaimMatches(asRecord(workflow.triggerConfig), runKey) ||
    triggers.some((t) => t.type === 'campaign_schedule' && scheduleClaimMatches(t.config, runKey))
  ) {
    return false;
  }

  const already = await prisma.automationRun.findFirst({
    where: { workflowId, runKey },
    select: { id: true },
  });
  if (already) return false;

  for (let attempt = 0; attempt < SCHEDULE_CLAIM_MAX_ATTEMPTS; attempt += 1) {
    try {
      await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        await tx.automationRun.create({
          data: {
            workflowId,
            status: RUN_STATUS_IN_PROGRESS,
            message: `[${runKey}] in_progress`,
            runKey,
          },
        });
        const current = await tx.automationWorkflow.findUnique({
          where: { id: workflowId },
          select: { triggerConfig: true, agentConfig: true, updatedAt: true },
        });
        if (!current) {
          throw new ScheduleClaimConflictError();
        }
        if (opts?.afterWorkflowRead) {
          await opts.afterWorkflowRead(workflowId);
        }
        const triggerConfig = asRecord(current.triggerConfig);
        const updated = await tx.automationWorkflow.updateMany({
          where: { id: workflowId, updatedAt: current.updatedAt },
          data: {
            runs: { increment: 1 },
            lastRunAt: new Date(),
            triggerConfig:
              sendAtIdentity &&
              scheduledSendAtIdentity(triggerConfig) === sendAtIdentity
                ? (withScheduleClaim(triggerConfig, runKey) as Prisma.InputJsonValue)
                : undefined,
            agentConfig: stampAgentConfigScheduleClaim(
              current.agentConfig,
              runKey,
              sendAtIdentity,
            ),
            // Keep user-edit updatedAt so save-skew due checks are not shifted by claims.
            updatedAt: current.updatedAt,
          },
        });
        if (updated.count !== 1) {
          throw new ScheduleClaimConflictError();
        }
      });
      return true;
    } catch (err) {
      // Race between overlapping ticks: the other claim won.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        return false;
      }
      if (err instanceof ScheduleClaimConflictError && attempt < SCHEDULE_CLAIM_MAX_ATTEMPTS - 1) {
        continue;
      }
      throw err;
    }
  }
  return false;
}

async function recordRun(
  workflowId: string,
  status: TerminalRunStatus | typeof RUN_STATUS_IN_PROGRESS,
  message: string,
  runKey?: string,
) {
  await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    await tx.automationRun.create({
      data: { workflowId, status, message, runKey: runKey ?? null },
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
      OR: [{ runKey }, { message: { startsWith: `[${runKey}]` } }],
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

async function defaultNotifyBody(ctx: WorkflowRunContext): Promise<string> {
  if (ctx.kind === 'stock_below') {
    const e = ctx.event;
    const variant = e.variantName ? ` (${e.variantName})` : '';
    return `Low stock on ${e.productName}${variant}: ${e.newStock} units (threshold ${e.lowStockThreshold}).`;
  }
  if (ctx.kind === 'order_paid') {
    return `Payment proof received for order #${ctx.event.orderId}.`;
  }
  if (ctx.kind === 'return_accepted') {
    return `Return items received for order #${ctx.event.orderId}.`;
  }
  if (ctx.kind === 'cart_idle') {
    const cart = ctx.event.cart;
    const products = cart.productNames.slice(0, 3).join(', ');
    const more =
      cart.productNames.length > 3 ? ` +${cart.productNames.length - 3} more` : '';
    return `Idle cart (${ctx.event.idleHours}h): ${cart.storeName || cart.owner || cart.buyerId}${
      products ? ` — ${products}${more}` : ''
    }.`;
  }
  return `Scheduled campaign send at ${ctx.sendAt}.`;
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
  rawWorkflow: AutomationWorkflow,
  actions: Array<{ type: string; config: JsonRecord }>,
  ctx: WorkflowRunContext,
): Promise<{ status: 'success' | 'failed' | 'skipped'; message: string }> {
  const workflow = await syncWorkflowBuyers(rawWorkflow, undefined, { persist: true });
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
      } else if (action.type === 'whatsapp_buyer') {
        if (ctx.kind === 'schedule' || ctx.kind === 'return_accepted' || ctx.kind === 'cart_idle') {
          parts.push('whatsapp_buyer skipped (wrong trigger context).');
          continue;
        }
        parts.push(await executeWhatsAppBuyer(workflow, action.config, ctx));
      } else if (action.type === 'share_product_whatsapp') {
        if (ctx.kind === 'schedule') {
          parts.push(await executeChannelBuyerMessage(workflow, action.type, action.config));
          continue;
        }
        const extraVars =
          ctx.kind === 'stock_below'
            ? {
                productName: ctx.event.productName,
                productId: ctx.event.productId,
                stock: String(ctx.event.newStock),
              }
            : undefined;
        parts.push(
          await executeChannelBuyerMessage(
            workflow,
            action.type,
            action.config,
            extraVars,
          ),
        );
      } else if (action.type === 'return_confirm_whatsapp') {
        if (ctx.kind === 'return_accepted') {
          parts.push(
            await executeChannelBuyerMessage(workflow, action.type, {
              ...action.config,
              buyerId: ctx.event.buyerId,
              selectedBuyers: [{ buyerId: ctx.event.buyerId }],
            }),
          );
        } else if (ctx.kind === 'schedule') {
          parts.push(await executeChannelBuyerMessage(workflow, action.type, action.config));
        } else {
          parts.push(
            'return_confirm_whatsapp skipped (run Test run, or wait for a return accepted trigger).',
          );
        }
      } else if (action.type === 'assign_agent_whatsapp') {
        parts.push('assign_agent_whatsapp runs on inbound buyer WhatsApp handoff.');
      } else if (action.type === 'cs_24h_window') {
        parts.push('cs_24h_window runs on inbound buyer WhatsApp messages.');
      } else if (action.type === 'cart_winback') {
        if (ctx.kind === 'cart_idle') {
          const cart = ctx.event.cart;
          parts.push(
            await executeChannelBuyerMessage(
              workflow,
              action.type,
              action.config,
              {
                cartProducts: cart.productNames.join(', '),
              },
              {
                recipients: [
                  {
                    buyerId: cart.buyerId,
                    email: cart.email,
                    phone: cart.phone,
                    owner: cart.owner,
                    storeName: cart.storeName,
                  },
                ],
              },
            ),
          );
        } else if (ctx.kind === 'schedule') {
          parts.push(
            await executeChannelBuyerMessage(workflow, action.type, action.config),
          );
        } else {
          parts.push(
            'cart_winback skipped here (run Test run on a marketing workflow, or wait for cart idle).',
          );
        }
      } else if (action.type === 'send_campaign') {
        parts.push('send_campaign is no longer available.');
      }
    }

    if (notifyActions.length > 0) {
      const label =
        ctx.kind === 'stock_below'
          ? `stock_below:${ctx.event.productId}`
          : ctx.kind === 'order_paid'
            ? `order_paid:${ctx.event.orderId}`
          : ctx.kind === 'return_accepted'
            ? `return_accepted:${ctx.event.orderId}`
            : ctx.kind === 'cart_idle'
              ? `cart_idle:${ctx.event.cart.marketplaceUserId}`
              : `campaign_schedule:${ctx.sendAt}`;
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
      await recordRun(workflow.id, RUN_STATUS_IN_PROGRESS, `[${runKey}] in_progress`);

      const result = await runWorkflowActions(workflow, actions, {
        kind: 'stock_below',
        event,
      });
      await prisma.automationRun.updateMany({
        where: {
          workflowId: workflow.id,
          status: RUN_STATUS_IN_PROGRESS,
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
              status: RUN_STATUS_IN_PROGRESS,
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

/** Fire active return_accepted workflows after returned items are confirmed received. */
export async function dispatchReturnAcceptedAutomations(
  event: ReturnAcceptedEvent,
): Promise<void> {
  if (!event.userId || !event.orderId || !event.buyerId) return;

  const workflows = await loadActiveWorkflows(event.userId);
  for (const workflow of workflows) {
    const { triggers, actions } = workflowSteps(workflow);
    const matching = triggers.filter((t) => t.type === 'return_accepted');
    if (matching.length === 0) continue;

    const result = await runWorkflowActions(workflow, actions, {
      kind: 'return_accepted',
      event,
    });
    await recordRun(workflow.id, result.status, result.message);
  }
}

/** Fire active cart_idle workflows for marketplace carts that sat untouched. */
export async function dispatchDueCartIdleAutomations(opts?: {
  workflowId?: string;
  now?: Date;
}): Promise<{ checked: number; fired: number }> {
  const workflows = await prisma.automationWorkflow.findMany({
    where: {
      status: 'active',
      ...(opts?.workflowId ? { id: opts.workflowId } : {}),
    },
  });

  const now = opts?.now ?? new Date();
  let fired = 0;

  for (const workflow of workflows) {
    try {
      const { triggers, actions } = workflowSteps(workflow);
      const idleTrigger = triggers.find((t) => t.type === 'cart_idle');
      if (!idleTrigger) continue;
      const idleHours = parseIdleHours(idleTrigger.config);
      if (idleHours == null) continue;

      const winback = actions.find((a) => a.type === 'cart_winback');
      const idleCarts = await findIdleCartsForDistributor({
        distributorUserId: workflow.userId,
        idleHours,
        now,
        actionConfig: winback?.config ?? null,
      });
      if (idleCarts.length === 0) continue;

      let claimed = 0;
      for (const cart of idleCarts) {
        if (claimed >= MAX_CART_IDLE_SENDS_PER_TICK) break;
        const runKey = cartIdleRunKey(workflow.id, cart.marketplaceUserId, cart.lastActivityAt);
        if (await hasExistingRun(workflow.id, runKey)) continue;

        try {
          await recordRun(
            workflow.id,
            RUN_STATUS_IN_PROGRESS,
            `[${runKey}] in_progress`,
            runKey,
          );
        } catch (err) {
          const code =
            err && typeof err === 'object' && 'code' in err
              ? String((err as { code?: unknown }).code)
              : '';
          if (code === 'P2002') continue;
          throw err;
        }
        claimed += 1;

        try {
          const result = await runWorkflowActions(workflow, actions, {
            kind: 'cart_idle',
            event: {
              userId: workflow.userId,
              idleHours,
              cart,
            },
          });
          await prisma.automationRun.updateMany({
            where: {
              workflowId: workflow.id,
              runKey,
              status: RUN_STATUS_IN_PROGRESS,
            },
            data: {
              status: result.status,
              message: `[${runKey}] ${result.message}`,
            },
          });
          if (result.status === 'success') {
            fired += 1;
          }
        } catch (err) {
          const detail = err instanceof Error ? err.message : String(err);
          try {
            await prisma.automationRun.updateMany({
              where: {
                workflowId: workflow.id,
                runKey,
                status: RUN_STATUS_IN_PROGRESS,
              },
              data: {
                status: 'failed',
                message: `[${runKey}] Failed: ${detail}`,
              },
            });
          } catch {
            // best-effort finalize
          }
          console.error(`[automations] cart_idle run ${runKey} failed`, err);
        }
      }
    } catch (err) {
      console.error(`[automations] cart_idle workflow ${workflow.id} failed`, err);
    }
  }

  return { checked: workflows.length, fired };
}

/** Fire active campaign_schedule workflows whose Send at time is due. */
export async function dispatchDueCampaignScheduleAutomations(opts?: {
  workflowId?: string;
}): Promise<{ checked: number; fired: number }> {
  const workflows = await prisma.automationWorkflow.findMany({
    where: {
      status: 'active',
      ...(opts?.workflowId ? { id: opts.workflowId } : {}),
    },
  });

  const nowMs = Date.now();
  let fired = 0;

  for (const workflow of workflows) {
    try {
      const { triggers, actions } = workflowSteps(workflow);
      const lastSavedAtMs = workflow.updatedAt.getTime();
      const due = triggers.filter((t) => {
        if (t.type !== 'campaign_schedule') return false;
        const sendAtMs = parseScheduledSendAtMs(t.config);
        return (
          sendAtMs != null &&
          isCampaignScheduleDue({ sendAtMs, nowMs, lastSavedAtMs })
        );
      });
      if (due.length === 0) continue;

      for (const trigger of due) {
        let runKey: string | null = null;
        let claimed = false;
        try {
          const sendAtMs = parseScheduledSendAtMs(trigger.config);
          if (sendAtMs == null) continue;
          const sendAtIso = new Date(sendAtMs).toISOString();
          runKey = campaignScheduleRunKey(workflow.id, sendAtMs);
          if (scheduleClaimMatches(trigger.config, runKey)) continue;
          claimed = await claimCampaignScheduleSlot(
            workflow.id,
            runKey,
            scheduledSendAtIdentity(trigger.config),
          );
          if (!claimed) continue;

          const result = await runWorkflowActions(workflow, actions, {
            kind: 'schedule',
            sendAt: sendAtIso,
          });
          await prisma.automationRun.updateMany({
            where: {
              workflowId: workflow.id,
              runKey,
              status: RUN_STATUS_IN_PROGRESS,
            },
            data: {
              status: result.status,
              message: `[${runKey}] ${result.message}`,
            },
          });
          if (result.status === 'success') {
            fired += 1;
          }
        } catch (err) {
          if (claimed && runKey) {
            const detail = err instanceof Error ? err.message : String(err);
            try {
              await prisma.automationRun.updateMany({
                where: {
                  workflowId: workflow.id,
                  runKey,
                  status: RUN_STATUS_IN_PROGRESS,
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
          console.error(`[automations] campaign_schedule workflow ${workflow.id} failed`, err);
        }
      }
    } catch (err) {
      console.error(`[automations] campaign_schedule workflow ${workflow.id} failed`, err);
    }
  }

  return { checked: workflows.length, fired };
}
