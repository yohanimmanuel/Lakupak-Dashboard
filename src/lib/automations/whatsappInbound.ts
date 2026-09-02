import { prisma } from '@/lib/db';
import type { AutomationWorkflow } from '@/lib/prisma-generated';
import { runInboundBuyerCsAgent } from '@/lib/automations/buyerCsAgent';
import {
  claimInboundWhatsAppMessage,
  loadBuyerCsSession,
  releaseInboundWhatsAppMessage,
  saveBuyerCsSession,
  withBuyerCsSessionLock,
  type BuyerCsSession,
} from '@/lib/automations/buyerCsSession';
import { executeAssignAgentWhatsApp } from '@/lib/automations/assignAgentWhatsApp';
import {
  credentialsFromWhatsAppAppConfig,
  normalizeE164Phone,
  sendTextMessage,
  toWhatsAppCloudRecipient,
} from '@/lib/whatsapp/cloudApi';

type JsonRecord = Record<string, unknown>;

type CanvasNode = {
  id?: string;
  data?: {
    kind?: string;
    catalogType?: string;
    config?: JsonRecord;
  };
};

export type InboundWhatsAppMessage = {
  phoneNumberId: string;
  /** metadata.display_phone_number from the webhook payload (normalized when possible). */
  businessPhone: string;
  from: string;
  text: string;
  messageId?: string;
};

function asRecord(value: unknown): JsonRecord | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as JsonRecord;
}

