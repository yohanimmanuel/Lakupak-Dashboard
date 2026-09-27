import { prisma } from '@/lib/db';
import { readCompletion } from '@/lib/salesJobs/completion';
import { addDaysToDateKey, DEFAULT_JOB_TIMEZONE, zonedDayRange, zonedParts } from '@/lib/salesJobs/time';
import {
  isWhatsAppCloudConfigured,
  resolveWhatsAppCloudCredentials,
  sendReplyButtons,
  sendTextMessage,
  toWhatsAppCloudRecipient,
} from '@/lib/whatsapp/cloudApi';

export type SalesJobWhatsAppAction = 'order_placed' | 'no_order' | 'reschedule' | 'amount';

/** Provider-neutral reply. Swap the parser, not the job update. */
export type SalesJobWhatsAppReply = {
  jobId?: string;
  fromPhone?: string;
  /** WhatsApp id of the outbound message this reply is answering. */
  contextMessageId?: string;
  action: SalesJobWhatsAppAction;
  amount?: number | null;
  note?: string | null;
};

export type DispatchJobInput = {
  id: string;
  jobType: string;
  priorityReason: string | null;
  clientName: string;
  suggestedProductNames: string[];
  agentPhone: string;
};

const BUTTON_ID = /^sj:([0-9a-f-]{36}):(order_placed|no_order|reschedule)$/i;

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function jobLabel(jobType: string): string {
  switch (jobType) {
    case 'take_order':
      return 'Take order';
    case 'collect_payment':
      return 'Collect payment';
    case 'promote_product':
      return 'Promote product';
    case 'stock_check':
      return 'Stock check';
    case 'prospect_new_outlet':
      return 'Prospect new outlet';
    default:
      return jobType;
  }
}

function messageBody(job: DispatchJobInput): string {
  const lines = [`${job.clientName}`, jobLabel(job.jobType)];
  if (job.priorityReason) lines.push(job.priorityReason);
  if (job.suggestedProductNames.length > 0) {
    lines.push(`Suggested: ${job.suggestedProductNames.join(', ')}`);
  }
  lines.push('Reply with a button, or send the order amount after Order Placed.');
  return lines.join('\n');
}

/**
 * Sends one job to the rep. Does not write the job row.
 * Callers mark the job dispatched only when this resolves.
 */
export async function dispatchJobToWhatsApp(job: DispatchJobInput): Promise<{ messageId: string }> {
  const creds = resolveWhatsAppCloudCredentials();
  if (!creds?.accessToken || !creds.phoneNumberId || !isWhatsAppCloudConfigured()) {
    throw new Error('WhatsApp is not configured');
  }
  const body = messageBody(job);
  const buttons = [
    { id: `sj:${job.id}:order_placed`, title: 'Order Placed' },
    { id: `sj:${job.id}:no_order`, title: 'No Order' },
    { id: `sj:${job.id}:reschedule`, title: 'Reschedule' },
  ];
  try {
    const sent = await sendReplyButtons({
      accessToken: creds.accessToken,
      phoneNumberId: creds.phoneNumberId,
      to: job.agentPhone,
      body,
      buttons,
    });
    return { messageId: sent.messageId };
  } catch {
    const sent = await sendTextMessage({
      accessToken: creds.accessToken,
      phoneNumberId: creds.phoneNumberId,
      to: job.agentPhone,
      body: `${body}\n1 Order Placed\n2 No Order\n3 Reschedule`,
      bizOpaqueCallbackData: `sj:${job.id}`,
    });
    return { messageId: sent.messageId };
  }
}

function parseAmount(text: string): number | null {
  const letters = text.replace(/[^a-zA-Z]/g, '');
  if (letters.length > 3) return null;
  const digits = text.replace(/\D/g, '');
  if (digits.length < 3 || digits.length > 12) return null;
  const amount = Number(digits);
  return Number.isFinite(amount) ? amount : null;
}

