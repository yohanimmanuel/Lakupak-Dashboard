import { Prisma } from '@/generated/prisma';
import { getRedisClient, isRedisAvailable } from '@/lib/redis';
import { createHash } from 'crypto';

/**
 * Database query rate limiting
 * Limits the number of database queries per user/IP per time window
 */
interface QueryRateLimitConfig {
  maxQueries: number;
  windowMs: number;
  userId?: number | null;
  ip?: string;
}

/**
 * In-memory rate limit entry for fallback when Redis is unavailable
 */
interface MemoryRateLimitEntry {
  count: number;
  resetAt: number;
}

/**
 * In-memory rate limit store (fallback when Redis is unavailable)
 * Used primarily for anonymous requests when Redis is down
 */
const memoryRateLimits = new Map<string, MemoryRateLimitEntry>();

/**
 * Cleanup old entries from memory store every 5 minutes
 */
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of memoryRateLimits.entries()) {
    if (now > entry.resetAt) {
      memoryRateLimits.delete(key);
    }
  }
}, 5 * 60 * 1000); // Cleanup every 5 minutes

/**
 * Track and rate limit database queries
 * Anonymous requests (no userId or IP) are rate-limited with stricter limits
 */
export async function checkDatabaseQueryRateLimit(
  config: QueryRateLimitConfig
): Promise<{ allowed: boolean; reason?: string; retryAfter?: number }> {
  const { maxQueries, windowMs, userId, ip } = config;
  
  // Create identifier key - use userId only for authenticated users, IP only when userId is absent
  // This prevents fragmentation of user rate limits and avoids shared 'unknown' buckets
  const identifierKey = userId 
    ? `user:${userId}` 
    : ip 
    ? `ip:${ip}`
    : 'anonymous';
  
  // Apply stricter limits for anonymous requests (10% of normal limit)
  const effectiveMaxQueries = identifierKey === 'anonymous' 
    ? Math.max(1, Math.floor(maxQueries * 0.1)) // At least 1, but 10% of normal limit
    : maxQueries;
  
  const key = `db-query:${identifierKey}`;
  const redisKey = `rate-limit:${key}`;
  const ttlSeconds = Math.ceil(windowMs / 1000);
  
  const redis = getRedisClient();
  if (redis && isRedisAvailable()) {
    try {
      // Use Lua script for atomic increment
      const count = await redis.eval(
        `local count = redis.call('INCR', KEYS[1])
         local ttl = redis.call('TTL', KEYS[1])
         if count == 1 or ttl == -1 then
           redis.call('EXPIRE', KEYS[1], ARGV[1])
         end
         return count`,
        1,
        redisKey,
        ttlSeconds.toString()
      ) as number;
      
      if (count > effectiveMaxQueries) {
        const ttl = await redis.ttl(redisKey);
        const reason = identifierKey === 'anonymous'
          ? 'Too many anonymous database queries. Please authenticate or provide IP address.'
          : 'Too many database queries. Please slow down.';
        return {
          allowed: false,
          reason,
          retryAfter: ttl > 0 ? ttl : ttlSeconds
        };
      }
      
      return { allowed: true };
    } catch (error) {
      // On Redis error, allow query but log
      if (process.env.NODE_ENV === 'development') {
        console.warn('Database query rate limit Redis error:', error);
      }
      return { allowed: true };
    }
  }
  
  // In-memory fallback (should rarely happen in production)
  // For anonymous requests, apply strict in-memory rate limiting when Redis is unavailable
  if (identifierKey === 'anonymous') {
    // Strict limits for anonymous requests: 5 requests per minute
    const anonymousMaxQueries = 5;
    const anonymousWindowMs = 60 * 1000; // 1 minute
    
    const now = Date.now();
    const memoryKey = `db-query:anonymous`;
    let entry = memoryRateLimits.get(memoryKey);
    
    // Reset if window has passed
    if (!entry || now > entry.resetAt) {
      entry = {
        count: 0,
        resetAt: now + anonymousWindowMs,
      };
    }
    
    // Increment count
    entry.count++;
    memoryRateLimits.set(memoryKey, entry);
    
    // Check if limit exceeded
    if (entry.count > anonymousMaxQueries) {
      const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
      return {
        allowed: false,
        reason: 'Too many anonymous database queries. Please authenticate or provide IP address.',
        retryAfter: retryAfter > 0 ? retryAfter : Math.ceil(anonymousWindowMs / 1000),
      };
    }
    
    // Log warning in development
    if (process.env.NODE_ENV === 'development') {
      console.warn('Database query rate limit: Anonymous request using in-memory fallback (Redis unavailable)');
    }
    
    return { allowed: true };
  }
  
  // For non-anonymous requests when Redis is unavailable, allow (logged requests can be tracked separately)
  // In production, Redis should be available, so this is a fallback
  return { allowed: true };
}

