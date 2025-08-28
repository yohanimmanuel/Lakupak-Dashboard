export interface Order {
  // 1. Identification
  id: string;
  orderId: string;
  buyerId: string;
  
  // 2. Order Details
  orderDate: Date;
  orderStatus: 'Pending' | 'Confirmed' | 'Packed' | 'Shipped' | 'Delivered' | 'Cancelled' | 'Returned';
  paymentStatus: 'Unpaid' | 'Paid' | 'Overdue';
  deliveryMethod: 'Distributor Fleet' | '3rd-Party Courier' | 'Pickup';
  
  // 3. Products
  orderItems: OrderItem[];
  
  // 4. Financials
  subtotal: number;
  discounts: number;
  taxes: number;
  shippingFee: number;
  totalAmount: number;
  paymentTerms: string;
  
  // 5. Shipping & Fulfillment
  deliveryAddress: string;
  contactPerson: string;
  contactPhone: string;
  preferredDeliveryTime?: string;
  assignedLogistics?: string;
  trackingNumber?: string;
  deliveryNoteNo?: string;
  
  // 6. Audit & Logs
  createdAt: Date;
  updatedAt: Date;
  acceptedBy?: string;
  acceptedAt?: Date;
  deliveryConfirmation?: string;
  pod?: string;
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
