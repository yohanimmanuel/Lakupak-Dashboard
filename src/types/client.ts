export interface Buyer {
  id?: number;
  buyerId: string;
  avatar?: string;
  owner: string;
  email: string;
  phone: string;
  storeName: string;
  businessType: string;
  subChannel?: string;
  outletExamples?: string;
  address: string;
  status: string;
  logistics?: string;
  notes?: string;
  orderDetails?: string;
  /** Immutable OrderItem line snapshots included in the initial buyer query. */
  orderLineDetails?: string;
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
  /** Catalog identity for manually managed buyer order rows. */
  productId?: string;
  sku?: string;
  variantOptionId?: string | number;
  variantName?: string;
  /** Historical or imported selling price for one selected package. */
  pricePerPackage?: string;
  /** Selected stock level; totalOrders also retains a display-safe quantity + unit string. */
  stockType?: string;
  /** Number of base Pieces represented by one selected stockType unit. */
  piecesPerPackage?: number;
}

export interface SupplyDetail {
  suppliesno: string;
  sku: string;
  product: string;
  /** Canonical absolute piece quantity used for inventory and supply summaries. */
  totalSupplied: string;
  /** Original quantity entered by the supplier in receivedUnit. */
  receivedQuantity?: string;
  /** Product stock level selected when the supplier entered receivedQuantity. */
  receivedUnit?: string;
  totalValue: string;
  /** Canonical last supplied date for history and summary rows. */
  lastSuppliedDate?: string;
  /** Legacy JSON/import alias. Normalize to lastSuppliedDate when reading. */
  lastDelivery?: string;
  status: string;
  deliverySuccess?: string;
  recordType?: 'history' | 'summary';
  productId?: string;
  variantName?: string;
  variantOptionId?: number | null;
  /** Original catalog identity retained after the live variant FK is cleared. */
  historicalVariantOptionId?: number | null;
  archivedAt?: string | null;
  updateCurrentStock?: boolean;
  stockApplied?: boolean;
  /** Variant whose stock was actually adjusted; kept even if that catalog variant is deleted. */
  stockAppliedVariantOptionId?: number | null;
  __delete?: true;
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
  subChannel?: string;
  outletExamples?: string;
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
