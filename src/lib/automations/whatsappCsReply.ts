import { prisma } from '@/lib/db';
import type { AutomationWorkflow } from '@/lib/prisma-generated';
import {
  loadBuyerCsSession,
  saveBuyerCsSession,
  withBuyerCsSessionLock,
  type BuyerCsSession,
} from '@/lib/automations/buyerCsSession';
import {
  buildCsOutboundCallbackData,
  createWhatsAppCsOutboundRecord,
  findRecoverableWhatsAppCsOutbound,
  loadWhatsAppCsOutboundRecord,
  prepareWhatsAppCsOutboundSend,
  releaseWhatsAppCsOutboundSendLock,
  saveWhatsAppCsOutboundRecord,
  sessionIncludesAppendedDelivery,
  type WhatsAppCsOutboundRecord,
} from '@/lib/automations/whatsappCsOutbound';
import {
  credentialsFromWhatsAppAppConfig,
  isIndeterminateWhatsAppSendError,
  normalizeE164Phone,
  sendTextMessage,
} from '@/lib/whatsapp/cloudApi';

type JsonRecord = Record<string, unknown>;

function canvasWhatsAppAppConfig(agentConfig: unknown): JsonRecord | null {
  const root = agentConfig as { __canvas?: { nodes?: Array<{ data?: { kind?: string; catalogType?: string; config?: JsonRecord } }> } };
  const node = root?.__canvas?.nodes?.find(
    (n) => n.data?.kind === 'app' && n.data?.catalogType === 'app_webhook',
  );
  return node?.data?.config ?? null;
}

async function deliverIdempotentWhatsAppCsOutbound(args: {
  workflowId: string;
  buyerPhone: string;
  outbound: string;
  idempotencyKey?: string;
  creds: { accessToken: string; phoneNumberId: string };
}): Promise<{ messageId: string; record: WhatsAppCsOutboundRecord }> {
  let record =
    (args.idempotencyKey
      ? await loadWhatsAppCsOutboundRecord(args.idempotencyKey)
      : null) ??
    (await findRecoverableWhatsAppCsOutbound({
      workflowId: args.workflowId,
      buyerPhone: args.buyerPhone,
      body: args.outbound,
    }));

  if (record) {
    if (record.workflowId !== args.workflowId || record.buyerPhone !== args.buyerPhone) {
      throw new Error('Idempotency key reused for a different conversation.');
    }
    if (record.body !== args.outbound) {
      throw new Error('Idempotency key reused for a different message body.');
    }
  } else {
    record = createWhatsAppCsOutboundRecord({
      idempotencyKey: args.idempotencyKey,
      workflowId: args.workflowId,
      buyerPhone: args.buyerPhone,
      body: args.outbound,
    });
    await saveWhatsAppCsOutboundRecord(record);
  }

  record = (await loadWhatsAppCsOutboundRecord(record.idempotencyKey)) ?? record;

  const prepared = await prepareWhatsAppCsOutboundSend(record);
  if (!prepared.shouldSend) {
    return {
      messageId: prepared.messageId ?? prepared.record.providerMessageId ?? '',
      record: prepared.record,
    };
  }

  record = prepared.record;
  const deliveryKey = record.idempotencyKey;

  try {
    const result = await sendTextMessage({
      accessToken: args.creds.accessToken,
      phoneNumberId: args.creds.phoneNumberId,
      to: args.buyerPhone,
      body: args.outbound,
      bizOpaqueCallbackData: buildCsOutboundCallbackData(deliveryKey),
    });

    record = {
      ...record,
      deliveryState: 'sent',
      providerMessageId: result.messageId,
      error: undefined,
      updatedAt: new Date().toISOString(),
    };
    await saveWhatsAppCsOutboundRecord(record);
    return { messageId: result.messageId, record };
  } catch (err) {
    if (isIndeterminateWhatsAppSendError(err)) {
      record = {
        ...record,
        deliveryState: 'indeterminate',
        error: err instanceof Error ? err.message : String(err),
        updatedAt: new Date().toISOString(),
      };
      await saveWhatsAppCsOutboundRecord(record);
      throw err;
    }

    record = {
      ...record,
      deliveryState: 'failed',
      error: err instanceof Error ? err.message : String(err),
      updatedAt: new Date().toISOString(),
    };
    await saveWhatsAppCsOutboundRecord(record);
    throw err;
  } finally {
    await releaseWhatsAppCsOutboundSendLock(deliveryKey);
  }
}

