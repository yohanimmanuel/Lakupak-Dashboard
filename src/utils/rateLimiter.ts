import { NextRequest, NextResponse } from 'next/server';
import { getRedisClient, isRedisAvailable } from '@/lib/redis';

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

interface RateLimitConfig {
  windowMs: number; // Time window in milliseconds
  maxRequests: number; // Maximum requests allowed in the window
  message?: string; // Custom error message
  keyGenerator?: (req: NextRequest) => string; // Custom key generation
  skipSuccessfulRequests?: boolean; // Only count failed requests
}

// In-memory store (fallback when Redis is unavailable)
const rateLimitStore = new Map<string, RateLimitEntry>();

// Cleanup old entries every 5 minutes to prevent memory leak (only for in-memory fallback)
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of rateLimitStore.entries()) {
    if (now > entry.resetAt) {
      rateLimitStore.delete(key);
    }
  }
}, 5 * 60 * 1000);

/**
 * Generate a unique key for rate limiting based on IP and identifier
 */
function generateKey(req: NextRequest, identifier: string): string {
  const ip = req.headers.get('x-forwarded-for') || 
             req.headers.get('x-real-ip') || 
             'unknown';
  return `${identifier}:${ip}`;
}

/**
 * Get client IP address from request
 */
export function getClientIp(req: NextRequest): string {
  return req.headers.get('x-forwarded-for')?.split(',')[0].trim() || 
         req.headers.get('x-real-ip') || 
         'unknown';
}

/**
 * Lua script for atomic rate limiting: INCR and set EXPIRE on first request
 * Returns the incremented count
 */
const RATE_LIMIT_LUA_SCRIPT = `
  local count = redis.call('INCR', KEYS[1])
  if count == 1 then
    redis.call('EXPIRE', KEYS[1], ARGV[1])
  end
  return count
`;

/**
 * Rate limiter middleware for Next.js API routes
 * Uses Redis for distributed rate limiting, falls back to in-memory if Redis unavailable
 * Returns null if request is allowed, or NextResponse with 429 status if rate limited
 */
export async function rateLimit(
  req: NextRequest,
  config: RateLimitConfig
): Promise<NextResponse | null> {
  const { windowMs, maxRequests, message, keyGenerator } = config;
  
  // Generate unique key for this request
  const key = keyGenerator 
    ? keyGenerator(req) 
    : generateKey(req, 'default');
  
  const redisKey = `rate-limit:${key}`;
  const now = Date.now();
  const ttlSeconds = Math.ceil(windowMs / 1000);
  
  // Redis first (for distributed rate limiting)
  const redis = getRedisClient();
  if (redis && isRedisAvailable()) {
    try {
      // Atomic INCR + EXPIRE using Lua script
      const count = await redis.eval(RATE_LIMIT_LUA_SCRIPT, 1, redisKey, ttlSeconds) as number;
      
      // Check if limit exceeded
      if (count > maxRequests) {
        const ttl = await redis.ttl(redisKey);
        const resetAt = now + (ttl * 1000);
        
        return NextResponse.json(
          { 
            error: message || 'Too many requests, please try again later',
            retryAfter: ttl > 0 ? ttl : ttlSeconds
          },
          { 
            status: 429,
            headers: {
              'Retry-After': (ttl > 0 ? ttl : ttlSeconds).toString(),
              'X-RateLimit-Limit': maxRequests.toString(),
              'X-RateLimit-Remaining': '0',
              'X-RateLimit-Reset': new Date(resetAt).toISOString(),
            }
          }
        );
      }
      
      // Request allowed
      return null;
    } catch (error) {
      // Redis error - fall through to in-memory fallback
      if (process.env.NODE_ENV === 'development') {
        console.warn('Redis rate limit error, using in-memory fallback:', error);
      }
    }
  }
  
  // Fallback to in-memory rate limiting (when Redis unavailable)
  const entry = rateLimitStore.get(key);
  
  // No entry exists, create new one
  if (!entry) {
    rateLimitStore.set(key, {
      count: 1,
      resetAt: now + windowMs,
    });
    return null;
  }
  
  // Entry expired, reset it
  if (now > entry.resetAt) {
    rateLimitStore.set(key, {
      count: 1,
      resetAt: now + windowMs,
    });
    return null;
  }
  
  // Check if limit exceeded
  if (entry.count >= maxRequests) {
    const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
    
    return NextResponse.json(
      { 
        error: message || 'Too many requests, please try again later',
        retryAfter 
      },
      { 
        status: 429,
        headers: {
          'Retry-After': retryAfter.toString(),
          'X-RateLimit-Limit': maxRequests.toString(),
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset': new Date(entry.resetAt).toISOString(),
        }
      }
    );
  }
  
  // Increment counter
  entry.count += 1;
  rateLimitStore.set(key, entry);
  
  return null;
}

