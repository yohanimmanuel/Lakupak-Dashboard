export interface Order {
  // ===== SECTION 1: ORDER DETAILS (Top Left) =====
  id: string;
  orderId: string;
  buyerId: string;
  orderDate: Date;
  orderStatus: 'Pending' | 'Confirmed' | 'Packed' | 'Shipped' | 'Delivered' | 'Cancelled' | 'Returned';
  paymentStatus: 'Unpaid' | 'Paid';
  deliveryMethod: 'Distributor Fleet' | '3rd-Party Courier' | 'Pickup';
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
  // augmented fields for deleted product handling
  productDeleted?: boolean;
  productNameSnapshot?: string;
  productSkuSnapshot?: string;
  productTypeSnapshot?: string;
  // Product images
  images?: string[];
  brand?: string;
  description?: string;
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
