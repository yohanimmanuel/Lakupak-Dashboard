export type StockStatus = 'In Stock' | 'Low Stock' | 'Out of Stock';

type StockLike = {
  stockQuantity?: number | null;
  lowStockThreshold?: number | null;
};

export function getProductTotalStock(items: StockLike[]): { totalStock: number; lowStockThreshold: number } {
  const totalStock = items.reduce((sum, it) => sum + (typeof it.stockQuantity === 'number' ? it.stockQuantity : 0), 0);
  const lowStockThreshold = items.reduce(
    (sum, it) => sum + (typeof it.lowStockThreshold === 'number' ? it.lowStockThreshold : 0),
    0,
  );
  return { totalStock, lowStockThreshold };
}

/** Per-variant / per-combination status from that row's stock + threshold. */
export function getVariantStockStatus(stockQuantity?: number | null, lowStockThreshold?: number | null): StockStatus {
  const stock = typeof stockQuantity === 'number' ? stockQuantity : 0;
  const threshold = typeof lowStockThreshold === 'number' ? lowStockThreshold : 0;
  if (stock <= 0) return 'Out of Stock';
  if (threshold > 0 && stock <= threshold) return 'Low Stock';
  return 'In Stock';
}

/**
 * Product-level status from aggregated stock across variants.
 * One out-of-stock variant must not mark the whole product out of stock
 * if other variants still hold inventory.
 */
export function getProductStockStatus(items: StockLike[]): StockStatus {
  const { totalStock, lowStockThreshold } = getProductTotalStock(items);
  return getVariantStockStatus(totalStock, lowStockThreshold);
}

