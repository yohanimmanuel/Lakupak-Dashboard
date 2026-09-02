import { reconcileWhatsAppCsOutboundFromStatus } from '@/lib/automations/whatsappCsOutbound';

type JsonRecord = Record<string, unknown>;

export type WhatsAppStatusWebhookEvent = {
  providerMessageId: string;
  status: string;
  bizOpaqueCallbackData?: string;
  recipientId?: string;
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
        out.push({
          providerMessageId,
          status,
          bizOpaqueCallbackData:
            typeof row?.biz_opaque_callback_data === 'string'
              ? row.biz_opaque_callback_data
              : undefined,
          recipientId:
            typeof row?.recipient_id === 'string' ? row.recipient_id : undefined,
        });
      }
    }
  }

  return out;
}

export async function dispatchWhatsAppStatusWebhooks(
  events: WhatsAppStatusWebhookEvent[],
): Promise<{ reconciled: number }> {
  let reconciled = 0;
  for (const event of events) {
    try {
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