function actionFromText(text: string): SalesJobWhatsAppAction | null {
  const normalized = text.trim().toLowerCase();
  if (/^(1\b|order placed|ada order|order masuk)/.test(normalized)) return 'order_placed';
  if (/^(2\b|no order|tidak ada order|tidak order)/.test(normalized)) return 'no_order';
  if (/^(3\b|reschedule|jadwal ulang)/.test(normalized)) return 'reschedule';
  if (parseAmount(text) != null && lettersAreLight(text)) return 'amount';
  return null;
}

function lettersAreLight(text: string): boolean {
  return text.replace(/[^a-zA-Z]/g, '').length <= 3;
}

/** Reads Meta Cloud webhook bodies and the normalized `{ jobId, action }` test payload. */
export function parseSalesJobWhatsAppPayload(body: unknown): SalesJobWhatsAppReply[] {
  const root = asRecord(body);
  if (!root) return [];

  if (typeof root.action === 'string') {
    const action = root.action as SalesJobWhatsAppAction;
    if (!['order_placed', 'no_order', 'reschedule', 'amount'].includes(action)) return [];
    return [
      {
        jobId: typeof root.jobId === 'string' ? root.jobId : undefined,
        fromPhone: typeof root.fromPhone === 'string' ? root.fromPhone : undefined,
        action,
        amount: typeof root.amount === 'number' ? root.amount : null,
        note: typeof root.note === 'string' ? root.note : null,
      },
    ];
  }

  const entries = Array.isArray(root.entry) ? root.entry : [];
  const replies: SalesJobWhatsAppReply[] = [];
  for (const entry of entries) {
    const changes = Array.isArray(asRecord(entry)?.changes) ? (asRecord(entry)?.changes as unknown[]) : [];
    for (const change of changes) {
      const value = asRecord(asRecord(change)?.value);
      const messages = Array.isArray(value?.messages) ? value.messages : [];
      for (const message of messages) {
        const msg = asRecord(message);
        if (!msg) continue;
        const from = String(msg.from ?? '').trim();
        const interactive = asRecord(msg.interactive);
        const button = asRecord(interactive?.button_reply);
        const buttonId = String(button?.id ?? '');
        const buttonMatch = BUTTON_ID.exec(buttonId);
        if (buttonMatch) {
          replies.push({
            jobId: buttonMatch[1],
            fromPhone: from,
            action: buttonMatch[2].toLowerCase() as SalesJobWhatsAppAction,
            note: String(button?.title ?? ''),
          });
          continue;
        }
        const text = String(asRecord(msg.text)?.body ?? '').trim();
        if (!text) continue;
        const action = actionFromText(text);
        if (!action) continue;
        const contextId = String(asRecord(msg.context)?.id ?? '').trim();
        replies.push({
          fromPhone: from,
          contextMessageId: contextId || undefined,
          action,
          amount: action === 'amount' || action === 'order_placed' ? parseAmount(action === 'order_placed' ? text.replace(/^\s*1\s+/, '') : text) : null,
          note: action === 'order_placed' || action === 'no_order' ? text : null,
        });
      }
    }
  }
  return replies;
}

function phonesClose(a: string | null | undefined, b: string | null | undefined): boolean {
  const da = toWhatsAppCloudRecipient(a || '');
  const db = toWhatsAppCloudRecipient(b || '');
  if (da.length < 8 || db.length < 8) return false;
  return da.endsWith(db.slice(-8)) || db.endsWith(da.slice(-8));
}

