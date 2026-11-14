// Variant definitions (variant types with options)
export interface VariantDefinition {
  id?: number;
  productId?: number;
  variantType: string; // e.g., "Color", "Size"
  options: string[]; // e.g., ["Red", "Blue", "White"]
  position: number; // order in UI
  createdAt?: Date;
  updatedAt?: Date;
}

// A product may expose any number of package levels, all converted directly to pieces.
export interface StockLevel {
  name: string;
  /** Cumulative number of base Pieces represented by one unit at this level. */
  piecesPerUnit: number;
  /** Number of immediately preceding-level units represented by one unit here. */
  unitsPerPreviousLevel?: number;
}

// Variant combinations (actual product variations)
export interface VariantOption {
  id?: number;
  productId?: number;
  variantName: string; // e.g., "Color: Red | Size: M"
  attributes: Record<string, string>; // {"Color": "Red", "Size": "M"}
  sku?: string;
  purchasePrice: string;
  sellingPrice: string;
  originalSellingPrice?: string;
  moq?: number;
  stockQuantity: number;
  lowStockThreshold: number;
  stockStatus: 'In Stock' | 'Low Stock' | 'Out of Stock';
  isDefault: boolean;
  isActive: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

// New ProductVariant (for variant definitions with position and options)
export interface ProductVariantDefinition {
  id?: number;
  productId?: number;
  variantType: string; // e.g., "Color", "Size"
  options: string[]; // e.g., ["Red", "Blue", "White"]
  position: number; // order 1..n in UI
  createdAt?: Date;
  updatedAt?: Date;
  // Pricing/stock metadata for compatibility with analytics calculations
  purchasePrice?: string;
  sellingPrice?: string;
  originalSellingPrice?: string;
  moq?: number;
  stockQuantity?: number;
  lowStockThreshold?: number;
  stockStatus?: 'In Stock' | 'Low Stock' | 'Out of Stock';
}

// Legacy ProductVariant (for backward compatibility)
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
  // Stock management at variant level (piece-based)
  stockQuantity: number;
  lowStockThreshold: number;
  stockStatus: 'In Stock' | 'Low Stock' | 'Out of Stock';
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
  /** Target retailer segment from distributor buyer business types */
  marketSegment?: string | null;
  name: string;
  description: string;
  productType: string;
  brand: string;
  supplier: string;
  status: 'Draft' | 'Published';
  merchandisingCategorySlug?: string;
  catalogName: string;
  images: string[];
  // Product assurance
  halalCertified?: boolean;
  bpomApproved?: boolean;
  originalProduct?: boolean;
  returnPolicyDays?: number;
  /** Flexible package equivalents. VariantOption.stockQuantity is always absolute pieces. */
  stockLevels?: StockLevel[] | null;
  /** Legacy field retained for reading old records during the one-time stock conversion. */
  stockUnit?: string | null;
  // Product-level stock is computed from sum of all variant stocks
  // Use getProductTotalStock() helper function to calculate
  stockQuantity?: number; // Computed field
  lowStockThreshold?: number; // Computed field
  stockStatus?: 'In Stock' | 'Low Stock' | 'Out of Stock'; // Computed field
  // New variant structure
  variantDefinitions?: VariantDefinition[]; // Variant types and options
  variantOptions?: VariantOption[]; // Actual combinations
  // New variants (for variant definitions with position and options)
  variants?: ProductVariantDefinition[];
  createdAt?: Date;
  updatedAt?: Date;
  userId?: number;
  // Offer integration
  offerBadge?: 'Discount' | 'Promotion' | 'All Offers' | 'Offer';
  originalPrice?: string;
  hasActiveOffer?: boolean;
  customOfferClientCount?: number;
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
  // Package information (for display only)
  packageType?: string;
  piecesPerPackage?: number;
  purchasePrice: string;
  sellingPrice: string; // Can be a range like "Rp 3500 – Rp 6000"
  status: string;
  createdAt: string;
  lastUpdated: string;
  userId: number;
  // New variant structure for price range calculation
  variantOptions?: VariantOption[];
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
  'MOQ': string;
  'Stock Status': string;
  'Purchase Price': string;
  'Selling Price': string;
  'Status': string;
  'Product Category': string;
  'Catalog Name': string;
  'Discount': string;
  'Discount Type': string;
}

export type ProductImportResult = {
  succeeded: number;
  failed: number;
};

export interface ProductFormData {
  id?: number;
  productId?: string;
  sku: string;
  marketSegment: string;
  name: string;
  description: string;
  productType: string;
  brand: string;
  supplier: string;
  status: 'Draft' | 'Published';
  merchandisingCategorySlug?: string;
  catalogName: string;
  images: string[];
  /** Flexible package equivalents. Pieces is compulsory and always has ratio 1. */
  stockLevels: StockLevel[];
  /** Legacy compatibility field; new saves always set this to Pieces. */
  stockUnit: string;
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
