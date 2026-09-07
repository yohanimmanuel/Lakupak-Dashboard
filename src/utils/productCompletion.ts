import { parseNumberByCurrency } from '@/config/currencyConfig';

export type ProductRequiredFieldKey =
  | 'sku'
  | 'name'
  | 'description'
  | 'category'
  | 'brand'
  | 'supplier'
  | 'images'
  | 'variants'
  | 'stock';

export interface ProductFieldCheck {
  key: ProductRequiredFieldKey;
  nameKey: ProductRequiredFieldKey;
  isComplete: boolean;
}

export interface ProductCompletionInfo {
  totalFields: number;
  completedCount: number;
  completionPercentage: number;
  isComplete: boolean;
  missingFieldKeys: ProductRequiredFieldKey[];
  fields: ProductFieldCheck[];
}

export interface ProductLike {
  sku?: string | null;
  name?: string | null;
  description?: string | null;
  productType?: string | null;
  brand?: string | null;
  supplier?: string | null;
  images?: string[] | null;
  variantOptions?: Array<{
    purchasePrice?: string | null;
    sellingPrice?: string | null;
    stockQuantity?: number | null;
    lowStockThreshold?: number | null;
    isActive?: boolean | null;
  }> | null;
}

export interface CombinationLike {
  purchasePrice?: string | number | null;
  sellingPrice?: string | number | null;
  stockQuantity?: string | number | null;
  lowStockThreshold?: string | number | null;
  isActive?: boolean | null;
}

/**
 * Calculates product catalog completion across the 9 standard fields:
 * SKU, Name, Description, Category (Product Type), Brand, Supplier, Images, Variants, Stock.
 *
 * Can accept either:
 * - A Product object with `variantOptions` (e.g. from ProductTable)
 * - Form data + `combinations` matrix (e.g. from ProductCatalog editor)
 */