/**
 * Database query complexity limits
 */
interface QueryComplexityConfig {
  maxJoins?: number;
  maxResultSize?: number;
  maxWhereConditions?: number;
}

/**
 * Analyze Prisma query for complexity
 */
export function analyzeQueryComplexity(
  query: Prisma.PrismaPromise<unknown>
): QueryComplexityConfig {
  // This is a simplified analysis - Prisma doesn't expose query structure easily
  // In production, you might want to use Prisma middleware or query logging
  return {
    maxJoins: 10, // Default limit
    maxResultSize: 10000, // Default limit
    maxWhereConditions: 20, // Default limit
  };
}

/**
 * Database access logging
 */
interface DatabaseLogEntry {
  timestamp: Date;
  userId?: number | null;
  ip?: string;
  operation: string;
  table?: string;
  duration?: number;
  success: boolean;
  error?: string;
}

/**
 * Sanitized audit log entry with PII protection
 */
interface SanitizedAuditEntry {
  timestamp: string;
  userIdHash?: string; // Pseudonymized/hashed userId
  ipHash?: string; // Pseudonymized IP (last octet redacted)
  operation: string;
  table?: string;
  duration?: number;
  success: boolean;
  error?: string;
  retentionDays: number; // TTL metadata
  accessLevel: 'restricted'; // Access control metadata
}

/**
 * Hash userId for pseudonymization (one-way, deterministic)
 */
function pseudonymizeUserId(userId: number | null | undefined): string | undefined {
  if (!userId) return undefined;
  
  // Use HMAC with secret key for deterministic hashing
  const secret = process.env.AUDIT_HASH_SECRET || process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('AUDIT_HASH_SECRET or JWT_SECRET must be configured for PII protection');
  }
  return createHash('sha256')
    .update(`${secret}:${userId}`)
    .digest('hex')
    .substring(0, 16); // Truncate to 16 chars for readability
}

/**
 * Pseudonymize IP address (redact last octet)
 */
function pseudonymizeIp(ip: string | undefined): string | undefined {
  if (!ip) return undefined;
  
  // Redact last octet for IPv4, last segment for IPv6
  if (ip.includes('.')) {
    const parts = ip.split('.');
    if (parts.length === 4) {
      return `${parts[0]}.${parts[1]}.${parts[2]}.xxx`;
    }
  } else if (ip.includes(':')) {
    const parts = ip.split(':');
    if (parts.length > 0) {
      return `${parts.slice(0, -1).join(':')}:xxxx`;
    }
  }
  
  return 'xxx.xxx.xxx.xxx';
}

/**
 * Determine retention period based on operation type
 */
function getRetentionDays(operation: string): number {
  // Sensitive operations require longer retention
  if (operation === 'DELETE') return 90; // 90 days for deletions
  if (operation === 'UPDATE' || operation === 'CREATE') return 60; // 60 days for modifications
  return 30; // 30 days for reads
}

/**
 * Logger interface for structured logging
 */
interface Logger {
  audit(data: Record<string, unknown>): void;
}

/**
 * Get configured logger instance (Winston, Pino, or console fallback)
 */
async function getLogger(): Promise<Logger> {
  const logService = process.env.LOG_SERVICE;
  
  if (logService === 'winston') {
    try {
      // Dynamic ES module import to avoid requiring winston as a dependency
      // @ts-expect-error - Optional dependency, may not be installed
      const winstonModule = await import('winston');
      // Handle default export if present
      const winston = winstonModule.default || winstonModule;
      const logger = winston.createLogger({
        level: 'info',
        format: winston.format.json(),
        transports: [
          new winston.transports.Console({
            format: winston.format.combine(
              winston.format.timestamp(),
              winston.format.json()
            ),
          }),
        ],
      });
      
      return {
        audit: (data: Record<string, unknown>) => {
          // Winston uses log() method with level
          logger.log('info', data);
        },
      };
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.warn('[AUDIT] Winston not available, falling back to console:', error);
      }
    }
  } else if (logService === 'pino') {
    try {
      // Dynamic ES module import to avoid requiring pino as a dependency
      // @ts-expect-error - Optional dependency, may not be installed
      const pinoModule = await import('pino');
      // Handle default export if present
      const pino = pinoModule.default || pinoModule;
      const logger = pino({
        level: 'info',
        formatters: {
          level: (label: string) => ({ level: label }),
        },
      });
      
      return {
        audit: (data: Record<string, unknown>) => {
          // Pino uses info() method with object
          logger.info({ ...data, level: 'audit' });
        },
      };
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.warn('[AUDIT] Pino not available, falling back to console:', error);
      }
    }
  }
  
  // Fallback to structured console logging
  return {
    audit: (data: Record<string, unknown>) => {
      console.log(JSON.stringify({
        timestamp: new Date().toISOString(),
        ...data,
      }));
    },
  };
}

