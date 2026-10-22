import { prisma } from '@/lib/db';
import { reconcileWhatsAppCsOutboundFromStatus } from '@/lib/automations/whatsappCsOutbound';
import { allSharedDeliveriesFailed, lockSalesJob, readSharedDelivery, withSharedDelivery } from '@/lib/salesJobs/sharedDelivery';

type JsonRecord = Record<string, unknown>;

export type WhatsAppStatusWebhookEvent = {
  providerMessageId: string;
  status: string;
  bizOpaqueCallbackData?: string;
  recipientId?: string;
  errorCode?: number;
  errorMessage?: string;
};

function asRecord(value: unknown): JsonRecord | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as JsonRecord;
}

export function parseWhatsAppWebhookStatuses(body: unknown): WhatsAppStatusWebhookEvent[] {
  const root = asRecord(body);
  const entries = Array.isArray(root?.entry) ? root.entry : [];
  const out: WhatsAppStatusWebhookEvent[] = [];

  for (const entry of entries) {
    const entryRow = asRecord(entry);
    const changes = Array.isArray(entryRow?.changes) ? entryRow.changes : [];
    for (const change of changes) {
      const changeRow = asRecord(change);
      const value = asRecord(changeRow?.value);
      const statuses = Array.isArray(value?.statuses) ? value.statuses : [];
      for (const statusRow of statuses) {
        const row = asRecord(statusRow);
        const providerMessageId = String(row?.id ?? '').trim();
        const status = String(row?.status ?? '').trim().toLowerCase();
        if (!providerMessageId || !status) continue;
        const errors = Array.isArray(row?.errors) ? row.errors : [];
        const firstError = asRecord(errors[0]);
        const errorData = asRecord(firstError?.error_data);
        out.push({
          providerMessageId,
          status,
          bizOpaqueCallbackData:
            typeof row?.biz_opaque_callback_data === 'string'
              ? row.biz_opaque_callback_data
              : undefined,
          recipientId:
            typeof row?.recipient_id === 'string' ? row.recipient_id : undefined,
          errorCode: typeof firstError?.code === 'number' ? firstError.code : undefined,
          errorMessage:
            String(errorData?.details ?? firstError?.message ?? firstError?.title ?? '').trim() || undefined,
        });
      }
    }
  }

  return out;
}

function deliveryFailureNote(event: WhatsAppStatusWebhookEvent): string {
  const reason =
    event.errorCode === 131047
      ? 'Recipient has not messaged us in the last 24 hours, and the message was not a template'
      : event.errorCode === 131030
        ? 'Recipient phone number not in allowed list'
        : event.errorMessage || 'Message could not be delivered';
  return `WhatsApp delivery failed: ${reason}${event.errorCode ? ` (#${event.errorCode})` : ''}`;
}

/**
 * Sales job sends carry an `sj:{jobId}` callback. Meta reports delivery failure
 * only here, never on the send call, so without this the job would stay
 * "dispatched" forever even though the rep never received anything.
 * A `sj:{jobId}:shared` send went to several reps, so one failure is only
 * noted and the job stays dispatched for the reps who did receive it. Once
 * every sent message has failed, the job goes back to pending.
 */
async function recordSalesJobDeliveryFailure(event: WhatsAppStatusWebhookEvent): Promise<boolean> {
  if (event.status !== 'failed') return false;
  if (!event.bizOpaqueCallbackData?.startsWith('sj:')) return false;
  const shared = /^sj:([0-9a-f-]{36}):shared$/i.exec(event.bizOpaqueCallbackData);
  if (shared) {
    const jobId = shared[1];
    return prisma.$transaction(async (tx) => {
      await lockSalesJob(tx, jobId);
      const job = await tx.salesJob.findUnique({
        where: { id: jobId },
        select: { status: true, dispatchNote: true, completionData: true },
      });
      if (!job) return false;
      const note = `${deliveryFailureNote(event)}${event.recipientId ? ` for +${event.recipientId}` : ''}`;
      const tracked = readSharedDelivery(job.completionData);
      const recipient = event.recipientId || event.providerMessageId;
      const delivery = tracked.failed.includes(recipient) ? tracked : { ...tracked, failed: [...tracked.failed, recipient] };
      const resetJob = job.status === 'dispatched' && allSharedDeliveriesFailed(delivery);
      await tx.salesJob.update({
        where: { id: jobId },
        data: {
          dispatchNote: job.dispatchNote?.includes(note)
            ? job.dispatchNote
            : job.dispatchNote
              ? `${job.dispatchNote}; ${note}`
              : note,
          completionData: withSharedDelivery(job.completionData, delivery),
          ...(resetJob ? { status: 'pending' as const, dispatchedAt: null } : {}),
        },
      });
      return true;
    });
  }
  const result = await prisma.salesJob.updateMany({
    where: { whatsappMessageId: event.providerMessageId, status: 'dispatched' },
    data: {
      status: 'pending',
      dispatchedAt: null,
      dispatchNote: deliveryFailureNote(event),
    },
  });
  return result.count > 0;
}

export async function dispatchWhatsAppStatusWebhooks(
  events: WhatsAppStatusWebhookEvent[],
): Promise<{ reconciled: number }> {
  let reconciled = 0;
  for (const event of events) {
    try {
      if (await recordSalesJobDeliveryFailure(event)) reconciled += 1;
      const ok = await reconcileWhatsAppCsOutboundFromStatus({
        bizOpaqueCallbackData: event.bizOpaqueCallbackData,
        providerMessageId: event.providerMessageId,
        status: event.status,
      });
      if (ok) reconciled += 1;
    } catch (err) {
      console.error('[whatsapp-status] reconcile failed', event.providerMessageId, err);
    }
  }
  return { reconciled };
}
