import { NextRequest, NextResponse } from 'next/server';
import { getRedisClient, isRedisAvailable } from '@/lib/redis';

interface RateLimitEntry {
  count: number;
  resetAt: number;
  violations?: number; // Track violations for progressive rate limiting
}

interface RateLimitConfig {
  windowMs: number; // Time window in milliseconds
  maxRequests: number; // Maximum requests allowed in the window
  message?: string; // Custom error message
  keyGenerator?: (req: NextRequest) => string; // Custom key generation
  skipSuccessfulRequests?: boolean; // Only count failed requests
  burstLimit?: number; // Burst limit (short-term)
  burstWindowMs?: number; // Burst window in milliseconds
  progressivePenalty?: boolean; // Enable progressive rate limiting
}

// In-memory store (fallback when Redis is unavailable)
const rateLimitStore = new Map<string, RateLimitEntry>();

// IP blacklist (stored in Redis primarily, in-memory fallback)
const ipBlacklistStore = new Set<string>();
// Track timeout handles for in-memory blacklist expiry
const ipBlacklistTimeouts = new Map<string, NodeJS.Timeout>();

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
  const ip = getClientIp(req);
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
 * Lua script for atomic rate limiting: INCR and set EXPIRE on first request or if TTL is missing
 * Returns the incremented count
 * Fixed: Also sets EXPIRE if key exists but has no TTL (ttl == -1)
 */
const RATE_LIMIT_LUA_SCRIPT = `
  local count = redis.call('INCR', KEYS[1])
  local ttl = redis.call('TTL', KEYS[1])
  -- Set EXPIRE if this is the first request (count == 1) OR if key has no TTL (ttl == -1)
  if count == 1 or ttl == -1 then
    redis.call('EXPIRE', KEYS[1], ARGV[1])
  end
  return count
`;

/**
 * Lua script for sliding window rate limiting (burst protection)
 * Uses sorted set to track requests with timestamps
 * Returns: count, oldestTimestamp
 */
const SLIDING_WINDOW_LUA_SCRIPT = `
  local key = KEYS[1]
  local windowMs = tonumber(ARGV[1])
  local maxRequests = tonumber(ARGV[2])
  local now = tonumber(ARGV[3])
  local windowStart = now - windowMs
  
  -- Remove old entries outside the window
  redis.call('ZREMRANGEBYSCORE', key, 0, windowStart)
  
  -- Count current requests in window
  local count = redis.call('ZCARD', key)
  
  -- Add current request with unique member (timestamp + random suffix)
  local member = now .. ':' .. math.random(1, 1000000)
  redis.call('ZADD', key, now, member)
  
  -- Set expiration
  redis.call('EXPIRE', key, math.ceil(windowMs / 1000))
  
  -- Get oldest timestamp
  local oldest = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
  local oldestTimestamp = oldest[2] or now
  
  return {count + 1, oldestTimestamp}
`;

/**
 * Lua script for progressive rate limiting (violation tracking)
 * Tracks violations and applies penalties
 */
const PROGRESSIVE_RATE_LIMIT_LUA_SCRIPT = `
  local countKey = KEYS[1]
  local violationKey = KEYS[2]
  
  local count = redis.call('INCR', countKey)
  local ttl = redis.call('TTL', countKey)
  if count == 1 or ttl == -1 then
    redis.call('EXPIRE', countKey, ARGV[1])
  end
  
  -- Get violation count
  local violations = tonumber(redis.call('GET', violationKey) or '0')
  
  return {count, violations}
`;

/**
 * Check if IP is blacklisted (Redis-first, fallback to in-memory)
 */
async function isIpBlacklisted(ip: string): Promise<boolean> {
  const redis = getRedisClient();
  
  if (redis && isRedisAvailable()) {
    try {
      const isBlacklisted = await redis.get(`ip-blacklist:${ip}`);
      return isBlacklisted === '1';
    } catch (error) {
      // Fall through to in-memory check
    }
  }
  
  return ipBlacklistStore.has(ip);
}

/**
 * Add IP to blacklist (Redis-first, fallback to in-memory)
 */
export async function blacklistIp(ip: string, durationSeconds: number = 3600): Promise<void> {
  const redis = getRedisClient();
  
  if (redis && isRedisAvailable()) {
    try {
      await redis.setex(`ip-blacklist:${ip}`, durationSeconds, '1');
      return;
    } catch (error) {
      // Fall through to in-memory
    }
  }
  
  // Clear any existing timeout for this IP before creating a new one
  const existingTimeout = ipBlacklistTimeouts.get(ip);
  if (existingTimeout) {
    clearTimeout(existingTimeout);
  }
  
  ipBlacklistStore.add(ip);
  
  // Auto-remove from in-memory after duration
  const timeoutHandle = setTimeout(() => {
    ipBlacklistStore.delete(ip);
    ipBlacklistTimeouts.delete(ip);
  }, durationSeconds * 1000);
  
  // Store the timeout handle so we can clear it if needed
  ipBlacklistTimeouts.set(ip, timeoutHandle);
}

/**
 * Remove IP from blacklist
 */
export async function unblacklistIp(ip: string): Promise<void> {
  const redis = getRedisClient();
  
  if (redis && isRedisAvailable()) {
    try {
      await redis.del(`ip-blacklist:${ip}`);
    } catch (error) {
      // Continue to in-memory
    }
  }
  
  ipBlacklistStore.delete(ip);
  
  // Clear any pending timeout for this IP
  const existingTimeout = ipBlacklistTimeouts.get(ip);
  if (existingTimeout) {
    clearTimeout(existingTimeout);
    ipBlacklistTimeouts.delete(ip);
  }
}

/**
 * Get violation count for a key (for progressive rate limiting)
 */
async function getViolationCount(key: string): Promise<number> {
  const redis = getRedisClient();
  const violationKey = `violations:${key}`;
  
  if (redis && isRedisAvailable()) {
    try {
      const violations = await redis.get(violationKey);
      return violations ? parseInt(violations, 10) : 0;
    } catch (error) {
      return 0;
    }
  }
  
  return 0;
}

