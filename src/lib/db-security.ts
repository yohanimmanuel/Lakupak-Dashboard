import { Prisma } from '@/generated/prisma';
import { getRedisClient, isRedisAvailable } from '@/lib/redis';
import { createHash, createHmac, randomBytes } from 'crypto';

/**
 * Database query rate limiting
 * Limits the number of database queries per user/IP per time window
 */
interface QueryRateLimitConfig {
  maxQueries: number;
  windowMs: number;
  userId?: number | null;
  ip?: string;
  userAgent?: string;
  requestHeaders?: Record<string, string>;
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
 * Anonymous requests are differentiated by User-Agent hash to prevent DoS attacks
 */
export async function checkDatabaseQueryRateLimit(
  config: QueryRateLimitConfig
): Promise<{ allowed: boolean; reason?: string; retryAfter?: number }> {
  const { maxQueries, windowMs, userId, ip, userAgent, requestHeaders } = config;
  
  // Create identifier key - use userId only for authenticated users, IP only when userId is absent
  // For anonymous requests, hash User-Agent and other headers to prevent shared bucket DoS
  let identifierKey: string;
  if (userId) {
    identifierKey = `user:${userId}`;
  } else if (ip) {
    identifierKey = `ip:${ip}`;
  } else {
    // Anonymous request: create a fingerprint from available headers to prevent shared bucket DoS
    const fingerprintParts: string[] = [];
    
    // Use User-Agent if available
    if (userAgent) {
      fingerprintParts.push(`ua:${userAgent}`);
    }
    
    // Use other identifying headers if available
    if (requestHeaders) {
      // Use Accept-Language as additional differentiation
      if (requestHeaders['accept-language']) {
        fingerprintParts.push(`lang:${requestHeaders['accept-language']}`);
      }
      // Use Accept-Encoding as additional differentiation
      if (requestHeaders['accept-encoding']) {
        fingerprintParts.push(`enc:${requestHeaders['accept-encoding']}`);
      }
    }
    
    // If we have any fingerprint parts, hash them; otherwise use a generic anonymous key
    if (fingerprintParts.length > 0) {
      const fingerprint = fingerprintParts.join('|');
      // Create a short hash (first 12 chars) to keep keys manageable while preventing collisions
      const hash = createHash('sha256').update(fingerprint).digest('hex').substring(0, 12);
      identifierKey = `anon:${hash}`;
    } else {
      // Fallback: use a generic anonymous key (should be rare)
      identifierKey = 'anonymous';
    }
  }
  
  // Apply stricter limits for anonymous requests (10% of normal limit)
  // Check if identifierKey starts with 'anon:' or equals 'anonymous'
  const isAnonymous = identifierKey.startsWith('anon:') || identifierKey === 'anonymous';
  const effectiveMaxQueries = isAnonymous
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
        const reason = isAnonymous
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
      // On Redis error, fall back to in-memory rate limiting for all requests
      // Log the error with details
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;
      if (process.env.NODE_ENV === 'development') {
        console.warn('Database query rate limit Redis error, falling back to in-memory limiter:', {
          error: errorMessage,
          stack: errorStack,
          identifierKey,
        });
      }
      // Fall through to in-memory rate limiting below
    }
  }
  
  // In-memory fallback (should rarely happen in production)
  // Apply in-memory rate limiting for all requests when Redis is unavailable
  {
    // Use stricter limits for anonymous requests, normal limits for authenticated
    const memoryMaxQueries = isAnonymous
      ? 5 // Strict limit for anonymous: 5 requests per minute
      : Math.max(10, Math.floor(maxQueries * 0.5)); // Authenticated: 50% of normal limit, minimum 10
    const memoryWindowMs = windowMs;
    
    const now = Date.now();
    // Use the same identifierKey to differentiate requests
    const memoryKey = `db-query:${identifierKey}`;
    let entry = memoryRateLimits.get(memoryKey);
    
    // Reset if window has passed
    if (!entry || now > entry.resetAt) {
      entry = {
        count: 0,
        resetAt: now + memoryWindowMs,
      };
    }
    
    // Increment count
    entry.count++;
    memoryRateLimits.set(memoryKey, entry);
    
    // Check if limit exceeded
    if (entry.count > memoryMaxQueries) {
      const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
      const reason = isAnonymous
        ? 'Too many anonymous database queries. Please authenticate or provide IP address.'
        : 'Too many database queries. Please slow down.';
      return {
        allowed: false,
        reason,
        retryAfter: retryAfter > 0 ? retryAfter : Math.ceil(memoryWindowMs / 1000),
      };
    }
    
    // Log warning in development
    if (process.env.NODE_ENV === 'development') {
      console.warn(`Database query rate limit: Request using in-memory fallback (Redis unavailable) - ${identifierKey}`);
    }
    
    return { allowed: true };
  }
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
 * Get default query complexity limits
 * Note: Real-time query analysis would require Prisma middleware or query logging hooks
 * For now, we use conservative default limits
 */