async function findJobForReply(reply: SalesJobWhatsAppReply) {
  if (reply.jobId) {
    return prisma.salesJob.findUnique({
      where: { id: reply.jobId },
      include: { agent: { select: { phone: true } } },
    });
  }
  if (!reply.fromPhone) return null;
  const fromPhone = toWhatsAppCloudRecipient(reply.fromPhone);
  if (!fromPhone) return null;
  const agents = await prisma.salesAgent.findMany({
    where: { status: 'active' },
    select: { id: true, phone: true, userId: true },
  });
  const matchedAgents = agents.filter((agent) => toWhatsAppCloudRecipient(agent.phone || '') === fromPhone);
  const agentIds = matchedAgents.map((agent) => agent.id);
  if (agentIds.length === 0) return null;
  const include = { agent: { select: { phone: true as const } } };
  if (reply.contextMessageId) {
    const linked = await prisma.salesJob.findFirst({
      where: { assignedTo: { in: agentIds }, whatsappMessageId: reply.contextMessageId },
      include,
    });
    if (linked) return linked;
  }
  const distributorIds = Array.from(
    new Set(matchedAgents.map((agent) => agent.userId).filter((id): id is number => id != null)),
  );
  const settings = distributorIds.length
    ? await prisma.salesJobSettings.findMany({
        where: { distributorId: { in: distributorIds } },
        select: { distributorId: true, timezone: true },
      })
    : [];
  const timeZoneByDistributor = new Map(
    settings.map((row) => [row.distributorId, row.timezone || DEFAULT_JOB_TIMEZONE]),
  );
  const now = new Date();
  const dayFilters = distributorIds.map((distributorId) => {
    const timeZone = timeZoneByDistributor.get(distributorId) || DEFAULT_JOB_TIMEZONE;
    const today = zonedDayRange(zonedParts(now, timeZone).dateKey, timeZone);
    return {
      assignedTo: { in: matchedAgents.filter((agent) => agent.userId === distributorId).map((agent) => agent.id) },
      scheduledDate: { gte: today.start, lt: today.end },
    };
  });
  const unassignedIds = matchedAgents.filter((agent) => agent.userId == null).map((agent) => agent.id);
  if (unassignedIds.length > 0) {
    const today = zonedDayRange(zonedParts(now, DEFAULT_JOB_TIMEZONE).dateKey, DEFAULT_JOB_TIMEZONE);
    dayFilters.push({
      assignedTo: { in: unassignedIds },
      scheduledDate: { gte: today.start, lt: today.end },
    });
  }
  if (dayFilters.length === 0) return null;
  return prisma.salesJob.findFirst({
    where: {
      status: 'dispatched',
      OR: dayFilters,
    },
    include,
    orderBy: { scheduledDate: 'desc' },
  });
}

/** Applies a structured WhatsApp reply onto the matching job. Unanswered jobs stay dispatched. */
export async function handleWhatsAppReply(reply: SalesJobWhatsAppReply): Promise<{ handled: boolean; jobId?: string }> {
  const job = await findJobForReply(reply);
  if (!job) return { handled: false };
  if (reply.fromPhone && !phonesClose(job.agent.phone, reply.fromPhone) && !reply.jobId) {
    return { handled: false };
  }

  if (reply.action === 'amount') {
    const current = readCompletion(job.completionData);
    if (!current.order_placed || current.order_amount != null) return { handled: false };
    await prisma.salesJob.update({
      where: { id: job.id },
      data: {
        status: 'completed',
        completedAt: job.completedAt ?? new Date(),
        completionData: { ...current, order_amount: reply.amount ?? null },
      },
    });
    return { handled: true, jobId: job.id };
  }

  if (reply.action === 'reschedule') {
    const settings = await prisma.salesJobSettings.findUnique({ where: { distributorId: job.distributorId } });
    const timeZone = settings?.timezone || DEFAULT_JOB_TIMEZONE;
    const today = zonedParts(job.scheduledDate, timeZone).dateKey;
    const next = zonedDayRange(addDaysToDateKey(today, 1), timeZone).start;
    await prisma.salesJob.update({
      where: { id: job.id },
      data: {
        status: 'approved',
        scheduledDate: next,
        dispatchNote: 'Rescheduled from WhatsApp',
        dispatchedAt: null,
      },
    });
    return { handled: true, jobId: job.id };
  }

  const current = readCompletion(job.completionData);
  const orderPlaced = reply.action === 'order_placed';
  await prisma.salesJob.update({
    where: { id: job.id },
    data: {
      status: 'completed',
      completedAt: new Date(),
      completionNotes: reply.note?.trim() || job.completionNotes,
      completionData: {
        ...current,
        order_placed: orderPlaced,
        order_amount: orderPlaced ? reply.amount ?? current.order_amount : current.order_amount,
        notes: reply.note?.trim() || current.notes,
      },
    },
  });
  return { handled: true, jobId: job.id };
}
