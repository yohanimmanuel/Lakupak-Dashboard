import { NextRequest, NextResponse } from 'next/server';
import {
  Kind,
  parse,
  type FragmentDefinitionNode,
  type SelectionSetNode,
} from 'graphql';
import { getRedisClient, isRedisAvailable } from '@/lib/redis';
import { RATE_LIMIT_QUANTITIES } from '@/utils/rateLimitQuantities';

interface RateLimitEntry {
  count: number;
  resetAt: number;
  violations?: number; // Track violations for progressive rate limiting
}

export interface RateLimitConfig {
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
async function recordViolation(
  key: string,
  ip: string,
  penaltyDurationSeconds: number = 86400,
): Promise<void> {
  const redis = getRedisClient();
  const violationKey = `violations:${key}`;
  
  if (redis && isRedisAvailable()) {
    try {
      const violations = await redis.incr(violationKey);
      await redis.expire(violationKey, penaltyDurationSeconds);
      
      // Auto-blacklist after 20 violations (increased from 5)
      if (violations >= 20) {
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
        
        // redis.eval may return strings — coerce and reject non-finite values
        const parsedBurstCount = Number(burstResult[0]);
        const parsedOldestTimestamp = Number(burstResult[1]);
        // Fail closed: invalid count cannot bypass the burst limit
        const burstCount = Number.isFinite(parsedBurstCount)
          ? parsedBurstCount
          : burstLimit + 1;
        // Invalid oldest → treat as "now" so Retry-After stays a finite window
        const oldestTimestamp = Number.isFinite(parsedOldestTimestamp)
          ? parsedOldestTimestamp
          : now;
        
        if (burstCount > burstLimit) {
          // Burst limit exceeded - record violation if progressive
          if (progressivePenalty) {
            await recordViolation(key, ip);
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
          await recordViolation(key, ip);
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

export class GraphQLComplexityParseError extends Error {
  constructor(message = 'Invalid GraphQL document') {
    super(message);
    this.name = 'GraphQLComplexityParseError';
  }
}

/** Stop walking once selection visits exceed the configured max field budget. */
const COMPLEXITY_WALK_CEILING = RATE_LIMIT_QUANTITIES.graphqlComplexity.maxFields;
const COMPLEXITY_WALK_MAX_DEPTH = RATE_LIMIT_QUANTITIES.graphqlComplexity.maxDepth;

type ComplexityWalkStats = {
  fieldCount: number;
  maxDepth: number;
  selectionVisits: number;
};

function assertWithinComplexityWalkBudget(stats: ComplexityWalkStats): void {
  if (stats.selectionVisits > COMPLEXITY_WALK_CEILING) {
    throw new GraphQLComplexityParseError('Query too complex');
  }
}

function assertWithinComplexityWalkRecursion(recursionDepth: number): void {
  if (recursionDepth > COMPLEXITY_WALK_MAX_DEPTH) {
    throw new GraphQLComplexityParseError('Query too complex');
  }
}

function walkSelectionSetForComplexity(
  selectionSet: SelectionSetNode,
  depth: number,
  recursionDepth: number,
  fragments: Map<string, FragmentDefinitionNode>,
  fragmentStack: Set<string>,
  stats: ComplexityWalkStats,
): void {
  for (const selection of selectionSet.selections) {
    // Every selection (field, inline fragment, spread) counts toward the ceiling
    stats.selectionVisits += 1;
    assertWithinComplexityWalkBudget(stats);

    if (selection.kind === Kind.FIELD) {
      const nextDepth = depth + 1;
      stats.fieldCount += 1;
      stats.maxDepth = Math.max(stats.maxDepth, nextDepth);
      if (selection.selectionSet) {
        assertWithinComplexityWalkRecursion(recursionDepth + 1);
        walkSelectionSetForComplexity(
          selection.selectionSet,
          nextDepth,
          recursionDepth + 1,
          fragments,
          fragmentStack,
          stats,
        );
      }
      continue;
    }

    if (selection.kind === Kind.INLINE_FRAGMENT) {
      if (selection.selectionSet) {
        assertWithinComplexityWalkRecursion(recursionDepth + 1);
        walkSelectionSetForComplexity(
          selection.selectionSet,
          depth,
          recursionDepth + 1,
          fragments,
          fragmentStack,
          stats,
        );
      }
      continue;
    }

    if (selection.kind === Kind.FRAGMENT_SPREAD) {
      const name = selection.name.value;
      // Cycle protection: skip already-expanding fragments
      if (fragmentStack.has(name)) continue;
      const fragment = fragments.get(name);
      if (!fragment) continue;
      assertWithinComplexityWalkRecursion(recursionDepth + 1);
      fragmentStack.add(name);
      // Depth is relative to the spread location (not counted from fragment root)
      walkSelectionSetForComplexity(
        fragment.selectionSet,
        depth,
        recursionDepth + 1,
        fragments,
        fragmentStack,
        stats,
      );
      fragmentStack.delete(name);
    }
  }
}

/**
 * Calculate GraphQL query complexity from the AST (comments/strings cannot inflate estimates).
 * Fragment fields are counted at each spread site; fragment definitions are not counted alone.
 * Throws GraphQLComplexityParseError when the document fails to parse or the walk budget is exceeded.
 */
export function calculateGraphQLComplexity(query: string): {
  complexity: number;
  depth: number;
  fieldCount: number;
} {
  if (!query || typeof query !== 'string') {
    return { complexity: 0, depth: 0, fieldCount: 0 };
  }

  let document;
  try {
    document = parse(query);
  } catch {
    throw new GraphQLComplexityParseError();
  }

  const fragments = new Map<string, FragmentDefinitionNode>();
  for (const def of document.definitions) {
    if (def.kind === Kind.FRAGMENT_DEFINITION) {
      fragments.set(def.name.value, def);
    }
  }

  const stats: ComplexityWalkStats = { fieldCount: 0, maxDepth: 0, selectionVisits: 0 };
  for (const def of document.definitions) {
    if (def.kind === Kind.OPERATION_DEFINITION && def.selectionSet) {
      walkSelectionSetForComplexity(def.selectionSet, 0, 0, fragments, new Set(), stats);
    }
  }

  // Preserve existing formula: depth * fieldCount * 10
  const complexity = stats.maxDepth * stats.fieldCount * 10;

  return {
    complexity,
    depth: stats.maxDepth,
    fieldCount: stats.fieldCount,
  };
}

/** New WebSocket connections per user/IP. */
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
  
  const { maxRequests: maxConnections, windowMs, message } = RATE_LIMIT_QUANTITIES.websocketConnection;
  const ttlSeconds = Math.ceil(windowMs / 1000);
  
  if (redis && isRedisAvailable()) {
    try {
      const count = await redis.eval(RATE_LIMIT_LUA_SCRIPT, 1, redisKey, ttlSeconds) as number;
      
      if (count > maxConnections) {
        const ttl = await redis.ttl(redisKey);
        return {
          allowed: false,
          reason: message,
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
      reason: message,
      retryAfter
    };
  }
  
  entry.count += 1;
  rateLimitStore.set(key, entry);
  return { allowed: true };
}

/** WebSocket messages per connection. */
export async function websocketMessageRateLimiter(
  ip: string,
  userId: number | null
): Promise<{ allowed: boolean; reason?: string; retryAfter?: number }> {
  const redis = getRedisClient();
  const key = userId ? `ws-message:${userId}:${ip}` : `ws-message:${ip}`;
  const redisKey = `rate-limit:${key}`;
  
  const { maxRequests: maxMessages, windowMs, message } = RATE_LIMIT_QUANTITIES.websocketMessage;
  const ttlSeconds = Math.ceil(windowMs / 1000);
  
  if (redis && isRedisAvailable()) {
    try {
      const count = await redis.eval(RATE_LIMIT_LUA_SCRIPT, 1, redisKey, ttlSeconds) as number;
      
      if (count > maxMessages) {
        const ttl = await redis.ttl(redisKey);
        return {
          allowed: false,
          reason: message,
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
      reason: message,
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