/**
 * Send audit log to external logging service
 */
async function sendToAuditService(entry: SanitizedAuditEntry): Promise<void> {
  const auditServiceUrl = process.env.AUDIT_SERVICE_URL;
  
  if (!auditServiceUrl) {
    // Fallback: log to structured logger (Winston, Pino, or console)
    if (process.env.NODE_ENV === 'production') {
      const structuredLog = {
        level: 'audit',
        service: 'database',
        ...entry,
      };
      
      // Use configured logger or console fallback
      const logger = await getLogger();
      logger.audit(structuredLog);
    }
    return;
  }
  
  // Send to external audit service
  try {
    await fetch(auditServiceUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.AUDIT_SERVICE_TOKEN || ''}`,
      },
      body: JSON.stringify(entry),
      // Add timeout to prevent hanging
      signal: AbortSignal.timeout(5000),
    });
  } catch (error) {
    // Log error but don't throw - audit logging should not break application
    if (process.env.NODE_ENV === 'development') {
      console.warn('[AUDIT] Failed to send to audit service:', error);
    }
  }
}

// In-memory log store (for development only)
const dbLogStore: DatabaseLogEntry[] = [];
const MAX_LOG_ENTRIES = 1000;

/**
 * Log database access with PII protection and structured audit logging
 */
export function logDatabaseAccess(entry: Omit<DatabaseLogEntry, 'timestamp'>): void {
  const logEntry: DatabaseLogEntry = {
    ...entry,
    timestamp: new Date(),
  };
  
  // Store in memory (development only)
  if (process.env.NODE_ENV === 'development') {
    dbLogStore.push(logEntry);
    if (dbLogStore.length > MAX_LOG_ENTRIES) {
      dbLogStore.shift(); // Remove oldest entry
    }
  }
  
  // In production, send to audit service with PII protection
  if (process.env.NODE_ENV === 'production') {
    // Log sensitive operations (CREATE, UPDATE, DELETE)
    if (entry.operation === 'DELETE' || entry.operation === 'UPDATE' || entry.operation === 'CREATE') {
      const sanitizedEntry: SanitizedAuditEntry = {
        timestamp: logEntry.timestamp.toISOString(),
        userIdHash: pseudonymizeUserId(entry.userId),
        ipHash: pseudonymizeIp(entry.ip),
        operation: entry.operation,
        table: entry.table,
        duration: entry.duration,
        success: entry.success,
        error: entry.error,
        retentionDays: getRetentionDays(entry.operation),
        accessLevel: 'restricted', // Enforce restricted access
      };
      
      // Send to external audit service (async, non-blocking)
      sendToAuditService(sanitizedEntry).catch(() => {
        // Silently fail - audit logging should not break application
      });
    }
  }
}

/**
 * Get database access logs (for debugging/admin)
 */
export function getDatabaseLogs(limit: number = 100): DatabaseLogEntry[] {
  return dbLogStore.slice(-limit);
}

/**
 * Query timeout wrapper
 * Wraps a Prisma query with timeout protection
 */
export async function withQueryTimeout<T>(
  query: Promise<T>,
  timeoutMs: number = parseInt(process.env.DB_QUERY_TIMEOUT_MS || '30000', 10)
): Promise<T> {
  return Promise.race([
    query,
    new Promise<T>((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Database query timeout after ${timeoutMs}ms`));
      }, timeoutMs);
    }),
  ]);
}

/**
 * Safe database query executor with rate limiting and timeout
 */
export async function executeSafeQuery<T>(
  queryFn: () => Promise<T>,
  options: {
    userId?: number | null;
    ip?: string;
    operation: string;
    table?: string;
    timeoutMs?: number;
  }
): Promise<T> {
  const startTime = Date.now();
  const { userId, ip, operation, table, timeoutMs } = options;
  
  // Check query rate limit
  const rateLimitCheck = await checkDatabaseQueryRateLimit({
    maxQueries: parseInt(process.env.DB_QUERY_RATE_LIMIT || '1000', 10), // 1000 queries per minute
    windowMs: 60 * 1000, // 1 minute
    userId,
    ip,
  });
  
  if (!rateLimitCheck.allowed) {
    logDatabaseAccess({
      userId,
      ip,
      operation,
      table,
      success: false,
      error: rateLimitCheck.reason,
    });
    throw new Error(rateLimitCheck.reason || 'Database query rate limit exceeded');
  }
  
  try {
    // Execute query with timeout
    const result = await withQueryTimeout(queryFn(), timeoutMs);
    const duration = Date.now() - startTime;
    
    logDatabaseAccess({
      userId,
      ip,
      operation,
      table,
      duration,
      success: true,
    });
    
    return result;
  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    logDatabaseAccess({
      userId,
      ip,
      operation,
      table,
      duration,
      success: false,
      error: errorMessage,
    });
    
    throw error;
  }
}

