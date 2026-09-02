import { randomUUID } from 'node:crypto';

import { getRedisClient } from '@/lib/redis';
import type Redis from 'ioredis';

const SESSION_TTL_SECONDS = 86_400; // WhatsApp 24h customer service window
const INBOUND_MSG_DEDUP_TTL_SECONDS = 86_400;
const SESSION_LOCK_TTL_SECONDS = 300;
const SESSION_LOCK_WAIT_MS = 120_000;
const SESSION_LOCK_RETRY_MS = 100;
const MEMORY_INBOUND_DEDUP_MAX_ENTRIES = 5_000;
const memorySessions = new Map<string, { value: BuyerCsSession; expiresAt: number }>();
const memoryInboundDedup = new Map<string, number>();
const memorySessionLockTails = new Map<string, Promise<void>>();

export type BuyerCsChatTurn = {
  role: 'user' | 'assistant';
  content: string;
};

export type CsMode = 'ai' | 'human';

export type HandoffStage = 'none' | 'awaiting_territory';

export type BuyerCsSession = {
  welcomed: boolean;
  handoffDone: boolean;
  handoffStage: HandoffStage;
  buyerTerritory?: string;
  /** Sticky reply language for this buyer chat (`en` | `id`). */
  replyLocale?: 'en' | 'id';
  /** When `human`, AI is paused and dashboard agents reply on the business number. */
  csMode: CsMode;
  assignedAgentId?: string;
  assignedAgentName?: string;
  /** Agent outbound delivery idempotency keys already reflected in history. */
  appendedAgentDeliveryKeys?: string[];
  history: BuyerCsChatTurn[];
  updatedAt: string;
};

export type BuyerCsConversationSummary = {
  buyerPhone: string;
  csMode: CsMode;
  assignedAgentId?: string;
  assignedAgentName?: string;
  lastMessagePreview: string;
  lastMessageAt: string;
};

export function normalizeBuyerCsSession(
  raw: Partial<BuyerCsSession> | null | undefined,
): BuyerCsSession {
  return {
    welcomed: Boolean(raw?.welcomed),
    handoffDone: Boolean(raw?.handoffDone),
    handoffStage: raw?.handoffStage === 'awaiting_territory' ? 'awaiting_territory' : 'none',
    buyerTerritory:
      typeof raw?.buyerTerritory === 'string' ? raw.buyerTerritory : undefined,
    replyLocale: raw?.replyLocale === 'id' || raw?.replyLocale === 'en' ? raw.replyLocale : undefined,
    csMode: raw?.csMode === 'human' ? 'human' : 'ai',
    assignedAgentId:
      typeof raw?.assignedAgentId === 'string' ? raw.assignedAgentId : undefined,
    assignedAgentName:
      typeof raw?.assignedAgentName === 'string' ? raw.assignedAgentName : undefined,
    appendedAgentDeliveryKeys: Array.isArray(raw?.appendedAgentDeliveryKeys)
      ? raw.appendedAgentDeliveryKeys
          .filter((key): key is string => typeof key === 'string' && key.trim().length > 0)
          .slice(-24)
      : undefined,
    history: Array.isArray(raw?.history) ? raw.history : [],
    updatedAt:
      typeof raw?.updatedAt === 'string' ? raw.updatedAt : new Date().toISOString(),
  };
}

export function createEmptyBuyerCsSession(): BuyerCsSession {
  return normalizeBuyerCsSession(null);
}

function sessionKey(workflowId: string, buyerPhone: string): string {
  return `lakupak:wa-cs:${workflowId}:${buyerPhone.replace(/\D/g, '')}`;
}

export function buyerCsSessionStorageKey(workflowId: string, buyerPhone: string): string {
  return sessionKey(workflowId, buyerPhone);
}

function readMemory(key: string): BuyerCsSession | null {
  const row = memorySessions.get(key);
  if (!row) return null;
  if (Date.now() > row.expiresAt) {
    memorySessions.delete(key);
    return null;
  }
  return row.value;
}

function writeMemory(key: string, session: BuyerCsSession): void {
  memorySessions.set(key, {
    value: session,
    expiresAt: Date.now() + SESSION_TTL_SECONDS * 1000,
  });
}

