/**
 * Single entry point for Prisma: re-export client and types from @prisma/client.
 * Schema uses prisma-client-js so .prisma/client is generated and @prisma/client loads it at runtime.
 */
import {
  PrismaClient,
  Prisma,
  type Product,
  type VariantOption,
  type Offer,
  type OfferProduct,
  type OfferDiscountType,
  type DateRange,
  type Buyer,
  type Supplier,
  type Company,
  type Campaign,
  type AutomationWorkflow,
  type AutomationRun,
} from '@prisma/client';

export { PrismaClient, Prisma };
export type {
  Product,
  VariantOption,
  Offer,
  OfferProduct,
  OfferDiscountType,
  DateRange,
  Buyer,
  Supplier,
  Company,
  Campaign,
  AutomationWorkflow,
  AutomationRun,
};
