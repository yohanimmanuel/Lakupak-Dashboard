export interface Offer {
  id: string;
  offerId: string;
  name: string;
  description: string;
  type: 'discount' | 'promotion';
  status: 'active' | 'expired' | 'inactive';
  discountType: 'percentage' | 'fixed' | 'buy_x_get_y';
  discountValue: number;
  minOrderValue?: number;
  minQuantity?: number;
  startDate: string;
  endDate: string;
  maxUsage?: number;
  perCustomerLimit?: number;
  totalUsage: number;
  totalDiscountGiven: number;
  createdAt: string;
  updatedAt: string;
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
  usage: string;
  totalDiscount: string;
  actions: string;
}
