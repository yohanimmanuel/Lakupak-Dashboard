export type OfferDiscountType =
  | 'percentage'
  | 'fixed_amount'
  | 'buy_x_get_y';

export type OfferStatus = 'draft' | 'active' | 'expired';

export interface Offer {
  id: string;
  offerId: string;
  groupId?: string | null;
  buyerId: string | null;
  buyerStoreName?: string | null;
  buyerOwner?: string | null;
  productId?: string | null;
  productName?: string | null;
  categoryId?: string | null;
  categoryLabel?: string | null;
  variantOptionId?: number | null;
  variantName?: string | null;
  discountType: OfferDiscountType;
  discountValue: number;
  buyQuantity?: number | null;
  freeQuantity?: number | null;
  /** from_zero counts free pieces before MOQ. after_moq counts only above MOQ. */
  promotionApplyMode?: 'from_zero' | 'after_moq' | string | null;
  startDate: string;
  endDate?: string | null;
  status: OfferStatus | string;
  notes?: string | null;
  description?: string | null;
  totalUsage: number;
  totalDiscountGiven: number;
  createdAt: string;
  updatedAt: string;
}

export interface OfferFormData {
  buyerId?: string | null;
  productId?: string | null;
  categoryId?: string | null;
  variantOptionId?: number | null;
  discountType: OfferDiscountType;
  discountValue: number;
  buyQuantity?: number | null;
  freeQuantity?: number | null;
  startDate: string;
  endDate?: string | null;
  status: OfferStatus;
  notes?: string;
  description?: string;
}

export interface OfferTableRow {
  id: string;
  offerId: string;
  client: string;
  target: string;
  discount: string;
  status: string;
  duration: string;
  actions: string;
}

export interface OffersResponse {
  offers: Offer[];
  pagination: {
    page: number;
    limit: number;
    totalCount: number;
    totalPages: number;
  };
}