export async function loadBuyerCsSession(
  workflowId: string,
  buyerPhone: string,
): Promise<BuyerCsSession | null> {
  const key = sessionKey(workflowId, buyerPhone);
  const redis = getRedisClient();
  if (redis) {
    try {
      const raw = await redis.get(key);
      if (!raw) return null;
      return normalizeBuyerCsSession(JSON.parse(raw) as Partial<BuyerCsSession>);
    } catch {
      const fallback = readMemory(key);
      return fallback ? normalizeBuyerCsSession(fallback) : null;
    }
  }
  const stored = readMemory(key);
  return stored ? normalizeBuyerCsSession(stored) : null;}

export async function saveBuyerCsSession(
  workflowId: string,
  buyerPhone: string,
  session: BuyerCsSession,
): Promise<void> {
  const key = sessionKey(workflowId, buyerPhone);
  const payload = JSON.stringify({
    ...session,
    updatedAt: new Date().toISOString(),
  });
  const redis = getRedisClient();
  if (redis) {
    try {
      await redis.setex(key, SESSION_TTL_SECONDS, payload);
      return;
    } catch {
      // fall through
    }
  }
  writeMemory(key, JSON.parse(payload) as BuyerCsSession);
}

export async function clearBuyerCsSession(
  workflowId: string,
  buyerPhone: string,
): Promise<void> {
  const key = sessionKey(workflowId, buyerPhone);
  const redis = getRedisClient();
  if (redis) {
    try {
      await redis.del(key);
    } catch {
      // fall through
    }
  }
  memorySessions.delete(key);
}

function sessionLockKey(workflowId: string, buyerPhone: string): string {
  return `${sessionKey(workflowId, buyerPhone)}:lock`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function withMemorySessionLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const previous = memorySessionLockTails.get(key) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolve) => {
    release = resolve;
  });
  const tail = previous.catch(() => undefined).then(() => current);
  memorySessionLockTails.set(key, tail);

  await previous.catch(() => undefined);
  try {
    return await fn();
  } finally {
    release();
    if (memorySessionLockTails.get(key) === tail) {
      memorySessionLockTails.delete(key);
    }
  }
}

async function releaseRedisSessionLock(
  redis: Redis,
  lockKey: string,
  token: string,
): Promise<void> {
  const script = `
    if redis.call("get", KEYS[1]) == ARGV[1] then
      return redis.call("del", KEYS[1])
    else
      return 0
    end
  `;
  await redis.eval(script, 1, lockKey, token);
}

async function withRedisSessionLock<T>(
  redis: Redis,
  lockKey: string,
  fn: () => Promise<T>,
): Promise<T> {
  const token = randomUUID();
  const deadline = Date.now() + SESSION_LOCK_WAIT_MS;
  let acquired = false;

  while (Date.now() < deadline) {
    const result = await redis.set(lockKey, token, 'EX', SESSION_LOCK_TTL_SECONDS, 'NX');
    if (result === 'OK') {
      acquired = true;
      break;
    }
    await sleep(SESSION_LOCK_RETRY_MS);
  }

  if (!acquired) {
    throw new Error(`Timed out waiting for buyer CS session lock (${lockKey}).`);
  }

  try {
    return await fn();
  } finally {
    try {
      await releaseRedisSessionLock(redis, lockKey, token);
    } catch {
      // best-effort release
    }
  }
}

/** Serialize load/process/save for one buyer CS session (Redis lock or in-memory queue). */
export async function withBuyerCsSessionLock<T>(
  workflowId: string,
  buyerPhone: string,
  fn: () => Promise<T>,
): Promise<T> {
  const key = sessionKey(workflowId, buyerPhone);
  const lockKey = sessionLockKey(workflowId, buyerPhone);
  const redis = getRedisClient();
  if (redis) {
    try {
      return await withRedisSessionLock(redis, lockKey, fn);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes('Timed out waiting for buyer CS session lock')) {
        throw err;
      }
      // fall through to in-memory queue
    }
  }
  return withMemorySessionLock(key, fn);
}

function inboundMessageDedupKey(messageId: string): string {
  return `lakupak:wa-msg:${messageId}`;
}

function pruneMemoryInboundDedup(now: number): void {
  for (const [dedupKey, expiresAt] of memoryInboundDedup) {
    if (expiresAt <= now) {
      memoryInboundDedup.delete(dedupKey);
    }
  }
}