/**
 * Increment violation count and apply penalty
 */
async function recordViolation(key: string, penaltyDurationSeconds: number = 86400): Promise<void> {
  const redis = getRedisClient();
  const violationKey = `violations:${key}`;
  
  if (redis && isRedisAvailable()) {
    try {
      const violations = await redis.incr(violationKey);
      await redis.expire(violationKey, penaltyDurationSeconds);
      
      // Auto-blacklist after 20 violations (increased from 5)
      if (violations >= 20) {
        const ip = key.split(':').pop() || 'unknown';
        await blacklistIp(ip, 3600); // 1 hour (reduced from 24 hours)
      }
    } catch (error) {
      // Fallback handled in progressive rate limiting
    }
  }
}

/**
 * Calculate effective rate limit based on violations (progressive penalty)
 */
function calculateEffectiveLimit(baseLimit: number, violations: number): number {
  if (violations === 0) return baseLimit;
  if (violations <= 5) return Math.floor(baseLimit * 0.9); // 10% reduction
  if (violations <= 10) return Math.floor(baseLimit * 0.8); // 20% reduction
  if (violations <= 15) return Math.floor(baseLimit * 0.7); // 30% reduction
  return Math.floor(baseLimit * 0.5); // 50% reduction for 16+ violations
}

/**
 * Rate limiter middleware for Next.js API routes
 * Uses Redis for distributed rate limiting, falls back to in-memory if Redis unavailable
 * Supports: Progressive rate limiting, burst protection, IP blacklisting
 * Returns null if request is allowed, or NextResponse with 429 status if rate limited
 */
