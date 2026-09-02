import { randomUUID } from 'node:crypto';

import { getRedisClient } from '@/lib/redis';

const OUTBOUND_TTL_SECONDS = 86_400;
const OUTBOUND_SEND_LOCK_TTL_SECONDS = 120;
const SUBMITTING_WAIT_MS = 90_000;
const OUTBOUND_INDEX_WRITE_RETRIES = 3;
const OUTBOUND_INDEX_WRITE_RETRY_MS = 50;
const MEMORY_OUTBOUND_MAX_ENTRIES = 5_000;
export const CS_OUTBOUND_CALLBACK_PREFIX = 'laku-cs-out:';

export type WhatsAppCsOutboundDeliveryState =
  | 'pending'
  | 'submitting'
  | 'indeterminate'
  | 'sent'
  | 'failed';

export class WhatsAppCsOutboundInProgressError extends Error {
  constructor(
    message = 'WhatsApp outbound delivery is still in progress. Retry shortly.',
  ) {
    super(message);
    this.name = 'WhatsAppCsOutboundInProgressError';
  }
}

export type WhatsAppCsOutboundRecord = {
  idempotencyKey: string;
  workflowId: string;
  buyerPhone: string;
  body: string;
  deliveryState: WhatsAppCsOutboundDeliveryState;
  providerMessageId?: string;
  sessionHistoryAppended: boolean;
  createdAt: string;
  updatedAt: string;
  error?: string;
};

const memoryOutbound = new Map<string, { value: WhatsAppCsOutboundRecord; expiresAt: number }>();
const memoryOutboundIndex = new Map<string, { idempotencyKey: string; expiresAt: number }>();
const memoryOutboundSendLocks = new Map<string, number>();

function outboundRecordKey(idempotencyKey: string): string {
  return `lakupak:wa-cs-out:${idempotencyKey.trim()}`;
}

function outboundSendLockKey(idempotencyKey: string): string {
  return `lakupak:wa-cs-out-send-lock:${idempotencyKey.trim()}`;
}

function outboundIndexKey(workflowId: string, buyerPhone: string): string {
  return `lakupak:wa-cs-out-index:${workflowId}:${buyerPhone.replace(/\D/g, '')}`;
}

function normalizeOutboundRecord(
  raw: Partial<WhatsAppCsOutboundRecord> | null | undefined,
): WhatsAppCsOutboundRecord | null {
  const idempotencyKey = String(raw?.idempotencyKey ?? '').trim();
  const workflowId = String(raw?.workflowId ?? '').trim();
  const buyerPhone = String(raw?.buyerPhone ?? '').trim();
  const body = String(raw?.body ?? '').trim();
  if (!idempotencyKey || !workflowId || !buyerPhone || !body) return null;

  const deliveryState =
    raw?.deliveryState === 'sent' ||
    raw?.deliveryState === 'failed' ||
    raw?.deliveryState === 'submitting' ||
    raw?.deliveryState === 'indeterminate'
      ? raw.deliveryState
      : 'pending';

  return {
    idempotencyKey,
    workflowId,
    buyerPhone,
    body,
    deliveryState,
    providerMessageId:
      typeof raw?.providerMessageId === 'string' ? raw.providerMessageId : undefined,
    sessionHistoryAppended: Boolean(raw?.sessionHistoryAppended),
    createdAt:
      typeof raw?.createdAt === 'string' ? raw.createdAt : new Date().toISOString(),
    updatedAt:
      typeof raw?.updatedAt === 'string' ? raw.updatedAt : new Date().toISOString(),
    error: typeof raw?.error === 'string' ? raw.error : undefined,
  };
}

function pruneMemoryOutbound(now: number): void {
  for (const [key, row] of memoryOutbound) {
    if (row.expiresAt <= now) memoryOutbound.delete(key);
  }
  for (const [key, row] of memoryOutboundIndex) {
    if (row.expiresAt <= now) memoryOutboundIndex.delete(key);
  }
}

function enforceMemoryOutboundLimit(): void {
  while (memoryOutbound.size >= MEMORY_OUTBOUND_MAX_ENTRIES) {
    const oldestKey = memoryOutbound.keys().next().value;
    if (oldestKey === undefined) break;
    memoryOutbound.delete(oldestKey);
  }
}