function canvasNodes(workflow: AutomationWorkflow): CanvasNode[] {
  const root = asRecord(workflow.agentConfig);
  const canvas = asRecord(root?.__canvas);
  const nodes = canvas?.nodes;
  if (!Array.isArray(nodes)) return [];
  return nodes.map((n) => {
    const row = asRecord(n);
    const data = asRecord(row?.data);
    return {
      id: typeof row?.id === 'string' ? row.id : undefined,
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

function whatsappAppConfig(workflow: AutomationWorkflow): JsonRecord | null {
  return (
    canvasNodes(workflow).find((n) => n.data?.kind === 'app' && n.data?.catalogType === 'app_webhook')
      ?.data?.config ?? null
  );
}

function phonesMatch(a: string | null | undefined, b: string | null | undefined): boolean {
  const da = toWhatsAppCloudRecipient(String(a ?? ''));
  const db = toWhatsAppCloudRecipient(String(b ?? ''));
  return Boolean(da && db && da === db);
}

/** App-node phone (canvas config) with workflow column fallback. */
function workflowBusinessPhone(workflow: AutomationWorkflow): string | null {
  const fromCanvas = String(whatsappAppConfig(workflow)?.phone ?? '').trim();
  const fromColumn = String(workflow.whatsappPhone ?? '').trim();
  const raw = fromCanvas || fromColumn;
  if (!raw) return null;
  return normalizeE164Phone(raw) ?? raw;
}

function selectWorkflowForInbound(
  inbound: InboundWhatsAppMessage,
  workflows: AutomationWorkflow[],
): AutomationWorkflow | null {
  const businessPhone = inbound.businessPhone.trim();
  if (!businessPhone) return null;

  const candidates = workflows.filter((workflow) => {
    if (!workflowHasBuyerQuestionsTrigger(workflow)) return false;
    const appPhone = workflowBusinessPhone(workflow);
    if (!appPhone) return false;
    return phonesMatch(businessPhone, appPhone);
  });

  if (candidates.length === 0) return null;

  candidates.sort((a, b) => {
    if (a.userId !== b.userId) return a.userId - b.userId;
    return a.id.localeCompare(b.id);
  });
  return candidates[0];
}

function workflowHasBuyerQuestionsTrigger(workflow: AutomationWorkflow): boolean {
  const nodes = canvasNodes(workflow);
  if (nodes.some((n) => n.data?.kind === 'trigger' && n.data?.catalogType === 'buyer_questions')) {
    return true;
  }
  return workflow.triggerType === 'buyer_questions';
}

function findActionConfig(workflow: AutomationWorkflow, actionType: string): JsonRecord | null {
  const node = canvasNodes(workflow).find(
    (n) => n.data?.kind === 'action' && n.data?.catalogType === actionType,
  );
  return node?.data?.config ?? null;
}

function hasCs24hWindow(workflow: AutomationWorkflow): boolean {
  return canvasNodes(workflow).some(
    (n) => n.data?.kind === 'action' && n.data?.catalogType === 'cs_24h_window',
  );
}

async function recordInboundRun(
  workflowId: string,
  status: 'success' | 'failed' | 'skipped',
  message: string,
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.automationRun.create({
      data: { workflowId, status, message },
    });
    await tx.automationWorkflow.update({
      where: { id: workflowId },
      data: { runs: { increment: 1 }, lastRunAt: new Date() },
    });
  });
}

async function handleWorkflowInboundMessage(
  workflow: AutomationWorkflow,
  inbound: InboundWhatsAppMessage,
): Promise<boolean> {
  if (!workflowHasBuyerQuestionsTrigger(workflow)) return false;

  const appConfig = whatsappAppConfig(workflow);
  const creds = credentialsFromWhatsAppAppConfig(appConfig);
  if (!creds?.accessToken || !creds.phoneNumberId) return false;

  const appPhone = workflowBusinessPhone(workflow);
  if (!appPhone || !phonesMatch(inbound.businessPhone, appPhone)) return false;
  if (inbound.phoneNumberId && creds.phoneNumberId !== inbound.phoneNumberId) return false;

  const buyerPhone = normalizeE164Phone(inbound.from) ?? `+${toWhatsAppCloudRecipient(inbound.from)}`;
  const text = inbound.text.trim();
  if (!text) return false;

  const outcome = await withBuyerCsSessionLock(workflow.id, buyerPhone, async () => {
    const session = (await loadBuyerCsSession(workflow.id, buyerPhone)) ?? {
      welcomed: false,
      handoffDone: false,
      history: [],
      updatedAt: new Date().toISOString(),
    };

    const isWelcome = hasCs24hWindow(workflow) && !session.welcomed;
    const agentResult = await runInboundBuyerCsAgent({
      userId: workflow.userId,
      workflowName: workflow.name,
      nodes: canvasNodes(workflow),
      buyerMessage: text,
      isWelcome,
      history: session.history,
    });

    if (agentResult.error) {
      return { kind: 'failed' as const, message: agentResult.error };
    }

    if (agentResult.reply) {
      await sendTextMessage({
        accessToken: creds.accessToken,
        phoneNumberId: creds.phoneNumberId,
        to: buyerPhone,
        body: agentResult.reply,
      });
    }

    const nextHistory: BuyerCsSession['history'] = [
      ...session.history,
      { role: 'user', content: text },
    ];
    if (agentResult.reply) {
      nextHistory.push({ role: 'assistant', content: agentResult.reply });
    }

    const nextSession: BuyerCsSession = {
      welcomed: session.welcomed || isWelcome,
      handoffDone: session.handoffDone,
      history: nextHistory.slice(-12),
      updatedAt: new Date().toISOString(),
    };

    const parts = [`buyer_questions: replied to ${buyerPhone}`];

    const assignConfig = findActionConfig(workflow, 'assign_agent_whatsapp');
    const escalate =
      String(findActionConfig(workflow, 'cs_24h_window')?.escalateOutOfScope ?? 'yes').trim() !==
      'no';

    if (
      agentResult.handoffRequested &&
      escalate &&
      assignConfig &&
      !session.handoffDone
    ) {
      try {
        const assigned = await executeAssignAgentWhatsApp({
          userId: workflow.userId,
          workflowName: workflow.name,
          config: assignConfig,
          whatsappAppConfig: appConfig,
          buyerPhone,
        });
        parts.push(assigned);
        nextSession.handoffDone = true;
      } catch (err) {
        const detail = err instanceof Error ? err.message : String(err);
        parts.push(`assign_agent_whatsapp failed: ${detail}`);
      }
    }

    await saveBuyerCsSession(workflow.id, buyerPhone, nextSession);
    return { kind: 'success' as const, parts };
  });

  if (outcome.kind === 'failed') {
    await recordInboundRun(workflow.id, 'failed', `buyer_questions failed: ${outcome.message}`);
    return true;
  }

  await recordInboundRun(workflow.id, 'success', outcome.parts.join('; '));
  return true;
}

export function parseWhatsAppWebhookMessages(body: unknown): InboundWhatsAppMessage[] {
  const root = asRecord(body);
  const entries = Array.isArray(root?.entry) ? root.entry : [];
  const out: InboundWhatsAppMessage[] = [];

  for (const entry of entries) {
    const entryRow = asRecord(entry);
    const changes = Array.isArray(entryRow?.changes) ? entryRow.changes : [];
    for (const change of changes) {
      const changeRow = asRecord(change);
      const value = asRecord(changeRow?.value);
      const metadata = asRecord(value?.metadata);
      const phoneNumberId = String(metadata?.phone_number_id ?? '').trim();
      const displayPhone = String(metadata?.display_phone_number ?? '').trim();
      const businessPhone = normalizeE164Phone(displayPhone) ?? displayPhone;
      const messages = Array.isArray(value?.messages) ? value.messages : [];
      for (const message of messages) {
        const msg = asRecord(message);
        if (String(msg?.type ?? '') !== 'text') continue;
        const textObj = asRecord(msg?.text);
        const text = String(textObj?.body ?? '').trim();
        const from = String(msg?.from ?? '').trim();
        if (!phoneNumberId || !businessPhone || !from || !text) continue;
        out.push({
          phoneNumberId,
          businessPhone,
          from,
          text,
          messageId: String(msg?.id ?? '').trim() || undefined,
        });
      }
    }
  }

  return out;
}

export async function dispatchInboundWhatsAppMessages(
  messages: InboundWhatsAppMessage[],
): Promise<{ processed: number }> {
  if (messages.length === 0) return { processed: 0 };

  const businessPhones = [
    ...new Set(
      messages
        .map((m) => normalizeE164Phone(m.businessPhone) ?? m.businessPhone.trim())
        .filter(Boolean),
    ),
  ];

  const activeWorkflows = await prisma.automationWorkflow.findMany({
    where: { status: 'active' },
    orderBy: [{ userId: 'asc' }, { id: 'asc' }],
  });

  const workflows =
    businessPhones.length > 0
      ? activeWorkflows.filter((workflow) => {
          const appPhone = workflowBusinessPhone(workflow);
          if (!appPhone) return false;
          return businessPhones.some((bp) => phonesMatch(bp, appPhone));
        })
      : [];

  let processed = 0;
  for (const inbound of messages) {
    const messageId = inbound.messageId?.trim();
    const dedupReserved = messageId ? await claimInboundWhatsAppMessage(messageId) : true;
    if (!dedupReserved) continue;

    const workflow = selectWorkflowForInbound(inbound, workflows);
    if (!workflow) {
      if (messageId) await releaseInboundWhatsAppMessage(messageId);
      continue;
    }

    let handlingSucceeded = false;
    try {
      const handled = await handleWorkflowInboundMessage(workflow, inbound);
      if (handled) {
        handlingSucceeded = true;
        processed += 1;
      }
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      console.error(`[whatsapp-inbound] workflow ${workflow.id} failed`, detail);
      try {
        await recordInboundRun(workflow.id, 'failed', `buyer_questions failed: ${detail}`);
      } catch (recordErr) {
        console.error(`[whatsapp-inbound] run record failed for ${workflow.id}`, recordErr);
      }
    }

    if (messageId && !handlingSucceeded) {
      await releaseInboundWhatsAppMessage(messageId);
    }
  }

  return { processed };
}