export async function rateLimit(
  req: NextRequest,
  config: RateLimitConfig
): Promise<NextResponse | null> {
  if (process.env.NODE_ENV === 'test') {
    return null;
  }

  const { 
    windowMs, 
    maxRequests, 
    message, 
    keyGenerator,
    burstLimit,
    burstWindowMs = 1000, // Default 1 second for burst window
    progressivePenalty = false
  } = config;
  
  // Generate unique key for this request
  const key = keyGenerator 
    ? keyGenerator(req) 
    : generateKey(req, 'default');
  
  // Check IP blacklist first
  const ip = getClientIp(req);
  if (await isIpBlacklisted(ip)) {
    return NextResponse.json(
      { 
        error: 'Your IP address has been temporarily blocked due to suspicious activity. Please try again later.',
        retryAfter: 3600
      },
      { 
        status: 403,
        headers: {
          'Retry-After': '3600',
        }
      }
    );
  }
  
  const redisKey = `rate-limit:${key}`;
  const burstKey = burstLimit ? `rate-limit-burst:${key}` : null;
  const now = Date.now();
  const ttlSeconds = Math.ceil(windowMs / 1000);
  
  // Redis first (for distributed rate limiting) - PRIORITIZE REDIS
  const redis = getRedisClient();
  if (redis && isRedisAvailable()) {
    try {
      // Get violation count for progressive rate limiting
      let effectiveLimit = maxRequests;
      let violations = 0;
      
      if (progressivePenalty) {
        violations = await getViolationCount(key);
        effectiveLimit = calculateEffectiveLimit(maxRequests, violations);
      }
      
      // Check burst protection first (if configured)
      if (burstLimit && burstKey) {
        const burstWindowStart = now - burstWindowMs;
        const burstResult = await redis.eval(
          SLIDING_WINDOW_LUA_SCRIPT,
          1,
          burstKey,
          burstWindowMs.toString(),
          burstLimit.toString(),
          now.toString()
        ) as [number, number];
        
        const burstCount = burstResult[0];
        const oldestTimestamp = burstResult[1];
        
        if (burstCount > burstLimit) {
          // Burst limit exceeded - record violation if progressive
          if (progressivePenalty) {
            await recordViolation(key);
          }
          
          const retryAfter = Math.ceil((oldestTimestamp + burstWindowMs - now) / 1000);
          return NextResponse.json(
            { 
              error: message || 'Too many requests in a short time. Please slow down.',
              retryAfter: Math.max(1, retryAfter)
            },
            { 
              status: 429,
              headers: {
                'Retry-After': Math.max(1, retryAfter).toString(),
                'X-RateLimit-Limit': effectiveLimit.toString(),
                'X-RateLimit-Burst-Limit': burstLimit.toString(),
                'X-RateLimit-Remaining': '0',
                'X-RateLimit-Reset': new Date(now + (retryAfter * 1000)).toISOString(),
              }
            }
          );
        }
      }
      
      // Main rate limiting check
      const count = await redis.eval(RATE_LIMIT_LUA_SCRIPT, 1, redisKey, ttlSeconds) as number;
      
      // Check if limit exceeded
      if (count > effectiveLimit) {
        // Record violation for progressive rate limiting
        if (progressivePenalty) {
          await recordViolation(key);
        }
        
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
              'X-RateLimit-Limit': effectiveLimit.toString(),
              'X-RateLimit-Remaining': '0',
              'X-RateLimit-Reset': new Date(resetAt).toISOString(),
              ...(violations > 0 ? { 'X-RateLimit-Violations': violations.toString() } : {}),
            }
          }
        );
      }
      
      // Request allowed
      return null;
    } catch (error) {
      // Redis error - ONLY fall through to in-memory if Redis is truly unavailable
      // Don't fall through for transient errors - fail securely
      const errorMessage = error instanceof Error ? error.message : String(error);
      const isConnectionError = errorMessage.includes('Stream isn\'t writeable') ||
                               errorMessage.includes('Connection') ||
                               errorMessage.includes('ECONNREFUSED') ||
                               errorMessage.includes('ECONNRESET');
      
      // Only use in-memory fallback for connection errors, not for other Redis errors
      if (!isConnectionError) {
        // For non-connection errors, reject the request to prioritize Redis
        if (process.env.NODE_ENV === 'development') {
          console.error('Redis rate limit error (non-connection):', error);
        }
        // Still allow request but log the error
      } else if (process.env.NODE_ENV === 'development') {
        console.warn('Redis rate limit error, using in-memory fallback:', error);
      }
    }
  }
  
  // Fallback to in-memory rate limiting (ONLY when Redis unavailable)
  // This should rarely happen in production if Redis is properly configured
  const entry = rateLimitStore.get(key);
  
  // Get violations for progressive rate limiting (in-memory)
  let effectiveLimit = maxRequests;
  if (progressivePenalty && entry?.violations !== undefined) {
    effectiveLimit = calculateEffectiveLimit(maxRequests, entry.violations);
  }
  
  // No entry exists, create new one
  if (!entry) {
    rateLimitStore.set(key, {
      count: 1,
      resetAt: now + windowMs,
      violations: 0,
    });
    return null;
  }
  
  // Entry expired, reset it
  if (now > entry.resetAt) {
    rateLimitStore.set(key, {
      count: 1,
      resetAt: now + windowMs,
      violations: 0, // Reset violations after window expires
    });
    return null;
  }
  
  // Check if limit exceeded
  if (entry.count >= effectiveLimit) {
    // Increment violations for progressive rate limiting
    if (progressivePenalty) {
      entry.violations = (entry.violations || 0) + 1;
      rateLimitStore.set(key, entry);
      
      // Auto-blacklist after 20 violations (match Redis behavior)
      if (entry.violations >= 20) {
        await blacklistIp(ip, 3600); // 1 hour (match Redis behavior)
      }
    }
    
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
          'X-RateLimit-Limit': effectiveLimit.toString(),
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset': new Date(entry.resetAt).toISOString(),
          ...(entry.violations ? { 'X-RateLimit-Violations': entry.violations.toString() } : {}),
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
 * Calculate GraphQL query complexity
 * Returns: { complexity: number, depth: number, fieldCount: number }
 */
export function calculateGraphQLComplexity(query: string): {
  complexity: number;
  depth: number;
  fieldCount: number;
} {
  if (!query || typeof query !== 'string') {
    return { complexity: 0, depth: 0, fieldCount: 0 };
  }

  // Remove comments and normalize whitespace
  const normalized = query.replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, '').replace(/\s+/g, ' ');
  
  // Count depth (nested braces)
  let depth = 0;
  let maxDepth = 0;
  
  for (let i = 0; i < normalized.length; i++) {
    const char = normalized[i];
    
    if (char === '{') {
      depth++;
      maxDepth = Math.max(maxDepth, depth);
    } else if (char === '}') {
      depth--;
    }
  }
  
  // Count fields (words that appear before { or ( or ,)
  const fieldMatches = normalized.match(/\b\w+\s*[({,]/g);
  const fieldCount = fieldMatches ? fieldMatches.length : 0;
  
  // Calculate complexity: depth * fieldCount * 10 (base multiplier)
  const complexity = maxDepth * fieldCount * 10;
  
  return {
    complexity,
    depth: maxDepth,
    fieldCount
  };
}

/**
 * Rate limiter for GraphQL queries based on complexity
 */
export async function graphQLComplexityRateLimiter(
  req: NextRequest,
  query: string,
  userId: number | null,
  baseLimit: number = 5000 // Base complexity limit (increased from 1000)
): Promise<NextResponse | null> {
  const { complexity, depth, fieldCount } = calculateGraphQLComplexity(query);
  
  // Reject queries that are too deep (prevent nested attacks)
  if (depth > 15) { // Increased from 10
    return NextResponse.json(
      { 
        errors: [{ 
          message: 'Query depth exceeds maximum allowed (15 levels)',
          extensions: { code: 'QUERY_TOO_DEEP', depth, maxDepth: 15 }
        }] 
      },
      { status: 400 }
    );
  }
  
  // Reject queries with too many fields
  if (fieldCount > 200) { // Increased from 100
    return NextResponse.json(
      { 
        errors: [{ 
          message: 'Query contains too many fields (maximum 200)',
          extensions: { code: 'QUERY_TOO_LARGE', fieldCount, maxFields: 200 }
        }] 
      },
      { status: 400 }
    );
  }
  
  // Apply complexity-based rate limiting
  // Higher complexity queries consume more of the limit
  const complexityMultiplier = Math.ceil(complexity / 200); // Each 200 complexity = 1 request (increased from 100)
  const effectiveLimit = Math.floor(baseLimit / Math.max(1, complexityMultiplier));
  
  // Also apply absolute request count limit
  const absoluteLimit = 500; // Max 500 requests per minute regardless of complexity (increased from 100)
  
  const ip = getClientIp(req);
  const key = userId 
    ? `graphql-complexity:${userId}:${ip}` 
    : `graphql-complexity:${ip}`;
  
  return rateLimit(req, {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: Math.min(effectiveLimit, absoluteLimit),
    message: `Query complexity too high. Please simplify your query. (Complexity: ${complexity}, Limit: ${effectiveLimit})`,
    keyGenerator: () => key,
    progressivePenalty: false, // Disabled progressive penalty for legitimate use
    burstLimit: 50, // Allow 50 complex queries in 1 second (increased from 10)
    burstWindowMs: 1000,
  });
}

/**
 * Rate limiter for WebSocket connections
 */
export async function websocketConnectionRateLimiter(
  ip: string,
  userId: number | null
): Promise<{ allowed: boolean; reason?: string; retryAfter?: number }> {
  // Check IP blacklist
  if (await isIpBlacklisted(ip)) {
    return {
      allowed: false,
      reason: 'IP address is blacklisted',
      retryAfter: 3600
    };
  }
  
  const redis = getRedisClient();
  const key = userId ? `ws-connection:${userId}:${ip}` : `ws-connection:${ip}`;
  const redisKey = `rate-limit:${key}`;
  
  // Limit: 10 connections per minute per IP/user
  const maxConnections = 10;
  const windowMs = 60 * 1000; // 1 minute
  const ttlSeconds = Math.ceil(windowMs / 1000);
  
  if (redis && isRedisAvailable()) {
    try {
      const count = await redis.eval(RATE_LIMIT_LUA_SCRIPT, 1, redisKey, ttlSeconds) as number;
      
      if (count > maxConnections) {
        const ttl = await redis.ttl(redisKey);
        return {
          allowed: false,
          reason: 'Too many WebSocket connections',
          retryAfter: ttl > 0 ? ttl : ttlSeconds
        };
      }
      
      return { allowed: true };
    } catch (error) {
      // On Redis error, fall back to in-memory rate limiting
      // Log the error with details
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;
      if (process.env.NODE_ENV === 'development') {
        console.warn('WebSocket connection rate limit Redis error, falling back to in-memory limiter:', {
          error: errorMessage,
          stack: errorStack,
          key,
        });
      }
      // Fall through to in-memory rate limiting below
    }
  }
  
  // In-memory fallback (used when Redis is unavailable or errors occur)
  const entry = rateLimitStore.get(key);
  const now = Date.now();
  
  if (!entry) {
    rateLimitStore.set(key, {
      count: 1,
      resetAt: now + windowMs,
    });
    return { allowed: true };
  }
  
  if (now > entry.resetAt) {
    rateLimitStore.set(key, {
      count: 1,
      resetAt: now + windowMs,
    });
    return { allowed: true };
  }
  
  if (entry.count >= maxConnections) {
    const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
    return {
      allowed: false,
      reason: 'Too many WebSocket connections',
      retryAfter
    };
  }
  
  entry.count += 1;
  rateLimitStore.set(key, entry);
  return { allowed: true };
}

/**
 * Rate limiter for WebSocket messages
 */
export async function websocketMessageRateLimiter(
  ip: string,
  userId: number | null
): Promise<{ allowed: boolean; reason?: string; retryAfter?: number }> {
  const redis = getRedisClient();
  const key = userId ? `ws-message:${userId}:${ip}` : `ws-message:${ip}`;
  const redisKey = `rate-limit:${key}`;
  
  // Limit: 100 messages per second per connection
  const maxMessages = 100;
  const windowMs = 1000; // 1 second
  const ttlSeconds = Math.ceil(windowMs / 1000);
  
  if (redis && isRedisAvailable()) {
    try {
      const count = await redis.eval(RATE_LIMIT_LUA_SCRIPT, 1, redisKey, ttlSeconds) as number;
      
      if (count > maxMessages) {
        const ttl = await redis.ttl(redisKey);
        return {
          allowed: false,
          reason: 'Too many WebSocket messages',
          retryAfter: ttl > 0 ? ttl : ttlSeconds
        };
      }
      
      return { allowed: true };
    } catch (error) {
      // On Redis error, fall back to in-memory rate limiting
      // Log the error with details
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;
      if (process.env.NODE_ENV === 'development') {
        console.warn('WebSocket message rate limit Redis error, falling back to in-memory limiter:', {
          error: errorMessage,
          stack: errorStack,
          key,
        });
      }
      // Fall through to in-memory rate limiting below
    }
  }
  
  // In-memory fallback (used when Redis is unavailable or errors occur)
  const entry = rateLimitStore.get(key);
  const now = Date.now();
  
  if (!entry) {
    rateLimitStore.set(key, {
      count: 1,
      resetAt: now + windowMs,
    });
    return { allowed: true };
  }
  
  if (now > entry.resetAt) {
    rateLimitStore.set(key, {
      count: 1,
      resetAt: now + windowMs,
    });
    return { allowed: true };
  }
  
  if (entry.count >= maxMessages) {
    const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
    return {
      allowed: false,
      reason: 'Too many WebSocket messages',
      retryAfter
    };
  }
  
  entry.count += 1;
  rateLimitStore.set(key, entry);
  return { allowed: true };
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
 * Enhanced with progressive penalty and burst protection
 */
export const loginRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  maxRequests: 5,
  message: 'Too many login attempts. Please try again in 15 minutes.',
  keyGenerator: (req) => {
    const ip = getClientIp(req);
    return `login:${ip}`;
  },
  progressivePenalty: true, // Enable progressive rate limiting
  burstLimit: 3, // Allow max 3 attempts in 1 second
  burstWindowMs: 1000,
});

/**
 * Auth: Registration - 5 per hour per IP
 * Enhanced with progressive penalty and burst protection
 */
export const registerRateLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000, // 1 hour
  maxRequests: 5,
  message: 'Too many registration attempts. Please try again later.',
  keyGenerator: (req) => {
    const ip = getClientIp(req);
    return `register:${ip}`;
  },
  progressivePenalty: true,
  burstLimit: 2, // Allow max 2 registrations in 1 second
  burstWindowMs: 1000,
});

