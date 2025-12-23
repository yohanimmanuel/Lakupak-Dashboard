import { PrismaClient, type Prisma } from '@/generated/prisma'
import { Pool } from 'pg'
import { PrismaPg } from '@prisma/adapter-pg'

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient }

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const adapter = new PrismaPg(pool)

export const prisma: PrismaClient = globalForPrisma.prisma ?? new PrismaClient({
  adapter,
})

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


