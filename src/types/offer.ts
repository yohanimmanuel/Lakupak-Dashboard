export interface OfferProduct {
  id: string;
  productId: string;
  name: string;
  productType: string;
  productCategory: string;
  sellingPrice: number;
}

export interface OfferDiscountType {
  id: string;
  offerId?: string;
  discountType: 'percentage' | 'fixed' | 'buy_x_get_y';
  discountValue: number;
  name?: string | null;
  description?: string | null;
  minOrderValue?: number | string | null;
  minQuantity?: number | null;
  freeQuantity?: number | null;
  isActive: boolean;
  priority: number;
  currentUsage?: number; // Individual usage count for this discount type
  createdAt?: string;
  updatedAt?: string;
}

export interface DateRange {
  id: string;
  name: string;
  description?: string | null;
  startDate: string;
  endDate: string;
  isActive: boolean;
  offerCount?: number;
  createdAt: string;
  updatedAt?: string;
}

export interface TimeSlot {
  id: string;
  name: string;
  description?: string;
  startTime: string;
  endTime: string;
  days: string[];
  isActive: boolean;
  offerCount?: number;
  createdAt: string;
  updatedAt?: string;
}

export interface Offer {
  id: string;
  offerId: string;
  name: string;
  description?: string;
  type: ('discount' | 'promotion')[];
  status: 'active' | 'expired' | 'inactive';
  minOrderValue?: number;
  minQuantity?: number;
  startDate: string;
  endDate: string;
  totalUsage: number;
  totalDiscountGiven: number;
  products: OfferProduct[];
  discountTypes: OfferDiscountType[];
  dateRanges?: DateRange[];
  timeSlots?: TimeSlot[];
  productOfferBadges?: Record<string, string>;
  createdAt: string;
  updatedAt: string;
  [key: string]: unknown;
}

export interface OfferFormData {
  name: string;
  description?: string;
  type: ('discount' | 'promotion')[];
  discountTypes: {
    discountType: 'percentage' | 'fixed' | 'buy_x_get_y';
    discountValue: number;
    isActive: boolean;
    priority: number;
  }[];
  minOrderValue?: string;
  minQuantity?: number;
  startDate: string;
  endDate: string;
  productIds: string[];
}

export interface OfferTableRow {
  id: string;
  offerId: string;
  name: string;
  type: string;
  discount: string;
  status: string;
  startDate: string;
  endDate: string;
  usage: string | React.ReactNode;
  totalDiscount: string;
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