/** Unauthenticated NIB/NPWP uploads during distributor registration. */
export const kycRegisterUploadRateLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000,
  maxRequests: 12,
  message: 'Too many document uploads. Please try again later.',
  keyGenerator: (req) => {
    const ip = getClientIp(req);
    return `kyc-register-upload:${ip}`;
  },
  progressivePenalty: true,
  burstLimit: 4,
  burstWindowMs: 2000,
});

export const verifyEmailRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  maxRequests: 12,
  message: 'Too many verification attempts. Please try again later.',
  keyGenerator: (req) => {
    const ip = getClientIp(req);
    return `verify-email:${ip}`;
  },
  progressivePenalty: true,
  burstLimit: 4,
  burstWindowMs: 2000,
});

export const kycResubmitRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  maxRequests: 20,
  message: 'Too many document resubmit attempts. Please try again later.',
  keyGenerator: (req) => {
    const ip = getClientIp(req);
    return `kyc-resubmit:${ip}`;
  },
  progressivePenalty: true,
  burstLimit: 6,
  burstWindowMs: 2000,
});


/**
 * Auth: OTP Request - 5 per 5 minutes per phone number
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
    maxRequests: 5,
    message: 'Too many OTP requests. Please try again in 5 minutes.',
    keyGenerator: () => key,
  });
}

/**
 * Auth: Password Reset - 5 per hour per email
 */