function readMemoryOutbound(idempotencyKey: string): WhatsAppCsOutboundRecord | null {
  const key = outboundRecordKey(idempotencyKey);
  const row = memoryOutbound.get(key);
  if (!row) return null;
  if (Date.now() > row.expiresAt) {
    memoryOutbound.delete(key);
    return null;
  }
  return normalizeOutboundRecord(row.value);
}

function writeMemoryOutbound(record: WhatsAppCsOutboundRecord): void {
  const now = Date.now();
  pruneMemoryOutbound(now);
  enforceMemoryOutboundLimit();
  const expiresAt = now + OUTBOUND_TTL_SECONDS * 1000;
  memoryOutbound.set(outboundRecordKey(record.idempotencyKey), { value: record, expiresAt });
  if (!record.sessionHistoryAppended) {
    memoryOutboundIndex.set(outboundIndexKey(record.workflowId, record.buyerPhone), {
      idempotencyKey: record.idempotencyKey,
      expiresAt,
    });
  } else {
    memoryOutboundIndex.delete(outboundIndexKey(record.workflowId, record.buyerPhone));
  }
}

export function buildCsOutboundCallbackData(idempotencyKey: string): string {
  return `${CS_OUTBOUND_CALLBACK_PREFIX}${idempotencyKey.trim()}`.slice(0, 200);
}

export function parseCsOutboundCallbackData(raw: string | null | undefined): string | null {
  const value = String(raw ?? '').trim();
  if (!value.startsWith(CS_OUTBOUND_CALLBACK_PREFIX)) return null;
  const key = value.slice(CS_OUTBOUND_CALLBACK_PREFIX.length).trim();
  return key || null;
}

export async function acquireWhatsAppCsOutboundSendLock(idempotencyKey: string): Promise<boolean> {
  const id = idempotencyKey.trim();
  if (!id) return false;

  const key = outboundSendLockKey(id);
  const redis = getRedisClient();
  if (redis) {
    try {
      const result = await redis.set(key, '1', 'EX', OUTBOUND_SEND_LOCK_TTL_SECONDS, 'NX');
      return result === 'OK';
    } catch {
      // fall through
    }
  }

  const now = Date.now();
  const expiresAt = memoryOutboundSendLocks.get(key);
  if (expiresAt != null && expiresAt > now) return false;
  memoryOutboundSendLocks.set(key, now + OUTBOUND_SEND_LOCK_TTL_SECONDS * 1000);
  return true;
}

export async function releaseWhatsAppCsOutboundSendLock(idempotencyKey: string): Promise<void> {
  const id = idempotencyKey.trim();
  if (!id) return;

  const key = outboundSendLockKey(id);
  const redis = getRedisClient();
  if (redis) {
    try {
      await redis.del(key);
      return;
    } catch {
      // fall through
    }
  }
  memoryOutboundSendLocks.delete(key);
}

function isConfirmedSent(record: WhatsAppCsOutboundRecord): boolean {
  return record.deliveryState === 'sent' && Boolean(record.providerMessageId?.trim());
}

