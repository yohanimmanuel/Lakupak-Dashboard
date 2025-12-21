/**
 * Type definitions for Offer API operations
 * Replaces 'any' types with proper TypeScript interfaces
 */

export interface DiscountTypeInput {
  name?: string;
  discountType?: string;
  discountValue?: number;
  description?: string;
  minOrderValue?: number | string;
  minQuantity?: number;
  isActive?: boolean;
  priority?: number;
}

export interface DiscountTypeUpdate extends DiscountTypeInput {
  id?: string;
}

export interface DateRangeInput {
  name?: string;
  description?: string;
  startDate?: string | Date;
  endDate?: string | Date;
  days?: string;
  isActive?: boolean;
}

export interface DateRangeUpdate extends DateRangeInput {
  id?: string;
}

export interface ProductInput {
  productId: string;
}

export interface OfferUpdateInput {
  name?: string;
  description?: string;
  type?: string;
  status?: string;
  startDate?: Date | null;
  endDate?: Date | null;
  usageLimit?: number;
  isActive?: boolean;
}

export interface BatchOfferUpdate {
  status?: string;
  offer?: OfferUpdateInput;
  discountTypes?: DiscountTypeInput[];
  dateRanges?: DateRangeInput[];
  products?: ProductInput[];
}

export interface RemoveProductsInput {
  productIds: string[];
}

export interface AddProductsInput {
  products: ProductInput[];
  productIds?: string[];
}

// Prisma query result types (from database)
export interface OfferDiscountTypeResult {
  id: string;
  discountType: string;
  value: number | null;
  minQuantity: number | null;
  freeQuantity: number | null;
  maxDiscount: number | null;
  minOrderValue: number | null;
  description: string | null;
  isActive: boolean;
  priority: number;
}

export interface OfferProductResult {
  id: string;
  productId: string;
  product: {
    productId: string;
    productName: string;
    productDescription: string | null;
    category: string;
    subCategory: string | null;
    productPrice: number;
    stockQuantity: number;
  };
}

export interface DateRangeResult {
  id: string;
  name: string;
  startDate: Date;
  endDate: Date;
  days: string | null;
  isActive: boolean;
}

export interface OfferWithRelations {
  id: string;
  offerName: string;
  offerCode: string;
  offerDescription: string | null;
  offerType: string | null;
  usageLimit: number | null;
  totalUsage: number;
  totalDiscountGiven: number;
  isActive: boolean;
  userId: number;
  offerDiscountTypes: OfferDiscountTypeResult[];
  offerProducts: OfferProductResult[];
  dateRanges: DateRangeResult[];
}

// Transaction type for Prisma operations
// Note: Using Prisma.TransactionClient which properly types all delegates
import type { Prisma } from '@prisma/client';
export type PrismaTransaction = Prisma.TransactionClient;