/**
 * Create a rate limiter with specific configuration
 */
export function createRateLimiter(config: RateLimitConfig) {
  return async (req: NextRequest): Promise<NextResponse | null> => {
    return rateLimit(req, config);
  };
}

// ============================================================================
// PREDEFINED RATE LIMITERS FOR DIFFERENT ENDPOINTS
// ============================================================================

/**
 * Auth: Login attempts - 5 per 15 minutes per IP
 */
export const loginRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  maxRequests: 5,
  message: 'Too many login attempts. Please try again in 15 minutes.',
  keyGenerator: (req) => {
    const ip = getClientIp(req);
    return `login:${ip}`;
  },
});

/**
 * Auth: Registration - 3 per hour per IP
 */
export const registerRateLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000, // 1 hour
  maxRequests: 3,
  message: 'Too many registration attempts. Please try again later.',
  keyGenerator: (req) => {
    const ip = getClientIp(req);
    return `register:${ip}`;
  },
});

/**
 * Auth: OTP Request - 3 per 5 minutes per phone number
 * This is critical because each OTP costs money via Twilio
 */
export async function otpRateLimiter(
  req: NextRequest,
  phone: string
): Promise<NextResponse | null> {
  const ip = getClientIp(req);
  const key = `otp:${phone}:${ip}`;
  
  return rateLimit(req, {
    windowMs: 5 * 60 * 1000, // 5 minutes
    maxRequests: 3,
    message: 'Too many OTP requests. Please try again in 5 minutes.',
    keyGenerator: () => key,
  });
}

/**
 * Auth: Password Reset - 3 per hour per email
 */
export async function passwordResetRateLimiter(
  req: NextRequest,
  email: string
): Promise<NextResponse | null> {
  const ip = getClientIp(req);
  const key = `password-reset:${email}:${ip}`;
  
  return rateLimit(req, {
    windowMs: 60 * 60 * 1000, // 1 hour
    maxRequests: 3,
    message: 'Too many password reset requests. Please try again in 1 hour.',
    keyGenerator: () => key,
  });
}

/**
 * Orders: Creation - 50 per hour per user
 */
export async function orderCreationRateLimiter(
  req: NextRequest,
  userId: number
): Promise<NextResponse | null> {
  const ip = getClientIp(req);
  const key = `order-create:${userId}:${ip}`;
  
  return rateLimit(req, {
    windowMs: 60 * 60 * 1000, // 1 hour
    maxRequests: 50,
    message: 'Too many orders created. Please try again later.',
    keyGenerator: () => key,
  });
}

/**
 * Orders: Queries - 50 per minute per user
 */
export async function orderQueryRateLimiter(
  req: NextRequest,
  userId: number
): Promise<NextResponse | null> {
  const ip = getClientIp(req);
  const key = `order-query:${userId}:${ip}`;
  
  return rateLimit(req, {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 50,
    message: 'Too many order queries. Please slow down.',
    keyGenerator: () => key,
  });
}

/**
 * Orders: Updates - 50 per minute per user
 */
export async function orderUpdateRateLimiter(
  req: NextRequest,
  userId: number
): Promise<NextResponse | null> {
  const ip = getClientIp(req);
  const key = `order-update:${userId}:${ip}`;
  
  return rateLimit(req, {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 50,
    message: 'Too many order updates. Please slow down.',
    keyGenerator: () => key,
  });
}

// ============================================================================
// TIER 2: OFFERS, MARKETPLACE, IMAGE UPLOAD
// ============================================================================

/**
 * Offers: Creation - 10 per hour per user
 */
export async function offerCreationRateLimiter(
  req: NextRequest,
  userId: number
): Promise<NextResponse | null> {
  const ip = getClientIp(req);
  const key = `offer-create:${userId}:${ip}`;
  
  return rateLimit(req, {
    windowMs: 60 * 60 * 1000, // 1 hour
    maxRequests: 10,
    message: 'Too many offers created. Please try again later.',
    keyGenerator: () => key,
  });
}