export async function prepareWhatsAppCsOutboundSend(
  record: WhatsAppCsOutboundRecord,
): Promise<{ record: WhatsAppCsOutboundRecord; shouldSend: boolean; messageId?: string }> {
  let current = (await loadWhatsAppCsOutboundRecord(record.idempotencyKey)) ?? record;

  if (isConfirmedSent(current)) {
    return { record: current, shouldSend: false, messageId: current.providerMessageId };
  }

  if (current.deliveryState === 'submitting' || current.deliveryState === 'indeterminate') {
    const ageMs = Date.now() - new Date(current.updatedAt).getTime();
    if (current.providerMessageId) {
      const reconciled: WhatsAppCsOutboundRecord = {
        ...current,
        deliveryState: 'sent',
        error: undefined,
        updatedAt: new Date().toISOString(),
      };
      await saveWhatsAppCsOutboundRecord(reconciled);
      return {
        record: reconciled,
        shouldSend: false,
        messageId: reconciled.providerMessageId,
      };
    }
    if (ageMs < SUBMITTING_WAIT_MS) {
      throw new WhatsAppCsOutboundInProgressError(
        current.deliveryState === 'indeterminate'
          ? 'WhatsApp delivery result is uncertain. Waiting for provider confirmation before retrying.'
          : undefined,
      );
    }
  }

  const acquired = await acquireWhatsAppCsOutboundSendLock(current.idempotencyKey);
  if (!acquired) {
    current = (await loadWhatsAppCsOutboundRecord(record.idempotencyKey)) ?? current;
    if (isConfirmedSent(current)) {
      return { record: current, shouldSend: false, messageId: current.providerMessageId };
    }
    throw new WhatsAppCsOutboundInProgressError();
  }

  current = (await loadWhatsAppCsOutboundRecord(record.idempotencyKey)) ?? current;
  if (isConfirmedSent(current)) {
    await releaseWhatsAppCsOutboundSendLock(current.idempotencyKey);
    return { record: current, shouldSend: false, messageId: current.providerMessageId };
  }

  const canSend =
    current.deliveryState === 'pending' ||
    current.deliveryState === 'failed' ||
    current.deliveryState === 'indeterminate' ||
    (current.deliveryState === 'submitting' &&
      Date.now() - new Date(current.updatedAt).getTime() >= SUBMITTING_WAIT_MS);

  if (!canSend) {
    await releaseWhatsAppCsOutboundSendLock(current.idempotencyKey);
    throw new WhatsAppCsOutboundInProgressError();
  }

  const submitting: WhatsAppCsOutboundRecord = {
    ...current,
    deliveryState: 'submitting',
    error: undefined,
    updatedAt: new Date().toISOString(),
  };
  await saveWhatsAppCsOutboundRecord(submitting);
  return { record: submitting, shouldSend: true };
}

export async function reconcileWhatsAppCsOutboundFromStatus(args: {
  bizOpaqueCallbackData?: string | null;
  providerMessageId: string;
  status: string;
}): Promise<boolean> {
  const idempotencyKey = parseCsOutboundCallbackData(args.bizOpaqueCallbackData);
  const providerMessageId = args.providerMessageId.trim();
  if (!idempotencyKey || !providerMessageId) return false;

  const record = await loadWhatsAppCsOutboundRecord(idempotencyKey);
  if (!record) return false;

  if (args.status === 'failed') {
    const confirmedId = record.providerMessageId?.trim();
    if (isConfirmedSent(record) && confirmedId && confirmedId !== providerMessageId) {
      // Stale failure for a different provider message — keep confirmed send intact.
      return false;
    }
    await saveWhatsAppCsOutboundRecord({
      ...record,
      deliveryState: 'failed',
      providerMessageId,
      error: 'WhatsApp provider reported delivery failure.',
      updatedAt: new Date().toISOString(),
    });
    await releaseWhatsAppCsOutboundSendLock(idempotencyKey);
    return true;
  }

  if (args.status === 'sent' || args.status === 'delivered' || args.status === 'read') {
    if (isConfirmedSent(record) && record.providerMessageId === providerMessageId) {
      return true;
    }
    await saveWhatsAppCsOutboundRecord({
      ...record,
      deliveryState: 'sent',
      providerMessageId,
      error: undefined,
      updatedAt: new Date().toISOString(),
    });
    await releaseWhatsAppCsOutboundSendLock(idempotencyKey);
    return true;
  }

  return false;
}

