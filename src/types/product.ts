export interface Product {
  id?: number;
  productId: string;
  sku: string;
  name: string;
  description: string;
  category: string;
  brand: string;
  supplier: string;
  stockQuantity: number;
  lowStockThreshold?: number;
  stockStatus?: 'In Stock' | 'Low Stock' | 'Out of Stock';
  purchasePrice: string;
  sellingPrice: string;
  status: 'Draft' | 'Published';
  catalogType: 'Internal' | 'External';
  catalogName: string;
  images: string[];
  discount?: number;
  discountType?: string;
  createdAt?: Date;
  updatedAt?: Date;
  userId?: number;
}

export interface ProductTableRow {
  id: number;
  productId: string;
  sku: string;
  name: string;
  category: string;
  brand: string;
  supplier: string;
  stockQuantity: number;
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
  'Category': string;
  'Brand': string;
  'Supplier': string;
  'Stock Quantity': string;
  'Low Stock Threshold': string;
  'Stock Status': string;
  'Purchase Price': string;
  'Selling Price': string;
  'Status': string;
  'Catalog Type': string;
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
  category: string;
  brand: string;
  supplier: string;
  stockQuantity: number;
  lowStockThreshold: number;
  stockStatus: 'In Stock' | 'Low Stock' | 'Out of Stock';
  purchasePrice: string;
  sellingPrice: string;
  status: 'Draft' | 'Published';
  catalogType: 'Internal' | 'External';
  catalogName: string;
  images: string[];
  discount: number;
  discountType: string;
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
  category: string;
  stockFilter: string;
}