/**
 * Offers: Updates - 20 per hour per user
 */
export async function offerUpdateRateLimiter(
  req: NextRequest,
  userId: number
): Promise<NextResponse | null> {
  const ip = getClientIp(req);
  const key = `offer-update:${userId}:${ip}`;
  
  return rateLimit(req, {
    windowMs: 60 * 60 * 1000, // 1 hour
    maxRequests: 20,
    message: 'Too many offer updates. Please try again later.',
    keyGenerator: () => key,
  });
}

/**
 * Offers: Queries - 30 per minute per user
 */
export async function offerQueryRateLimiter(
  req: NextRequest,
  userId: number
): Promise<NextResponse | null> {
  const ip = getClientIp(req);
  const key = `offer-query:${userId}:${ip}`;
  
  return rateLimit(req, {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 30,
    message: 'Too many offer queries. Please slow down.',
    keyGenerator: () => key,
  });
}

/**
 * Marketplace: Public product search - 10,000 per minute per IP
 * Production-ready limit similar to major e-commerce platforms
 */
export async function marketplaceSearchRateLimiter(
  req: NextRequest
): Promise<NextResponse | null> {
  const ip = getClientIp(req);
  const key = `marketplace-search:${ip}`;
  
  return rateLimit(req, {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 10000,
    message: 'Too many marketplace searches. Please slow down.',
    keyGenerator: () => key,
  });
}

/**
 * Marketplace: Cart operations - 100 per minute per user
 */
export async function cartOperationRateLimiter(
  req: NextRequest,
  userId: number
): Promise<NextResponse | null> {
  const ip = getClientIp(req);
  const key = `cart-operation:${userId}:${ip}`;
  
  return rateLimit(req, {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 100,
    message: 'Too many cart operations. Please slow down.',
    keyGenerator: () => key,
  });
}

/**
 * Marketplace: User activity tracking - 100 per minute per user
 */
export async function userActivityRateLimiter(
  req: NextRequest,
  userId: number
): Promise<NextResponse | null> {
  const ip = getClientIp(req);
  const key = `user-activity:${userId}:${ip}`;
  
  return rateLimit(req, {
    windowMs: 1000, // 1 second
    maxRequests: 1000,
    message: 'Too many activity tracking requests. Please slow down.',
    keyGenerator: () => key,
  });
}

/**
 * Marketplace: Address CRUD - 20 per hour per user
 */
export async function addressOperationRateLimiter(
  req: NextRequest,
  userId: number
): Promise<NextResponse | null> {
  const ip = getClientIp(req);
  const key = `address-operation:${userId}:${ip}`;
  
  return rateLimit(req, {
    windowMs: 60 * 60 * 1000, // 1 hour
    maxRequests: 20,
    message: 'Too many address operations. Please try again later.',
    keyGenerator: () => key,
  });
}

/**
 * Image Upload - 50 per hour per user
 */
export async function imageUploadRateLimiter(
  req: NextRequest,
  userId?: number
): Promise<NextResponse | null> {
  const ip = getClientIp(req);
  const key = userId ? `image-upload:${userId}:${ip}` : `image-upload:${ip}`;
  
  return rateLimit(req, {
    windowMs: 60 * 60 * 1000, // 1 hour
    maxRequests: 50,
    message: 'Too many image uploads. Please try again later.',
    keyGenerator: () => key,
  });
}

/**
 * Image Delete - 100 per hour per user
 */
export async function imageDeleteRateLimiter(
  req: NextRequest,
  userId?: number
): Promise<NextResponse | null> {
  const ip = getClientIp(req);
  const key = userId ? `image-delete:${userId}:${ip}` : `image-delete:${ip}`;
  
  return rateLimit(req, {
    windowMs: 60 * 60 * 1000, // 1 hour
    maxRequests: 100,
    message: 'Too many image deletions. Please try again later.',
    keyGenerator: () => key,
  });
}

// ============================================================================
// TIER 3: PRODUCTS, CAMPAIGNS, CLIENTS, SETTINGS
// ============================================================================

/**
 * Products: Creation - 100 per hour per user
 */
export async function productCreationRateLimiter(
  req: NextRequest,
  userId: number
): Promise<NextResponse | null> {
  const ip = getClientIp(req);
  const key = `product-create:${userId}:${ip}`;
  
  return rateLimit(req, {
    windowMs: 60 * 60 * 1000, // 1 hour
    maxRequests: 100,
    message: 'Too many products created. Please try again later.',
    keyGenerator: () => key,
  });
}

