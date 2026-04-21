import { prisma } from '../../common/prisma';

export const fetchMobileSearchHistory = async (args: {
  userId: number;
  limit?: number;
}) => {
  const { userId, limit = 10 } = args;

  const searches = await prisma.searchHistory.findMany({
    where: { userId },
    orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
    take: limit,
  });

  return {
    success: true,
    searches: searches.map((search: { id: number; userId: number; query: string; createdAt: Date; updatedAt: Date }) => ({
      id: search.id,
      userId: search.userId,
      query: search.query,
      createdAt: search.createdAt.toISOString(),
      updatedAt: search.updatedAt.toISOString(),
    }))
  };
};

function isRetryableTransactionError(e: unknown): boolean {
  const msg = String(e instanceof Error ? e.message : e);
  const code = (e as { code?: string })?.code;
  return (
    code === 'P2034' ||
    /write conflict|deadlock|could not serialize access/i.test(msg)
  );
}

export const addSearchHistory = async (args: {
  userId: number;
  query: string;
}) => {
  const { userId, query } = args;

  if (!query.trim()) {
    throw new Error('Search query cannot be empty');
  }

  const trimmedQuery = query.trim();
  const normalizedQuery = trimmedQuery.toLowerCase();
  const maxRetries = 3;

  const runTransaction = () =>
    prisma.$transaction(async (tx) => {
      // Use the DB unique constraint (userId, query) to make this concurrency-safe.
      // Instead of delete+create (which can race), upsert and "touch" updatedAt.
      const saved = await tx.searchHistory.upsert({
        where: { userId_query: { userId, query: normalizedQuery } },
        create: { userId, query: normalizedQuery },
        // Ensure re-searching bumps recency for ordering + cleanup.
        update: { updatedAt: new Date() },
      });

      // Enforce "max 10" per user. We keep the 10 most-recently updated rows.
      // (Updated rows float to the top when a query is re-used.)
      const overflow = await tx.searchHistory.findMany({
        where: { userId },
        orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
        skip: 10,
        select: { id: true },
      });
      if (overflow.length > 0) {
        await tx.searchHistory.deleteMany({
          where: { id: { in: overflow.map((r) => r.id) } },
        });
      }

      return saved;
    }, { isolationLevel: 'ReadCommitted' });

  let lastError: unknown;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const result = await runTransaction();
      return {
        success: true,
        message: 'Search history added',
        search: {
          id: result.id,
          userId: result.userId,
          query: result.query,
          createdAt: result.createdAt.toISOString(),
          updatedAt: result.updatedAt.toISOString(),
        }
      };
    } catch (e) {
      lastError = e;
      if (attempt < maxRetries && isRetryableTransactionError(e)) {
        await new Promise(r => setTimeout(r, 50 * attempt));
        continue;
      }
      throw e;
    }
  }
  throw lastError; // only if loop exits without return/throw
};

export const removeSearchHistory = async (args: {
  userId: number;
  query: string;
}) => {
  const { userId, query } = args;
  const normalizedQuery = query.trim().toLowerCase();

  if (normalizedQuery) {
    const deleted = await prisma.searchHistory.deleteMany({
      where: { userId, query: normalizedQuery },
    });
    return {
      success: true,
      message: deleted.count > 0 ? 'Search history removed' : 'Search history not found',
      search: null
    };
  }

  return {
    success: true,
    message: 'Search history not found',
    search: null
  };
};

export const clearSearchHistory = async (args: {
  userId: number;
}) => {
  const { userId } = args;

  await prisma.searchHistory.deleteMany({
    where: { userId }
  });

  return {
    success: true,
    message: 'Search history cleared',
    search: null
  };
};

