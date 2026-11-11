export interface Buyer {
  id?: number;
  buyerId: string;
  avatar?: string;
  owner: string;
  email: string;
  phone: string;
  storeName: string;
  businessType: string;
  address: string;
  status: string;
  logistics?: string;
  notes?: string;
  orderDetails?: string;
  avgMonthlySpending?: number;
  avgMonthlyOrders?: number;
  createdAt?: Date;
  updatedAt?: Date;
  userId?: number;
}

export interface Supplier {
  id?: number;
  supplierId: string;
  name: string;
  contact: string;
  email: string;
  phone: string;
  businessType: string;
  address: string;
  status: string;
  logistics?: string;
  notes?: string;
  supplies?: string;
  avgMonthlyPurchaseValue?: number;
  totalPurchases?: number;
  totalSupplies?: number;
  onTimeDeliveryRate?: number;
  createdAt?: Date;
  updatedAt?: Date;
  userId?: number;
}

export interface BuyerTableRow {
  id: number;
  buyerId: string;
  avatar?: string;
  owner: string;
  name: string;
  email: string;
  phone: string;
  storeName: string;
  businessType: string;
  address: string;
  status: string;
  totalOrders?: string;
  totalSpend?: string;
  outstanding?: string;
  lastVisit?: string;
  createdAt: string;
  lastUpdated: string;
  userId: number;
}

export interface SupplierTableRow {
  id: number;
  supplierId: string;
  name: string;
  contact: string;
  email: string;
  phone: string;
  businessType: string;
  address: string;
  status: string;
  totalSupplies?: number;
  totalPurchases?: string;
  createdAt: string;
  lastUpdated: string;
  userId: number;
}

export interface OrderDetail {
  orderNo: string;
  product: string;
  totalOrders: string;
  totalSpend: string;
  shippingFee?: string;
  lastOrderDate: string;
  outstanding: string;
  freeItems?: number;
  discountBadge?: string;
  offerApplied?: boolean;
  /** Set when row was written by syncOrderToBuyerProfile from live Order rows. */
  syncedFromOrders?: boolean;
}

export interface SupplyDetail {
  suppliesno: string;
  sku: string;
  product: string;
  /** Quantity received (history) or rolled-up total (summary). */
  totalSupplied: string;
  totalValue: string;
  /** Last supplied date for history rows; unused on summary rows. */
  lastDelivery: string;
  status: string;
  deliverySuccess?: string;
  /**
   * history = dated supply event (duplicates allowed).
   * summary = aggregate total (product↔supplier match + rolled-up history).
   * Missing type is inferred: AUTO-* → summary, otherwise history.
   */
  recordType?: 'history' | 'summary';
  productId?: string;
  variantName?: string;
  /**
   * When true, saving/editing this history row adjusts variant stock + supply summary.
   * When deleted while true, those adjustments are reversed.
   * Uncheck before delete to remove the history row without touching products.
   */
  updateCurrentStock?: boolean;
  /**
   * Set once this history row has applied stock. Re-checking Update Stock must not
   * apply the same row's quantity again.
   */
  stockApplied?: boolean;
}

export interface BuyerFormData {
  id?: number;
  buyerId?: string;
  avatar?: string;
  owner: string;
  email: string;
  phone: string;
  storeName: string;
  businessType: string;
  address: string;
  status: string;
  createdAt?: string;
  preferredDays?: string;
  lastShipment?: string;
  lastVisit?: string;
  shipmentSuccess?: string;
  notes?: string;
  orderDetails?: OrderDetail[];
}

export interface SupplierFormData {
  id?: number;
  supplierId?: string;
  name: string;
  contact: string;
  email: string;
  phone: string;
  businessType: string;
  address: string;
  status: string;
  logistics?: string;
  notes?: string;
  supplies?: SupplyDetail[];
}

export interface ImportRow {
  [key: string]: string;
}

export interface ClientStats {
  totalBuyers: number;
  activeBuyers: number;
  totalSuppliers: number;
  activeSuppliers: number;
}

export interface ClientFilters {
  search: string;
  status: string;
  businessType: string;
}
