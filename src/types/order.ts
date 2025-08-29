export interface Order {
  // ===== SECTION 1: ORDER DETAILS (Top Left) =====
  id: string;
  orderId: string;
  buyerId: string;
  orderDate: Date;
  orderStatus: 'Pending' | 'Confirmed' | 'Packed' | 'Shipped' | 'Delivered' | 'Cancelled' | 'Returned';
  paymentStatus: 'Unpaid' | 'Paid' | 'Overdue';
  deliveryMethod: 'Distributor Fleet' | '3rd-Party Courier' | 'Pickup';
  subtotal: number;
  discounts: number;
  taxes: number;
  shippingFee: number;
  totalAmount: number;
  paymentTerms: string;
  currency: string;

  // ===== SECTION 2: ORDER ITEMS (Top Right) =====
  orderItems: OrderItem[];

  // ===== SECTION 3: EARNINGS BREAKDOWN (Middle) =====
  shopEarnings: number;
  totalOrders: number;

  // ===== SECTION 4: CUSTOMER INFORMATION (Bottom Left) =====
  contactPerson: string;
  storeName: string;
  contactPhone: string;
  customerEmail?: string;

  // ===== SECTION 5: DELIVERY SERVICE (Bottom Right) =====
  deliveryAddress: string;
  preferredDeliveryTime?: string;
  assignedLogistics?: string;
  trackingNumber?: string;
  deliveryNote?: string;
  deliveryConfirmation?: string;
  pod?: string;

  // ===== AUDIT & LOGS =====
  createdAt: Date;
  updatedAt: Date;
  acceptedBy?: string;
  acceptedAt?: Date;
}

export interface OrderItem {
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
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