export function getDefaultQueryComplexity(): QueryComplexityConfig {
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
 * Generate a runtime secret at application startup if env vars are missing
 * This provides better security than unsalted hashing when secrets are not configured
 */
let runtimeSecret: string | null = null;

function getOrCreateRuntimeSecret(): string {
  if (!runtimeSecret) {
    // Generate a cryptographically secure random secret
    runtimeSecret = randomBytes(32).toString('hex');
    // Log prominent warning to alert operators immediately
    console.error('[AUDIT] ⚠️  CRITICAL: AUDIT_HASH_SECRET and JWT_SECRET not configured!');
    console.error('[AUDIT] ⚠️  Using runtime-generated secret - this is NOT secure for production!');
    console.error('[AUDIT] ⚠️  Secret will change on restart, breaking pseudonymization consistency.');
    console.error('[AUDIT] ⚠️  Please configure AUDIT_HASH_SECRET or JWT_SECRET immediately.');
  }
  return runtimeSecret;
}

/**
 * Hash userId for pseudonymization (one-way, deterministic)
 * Uses HMAC with secret key for cryptographically strong pseudonymization
 */
function pseudonymizeUserId(userId: number | null | undefined): string | undefined {
  if (!userId) return undefined;
  
  // Use HMAC with secret key for deterministic hashing
  const secret = process.env.AUDIT_HASH_SECRET || process.env.JWT_SECRET;
  let effectiveSecret: string;
  
  if (!secret) {
    // In production, generate runtime secret and use HMAC (better than unsalted hash)
    // Audit logging should be resilient and not break the application
    if (process.env.NODE_ENV === 'production') {
      effectiveSecret = getOrCreateRuntimeSecret();
    } else {
      // In development, throw to catch configuration issues early
      throw new Error('AUDIT_HASH_SECRET or JWT_SECRET must be configured for PII protection');
    }
  } else {
    effectiveSecret = secret;
  }
  
  // Use HMAC (not hash) for cryptographically strong pseudonymization
  // HMAC prevents rainbow table attacks and provides better security
  const hmac = createHmac('sha256', effectiveSecret);
  hmac.update(String(userId));
  const hash = hmac.digest('hex').substring(0, 16); // Truncate to 16 chars for readability
  
  return `user-${hash}`;
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
      // Redact last octet for IPv4
      return `${parts.slice(0, 3).join('.')}.xxx`;
    }
  } else if (ip.includes(':')) {
    const parts = ip.split(':');
    // Check for compression token "::" to detect compressed IPv6
    if (ip.includes('::')) {
      // For compressed IPv6, use generic redaction
      return 'xxxx:xxxx:xxxx:xxxx:xxxx:xxxx:xxxx:xxxx';
    } else {
      // For full IPv6, redact last segment
      return `${parts.slice(0, -1).join(':')}:xxxx`;
    }
  }
  
  // Fallback for unrecognized IP format
  return 'xxx.xxx.xxx.xxx';
}

/**
 * Determine retention period based on operation type
 * Handles both exact uppercase operations ("CREATE"/"UPDATE"/"DELETE") and dot-notation operations (e.g., "Order.create", "Supplier.delete")
 */