function enforceMemoryInboundDedupLimit(): void {
  while (memoryInboundDedup.size >= MEMORY_INBOUND_DEDUP_MAX_ENTRIES) {
    const oldestKey = memoryInboundDedup.keys().next().value;
    if (oldestKey === undefined) break;
    memoryInboundDedup.delete(oldestKey);
  }
}

/** Reserve a Meta message id (SET NX). Returns false when already seen. */
export async function claimInboundWhatsAppMessage(messageId: string): Promise<boolean> {
  const id = messageId.trim();
  if (!id) return true;

  const key = inboundMessageDedupKey(id);
  const redis = getRedisClient();
  if (redis) {
    try {
      const result = await redis.set(key, '1', 'EX', INBOUND_MSG_DEDUP_TTL_SECONDS, 'NX');
      return result === 'OK';
    } catch {
      // fall through to in-memory
    }
  }

  const now = Date.now();
  pruneMemoryInboundDedup(now);
  const expiresAt = memoryInboundDedup.get(key);
  if (expiresAt != null && expiresAt > now) return false;
  enforceMemoryInboundDedupLimit();
  memoryInboundDedup.set(key, now + INBOUND_MSG_DEDUP_TTL_SECONDS * 1000);
  return true;
}

/** Drop dedup reservation so Meta webhook retries can re-run after a failed handle. */
export async function releaseInboundWhatsAppMessage(messageId: string): Promise<void> {
  const id = messageId.trim();
  if (!id) return;

  const key = inboundMessageDedupKey(id);
  const redis = getRedisClient();
  if (redis) {
    try {
      await redis.del(key);
      return;
    } catch {
      // fall through
    }
  }
  memoryInboundDedup.delete(key);
}

function summaryFromSession(
  buyerPhone: string,
  session: BuyerCsSession,
): BuyerCsConversationSummary {
  const lastTurn = session.history[session.history.length - 1];
  return {
    buyerPhone,
    csMode: session.csMode,
    assignedAgentId: session.assignedAgentId,
    assignedAgentName: session.assignedAgentName,
    lastMessagePreview: (lastTurn?.content ?? '').slice(0, 160),
    lastMessageAt: session.updatedAt,
  };
}

function collectMemorySessionsForWorkflow(
  workflowId: string,
  humanOnly: boolean,
): BuyerCsConversationSummary[] {
  const prefix = `lakupak:wa-cs:${workflowId}:`;
  const out: BuyerCsConversationSummary[] = [];
  const now = Date.now();
  for (const [key, row] of memorySessions) {
    if (!key.startsWith(prefix)) continue;
    if (now > row.expiresAt) continue;
    const session = normalizeBuyerCsSession(row.value);
    if (humanOnly && session.csMode !== 'human') continue;
    const digits = key.slice(prefix.length);
    if (!digits) continue;
    out.push(summaryFromSession(`+${digits}`, session));
  }
  return out;
}

/** List active buyer CS sessions for a workflow (Redis scan with in-memory fallback). */
export async function listBuyerCsSessionsForWorkflow(
  workflowId: string,
  opts?: { humanOnly?: boolean },
): Promise<BuyerCsConversationSummary[]> {
  const humanOnly = opts?.humanOnly ?? false;
  const prefix = `lakupak:wa-cs:${workflowId}:`;
  const redis = getRedisClient();
  const out: BuyerCsConversationSummary[] = [];

  if (redis) {
    try {
      let cursor = '0';
      do {
        const [nextCursor, keys] = await redis.scan(cursor, 'MATCH', `${prefix}*`, 'COUNT', 100);
        cursor = nextCursor;
        for (const key of keys) {
          if (key.endsWith(':lock')) continue;
          const raw = await redis.get(key);
          if (!raw) continue;
          const session = normalizeBuyerCsSession(JSON.parse(raw) as Partial<BuyerCsSession>);
          if (humanOnly && session.csMode !== 'human') continue;
          const digits = key.slice(prefix.length);
          if (!digits) continue;
          out.push(summaryFromSession(`+${digits}`, session));
        }
      } while (cursor !== '0');
      out.sort((a, b) => b.lastMessageAt.localeCompare(a.lastMessageAt));
      return out;
    } catch {
      // fall through
    }
  }

  const memoryRows = collectMemorySessionsForWorkflow(workflowId, humanOnly);
  memoryRows.sort((a, b) => b.lastMessageAt.localeCompare(a.lastMessageAt));
  return memoryRows;
}
