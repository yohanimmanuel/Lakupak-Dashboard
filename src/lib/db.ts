import { PrismaClient, type Prisma } from './prisma-generated'
import { Pool } from 'pg'
import { PrismaPg } from '@prisma/adapter-pg'
import { AsyncLocalStorage } from 'async_hooks'
import { NextRequest } from 'next/server'
import { logDatabaseAccess, checkDatabaseQueryRateLimit } from './db-security'
import { getClientIp } from '@/utils/rateLimiter'

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient }

/**
 * Request context for database security (rate limiting, logging)
 * Stored in AsyncLocalStorage so Prisma middleware can access it
 */
interface DbSecurityContext {
  userId?: number | null
  ip?: string
  userAgent?: string
  requestHeaders?: Record<string, string>
  /** Skip per-query Redis rate limiting (e.g. for endpoints that already enforce route-level rate limiting) */
  skipRateLimit?: boolean
}

const dbSecurityContext = new AsyncLocalStorage<DbSecurityContext>()

/**
 * Set database security context for current async execution
 * Call this in API routes before executing Prisma queries
 */
export function setDbSecurityContext(context: DbSecurityContext): void {
  dbSecurityContext.enterWith(context)
}

/**
 * Helper to set database security context from NextRequest
 * Extracts userId, IP, and headers automatically
 */
export async function setDbSecurityContextFromRequest(
  req: NextRequest,
  userId?: number | null,
  options?: { skipRateLimit?: boolean }
): Promise<void> {
  // Try to get userId from auth helpers if not provided
  let authenticatedUserId = userId;
  if (authenticatedUserId === undefined) {
    try {
      const { getAuthenticatedUserId } = await import('@/utils/auth-helpers');
      authenticatedUserId = await getAuthenticatedUserId(req);
    } catch {
      // Auth helpers not available, use provided userId or null
      authenticatedUserId = userId ?? null;
    }
  }
  
  const ip = getClientIp(req);
  const userAgent = req.headers.get('user-agent') || undefined;
  
  // Extract relevant headers for anonymous request differentiation
  const requestHeaders: Record<string, string> = {};
  const acceptLanguage = req.headers.get('accept-language');
  const acceptEncoding = req.headers.get('accept-encoding');
  if (acceptLanguage) requestHeaders['accept-language'] = acceptLanguage;
  if (acceptEncoding) requestHeaders['accept-encoding'] = acceptEncoding;
  
  setDbSecurityContext({
    userId: authenticatedUserId,
    ip,
    userAgent,
    requestHeaders: Object.keys(requestHeaders).length > 0 ? requestHeaders : undefined,
    skipRateLimit: options?.skipRateLimit,
  });
}

/**
 * Get database security context from current async execution
 */
export function getDbSecurityContext(): DbSecurityContext | undefined {
  return dbSecurityContext.getStore()
}

// Ensure PgBouncer-friendly URL (no prepared statement cache) when using pooler
const rawDbUrl = process.env.DATABASE_URL ?? '';
const connectionString =
  rawDbUrl.includes('pgbouncer=true') && !rawDbUrl.includes('statement_cache_size')
    ? `${rawDbUrl}${rawDbUrl.includes('?') ? '&' : '?'}statement_cache_size=0`
    : rawDbUrl;

// Connection pool configuration for production security
const pool = new Pool({
  connectionString,
  // Connection pool limits - right-sized for Render single-instance & Supabase pooler
  max: parseInt(process.env.DB_POOL_MAX || '10', 10),
  min: parseInt(process.env.DB_POOL_MIN || '2', 10),
  // Connection timeout settings - relaxed for better reliability
  connectionTimeoutMillis: parseInt(process.env.DB_CONNECTION_TIMEOUT_MS || '15000', 10), // Increased from 10s
  idleTimeoutMillis: parseInt(process.env.DB_IDLE_TIMEOUT_MS || '60000', 10), // Increased from 30s to keep connections longer
  // Query timeout (applied per query) - increased for complex queries
  query_timeout: parseInt(process.env.DB_QUERY_TIMEOUT_MS || '45000', 10), // Increased from 30s
  // SSL/TLS configuration (required for Supabase)
  // On Vercel/serverless, strict cert verification can fail with "self-signed certificate in certificate chain".
  // Supabase uses valid certs; the issue is the runtime's CA bundle. Allow connection unless explicitly strict.
  ssl: process.env.DATABASE_URL?.includes('supabase')
    ? {
        rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED === 'true',
      }
    : undefined,
})
// Supabase connections use TLS via the ssl config above; no extra URL check needed.