/**
 * Products: Updates - 100 per hour per user
 */
export async function productUpdateRateLimiter(
  req: NextRequest,
  userId: number
): Promise<NextResponse | null> {
  const ip = getClientIp(req);
  const key = `product-update:${userId}:${ip}`;
  
  return rateLimit(req, {
    windowMs: 60 * 60 * 1000, // 1 hour
    maxRequests: 100,
    message: 'Too many product updates. Please try again later.',
    keyGenerator: () => key,
  });
}

/**
 * Products: Queries - 100 per minute per user
 */
export async function productQueryRateLimiter(
  req: NextRequest,
  userId: number
): Promise<NextResponse | null> {
  const ip = getClientIp(req);
  const key = `product-query:${userId}:${ip}`;
  
  return rateLimit(req, {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 100,
    message: 'Too many product queries. Please slow down.',
    keyGenerator: () => key,
  });
}

/**
 * Products: Bulk Publish - 20 per hour per user
 */
export async function productBulkPublishRateLimiter(
  req: NextRequest,
  userId: number
): Promise<NextResponse | null> {
  const ip = getClientIp(req);
  const key = `product-bulk-publish:${userId}:${ip}`;
  
  return rateLimit(req, {
    windowMs: 60 * 60 * 1000, // 1 hour
    maxRequests: 20,
    message: 'Too many bulk publish operations. Please try again later.',
    keyGenerator: () => key,
  });
}

/**
 * Campaigns: All operations - 50 per hour per user
 */
export async function campaignOperationRateLimiter(
  req: NextRequest,
  userId: number
): Promise<NextResponse | null> {
  const ip = getClientIp(req);
  const key = `campaign-operation:${userId}:${ip}`;
  
  return rateLimit(req, {
    windowMs: 60 * 60 * 1000, // 1 hour
    maxRequests: 50,
    message: 'Too many campaign operations. Please try again later.',
    keyGenerator: () => key,
  });
}

/**
 * Clients (Buyers/Suppliers): All operations - 50 per hour per user
 */
export async function clientOperationRateLimiter(
  req: NextRequest,
  userId: number
): Promise<NextResponse | null> {
  const ip = getClientIp(req);
  const key = `client-operation:${userId}:${ip}`;
  
  return rateLimit(req, {
    windowMs: 60 * 60 * 1000, // 1 hour
    maxRequests: 50,
    message: 'Too many client operations. Please try again later.',
    keyGenerator: () => key,
  });
}

/**
 * Settings/User: All operations - 10 per hour per user
 */
export async function settingsOperationRateLimiter(
  req: NextRequest,
  userId: number
): Promise<NextResponse | null> {
  const ip = getClientIp(req);
  const key = `settings-operation:${userId}:${ip}`;
  
  return rateLimit(req, {
    windowMs: 60 * 60 * 1000, // 1 hour
    maxRequests: 10,
    message: 'Too many settings updates. Please try again later.',
    keyGenerator: () => key,
  });
}

/**
 * Get current rate limit status for a key (useful for debugging)
 */
export async function getRateLimitStatus(key: string): Promise<RateLimitEntry | null> {
  const redis = getRedisClient();
  const redisKey = `rate-limit:${key}`;
  
  if (redis && isRedisAvailable()) {
    try {
      const count = await redis.get(redisKey);
      const ttl = await redis.ttl(redisKey);
      
      if (count) {
        const now = Date.now();
        return {
          count: parseInt(count, 10),
          resetAt: now + (ttl * 1000),
        };
      }
      return null;
    } catch (error) {
      // Fall through to in-memory
    }
  }
  
  return rateLimitStore.get(key) || null;
}

/**
 * Clear rate limit for a specific key (admin function)
 */
export async function clearRateLimit(key: string): Promise<void> {
  const redis = getRedisClient();
  const redisKey = `rate-limit:${key}`;
  
  if (redis && isRedisAvailable()) {
    try {
      await redis.del(redisKey);
    } catch (error) {
      // Fall through to in-memory
    }
  }
  
  rateLimitStore.delete(key);
}

/**
 * Clear all rate limits (admin function)
 * Note: This only clears in-memory store. Redis keys should be cleared separately.
 */
export function clearAllRateLimits(): void {
  rateLimitStore.clear();
}

