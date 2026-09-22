import { prisma, type Prisma } from '@/lib/db';

export type RegistrationSource = 'dashboard' | 'marketplace';

export type RegistrationKey = {
  source: RegistrationSource;
  userId: number;
};

export const MARKETPLACE_REGISTRATION_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

export function registrationStateKey(source: RegistrationSource, userId: number): string {
  return `${source}:${userId}`;
}

export async function listActiveRegistrationKeys(): Promise<RegistrationKey[]> {
  const marketplaceSince = new Date(Date.now() - MARKETPLACE_REGISTRATION_WINDOW_MS);
  const [upcoming, marketplace] = await Promise.all([
    prisma.user.findMany({
      where: { accountStatus: 'pending', isSuspended: false },
      select: { id: true },
    }),
    prisma.marketplaceUser.findMany({
      where: { isSuspended: false, createdAt: { gte: marketplaceSince } },
      select: { id: true },
    }),
  ]);
  return [
    ...upcoming.map((u) => ({ source: 'dashboard' as const, userId: u.id })),
    ...marketplace.map((u) => ({ source: 'marketplace' as const, userId: u.id })),
  ];
}

export async function loadRegistrationInboxStates(
  adminId: number,
  keys: RegistrationKey[],
  db: Pick<Prisma.TransactionClient, 'platformAdminInboxState'> = prisma,
): Promise<Map<string, { readAt: Date | null; dismissedAt: Date | null }>> {
  if (keys.length === 0) return new Map();
  const rows = await db.platformAdminInboxState.findMany({
    where: {
      adminId,
      OR: keys.map((k) => ({ source: k.source, userId: k.userId })),
    },
    select: { source: true, userId: true, readAt: true, dismissedAt: true },
  });
  return new Map(
    rows.map((r) => [
      registrationStateKey(r.source as RegistrationSource, r.userId),
      { readAt: r.readAt, dismissedAt: r.dismissedAt },
    ]),
  );
}

function alreadyInRequestedState(
  row: { readAt: Date | null; dismissedAt: Date | null } | undefined,
  data: { readAt?: Date; dismissedAt?: Date },
): boolean {
  if (!row) return false;
  if (data.dismissedAt !== undefined) return row.dismissedAt != null;
  if (data.readAt !== undefined) return row.readAt != null;
  return true;
}

function registrationStateUpsert(
  db: Pick<Prisma.TransactionClient, 'platformAdminInboxState'>,
  adminId: number,
  key: RegistrationKey,
  data: { readAt?: Date; dismissedAt?: Date },
) {
  return db.platformAdminInboxState.upsert({
    where: {
      adminId_source_userId: { adminId, source: key.source, userId: key.userId },
    },
    create: {
      adminId,
      source: key.source,
      userId: key.userId,
      readAt: data.readAt ?? null,
      dismissedAt: data.dismissedAt ?? null,
    },
    update: data,
  });
}

async function upsertRegistrationStates(
  adminId: number,
  keys: RegistrationKey[],
  data: { readAt?: Date; dismissedAt?: Date },
  db: Pick<Prisma.TransactionClient, 'platformAdminInboxState'> = prisma,
): Promise<number> {
  if (keys.length === 0) return 0;
  const existing = await loadRegistrationInboxStates(adminId, keys, db);
  const pending = keys.filter(
    (k) => !alreadyInRequestedState(existing.get(registrationStateKey(k.source, k.userId)), data),
  );
  if (pending.length === 0) return 0;
  if (db === prisma) {
    await prisma.$transaction(pending.map((k) => registrationStateUpsert(prisma, adminId, k, data)));
  } else {
    // Interactive transaction clients must be used sequentially.
    for (const k of pending) {
      await registrationStateUpsert(db, adminId, k, data);
    }
  }
  return pending.length;
}

export async function markRegistrationInboxAllRead(
  adminId: number,
  tx: Prisma.TransactionClient,
): Promise<number> {
  return upsertRegistrationStates(
    adminId,
    await listActiveRegistrationKeys(),
    { readAt: new Date() },
    tx,
  );
}

export async function dismissRegistrationInboxAll(
  adminId: number,
  tx: Prisma.TransactionClient,
): Promise<number> {
  const now = new Date();
  return upsertRegistrationStates(
    adminId,
    await listActiveRegistrationKeys(),
    {
      readAt: now,
      dismissedAt: now,
    },
    tx,
  );
}
