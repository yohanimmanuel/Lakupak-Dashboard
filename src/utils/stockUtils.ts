/**
 * Stock calculation utilities for variant-level stock management
 */

export interface VariantStock {
  stockQuantity: number;
  lowStockThreshold?: number;
  stockStatus?: string;
}

export interface ProductStock {
  totalStock: number;
  lowStockThreshold: number;
  stockStatus: string;
}

/**
 * Calculate total product stock from all variants
 * @param variants - Array of product variants with stock info
 * @returns Total stock, low stock threshold, and stock status
 */
export function getProductTotalStock(variants: VariantStock[]): ProductStock {
  if (!variants || variants.length === 0) {
    return {
      totalStock: 0,
      lowStockThreshold: 0,
      stockStatus: 'Out of Stock'
    };
  }

  // Sum all variant stocks
  const totalStock = variants.reduce((sum, variant) => sum + (variant.stockQuantity || 0), 0);
  
  // Use the minimum low stock threshold across all variants
  const lowStockThreshold = Math.min(
    ...variants.map(v => v.lowStockThreshold || 0).filter(t => t > 0)
  ) || 0;

  // Determine stock status
  let stockStatus = 'In Stock';
  if (totalStock === 0) {
    stockStatus = 'Out of Stock';
  } else if (totalStock <= lowStockThreshold) {
    stockStatus = 'Low Stock';
  }

  return {
    totalStock,
    lowStockThreshold,
    stockStatus
  };
}

/**
 * Update variant stock status based on quantity and threshold
 * @param stockQuantity - Current stock quantity
 * @param lowStockThreshold - Low stock threshold
 * @returns Stock status string
 */
export function getVariantStockStatus(
  stockQuantity: number,
  lowStockThreshold: number
): string {
  if (stockQuantity === 0) {
    return 'Out of Stock';
  } else if (stockQuantity <= lowStockThreshold) {
    return 'Low Stock';
  }
  return 'In Stock';
}

/**
 * Check if product has sufficient stock across all variants
 * @param variants - Array of product variants
 * @returns True if at least one variant has stock
 */
export function hasProductStock(variants: VariantStock[]): boolean {
  if (!variants || variants.length === 0) return false;
  return variants.some(v => (v.stockQuantity || 0) > 0);
}

/**
 * Get variant with most stock
 * @param variants - Array of product variants with stock info
 * @returns Variant with highest stock quantity
 */
export function getVariantWithMostStock<T extends VariantStock>(variants: T[]): T | null {
  if (!variants || variants.length === 0) return null;
  return variants.reduce((max, variant) => 
    (variant.stockQuantity || 0) > (max.stockQuantity || 0) ? variant : max
  );
}

