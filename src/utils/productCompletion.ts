import { parseNumberByCurrency } from '@/config/currencyConfig';
import { parsePrice } from '@/utils/currencyUtils';

export type ProductRequiredFieldKey =
  | 'marketSegment'
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
  marketSegment?: string | null;
  name?: string | null;
  description?: string | null;
  productType?: string | null;
  brand?: string | null;
  supplier?: string | null;
  images?: string[] | null;
  variantOptions?: Array<{
    purchasePrice?: string | number | null;
    sellingPrice?: string | number | null;
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
 * Options for the catalog completion display, shared by the ProductCatalog editor
 * and ProductTable so both report the same percentage and missing fields.
 */
export const CATALOG_COMPLETION_OPTIONS = { requirePositivePrice: true } as const;

/** Parse a variant price from GraphQL numbers or currency-formatted strings. Empty → null. */
function resolveVariantPrice(
  value: string | number | null | undefined,
  currencyCode?: string,
): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  const raw = String(value).trim();
  if (!raw) return null;
  const fromCurrency = parseNumberByCurrency(raw, currencyCode);
  if (Number.isFinite(fromCurrency)) return fromCurrency;
  const fromPrice = parsePrice(raw, currencyCode);
  return Number.isFinite(fromPrice) ? fromPrice : null;
}

/**
 * Calculates product catalog completion across the 9 standard fields:
 * Market Segment, Name, Description, Category (Product Type), Brand, Supplier, Images, Variants, Stock.
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

  const hasMarketSegment = Boolean(String(product?.marketSegment || '').trim());
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
        const purchase = resolveVariantPrice(combo.purchasePrice, currencyCode);
        const selling = resolveVariantPrice(combo.sellingPrice, currencyCode);
        if (purchase === null || selling === null) return false;
        const isPurchaseValid = requirePositivePrice ? purchase > 0 : purchase >= 0;
        const isSellingValid = requirePositivePrice ? selling > 0 : selling >= 0;
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
    // Evaluating from product.variantOptions (ProductTable).
    // Inactive rows are ignored so leftover inactive options don't look like "missing variants".
    const variantOptions = (product?.variantOptions || []).filter((vo) => vo.isActive !== false);
    const hasRows = variantOptions.length > 0;

    hasVariants =
      hasRows &&
      variantOptions.every((vo) => {
        const purchase = resolveVariantPrice(vo.purchasePrice, currencyCode);
        const selling = resolveVariantPrice(vo.sellingPrice, currencyCode);
        if (purchase === null || selling === null) return false;
        const isPurchaseValid = requirePositivePrice ? purchase > 0 : purchase >= 0;
        const isSellingValid = requirePositivePrice ? selling > 0 : selling >= 0;
        return isPurchaseValid && isSellingValid;
      });

    const allVariantsHaveValidStock =
      hasRows &&
      variantOptions.every((vo) => {
        if (vo.stockQuantity === undefined || vo.stockQuantity === null) {
          return false;
        }
        const qty = typeof vo.stockQuantity === 'number' ? vo.stockQuantity : Number(vo.stockQuantity);
        return Number.isFinite(qty) && qty >= 0;
      });

    if (requirePositiveStock) {
      const totalStock = variantOptions.reduce((sum, vo) => {
        const qty = typeof vo.stockQuantity === 'number' ? vo.stockQuantity : Number(vo.stockQuantity || 0);
        return sum + (Number.isFinite(qty) ? qty : 0);
      }, 0);
      hasStock = allVariantsHaveValidStock && totalStock > 0;
    } else {
      hasStock = allVariantsHaveValidStock;
    }
  }

  const fields: ProductFieldCheck[] = [
    { key: 'marketSegment', nameKey: 'marketSegment', isComplete: hasMarketSegment },
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
 * True when a product has no active variants, or active variants with incomplete prices.
 * Pass an existing completion result to avoid recomputing.
 */
export function productHasMissingVariants(
  product?: ProductLike | null,
  currencyCode?: string,
  completion?: ProductCompletionInfo | null,
): boolean {
  const info =
    completion ??
    (product
      ? getProductCompletion(product, undefined, currencyCode, CATALOG_COMPLETION_OPTIONS)
      : null);
  if (!info) return true;
  return info.fields.find((field) => field.key === 'variants')?.isComplete !== true;
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