export async function passwordResetRateLimiter(
  req: NextRequest,
  email: string
): Promise<NextResponse | null> {
  const ip = getClientIp(req);
  const key = `password-reset:${email}:${ip}`;
  
  return rateLimit(req, {
    windowMs: 60 * 60 * 1000, // 1 hour
    maxRequests: 5,
    message: 'Too many password reset requests. Please try again in 1 hour.',
    keyGenerator: () => key,
  });
}

/**
 * Password reset code verification - 10 attempts per 15 minutes per email+IP.
 * More lenient than the reset-request limiter (this is a non-consuming check used
 * by the multi-step reset wizard) but still throttles brute-forcing the 6-digit code.
 */
export async function passwordResetVerifyRateLimiter(
  req: NextRequest,
  email: string
): Promise<NextResponse | null> {
  const ip = getClientIp(req);
  const key = `password-reset-verify:${email}:${ip}`;

  return rateLimit(req, {
    windowMs: 15 * 60 * 1000, // 15 minutes
    maxRequests: 10,
    message: 'Too many verification attempts. Please try again in a few minutes.',
    keyGenerator: () => key,
  });
}

/**
 * Orders: Creation - 100 per hour per user (or IP if userId is null)
 */
export async function orderCreationRateLimiter(
  req: NextRequest,
  userId: number | null
): Promise<NextResponse | null> {
  const ip = getClientIp(req);
  const key = userId ? `order-create:${userId}:${ip}` : `order-create:${ip}`;
  
  return rateLimit(req, {
    windowMs: 60 * 60 * 1000, // 1 hour
    maxRequests: 100,
    message: 'Too many orders created. Please try again later.',
    keyGenerator: () => key,
  });
}

/**
 * Orders: Queries - 100 per minute per user (or IP if userId is null)
 */
export async function orderQueryRateLimiter(
  req: NextRequest,
  userId: number | null
): Promise<NextResponse | null> {
  const ip = getClientIp(req);
  const key = userId ? `order-query:${userId}:${ip}` : `order-query:${ip}`;
  
  return rateLimit(req, {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 100,
    message: 'Too many order queries. Please slow down.',
    keyGenerator: () => key,
  });
}

/**
 * Orders: Updates - 50 per minute per user (or IP if userId is null)
 */
