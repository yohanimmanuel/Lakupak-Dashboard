import { getRedisClient, isRedisAvailable } from '@/lib/redis';
import { createHash } from 'crypto';

// Get Redis client instance
const redis = getRedisClient();

/**
 * Advanced query result caching with Redis
 * Caches GraphQL query results to reduce database load
 */

interface CacheOptions {
  ttl?: number; // Time to live in seconds (default: 60)
  prefix?: string; // Cache key prefix
}

/**
 * Generate a cache key from query parameters
 * Format: prefix:userId:hash (when userId present) or prefix:hash (when no userId)
 * This allows efficient user-scoped cache invalidation
 */
const generateCacheKey = (prefix: string, params: Record<string, unknown>): string => {
  const hash = createHash('md5')
    .update(JSON.stringify(params))
    .digest('hex')
    .substring(0, 12);
  
  // If userId is present, include it in the key structure for scoped invalidation
  if (params.userId !== undefined) {
    return `${prefix}:${params.userId}:${hash}`;
  }
  
  return `${prefix}:${hash}`;
};

/**
 * Get cached query result
 */
export async function getCachedQuery<T>(
  prefix: string,
  params: Record<string, unknown>
): Promise<T | null> {
  if (!isRedisAvailable() || !redis) {
    return null;
  }

  try {
    const key = generateCacheKey(prefix, params);
    const cached = await redis.get(key);
    
    if (cached) {
      return JSON.parse(cached) as T;
    }
    return null;
  } catch (error) {
    console.error('[QueryCache] Get failed:', error);
    return null;
  }
}

/**
 * Set cached query result
 */
export async function setCachedQuery<T>(
  prefix: string,
  params: Record<string, unknown>,
  data: T,
  options: CacheOptions = {}
): Promise<void> {
  if (!isRedisAvailable() || !redis) {
    return;
  }

  try {
    const { ttl = 60 } = options;
    const key = generateCacheKey(prefix, params);
    await redis.setex(key, ttl, JSON.stringify(data));
  } catch (error) {
    console.error('[QueryCache] Set failed:', error);
  }
}

/**
 * Invalidate cache by prefix pattern
 */
export async function invalidateQueryCache(pattern: string): Promise<void> {
  if (!isRedisAvailable() || !redis) {
    return;
  }

  try {
    let cursor = '0';
    do {
      const [nextCursor, keys] = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
      cursor = nextCursor;
      if (keys.length > 0) {
        await redis.del(...keys);
      }
    } while (cursor !== '0');
  } catch (error) {
    console.error('[QueryCache] Invalidate failed:', error);
  }
}

/**
 * Cache dashboard snapshot (higher TTL since it's expensive)
 */
export async function getCachedDashboard<T>(userId: number): Promise<T | null> {
  return getCachedQuery<T>('dashboard-snapshot', { userId });
}

export async function setCachedDashboard<T>(userId: number, data: T): Promise<void> {
  // Cache for 2 minutes since dashboard data doesn't change frequently
  await setCachedQuery('dashboard-snapshot', { userId }, data, { ttl: 120 });
}

export async function invalidateDashboardCache(userId: number): Promise<void> {
  // User-scoped invalidation - only clear this user's dashboard cache
  await invalidateQueryCache(`dashboard-snapshot:${userId}:*`);
}

/**
 * Cache product list queries (frequently accessed)
 */
export async function getCachedProductList<T>(
  userId: number,
  page: number,
  limit: number,
  filters: Record<string, unknown>
): Promise<T | null> {
  return getCachedQuery<T>('product-list', { userId, page, limit, ...filters });
}

export async function setCachedProductList<T>(
  userId: number,
  page: number,
  limit: number,
  filters: Record<string, unknown>,
  data: T
): Promise<void> {
  // Cache for 30 seconds - short TTL since products change frequently
  await setCachedQuery('product-list', { userId, page, limit, ...filters }, data, { ttl: 30 });
}

export async function invalidateProductCache(userId: number): Promise<void> {
  // User-scoped invalidation - only clear this user's product list caches
  await invalidateQueryCache(`product-list:${userId}:*`);
}

/**
 * Cache offer list queries
 */
export async function getCachedOfferList<T>(
  userId: number,
  page: number,
  limit: number,
  filters: Record<string, unknown>
): Promise<T | null> {
  return getCachedQuery<T>('offer-list', { userId, page, limit, ...filters });
}

export async function setCachedOfferList<T>(
  userId: number,
  page: number,
  limit: number,
  filters: Record<string, unknown>,
  data: T
): Promise<void> {
  // Cache for 45 seconds
  await setCachedQuery('offer-list', { userId, page, limit, ...filters }, data, { ttl: 45 });
}

export async function invalidateOfferCache(userId: number): Promise<void> {
  // User-scoped invalidation - only clear this user's offer list caches
  await invalidateQueryCache(`offer-list:${userId}:*`);
}
