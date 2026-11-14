import type { Product, ProductFormData } from '../../types/product';
import type { VariationImportRow } from '@/components/productscatalogs/VariationListImport';
import { parseNumberByCurrency } from '@/config/currencyConfig';
import { getVariantStockStatus } from '@/utils/stockUtils';

export const isFormDataEqual = (a: ProductFormData, b: ProductFormData): boolean => {
  return (
    a.id === b.id &&
    a.productId === b.productId &&
    a.sku === b.sku &&
    a.marketSegment === b.marketSegment &&
    a.name === b.name &&
    a.description === b.description &&
    a.productType === b.productType &&
    a.brand === b.brand &&
    a.supplier === b.supplier &&
    a.status === b.status &&
    a.catalogName === b.catalogName &&
    a.stockUnit === b.stockUnit &&
    JSON.stringify(a.stockLevels) === JSON.stringify(b.stockLevels) &&
    a.sellingPriceUnit === b.sellingPriceUnit &&
    a.purchasePriceUnit === b.purchasePriceUnit &&
    JSON.stringify(a.images) === JSON.stringify(b.images) &&
    a.halalCertified === b.halalCertified &&
    a.bpomApproved === b.bpomApproved &&
    a.originalProduct === b.originalProduct &&
    a.returnPolicyDays === b.returnPolicyDays
  );
};
 

export interface Combination {
  id: string;
  variantName?: string;
  sku: string;
  purchasePrice: string;
  sellingPrice: string;
  moq?: number;
  stockQuantity: number;
  lowStockThreshold: number;
  stockStatus: 'In Stock' | 'Low Stock' | 'Out of Stock';
  [key: string]: unknown; // For variant columns like variant_color, variant_size, etc.
}

export type CatalogVariant = {
  id: string;
  variantType: string;
  moq?: number;
  options: Array<{ id: string; name: string }>;
};

export function isFiniteNonNegativeNumber(value: unknown): boolean {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) && n >= 0;
}

/**
 * Prices must be parseable, finite, and greater than zero (empty / "abc" / 0 / negatives rejected),
 * matching getProductCompletion and the publishMarketplaceProduct mutation.
 */
export function isCompleteCombination(combo: Combination, currencyCode?: string): boolean {
  const purchaseRaw = String(combo.purchasePrice ?? '').trim();
  const sellingRaw = String(combo.sellingPrice ?? '').trim();
  if (!purchaseRaw || !sellingRaw) return false;

  const purchase = parseNumberByCurrency(purchaseRaw, currencyCode);
  const selling = parseNumberByCurrency(sellingRaw, currencyCode);

  return (
    Number.isFinite(purchase) &&
    purchase > 0 &&
    Number.isFinite(selling) &&
    selling > 0 &&
    isFiniteNonNegativeNumber(combo.stockQuantity) &&
    isFiniteNonNegativeNumber(combo.lowStockThreshold)
  );
}

/** True when a default/draft row has any SKU, price, stock, or MOQ the user entered. */
export function combinationHasDraftData(combo: Combination): boolean {
  return Boolean(
    String(combo.sku ?? '').trim() ||
      String(combo.purchasePrice ?? '').trim() ||
      String(combo.sellingPrice ?? '').trim() ||
      (Number(combo.stockQuantity) || 0) > 0 ||
      (Number(combo.lowStockThreshold) || 0) > 0 ||
      (combo.moq != null && String(combo.moq).trim() !== '' && Number.isFinite(Number(combo.moq))),
  );
}

