import Redis from 'ioredis';

let redisClient: Redis | null = null;
let redisEnabled = false;
let lastErrorKey: string | null = null;

/**
 * Get or create Redis client instance
 * Returns null if Redis is not configured or unavailable
 */
export function getRedisClient(): Redis | null {
  // Return existing client if already created
  if (redisClient) {
    return redisClient;
  }

  const redisUrl = process.env.REDIS_URL;
  
  // If no Redis URL configured, return null (will use in-memory fallback)
  if (!redisUrl) {
    return null;
  }

  try {
    redisClient = new Redis(redisUrl, {
      maxRetriesPerRequest: 3,
      retryStrategy: (times) => {
        // Retry with exponential backoff, max 3 seconds
        // Stop retrying after 5 attempts to reduce spam
        if (times > 5) {
          return null; // Stop retrying
        }
        const delay = Math.min(times * 50, 3000);
        return delay;
      },
      reconnectOnError: (err) => {
        // Reconnect on specific errors
        const targetError = 'READONLY';
        if (err.message.includes(targetError)) {
          return true;
        }
        return false;
      },
      enableOfflineQueue: true, // Queue commands when disconnected, they'll execute when reconnected
      connectTimeout: 10000, // 10 second timeout
      lazyConnect: false, // Connect immediately
    });

    // Handle connection events
    redisClient.on('connect', () => {
      redisEnabled = true;
    });

    redisClient.on('ready', () => {
      redisEnabled = true;
    });

    redisClient.on('error', (err) => {
      redisEnabled = false;
      // Log error but don't throw - allow fallback to in-memory
      // Only log once per error type to reduce spam
      if (process.env.NODE_ENV === 'development') {
        const errorKey = err.message.substring(0, 50);
        if (lastErrorKey !== errorKey) {
          console.warn('Redis connection error (using in-memory fallback):', err.message);
          lastErrorKey = errorKey;
        }
      }
    });

    redisClient.on('close', () => {
      redisEnabled = false;
    });

    redisEnabled = true;
    return redisClient;
  } catch (error) {
    redisEnabled = false;
    if (process.env.NODE_ENV === 'development') {
      console.warn('Failed to create Redis client (using in-memory fallback):', error);
    }
    return null;
  }
}

/**
 * Check if Redis is available and connected
 */
export function isRedisAvailable(): boolean {
  if (!redisEnabled) {
    return false;
  }
  const client = getRedisClient();
  if (!client) {
    return false;
  }
  // Check if client is connected (status can be 'ready', 'connect', 'connecting', etc.)
  return client.status === 'ready' || client.status === 'connect';
}

/**
 * Close Redis connection (useful for cleanup in tests)
 */
export async function closeRedisConnection(): Promise<void> {
  if (redisClient) {
    await redisClient.quit();
    redisClient = null;
    redisEnabled = false;
  }
}

