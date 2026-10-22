import type { Prisma } from '@/lib/db';

/**
 * A job sent to several reps tracks how many messages went out and which
 * recipients Meta later reported as failed, so the job is reset only when
 * every message failed. Stored on completionData until the job is completed.
 */
export type SharedDelivery = { sent: number | null; failed: string[] };

const KEY = 'sharedDelivery';

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? { ...(value as Record<string, unknown>) } : {};
}

export function readSharedDelivery(completionData: unknown): SharedDelivery {
  const raw = asObject(asObject(completionData)[KEY]);
  return {
    sent: typeof raw.sent === 'number' ? raw.sent : null,
    failed: Array.isArray(raw.failed) ? raw.failed.filter((row): row is string => typeof row === 'string') : [],
  };
}

export function withSharedDelivery(completionData: unknown, delivery: SharedDelivery | null): Prisma.InputJsonValue {
  const next = asObject(completionData);
  if (delivery) next[KEY] = delivery;
  else delete next[KEY];
  return next as Prisma.InputJsonValue;
}

export function allSharedDeliveriesFailed(delivery: SharedDelivery): boolean {
  return delivery.sent != null && delivery.sent > 0 && delivery.failed.length >= delivery.sent;
}

/** Row lock so the send loop and the status webhook do not overwrite each other. */
export async function lockSalesJob(tx: Prisma.TransactionClient, jobId: string) {
  await tx.$queryRaw`SELECT id FROM "SalesJob" WHERE id = ${jobId} FOR UPDATE`;
}
