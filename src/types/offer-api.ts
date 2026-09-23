/**
 * Type definitions for Offer API operations (per-retailer pricing).
 */

export type OfferDiscountType =
  | 'percentage'
  | 'fixed_amount'
  | 'buy_x_get_y';

export interface OfferCreateInput {
  buyerId: string;
  productId?: string | null;
  categoryId?: string | null;
  discountType: OfferDiscountType;
  discountValue: number;
  buyQuantity?: number | null;
  freeQuantity?: number | null;
  startDate: string;
  endDate?: string | null;
  status?: string;
  notes?: string | null;
  description?: string | null;
}

export interface OfferUpdateInput {
  buyerId?: string;
  productId?: string | null;
  categoryId?: string | null;
  discountType?: OfferDiscountType;
  discountValue?: number;
  buyQuantity?: number | null;
  freeQuantity?: number | null;
  startDate?: string;
  endDate?: string | null;
  status?: string;
  notes?: string | null;
  description?: string | null;
}

export interface OfferResult {
  id: string;
  offerId: string;
  buyerId: string;
  productId: string | null;
  categoryId: string | null;
  discountType: string;
  discountValue: number;
  buyQuantity: number | null;
  freeQuantity: number | null;
  startDate: string;
  endDate: string | null;
  status: string;
  notes: string | null;
  description: string | null;
  totalUsage: number;
  totalDiscountGiven: number;
  createdAt: string;
  updatedAt: string;
}
