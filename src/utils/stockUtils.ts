export type StockStatus = 'In Stock' | 'Low Stock' | 'Out of Stock';

type StockLike = {
  stockQuantity?: number | null;
  lowStockThreshold?: number | null;
};

export function getProductTotalStock(items: StockLike[]): { totalStock: number; lowStockThreshold: number } {
  const totalStock = items.reduce((sum, it) => sum + (typeof it.stockQuantity === 'number' ? it.stockQuantity : 0), 0);
  const lowStockThreshold = items.reduce(
    (max, it) => Math.max(max, typeof it.lowStockThreshold === 'number' ? it.lowStockThreshold : 0),
    0,
  );
  return { totalStock, lowStockThreshold };
}

export function getVariantStockStatus(stockQuantity?: number | null, lowStockThreshold?: number | null): StockStatus {
  const stock = typeof stockQuantity === 'number' ? stockQuantity : 0;
  const threshold = typeof lowStockThreshold === 'number' ? lowStockThreshold : 0;
  if (stock <= 0) return 'Out of Stock';
  if (threshold > 0 && stock <= threshold) return 'Low Stock';
  return 'In Stock';
}