function getRetentionDays(operation: string): number {
  // Normalize operation to uppercase for case-insensitive matching
  const normalizedOp = operation.toUpperCase();
  
  // Check for DELETE operations (exact match or dot-notation suffix)
  if (normalizedOp === 'DELETE' || normalizedOp.endsWith('.DELETE')) {
    return 90; // 90 days for deletions
  }
  
  // Check for UPDATE or CREATE operations (exact match or dot-notation suffix)
  if (normalizedOp === 'UPDATE' || normalizedOp === 'CREATE' || 
      normalizedOp.endsWith('.UPDATE') || normalizedOp.endsWith('.CREATE')) {
    return 60; // 60 days for modifications
  }
  
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
      // Use Function constructor to prevent Next.js from analyzing the import at build time
      const winstonModule = await new Function('return import("winston")')();
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
      // Use Function constructor to prevent Next.js from analyzing the import at build time
      const pinoModule = await new Function('return import("pino")')();
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

// Rate limiting for audit service error logs (prevent spam when service is down)
let lastAuditErrorLogTime = 0;
const AUDIT_ERROR_LOG_INTERVAL_MS = 60000; // Log errors at most once per minute
let auditErrorCount = 0;

/**
 * Send audit log to external logging service
 */
async function sendToAuditService(entry: SanitizedAuditEntry): Promise<void> {
  const auditServiceUrl = process.env.AUDIT_SERVICE_URL;
  
  if (!auditServiceUrl) {
    // Fallback: log to structured logger (Winston, Pino, or console)
    const structuredLog = {
      level: 'audit',
      service: 'database',
      ...entry,
    };
    
    // Use configured logger or console fallback
    const logger = await getLogger();
    logger.audit(structuredLog);
    return;
  }
  
  // Send to external audit service
  try {
    const res = await fetch(auditServiceUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.AUDIT_SERVICE_TOKEN || ''}`,
      },
      body: JSON.stringify(entry),
      // Add timeout to prevent hanging
      signal: AbortSignal.timeout(5000),
    });
    
    // Check for HTTP error status codes
    if (!res.ok) {
      auditErrorCount++;
      
      // Only log errors periodically to prevent spam
      const now = Date.now();
      const shouldLogError = now - lastAuditErrorLogTime >= AUDIT_ERROR_LOG_INTERVAL_MS;
      
      if (shouldLogError) {
        // Try to read error response body
        let errorBody = '';
        try {
          const contentType = res.headers.get('content-type');
          if (contentType?.includes('application/json')) {
            const json = await res.json();
            errorBody = JSON.stringify(json);
          } else {
            errorBody = await res.text();
          }
        } catch {
          // Ignore errors reading response body
          errorBody = 'Unable to read error response';
        }
        
        // Log HTTP error with details (rate limited)
        console.warn(`[AUDIT] Audit service unavailable (${auditErrorCount} errors since last log):`, {
          status: res.status,
          statusText: res.statusText,
          url: auditServiceUrl,
          errorBody,
          note: 'Audit logging continues silently. Errors will be logged again in 1 minute if service remains down.',
        });
        
        lastAuditErrorLogTime = now;
        auditErrorCount = 0; // Reset counter after logging
      }
      // Silently continue if we've logged recently - audit failures should not break the app
    } else {
      // Reset error count on successful request
      auditErrorCount = 0;
      lastAuditErrorLogTime = 0;
    }
  } catch (error) {
    auditErrorCount++;
    
    // Only log network/timeout errors periodically to prevent spam
    const now = Date.now();
    const shouldLogError = now - lastAuditErrorLogTime >= AUDIT_ERROR_LOG_INTERVAL_MS;
    
    if (shouldLogError) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.warn(`[AUDIT] Failed to send to audit service (${auditErrorCount} errors since last log):`, {
        error: errorMessage,
        url: auditServiceUrl,
        note: 'Audit logging continues silently. Errors will be logged again in 1 minute if service remains down.',
      });
      
      lastAuditErrorLogTime = now;
      auditErrorCount = 0; // Reset counter after logging
    }
    // Silently continue on network errors - audit logging should not break application
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
  
  // Send to audit service if configured (works in both dev and production)
  // Log sensitive operations (CREATE, UPDATE, DELETE) and all operations if AUDIT_SERVICE_URL is set
  const shouldAudit = process.env.AUDIT_SERVICE_URL && (
    entry.operation === 'DELETE' || 
    entry.operation === 'UPDATE' || 
    entry.operation === 'CREATE' ||
    entry.operation.includes('.create') ||
    entry.operation.includes('.update') ||
    entry.operation.includes('.delete')
  );
  
  if (shouldAudit) {
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
    sendToAuditService(sanitizedEntry).catch((error) => {
      // Log errors in development for debugging
      if (process.env.NODE_ENV === 'development') {
        console.warn('[AUDIT] Failed to send audit log to service:', error);
      }
      // Silently fail in production - audit logging should not break application
    });
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
  let timeoutId: NodeJS.Timeout;
  
  const timeoutPromise = new Promise<T>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(`Database query timeout after ${timeoutMs}ms`));
    }, timeoutMs);
  });
  
  try {
    return await Promise.race([query, timeoutPromise]);
  } finally {
    clearTimeout(timeoutId!);
  }
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
    userAgent?: string;
    requestHeaders?: Record<string, string>;
  }
): Promise<T> {
  const startTime = Date.now();
  const { userId, ip, operation, table, timeoutMs, userAgent, requestHeaders } = options;
  
  // Check query rate limit
  const rateLimitCheck = await checkDatabaseQueryRateLimit({
    maxQueries: parseInt(process.env.DB_QUERY_RATE_LIMIT || '1000', 10), // 1000 queries per minute
    windowMs: 60 * 1000, // 1 minute
    userId,
    ip,
    userAgent,
    requestHeaders,
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