export async function loadWhatsAppCsOutboundRecord(
  idempotencyKey: string,
): Promise<WhatsAppCsOutboundRecord | null> {
  const id = idempotencyKey.trim();
  if (!id) return null;

  const key = outboundRecordKey(id);
  const redis = getRedisClient();
  if (redis) {
    try {
      const raw = await redis.get(key);
      if (!raw) return readMemoryOutbound(id);
      return normalizeOutboundRecord(JSON.parse(raw) as Partial<WhatsAppCsOutboundRecord>);
    } catch {
      return readMemoryOutbound(id);
    }
  }
  return readMemoryOutbound(id);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/** Persist recovery index to Redis. Throws on failure (caller retries / fails the save). */
async function writeRedisOutboundIndex(
  redis: NonNullable<ReturnType<typeof getRedisClient>>,
  record: WhatsAppCsOutboundRecord,
): Promise<void> {
  const indexKey = outboundIndexKey(record.workflowId, record.buyerPhone);
  if (record.sessionHistoryAppended) {
    await redis.del(indexKey);
    return;
  }
  await redis.setex(indexKey, OUTBOUND_TTL_SECONDS, record.idempotencyKey);
}

async function writeRedisOutboundIndexWithRetry(
  redis: NonNullable<ReturnType<typeof getRedisClient>>,
  record: WhatsAppCsOutboundRecord,
): Promise<void> {
  let lastError: unknown;
  for (let attempt = 0; attempt < OUTBOUND_INDEX_WRITE_RETRIES; attempt += 1) {
    try {
      await writeRedisOutboundIndex(redis, record);
      return;
    } catch (err) {
      lastError = err;
      if (attempt + 1 < OUTBOUND_INDEX_WRITE_RETRIES) {
        await sleep(OUTBOUND_INDEX_WRITE_RETRY_MS * (attempt + 1));
      }
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error('Failed to write WhatsApp CS outbound recovery index.');
}

export async function saveWhatsAppCsOutboundRecord(
  record: WhatsAppCsOutboundRecord,
): Promise<void> {
  const normalized = normalizeOutboundRecord(record);
  if (!normalized) {
    throw new Error('Invalid WhatsApp CS outbound record.');
  }

  const key = outboundRecordKey(normalized.idempotencyKey);
  const withTimestamp: WhatsAppCsOutboundRecord = {
    ...normalized,
    updatedAt: new Date().toISOString(),
  };
  const payload = JSON.stringify(withTimestamp);

  const redis = getRedisClient();
  if (redis) {
    let recordWritten = false;
    try {
      await redis.setex(key, OUTBOUND_TTL_SECONDS, payload);
      recordWritten = true;
      await writeRedisOutboundIndexWithRetry(redis, withTimestamp);
      // Mirror both keys into process memory only after Redis record + index succeed.
      writeMemoryOutbound(withTimestamp);
      return;
    } catch (err) {
      if (recordWritten) {
        // Record exists without a durable recovery index — surface failure so callers
        // retry. Keep a best-effort memory mirror for same-process recovery only.
        writeMemoryOutbound(withTimestamp);
        throw err instanceof Error
          ? err
          : new Error('Failed to persist WhatsApp CS outbound recovery index.');
      }
      // Record write failed — fall through to fully consistent in-memory path.
    }
  }
  writeMemoryOutbound(withTimestamp);
}

export async function findRecoverableWhatsAppCsOutbound(args: {
  workflowId: string;
  buyerPhone: string;
  body: string;
}): Promise<WhatsAppCsOutboundRecord | null> {
  const body = args.body.trim();
  if (!body) return null;

  const indexKey = outboundIndexKey(args.workflowId, args.buyerPhone);
  let idempotencyKey: string | null = null;

  const redis = getRedisClient();
  if (redis) {
    try {
      idempotencyKey = (await redis.get(indexKey))?.trim() || null;
    } catch {
      const row = memoryOutboundIndex.get(indexKey);
      if (row && row.expiresAt > Date.now()) idempotencyKey = row.idempotencyKey;
    }
  } else {
    const row = memoryOutboundIndex.get(indexKey);
    if (row && row.expiresAt > Date.now()) idempotencyKey = row.idempotencyKey;
  }

  if (!idempotencyKey) return null;

  const record = await loadWhatsAppCsOutboundRecord(idempotencyKey);
  if (!record) return null;
  if (record.sessionHistoryAppended) return null;
  if (record.workflowId !== args.workflowId || record.buyerPhone !== args.buyerPhone) return null;
  if (record.body !== body) return null;
  return record;
}

export function createWhatsAppCsOutboundRecord(args: {
  idempotencyKey?: string;
  workflowId: string;
  buyerPhone: string;
  body: string;
}): WhatsAppCsOutboundRecord {
  const now = new Date().toISOString();
  return {
    idempotencyKey: args.idempotencyKey?.trim() || randomUUID(),
    workflowId: args.workflowId,
    buyerPhone: args.buyerPhone,
    body: args.body,
    deliveryState: 'pending',
    sessionHistoryAppended: false,
    createdAt: now,
    updatedAt: now,
  };
}

export function sessionIncludesAppendedDelivery(
  appendedKeys: string[] | undefined,
  idempotencyKey: string,
): boolean {
  const key = idempotencyKey.trim();
  if (!key) return false;
  return (appendedKeys ?? []).includes(key);
}
