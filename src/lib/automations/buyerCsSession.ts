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

export type BuyerCsSession = {
  welcomed: boolean;
  handoffDone: boolean;
  history: BuyerCsChatTurn[];
  updatedAt: string;
};

function sessionKey(workflowId: string, buyerPhone: string): string {
  return `lakupak:wa-cs:${workflowId}:${buyerPhone.replace(/\D/g, '')}`;
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
      return JSON.parse(raw) as BuyerCsSession;
    } catch {
      return readMemory(key);
    }
  }
  return readMemory(key);
}

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
