import { prisma } from '@/lib/db';
import type { AutomationWorkflow } from '@/lib/prisma-generated';
import {
  runInboundBuyerCsAgent,
  buyerRequestedBackToAi,
  buyerRequestedHandoff,
} from '@/lib/automations/buyerCsAgent';
import {
  buildAssignAgentHandoffText,
  buildTerritoryAskPrompt,
  buildTerritoryRetryPrompt,
  listSalesRepTerritories,
  resolveSalesRepForTerritoryReply,
  type SalesRepAgent,
} from '@/lib/automations/assignAgentWhatsApp';
import {
  claimInboundWhatsAppMessage,
  createEmptyBuyerCsSession,
  loadBuyerCsSession,
  releaseInboundWhatsAppMessage,
  saveBuyerCsSession,
  withBuyerCsSessionLock,
  type BuyerCsSession,
  type CsMode,
  type HandoffStage,
} from '@/lib/automations/buyerCsSession';
import {
  notifyWhatsAppCsBuyerMessage,
  notifyWhatsAppCsHandoff,
} from '@/lib/automations/whatsappCsNotify';
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
  if (node?.data?.config) return node.data.config;

  if (workflow.actionType === actionType) {
    return asRecord(workflow.actionConfig) ?? null;
  }
  return null;
}

