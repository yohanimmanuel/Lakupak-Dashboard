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
}

export interface SupplyDetail {
  suppliesno: string;
  sku: string;
  product: string;
  totalSupplied: string;
  totalValue: string;
  lastDelivery: string;
  status: string;
  deliverySuccess?: string;
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