export function getProductCompletion(
  product?: ProductLike | null,
  combinations?: CombinationLike[] | null,
  currencyCode?: string,
  options?: { requirePositiveStock?: boolean; requirePositivePrice?: boolean }
): ProductCompletionInfo {
  const requirePositiveStock = options?.requirePositiveStock ?? false;
  const requirePositivePrice = options?.requirePositivePrice ?? false;

  const hasSku = Boolean(String(product?.sku || '').trim());
  const hasName = Boolean(String(product?.name || '').trim());
  const hasDescription = Boolean(String(product?.description || '').trim());
  const hasCategory = Boolean(String(product?.productType || '').trim());
  const hasBrand = Boolean(String(product?.brand || '').trim());
  const hasSupplier = Boolean(String(product?.supplier || '').trim());
  const hasImages = Boolean(
    product?.images && Array.isArray(product.images) && product.images.length > 0
  );

  let hasVariants = false;
  let hasStock = false;

  if (combinations !== undefined && combinations !== null) {
    // Evaluating from combinations matrix (ProductCatalog)
    const hasRows = combinations.length > 0;
    hasVariants =
      hasRows &&
      combinations.every((combo) => {
        const purchaseRaw = String(combo.purchasePrice ?? '').trim();
        const sellingRaw = String(combo.sellingPrice ?? '').trim();
        if (!purchaseRaw || !sellingRaw) return false;
        const purchase = parseNumberByCurrency(purchaseRaw, currencyCode);
        const selling = parseNumberByCurrency(sellingRaw, currencyCode);
        const isPurchaseValid =
          Number.isFinite(purchase) && (requirePositivePrice ? purchase > 0 : purchase >= 0);
        const isSellingValid =
          Number.isFinite(selling) && (requirePositivePrice ? selling > 0 : selling >= 0);
        return isPurchaseValid && isSellingValid;
      });

    const allVariantsHaveValidStock =
      hasRows &&
      combinations.every((combo) => {
        if (combo.stockQuantity === undefined || combo.stockQuantity === null || combo.stockQuantity === '') {
          return false;
        }
        const qty = typeof combo.stockQuantity === 'number' ? combo.stockQuantity : Number(combo.stockQuantity);
        return Number.isFinite(qty) && qty >= 0;
      });

    if (requirePositiveStock) {
      const totalStock = combinations.reduce((sum, c) => {
        const qty = typeof c.stockQuantity === 'number' ? c.stockQuantity : Number(c.stockQuantity || 0);
        return sum + (Number.isFinite(qty) ? qty : 0);
      }, 0);
      hasStock = allVariantsHaveValidStock && totalStock > 0;
    } else {
      hasStock = allVariantsHaveValidStock;
    }
  } else {
    // Evaluating from product.variantOptions (ProductTable)
    const variantOptions = product?.variantOptions;
    const hasRows = Boolean(variantOptions && variantOptions.length > 0);

    hasVariants =
      hasRows &&
      variantOptions!.every((vo) => {
        const purchaseRaw = String(vo.purchasePrice ?? '').trim();
        const sellingRaw = String(vo.sellingPrice ?? '').trim();
        if (!purchaseRaw || !sellingRaw) return false;
        if (vo.isActive === false) return false;
        const purchase = parseNumberByCurrency(purchaseRaw, currencyCode);
        const selling = parseNumberByCurrency(sellingRaw, currencyCode);
        const isPurchaseValid =
          Number.isFinite(purchase) && (requirePositivePrice ? purchase > 0 : purchase >= 0);
        const isSellingValid =
          Number.isFinite(selling) && (requirePositivePrice ? selling > 0 : selling >= 0);
        return isPurchaseValid && isSellingValid;
      });

    const allVariantsHaveValidStock =
      hasRows &&
      variantOptions!.every((vo) => {
        if (vo.stockQuantity === undefined || vo.stockQuantity === null) {
          return false;
        }
        const qty = typeof vo.stockQuantity === 'number' ? vo.stockQuantity : Number(vo.stockQuantity);
        return Number.isFinite(qty) && qty >= 0;
      });

    if (requirePositiveStock) {
      const totalStock = variantOptions
        ? variantOptions.reduce((sum, vo) => {
            const qty = typeof vo.stockQuantity === 'number' ? vo.stockQuantity : Number(vo.stockQuantity || 0);
            return sum + (Number.isFinite(qty) ? qty : 0);
          }, 0)
        : 0;
      hasStock = allVariantsHaveValidStock && totalStock > 0;
    } else {
      hasStock = allVariantsHaveValidStock;
    }
  }

  const fields: ProductFieldCheck[] = [
    { key: 'sku', nameKey: 'sku', isComplete: hasSku },
    { key: 'name', nameKey: 'name', isComplete: hasName },
    { key: 'description', nameKey: 'description', isComplete: hasDescription },
    { key: 'category', nameKey: 'category', isComplete: hasCategory },
    { key: 'brand', nameKey: 'brand', isComplete: hasBrand },
    { key: 'supplier', nameKey: 'supplier', isComplete: hasSupplier },
    { key: 'images', nameKey: 'images', isComplete: hasImages },
    { key: 'variants', nameKey: 'variants', isComplete: hasVariants },
    { key: 'stock', nameKey: 'stock', isComplete: hasStock },
  ];

  const totalFields = fields.length;
  const completedCount = fields.filter((f) => f.isComplete).length;
  const completionPercentage = Math.round((completedCount / totalFields) * 100);
  const isComplete = completedCount === totalFields;
  const missingFieldKeys = fields.filter((f) => !f.isComplete).map((f) => f.key);

  return {
    totalFields,
    completedCount,
    completionPercentage,
    isComplete,
    missingFieldKeys,
    fields,
  };
}

/**
 * Checks if a product is eligible for marketplace publishing.
 * Requires:
 * 1. 100% catalog completion across all 9 fields (including all variants priced and configured)
 * 2. Total stock quantity > 0 (as enforced by backend GraphQL mutation)
 */
export function isProductMarketplacePublishable(
  product?: ProductLike | null,
  currencyCode?: string
): boolean {
  if (!product) return false;
  const completion = getProductCompletion(product, undefined, currencyCode, {
    requirePositiveStock: true,
    requirePositivePrice: true,
  });
  return completion.isComplete;
}
