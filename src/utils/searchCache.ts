import { getRedisClient, isRedisAvailable } from '@/lib/redis';

/**
 * Cache configuration for search operations
 */
const SEARCH_CACHE_TTL = 30; // 30 seconds - search results change frequently
const PRODUCT_CACHE_TTL = 60; // 60 seconds - product listings change less frequently

/**
 * Generate cache key for marketplace search
 */
function generateMarketplaceSearchCacheKey(params: {
  search?: string | null;
  category?: string | null;
  page?: number;
  limit?: number;
}): string {
  const { search = '', category = 'All', page = 1, limit = 20 } = params;
  const normalizedSearch = (search || '').toLowerCase().trim();
  const normalizedCategory = (category || 'All').toLowerCase().trim();
  return `search-cache:marketplace:query:${normalizedSearch}:category:${normalizedCategory}:page:${page}:limit:${limit}`;
}

/**
 * Generate cache key for product search (seller dashboard)
 */
function generateProductSearchCacheKey(params: {
  userId: number;
  search?: string | null;
  status?: string | null;
  productType?: string | null;
  page?: number;
  limit?: number;
}): string {
  const { userId, search = '', status = 'All', productType = 'All', page = 1, limit = 50 } = params;
  const normalizedSearch = (search || '').toLowerCase().trim();
  const normalizedStatus = (status || 'All').toLowerCase().trim();
  const normalizedType = (productType || 'All').toLowerCase().trim();
  return `search-cache:product:userId:${userId}:query:${normalizedSearch}:status:${normalizedStatus}:type:${normalizedType}:page:${page}:limit:${limit}`;
}

/**
 * Get cached search results
 */
export async function getCachedSearchResult<T>(cacheKey: string): Promise<T | null> {
  const redis = getRedisClient();
  
  if (!redis) {
    return null; // No cache available, fall through to database
  }

  // Check if Redis is actually connected before attempting operations
  if (!isRedisAvailable() || (redis.status !== 'ready' && redis.status !== 'connect')) {
    return null; // Redis not connected, fall through to database
  }

  try {
    const cached = await redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached) as T;
    }
    return null;
  } catch (error) {
    // Cache error - fall through to database
    // Only log if it's not a connection/disconnection error
    if (process.env.NODE_ENV === 'development') {
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (!errorMessage.includes('Stream isn\'t writeable') && !errorMessage.includes('Connection is closed')) {
        console.warn('Cache read error:', error);
      }
    }
    return null;
  }
}

/**
 * Set cached search results
 */
export async function setCachedSearchResult<T>(
  cacheKey: string,
  data: T,
  ttl: number = SEARCH_CACHE_TTL
): Promise<void> {
  const redis = getRedisClient();
  
  if (!redis) {
    return; // No cache available, skip caching
  }

  // Check if Redis is actually connected before attempting operations
  if (!isRedisAvailable() || (redis.status !== 'ready' && redis.status !== 'connect')) {
    return; // Redis not connected, skip caching
  }

  try {
    await redis.setex(cacheKey, ttl, JSON.stringify(data));
  } catch (error) {
    // Cache error - non-critical, just log
    // Only log if it's not a connection/disconnection error
    if (process.env.NODE_ENV === 'development') {
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (!errorMessage.includes('Stream isn\'t writeable') && !errorMessage.includes('Connection is closed')) {
        console.warn('Cache write error:', error);
      }
    }
  }
}

/**
 * Invalidate search cache (call when products are created/updated/deleted)
 */
export async function invalidateSearchCache(pattern?: string): Promise<void> {
  const redis = getRedisClient();
  
  if (!redis || !isRedisAvailable()) {
    return;
  }

  try {
    const searchPattern = pattern || 'search-cache:*';
    // Use SCAN for production-safe key iteration with efficient batch size
    let cursor = '0';
    do {
      const [nextCursor, keys] = await redis.scan(cursor, 'MATCH', searchPattern, 'COUNT', 1000);
      cursor = nextCursor;
      if (keys.length > 0) {
        await redis.del(...keys);
      }
    } while (cursor !== '0');
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.warn('Cache invalidation error:', error);
    }
  }
}
/**
 * Marketplace search cache wrapper
 */
export async function getCachedMarketplaceSearch<T>(params: {
  search?: string | null;
  category?: string | null;
  page?: number;
  limit?: number;
}): Promise<T | null> {
  const cacheKey = generateMarketplaceSearchCacheKey(params);
  return getCachedSearchResult<T>(cacheKey);
}

export async function setCachedMarketplaceSearch<T>(
  params: {
    search?: string | null;
    category?: string | null;
    page?: number;
    limit?: number;
  },
  data: T
): Promise<void> {
  const cacheKey = generateMarketplaceSearchCacheKey(params);
  await setCachedSearchResult(cacheKey, data, SEARCH_CACHE_TTL);
}

/**
 * Product search cache wrapper (seller dashboard)
 */
export async function getCachedProductSearch<T>(params: {
  userId: number;
  search?: string | null;
  status?: string | null;
  productType?: string | null;
  page?: number;
  limit?: number;
}): Promise<T | null> {
  const cacheKey = generateProductSearchCacheKey(params);
  return getCachedSearchResult<T>(cacheKey);
}

export async function setCachedProductSearch<T>(
  params: {
    userId: number;
    search?: string | null;
    status?: string | null;
    productType?: string | null;
    page?: number;
    limit?: number;
  },
  data: T
): Promise<void> {
  const cacheKey = generateProductSearchCacheKey(params);
  await setCachedSearchResult(cacheKey, data, PRODUCT_CACHE_TTL);
}