const adapter = new PrismaPg(pool)

// Prisma client with query timeout and logging extension
const basePrisma = globalForPrisma.prisma ?? new PrismaClient({
  adapter,
  log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
})

// Extend Prisma with security features (rate limiting, logging, timeout)
export const prisma = basePrisma.$extends({
  query: {
    $allOperations: async ({
      operation,
      model,
      args,
      query,
    }: {
      operation: string;
      model?: string;
      args: unknown;
      query: (args: unknown) => Promise<unknown>;
    }) => {
      const startTime = Date.now();
      const context = getDbSecurityContext();
      
      // Apply database query rate limiting if context is available and not skipped
      if (context && !context.skipRateLimit) {
        const rateLimitCheck = await checkDatabaseQueryRateLimit({
          maxQueries: parseInt(process.env.DB_QUERY_RATE_LIMIT || '1000', 10), // 1000 queries per minute
          windowMs: 60 * 1000, // 1 minute
          userId: context.userId,
          ip: context.ip,
          userAgent: context.userAgent,
          requestHeaders: context.requestHeaders,
        });
        
        if (!rateLimitCheck.allowed) {
          // Log rate limit violation
          logDatabaseAccess({
            userId: context.userId,
            ip: context.ip,
            operation: `${model || 'unknown'}.${operation}`,
            table: model || undefined,
            success: false,
            error: rateLimitCheck.reason || 'Database query rate limit exceeded',
          });
          
          throw new Error(rateLimitCheck.reason || 'Database query rate limit exceeded');
        }
      }
      
      try {
        // Execute query (timeout handled by pool-level query_timeout)
        const result = await query(args);
        
        const duration = Date.now() - startTime;
        
        // Log database access for audit (if context available)
        if (context) {
          logDatabaseAccess({
            userId: context.userId,
            ip: context.ip,
            operation: `${model || 'unknown'}.${operation}`,
            table: model || undefined,
            duration,
            success: true,
          });
        }
        
        // Log slow queries (> 5 seconds)
        if (duration > 5000 && process.env.NODE_ENV === 'production') {
          console.warn(`[DB_SLOW_QUERY] ${model || 'unknown'}.${operation} took ${duration}ms`);
        }
        
        return result;
      } catch (error) {
        const duration = Date.now() - startTime;
        const errorMessage = error instanceof Error ? error.message : String(error);
        
        // Log database access errors for audit (if context available)
        if (context) {
          logDatabaseAccess({
            userId: context.userId,
            ip: context.ip,
            operation: `${model || 'unknown'}.${operation}`,
            table: model || undefined,
            duration,
            success: false,
            error: errorMessage,
          });
        }
        
        // Log query errors (full message for debugging connection/schema issues)
        if (process.env.NODE_ENV === 'production') {
          const fullError = error instanceof Error ? (error.stack || error.message) : String(error);
          console.error(`[DB_QUERY_ERROR] ${model || 'unknown'}.${operation} failed after ${duration}ms:`, errorMessage);
          console.error(`[DB_QUERY_ERROR_FULL]`, fullError);
        }
        
        throw error;
      }
    },
  },
}) as PrismaClient;

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma
}

// Re-export commonly used types for convenience (single source of truth)
export type { Prisma, PrismaClient }

// Re-export model types and enums that are commonly used
export type {
  VariantOption,
  Buyer,
  Supplier,
  Company,
  OfferDiscountType,
} from './prisma-generated'


