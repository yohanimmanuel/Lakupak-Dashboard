import { prisma } from '@/lib/db';
import { readCompletion } from '@/lib/salesJobs/completion';
import { addDaysToDateKey, DEFAULT_JOB_TIMEZONE, zonedDayRange, zonedParts } from '@/lib/salesJobs/time';
import {
  isWhatsAppCloudConfigured,
  isWhatsAppTemplateError,
  resolveWhatsAppCloudCredentials,
  sendReplyButtons,
  sendTemplateMessage,
  sendTextMessage,
  toWhatsAppCloudRecipient,
} from '@/lib/whatsapp/cloudApi';

export type SalesJobWhatsAppAction = 'order_placed' | 'no_order' | 'reschedule' | 'amount';

/** Provider-neutral reply. Swap the parser, not the job update. */
export type SalesJobWhatsAppReply = {
  jobId?: string;
  fromPhone?: string;
  /** Inbound WhatsApp message id, when the provider sent one. */
  inboundMessageId?: string;
  /** Original text that produced this structured reply. Button taps omit it. */
  sourceText?: string;
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
  /** Rep display name, used as the greeting parameter in the assignment template. */
  agentName?: string;
  /** One-line job summary, used as the detail parameter in the assignment template. */
  jobSummary?: string;
  /**
   * The same job goes to several reps. A delivery failure for one of them must
   * not reset the job, so the status webhook only records it.
   */
  sharedSend?: boolean;
  /** Replaces the default assignment text. Reply buttons stay on the message. */
  body?: string;
  /** Reply language. One language only. */
  locale?: 'en' | 'id';
  /** Report buttons. The first job list leaves this off. */
  withButtons?: boolean;
};

const BUTTON_ID = /^sj:([0-9a-f-]{36}):(order_placed|no_order|reschedule)$/i;

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

export function salesJobTypeLabelId(jobType: string): string {
  switch (jobType) {
    case 'take_order':
      return 'Ambil pesanan';
    case 'collect_payment':
      return 'Tagih pembayaran';
    case 'promote_product':
      return 'Promosikan produk';
    case 'stock_check':
      return 'Cek stok';
    case 'prospect_new_outlet':
      return 'Prospek outlet baru';
    case 'returns_pickup':
      return 'Jemput retur';
    case 'competitor_intel':
      return 'Cek pesaing';
    case 'new_product_activation':
      return 'Aktivasi produk baru';
    case 'scheme_reconciliation':
      return 'Rekonsiliasi skema';
    default:
      return salesJobTypeLabel(jobType);
  }
}

export function salesJobTypeLabel(jobType: string): string {
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
    case 'returns_pickup':
      return 'Pick up return';
    case 'competitor_intel':
      return 'Competitor check';
    case 'new_product_activation':
      return 'Activate new product';
    case 'scheme_reconciliation':
      return 'Reconcile scheme';
    default:
      return jobType;
  }
}

function messageBody(job: DispatchJobInput): string {
  const locale = job.locale === 'id' ? 'id' : 'en';
  const jobLabel = locale === 'id' ? salesJobTypeLabelId(job.jobType) : salesJobTypeLabel(job.jobType);
  const lines = [job.clientName, jobLabel].filter(Boolean);
  if (job.priorityReason) lines.push(job.priorityReason);
  if (job.suggestedProductNames.length > 0) {
    lines.push(
      locale === 'id'
        ? `Produk: ${job.suggestedProductNames.join(', ')}`
        : `Products: ${job.suggestedProductNames.join(', ')}`,
    );
  }
  return lines.join('\n');
}

function replyButtons(job: DispatchJobInput): { id: string; title: string }[] {
  const titles =
    job.locale === 'id'
      ? (['Ada pesanan', 'Tidak ada order', 'Jadwal ulang'] as const)
      : (['Order placed', 'No order', 'Reschedule'] as const);
  return [
    { id: `sj:${job.id}:order_placed`, title: titles[0] },
    { id: `sj:${job.id}:no_order`, title: titles[1] },
    { id: `sj:${job.id}:reschedule`, title: titles[2] },
  ];
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
  const body = job.body?.trim() || messageBody(job);
  const callbackData = job.sharedSend ? `sj:${job.id}:shared` : `sj:${job.id}`;
  if (!job.withButtons) {
    // Business-initiated sends: Meta only delivers free-form text inside the
    // 24 hour window after the rep last messaged us. An approved template is
    // delivered any time, so assignments try the template first and fall back
    // to text only when the template does not exist or is not approved yet.
    const repName = job.agentName?.trim();
    if (repName) {
      try {
        const sent = await sendTemplateMessage({
          accessToken: creds.accessToken,
          phoneNumberId: creds.phoneNumberId,
          to: job.agentPhone,
          templateName: process.env.WHATSAPP_SALES_JOB_TEMPLATE?.trim() || 'sales_job_assignment',
          languageCode: job.locale === 'id' ? 'id' : 'en_US',
          bodyParams: [
            repName,
            job.jobSummary?.trim() ||
              [job.clientName, job.locale === 'id' ? salesJobTypeLabelId(job.jobType) : salesJobTypeLabel(job.jobType)]
                .filter(Boolean)
                .join(' - '),
          ],
          bizOpaqueCallbackData: callbackData,
        });
        return { messageId: sent.messageId };
      } catch (err) {
        if (!isWhatsAppTemplateError(err)) throw err;
      }
    }
    const sent = await sendTextMessage({
      accessToken: creds.accessToken,
      phoneNumberId: creds.phoneNumberId,
      to: job.agentPhone,
      body,
      bizOpaqueCallbackData: callbackData,
    });
    return { messageId: sent.messageId };
  }
  const buttons = replyButtons(job);
  const fallbackChoices =
    job.locale === 'id' ? '1 Ada pesanan\n2 Tidak ada order\n3 Jadwal ulang' : '1 Order placed\n2 No order\n3 Reschedule';
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
      body: `${body}\n${fallbackChoices}`,
      bizOpaqueCallbackData: callbackData,
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
  if (/^(1\b|order placed|ada order|ada pesanan|order masuk)/.test(normalized)) return 'order_placed';
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
          const inboundMessageId = String(msg.id ?? '').trim();
          replies.push({
            jobId: buttonMatch[1],
            fromPhone: from,
            inboundMessageId: inboundMessageId || undefined,
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
        const inboundMessageId = String(msg.id ?? '').trim();
        replies.push({
          fromPhone: from,
          inboundMessageId: inboundMessageId || undefined,
          sourceText: text,
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
        status: 'pending',
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