async function appendAgentReplyToSession(args: {
  workflowId: string;
  buyerPhone: string;
  session: BuyerCsSession;
  outbound: string;
  record: WhatsAppCsOutboundRecord;
}): Promise<BuyerCsSession> {
  const deliveryKey = args.record.idempotencyKey.trim();
  const appendedKeys = args.session.appendedAgentDeliveryKeys ?? [];

  if (
    args.record.sessionHistoryAppended ||
    sessionIncludesAppendedDelivery(appendedKeys, deliveryKey)
  ) {
    const current = await loadBuyerCsSession(args.workflowId, args.buyerPhone);
    if (!current) {
      throw new Error('No active CS session for this buyer.');
    }
    if (!args.record.sessionHistoryAppended) {
      await saveWhatsAppCsOutboundRecord({
        ...args.record,
        sessionHistoryAppended: true,
        updatedAt: new Date().toISOString(),
      });
    }
    return current;
  }

  const nextHistory: BuyerCsSession['history'] = [
    ...args.session.history,
    { role: 'assistant' as const, content: args.outbound },
  ];
  const nextAppendedKeys = [...appendedKeys, deliveryKey].slice(-24);

  const nextSession: BuyerCsSession = {
    ...args.session,
    history: nextHistory.slice(-12),
    appendedAgentDeliveryKeys: nextAppendedKeys,
    updatedAt: new Date().toISOString(),
  };

  await saveBuyerCsSession(args.workflowId, args.buyerPhone, nextSession);

  await saveWhatsAppCsOutboundRecord({
    ...args.record,
    sessionHistoryAppended: true,
    updatedAt: new Date().toISOString(),
  });

  return nextSession;
}

export async function getOwnedWhatsAppCsWorkflow(
  workflowId: string,
  userId: number,
): Promise<AutomationWorkflow | null> {
  return prisma.automationWorkflow.findFirst({
    where: { id: workflowId, userId },
  });
}

export function decodeBuyerPhoneParam(raw: string): string {
  const decoded = decodeURIComponent(raw.trim());
  return normalizeE164Phone(decoded) ?? decoded;
}

export async function sendWhatsAppCsAgentReply(args: {
  workflow: AutomationWorkflow;
  buyerPhone: string;
  text: string;
  senderName?: string;
  idempotencyKey?: string;
}): Promise<{ messageId: string; session: BuyerCsSession; idempotencyKey: string }> {
  const body = args.text.trim();
  if (!body) {
    throw new Error('Message text is required.');
  }

  const buyerPhone =
    normalizeE164Phone(args.buyerPhone) ??
    normalizeE164Phone(decodeURIComponent(args.buyerPhone));
  if (!buyerPhone) {
    throw new Error('Invalid buyer phone.');
  }

  return withBuyerCsSessionLock(args.workflow.id, buyerPhone, async () => {
    const session = await loadBuyerCsSession(args.workflow.id, buyerPhone);
    if (!session) {
      throw new Error('No active CS session for this buyer.');
    }
    if (session.csMode !== 'human') {
      throw new Error('This chat is not in human handoff mode.');
    }

    const appConfig = canvasWhatsAppAppConfig(args.workflow.agentConfig);
    const creds = credentialsFromWhatsAppAppConfig(appConfig);
    if (!creds?.accessToken || !creds.phoneNumberId) {
      throw new Error('WhatsApp Cloud API is not configured.');
    }

    const label = args.senderName?.trim() || session.assignedAgentName?.trim() || 'Sales agent';
    const outbound = `*${label}:* ${body}`;

    const { messageId, record } = await deliverIdempotentWhatsAppCsOutbound({
      workflowId: args.workflow.id,
      buyerPhone,
      outbound,
      idempotencyKey: args.idempotencyKey,
      creds,
    });

    const nextSession = await appendAgentReplyToSession({
      workflowId: args.workflow.id,
      buyerPhone,
      session,
      outbound,
      record,
    });

    return { messageId, session: nextSession, idempotencyKey: record.idempotencyKey };
  });
}

export async function releaseWhatsAppCsToAi(args: {
  workflow: AutomationWorkflow;
  buyerPhone: string;
}): Promise<BuyerCsSession> {
  const buyerPhone = normalizeE164Phone(args.buyerPhone);
  if (!buyerPhone) {
    throw new Error('Invalid buyer phone.');
  }

  return withBuyerCsSessionLock(args.workflow.id, buyerPhone, async () => {
    const session = await loadBuyerCsSession(args.workflow.id, buyerPhone);
    if (!session) {
      throw new Error('No active CS session for this buyer.');
    }
    if (session.csMode !== 'human') {
      return session;
    }

    const appConfig = canvasWhatsAppAppConfig(args.workflow.agentConfig);
    const creds = credentialsFromWhatsAppAppConfig(appConfig);

    const replyBody =
      session.replyLocale === 'id'
        ? 'Anda kembali chat dengan Laku AI di sini.'
        : 'You are back with Laku AI on this chat.';

    if (creds?.accessToken && creds.phoneNumberId) {
      await sendTextMessage({
        accessToken: creds.accessToken,
        phoneNumberId: creds.phoneNumberId,
        to: buyerPhone,
        body: replyBody,
      });
    }

    const nextHistory: BuyerCsSession['history'] = [
      ...session.history,
      { role: 'assistant' as const, content: replyBody },
    ];
    const nextSession: BuyerCsSession = {
      ...session,
      csMode: 'ai',
      handoffStage: 'none',
      buyerTerritory: undefined,
      assignedAgentId: undefined,
      assignedAgentName: undefined,
      handoffDone: false,
      history: nextHistory.slice(-12),
      updatedAt: new Date().toISOString(),
    };
    await saveBuyerCsSession(args.workflow.id, buyerPhone, nextSession);
    return nextSession;
  });
}