export async function orderUpdateRateLimiter(
  req: NextRequest,
  userId: number | null
): Promise<NextResponse | null> {
  const ip = getClientIp(req);
  const key = userId ? `order-update:${userId}:${ip}` : `order-update:${ip}`;
  
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
 * Offers: Creation - 100 per hour per user
 */
export async function offerCreationRateLimiter(
  req: NextRequest,
  userId: number | null
): Promise<NextResponse | null> {
  const ip = getClientIp(req);
  const key = userId ? `offer-create:${userId}:${ip}` : `offer-create:${ip}`;
  
  return rateLimit(req, {
    windowMs: 60 * 60 * 1000, // 1 hour
    maxRequests: 100,
    message: 'Too many offers created. Please try again later.',
    keyGenerator: () => key,
  });
}

/**
 * Offers: Updates - 100 per hour per user
 */
export async function offerUpdateRateLimiter(
  req: NextRequest,
  userId: number | null
): Promise<NextResponse | null> {
  const ip = getClientIp(req);
  const key = userId ? `offer-update:${userId}:${ip}` : `offer-update:${ip}`;
  
  return rateLimit(req, {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 200,
    message: 'Too many offer updates. Please try again later.',
    keyGenerator: () => key,
  });
}

/**
 * Offers: Queries - 100 per minute per user
 */
export async function offerQueryRateLimiter(
  req: NextRequest,
  userId: number | null
): Promise<NextResponse | null> {
  const ip = getClientIp(req);
  const key = userId ? `offer-query:${userId}:${ip}` : `offer-query:${ip}`;
  
  return rateLimit(req, {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 100,
    message: 'Too many offer queries. Please slow down.',
    keyGenerator: () => key,
  });
}

/**
 * Marketplace: Public product search - 1000 per minute per IP
 * Enhanced with burst protection for better UX
 */
export async function marketplaceSearchRateLimiter(
  req: NextRequest
): Promise<NextResponse | null> {
  const ip = getClientIp(req);
  const key = `marketplace-search:${ip}`;
  
  return rateLimit(req, {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 1000,
    message: 'Too many marketplace searches. Please slow down.',
    keyGenerator: () => key,
    progressivePenalty: true,
    burstLimit: 20, // Allow 20 searches in 1 second (for autocomplete)
    burstWindowMs: 1000,
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
 * Marketplace: Checkout seller bank lookup - strict to prevent enumeration
 * 30 per minute per buyer+seller+ip, with burst protection and progressive penalty.
 */
export async function checkoutSellerBankRateLimiter(
  req: NextRequest,
  marketplaceUserId: number,
  sellerUserId: number
): Promise<NextResponse | null> {
  const ip = getClientIp(req);
  const key = `checkout-seller-bank:${marketplaceUserId}:${sellerUserId}:${ip}`;

  return rateLimit(req, {
    windowMs: 60 * 1000,
    maxRequests: 30,
    message: 'Too many bank detail lookups. Please slow down.',
    keyGenerator: () => key,
    progressivePenalty: true,
    burstLimit: 6,
    burstWindowMs: 1000,
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
    maxRequests: 100,
    message: 'Too many activity tracking requests. Please slow down.',
    keyGenerator: () => key,
  });
}

/**
 * Marketplace: Address CRUD - 100 per hour per user
 */
export async function addressOperationRateLimiter(
  req: NextRequest,
  userId: number
): Promise<NextResponse | null> {
  const ip = getClientIp(req);
  const key = `address-operation:${userId}:${ip}`;
  
  return rateLimit(req, {
    windowMs: 60 * 60 * 1000, // 1 hour
    maxRequests: 100,
    message: 'Too many address operations. Please try again later.',
    keyGenerator: () => key,
  });
}

/**
 * Image Upload - 100 per hour per user (or IP if userId is null)
 */
export async function imageUploadRateLimiter(
  req: NextRequest,
  userId: number | null
): Promise<NextResponse | null> {
  const ip = getClientIp(req);
  const key = userId ? `image-upload:${userId}:${ip}` : `image-upload:${ip}`;
  
  return rateLimit(req, {
    windowMs: 60 * 60 * 1000, // 1 hour
    maxRequests: 100,
    message: 'Too many image uploads. Please try again later.',
    keyGenerator: () => key,
  });
}

/**
 * Image Delete - 100 per hour per user (or IP if userId is null)
 */
export async function imageDeleteRateLimiter(
  req: NextRequest,
  userId: number | null
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
 * Products: Creation - 100 per hour per user (or IP if userId is null)
 */
export async function productCreationRateLimiter(
  req: NextRequest,
  userId: number | null
): Promise<NextResponse | null> {
  const ip = getClientIp(req);
  const key = userId ? `product-create:${userId}:${ip}` : `product-create:${ip}`;
  
  return rateLimit(req, {
    windowMs: 60 * 60 * 1000, // 1 hour
    maxRequests: 100,
    message: 'Too many products created. Please try again later.',
    keyGenerator: () => key,
  });
}

/**
 * Products: Updates - 100 per hour per user (or IP if userId is null)
 */
export async function productUpdateRateLimiter(
  req: NextRequest,
  userId: number | null
): Promise<NextResponse | null> {
  const ip = getClientIp(req);
  const key = userId ? `product-update:${userId}:${ip}` : `product-update:${ip}`;
  
  return rateLimit(req, {
    windowMs: 60 * 60 * 1000, // 1 hour
    maxRequests: 100,
    message: 'Too many product updates. Please try again later.',
    keyGenerator: () => key,
  });
}

/**
 * Products: Queries - 100 per minute per user (or IP if userId is null)
 */
export async function productQueryRateLimiter(
  req: NextRequest,
  userId: number | null
): Promise<NextResponse | null> {
  const ip = getClientIp(req);
  const key = userId ? `product-query:${userId}:${ip}` : `product-query:${ip}`;
  
  return rateLimit(req, {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 100,
    message: 'Too many product queries. Please slow down.',
    keyGenerator: () => key,
  });
}

/**
 * Products: Bulk Publish - 100 per hour per user (or IP if userId is null)
 */
export async function productBulkPublishRateLimiter(
  req: NextRequest,
  userId: number | null
): Promise<NextResponse | null> {
  const ip = getClientIp(req);
  const key = userId ? `product-bulk-publish:${userId}:${ip}` : `product-bulk-publish:${ip}`;
  
  return rateLimit(req, {
    windowMs: 60 * 60 * 1000, // 1 hour
    maxRequests: 100,
    message: 'Too many bulk publish operations. Please try again later.',
    keyGenerator: () => key,
  });
}

/**
 * Campaigns: Query operations - 100 per hour per user
 */
export async function campaignQueryRateLimiter(
  req: NextRequest,
  userId: number | null
): Promise<NextResponse | null> {
  const ip = getClientIp(req);
  const key = userId ? `campaign-query:${userId}:${ip}` : `campaign-query:${ip}`;
  
  return rateLimit(req, {
    windowMs: 60 * 60 * 1000, // 1 hour
    maxRequests: 100,
    message: 'Too many campaign queries. Please slow down.',
    keyGenerator: () => key,
  });
}

/**
 * Campaigns: Creation - 100 per hour per user
 */
export async function campaignCreationRateLimiter(
  req: NextRequest,
  userId: number | null
): Promise<NextResponse | null> {
  const ip = getClientIp(req);
  const key = userId ? `campaign-create:${userId}:${ip}` : `campaign-create:${ip}`;
  
  return rateLimit(req, {
    windowMs: 60 * 60 * 1000, // 1 hour
    maxRequests: 100,
    message: 'Too many campaigns created. Please try again later.',
    keyGenerator: () => key,
  });
}

/**
 * Campaigns: Update operations - 100 per hour per user
 */
export async function campaignUpdateRateLimiter(
  req: NextRequest,
  userId: number | null
): Promise<NextResponse | null> {
  const ip = getClientIp(req);
  const key = userId ? `campaign-update:${userId}:${ip}` : `campaign-update:${ip}`;
  
  return rateLimit(req, {
    windowMs: 60 * 60 * 1000, // 1 hour
    maxRequests: 100,
    message: 'Too many campaign updates. Please try again later.',
    keyGenerator: () => key,
  });
}

/**
 * Campaigns: Email send - 20 per hour per user (SMTP is expensive)
 */
export async function campaignSendRateLimiter(
  req: NextRequest,
  userId: number | null
): Promise<NextResponse | null> {
  const ip = getClientIp(req);
  const key = userId != null ? `campaign-send:${userId}` : `campaign-send:${ip}`;

  return rateLimit(req, {
    windowMs: 60 * 60 * 1000, // 1 hour
    maxRequests: 20,
    message: 'Too many campaign sends. Please try again later.',
    keyGenerator: () => key,
  });
}

/**
 * Clients (Buyers/Suppliers): Query operations - 100 per hour per user
 */
export async function clientQueryRateLimiter(
  req: NextRequest,
  userId: number | null
): Promise<NextResponse | null> {
  const ip = getClientIp(req);
  const key = userId ? `client-query:${userId}:${ip}` : `client-query:${ip}`;
  
  return rateLimit(req, {
    windowMs: 60 * 60 * 1000, // 1 hour
    maxRequests: 100,
    message: 'Too many client queries. Please slow down.',
    keyGenerator: () => key,
  });
}

/**
 * Clients (Buyers/Suppliers): Creation - 100 per hour per user
 */
export async function clientCreationRateLimiter(
  req: NextRequest,
  userId: number | null
): Promise<NextResponse | null> {
  const ip = getClientIp(req);
  const key = userId ? `client-create:${userId}:${ip}` : `client-create:${ip}`;
  
  return rateLimit(req, {
    windowMs: 60 * 60 * 1000, // 1 hour
    maxRequests: 100,
    message: 'Too many clients created. Please try again later.',
    keyGenerator: () => key,
  });
}

/**
 * Clients (Buyers/Suppliers): Update operations - 100 per hour per user
 */
export async function clientUpdateRateLimiter(
  req: NextRequest,
  userId: number | null
): Promise<NextResponse | null> {
  const ip = getClientIp(req);
  const key = userId ? `client-update:${userId}:${ip}` : `client-update:${ip}`;
  
  return rateLimit(req, {
    windowMs: 60 * 60 * 1000, // 1 hour
    maxRequests: 100,
    message: 'Too many client updates. Please try again later.',
    keyGenerator: () => key,
  });
}

/**
 * Settings/User: All operations - 100 per hour per user
 */
export async function settingsOperationRateLimiter(
  req: NextRequest,
  userId: number | null
): Promise<NextResponse | null> {
  const ip = getClientIp(req);
  const key = userId ? `settings-operation:${userId}:${ip}` : `settings-operation:${ip}`;
  
  return rateLimit(req, {
    windowMs: 60 * 60 * 1000, // 1 hour
    maxRequests: 100,
    message: 'Too many settings updates. Please try again later.',
    keyGenerator: () => key,
  });
}

/**
 * Sales: All operations - 100 per hour per user
 */
export async function salesOperationRateLimiter(
  req: NextRequest,
  userId: number | null
): Promise<NextResponse | null> {
  const ip = getClientIp(req);
  const key = userId ? `sales-operation:${userId}:${ip}` : `sales-operation:${ip}`;
  
  return rateLimit(req, {
    windowMs: 60 * 60 * 1000, // 1 hour
    maxRequests: 100,
    message: 'Too many sales operations. Please try again later.',
    keyGenerator: () => key,
  });
}

/**
 * Dashboard: Query operations - 100 per hour per user
 */
export async function dashboardQueryRateLimiter(
  req: NextRequest,
  userId: number | null
): Promise<NextResponse | null> {
  const ip = getClientIp(req);
  const key = userId ? `dashboard-query:${userId}:${ip}` : `dashboard-query:${ip}`;
  
  return rateLimit(req, {
    windowMs: 60 * 60 * 1000, // 1 hour
    maxRequests: 100,
    message: 'Too many dashboard queries. Please slow down.',
    keyGenerator: () => key,
  });
}

// ============================================================================
// HIGH-ABUSE MUTATION ENDPOINTS (MOBILE / TELEMETRY / COST AMPLIFIERS)
// ============================================================================

/**
 * Marketplace: Pay intent - buyer indicates they will pay manually.
 * Tight per-user limits because this triggers fanout (DB notification, WS, push).
 */
export async function marketplacePayIntentRateLimiter(
  req: NextRequest,
  marketplaceUserId: number
): Promise<NextResponse | null> {
  const ip = getClientIp(req);
  const key = `marketplace-pay-intent:${marketplaceUserId}:${ip}`;

  return rateLimit(req, {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 10,
    message: 'Too many payment intent requests. Please slow down.',
    keyGenerator: () => key,
    progressivePenalty: true,
    burstLimit: 2,
    burstWindowMs: 1000,
  });
}

/**
 * Marketplace: Return / refund request - creates DB row and notifications.
 * Keep this strict to reduce fraud/spam and DB write amplification.
 */
export async function marketplaceReturnRequestRateLimiter(
  req: NextRequest,
  marketplaceUserId: number
): Promise<NextResponse | null> {
  const ip = getClientIp(req);
  const key = `marketplace-return-request:${marketplaceUserId}:${ip}`;

  return rateLimit(req, {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 10,
    message: 'Too many return requests. Please slow down.',
    keyGenerator: () => key,
    progressivePenalty: true,
    burstLimit: 1,
    burstWindowMs: 1000,
  });
}

/**
 * Mapbox Geocode proxy - high cost amplifier (can fan out to many external calls).
 * Enforce per-user limits even though auth is required.
 */
export async function mapboxGeocodeRateLimiter(
  req: NextRequest,
  userId: number
): Promise<NextResponse | null> {
  const ip = getClientIp(req);
  const key = `mapbox-geocode:${userId}:${ip}`;

  return rateLimit(req, {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 60,
    message: 'Too many geocoding requests. Please slow down.',
    keyGenerator: () => key,
    progressivePenalty: true,
    burstLimit: 3,
    burstWindowMs: 1000,
  });
}

/**
 * Marketplace address geocode (Google proxy). Works without auth during signup.
 */
export async function mobileGeocodeRateLimiter(
  req: NextRequest,
  userId?: number | null,
): Promise<NextResponse | null> {
  const ip = getClientIp(req);
  const key = userId ? `mobile-geocode:user:${userId}:${ip}` : `mobile-geocode:ip:${ip}`;

  return rateLimit(req, {
    windowMs: 60 * 1000,
    maxRequests: userId ? 90 : 45,
    message: 'Too many geocoding requests. Please slow down.',
    keyGenerator: () => key,
    progressivePenalty: true,
    burstLimit: 4,
    burstWindowMs: 1000,
  });
}

/**
 * Telemetry: Session samples - high frequency mutation endpoint.
 * Separate from dashboardQueryRateLimiter; this is write-heavy and should be capped.
 */
export async function telemetrySessionRateLimiter(
  req: NextRequest,
  userId: number
): Promise<NextResponse | null> {
  const ip = getClientIp(req);
  const key = `telemetry-session:${userId}:${ip}`;

  return rateLimit(req, {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 60,
    message: 'Too many telemetry requests. Please slow down.',
    keyGenerator: () => key,
    burstLimit: 20,
    burstWindowMs: 1000,
  });
}

/**
 * Driver Telemetry: Session samples - high frequency mutation endpoint.
 */
export async function driverTelemetrySessionRateLimiter(
  req: NextRequest,
  driverId: number
): Promise<NextResponse | null> {
  const ip = getClientIp(req);
  const key = `driver-telemetry-session:${driverId}:${ip}`;

  return rateLimit(req, {
    windowMs: 60 * 1000,
    maxRequests: 60,
    message: 'Too many telemetry requests. Please slow down.',
    keyGenerator: () => key,
    burstLimit: 20,
    burstWindowMs: 1000,
  });
}

/**
 * Campaign tracking (open/click) - public-ish mutation; protect from abuse/skew.
 */
export async function campaignTrackRateLimiter(req: NextRequest): Promise<NextResponse | null> {
  const ip = getClientIp(req);
  const key = `campaign-track:${ip}`;

  return rateLimit(req, {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 30,
    message: 'Too many tracking events. Please slow down.',
    keyGenerator: () => key,
    burstLimit: 10,
    burstWindowMs: 1000,
  });
}

/**
 * Marketplace push token CRUD - protect from churn/abuse.
 */
export async function marketplacePushTokenRateLimiter(
  req: NextRequest,
  marketplaceUserId: number
): Promise<NextResponse | null> {
  const ip = getClientIp(req);
  const key = `marketplace-push-token:${marketplaceUserId}:${ip}`;

  return rateLimit(req, {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 30,
    message: 'Too many push token operations. Please slow down.',
    keyGenerator: () => key,
    burstLimit: 5,
    burstWindowMs: 1000,
  });
}

/**
 * Marketplace: Generic mutation limiter - use for write operations that don't have a dedicated preset.
 * Keep keys action-scoped to avoid cross-endpoint starvation.
 */
export async function marketplaceMutationRateLimiter(
  req: NextRequest,
  marketplaceUserId: number,
  action: string
): Promise<NextResponse | null> {
  const ip = getClientIp(req);
  const safeAction = String(action || 'mutation').slice(0, 64);
  const key = `marketplace-mutation:${safeAction}:${marketplaceUserId}:${ip}`;

  return rateLimit(req, {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 30,
    message: 'Too many requests. Please slow down.',
    keyGenerator: () => key,
    burstLimit: 10,
    burstWindowMs: 1000,
  });
}

/**
 * Driver: Generic mutation limiter - use for driver-authenticated write operations.
 */
export async function driverMutationRateLimiter(
  req: NextRequest,
  driverId: number,
  action: string
): Promise<NextResponse | null> {
  const ip = getClientIp(req);
  const safeAction = String(action || 'mutation').slice(0, 64);
  const key = `driver-mutation:${safeAction}:${driverId}:${ip}`;

  return rateLimit(req, {
    windowMs: 60 * 1000,
    maxRequests: 30,
    message: 'Too many requests. Please slow down.',
    keyGenerator: () => key,
    burstLimit: 10,
    burstWindowMs: 1000,
  });
}

/**
 * OTP verification - strict to prevent brute-force even when UI doesn't call it.
 * Keyed by phone+ip to reduce credential stuffing across numbers.
 */
export async function otpVerifyRateLimiter(
  req: NextRequest,
  phone: string
): Promise<NextResponse | null> {
  const ip = getClientIp(req);
  const safePhone = String(phone || '').trim().slice(0, 32);
  const key = `otp-verify:${safePhone}:${ip}`;

  return rateLimit(req, {
    windowMs: 5 * 60 * 1000, // 5 minutes
    maxRequests: 10,
    message: 'Too many verification attempts. Please try again in a few minutes.',
    keyGenerator: () => key,
    progressivePenalty: true,
    burstLimit: 5,
    burstWindowMs: 1000,
  });
}

/**
 * Platform Admin: Mutation operations - protect admin surfaces from abuse (session theft, automation).
 */
export async function platformAdminMutationRateLimiter(
  req: NextRequest,
  adminId: number
): Promise<NextResponse | null> {
  const ip = getClientIp(req);
  const key = `platform-admin-mutation:${adminId}:${ip}`;

  return rateLimit(req, {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 60,
    message: 'Too many admin operations. Please slow down.',
    keyGenerator: () => key,
    burstLimit: 20,
    burstWindowMs: 1000,
  });
}

/**
 * Platform Admin: Read-heavy operations (analytics/search/users) - these can be expensive.
 */
export async function platformAdminReadRateLimiter(
  req: NextRequest,
  adminId: number,
  action: string
): Promise<NextResponse | null> {
  const ip = getClientIp(req);
  const safeAction = String(action || 'read').slice(0, 64);
  const key = `platform-admin-read:${safeAction}:${adminId}:${ip}`;

  return rateLimit(req, {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 120,
    message: 'Too many requests. Please slow down.',
    keyGenerator: () => key,
    burstLimit: 30,
    burstWindowMs: 1000,
  });
}

/**
 * Token issuance endpoints (ws-token, etc.) - tighter because they can be abused to scale access.
 */
export async function tokenIssueRateLimiter(
  req: NextRequest,
  subjectId: number,
  kind: 'dashboard' | 'platform-admin'
): Promise<NextResponse | null> {
  const ip = getClientIp(req);
  const key = `token-issue:${kind}:${subjectId}:${ip}`;

  return rateLimit(req, {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 20,
    message: 'Too many token requests. Please slow down.',
    keyGenerator: () => key,
    progressivePenalty: true,
    burstLimit: 8,
    burstWindowMs: 1000,
  });
}

/**
 * Driver: Push token operations - protect from token churn.
 */
export async function driverPushTokenRateLimiter(
  req: NextRequest,
  driverId: number
): Promise<NextResponse | null> {
  const ip = getClientIp(req);
  const key = `driver-push-token:${driverId}:${ip}`;

  return rateLimit(req, {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 10,
    message: 'Too many push token operations. Please slow down.',
    keyGenerator: () => key,
    burstLimit: 5,
    burstWindowMs: 1000,
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

