import { prisma } from '@/lib/db';

export const isDuplicateAddressIdError = (error: unknown): boolean => {
  if (!error || typeof error !== 'object') return false;
  const prismaError = error as {
    code?: string;
    meta?: { target?: unknown; modelName?: string };
  };
  if (prismaError.code !== 'P2002') return false;

  const modelName = prismaError.meta?.modelName;
  if (modelName && modelName !== 'Address') return false;

  const target = prismaError.meta?.target;
  const fields = Array.isArray(target)
    ? (target as string[])
    : typeof target === 'string'
      ? [target]
      : [];

  return fields.some((field) => field === 'id');
};

export const resetAddressIdSequence = async () => {
  if (!process.env.DATABASE_URL?.startsWith('postgres')) {
    return;
  }

  await prisma.$executeRawUnsafe(`
    SELECT setval(
      pg_get_serial_sequence('"Address"', 'id'),
      COALESCE((SELECT MAX("id") FROM "Address"), 0),
      true
    );
  `);
};