export function normalizeImportMatchValue(value: unknown): string {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

export function getImportRowVariantValue(
  row: VariationImportRow,
  variant: CatalogVariant,
  variantIndex: number,
): string {
  const byId = String(row.variantValues[variant.id] ?? '').trim();
  if (byId) return byId;
  return String(row.variantValuesByPosition?.[variantIndex] ?? '').trim();
}

export function buildCombinationFromImportRow(
  row: VariationImportRow,
  variantsList: CatalogVariant[],
  index: number,
): Combination {
  const combo: Combination = {
    id: `combination-import-${Date.now()}-${index}`,
    sku: row.sku.trim(),
    purchasePrice: row.purchasePrice.trim(),
    sellingPrice: row.sellingPrice.trim(),
    moq: row.moq ? parseInt(row.moq, 10) : undefined,
    stockQuantity: row.stockQuantity ? parseInt(row.stockQuantity, 10) : 0,
    lowStockThreshold: row.lowStockThreshold ? parseInt(row.lowStockThreshold, 10) : 0,
    stockStatus: 'In Stock',
  };

  if (!Number.isFinite(combo.stockQuantity)) combo.stockQuantity = 0;
  if (!Number.isFinite(combo.lowStockThreshold)) combo.lowStockThreshold = 0;
  if (row.moq && !Number.isFinite(combo.moq as number)) combo.moq = undefined;

  const normalizedStatus = normalizeImportedStockStatus(row.stockStatus);
  if (normalizedStatus) {
    combo.stockStatus = normalizedStatus;
  } else {
    combo.stockStatus = getVariantStockStatus(combo.stockQuantity, combo.lowStockThreshold);
  }

  variantsList.forEach((variant, variantIndex) => {
    const value = getImportRowVariantValue(row, variant, variantIndex);
    combo[`variant_${variant.id}`] = value || 'None';
  });

  combo.variantName = variantsList
    .map((variant, variantIndex) => {
      const value = getImportRowVariantValue(row, variant, variantIndex) || 'None';
      return `${variant.variantType || `Var ${variantIndex + 1}`}: ${value}`;
    })
    .join(' | ');

  return combo;
}

export function syncVariantDefinitionsWithCombinations(
  variantsList: CatalogVariant[],
  combos: Combination[],
  importRows: VariationImportRow[] = [],
): CatalogVariant[] {
  return variantsList.map((variant, variantIndex) => {
    const seen = new Map<string, { id: string; name: string }>();

    variant.options.forEach((opt) => {
      const name = String(opt.name ?? '').trim();
      if (!name) return;
      seen.set(normalizeImportMatchValue(name), { id: opt.id, name });
    });

    const addValue = (raw: string) => {
      const name = String(raw ?? '').trim();
      if (!name || normalizeImportMatchValue(name) === 'none') return;
      const key = normalizeImportMatchValue(name);
      if (!seen.has(key)) {
        seen.set(key, { id: `option-${variant.id}-${seen.size}`, name });
      }
    };

    importRows.forEach((row) => addValue(getImportRowVariantValue(row, variant, variantIndex)));
    combos.forEach((combo) => addValue(String(combo[`variant_${variant.id}`] ?? '')));

    return {
      ...variant,
      options: Array.from(seen.values()),
    };
  });
}

export function namedOptionCount(variant: CatalogVariant): number {
  return variant.options.filter((opt) => String(opt.name ?? '').trim()).length;
}

/** Axis excluded from item identity when copying SKUs across its options. Uses variant id, not list order. */
export function findSharedSkuAxisVariantId(variantsList: CatalogVariant[]): string | null {
  if (variantsList.length <= 1) return null;

  let best: CatalogVariant | null = null;
  let bestCount = Number.POSITIVE_INFINITY;
  for (const variant of variantsList) {
    const count = namedOptionCount(variant);
    if (count === 0) continue;
    if (
      !best ||
      count < bestCount ||
      (count === bestCount && variant.id.localeCompare(best.id) < 0)
    ) {
      best = variant;
      bestCount = count;
    }
  }
  return best?.id ?? null;
}

export function cartesianProduct(arrays: string[][]): string[][] {
  if (arrays.length === 0) return [];
  if (arrays.length === 1) return arrays[0].map((item) => [item]);
  const [first, ...rest] = arrays;
  const restProduct = cartesianProduct(rest);
  return first.flatMap((item) => restProduct.map((combination) => [item, ...combination]));
}

export function draftCombinationAxisKey(
  combo: Combination,
  validVariants: CatalogVariant[],
): string {
  return validVariants
    .map((variant) => {
      const raw = combo[`variant_${variant.id}`];
      const name = typeof raw === 'string' && raw.trim() !== '' ? raw.trim() : 'None';
      return `${variant.id}:${name}`;
    })
    .join('|');
}

export function rebuiltMatrixKeys(validVariants: CatalogVariant[]): Set<string> {
  const optionArrays = validVariants.map((v) =>
    v.options.filter((opt) => opt.name).map((opt) => opt.name),
  );
  const variantIds = validVariants.map((v) => v.id);
  return new Set(
    cartesianProduct(optionArrays).map((values) =>
      variantIds.map((id, idx) => `${id}:${values[idx]}`).join('|'),
    ),
  );
}

/**
 * True when rebuilding would merge distinct drafts (duplicate remaining-axis keys) or
 * drop populated rows that cannot fit onto the rebuilt matrix (e.g. default draft → new axis).
 */
export function shouldPreserveDraftCombinations(
  validVariants: CatalogVariant[],
  existingCombinations: Combination[],
): boolean {
  if (validVariants.length === 0) return false;
  const seen = new Set<string>();
  for (const combo of existingCombinations) {
    if (!combinationHasDraftData(combo)) continue;
    const key = draftCombinationAxisKey(combo, validVariants);
    if (seen.has(key)) return true;
    seen.add(key);
  }

  const matrixKeys = rebuiltMatrixKeys(validVariants);
  let matchedKeyCount = 0;
  let orphanDraftCount = 0;
  const matchedKeys = new Set<string>();
  for (const combo of existingCombinations) {
    if (!combinationHasDraftData(combo)) continue;
    const key = draftCombinationAxisKey(combo, validVariants);
    if (matrixKeys.has(key)) {
      if (!matchedKeys.has(key)) {
        matchedKeys.add(key);
        matchedKeyCount += 1;
      }
    } else {
      orphanDraftCount += 1;
    }
  }
  const freeSlots = matrixKeys.size - matchedKeyCount;
  return orphanDraftCount > freeSlots;
}

/** True when every current option combination is present in the matrix (by axis key). */
export function variationMatrixCoversOptions(
  validVariants: CatalogVariant[],
  matrix: Combination[],
): boolean {
  const expected = rebuiltMatrixKeys(validVariants);
  if (expected.size === 0 || matrix.length !== expected.size) return false;
  const actual = new Set(matrix.map((combo) => draftCombinationAxisKey(combo, validVariants)));
  for (const key of expected) {
    if (!actual.has(key)) return false;
  }
  return true;
}

export function rebuildCombinationsFromVariants(
  validVariants: CatalogVariant[],
  existingCombinations: Combination[],
): Combination[] {
  if (validVariants.length === 0) {
    return [
      {
        id: 'combination-1',
        sku: '',
        purchasePrice: '',
        sellingPrice: '',
        moq: undefined,
        stockQuantity: 0,
        lowStockThreshold: 0,
        stockStatus: 'In Stock' as const,
      },
    ];
  }

  const optionArrays = validVariants.map((v) =>
    v.options.filter((opt) => opt.name).map((opt) => opt.name),
  );
  const combinationsGenerated = cartesianProduct(optionArrays);

  const keyFor = (valsByVariantId: Record<string, string>, variantIds: string[]) =>
    variantIds.map((id) => `${id}:${valsByVariantId[id] ?? 'None'}`).join('|');

  const sharedSkuAxisVariantId = findSharedSkuAxisVariantId(validVariants);

  // Item identity is every variant except the shared-SKU axis (stable id, not display index).
  const itemIdentityKey = (valuesByVariantId: Record<string, string>) => {
    if (!sharedSkuAxisVariantId || validVariants.length <= 1) return '';
    return validVariants
      .filter((variant) => variant.id !== sharedSkuAxisVariantId)
      .slice()
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((variant) => normalizeImportMatchValue(valuesByVariantId[variant.id] ?? ''))
      .join('|');
  };

  const variantIdsInOrder = validVariants.map((v) => v.id);
  const generatedKeys = new Set(
    combinationsGenerated.map((combinationValues) => {
      const valsByVariantId: Record<string, string> = {};
      validVariants.forEach((variant, idx) => {
        valsByVariantId[variant.id] = combinationValues[idx];
      });
      return keyFor(valsByVariantId, variantIdsInOrder);
    }),
  );

  const existingFullKeyMap = new Map<string, Combination>();
  const orphanDrafts: Combination[] = [];
  const skuByItemIdentity = new Map<string, string>();

  existingCombinations.forEach((combo) => {
    const valsByVariantId: Record<string, string> = {};
    validVariants.forEach((variant) => {
      const v = combo[`variant_${variant.id}`];
      const name = typeof v === 'string' && v.trim() !== '' ? v : '';
      if (name) valsByVariantId[variant.id] = name;
    });

    const fullKey = keyFor(valsByVariantId, variantIdsInOrder);
    if (generatedKeys.has(fullKey)) {
      existingFullKeyMap.set(fullKey, combo);
      const sku = String(combo.sku ?? '').trim();
      const identity = itemIdentityKey(valsByVariantId);
      if (sku && identity && !skuByItemIdentity.has(identity)) {
        skuByItemIdentity.set(identity, sku);
      }
      return;
    }

    // Default/populated rows that do not yet sit on a matrix key (e.g. no axis values yet).
    if (combinationHasDraftData(combo)) {
      orphanDrafts.push(combo);
    }
  });

  const makeStableId = (fullKey: string) => `combination-${fullKey}`;
  let orphanIdx = 0;

  return combinationsGenerated.map((combinationValues) => {
    const valsByVariantId: Record<string, string> = {};
    validVariants.forEach((variant, idx) => {
      valsByVariantId[variant.id] = combinationValues[idx];
    });

    const fullKey = keyFor(valsByVariantId, variantIdsInOrder);
    const stableId = makeStableId(fullKey);

    let combinationData = existingFullKeyMap.get(fullKey);
    // Map the default draft (SKU/prices/stock) onto the newly defined axis combination(s).
    if (!combinationData && orphanIdx < orphanDrafts.length) {
      combinationData = orphanDrafts[orphanIdx];
      orphanIdx += 1;
    }
    const canCopyFromExisting = Boolean(combinationData);
    const siblingSku = skuByItemIdentity.get(itemIdentityKey(valsByVariantId)) ?? '';
    const sku = String(combinationData?.sku ?? '').trim() || siblingSku;

    const base: Combination = canCopyFromExisting
      ? {
          id: stableId,
          sku,
          purchasePrice: combinationData!.purchasePrice ?? '',
          sellingPrice: combinationData!.sellingPrice ?? '',
          moq: combinationData!.moq,
          stockQuantity: combinationData!.stockQuantity ?? 0,
          lowStockThreshold: combinationData!.lowStockThreshold ?? 0,
          stockStatus: (combinationData!.stockStatus ?? 'In Stock') as Combination['stockStatus'],
          variantName: '',
        }
      : {
          id: stableId,
          sku,
          purchasePrice: '',
          sellingPrice: '',
          moq: undefined,
          stockQuantity: 0,
          lowStockThreshold: 0,
          stockStatus: 'In Stock' as const,
          variantName: '',
        };

    validVariants.forEach((variant, idx) => {
      base[`variant_${variant.id}`] = combinationValues[idx];
    });

    base.variantName = validVariants
      .map((v, idx) => `${v.variantType}: ${combinationValues[idx]}`)
      .join(' | ');

    return base;
  });
}

export function hasValidVariants(variants: CatalogVariant[]): boolean {
  return variants.some((v) => v.variantType?.trim() && v.options.some((opt) => opt.name?.trim()));
}

export function readVariantAttributeValue(
  attrs: Record<string, unknown>,
  variantType: string,
): string | undefined {
  const target = String(variantType ?? '').trim().toLowerCase();
  for (const [key, value] of Object.entries(attrs)) {
    if (String(key).trim().toLowerCase() !== target) continue;
    if (value !== undefined && value !== null) return String(value);
  }
  return undefined;
}

export function buildVariantsFromImport(
  variantLevels: Array<{ columnId: string; typeName: string }>,
  rows: VariationImportRow[],
): CatalogVariant[] {
  return variantLevels
    .map((level, levelIndex) => {
      const uniqueValues: string[] = [];
      const seen = new Set<string>();
      for (const row of rows) {
        const val = (
          row.variantValues[level.columnId] ??
          row.variantValuesByPosition[levelIndex] ??
          ''
        ).trim();
        if (val && !seen.has(val.toLowerCase())) {
          seen.add(val.toLowerCase());
          uniqueValues.push(val);
        }
      }
      const slug = level.typeName.replace(/[^\w\-]+/g, '-').toLowerCase() || `level-${levelIndex + 1}`;
      return {
        id: `variant-${levelIndex + 1}-${slug}`,
        variantType: level.typeName,
        moq: undefined,
        options: uniqueValues.map((name, optIndex) => ({
          id: `option-${levelIndex}-${optIndex}`,
          name,
        })),
      };
    })
    .filter((v) => v.variantType && v.options.length > 0);
}

export function collapseImportStatus(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizeImportedStockStatus(value: string): Combination['stockStatus'] | undefined {
  const normalized = collapseImportStatus(value);
  if (!normalized) return undefined;

  const tokens = normalized.split(' ');
  const isExact = (...phrases: string[]) => phrases.includes(normalized);
  const hasToken = (...words: string[]) => words.some((w) => tokens.includes(w));

  if (
    isExact('out of stock', 'sold out', 'habis', 'habis stok', 'oos', 'out') ||
    hasToken('habis') ||
    (hasToken('out') && (hasToken('stock') || hasToken('of')))
  ) {
    return 'Out of Stock';
  }

  if (
    isExact('low stock', 'stok menipis', 'menipis', 'low') ||
    hasToken('rendah', 'menipis') ||
    (hasToken('low') && hasToken('stock'))
  ) {
    return 'Low Stock';
  }

  if (
    isExact('in stock', 'instock', 'tersedia', 'available', 'in') ||
    hasToken('tersedia', 'available') ||
    (hasToken('in') && hasToken('stock'))
  ) {
    return 'In Stock';
  }

  return undefined;
}

export interface ProductCatalogProps {
  mode: 'add' | 'view' | 'edit';
  product?: Product;
  onSave?: (data: Product) => void;
  onCancel?: () => void;
}

/** Relative weights for the compact full-width first view (not pixel sizes). */
export const VARIATION_COL_WEIGHTS = {
  variant: 9,
  sku: 14,
  sellingPrice: 13,
  purchasePrice: 13,
  moq: 7,
  stock: 15,
  lowThreshold: 9,
  status: 9,
  actions: 7,
} as const;

export const VARIATION_COL_MIN = 64;
export const VARIATION_ROW_MIN = 40;
export const VARIATION_ROW_DEFAULT = 44;
export const STOCK_UNIT_OPTIONS = ['Pieces', 'Boxes', 'Cartons'] as const;
export type StockUnitValue = (typeof STOCK_UNIT_OPTIONS)[number];

export const normalizeStockUnitValue = (raw?: string | null): StockUnitValue => {
  const value = String(raw || '').trim();
  return (STOCK_UNIT_OPTIONS as readonly string[]).includes(value)
    ? (value as StockUnitValue)
    : 'Pieces';
};

export const VARIATION_COL_WIDTHS_KEY_PREFIX = 'productCatalog.variationColWidths:';

export function variationColWidthsStorageKey(productKey: string) {
  return `${VARIATION_COL_WIDTHS_KEY_PREFIX}${productKey}`;
}

export function readVariationColWidths(productKey: string): Record<string, number> {
  if (typeof window === 'undefined' || !productKey) return {};
  try {
    const raw = window.localStorage.getItem(variationColWidthsStorageKey(productKey));
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const next: Record<string, number> = {};
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof value === 'number' && Number.isFinite(value) && value >= VARIATION_COL_MIN) {
        next[key] = Math.round(value);
      }
    }
    return next;
  } catch {
    return {};
  }
}

export function writeVariationColWidths(productKey: string, widths: Record<string, number>) {
  if (typeof window === 'undefined' || !productKey) return;
  try {
    const storageKey = variationColWidthsStorageKey(productKey);
    if (Object.keys(widths).length === 0) {
      window.localStorage.removeItem(storageKey);
      return;
    }
    window.localStorage.setItem(storageKey, JSON.stringify(widths));
  } catch {
    // Ignore quota / private-mode failures.
  }
}

export function startSizeDrag(args: {
  axis: 'x' | 'y';
  startClient: number;
  startSize: number;
  min: number;
  applySize: (next: number) => void;
}): () => void {
  const { axis, startClient, startSize, min, applySize } = args;
  const onMove = (event: PointerEvent) => {
    const delta = axis === 'x' ? event.clientX - startClient : event.clientY - startClient;
    applySize(Math.max(min, startSize + delta));
  };
  const dispose = () => {
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', dispose);
    window.removeEventListener('pointercancel', dispose);
  };
  document.body.style.cursor = axis === 'x' ? 'col-resize' : 'row-resize';
  document.body.style.userSelect = 'none';
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', dispose);
  window.addEventListener('pointercancel', dispose);
  return dispose;
}

