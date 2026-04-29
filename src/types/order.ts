export interface Order {
  // ===== SECTION 1: ORDER DETAILS (Top Left) =====
  id: string;
  orderId: string;
  buyerId: string;
  orderDate: Date;
  orderStatus: 'Pending' | 'Confirmed' | 'Packed' | 'Shipped' | 'Delivered' | 'Failed' | 'Cancelled' | 'Returned';
  paymentStatus: 'Unpaid' | 'Paid';
  deliveryMethod: 'Self Pickup' | 'Seller/Distributor Delivery' | 'Buyer-arranged Courier';
  deliveryOption?: string | null;
  shippingMethodLabel?: string;
  shippingMethod?: string;
  subtotal: number;
  discounts: number;
  shippingFee: number;
  totalAmount: number;
  paymentTerms: string;

  // ===== SECTION 2: ORDER ITEMS (Top Right) =====
  orderItems: OrderItem[];

  // ===== SECTION 3: ORDER QUANTITY (Middle) =====
  totalOrders: number;

  // ===== SECTION 4: CUSTOMER INFORMATION (Bottom Left) =====
  contactPerson: string;
  storeName: string;
  contactPhone: string;
  customerEmail?: string;

  // ===== SECTION 5: DELIVERY SERVICE (Bottom Right) =====
  deliveryAddress: string;
  preferredDeliveryDate?: string | Date;
  preferredDeliveryTime?: string;
  preferredPickupDate?: string | Date;
  preferredPickupTime?: string;
  assignedLogistics?: string;
  trackingNumber?: string;
  fleetId?: number | null;
  deliveryNote?: string;
  deliveryConfirmation?: string;
  pod?: string;

  // ===== AUDIT & LOGS =====
  createdAt: Date;
  updatedAt: Date;
  acceptedBy?: string;
  acceptedAt?: Date;
  estimatedDeliveryDate?: Date;
  estimatedDeliveryMinDays?: number | null;
  estimatedDeliveryMaxDays?: number | null;
  deliveredAt?: Date;
  paidAt?: Date | string | null;
  cancelledAt?: Date | string | null;
  cancelledBy?: string | null;
  cancellationReason?: string | null;
  returnedAt?: Date | string | null;
  returnReason?: string | null;
  returnReasonDetail?: string | null;
  returnStatus?: 'Pending' | 'Accepted' | 'Rejected' | null;
  /** Multiple return reasons when buyer submitted more than one return request */
  returnRequests?: Array<{
    id: number;
    reason: string;
    reasonDetail?: string | null;
    status: 'Pending' | 'Accepted' | 'Rejected';
    imageUrls?: string[];
    createdAt: string | Date;
  }>;
}

// Extended Order interface with snapshot fields for deleted buyer handling
export interface OrderWithSnapshots extends Order {
  // Snapshot fields for when buyer is deleted
  buyerIdSnapshot?: string;
  contactPersonSnapshot?: string;
  storeNameSnapshot?: string;
  contactPhoneSnapshot?: string;
  customerEmailSnapshot?: string;
  deliveryAddressSnapshot?: string;
  orderDateSnapshot?: Date;
}

export interface OrderItem {
  productId: string | null;
  productName: string;
  category: string;
  subtotal: number;
  // Package information for B2B wholesale model
  packageType?: string;
  piecesPerPackage?: number;
  packageQuantity?: number;
  pricePerPackage?: number;
  // Variant information
  variantId?: number;
  // augmented fields for deleted product handling
  productDeleted?: boolean;
  productNameSnapshot?: string;
  productSkuSnapshot?: string;
  productTypeSnapshot?: string;
  variantNameSnapshot?: string; // Variant name at time of order
  // Product images
  images?: string[];
  brand?: string;
  description?: string;
  // Offer snapshots - preserve offer status at time of purchase
  offerApplied?: boolean;
  offerBadgeSnapshot?: 'Discount' | 'Promotion' | 'All Offers' | 'Offer';
  offerNameSnapshot?: string;
  originalPriceSnapshot?: number; // Decimal type from database, not string
  discountPercentage?: number;
  discountAmount?: number | null;
  promotionDetailsSnapshot?: string; // JSON string
  moqSnapshot?: number | null; // MOQ at time of order (in pieces)
}

export interface OrderTableRow {
  id: string;
  orderId: string;
  buyerId: string;
  buyerName: string;
  orderDate: string;
  orderStatus: string;
  paymentStatus: string;
  totalAmount: string;
  items: string;
  deliveryMethod: string;
  trackingNumber?: string;
  createdAt: string;
  updatedAt: string;
}
