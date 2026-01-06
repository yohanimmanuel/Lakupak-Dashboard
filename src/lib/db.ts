import { PrismaClient, type Prisma } from '@/generated/prisma'
import { Pool } from 'pg'
import { PrismaPg } from '@prisma/adapter-pg'

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient }

// Connection pool configuration for production security
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Connection pool limits
  max: parseInt(process.env.DB_POOL_MAX || '20', 10), // Maximum connections
  min: parseInt(process.env.DB_POOL_MIN || '2', 10), // Minimum connections
  // Connection timeout settings
  connectionTimeoutMillis: parseInt(process.env.DB_CONNECTION_TIMEOUT_MS || '10000', 10), // 10 seconds
  idleTimeoutMillis: parseInt(process.env.DB_IDLE_TIMEOUT_MS || '30000', 10), // 30 seconds
  // Query timeout (applied per query)
  query_timeout: parseInt(process.env.DB_QUERY_TIMEOUT_MS || '30000', 10), // 30 seconds
  // SSL/TLS configuration (required for Supabase)
  ssl: process.env.DATABASE_URL?.includes('supabase') 
    ? { rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false' } 
    : undefined,})

// Verify connection encryption for production
if (process.env.NODE_ENV === 'production') {
  pool.on('connect', () => {
    // Verify SSL is required in connection string for Supabase
    if (process.env.DATABASE_URL?.includes('supabase') && !process.env.DATABASE_URL.includes('sslmode=require')) {
      console.warn('WARNING: Database connection may not be encrypted! Ensure SSL is enabled in connection string.');
    }
  });
}

const adapter = new PrismaPg(pool)

// Prisma client with query timeout and logging extension
const basePrisma = globalForPrisma.prisma ?? new PrismaClient({
  adapter,
  log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
})

// Extend Prisma with query logging (timeout handled by pool-level query_timeout)
export const prisma = basePrisma.$extends({
  query: {
    $allOperations: async ({ operation, model, args, query }) => {
      const startTime = Date.now();
      
      try {
        // Execute query (timeout handled by pool-level query_timeout)
        const result = await query(args);
        
        const duration = Date.now() - startTime;
        
        // Log slow queries (> 5 seconds)
        if (duration > 5000 && process.env.NODE_ENV === 'production') {
          console.warn(`[DB_SLOW_QUERY] ${model || 'unknown'}.${operation} took ${duration}ms`);
        }
        
        return result;
      } catch (error) {
        const duration = Date.now() - startTime;
        const errorMessage = error instanceof Error ? error.message : String(error);
        
        // Log query errors
        if (process.env.NODE_ENV === 'production') {
          console.error(`[DB_QUERY_ERROR] ${model || 'unknown'}.${operation} failed after ${duration}ms:`, errorMessage);
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
} from '@/generated/prisma'