/** Detect a prior reply that already included sales-agent contact details. */
function sessionIncludesAgentContact(session: BuyerCsSession): boolean {
  if (session.csMode === 'human') return true;
  return session.history.some(
    (turn) =>
      turn.role === 'assistant' &&
      /\b(?:will reply to you here|membalas Anda di chat ini|Your sales agent is|sales agent is|WhatsApp or call|Hubungi|Contact:)\b/i.test(
        turn.content,
      ),
  );
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

async function completeSameChatHandoff(args: {
  workflow: AutomationWorkflow;
  session: BuyerCsSession;
  buyerPhone: string;
  buyerMessage: string;
  assignConfig: JsonRecord;
  territory: string;
  agent: SalesRepAgent;
  introLine?: string;
  locale?: 'en' | 'id';
}): Promise<{
  replyBody: string;
  session: BuyerCsSession;
  agentName: string;
  logLine: string;
  notifyHandoff: () => Promise<void>;
}> {
  const handoff = await buildAssignAgentHandoffText({
    userId: args.workflow.userId,
    workflowName: args.workflow.name,
    config: args.assignConfig,
    inline: true,
    sameChat: true,
    territory: args.territory,
    agent: args.agent,
    locale: args.locale,
  });

  const replyBody = args.introLine
    ? `${args.introLine}\n\n${handoff.body}`
    : handoff.body;

  const nextHistory: BuyerCsSession['history'] = [
    ...args.session.history,
    { role: 'user' as const, content: args.buyerMessage },
    { role: 'assistant' as const, content: replyBody },
  ].slice(-12);

  const nextSession: BuyerCsSession = {
    ...args.session,
    welcomed: args.session.welcomed,
    handoffDone: true,
    handoffStage: 'none',
    buyerTerritory: args.territory,
    replyLocale: args.session.replyLocale,
    csMode: 'human',
    assignedAgentId: handoff.agentId,
    assignedAgentName: handoff.agentName,
    history: nextHistory,
    updatedAt: new Date().toISOString(),
  };

  return {
    replyBody,
    session: nextSession,
    agentName: handoff.agentName,
    logLine: `assign_agent_whatsapp assigned ${handoff.agentName} (${args.territory}, same-chat)`,
    notifyHandoff: () =>
      notifyWhatsAppCsHandoff({
        userId: args.workflow.userId,
        workflowId: args.workflow.id,
        workflowName: args.workflow.name,
        buyerPhone: args.buyerPhone,
        agentName: handoff.agentName,
        buyerMessage: args.buyerMessage,
      }),
  };
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
    const session =
      (await loadBuyerCsSession(workflow.id, buyerPhone)) ?? createEmptyBuyerCsSession();

    const csWindowConfig = findActionConfig(workflow, 'cs_24h_window');
    const configuredLanguage = String(csWindowConfig?.csReplyLanguage ?? '').trim().toLowerCase();
    const replyLocale = configuredLanguage === 'id' ? 'id' : 'en';

    const parts: string[] = [`buyer_questions: replied to ${buyerPhone}`];
    let csMode: CsMode = session.csMode;
    let handoffStage: HandoffStage = session.handoffStage;
    let buyerTerritory = session.buyerTerritory;
    let assignedAgentId = session.assignedAgentId;
    let assignedAgentName = session.assignedAgentName;

    const assignConfig = findActionConfig(workflow, 'assign_agent_whatsapp');
    const escalate =
      String(csWindowConfig?.escalateOutOfScope ?? 'yes').trim() !==
      'no';

    if (session.csMode === 'human' && buyerRequestedBackToAi(text)) {
      const replyBody =
        replyLocale === 'id'
          ? 'Anda kembali chat dengan Laku AI di sini.'
          : 'You are back with Laku AI on this chat.';
      await sendTextMessage({
        accessToken: creds.accessToken,
        phoneNumberId: creds.phoneNumberId,
        to: buyerPhone,
        body: replyBody,
      });
      const releaseHistory: BuyerCsSession['history'] = [
        ...session.history,
        { role: 'user', content: text },
        { role: 'assistant', content: replyBody },
      ];
      const nextSession: BuyerCsSession = {
        ...session,
        csMode: 'ai',
        handoffStage: 'none',
        buyerTerritory: undefined,
        assignedAgentId: undefined,
        assignedAgentName: undefined,
        handoffDone: false,
        replyLocale,
        history: releaseHistory.slice(-12),
        updatedAt: new Date().toISOString(),
      };
      await saveBuyerCsSession(workflow.id, buyerPhone, nextSession);
      parts.push('buyer_cs: released back to AI');
      return { kind: 'success' as const, parts };
    }

    if (
      session.handoffStage === 'awaiting_territory' &&
      assignConfig &&
      escalate
    ) {
      const territories = await listSalesRepTerritories(workflow.userId);
      const matched = await resolveSalesRepForTerritoryReply(workflow.userId, text);
      let replyBody = '';

      if (matched) {
        try {
          const result = await completeSameChatHandoff({
            workflow,
            session,
            buyerPhone,
            buyerMessage: text,
            assignConfig,
            territory: matched.territory,
            agent: matched.agent,
            locale: replyLocale,
          });
          replyBody = result.replyBody;
          await sendTextMessage({
            accessToken: creds.accessToken,
            phoneNumberId: creds.phoneNumberId,
            to: buyerPhone,
            body: replyBody,
          });
          await saveBuyerCsSession(workflow.id, buyerPhone, {
            ...result.session,
            replyLocale,
          });
          void result.notifyHandoff().catch((err) => {
            const detail = err instanceof Error ? err.message : String(err);
            console.error('[whatsapp-inbound] CS handoff notify failed', detail);
          });
          parts.push(result.logLine);
          return { kind: 'success' as const, parts };
        } catch (err) {
          const detail = err instanceof Error ? err.message : String(err);
          parts.push(`assign_agent_whatsapp failed: ${detail}`);
          replyBody = buildTerritoryRetryPrompt(territories, replyLocale);
        }
      } else {
        replyBody = buildTerritoryRetryPrompt(territories, replyLocale);
        parts.push('assign_agent_whatsapp awaiting valid territory');
      }

      if (replyBody) {
        await sendTextMessage({
          accessToken: creds.accessToken,
          phoneNumberId: creds.phoneNumberId,
          to: buyerPhone,
          body: replyBody,
        });
      }

      const nextHistory: BuyerCsSession['history'] = [
        ...session.history,
        { role: 'user', content: text },
      ];
      if (replyBody) nextHistory.push({ role: 'assistant', content: replyBody });

      await saveBuyerCsSession(workflow.id, buyerPhone, {
        ...session,
        handoffStage: 'awaiting_territory',
        replyLocale,
        history: nextHistory.slice(-12),
        updatedAt: new Date().toISOString(),
      });
      return { kind: 'success' as const, parts };
    }

    const wantsHandoff = buyerRequestedHandoff(text);
    const canStartTerritoryHandoff =
      wantsHandoff &&
      assignConfig &&
      escalate &&
      session.csMode !== 'human' &&
      session.handoffStage !== 'awaiting_territory';

    if (canStartTerritoryHandoff) {
      const territories = await listSalesRepTerritories(workflow.userId);
      let replyBody = '';
      if (territories.length === 0) {
        replyBody =
          replyLocale === 'id'
            ? 'Maaf, belum ada sales rep yang tersedia untuk handoff saat ini. Coba lagi nanti atau tanyakan hal lain kepada saya.'
            : 'Sorry, no sales reps are available for handoff right now. Please try again later or ask me another question.';
        parts.push('assign_agent_whatsapp skipped: no sales rep territories');
      } else {
        replyBody = buildTerritoryAskPrompt(territories, replyLocale);
        handoffStage = 'awaiting_territory';
        parts.push('assign_agent_whatsapp asked buyer territory');
      }

      const territoryAskHistory: BuyerCsSession['history'] = [
        ...session.history,
        { role: 'user', content: text },
        { role: 'assistant', content: replyBody },
      ];

      await sendTextMessage({
        accessToken: creds.accessToken,
        phoneNumberId: creds.phoneNumberId,
        to: buyerPhone,
        body: replyBody,
      });

      await saveBuyerCsSession(workflow.id, buyerPhone, {
        ...session,
        handoffStage,
        handoffDone: false,
        buyerTerritory: undefined,
        assignedAgentId: undefined,
        assignedAgentName: undefined,
        replyLocale,
        history: territoryAskHistory.slice(-12),
        updatedAt: new Date().toISOString(),
      });
      return { kind: 'success' as const, parts };
    }

    if (session.csMode === 'human') {
      const nextHistory: BuyerCsSession['history'] = [
        ...session.history,
        { role: 'user', content: text },
      ];
      const nextSession: BuyerCsSession = {
        ...session,
        replyLocale,
        history: nextHistory.slice(-12),
        updatedAt: new Date().toISOString(),
      };
      await saveBuyerCsSession(workflow.id, buyerPhone, nextSession);
      await notifyWhatsAppCsBuyerMessage({
        userId: workflow.userId,
        workflowId: workflow.id,
        workflowName: workflow.name,
        buyerPhone,
        agentName: session.assignedAgentName,
        buyerMessage: text,
      });
      parts.push(
        `buyer_cs: human mode — waiting for agent${session.assignedAgentName ? ` (${session.assignedAgentName})` : ''}`,
      );
      return { kind: 'success' as const, parts };
    }

    const isWelcome = hasCs24hWindow(workflow) && !session.welcomed;
    const agentResult = await runInboundBuyerCsAgent({
      userId: workflow.userId,
      workflowName: workflow.name,
      nodes: canvasNodes(workflow),
      buyerMessage: text,
      conversationBuyerPhone: buyerPhone,
      isWelcome,
      locale: replyLocale,
      sessionReplyLocale: replyLocale,
      history: session.history,
    });

    if (agentResult.error) {
      const quotaHit = /free-models-per-day|daily.?limit|quota.?exhausted|rate.?limit/i.test(
        agentResult.error,
      );
      const fallbackBody =
        replyLocale === 'id'
          ? quotaHit
            ? 'Maaf, Laku AI sedang tidak tersedia saat ini (batas harian tercapai). Coba lagi nanti atau minta chat dengan sales agent.'
            : 'Maaf, Laku AI sedang tidak bisa merespons. Coba lagi sebentar atau minta chat dengan sales agent.'
          : quotaHit
            ? 'Sorry, Laku AI is temporarily unavailable (daily limit reached). Please try again later or ask to chat with a sales agent.'
            : 'Sorry, Laku AI could not respond right now. Please try again shortly or ask to chat with a sales agent.';

      await sendTextMessage({
        accessToken: creds.accessToken,
        phoneNumberId: creds.phoneNumberId,
        to: buyerPhone,
        body: fallbackBody,
      });

      const fallbackHistory: BuyerCsSession['history'] = [
        ...session.history,
        { role: 'user', content: text },
        { role: 'assistant', content: fallbackBody },
      ];
      await saveBuyerCsSession(workflow.id, buyerPhone, {
        ...session,
        replyLocale,
        history: fallbackHistory.slice(-12),
        updatedAt: new Date().toISOString(),
      });

      parts.push(`buyer_cs: AI failed (${agentResult.error.slice(0, 120)})`);
      return { kind: 'success' as const, parts };
    }

    let replyBody = (agentResult.reply ?? '').trim();

    if (agentResult.handoffRequested && !assignConfig) {
      replyBody =
        replyBody ||
        (replyLocale === 'id'
          ? 'Tentu! Tim kami akan follow up jika tersedia. Sementara itu, ada yang bisa saya bantu?'
          : 'Of course! A team member will follow up when available. What can I help you with in the meantime?');
      parts.push('buyer_cs: handoff requested but no assign_agent node');
    }

    let handoffDone = session.handoffDone;
    if (handoffDone && !sessionIncludesAgentContact(session)) {
      handoffDone = false;
    }

    if (agentResult.handoffRequested) {
      if (!escalate) {
        parts.push('assign_agent_whatsapp skipped: escalate disabled on cs_24h_window');
      } else if (!assignConfig) {
        parts.push('assign_agent_whatsapp skipped: no assign_agent_whatsapp node');
      } else if (handoffDone) {
        parts.push('assign_agent_whatsapp skipped: handoff already done this session');
      }
    }

    if (replyBody) {
      await sendTextMessage({
        accessToken: creds.accessToken,
        phoneNumberId: creds.phoneNumberId,
        to: buyerPhone,
        body: replyBody,
      });
    }

    const nextHistory: BuyerCsSession['history'] = [
      ...session.history,
      { role: 'user', content: text },
    ];
    if (replyBody) {
      nextHistory.push({ role: 'assistant', content: replyBody });
    }

    const nextSession: BuyerCsSession = {
      welcomed: session.welcomed || isWelcome,
      handoffDone,
      handoffStage,
      buyerTerritory,
      replyLocale,
      csMode,
      assignedAgentId,
      assignedAgentName,
      history: nextHistory.slice(-12),
      updatedAt: new Date().toISOString(),
    };

    await saveBuyerCsSession(workflow.id, buyerPhone, nextSession);
    return { kind: 'success' as const, parts };
  });

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
