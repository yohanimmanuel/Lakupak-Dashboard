// Package reference for display and fulfillment (NOT separate SKUs)
export interface PackageInfo {
  id?: number;
  packageName?: string; // e.g., "Small Box", "Large Carton"
  packageType: string; // e.g., "Piece", "Pack", "Carton", "Box"
  piecesPerPackage: number;
  displayOrder: number;
  isDefault: boolean;
  createdAt?: Date;
  updatedAt?: Date;
  productId?: number;
}

// Variants for actual product variations (color, size, flavor - NOT package types)
export interface ProductVariant {
  id?: number;
  variantName: string; // e.g., "Original Flavor", "Spicy", "Red", "Size M"
  variantType?: string; // e.g., "Flavor", "Color", "Size"
  sku?: string; // Variant-specific SKU
  // Pricing at variant level
  purchasePrice: string;
  sellingPrice: string;
  originalSellingPrice?: string;
  // MOQ at variant level (different distributors may have different MOQs)
  moq?: number; // Minimum Order Quantity in pieces
  // Variant attributes
  attributes?: Record<string, unknown>;
  isDefault: boolean;
  isActive: boolean;
  createdAt?: Date;
  updatedAt?: Date;
  productId?: number;
}

export interface Product {
  id?: number;
  productId: string;
  sku: string;
  name: string;
  description: string;
  productType: string;
  brand: string;
  supplier: string;
  status: 'Draft' | 'Published';
  productCategory: string;
  catalogName: string;
  images: string[];
  // Product assurance
  halalCertified?: boolean;
  bpomApproved?: boolean;
  originalProduct?: boolean;
  returnPolicyDays?: number;
  // Stock management at product level (piece-based)
  stockQuantity: number;
  lowStockThreshold: number;
  stockStatus: 'In Stock' | 'Low Stock' | 'Out of Stock';
  // Package reference (for display only)
  packageInfo?: PackageInfo[];
  // Variants (for actual product variations)
  variants?: ProductVariant[];
  createdAt?: Date;
  updatedAt?: Date;
  userId?: number;
  // Offer integration
  offerBadge?: 'Discount' | 'Promotion' | 'All Offers' | 'Offer';
  originalPrice?: string;
  hasActiveOffer?: boolean;
  offerId?: string;
  offerName?: string;
  discountType?: 'percentage' | 'fixed' | 'buy_x_get_y';
  discountValue?: number;
  promotionDetails?: {
    minQuantity: number; // in pieces
    freeQuantity: number; // in pieces
    description: string;
  };
}

export interface ProductTableRow {
  id: number;
  productId: string;
  sku: string;
  name: string;
  productType: string;
  brand: string;
  supplier: string;
  stockQuantity: number;
  lowStockThreshold: number;
  // Package information
  packageType?: string;
  piecesPerPackage?: number;
  purchasePrice: string;
  sellingPrice: string;
  status: string;
  createdAt: string;
  lastUpdated: string;
  userId: number;
}

export interface ProductImportRow {
  'Product ID': string;
  'SKU': string;
  'Product Name': string;
  'Description': string;
  'Product Type': string;
  'Brand': string;
  'Supplier': string;
  'Stock Quantity': string;
  'Low Stock Threshold': string;
  'Stock Status': string;
  'Purchase Price': string;
  'Selling Price': string;
  'Status': string;
  'Product Category': string;
  'Catalog Name': string;
  'Discount': string;
  'Discount Type': string;
}

export interface ProductFormData {
  id?: number;
  productId?: string;
  sku: string;
  name: string;
  description: string;
  productType: string;
  brand: string;
  supplier: string;
  status: 'Draft' | 'Published';
  productCategory: string;
  catalogName: string;
  images: string[];
  // Product assurance
  halalCertified: boolean;
  bpomApproved: boolean;
  originalProduct: boolean;
  returnPolicyDays: number;
}

export interface ProductStats {
  totalProducts: number;
  activeProducts: number;
  lowStockAlerts: number;
  outOfStock: number;
}

export interface ProductFilters {
  search: string;
  status: string;
  productType: string;
  stockFilter: string;
}
