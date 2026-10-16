'use client';
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  DollarSign, 
  Tag, 
  Upload, 
  Plus, 
  X, 
  Save,
  CheckCircle,
  Eye,
  Edit,
  Info,
  ArrowLeft,
  Package,
  Gift,
  RefreshCw,
  ChevronUp,
  ChevronDown,
  Download
} from "lucide-react";
import * as XLSX from 'xlsx';
import VariationListImport, {
  type VariationImportPayload,
  type VariationImportRow,
  type VariationImportResult,
} from '@/components/productscatalogs/VariationListImport';
import { useRouter } from "next/navigation";
import { useUserStore } from "@/store/userStore";
import { Product, ProductFormData } from "@/types/product";
import { getDefaultCurrency, getCurrencySymbol, formatCurrencyAmount } from '@/utils/currencyUtils';
import { formatNumberByCurrency, parseNumberByCurrency, getPricePlaceholder } from '@/config/currencyConfig';
import { getAvailableCategories, getCategoryByValue, getCategoryColor, getCategoryIconComponent, getCategoryImageSrc } from '@/utils/categoryUtils';
import { fetchGraphQL } from '@/lib/graphqlClient';
import { uploadToCloudinaryDirect } from '@/utils/cloudinaryDirect';
import { useProductsTranslations } from '@/hooks/useProductsTranslations';
import { getProductStockStatus, getVariantStockStatus } from '@/utils/stockUtils';
import { CATALOG_COMPLETION_OPTIONS, getProductCompletion } from '@/utils/productCompletion';

const MARKETPLACE_STATUS_MUTATION = `
  mutation PublishMarketplaceProduct($userId: Int!, $productId: String!, $action: String!) {
    publishMarketplaceProduct(userId: $userId, productId: $productId, action: $action) {
      success
      message
    }
  }
`;

function CategoryTypeGlyph({ value, color }: { value: string; color?: string }) {
  const imageSrc = getCategoryImageSrc(value);
  if (imageSrc) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={imageSrc} alt="" className="h-5 w-5 object-contain" />
    );
  }
  const IconComponent = getCategoryIconComponent(value);
  return (
    <span style={{ color }}>
      <IconComponent className="h-4 w-4" />
    </span>
  );
}

// Helper function for deep equality check (more efficient than JSON.stringify)
const isFormDataEqual = (a: ProductFormData, b: ProductFormData): boolean => {
  return (
    a.id === b.id &&
    a.productId === b.productId &&
    a.sku === b.sku &&
    a.name === b.name &&
    a.description === b.description &&
    a.productType === b.productType &&
    a.brand === b.brand &&
    a.supplier === b.supplier &&
    a.status === b.status &&
    a.productCategory === b.productCategory &&
    a.catalogName === b.catalogName &&
    JSON.stringify(a.images) === JSON.stringify(b.images) &&
    a.halalCertified === b.halalCertified &&
    a.bpomApproved === b.bpomApproved &&
    a.originalProduct === b.originalProduct &&
    a.returnPolicyDays === b.returnPolicyDays
  );
};
 

interface Combination {
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

type CatalogVariant = {
  id: string;
  variantType: string;
  moq?: number;
  options: Array<{ id: string; name: string }>;
};

function isFiniteNonNegativeNumber(value: unknown): boolean {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) && n >= 0;
}

/**
 * Prices must be parseable, finite, and greater than zero (empty / "abc" / 0 / negatives rejected),
 * matching getProductCompletion and the publishMarketplaceProduct mutation.
 */
function isCompleteCombination(combo: Combination, currencyCode?: string): boolean {
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

function normalizeImportMatchValue(value: unknown): string {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function getImportRowVariantValue(
  row: VariationImportRow,
  variant: CatalogVariant,
  variantIndex: number,
): string {
  const byId = String(row.variantValues[variant.id] ?? '').trim();
  if (byId) return byId;
  return String(row.variantValuesByPosition?.[variantIndex] ?? '').trim();
}

function buildCombinationFromImportRow(
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

function syncVariantDefinitionsWithCombinations(
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

function namedOptionCount(variant: CatalogVariant): number {
  return variant.options.filter((opt) => String(opt.name ?? '').trim()).length;
}

/** Axis excluded from item identity when copying SKUs across its options. Uses variant id, not list order. */
function findSharedSkuAxisVariantId(variantsList: CatalogVariant[]): string | null {
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

function cartesianProduct(arrays: string[][]): string[][] {
  if (arrays.length === 0) return [];
  if (arrays.length === 1) return arrays[0].map((item) => [item]);
  const [first, ...rest] = arrays;
  const restProduct = cartesianProduct(rest);
  return first.flatMap((item) => restProduct.map((combination) => [item, ...combination]));
}

function rebuildCombinationsFromVariants(
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

  const existingFullKeyMap = new Map<string, Combination>();
  const skuByItemIdentity = new Map<string, string>();

  existingCombinations.forEach((combo) => {
    const valsByVariantId: Record<string, string> = {};
    validVariants.forEach((variant) => {
      const v = combo[`variant_${variant.id}`];
      const name = typeof v === 'string' && v.trim() !== '' ? v : '';
      if (name) valsByVariantId[variant.id] = name;
    });

    existingFullKeyMap.set(keyFor(valsByVariantId, variantIdsInOrder), combo);

    const sku = String(combo.sku ?? '').trim();
    const identity = itemIdentityKey(valsByVariantId);
    if (sku && identity && !skuByItemIdentity.has(identity)) {
      skuByItemIdentity.set(identity, sku);
    }
  });

  const makeStableId = (fullKey: string) => `combination-${fullKey}`;

  return combinationsGenerated.map((combinationValues) => {
    const valsByVariantId: Record<string, string> = {};
    validVariants.forEach((variant, idx) => {
      valsByVariantId[variant.id] = combinationValues[idx];
    });

    const fullKey = keyFor(valsByVariantId, variantIdsInOrder);
    const stableId = makeStableId(fullKey);

    const combinationData = existingFullKeyMap.get(fullKey);
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

function hasValidVariants(variants: CatalogVariant[]): boolean {
  return variants.some((v) => v.variantType?.trim() && v.options.some((opt) => opt.name?.trim()));
}

function readVariantAttributeValue(
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

function buildVariantsFromImport(
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

function collapseImportStatus(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeImportedStockStatus(value: string): Combination['stockStatus'] | undefined {
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

interface ProductCatalogProps {
  mode: 'add' | 'view' | 'edit';
  product?: Product;
  onSave?: (data: Product) => void;
  onCancel?: () => void;
}

export default function ProductCatalog({ 
  mode = 'add', 
  product, 
  onSave, 
  onCancel 
}: ProductCatalogProps) {
  const router = useRouter();
  const user = useUserStore(state => state.user);
  const { tCatalog, tShared, tMarketplace, translateStockStatus, translateCategory, translateStatus, translateFieldName } = useProductsTranslations();
  const userCurrency = user?.currency || getDefaultCurrency();
  const currencySymbol = getCurrencySymbol(userCurrency);
  const [formData, setFormData] = useState<ProductFormData>({
    id: product?.id,
    productId: product?.productId || '',
    sku: product?.sku || '',
    name: product?.name || '',
    description: product?.description || '',
    productType: product?.productType || '',
    brand: product?.brand || '',
    supplier: product?.supplier || '',
    status: product?.status || 'Draft',
    productCategory: product?.productCategory || '',
    catalogName: product?.catalogName || '',
    images: product?.images || [],
    halalCertified: (product as { halalCertified?: boolean })?.halalCertified ?? false,
    bpomApproved: (product as { bpomApproved?: boolean })?.bpomApproved ?? false,
    originalProduct: (product as { originalProduct?: boolean })?.originalProduct ?? true,
    returnPolicyDays: (product as { returnPolicyDays?: number })?.returnPolicyDays ?? 7
  });

  // Product-level stock is computed from variants (no separate state needed)

  // Simplified variants state - just type and option names
  const [variants, setVariants] = useState<Array<{
    id: string;
    variantType: string;
    moq?: number;
    options: Array<{
    id: string;
      name: string;
    }>;
  }>>([]);

  // Draft variants for typing (prevents lag + accidental table rebuilds while editing labels)
  const [variantDrafts, setVariantDrafts] = useState<typeof variants>([]);

  // Final combinations table (manual entry)
  const [combinations, setCombinations] = useState<Combination[]>([]);
  const combinationsRef = useRef<Combination[]>([]);
  const skipBeforeUnloadRef = useRef(false);
  const [variationRefreshTick, setVariationRefreshTick] = useState(0);
  const [showVariationImport, setShowVariationImport] = useState(false);

  // Initialize variants from product data
  useEffect(() => {
    if (product?.variants && product.variants.length > 0) {
      // New structure: load from variants (ProductVariant model) with proper ordering
      const loadedVariants = product.variants
        .sort((a, b) => (a.position || 0) - (b.position || 0)) // Sort by position
        .map((def, index) => ({
          id: `variant-${def.variantType}`,
          variantType: def.variantType,
          moq: undefined,
          options: def.options.map((option: string, optIndex: number) => ({
            id: `option-${index}-${optIndex}`,
            name: option
          }))
        }));
      setVariants(loadedVariants);
    } else {
      // Create default variant
      setVariants([{
        id: 'variant-1',
        variantType: '',
        moq: undefined,
        options: [{
          id: 'option-1',
          name: ''
        }]
      }]);
    }
  }, [product]);

  // Keep drafts in sync with committed variants (but don't drive the table from drafts)
  useEffect(() => {
    setVariantDrafts(JSON.parse(JSON.stringify(variants)));
  }, [variants]);

  // Initialize combinations from product data (map attributes -> current variant columns)
  useEffect(() => {
    if (product?.variantOptions && product.variantOptions.length > 0) {
      // Use existing variants if available, otherwise infer from variantOptions
      let inferredVariants;
      if (product.variants && product.variants.length > 0) {
        // Use the properly ordered variants from the first useEffect
        inferredVariants = product.variants
          .sort((a, b) => (a.position || 0) - (b.position || 0))
          .map((def, index) => ({
            id: `variant-${def.variantType}`,
            variantType: def.variantType,
            moq: undefined,
            options: def.options.map((option: string, optIndex: number) => ({ id: `option-${index}-${optIndex}`, name: option }))
          }));
      } else {
        // Fallback: infer variant definitions from the saved data
        const attributeKeyToValues = new Map<string, Set<string>>();
        for (const option of product.variantOptions) {
          const attrs = option.attributes && typeof option.attributes === 'object' ? option.attributes as Record<string, unknown> : undefined;
          if (!attrs) continue;
          for (const [key, value] of Object.entries(attrs)) {
            if (!attributeKeyToValues.has(key)) attributeKeyToValues.set(key, new Set<string>());
            if (value !== undefined && value !== null) attributeKeyToValues.get(key)!.add(String(value));
          }
        }
        
        // Create variant definitions from the data
        inferredVariants = Array.from(attributeKeyToValues.entries()).map(([key, values], index) => ({
          id: `variant-${key}`,
          variantType: key,
          moq: undefined,
          options: Array.from(values).map((val, optIndex) => ({ id: `option-${index}-${optIndex}`, name: val }))
        }));
      }
      
      // Load combinations — catalog sellingPrice is the source of truth (offers do not rewrite it)
      const loadedCombinations = product.variantOptions.map(option => {
        const base: Combination = {
          id: `combination-${option.id}`,
          variantName: option.variantName,
          sku: option.sku || '',
          purchasePrice: option.purchasePrice || '',
          sellingPrice: option.sellingPrice || '',
          moq: option.moq,
          stockQuantity: option.stockQuantity || 0,
          lowStockThreshold: option.lowStockThreshold || 0,
          stockStatus: getVariantStockStatus(option.stockQuantity || 0, option.lowStockThreshold || 0),
        };
        
        const attrs = option.attributes && typeof option.attributes === 'object' ? option.attributes as Record<string, unknown> : undefined;
        if (attrs) {
          for (const variant of inferredVariants) {
            const value = readVariantAttributeValue(attrs, variant.variantType);
            base[`variant_${variant.id}`] = value !== undefined ? value : 'None';
          }
        }
        
        return base;
      });
      
      setVariants(inferredVariants.length > 0 ? inferredVariants : [{
        id: 'variant-1',
        variantType: '',
        moq: undefined,
        options: [{ id: 'option-1', name: '' }]
      }]);
      setCombinations(loadedCombinations);
    } else {
      // Create default combination
      setCombinations([{
        id: 'combination-1',
        sku: '',
        purchasePrice: '',
        sellingPrice: '',
        moq: undefined,
        stockQuantity: 0,
        lowStockThreshold: 0,
        stockStatus: 'In Stock' as const
      }]);
    }
  }, [product]);

  const [isDragOver, setIsDragOver] = useState(false);
  const [uploadingImages, setUploadingImages] = useState(false);
  const [saving, setSaving] = useState(false);
  const [originalFormData, setOriginalFormData] = useState<ProductFormData | null>(null);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [variantGuardModal, setVariantGuardModal] = useState<{
    title: string;
    intro?: string;
    items?: Array<{
      variantName: string;
      orderItemCount: number;
      orderIds?: string[];
    }>;
    policy?: string;
    footer?: string;
    message?: string;
    action?: { kind: 'create_option'; variantId: string; initialName: string } | null;
  } | null>(null);

  const VARIANT_OPTION_USAGE_QUERY = `
    query VariantOptionUsage($userId: Int!, $productId: String!, $variantNames: [String!], $variantOptionIds: [Int!]) {
      variantOptionUsage(
        userId: $userId
        productId: $productId
        variantNames: $variantNames
        variantOptionIds: $variantOptionIds
      ) {
        variantName
        orderItemCount
        orderIds
      }
    }
  `;

  const getAffectedVariantOptionIds = (params: {
    variantType: string;
    optionName?: string;
  }): number[] => {
    const { variantType, optionName } = params;
    const opts = product?.variantOptions;
    if (!Array.isArray(opts) || opts.length === 0) return [];

    const type = String(variantType || '').trim();
    const optName = optionName != null ? String(optionName).trim() : '';
    if (!type) return [];

    return opts
      .filter((vo) => {
        const attrs =
          vo.attributes && typeof vo.attributes === 'object' ? (vo.attributes as Record<string, unknown>) : null;
        if (attrs && Object.prototype.hasOwnProperty.call(attrs, type)) {
          if (!optName) return true; // variant type operation (rename/delete layer)
          return String(attrs[type] ?? '') === optName;
        }
        // Fallback for older persisted data without attributes.
        const name = vo.variantName ? String(vo.variantName) : '';
        return optName ? name.includes(`${type}: ${optName}`) : name.includes(`${type}: `);
      })
      .map((vo) => Number(vo.id))
      .filter((id) => Number.isFinite(id));
  };
  
  // Prefer local form status so publish/unpublish can switch UI without a full reload.
  // Published products are view-only; Draft products are editable.
  const currentProductStatus = useMemo(() => {
    return formData.status || product?.status || 'Draft';
  }, [formData.status, product?.status]);

  const currentMode = useMemo(() => {
    // Stay in add until the product is persisted or published from this session.
    if (mode === 'add' && !product && !formData.id && currentProductStatus !== 'Published') return 'add';
    if (currentProductStatus === 'Published') return 'view';
    if (currentProductStatus === 'Draft') return 'edit';
    return mode;
  }, [mode, product, currentProductStatus, formData.id]);

  // Compute hasUnsavedChanges during render (not in useEffect) - follows React best practices
  const hasUnsavedChanges = useMemo(() => {
    if (mode !== 'edit' || !originalFormData) return false;
    return JSON.stringify(formData) !== JSON.stringify(originalFormData);
  }, [formData, originalFormData, mode]);

  // Track previous product ID to detect when product actually changes
  const prevProductIdRef = useRef<number | undefined>(undefined);

  // Track previous product status to detect status changes
  const prevProductStatusRef = useRef<string | undefined>(product?.status);

  // Effect to synchronize formData when product changes (legitimate use case)
  useEffect(() => {
    const currentProductId = product?.id;
    const currentProductStatus = product?.status;
    const productChanged = product && currentProductId !== prevProductIdRef.current;
    const statusChanged = currentProductStatus !== prevProductStatusRef.current;
    
    if (product && (productChanged || statusChanged)) {
      // Update refs to track current state
      if (productChanged) {
        prevProductIdRef.current = currentProductId;
      }
      if (statusChanged) {
        prevProductStatusRef.current = currentProductStatus;
      }
      
      // Update formData with fresh product data when product or status changes
      const freshFormData: ProductFormData = {
        id: product.id,
        productId: product.productId || '',
        sku: product.sku || '',
        name: product.name || '',
        description: product.description || '',
        productType: product.productType || '',
        brand: product.brand || '',
        supplier: product.supplier || '',
        status: product.status || 'Draft',
        productCategory: product.productCategory || '',
        catalogName: product.catalogName || '',
        images: product.images || [],
        halalCertified: (product as { halalCertified?: boolean })?.halalCertified ?? false,
        bpomApproved: (product as { bpomApproved?: boolean })?.bpomApproved ?? false,
        originalProduct: (product as { originalProduct?: boolean })?.originalProduct ?? true,
        returnPolicyDays: (product as { returnPolicyDays?: number })?.returnPolicyDays ?? 7,
      };
      
      // Only update form data if it's actually different (using efficient comparison)
      setFormData(prev => {
        return isFormDataEqual(prev, freshFormData) ? prev : freshFormData;
      });
      
      setOriginalFormData({ ...freshFormData });
      // hasUnsavedChanges is now computed from formData and originalFormData, so no need to set it
    } else if (!product) {
      prevProductIdRef.current = undefined;
      prevProductStatusRef.current = undefined;
    }
  }, [product, product?.status]);

  // Category dropdown states
  const [showGeneralCategoryDropdown, setShowGeneralCategoryDropdown] = useState(false);
  const [showCatalogCategoryDropdown, setShowCatalogCategoryDropdown] = useState(false);
  
  // Refs for click outside detection
  const generalCategoryRef = useRef<HTMLDivElement>(null);

  // Store original form data on mount for edit mode
  useEffect(() => {
    if (mode === 'edit' && product) {
      const initial = {
        id: product?.id,
        productId: product?.productId || '',
        sku: product?.sku || '',
        name: product?.name || '',
        description: product?.description || '',
        productType: product?.productType || '',
        brand: product?.brand || '',
        supplier: product?.supplier || '',
        status: product?.status || 'Draft',
        productCategory: product?.productCategory || '',
        catalogName: product?.catalogName || '',
        images: product?.images || [],
        halalCertified: (product as { halalCertified?: boolean })?.halalCertified ?? false,
        bpomApproved: (product as { bpomApproved?: boolean })?.bpomApproved ?? false,
        originalProduct: (product as { originalProduct?: boolean })?.originalProduct ?? true,
        returnPolicyDays: (product as { returnPolicyDays?: number })?.returnPolicyDays ?? 7,
      };
      setOriginalFormData(JSON.parse(JSON.stringify(initial)));
    }
  }, [mode, product]);

  // Warn before leaving with unsaved changes
  useEffect(() => {
    if (mode !== 'edit') return;
    
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (skipBeforeUnloadRef.current || !hasUnsavedChanges) return;
      e.preventDefault();
      e.returnValue = '';
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hasUnsavedChanges, mode]);

  const showSuccessNotice = (durationMs = 1200) => {
    setShowSuccessModal(true);
    window.setTimeout(() => setShowSuccessModal(false), durationMs);
  };
  const catalogCategoryRef = useRef<HTMLDivElement>(null);

  // Generate LKP product ID format: LKP-8 random numbers
  const generateLKPProductId = () => {
    const randomNumbers = Math.floor(Math.random() * 90000000) + 10000000; // 8 digits
    return `LKP-${randomNumbers}`;
  };

  // Set generated product ID on component mount for add mode
  useEffect(() => {
    if (mode === 'add' && !formData.productId) {
      setFormData(prev => ({
        ...prev,
        productId: generateLKPProductId()
      }));
    }
  }, [mode, product]);

  // Click outside to close dropdowns
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (generalCategoryRef.current && !generalCategoryRef.current.contains(event.target as Node)) {
        setShowGeneralCategoryDropdown(false);
      }
      if (catalogCategoryRef.current && !catalogCategoryRef.current.contains(event.target as Node)) {
        setShowCatalogCategoryDropdown(false);
      }
      // no-op for catalog type (now plain input)
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const statusOptions = ['Draft', 'Published'];

  // Category helper functions
  const availableCategories = getAvailableCategories();

  const handleCategorySelect = (categoryValue: string, field: 'productType') => {
    handleInputChange(field, categoryValue);
    setShowGeneralCategoryDropdown(false);
    setShowCatalogCategoryDropdown(false);
  };

  // catalog type is a plain text input now

  const getSelectedCategory = (categoryValue: string) => {
    return getCategoryByValue(categoryValue);
  };
  // Helper function to handle price input with better UX

  const handleInputChange = (field: keyof ProductFormData, value: string | number | string[] | boolean) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  // Variant management functions
  const addVariant = () => {
    const variantId = `variant-${Date.now()}`;
    const newVariant = {
      id: variantId,
      variantType: '',
      moq: undefined,
      options: [{
        id: `${variantId}-option-1`,
        name: ''
      }]
    };
    setVariants(prev => [...prev, newVariant]);
  };

  const removeVariant = (variantId: string) => {
    if (variants.length > 1) {
      // For existing products, only block if this deletion would affect variants tied to orders.
      if (currentMode === 'edit' && user?.id && formData.productId) {
        const targetVariant = variants.find((v) => v.id === variantId);
        const targetType = targetVariant?.variantType ? String(targetVariant.variantType) : '';

        // If the variant type is empty (often a newly-added layer not yet configured),
        // deleting it cannot correspond to any persisted VariantOption, so don't block.
        const affectedVariantOptionIds = targetType ? getAffectedVariantOptionIds({ variantType: targetType }) : [];
        if (affectedVariantOptionIds.length > 0) {
          fetchGraphQL<{ variantOptionUsage: Array<{ variantName: string; orderItemCount: number; orderIds: string[] }> }>(
            VARIANT_OPTION_USAGE_QUERY,
            {
              userId: user.id,
              productId: String(formData.productId),
              variantNames: null,
              variantOptionIds: affectedVariantOptionIds,
            },
          )
            .then((res) => {
              const tied = (res?.variantOptionUsage || []).filter((u) => (u.orderItemCount || 0) > 0);
              if (tied.length > 0) {
                setVariantGuardModal({
                  title: tCatalog('variantGuard.cannotDeleteTitle'),
                  intro: tCatalog('variantGuard.cannotDeleteIntro'),
                  items: tied.slice(0, 8).map((u) => ({
                    variantName: u.variantName,
                    orderItemCount: u.orderItemCount,
                    orderIds: u.orderIds ?? [],
                  })),
                  policy: tCatalog('variantGuard.policy'),
                  footer:
                    (tied.length > 8 ? tCatalog('variantGuard.footerMore', { count: tied.length - 8 }) : '') +
                    tCatalog('variantGuard.footerBlocked'),
                  action: null,
                });
                return;
              }
              setVariants((prev) => prev.filter((variant) => variant.id !== variantId));
            })
            .catch((err) => {
              const msg = err instanceof Error ? err.message : tCatalog('variantGuard.validateUsageFailed');
              setVariantGuardModal({ title: tCatalog('variantGuard.cannotValidateDeletion'), message: msg });
            });
          return;
        }
      }
      setVariants(prev => prev.filter(variant => variant.id !== variantId));
    }
  };

  const updateVariant = (variantId: string, field: string, value: string | number | undefined) => {
    // Keep typing fast: update drafts only for label edits.
    if (field === 'variantType') {
      setVariantDrafts((prev) =>
        prev.map((variant) => (variant.id === variantId ? { ...variant, variantType: String(value ?? '') } : variant)),
      );
      return;
    }

    setVariants(prev => prev.map(variant => {
      if (variant.id === variantId) {
        return { ...variant, [field]: value };
      }
      return variant;
    }));
  };

  const showRenameBlockedModal = (
    tied: Array<{ variantName: string; orderItemCount: number; orderIds?: string[] }>,
    action?: { kind: 'create_option'; variantId: string; initialName: string } | null,
  ) => {
    setVariantGuardModal({
      title: tCatalog('variantGuard.cannotRenameTitle'),
      intro: tCatalog('variantGuard.cannotRenameIntro'),
      items: tied.slice(0, 8).map((u) => ({
        variantName: u.variantName,
        orderItemCount: u.orderItemCount,
        orderIds: u.orderIds ?? [],
      })),
      policy: tCatalog('variantGuard.policy'),
      footer:
        tied.length > 8
          ? tCatalog('variantGuard.footerMoreCreateNew', { count: tied.length - 8 })
          : tCatalog('variantGuard.footerCreateNew'),
      action: action ?? null,
    });
  };

  const commitVariantTypeRename = (variantId: string) => {
    const draft = variantDrafts.find((v) => v.id === variantId);
    const committed = variants.find((v) => v.id === variantId);
    const next = draft?.variantType ? String(draft.variantType) : '';
    const prev = committed?.variantType ? String(committed.variantType) : '';

    if (!committed || prev === next) return;

    // Block renaming variant types when affected variants are used in past orders.
    if (currentMode === 'edit' && user?.id && formData.productId && prev && next) {
      const affectedVariantOptionIds = getAffectedVariantOptionIds({ variantType: prev });
      if (affectedVariantOptionIds.length > 0) {
        fetchGraphQL<{ variantOptionUsage: Array<{ variantName: string; orderItemCount: number; orderIds: string[] }> }>(
          VARIANT_OPTION_USAGE_QUERY,
          {
            userId: user.id,
            productId: String(formData.productId),
            variantNames: null,
            variantOptionIds: affectedVariantOptionIds,
          },
        )
          .then((res) => {
            const tied = (res?.variantOptionUsage || []).filter((u) => (u.orderItemCount || 0) > 0);
            if (tied.length > 0) {
              const lines = tied
                .slice(0, 8)
                .map((u) => `- ${u.variantName} (${u.orderItemCount})`)
                .join('\n');
              setVariantGuardModal({
                title: tCatalog('variantGuard.cannotRenameTitle'),
                message:
                  `${tCatalog('variantGuard.cannotRenameIntro')}\n\n${lines}` +
                  (tied.length > 8 ? `\n${tCatalog('variantGuard.renameMessageMore', { count: tied.length - 8 })}` : '') +
                  `\n\n${tCatalog('variantGuard.renameMessageSuffix')}`,
              });
              // revert draft back to committed
              setVariantDrafts((prevDrafts) =>
                prevDrafts.map((v) => (v.id === variantId ? { ...v, variantType: prev } : v)),
              );
              return;
            }

            setVariants((prevState) =>
              prevState.map((v) => (v.id === variantId ? { ...v, variantType: next } : v)),
            );
          })
          .catch((err) => {
            const msg = err instanceof Error ? err.message : tCatalog('variantGuard.validateUsageFailed');
            setVariantGuardModal({ title: tCatalog('variantGuard.cannotValidateRename'), message: msg });
            setVariantDrafts((prevDrafts) =>
              prevDrafts.map((v) => (v.id === variantId ? { ...v, variantType: prev } : v)),
            );
          });
        return;
      }
    }

    setVariants((prevState) => prevState.map((v) => (v.id === variantId ? { ...v, variantType: next } : v)));
  };

  const addVariantOption = (variantId: string, initialName = '') => {
    const uniq = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const newOptionId = `${variantId}-option-${uniq}`;
    setVariants((prev) =>
      prev.map((variant) => {
        if (variant.id === variantId) {
          const newOption = { id: newOptionId, name: initialName };
          return { ...variant, options: [...variant.options, newOption] };
        }
        return variant;
      }),
    );

    // Keep drafts aligned so the input doesn't snap back.
    setVariantDrafts((prev) =>
      prev.map((variant) =>
        variant.id === variantId
          ? { ...variant, options: [...variant.options, { id: newOptionId, name: initialName }] }
          : variant,
      ),
    );
  };

  const removeVariantOption = (variantId: string, optionId: string) => {
    if (currentMode === 'edit' && user?.id && formData.productId) {
      const targetVariant = variants.find((v) => v.id === variantId);
      const opt = targetVariant?.options?.find((o) => o.id === optionId);
      const variantType = targetVariant?.variantType ? String(targetVariant.variantType) : '';
      const optionName = opt?.name ? String(opt.name) : '';

      const affectedVariantOptionIds =
        variantType && optionName ? getAffectedVariantOptionIds({ variantType, optionName }) : [];
      if (affectedVariantOptionIds.length > 0) {
        fetchGraphQL<{ variantOptionUsage: Array<{ variantName: string; orderItemCount: number; orderIds: string[] }> }>(
          VARIANT_OPTION_USAGE_QUERY,
          {
            userId: user.id,
            productId: String(formData.productId),
            variantNames: null,
            variantOptionIds: affectedVariantOptionIds,
          },
        )
          .then((res) => {
            const tied = (res?.variantOptionUsage || []).filter((u) => (u.orderItemCount || 0) > 0);
            if (tied.length > 0) {
              setVariantGuardModal({
                title: tCatalog('variantGuard.cannotDeleteTitle'),
                intro: tCatalog('variantGuard.cannotDeleteOptionIntro'),
                items: tied.slice(0, 8).map((u) => ({
                  variantName: u.variantName,
                  orderItemCount: u.orderItemCount,
                  orderIds: u.orderIds ?? [],
                })),
                policy: tCatalog('variantGuard.policy'),
                footer:
                  (tied.length > 8 ? tCatalog('variantGuard.footerMore', { count: tied.length - 8 }) : '') +
                  tCatalog('variantGuard.footerBlocked'),
                action: null,
              });
              return;
            }
            setVariants((prev) =>
              prev.map((variant) =>
                variant.id === variantId
                  ? { ...variant, options: variant.options.filter((o) => o.id !== optionId) }
                  : variant,
              ),
            );
          })
          .catch((err) => {
            const msg = err instanceof Error ? err.message : tCatalog('variantGuard.validateUsageFailed');
            setVariantGuardModal({ title: tCatalog('variantGuard.cannotValidateDeletion'), message: msg });
          });
        return;
      }
    }
    setVariants(prev => prev.map(variant => {
      if (variant.id === variantId) {
        return {
          ...variant,
          options: variant.options.filter(opt => opt.id !== optionId)
        };
      }
      return variant;
    }));
  };

  const updateVariantOption = (variantId: string, optionId: string, field: string, value: string) => {
    // Keep typing fast: update drafts only for label edits.
    if (field === 'name') {
      setVariantDrafts((prev) =>
        prev.map((variant) =>
          variant.id === variantId
            ? {
                ...variant,
                options: variant.options.map((opt) => (opt.id === optionId ? { ...opt, name: value } : opt)),
              }
            : variant,
        ),
      );
      return;
    }

    setVariants(prev => prev.map(variant => {
      if (variant.id === variantId) {
        return {
          ...variant,
          options: variant.options.map(opt => {
            if (opt.id === optionId) {
              return { ...opt, [field]: value };
            }
            return opt;
          })
        };
      }
      return variant;
    }));
  };

  const commitVariantOptionRename = (variantId: string, optionId: string) => {
    const committedVariant = variants.find((v) => v.id === variantId);
    const draftVariant = variantDrafts.find((v) => v.id === variantId);
    const prevOpt = committedVariant?.options?.find((o) => o.id === optionId);
    const nextOpt = draftVariant?.options?.find((o) => o.id === optionId);

    const prevName = prevOpt?.name ? String(prevOpt.name) : '';
    const nextName = nextOpt?.name ? String(nextOpt.name) : '';
    const variantType = committedVariant?.variantType ? String(committedVariant.variantType) : '';

    if (!committedVariant || prevName === nextName) return;

    if (currentMode === 'edit' && user?.id && formData.productId && prevName && nextName && variantType) {
      const affectedVariantOptionIds = getAffectedVariantOptionIds({ variantType, optionName: prevName });
      if (affectedVariantOptionIds.length > 0) {
        fetchGraphQL<{ variantOptionUsage: Array<{ variantName: string; orderItemCount: number; orderIds: string[] }> }>(
          VARIANT_OPTION_USAGE_QUERY,
          {
            userId: user.id,
            productId: String(formData.productId),
            variantNames: null,
            variantOptionIds: affectedVariantOptionIds,
          },
        )
          .then((res) => {
            const tied = (res?.variantOptionUsage || []).filter((u) => (u.orderItemCount || 0) > 0);
            if (tied.length > 0) {
              setVariantGuardModal({
                title: tCatalog('variantGuard.cannotRenameTitle'),
                intro: tCatalog('variantGuard.cannotRenameIntro'),
                items: tied.slice(0, 8).map((u) => ({
                  variantName: u.variantName,
                  orderItemCount: u.orderItemCount,
                  orderIds: u.orderIds ?? [],
                })),
                policy: tCatalog('variantGuard.policy'),
                footer:
                  (tied.length > 8 ? tCatalog('variantGuard.footerMoreCreateNew', { count: tied.length - 8 }) : '') +
                  tCatalog('variantGuard.footerCreateNew'),
                action: { kind: 'create_option', variantId, initialName: nextName },
              });
              // revert draft back to committed
              setVariantDrafts((prevDrafts) =>
                prevDrafts.map((v) =>
                  v.id === variantId
                    ? { ...v, options: v.options.map((o) => (o.id === optionId ? { ...o, name: prevName } : o)) }
                    : v,
                ),
              );
              return;
            }

            // Commit rename
            setVariants((prevState) =>
              prevState.map((variant) =>
                variant.id === variantId
                  ? {
                      ...variant,
                      options: variant.options.map((o) => (o.id === optionId ? { ...o, name: nextName } : o)),
                    }
                  : variant,
              ),
            );

            // Preserve row inputs: update existing combinations that used the old option name
            setCombinations((prevCombos) =>
              prevCombos.map((combo) => {
                const current = combo[`variant_${variantId}`];
                if (typeof current === 'string' && current === prevName) {
                  return updateCombinationVariantValue(combo, variantId, nextName);
                }
                return combo;
              }),
            );
          })
          .catch((err) => {
            const msg = err instanceof Error ? err.message : tCatalog('variantGuard.validateUsageFailed');
            setVariantGuardModal({ title: tCatalog('variantGuard.cannotValidateRename'), message: msg });
            setVariantDrafts((prevDrafts) =>
              prevDrafts.map((v) =>
                v.id === variantId
                  ? { ...v, options: v.options.map((o) => (o.id === optionId ? { ...o, name: prevName } : o)) }
                  : v,
              ),
            );
          });
        return;
      }
    }

    // No blocking: commit rename
    setVariants((prevState) =>
      prevState.map((variant) =>
        variant.id === variantId
          ? { ...variant, options: variant.options.map((o) => (o.id === optionId ? { ...o, name: nextName } : o)) }
          : variant,
      ),
    );
    setCombinations((prevCombos) =>
      prevCombos.map((combo) => {
        const current = combo[`variant_${variantId}`];
        if (typeof current === 'string' && current === prevName) {
          return updateCombinationVariantValue(combo, variantId, nextName);
        }
        return combo;
      }),
    );
  };

  const guardVariantTypeEditOnFocus = async (variantId: string): Promise<boolean> => {
    const committed = variants.find((v) => v.id === variantId);
    const prev = committed?.variantType ? String(committed.variantType) : '';
    if (!(currentMode === 'edit' && user?.id && formData.productId && prev)) return false;

    const affectedVariantOptionIds = getAffectedVariantOptionIds({ variantType: prev });
    if (affectedVariantOptionIds.length === 0) return false;

    try {
      const res = await fetchGraphQL<{
        variantOptionUsage: Array<{ variantName: string; orderItemCount: number; orderIds: string[] }>;
      }>(VARIANT_OPTION_USAGE_QUERY, {
        userId: user.id,
        productId: String(formData.productId),
        variantNames: null,
        variantOptionIds: affectedVariantOptionIds,
      });
      const tied = (res?.variantOptionUsage || []).filter((u) => (u.orderItemCount || 0) > 0);
      if (tied.length > 0) {
        // Block rename, but allow creating a new option instead.
        showRenameBlockedModal(tied, { kind: 'create_option', variantId, initialName: '' });
        return true;
      }
      return false;
    } catch {
      return false;
    }
  };

  const guardVariantOptionEditOnFocus = async (variantId: string, optionId: string): Promise<boolean> => {
    const committedVariant = variants.find((v) => v.id === variantId);
    const committedOpt = committedVariant?.options?.find((o) => o.id === optionId);
    const prevName = committedOpt?.name ? String(committedOpt.name) : '';
    const variantType = committedVariant?.variantType ? String(committedVariant.variantType) : '';

    if (!(currentMode === 'edit' && user?.id && formData.productId && prevName && variantType)) return false;

    const affectedVariantOptionIds = getAffectedVariantOptionIds({ variantType, optionName: prevName });
    if (affectedVariantOptionIds.length === 0) return false;

    try {
      const res = await fetchGraphQL<{
        variantOptionUsage: Array<{ variantName: string; orderItemCount: number; orderIds: string[] }>;
      }>(VARIANT_OPTION_USAGE_QUERY, {
        userId: user.id,
        productId: String(formData.productId),
        variantNames: null,
        variantOptionIds: affectedVariantOptionIds,
      });
      const tied = (res?.variantOptionUsage || []).filter((u) => (u.orderItemCount || 0) > 0);
      if (tied.length > 0) {
        showRenameBlockedModal(tied);
        return true;
      }
      return false;
    } catch {
      return false;
    }
  };

  // Validate numeric input (allows positive numbers, decimals, and empty string)
  const validateNumericInput = (value: string): boolean => {
    // Allow empty string (for clearing the field)
    if (value === '') return true;
    // Allow positive numbers with optional decimal point and up to 2 decimal places
    // This regex allows: integers (e.g., 123), decimals (e.g., 123.45)
    // Does not allow: negative numbers, standalone decimal points, or leading decimals
    const numericRegex = /^\d+\.?\d{0,2}$/;
    return numericRegex.test(value);
  };

  // Update combination
  const updateCombination = (combinationId: string, field: string, value: string | number | undefined) => {
    setCombinations(prev => prev.map(combination => {
      if (combination.id === combinationId) {
        const updated = { ...combination, [field]: value };
        
        // Auto-generate variant name from selected options
        const selectedOptions = variants.map((variant, idx) => {
          const optionValue = updated[`variant_${variant.id}`] || 'None';
          return `${variant.variantType || `Var ${idx + 1}`}: ${optionValue}`;
        }).join(' | ');
        
        updated.variantName = selectedOptions;

        if (field === 'stockQuantity' || field === 'lowStockThreshold') {
          updated.stockStatus = getVariantStockStatus(updated.stockQuantity, updated.lowStockThreshold);
        }
        
        return updated;
      }
      return combination;
    }));
  };

  const updateCombinationVariantValue = (combo: Combination, variantId: string, nextValue: string): Combination => {
    return { ...combo, [`variant_${variantId}`]: nextValue };
  };

  const variationImportColumns = useMemo(
    () =>
      variants.map((variant, index) => ({
        id: variant.id,
        label: variant.variantType || tCatalog('variants.varFallback', { index: index + 1 }),
      })),
    [variants, tCatalog],
  );

  const deriveComboStockStatus = (stockQuantity: number, lowStockThreshold: number): Combination['stockStatus'] =>
    getVariantStockStatus(stockQuantity, lowStockThreshold);

  const comboMatchesImportRow = (
    combo: Combination,
    row: VariationImportRow,
    variantsList: CatalogVariant[] = variants,
    hasVariantColumns = false,
  ) => {
    const skuMatch = Boolean(
      row.sku.trim() &&
        combo.sku.trim() &&
        normalizeImportMatchValue(row.sku) === normalizeImportMatchValue(combo.sku),
    );

    const importedValues = variantsList
      .map((variant, index) => ({
        raw: getImportRowVariantValue(row, variant, index),
        normalized: normalizeImportMatchValue(getImportRowVariantValue(row, variant, index)),
      }))
      .filter((entry) => entry.raw);

    // SKU-only files may match by SKU. If variant columns are mapped but this row's
    // values are blank, do not SKU-match — shared SKUs would hit the wrong PACK/KARTON row.
    if (importedValues.length === 0 && !hasVariantColumns) {
      return skuMatch;
    }

    const variantMatch = variantsList.every((variant, index) => {
      const imported = normalizeImportMatchValue(getImportRowVariantValue(row, variant, index));
      const current = normalizeImportMatchValue(combo[`variant_${variant.id}`] ?? 'None');
      if (!imported) {
        return !current || current === 'none';
      }
      return imported === current;
    });

    // When variant columns are present, match by those values only. Shared parent SKUs
    // (common across KARTON/PACK rows) must not claim unrelated import rows on first pass,
    // or new unit options only append the leftover rows and look "incomplete" until re-import.
    if (variantMatch) {
      return true;
    }

    const comboValues = variantsList
      .map((variant) => normalizeImportMatchValue(combo[`variant_${variant.id}`] ?? ''))
      .filter((value) => value && value !== 'none');

    const importedNormalized = importedValues.map((entry) => entry.normalized);
    const subsetMatch =
      importedNormalized.length > 0 &&
      importedNormalized.every((value) => comboValues.includes(value)) &&
      importedNormalized.length === comboValues.length;

    // Fallback when variant_* keys are empty but variantName is populated
    // (e.g. "Unit #3: KARTON | Item Name: BRAVOO ..."). Exact typed values only —
    // no substring matching, which can falsely link partial names.
    const typedNameValues = new Map<string, string>();
    String(combo.variantName ?? '')
      .split('|')
      .map((part) => part.trim())
      .filter(Boolean)
      .forEach((part) => {
        const sep = part.indexOf(':');
        if (sep <= 0) return;
        const typeKey = normalizeImportMatchValue(part.slice(0, sep));
        const value = normalizeImportMatchValue(part.slice(sep + 1));
        if (typeKey && value && value !== 'none') typedNameValues.set(typeKey, value);
      });

    const nameMatch =
      typedNameValues.size > 0 &&
      variantsList.every((variant, index) => {
        const imported = normalizeImportMatchValue(getImportRowVariantValue(row, variant, index));
        const typeKey = normalizeImportMatchValue(variant.variantType || `Var ${index + 1}`);
        const typedValue = typedNameValues.get(typeKey);
        if (!imported) {
          return !typedValue || typedValue === 'none';
        }
        return typedValue === imported;
      });

    return subsetMatch || nameMatch;
  };

  const mergeImportRowIntoCombo = (combo: Combination, row: VariationImportRow): Combination => {
    const stockQuantity = row.stockQuantity ? parseInt(row.stockQuantity, 10) : combo.stockQuantity;
    const lowStockThreshold = row.lowStockThreshold ? parseInt(row.lowStockThreshold, 10) : combo.lowStockThreshold;
    const resolvedStockQuantity = Number.isFinite(stockQuantity) ? stockQuantity : combo.stockQuantity;
    const resolvedLowThreshold = Number.isFinite(lowStockThreshold) ? lowStockThreshold : combo.lowStockThreshold;
    const parsedMoq = row.moq ? parseInt(row.moq, 10) : combo.moq;
    const stockStatus =
      normalizeImportedStockStatus(row.stockStatus) ??
      deriveComboStockStatus(resolvedStockQuantity, resolvedLowThreshold);

    return {
      ...combo,
      sku: row.sku.trim() || combo.sku,
      sellingPrice: row.sellingPrice.trim() || combo.sellingPrice,
      purchasePrice: row.purchasePrice.trim() || combo.purchasePrice,
      moq: Number.isFinite(parsedMoq as number) ? parsedMoq : combo.moq,
      stockQuantity: resolvedStockQuantity,
      lowStockThreshold: resolvedLowThreshold,
      stockStatus,
    };
  };

  const handleExportVariationList = () => {
    const headers = [
      ...variationImportColumns.map((col) => col.label),
      tCatalog('variants.sku'),
      tCatalog('variants.sellingPrice'),
      tCatalog('variants.purchasePrice'),
      tCatalog('variants.moq'),
      tCatalog('variants.stockQty'),
      tCatalog('variants.lowThreshold'),
      tCatalog('variants.status'),
    ];
    const dataRows = combinations.map((combo) => [
      ...variants.map((variant) => String(combo[`variant_${variant.id}`] ?? tCatalog('variants.none'))),
      combo.sku,
      combo.sellingPrice,
      combo.purchasePrice,
      combo.moq ?? '',
      combo.stockQuantity,
      combo.lowStockThreshold,
      combo.stockStatus,
    ]);
    const ws = XLSX.utils.aoa_to_sheet([headers, ...dataRows]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Variations');
    const safeName = (formData.name || formData.productId || 'product').replace(/[^\w\-]+/g, '_').slice(0, 40);
    XLSX.writeFile(wb, `variation-list-${safeName}.xlsx`);
  };

  const handleVariationImport = async (
    payload: VariationImportPayload,
  ): Promise<VariationImportResult> => {
    const { rows, variantLevels } = payload;

    const applyRowsToCombinations = (
      combos: Combination[],
      variantsList: CatalogVariant[],
    ): { combinations: Combination[]; updated: number } => {
      const hasVariantColumns = variantLevels.length > 0;
      const usedRowIndices = new Set<number>();
      let updated = 0;

      let nextCombinations = combos.map((combo) => {
        const rowIndex = rows.findIndex((row, idx) => {
          if (usedRowIndices.has(idx)) return false;
          return comboMatchesImportRow(combo, row, variantsList, hasVariantColumns);
        });
        if (rowIndex < 0) return combo;
        usedRowIndices.add(rowIndex);
        updated += 1;
        return mergeImportRowIntoCombo(combo, rows[rowIndex]);
      });

      rows.forEach((row, rowIndex) => {
        if (usedRowIndices.has(rowIndex)) return;

        const hasIdentity =
          Boolean(row.sku.trim()) ||
          variantsList.some((variant, variantIndex) => Boolean(getImportRowVariantValue(row, variant, variantIndex)));

        if (!hasIdentity) return;

        const existingIndex = nextCombinations.findIndex((combo) =>
          comboMatchesImportRow(combo, row, variantsList, hasVariantColumns),
        );
        if (existingIndex >= 0) {
          nextCombinations = nextCombinations.map((combo, index) =>
            index === existingIndex ? mergeImportRowIntoCombo(combo, row) : combo,
          );
          usedRowIndices.add(rowIndex);
          updated += 1;
          return;
        }

        nextCombinations = [
          ...nextCombinations,
          buildCombinationFromImportRow(row, variantsList, nextCombinations.length),
        ];
        usedRowIndices.add(rowIndex);
        updated += 1;
      });

      return { combinations: nextCombinations, updated };
    };

    const sourceCombinations = combinationsRef.current.length > 0 ? combinationsRef.current : combinations;
    const buildingFromImport = variantLevels.length > 0 && !hasValidVariants(variants);
    const seedVariants = buildingFromImport ? buildVariantsFromImport(variantLevels, rows) : variants;

    if (buildingFromImport && seedVariants.length === 0) {
      return { updated: 0, skipped: rows.length };
    }

    const seedCombinations = buildingFromImport
      ? rebuildCombinationsFromVariants(seedVariants, [])
      : sourceCombinations;

    const { combinations: merged, updated } = applyRowsToCombinations(seedCombinations, seedVariants);
    const syncedVariants = syncVariantDefinitionsWithCombinations(seedVariants, merged, rows);
    const validSynced = syncedVariants.filter((v) => v.variantType && v.options.some((opt) => opt.name));
    // Import should show the full matrix immediately (including PACK/KARTON counterparts).
    // Refresh stays for manual variant-type / option edits only.
    const rebuilt =
      validSynced.length > 0 ? rebuildCombinationsFromVariants(validSynced, merged) : merged;

    setVariants(syncedVariants);
    combinationsRef.current = rebuilt;
    setCombinations(rebuilt);

    return { updated, skipped: rows.length - updated };
  };

  // Keep ref in sync with combinations state
  useEffect(() => {
    combinationsRef.current = combinations;
  }, [combinations]);

  // Rebuild combinations only when user clicks Refresh (or initial load).
  useEffect(() => {
    if (variationRefreshTick === 0) return;

    const validVariants = variants.filter((v) => v.variantType && v.options.some((opt) => opt.name));
    setCombinations(rebuildCombinationsFromVariants(validVariants, combinationsRef.current));
  }, [variationRefreshTick]);

  const handleImageUpload = async (files: FileList) => {
    setUploadingImages(true);
    
    const maxFileSize = 5 * 1024 * 1024; // 5MB
    const maxImages = 10;
    
    // Validate total image count first
    if (formData.images.length + files.length > maxImages) {
      alert(tCatalog('alerts.maxImages', { max: maxImages, current: formData.images.length }));
      setUploadingImages(false);
      return;
    }
    
    const uploadedImages: string[] = [];
    
    for (const file of Array.from(files)) {
      // Validate file type
      if (!file.type.startsWith('image/')) {
        alert(tCatalog('alerts.notImageFile', { name: file.name }));
        continue;
      }
      
      // Validate file size
      if (file.size > maxFileSize) {
        alert(tCatalog('alerts.fileTooLarge', { name: file.name }));
        continue;
      }
      
      try {
        const result = await uploadToCloudinaryDirect(file, 'products');
        if (result.success && result.url) {
          uploadedImages.push(result.url);
        } else {
          throw new Error(result.error || 'Upload failed');
        }
      } catch (error) {
        alert(tCatalog('alerts.uploadFailed', { name: file.name, error: error instanceof Error ? error.message : tCatalog('alerts.unknownError') }));
      }
    }

    if (uploadedImages.length > 0) {
      setFormData(prev => ({
        ...prev,
        images: [...prev.images, ...uploadedImages]
      }));
    }
    
    setUploadingImages(false);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      handleImageUpload(files);
    }
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      handleImageUpload(files);
    }
  };

  const removeImage = (index: number) => {
    if (index < 0 || index >= formData.images.length) return;
    const newImages = formData.images.filter((_, i) => i !== index);
    setFormData(prev => ({ ...prev, images: newImages }));
  };

  const reorderImages = (fromIndex: number, toIndex: number) => {
    setFormData(prev => {
      const newImages = [...prev.images];
      const [movedImage] = newImages.splice(fromIndex, 1);
      newImages.splice(toIndex, 0, movedImage);
      return { ...prev, images: newImages };
    });
  };

  const clearAllImages = () => {
    setFormData(prev => ({ ...prev, images: [] }));
  };

    

  const handleUnpublish = async () => {
    const productId = product?.productId || formData.productId;
    if (!user?.id || !productId) {
      alert(tCatalog('alerts.userNotAuthenticatedOrProductNotFound'));
      return;
    }

    setSaving(true);
    
    try {
      const result = await fetchGraphQL<{
        publishMarketplaceProduct: { success: boolean; message: string };
      }>(MARKETPLACE_STATUS_MUTATION, {
        userId: user.id,
        productId,
        action: 'unpublish',
      });

      if (!result?.publishMarketplaceProduct?.success) {
        throw new Error(
          result?.publishMarketplaceProduct?.message || tCatalog('alerts.unpublishError'),
        );
      }

      const nextFormData: ProductFormData = { ...formData, status: 'Draft' };
      setFormData(nextFormData);
      setOriginalFormData(JSON.parse(JSON.stringify(nextFormData)));
      prevProductStatusRef.current = 'Draft';

      showSuccessNotice();
    } catch (error) {
      alert(error instanceof Error ? error.message : tCatalog('alerts.unpublishError'));
    } finally {
      setSaving(false);
    }
  };

  const validateRequiredFields = () => {
    const requiredFields = [
      { field: 'sku', value: formData.sku, nameKey: 'sku' },
      { field: 'name', value: formData.name, nameKey: 'name' },
      { field: 'description', value: formData.description, nameKey: 'description' },
      { field: 'productType', value: formData.productType, nameKey: 'productType' },
      { field: 'brand', value: formData.brand, nameKey: 'brand' },
      { field: 'supplier', value: formData.supplier, nameKey: 'supplier' },
      { field: 'images', value: formData.images, nameKey: 'images' },
    ];

    const variantValidation =
      combinations.length > 0 &&
      combinations.every((combo) => isCompleteCombination(combo, userCurrency));

    // Publishing needs stock on hand, matching isProductMarketplacePublishable and the
    // publishMarketplaceProduct mutation, which both reject a zero product-level total.
    const totalStock = combinations.reduce((sum, combo) => sum + combo.stockQuantity, 0);

    const stockValidation =
      combinations.every(
        (combo) =>
          isFiniteNonNegativeNumber(combo.stockQuantity) &&
          isFiniteNonNegativeNumber(combo.lowStockThreshold),
      ) && totalStock > 0;

    const missingFields = requiredFields.filter((field) => {
      if (field.field === 'images') {
        return !field.value || (Array.isArray(field.value) && field.value.length === 0);
      }
      return !field.value || String(field.value).trim() === '';
    });

    if (!variantValidation) {
      missingFields.push({ field: 'variants', value: '', nameKey: 'variants' });
    }

    if (!stockValidation) {
      missingFields.push({ field: 'stock', value: '', nameKey: 'stock' });
    }

    return {
      isValid: missingFields.length === 0,
      missingFields: missingFields.map((f) => translateFieldName(f.nameKey)),
    };
  };

  const validation = validateRequiredFields();

  const handleSubmitWithStatus = async (status: 'Draft' | 'Published') => {
    if (!user?.id) {
      alert(tCatalog('alerts.userNotAuthenticated'));
      return;
    }

    if (status === 'Published') {
      const publishValidation = validateRequiredFields();
      if (!publishValidation.isValid) {
        alert(
          tCatalog('header.missingRequiredFields', {
            fields: publishValidation.missingFields.join(', '),
          }),
        );
        return;
      }

      const invalidNumericCombo = combinations.some(
        (combo) => !isCompleteCombination(combo, user?.currency || userCurrency),
      );
      if (invalidNumericCombo) {
        alert(
          tCatalog('header.missingRequiredFields', {
            fields: [
              translateFieldName('variants'),
              translateFieldName('stock'),
            ].join(', '),
          }),
        );
        return;
      }
    }

    setSaving(true);
    
    try {
      // First-time publish: persist the form as Draft, then go live only via
      // publishMarketplaceProduct. Already-live listings stay Published while saving.
      const wasAlreadyPublished = String(formData.status || '') === 'Published';
      const persistStatus: 'Draft' | 'Published' =
        status === 'Published' && !wasAlreadyPublished ? 'Draft' : status;

      const finalData: ProductFormData = {
        ...formData,
        status: persistStatus
      };

      // Note: we rely on the variant guard modal + backend enforcement for order integrity.

      // Generate product ID in LKP format if not exists
      if (!finalData.productId && currentMode === 'add') {
        finalData.productId = generateLKPProductId();
      }

      // Rebuild the variation matrix from current variant types before save so publish/save
      // never sends a partial list that would cause the backend to delete missing rows.
      // When no valid variant types remain, send an empty matrix so deleted rows are cleared in DB.
      const validVariants = variants.filter((v) => v.variantType && v.options.some((opt) => opt.name));
      const combinationsForSave =
        validVariants.length > 0
          ? rebuildCombinationsFromVariants(validVariants, combinations)
          : [];

      const priceCurrency = user.currency || userCurrency;

      // Always persist the full rebuilt matrix (including incomplete draft rows).
      // Filtering incomplete rows on draft previously dropped newly imported PACK/etc. rows from
      // both the API payload and local state, so they vanished on save and never reloaded.
      const combinationsForPayload = combinationsForSave;

      if (
        status === 'Published' &&
        combinationsForPayload.some((combo) => !isCompleteCombination(combo, priceCurrency))
      ) {
        alert(
          tCatalog('header.missingRequiredFields', {
            fields: [
              translateFieldName('variants'),
              translateFieldName('stock'),
            ].join(', '),
          }),
        );
        setSaving(false);
        return;
      }

      // Product-level stock from all variants (not "any variant out of stock")
      const totalStock = combinationsForPayload.reduce((sum, combo) => sum + combo.stockQuantity, 0);
      const lowStockThreshold = combinationsForPayload.reduce((sum, combo) => sum + combo.lowStockThreshold, 0);
      const stockStatus = getProductStockStatus(combinationsForPayload);

      const serializeComboPrice = (raw: unknown): string => {
        const text = String(raw ?? '').trim();
        if (!text && status !== 'Published') return '';
        return String(parseNumberByCurrency(text, priceCurrency));
      };

      // Submit the new variant structure
      const payload: Record<string, unknown> = {
        ...finalData,
        id: formData.id,
        productId: formData.productId,
        userId: user.id,
        currency: user.currency,
        totalStock,
        lowStockThreshold,
        stockStatus,
        variantDefinitions: validVariants.map((variant, index) => ({
          variantType: String(variant.variantType ?? '').trim(),
          options: variant.options.map((opt) => opt.name).filter((name) => name),
          position: index + 1,
        })),
        variantOptions: combinationsForPayload.map((combo) => ({
          variantName: combo.variantName,
          attributes: Object.fromEntries(
            validVariants.map((variant) => {
              const key = String(variant.variantType ?? '').trim();
              const lowerKey = `variant_${key.toLowerCase()}`;
              const idKey = `variant_${variant.id}`;
              const rawValue =
                (combo as Record<string, unknown>)[lowerKey] ??
                (combo as Record<string, unknown>)[idKey] ??
                'None';
              const value = String(rawValue).trim();
              return [key, value];
            }),
          ),
          sku: combo.sku,
          purchasePrice: serializeComboPrice(combo.purchasePrice),
          sellingPrice: serializeComboPrice(combo.sellingPrice),
          originalSellingPrice: null,
          moq: combo.moq,
          stockQuantity: combo.stockQuantity,
          lowStockThreshold: combo.lowStockThreshold,
          stockStatus: getVariantStockStatus(combo.stockQuantity, combo.lowStockThreshold),
          isDefault: false,
          isActive: true,
        })),
      };

      // GraphQL mutations
      const CREATE_PRODUCT_MUTATION = `
        mutation CreateProduct(
          $userId: Int!
          $productId: String
          $sku: String
          $name: String!
          $description: String!
          $productType: String!
          $brand: String!
          $supplier: String!
          $status: String
          $productCategory: String!
          $catalogName: String
          $images: [String!]
          $halalCertified: Boolean
          $bpomApproved: Boolean
          $originalProduct: Boolean
          $returnPolicyDays: Int
          $currency: String
          $variantDefinitions: [VariantDefinitionInput!]
          $variantOptions: [VariantOptionInput!]
        ) {
          createProduct(
            userId: $userId
            productId: $productId
            sku: $sku
            name: $name
            description: $description
            productType: $productType
            brand: $brand
            supplier: $supplier
            status: $status
            productCategory: $productCategory
            catalogName: $catalogName
            images: $images
            halalCertified: $halalCertified
            bpomApproved: $bpomApproved
            originalProduct: $originalProduct
            returnPolicyDays: $returnPolicyDays
            currency: $currency
            variantDefinitions: $variantDefinitions
            variantOptions: $variantOptions
          ) {
            id
            productId
            sku
            name
            status
          }
        }
      `;

      const UPDATE_PRODUCT_MUTATION = `
        mutation UpdateProduct(
          $userId: Int!
          $id: String
          $productId: String
          $sku: String
          $name: String
          $description: String
          $productType: String
          $brand: String
          $supplier: String
          $status: String
          $productCategory: String
          $catalogName: String
          $images: [String!]
          $halalCertified: Boolean
          $bpomApproved: Boolean
          $originalProduct: Boolean
          $returnPolicyDays: Int
          $currency: String
          $variantDefinitions: [VariantDefinitionInput!]
          $variantOptions: [VariantOptionInput!]
        ) {
          updateProduct(
            userId: $userId
            id: $id
            productId: $productId
            sku: $sku
            name: $name
            description: $description
            productType: $productType
            brand: $brand
            supplier: $supplier
            status: $status
            productCategory: $productCategory
            catalogName: $catalogName
            images: $images
            halalCertified: $halalCertified
            bpomApproved: $bpomApproved
            originalProduct: $originalProduct
            returnPolicyDays: $returnPolicyDays
            currency: $currency
            variantDefinitions: $variantDefinitions
            variantOptions: $variantOptions
          ) {
            id
            productId
            sku
            name
            status
          }
        }
      `;

      let savedProduct;
      if (currentMode === 'add') {
        const createVariables: Record<string, unknown> = {
          userId: user.id,
          productId: payload.productId,
          sku: payload.sku,
          name: payload.name,
          description: payload.description,
          productType: payload.productType,
          brand: payload.brand,
          supplier: payload.supplier,
          status: payload.status,
          productCategory: payload.productCategory,
          images: payload.images || [],
          halalCertified: payload.halalCertified || false,
          bpomApproved: payload.bpomApproved || false,
          originalProduct: payload.originalProduct !== false,
          returnPolicyDays: payload.returnPolicyDays || 7,
          currency: user.currency || 'IDR',
        };

        // Only include catalogName if it exists
        if (payload.catalogName) {
          createVariables.catalogName = payload.catalogName;
        }

        // Only include variantDefinitions if provided and not empty
        const variantDefs = payload.variantDefinitions;
        if (variantDefs && Array.isArray(variantDefs) && variantDefs.length > 0) {
          createVariables.variantDefinitions = variantDefs;
        }

        // Only include variantOptions if provided and not empty
        const variantOpts = payload.variantOptions;
        if (variantOpts && Array.isArray(variantOpts) && variantOpts.length > 0) {
          createVariables.variantOptions = variantOpts;
        }

        const data = await fetchGraphQL<{ createProduct: Product }>(CREATE_PRODUCT_MUTATION, createVariables);
        savedProduct = data.createProduct;
      } else if (currentMode === 'edit' && (finalData.id || finalData.productId)) {
        // Only include variantDefinitions and variantOptions if they exist and are not empty
        // Sending empty arrays would delete all variants
        // Include all fields from payload - GraphQL client will filter out null/undefined
        const updateVariables: Record<string, unknown> = {
          userId: user.id,
          sku: payload.sku,
          name: payload.name,
          description: payload.description,
          productType: payload.productType,
          brand: payload.brand,
          supplier: payload.supplier,
          status: payload.status,
          productCategory: payload.productCategory,
          images: payload.images || [],
          halalCertified: payload.halalCertified ?? false,
          bpomApproved: payload.bpomApproved ?? false,
          originalProduct: payload.originalProduct ?? true,
          returnPolicyDays: payload.returnPolicyDays ?? 7,
          currency: user.currency || 'IDR',
        };

        // Include id or productId (at least one must be provided)
        // Use productId if available, otherwise use id
        let hasId = false;
        if (finalData.productId && String(finalData.productId).trim() !== '') {
          updateVariables.productId = finalData.productId;
          hasId = true;
        } else if (finalData.id && String(finalData.id).trim() !== '') {
          updateVariables.id = String(finalData.id);
          hasId = true;
        } else {
          // Fallback: try to use productId from formData
          if (formData.productId && String(formData.productId).trim() !== '') {
            updateVariables.productId = formData.productId;
            hasId = true;
          } else if (formData.id && String(formData.id).trim() !== '') {
            updateVariables.id = String(formData.id);
            hasId = true;
          }
        }

        // Validate that we have at least one ID
        if (!hasId) {
          alert(tCatalog('alerts.missingProductId'));
          setSaving(false);
          return;
        }

        // Include catalogName only if it exists
        if (payload.catalogName) {
          updateVariables.catalogName = payload.catalogName;
        }

        // Always send variant arrays (including empty) so deletions persist in the DB.
        updateVariables.variantDefinitions = Array.isArray(payload.variantDefinitions)
          ? payload.variantDefinitions
          : [];
        updateVariables.variantOptions = Array.isArray(payload.variantOptions)
          ? payload.variantOptions
          : [];

        try {
          const data = await fetchGraphQL<{ updateProduct: Product }>(UPDATE_PRODUCT_MUTATION, updateVariables);
          savedProduct = data.updateProduct;
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : tCatalog('alerts.updateFailed');
          setVariantGuardModal({
            title: tCatalog('variantGuard.updateBlocked'),
            message: errorMessage,
          });
          setSaving(false);
          return;
        }
      } else if (currentMode === 'edit') {
        alert(tCatalog('alerts.cannotEditMissingId'));
        setSaving(false);
        return;
      }

      if (savedProduct) {
        if (status === 'Published') {
          let publishedOnMarketplace = false;
          try {
            const marketplaceResult = await fetchGraphQL<{
              publishMarketplaceProduct: { success: boolean; message: string };
            }>(MARKETPLACE_STATUS_MUTATION, {
              userId: user.id,
              productId: savedProduct.productId,
              action: 'publish',
            });

            if (!marketplaceResult?.publishMarketplaceProduct?.success) {
              throw new Error(
                marketplaceResult?.publishMarketplaceProduct?.message || tMarketplace('publishFailed'),
              );
            }
            publishedOnMarketplace = true;
            savedProduct = { ...savedProduct, status: 'Published' as const };
          } finally {
            if (!publishedOnMarketplace && !wasAlreadyPublished) {
              try {
                await fetchGraphQL(MARKETPLACE_STATUS_MUTATION, {
                  userId: user.id,
                  productId: savedProduct.productId,
                  action: 'unpublish',
                });
              } catch {
                // Best-effort restore; the original publish error is what we surface.
              }
            }
          }
        }
        
        if (currentMode === 'edit' || (currentMode === 'add' && status === 'Published')) {
          const nextFormData: ProductFormData = {
            ...formData,
            ...finalData,
            id: savedProduct.id ?? formData.id,
            productId: savedProduct.productId || formData.productId,
            status,
          };
          setFormData(nextFormData);
          setOriginalFormData(JSON.parse(JSON.stringify(nextFormData)));
          // Keep local variation state aligned with what we persisted (including clears).
          setVariants(
            validVariants.length > 0
              ? validVariants
              : [
                  {
                    id: 'variant-1',
                    variantType: '',
                    moq: undefined,
                    options: [{ id: 'option-1', name: '' }],
                  },
                ],
          );
          setCombinations(
            combinationsForPayload.length > 0
              ? combinationsForPayload
              : [
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
                ],
          );
          prevProductStatusRef.current = status;
          showSuccessNotice(status === 'Published' ? 1200 : 800);
        } else if (onSave) {
          onSave(savedProduct);
        } else {
          // Navigate back to products page for add mode
          router.push('/products');
        }
      }
    } catch (error) {
      alert(error instanceof Error ? error.message : tCatalog('alerts.saveError'));
    } finally {
      setSaving(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await handleSubmitWithStatus('Published');
  };

  const handleCancel = () => {
    if (originalFormData) {
      setFormData(JSON.parse(JSON.stringify(originalFormData)));
      // hasUnsavedChanges will be false after formData matches originalFormData
    }
  };

  const isViewMode = currentMode === 'view';
  const isEditMode = currentMode === 'edit';

  // Per-retailer offers no longer rewrite base catalog price — keep price editing unlocked
  const isOfferConnected = false;
  const customOfferClientCount = Number(
    (product as { customOfferClientCount?: number } | null | undefined)?.customOfferClientCount ?? 0,
  );

  return (
    <div className="w-full mx-auto bg-white rounded-lg border border-[#e6e6e6]">
      {/* Header */}
      <div className="flex flex-col gap-3 border-b border-[#e6e6e6] p-4 @5xl/main:flex-row @5xl/main:items-center @5xl/main:justify-between">
        <div className="flex min-w-0 flex-col gap-3 @3xl/main:flex-row @3xl/main:items-center">
          <button
            onClick={() => {
              if (currentMode === 'edit' && hasUnsavedChanges) {
                if (confirm(tCatalog('header.confirmLeave'))) {
                  router.push('/products');
                }
              } else {
                router.push('/products');
              }
            }}
            className="flex w-full shrink-0 items-center justify-center gap-2 rounded-lg px-3 py-2 text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-800 @3xl/main:w-auto @3xl/main:justify-start"
          >
            <ArrowLeft className="h-4 w-4" />
            {tCatalog('header.back')}
          </button>
          <div className="flex min-w-0 flex-wrap items-center gap-3">
            <h1 className="truncate text-2xl font-bold text-gray-900">
              {currentMode === 'add' && tCatalog('header.addNewProduct')}
              {currentMode === 'view' && tCatalog('header.productDetails')}
              {currentMode === 'edit' && tCatalog('header.editProduct')}
            </h1>
            {currentMode === 'view' && currentProductStatus === 'Published' && (
              <span className="rounded-full bg-green-100 px-3 py-1 text-sm font-semibold text-green-600">
                {translateStatus('Published')}
              </span>
            )}
            {customOfferClientCount > 0 && (
              <span className="rounded-full bg-blue-100 px-3 py-1 text-sm font-semibold text-blue-700">
                {tShared.has('customOfferClients')
                  ? tShared('customOfferClients', { count: String(customOfferClientCount) })
                  : `${customOfferClientCount} clients have custom rates`}
              </span>
            )}
            {currentMode === 'edit' && hasUnsavedChanges && (
              <span className="text-sm font-medium text-orange-600">• {tCatalog('header.unsavedChanges')}</span>
            )}
          </div>
        </div>
        <div className="flex w-full min-w-0 flex-col gap-2 @4xl/main:flex-row @4xl/main:flex-wrap @4xl/main:items-center @5xl/main:w-auto">
          {currentMode === 'view' && currentProductStatus === 'Published' && (
            <>
              <button
                type="button"
                onClick={handleUnpublish}
                disabled={saving}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-orange-600 px-4 py-2 font-semibold text-white transition-colors hover:bg-orange-700 disabled:cursor-not-allowed disabled:opacity-50 @4xl/main:w-auto"
              >
                {saving ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    {tCatalog('header.delisting')}
                  </>
                ) : (
                  <>
                    <X className="w-4 h-4" />
                    {tCatalog('header.unpublish')}
                  </>
                )}
              </button>
            </>
          )}
          {currentMode === 'add' && (
            <>
              <button
                type="button"
                onClick={() => router.push('/products')}
                disabled={saving}
                className="flex w-full items-center justify-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-gray-600 transition-colors hover:bg-gray-100 hover:text-black disabled:cursor-not-allowed disabled:opacity-50 @4xl/main:w-auto"
              >
                <X className="h-4 w-4" />
                {tCatalog('header.cancel')}
              </button>
              <button
                type="button"
                onClick={() => handleSubmitWithStatus('Draft')}
                disabled={saving}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-gray-600 px-4 py-2 font-medium text-white transition-colors hover:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-50 @4xl/main:w-auto"
              >
                {saving ? (
                  <>
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"></div>
                    {tCatalog('header.saving')}
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4" />
                    {tCatalog('header.saveDraft')}
                  </>
                )}
              </button>
              <button
                type="submit"
                form="product-form"
                disabled={saving || !validation.isValid}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#0a61d7] px-4 py-2 font-semibold text-white transition-colors hover:bg-[#0851b8] disabled:cursor-not-allowed disabled:opacity-50 @4xl/main:w-auto"
                title={!validation.isValid ? tCatalog('header.missingRequiredFields', { fields: validation.missingFields.join(', ') }) : ''}
              >
                {saving ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    {tCatalog('header.saving')}
                  </>
                ) : (
                  <>
                    <CheckCircle className="w-5 h-5" />
                    {tCatalog('header.saveAndPublish')}
                  </>
                )}
              </button>
            </>
          )}
          {currentMode === 'edit' && currentProductStatus !== 'Published' && (
            <>
              <button
                type="button"
                onClick={handleCancel}
                disabled={!hasUnsavedChanges || saving}
                className="flex w-full items-center justify-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-gray-600 transition-colors hover:bg-gray-100 hover:text-black disabled:cursor-not-allowed disabled:opacity-50 @4xl/main:w-auto"
              >
                <X className="h-4 w-4" />
                {tCatalog('header.cancel')}
              </button>
              <button
                type="button"
                onClick={() => handleSubmitWithStatus('Draft')}
                disabled={saving}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-gray-600 px-4 py-2 font-medium text-white transition-colors hover:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-50 @4xl/main:w-auto"
              >
                {saving ? (
                  <>
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"></div>
                    {tCatalog('header.saving')}
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4" />
                    {tCatalog('header.saveDraft')}
                  </>
                )}
              </button>
              <button
                type="submit"
                form="product-form"
                disabled={saving || !validation.isValid}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#0a61d7] px-4 py-2 font-semibold text-white transition-colors hover:bg-[#084ba6] disabled:cursor-not-allowed disabled:opacity-50 @4xl/main:w-auto"
                title={!validation.isValid ? tCatalog('header.missingRequiredFields', { fields: validation.missingFields.join(', ') }) : ''}
              >
                {saving ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    {tCatalog('header.saving')}
                  </>
                ) : (
                  <>
                    <CheckCircle className="w-4 h-4" />
                    {tCatalog('header.saveAndPublish')}
                  </>
                )}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Mode Descriptions */}
      <div className="px-4 py-3 bg-gray-50 border-b border-[#e6e6e6]">
        {currentMode === 'add' && (
          <p className="text-sm text-gray-600">
            {tCatalog('modeDescriptions.add')}
          </p>
        )}
        {currentMode === 'view' && (
          <>
            <p className="text-sm text-gray-600">
              {tCatalog('modeDescriptions.view')}
            </p>
            {currentProductStatus === 'Published' && (
              <div className="mt-2 flex gap-2 px-3 py-2 bg-orange-50 border border-orange-200 rounded-lg">
                <Info className="w-4 h-4 text-orange-600 mt-0.5 shrink-0" />
                <span className="text-sm text-orange-700 font-medium">
                  {tCatalog('header.unpublishHint')}
                </span>
              </div>
            )}
          </>
        )}
        {currentMode === 'edit' && (
          <p className="text-sm text-gray-600">
            {tCatalog('modeDescriptions.edit')}
          </p>
        )}
      </div>

      {/* Profile Completion Progress */}
      {(currentMode === 'view' || currentMode === 'edit' || currentMode === 'add') && (
        <div className="mx-4 mt-4 mb-4 p-4 bg-gradient-to-r from-blue-50 to-amber-50 border border-blue-200 rounded-lg">
          {(() => {
            const completion = getProductCompletion(formData, combinations, userCurrency, CATALOG_COMPLETION_OPTIONS);
            const { completionPercentage, completedCount, totalFields, missingFieldKeys } = completion;
            
            return (
              <>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-semibold text-gray-800">{tCatalog('completion.title')}</h3>
                  <span className={`text-sm font-bold ${completionPercentage === 100 ? 'text-green-600' : 'text-amber-700'}`}>
                    {completionPercentage}%
                  </span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2 mb-2">
                  <div 
                    className={`h-2 rounded-full transition-all duration-300 ${
                      completionPercentage === 100 ? 'bg-green-500' : 'bg-amber-500'
                    }`}
                    style={{ width: `${completionPercentage}%` }}
                  ></div>
                </div>
                <div className="text-xs text-gray-600">
                  {tCatalog('completion.fieldsCompleted', { completed: completedCount, total: totalFields })}
                  {missingFieldKeys.length > 0 && (
                    <span className="ml-2 text-amber-700">
                      • {tCatalog('completion.missing', { fields: missingFieldKeys.map(key => translateFieldName(key)).join(', ') })}
                    </span>
                  )}
                </div>
              </>
            );
          })()}
        </div>
      )}

      <form id="product-form" onSubmit={handleSubmit} className="p-4">
        {/* 3-Row Layout */}
        <div className="space-y-4">
          
          {/* Row 1: General Information - Full Width */}
          <div className="bg-white rounded-lg border border-[#e6e6e6] p-4">
            <h2 className="text-md font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <Package className="w-5 h-5 text-gray-500" />
              {tCatalog('generalInfo.title')}
            </h2>
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-4 @3xl/main:grid-cols-2 @5xl/main:grid-cols-4">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-2">
                    {tCatalog('generalInfo.productId')}
                  </label>
                  <input
                    type="text"
                    value={formData.productId || ''}
                    disabled={true}
                    className="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0a61d7] focus:border-transparent disabled:bg-gray-50 text-black"
                    placeholder={tCatalog('generalInfo.productIdPlaceholder')}
                  />
                  {currentMode === 'add' && (
                    <p className="text-xs text-gray-500 mt-1">{tCatalog('generalInfo.productIdHint')}</p>
                  )}
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-2">
                    {tCatalog('generalInfo.sku')}
                  </label>
                  <input
                    type="text"
                    value={formData.sku}
                    onChange={(e) => handleInputChange('sku', e.target.value)}
                    disabled={isViewMode}
                    className="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0a61d7] focus:border-transparent disabled:bg-gray-50 text-black"
                    placeholder={tCatalog('generalInfo.skuPlaceholder')}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-2">
                    {tCatalog('generalInfo.brand')}
                  </label>
                  <input
                    type="text"
                    value={formData.brand}
                    onChange={(e) => handleInputChange('brand', e.target.value)}
                    disabled={isViewMode}
                    className="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0a61d7] focus:border-transparent disabled:bg-gray-50 text-black"
                    placeholder={tCatalog('generalInfo.brandPlaceholder')}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-2">
                    {tCatalog('generalInfo.type')}
                  </label>
                  <div className="relative" ref={generalCategoryRef}>
                    <button
                      type="button"
                      onClick={() => {
                        setShowGeneralCategoryDropdown(!showGeneralCategoryDropdown);
                        setShowCatalogCategoryDropdown(false);
                      }}
                      disabled={isViewMode}
                      className="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0a61d7] focus:border-transparent disabled:bg-gray-50 text-black text-left flex items-center justify-between"
                    >
                      <span className="flex items-center gap-2">
                        {formData.productType ? (
                          <>
                            {(() => {
                              const selectedCategory = getSelectedCategory(formData.productType);
                              return (
                                <CategoryTypeGlyph
                                  value={formData.productType}
                                  color={selectedCategory?.color}
                                />
                              );
                            })()}
                            <span className="text-black">{translateCategory(formData.productType)}</span>
                          </>
                        ) : (
                          <span className="text-gray-500">{tCatalog('generalInfo.selectCategory')}</span>
                        )}
                      </span>
                      <ChevronDown className="w-4 h-4 text-gray-400" />
                    </button>
                    
                    {showGeneralCategoryDropdown && !isViewMode && (
                      <div className="absolute z-50 w-full mt-1 bg-white border border-[#e6e6e6] rounded-lg shadow-lg max-h-60 overflow-y-auto">
                        {availableCategories.map((category) => {
                          return (
                            <button
                              key={category.value}
                              type="button"
                              onClick={() => handleCategorySelect(category.value, 'productType')}
                              className="w-full px-3 py-2 text-xs text-left hover:bg-gray-100 flex items-center gap-2"
                            >
                              <CategoryTypeGlyph value={category.value} color={category.color} />
                              <span className="text-black">{translateCategory(category.value)}</span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-2">
                    {tCatalog('generalInfo.productName')}
                  </label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => handleInputChange('name', e.target.value)}
                    disabled={isViewMode}
                    className="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0a61d7] focus:border-transparent disabled:bg-gray-50 text-black"
                    placeholder={tCatalog('generalInfo.productNamePlaceholder')}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-2">
                    {tCatalog('generalInfo.supplier')}
                  </label>
                  <input
                    type="text"
                    value={formData.supplier}
                    onChange={(e) => handleInputChange('supplier', e.target.value)}
                    disabled={isViewMode}
                    className="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0a61d7] focus:border-transparent disabled:bg-gray-50 text-black"
                    placeholder={tCatalog('generalInfo.supplierPlaceholder')}
                  />
                </div>
              </div>
              
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-2">
                  {tCatalog('generalInfo.productDescription')}
                </label>
                <textarea
                  value={formData.description}
                  onChange={(e) => handleInputChange('description', e.target.value)}
                  disabled={isViewMode}
                  rows={3}
                  className="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0a61d7] focus:border-transparent disabled:bg-gray-50 text-black"
                  placeholder={tCatalog('generalInfo.productDescriptionPlaceholder')}
                />
              </div>

              {/* Product Assurance */}
              <div>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <label className="flex items-center gap-2 text-xs text-gray-700">
                    <button
                      type="button"
                      disabled={isViewMode}
                      onClick={() => handleInputChange('halalCertified', !formData.halalCertified)}
                      className={`w-4 h-4 border-2 rounded transition-all duration-200 flex items-center justify-center ${
                        formData.halalCertified
                          ? 'bg-green-500 border-green-500'
                          : 'bg-white border-gray-300 hover:border-green-400'
                      } ${isViewMode ? 'opacity-60 cursor-not-allowed' : ''}`}
                    >
                      {formData.halalCertified && (
                        <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                      )}
                    </button>
                    <span>{tCatalog('generalInfo.halalCertified')}</span>
                  </label>
                  <label className="flex items-center gap-2 text-xs text-gray-700">
                    <button
                      type="button"
                      disabled={isViewMode}
                      onClick={() => handleInputChange('bpomApproved', !formData.bpomApproved)}
                      className={`w-4 h-4 border-2 rounded transition-all duration-200 flex items-center justify-center ${
                        formData.bpomApproved
                          ? 'bg-green-500 border-green-500'
                          : 'bg-white border-gray-300 hover:border-green-400'
                      } ${isViewMode ? 'opacity-60 cursor-not-allowed' : ''}`}
                    >
                      {formData.bpomApproved && (
                        <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                      )}
                    </button>
                    <span>{tCatalog('generalInfo.bpomApproved')}</span>
                  </label>
                  <label className="flex items-center gap-2 text-xs text-gray-700">
                    <button
                      type="button"
                      disabled={isViewMode}
                      onClick={() => handleInputChange('originalProduct', !formData.originalProduct)}
                      className={`w-4 h-4 border-2 rounded transition-all duration-200 flex items-center justify-center ${
                        formData.originalProduct
                          ? 'bg-green-500 border-green-500'
                          : 'bg-white border-gray-300 hover:border-green-400'
                      } ${isViewMode ? 'opacity-60 cursor-not-allowed' : ''}`}
                    >
                      {formData.originalProduct && (
                        <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                      )}
                    </button>
                    <span>{tCatalog('generalInfo.originalProduct')}</span>
                  </label>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-2">{tCatalog('generalInfo.returnPolicyDays')}</label>
                    <input
                      type="number"
                      min="0"
                      value={formData.returnPolicyDays ?? 7}
                      onChange={(e) => handleInputChange('returnPolicyDays', parseInt(e.target.value) || 0)}
                      disabled={isViewMode}
                      className="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0a61d7] focus:border-transparent disabled:bg-gray-50 text-black"
                      placeholder={tCatalog('generalInfo.returnPolicyPlaceholder')}
                    />
                  </div>
                </div>
              </div>

              {/* Buy X Get Y Promotion Notice */}
              {product?.promotionDetails && (
                <div className="mt-4 rounded-lg border border-gray-200 bg-white p-4">
                  <div className="flex items-start gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-purple-50 ring-1 ring-purple-100">
                      <Gift className="h-4 w-4 text-purple-600" strokeWidth={1.75} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                        <h4 className="text-sm font-semibold text-gray-900">
                          {tCatalog('generalInfo.promotionTitle')}
                        </h4>
                        <div className="flex items-center gap-2 text-xs text-gray-600">
                          <span className="inline-flex items-center gap-1.5 rounded-md border border-gray-200 bg-gray-50 px-2 py-0.5">
                            <span className="text-gray-500">{tCatalog('generalInfo.promotionBuy')}</span>
                            <span className="font-semibold text-gray-900">
                              {tCatalog('generalInfo.promotionBuyItems', { count: product.promotionDetails.minQuantity })}
                            </span>
                          </span>
                          <span className="text-gray-300" aria-hidden>
                            →
                          </span>
                          <span className="inline-flex items-center gap-1.5 rounded-md border border-purple-100 bg-purple-50 px-2 py-0.5">
                            <span className="text-purple-600">{tCatalog('generalInfo.promotionGetFree')}</span>
                            <span className="font-semibold text-purple-700">
                              {product.promotionDetails.freeQuantity > 1
                                ? tCatalog('generalInfo.promotionFreeItems', { count: product.promotionDetails.freeQuantity })
                                : tCatalog('generalInfo.promotionFreeItem', { count: product.promotionDetails.freeQuantity })}
                            </span>
                          </span>
                        </div>
                      </div>
                      <p className="mt-2 text-xs text-gray-500">
                        <span className="font-medium text-gray-700">{tCatalog('generalInfo.promotionNoteLabel')}</span>{' '}
                        {product.promotionDetails.freeQuantity > 1
                          ? tCatalog('generalInfo.promotionHintPlural', {
                              minQuantity: product.promotionDetails.minQuantity,
                              freeQuantity: product.promotionDetails.freeQuantity,
                            })
                          : tCatalog('generalInfo.promotionHint', {
                              minQuantity: product.promotionDetails.minQuantity,
                              freeQuantity: product.promotionDetails.freeQuantity,
                            })}
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Row 2: Upload Images (3/4) + Product Settings (1/4) */}
          <div className="grid grid-cols-1 gap-4 @5xl/main:grid-cols-5">
            {/* Upload Images - 3/4 width */}
            <div className="@5xl/main:col-span-3 bg-white rounded-lg border border-[#e6e6e6] p-4">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-md font-semibold text-gray-900 flex items-center gap-2">
                  <Upload className="w-5 h-5 text-gray-500" />
                  {tCatalog('images.title')}
                </h2>
                {!isViewMode && formData.images.length > 0 && (
                  <button
                    type="button"
                    onClick={clearAllImages}
                    className="text-xs text-red-500 hover:text-red-700 font-medium"
                  >
                    {tCatalog('images.clearAll')}
                  </button>
                )}
              </div>
              
              <div className="flex gap-4">
                {/* Main Image - Right side */}
                <div className="flex-1">
                  <div 
                    className={`w-full h-64 bg-gray-100 rounded-lg border-2 border-dashed transition-colors ${
                      isDragOver 
                        ? 'border-[#0a61d7] bg-blue-50' 
                        : 'border-gray-300'
                    } flex items-center justify-center relative overflow-hidden`}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                  >
                    {formData.images.length > 0 ? (
                      <div className="relative w-full h-full">
                        <img 
                          src={formData.images[0]} 
                          alt={tCatalog('images.mainProductAlt')} 
                          className="w-full h-full object-cover rounded-lg"
                        />
                        {!isViewMode && (
                          <button
                            type="button"
                            onClick={() => removeImage(0)}
                            className="absolute top-2 right-2 w-8 h-8 bg-red-500 text-white rounded-full flex items-center justify-center hover:bg-red-600 transition-colors z-10"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    ) : (
                      <div className="text-center">
                        <Upload className={`w-12 h-12 mx-auto mb-2 ${isDragOver ? 'text-[#0a61d7]' : 'text-gray-400'}`} />
                        <p className={`font-medium ${isDragOver ? 'text-[#0a61d7]' : 'text-gray-500'}`}>
                          {isDragOver ? tCatalog('images.dropHere') : tCatalog('images.dragOrClick')}
                        </p>
                        <p className="text-xs text-gray-400 mt-1">{tCatalog('images.supportedFormats')}</p>
                      </div>
                    )}
                    
                    {/* Hidden file input for click upload */}
                    <input
                      type="file"
                      multiple
                      accept="image/*"
                      onChange={handleFileInput}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                      disabled={isViewMode}
                    />
                  </div>
                </div>
                
                {/* Thumbnail Images - Left side, horizontal */}
                <div className="w-32 space-y-2">
                  <div className="text-xs text-gray-500 mb-2">{tCatalog('images.additionalImages')}</div>
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {formData.images.slice(1).map((image, index) => (
                      <div 
                        key={index} 
                        className="relative w-28 h-20 bg-gray-100 rounded-lg border border-[#e6e6e6] overflow-hidden cursor-move transition-shadow"
                        draggable={!isViewMode}
                        onDragStart={(e) => {
                          if (!isViewMode) {
                            e.dataTransfer.setData('text/plain', String(index + 1));
                          }
                        }}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={(e) => {
                          if (!isViewMode) {
                            e.preventDefault();
                            const fromIndex = parseInt(e.dataTransfer.getData('text/plain'));
                            const toIndex = index + 1;
                            reorderImages(fromIndex, toIndex);
                          }
                        }}
                      >
                        <img src={image} alt={tCatalog('images.productAlt', { index: index + 2 })} className="w-full h-full object-cover" />
                        {!isViewMode && (
                          <>
                            <button
                              type="button"
                              onClick={() => removeImage(index + 1)}
                              className="absolute top-1 right-1 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center hover:bg-red-600 transition-colors"
                            >
                              <X className="w-3 h-3" />
                            </button>
                            <div className="absolute bottom-1 left-1 w-5 h-5 bg-gray-800 bg-opacity-70 text-white text-xs rounded-full flex items-center justify-center">
                              {index + 2}
                            </div>
                          </>
                        )}
                      </div>
                    ))}
                    
                    {/* Add more images button */}
                    {!isViewMode && formData.images.length < 10 && (
                      <div className="relative">
                        <div className="w-28 h-20 bg-gray-100 border-2 border-dashed border-gray-300 rounded-lg flex items-center justify-center hover:border-[#0a61d7] transition-colors">
                          <Plus className="w-6 h-6 text-gray-400" />
                        </div>
                        <input
                          type="file"
                          multiple
                          accept="image/*"
                          onChange={handleFileInput}
                          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                        />
                      </div>
                    )}
                  </div>
                </div>
              </div>
              
              {/* Upload Progress */}
              {uploadingImages && (
                <div className="flex items-center gap-2 text-sm text-gray-600 mt-4">
                  <div className="w-4 h-4 border-2 border-gray-300 border-t-[#0a61d7] rounded-full animate-spin"></div>
                  <span>{tCatalog('images.uploading')}</span>
                </div>
              )}
              {/* Image Count Info */}
              <div className="flex items-center justify-between mt-4">
                <div className="text-xs text-gray-500">
                  {tCatalog('images.countUploaded', { count: formData.images.length })}
                </div>
              </div>
            </div>

            {/* Product Settings - 1/4 width */}
            <div className="@5xl/main:col-span-2 bg-white rounded-lg border border-[#e6e6e6] p-4">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-md font-semibold text-gray-900 flex items-center gap-2">
                  <Tag className="w-5 h-5 text-gray-500" />
                  {tCatalog('settings.title')}
                </h2>
              </div>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-2">
                    {tCatalog('settings.productType')}
                  </label>
                  <div className="relative" ref={catalogCategoryRef}>
                    <button
                      type="button"
                      onClick={() => {
                        setShowCatalogCategoryDropdown(!showCatalogCategoryDropdown);
                        setShowGeneralCategoryDropdown(false);
                      }}
                      disabled={isViewMode}
                      className="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0a61d7] focus:border-transparent disabled:bg-gray-50 text-black text-left flex items-center justify-between"
                    >
                      <span className="flex items-center gap-2">
                        {formData.productType ? (
                          <>
                            {(() => {
                              const selectedCategory = getSelectedCategory(formData.productType);
                              return (
                                <CategoryTypeGlyph
                                  value={formData.productType}
                                  color={selectedCategory?.color}
                                />
                              );
                            })()}
                            <span className="text-black">{translateCategory(formData.productType)}</span>
                          </>
                        ) : (
                          <span className="text-gray-500">{tCatalog('generalInfo.selectCategory')}</span>
                        )}
                      </span>
                      <ChevronDown className="w-4 h-4 text-gray-400" />
                    </button>
                    
                    {showCatalogCategoryDropdown && !isViewMode && (
                      <div className="absolute z-50 w-full mt-1 bg-white border border-[#e6e6e6] rounded-lg shadow-lg max-h-40 overflow-y-auto">
                        {availableCategories.map((category) => {
                          return (
                            <button
                              key={category.value}
                              type="button"
                              onClick={() => handleCategorySelect(category.value, 'productType')}
                              className="w-full px-3 py-2 text-xs text-left hover:bg-gray-100 flex items-center gap-2"
                            >
                              <CategoryTypeGlyph value={category.value} color={category.color} />
                              <span className="text-black">{translateCategory(category.value)}</span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
                
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-2">
                    {tCatalog('settings.productCategoryByChannel')}
                  </label>
                  <input
                    type="text"
                    value={formData.productCategory}
                    onChange={(e) => handleInputChange('productCategory', e.target.value)}
                    disabled={isViewMode}
                    className="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0a61d7] focus:border-transparent disabled:bg-gray-50 text-black"
                    placeholder={tCatalog('settings.productCategoryPlaceholder')}
                  />
                </div>
                
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-2">
                    {tCatalog('settings.catalogName')}
                  </label>
                  <input
                    type="text"
                    value={formData.catalogName}
                    onChange={(e) => handleInputChange('catalogName', e.target.value)}
                    disabled={isViewMode}
                    className="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0a61d7] focus:border-transparent disabled:bg-gray-50 text-black"
                    placeholder={tCatalog('settings.catalogNamePlaceholder')}
                  />
                </div>
                
                <div className="text-xs text-gray-500 italic pt-2 border-t border-[#e6e6e6]">
                  {tCatalog('settings.filterHint')}
                </div>
              </div>
            </div>
          </div>

          {/* Row 3: Product Stock Summary - Full Width */}
          <div className="bg-white rounded-lg border border-[#e6e6e6] p-4">
            <div className="mb-6">
              <h2 className="text-md font-semibold text-gray-900 flex items-center gap-2 mb-4">
                <Package className="w-5 h-5 text-gray-500" />
                {tCatalog('stockSummary.title')}
                <span className="text-xs text-gray-500 font-normal">{tCatalog('stockSummary.computedFromVariants')}</span>
              </h2>
              
              {/* Product-Level Stock Summary (Read-Only) */}
              <div className="p-4 bg-gray-50 rounded-lg">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-2">
                      {tCatalog('stockSummary.totalStock')}
                    </label>
                    <div className="px-3 py-2 text-xs border border-gray-300 rounded-lg bg-white text-gray-900 font-medium">
                      {combinations.reduce((sum, combo) => sum + combo.stockQuantity, 0).toLocaleString()}
                    </div>
                    <p className="text-xs text-gray-500 mt-1">{tCatalog('stockSummary.totalStockHint')}</p>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-2">
                      {tCatalog('stockSummary.lowStockThreshold')}
                    </label>
                    <div className="px-3 py-2 text-xs border border-gray-300 rounded-lg bg-white text-gray-900 font-medium">
                      {combinations.reduce((sum, combo) => sum + combo.lowStockThreshold, 0).toLocaleString()}
                    </div>
                    <p className="text-xs text-gray-500 mt-1">{tCatalog('stockSummary.lowStockThresholdHint')}</p>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-2">
                      {tCatalog('stockSummary.overallStatus')}
                    </label>
                    {(() => {
                      const overallStatus = getProductStockStatus(combinations);
                      return (
                    <div className={`px-3 py-2 text-xs border rounded-lg font-medium ${
                      overallStatus === 'Out of Stock'
                        ? 'bg-red-50 border-red-200 text-red-800'
                        : overallStatus === 'Low Stock'
                        ? 'bg-yellow-50 border-yellow-200 text-yellow-800'
                        : 'bg-green-50 border-green-200 text-green-800'
                    }`}>
                      {translateStockStatus(overallStatus)}
                    </div>
                      );
                    })()}
                    <p className="text-xs text-gray-500 mt-1">{tCatalog('stockSummary.overallStatusHint')}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Product Variants Section */}
            <div className="border-t border-[#e6e6e6] pt-6">
              <div className="mb-4">
                {isOfferConnected && (
                  <div className="mb-3 p-3 bg-blue-50 border border-blue-200 rounded">
                    <div className="flex items-start gap-2">
                      <Info className="w-4 h-4 text-[#0a61d7]" />
                      <div className="text-xs text-[#0a61d7]">
                        {tCatalog('variants.offerLockedVariants')}
                      </div>
                    </div>
                  </div>
                )}
                <h2 className="text-md font-semibold text-gray-900 flex items-center gap-2">
                  <DollarSign className="w-5 h-5 text-gray-500" />
                  {tCatalog('variants.title')}
                  <span className="relative group inline-flex items-center">
                    <Info
                      tabIndex={0}
                      aria-describedby="product-variants-info-tooltip"
                      aria-label={tCatalog('variants.infoAriaLabel')}
                      className="w-4 h-4 text-gray-400 hover:text-gray-600 cursor-help focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0a61d7]/40 rounded"
                    />
                    <span
                      id="product-variants-info-tooltip"
                      role="tooltip"
                      className="pointer-events-none absolute left-1/2 top-full z-10 mt-2 w-[380px] -translate-x-1/2 rounded-lg border border-gray-200 bg-white p-3 leading-5 text-gray-700 shadow-xl opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
                    >
                      <span className="block text-xs font-semibold text-gray-900 mb-1.5">
                        {tCatalog('variants.tooltipTitle')}
                      </span>
                      <ol className="list-decimal list-inside space-y-1 text-xs text-gray-700">
                        <li>{tCatalog('variants.tooltipStep1')}</li>
                        <li>{tCatalog('variants.tooltipStep2')}</li>
                        <li>{tCatalog('variants.tooltipStep3')}</li>
                      </ol>
                      <p className="mt-2 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded px-2 py-1.5">
                        {tCatalog('variants.tooltipWarning')}
                      </p>
                      <p className="mt-2 text-[11px] text-gray-500">
                        {tCatalog('variants.tooltipFooter')}
                      </p>
                    </span>
                  </span>
                </h2>
              </div>

            {/* Simplified Variants Input */}
            <div className="space-y-4 mb-6">
              {variants.map((variant, index) => (
                <div key={variant.id} className="border border-[#e6e6e6] rounded-lg bg-white p-4">
                  <div className="flex items-start justify-between gap-4 mb-4">
                    <div className="flex items-center gap-4 flex-1">
                      <div className="w-48">
                        <label className="block text-xs font-medium text-gray-700 mb-1">
                          {tCatalog('variants.variantType')}
                        </label>
                        <input
                          type="text"
                          value={(variantDrafts.find((v) => v.id === variant.id)?.variantType ?? variant.variantType) as string}
                          onChange={(e) => updateVariant(variant.id, 'variantType', e.target.value)}
                          onFocus={(e) => {
                            guardVariantTypeEditOnFocus(variant.id).then((blocked) => {
                              if (blocked) (e.target as HTMLInputElement).blur();
                            });
                          }}
                          onBlur={() => commitVariantTypeRename(variant.id)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              commitVariantTypeRename(variant.id);
                            }
                          }}
                          disabled={isViewMode || isOfferConnected}
                          className="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0a61d7] focus:border-transparent disabled:bg-gray-50 text-black font-semibold"
                          placeholder={tCatalog('variants.variantTypePlaceholder')}
                        />
                      </div>
                    </div>
                {!isViewMode && !isOfferConnected && (
                      <div className="flex items-center gap-2">
                        {index > 0 && (
                  <button
                    type="button"
                            onClick={() => {
                              setVariants(prev => {
                                const arr = [...prev];
                                const [moved] = arr.splice(index, 1);
                                arr.splice(index - 1, 0, moved);
                                return arr;
                              });
                            }}
                            className="text-gray-600 hover:text-black p-1"
                            title={tCatalog('variants.moveUp')}
                          >
                            <ChevronUp className="w-4 h-4" />
                  </button>
                )}
                        {index < variants.length - 1 && (
                          <button
                            type="button"
                            onClick={() => {
                              setVariants(prev => {
                                const arr = [...prev];
                                const [moved] = arr.splice(index, 1);
                                arr.splice(index + 1, 0, moved);
                                return arr;
                              });
                            }}
                            className="text-gray-600 hover:text-black p-1"
                            title={tCatalog('variants.moveDown')}
                          >
                            <ChevronDown className="w-4 h-4" />
                          </button>
                        )}
                        {variants.length > 1 && index > 0 && (
                        <button
                          type="button"
                            onClick={() => removeVariant(variant.id)}
                          className="text-red-500 hover:text-red-700 p-1"
                            title={tCatalog('variants.removeVariant')}
                        >
                          <X className="w-4 h-4" />
                        </button>
                        )}
                      </div>
                      )}
                    </div>
                    
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-2">
                      {tCatalog('variants.options')}
                        </label>
                    <div className="flex flex-wrap gap-2">
                      {variant.options.map((option, optionIndex) => (
                        <div key={option.id} className="flex items-center gap-1">
                        <input
                          type="text"
                            value={
                              (variantDrafts
                                .find((v) => v.id === variant.id)
                                ?.options.find((o) => o.id === option.id)?.name ?? option.name) as string
                            }
                            onChange={(e) => updateVariantOption(variant.id, option.id, 'name', e.target.value)}
                            onFocus={(e) => {
                              guardVariantOptionEditOnFocus(variant.id, option.id).then((blocked) => {
                                if (blocked) (e.target as HTMLInputElement).blur();
                              });
                            }}
                            onBlur={() => commitVariantOptionRename(variant.id, option.id)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                commitVariantOptionRename(variant.id, option.id);
                              }
                            }}
                          disabled={isViewMode || isOfferConnected}
                            className="px-3 py-2 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0a61d7] focus:border-transparent disabled:bg-gray-50 text-black"
                            placeholder={tCatalog('variants.optionPlaceholder')}
                            style={{ minWidth: '120px' }}
                          />
                          {!isViewMode && !isOfferConnected && (variant.options.length > 1 || optionIndex > 0) && (
                            <button
                              type="button"
                              onClick={() => removeVariantOption(variant.id, option.id)}
                              className="text-red-500 hover:text-red-700 p-1"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          )}
                  </div>
                ))}
                {!isViewMode && !isOfferConnected && (
                  <button
                    type="button"
                          onClick={() => addVariantOption(variant.id)}
                          className="flex items-center gap-1 px-3 py-2 text-xs font-medium text-[#0a61d7] hover:text-[#0851b8] transition-colors border border-dashed border-[#0a61d7] rounded-lg"
                  >
                    <Plus className="w-4 h-4" />
                          {tCatalog('variants.addOption')}
                  </button>
                )}
              </div>
                      </div>
                    </div>
              ))}
              
              {!isViewMode && !isOfferConnected && (
                      <button
                        type="button"
                  onClick={addVariant}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 text-xs font-medium border-2 border-dashed border-gray-300 text-gray-700 rounded-lg hover:border-[#0a61d7] hover:text-[#0a61d7] transition-colors"
                      >
                  <Plus className="w-4 h-4" />
                  {tCatalog('variants.addVariantType')}
                      </button>
                    )}
                  </div>
                  
            {/* Final Combinations Table */}
            <div className="border-t border-[#e6e6e6] pt-6">
              {isOfferConnected && (
                <div className="mb-3 p-3 bg-blue-50 border border-blue-200 rounded">
                  <div className="flex items-start gap-2">
                    <Info className="w-4 h-4 text-[#0a61d7]" />
                    <div className="text-xs text-[#0a61d7]">
                      {tCatalog('variants.offerLockedPrices')}
                    </div>
                  </div>
                </div>
              )}
              <div className="mb-4">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-md font-semibold text-gray-900 flex items-center gap-2">
                    <Package className="w-5 h-5 text-gray-500" />
                    {tCatalog('variants.variationLists')}
                    <span className="relative group inline-flex items-center">
                      <Info
                        tabIndex={0}
                        aria-describedby="variation-lists-info-tooltip"
                        aria-label={tCatalog('variants.variationListsAriaLabel')}
                        className="w-4 h-4 text-gray-400 hover:text-gray-600 cursor-help focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0a61d7]/40 rounded"
                      />
                      <span
                        id="variation-lists-info-tooltip"
                        role="tooltip"
                        className="pointer-events-none absolute left-1/2 top-full z-10 mt-2 w-[380px] -translate-x-1/2 rounded-lg border border-gray-200 bg-white p-3 leading-5 text-gray-700 shadow-xl opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
                      >
                        <span className="block text-xs font-semibold text-gray-900 mb-1.5">
                          {tCatalog('variants.variationListsTooltipTitle')}
                        </span>
                        <p className="text-xs text-gray-700">
                          {tCatalog('variants.variationListsTooltipBody1')}
                        </p>
                        <p className="mt-2 text-xs text-gray-700">
                          {tCatalog('variants.variationListsTooltipBody2')}
                        </p>
                        <p className="mt-2 text-[11px] text-gray-500">
                          {tCatalog('variants.variationListsTooltipFooter')}
                        </p>
                      </span>
                    </span>
                  </h2>
                  {!isViewMode && (
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        disabled={combinations.length === 0}
                        onClick={handleExportVariationList}
                        className="inline-flex items-center gap-2 px-3 py-2 text-xs font-semibold rounded-lg bg-white text-gray-700 border border-gray-200 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                        title={tCatalog('variants.exportVariationsTitle')}
                      >
                        <Download className="w-4 h-4" />
                        {tCatalog('variants.exportVariations')}
                      </button>
                      <button
                        type="button"
                        disabled={isOfferConnected || combinations.length === 0}
                        onClick={() => setShowVariationImport(true)}
                        className="inline-flex items-center gap-2 px-3 py-2 text-xs font-semibold rounded-lg bg-white text-gray-700 border border-gray-200 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                        title={tCatalog('variants.importVariationsTitle')}
                      >
                        <Upload className="w-4 h-4" />
                        {tCatalog('variants.importVariations')}
                      </button>
                      <button
                        type="button"
                        disabled={isOfferConnected}
                        onClick={() => setVariationRefreshTick((v) => v + 1)}
                        className="inline-flex items-center gap-2 px-3 py-2 text-xs font-semibold rounded-lg bg-white text-gray-700 border border-gray-200 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                        title={tCatalog('variants.refreshTableTitle')}
                      >
                        <RefreshCw className="w-4 h-4" />
                        {tCatalog('variants.refresh')}
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Apply To All Section */}
              {!isViewMode && combinations.length > 0 && (
                <div className="bg-orange-50 rounded-lg p-4 mb-4">
                  <h3 className="text-sm font-semibold text-orange-900 mb-3">{tCatalog('variants.quickAction')}</h3>
                  <div className="flex gap-3 items-end">
                          <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">
                        {tCatalog('variants.sku')}
                            </label>
                            <input
                              type="text"
                        id="apply-sku"
                         disabled={isOfferConnected}
                         className="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent text-black disabled:bg-gray-50"
                        placeholder={tCatalog('variants.skuPlaceholder')}
                      />
                          </div>
                          <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">
                        {tCatalog('variants.sellingPrice')}
                            </label>
                      <div className="relative">
                        <div className="absolute left-3 top-1/2 transform -translate-y-1/2 text-xs text-gray-500 pointer-events-none">
                          {currencySymbol}
                        </div>
                            <input
                              type="text"
                          id="apply-selling"
                           onInput={(e) => {
                             const input = e.target as HTMLInputElement;
                             const value = input.value;
                             // Only allow numeric input (allows numbers, decimals, and empty string)
                             if (!validateNumericInput(value)) {
                               // Remove the last character if invalid
                               input.value = value.slice(0, -1);
                             }
                           }}
                           disabled={isOfferConnected}
                           className="w-full pl-8 pr-3 py-2 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent text-black disabled:bg-gray-50"
                          placeholder={getPricePlaceholder(userCurrency)}
                        />
                          </div>
                        </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">
                        {tCatalog('variants.purchasePrice')}
                      </label>
                              <div className="relative">
                        <div className="absolute left-3 top-1/2 transform -translate-y-1/2 text-xs text-gray-500 pointer-events-none">
                          {currencySymbol}
                        </div>
                                <input 
                          type="text"
                          id="apply-purchase"
                           onInput={(e) => {
                             const input = e.target as HTMLInputElement;
                             const value = input.value;
                             // Only allow numeric input (allows numbers, decimals, and empty string)
                             if (!validateNumericInput(value)) {
                               // Remove the last character if invalid
                               input.value = value.slice(0, -1);
                             }
                           }}
                           disabled={isOfferConnected}
                           className="w-full pl-8 pr-3 py-2 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent text-black disabled:bg-gray-50"
                          placeholder={getPricePlaceholder(userCurrency)}
                        />
                                </div>
                              </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">
                        {tCatalog('variants.moq')}
                              </label>
                      <input
                        type="number"
                        id="apply-moq"
                         disabled={isOfferConnected}
                         className="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent text-black disabled:bg-gray-50"
                        placeholder={tCatalog('variants.numberPlaceholder')}
                        min="0"
                      />
                            </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">
                        {tCatalog('variants.stockQty')}
                      </label>
                                <input
                                  type="number"
                        id="apply-stock"
                         disabled={isOfferConnected}
                         className="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent text-black disabled:bg-gray-50"
                        placeholder={tCatalog('variants.numberPlaceholder')}
                        min="0"
                      />
                          </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">
                        {tCatalog('variants.lowThreshold')}
                      </label>
                      <input
                        type="number"
                        id="apply-threshold"
                         disabled={isOfferConnected}
                         className="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent text-black disabled:bg-gray-50"
                        placeholder={tCatalog('variants.numberPlaceholder')}
                        min="0"
                      />
                        </div>
                    <button
                      type="button"
                      onClick={() => {
                        const sku = (document.getElementById('apply-sku') as HTMLInputElement)?.value || '';
                        const selling = (document.getElementById('apply-selling') as HTMLInputElement)?.value || '';
                        const purchase = (document.getElementById('apply-purchase') as HTMLInputElement)?.value || '';
                        const moq = (document.getElementById('apply-moq') as HTMLInputElement)?.value || '';
                        const stock = (document.getElementById('apply-stock') as HTMLInputElement)?.value || '';
                        const threshold = (document.getElementById('apply-threshold') as HTMLInputElement)?.value || '';
                        
                        setCombinations(prev => prev.map(combo => {
                          const next = {
                            ...combo,
                            sku: sku || combo.sku,
                            sellingPrice: selling || combo.sellingPrice,
                            purchasePrice: purchase || combo.purchasePrice,
                            moq: moq ? parseInt(moq) : combo.moq,
                            stockQuantity: stock ? parseInt(stock) : combo.stockQuantity,
                            lowStockThreshold: threshold ? parseInt(threshold) : combo.lowStockThreshold,
                          };
                          return {
                            ...next,
                            stockStatus: getVariantStockStatus(next.stockQuantity, next.lowStockThreshold),
                          };
                        }));
                      }}
                       disabled={isOfferConnected}
                       className="bg-orange-500 text-white px-6 py-2 text-sm font-semibold rounded-lg hover:bg-orange-600 transition-colors whitespace-nowrap disabled:bg-orange-300 disabled:cursor-not-allowed"
                    >
                      {tCatalog('variants.applyToAll')}
                    </button>
                      </div>
                    </div>
              )}
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse border border-gray-300">
                    <thead className="bg-gray-50">
                      <tr>
                        {variants.map((variant, index) => (
                          <th key={variant.id} className="w-25 text-xs font-semibold text-gray-700 p-3 text-left border-b border-r border-gray-300">
                            {variant.variantType || tCatalog('variants.varFallback', { index: index + 1 })}
                          </th>
                        ))}
                        <th className="text-xs font-semibold text-gray-700 p-3 text-left border-b border-r border-gray-300">
                          {tCatalog('variants.sku')}
                        </th>
                        <th className="text-xs font-semibold text-gray-700 p-3 text-left border-b border-r border-gray-300">
                          {tCatalog('variants.sellingPrice')}
                        </th>
                        <th className="text-xs font-semibold text-gray-700 p-3 text-left border-b border-r border-gray-300">
                          {tCatalog('variants.purchasePrice')}
                        </th>
                        <th className="text-xs font-semibold text-gray-700 p-3 text-left border-b border-r border-gray-300">
                          {tCatalog('variants.moq')}
                        </th>
                        <th className="text-xs font-semibold text-gray-700 p-3 text-left border-b border-r border-gray-300">
                          {tCatalog('variants.stockQty')}
                        </th>
                        <th className="text-xs font-semibold text-gray-700 p-3 text-left border-b border-r border-gray-300">
                          {tCatalog('variants.lowThreshold')}
                        </th>
                        <th className="w-25 text-xs font-semibold text-gray-700 p-3 text-left border-b border-r border-gray-300">
                          {tCatalog('variants.status')}
                        </th>
                        {!isViewMode && (
                          <th className="text-xs font-semibold text-gray-700 p-3 text-center border-b border-gray-300">
                            {tCatalog('variants.actions')}
                          </th>
                        )}
                      </tr>
                    </thead>
                    <tbody>
                       {combinations.map((combination, index) => (
                         <tr key={combination.id}>
                           {variants.map((variant) => (
                             <td 
                               key={variant.id} 
                               className="p-3 border-r border-b border-gray-300"
                             >
                               <span className="text-xs text-black">
                                 {combination[`variant_${variant.id}` as keyof typeof combination]?.toString() || tCatalog('variants.none')}
                               </span>
                             </td>
                           ))}
                          <td className="p-3 border-r border-b border-gray-300">
                                <input
                              type="text"
                              value={String(combination.sku)}
                              onChange={(e) => updateCombination(combination.id, 'sku', e.target.value)}
                                  disabled={isViewMode || isOfferConnected}
                                  className="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0a61d7] focus:border-transparent disabled:bg-gray-50 text-black"
                              placeholder={tCatalog('variants.skuPlaceholder')}
                            />
                          </td>
                          <td className="p-3 border-r border-b border-gray-300 align-top">
                            <div className="flex flex-col">
                            <div className="relative">
                              <div className="absolute left-3 top-1/2 transform -translate-y-1/2 text-xs text-gray-500 pointer-events-none">
                                {currencySymbol}
                              </div>
                              <input
                                type="text"
                                value={String(combination.sellingPrice)}
                                onChange={(e) => {
                                  const value = e.target.value;
                                  // Only update if the value is numeric (allows numbers, decimals, and empty string)
                                  if (validateNumericInput(value)) {
                                    updateCombination(combination.id, 'sellingPrice', value);
                                  }
                                }}
                                disabled={isViewMode || isOfferConnected}
                                className="w-full pl-8 pr-3 py-2 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0a61d7] focus:border-transparent disabled:bg-gray-50 text-black"
                                placeholder={getPricePlaceholder(userCurrency)}
                              />
                              </div>
                              {isOfferConnected && (() => {
                                const dbPrice = (combination as Record<string, unknown>).dbSellingPrice;
                                if (!dbPrice) return null;
                                
                                // Only show discounted price if there's an actual discount type (not just promotion)
                                const productDiscountType = (product as { discountType?: string }).discountType;
                                const hasActualDiscount = productDiscountType === 'percentage' || productDiscountType === 'fixed';
                                
                                if (!hasActualDiscount) return null;
                                
                                return (
                                  <div className="mt-1 text-xs text-gray-600">
                                    Discounted: {currencySymbol} {formatCurrencyAmount(parseNumberByCurrency(String(dbPrice), userCurrency), userCurrency)}
                                  </div>
                                );
                              })()}
                            </div>
                          </td>
                          <td className="p-3 border-r border-b border-gray-300">
                            <div className="relative">
                              <div className="absolute left-3 top-1/2 transform -translate-y-1/2 text-xs text-gray-500 pointer-events-none">
                                {currencySymbol}
                              </div>
                              <input
                                type="text"
                                value={String(combination.purchasePrice)}
                                onChange={(e) => {
                                  const value = e.target.value;
                                  // Only update if the value is numeric (allows numbers, decimals, and empty string)
                                  if (validateNumericInput(value)) {
                                    updateCombination(combination.id, 'purchasePrice', value);
                                  }
                                }}
                                disabled={isViewMode || isOfferConnected}
                                className="w-full pl-8 pr-3 py-2 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0a61d7] focus:border-transparent disabled:bg-gray-50 text-black"
                                placeholder={getPricePlaceholder(userCurrency)}
                              />
                            </div>
                          </td>
                          <td className="p-3 border-r border-b border-gray-300">
                            <input
                              type="number"
                              value={combination.moq || ''}
                              onChange={(e) => {
                                const value = e.target.value;
                                updateCombination(combination.id, 'moq', value ? parseInt(value) : undefined);
                              }}
                              disabled={isViewMode || isOfferConnected}
                              className="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0a61d7] focus:border-transparent disabled:bg-gray-50 text-black"
                              placeholder={tCatalog('variants.numberPlaceholder')}
                              min="0"
                            />
                          </td>
                          <td className="p-3 border-r border-b border-gray-300">
                            <input
                              type="number"
                              value={combination.stockQuantity}
                              onChange={(e) => updateCombination(combination.id, 'stockQuantity', parseInt(e.target.value) || 0)}
                              disabled={isViewMode || isOfferConnected}
                              className="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0a61d7] focus:border-transparent disabled:bg-gray-50 text-black"
                              placeholder={tCatalog('variants.numberPlaceholder')}
                              min="0"
                            />
                          </td>
                          <td className="p-3 border-r border-b border-gray-300">
                            <input
                              type="number"
                              value={combination.lowStockThreshold}
                              onChange={(e) => updateCombination(combination.id, 'lowStockThreshold', parseInt(e.target.value) || 0)}
                              disabled={isViewMode || isOfferConnected}
                              className="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0a61d7] focus:border-transparent disabled:bg-gray-50 text-black"
                              placeholder={tCatalog('variants.numberPlaceholder')}
                              min="0"
                            />
                          </td>
                          <td className="p-3 border-r border-b border-gray-300">
                            {(() => {
                              const rowStatus = getVariantStockStatus(
                                combination.stockQuantity,
                                combination.lowStockThreshold,
                              );
                              return (
                            <span className={`text-xs font-medium ${
                              rowStatus === 'Out of Stock' 
                                ? 'text-red-600'
                                : rowStatus === 'Low Stock'
                                ? 'text-yellow-600'
                                : 'text-green-600'
                            }`}>
                              {translateStockStatus(rowStatus)}
                            </span>
                              );
                            })()}
                          </td>
                          {!isViewMode && (
                            <td className="p-3 text-center border-b border-gray-300">
                              <div className="flex items-center justify-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (index > 0) {
                                      const newCombinations = [...combinations];
                                      [newCombinations[index - 1], newCombinations[index]] = [newCombinations[index], newCombinations[index - 1]];
                                      setCombinations(newCombinations);
                                    }
                                  }}
                                  disabled={index === 0}
                                  className="text-blue-500 hover:text-blue-700 p-1 disabled:text-gray-300"
                                  title={tCatalog('variants.moveUp')}
                                >
                                  <ChevronUp className="w-4 h-4" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (index < combinations.length - 1) {
                                      const newCombinations = [...combinations];
                                      [newCombinations[index], newCombinations[index + 1]] = [newCombinations[index + 1], newCombinations[index]];
                                      setCombinations(newCombinations);
                                    }
                                  }}
                                  disabled={index === combinations.length - 1}
                                  className="text-blue-500 hover:text-blue-700 p-1 disabled:text-gray-300"
                                  title={tCatalog('variants.moveDown')}
                                >
                                  <ChevronDown className="w-4 h-4" />
                                </button>
                            </div>
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                          </div>
            </div>
            </div>
          </div>
        </div>
      </form>

      {/* Success Modal */}
      {showSuccessModal && (
        <div className="fixed inset-0 flex items-center justify-center z-50 pointer-events-none">
          <div className="bg-green-600 text-white rounded-lg shadow-2xl p-4 flex items-center gap-4 animate-fade-in pointer-events-auto">
            <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center">
              <CheckCircle className="w-8 h-8" />
            </div>
            <div>
              <h3 className="text-md font-semibold">{tCatalog('successModal.title')}</h3>
              <p className="text-xs text-white/90">{tCatalog('successModal.description')}</p>
            </div>
          </div>
        </div>
      )}

      {/* Variant guard modal (no browser confirm) */}
      {variantGuardModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-md rounded-xl bg-white shadow-2xl border border-gray-200 overflow-hidden">
            <div className="p-4">
              <h3 className="text-md font-semibold text-gray-900">{variantGuardModal.title}</h3>
              {variantGuardModal.intro && (
                <p className="mt-2 text-xs text-gray-700">{variantGuardModal.intro}</p>
              )}

              {Array.isArray(variantGuardModal.items) && variantGuardModal.items.length > 0 && (
                <ul className="mt-3 space-y-2 text-xs text-gray-700">
                  {variantGuardModal.items.map((it) => (
                    <li key={it.variantName} className="leading-5">
                      <div className="font-medium">
                        - {it.variantName} ({it.orderItemCount})
                      </div>
                      {Array.isArray(it.orderIds) && it.orderIds.length > 0 && (
                        <div className="mt-1 text-xs text-gray-600">
                          {tCatalog('variantGuard.orders')}{' '}
                          {it.orderIds!.map((oid, idx) => (
                            <React.Fragment key={oid}>
                              <a
                                href={`/orders/details/${encodeURIComponent(oid)}`}
                                className="text-[#0a61d7] hover:underline"
                              >
                                {oid}
                              </a>
                              {idx < it.orderIds!.length - 1 ? ', ' : ''}
                            </React.Fragment>
                          ))}
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              )}

              {variantGuardModal.message && (
                <p className="mt-3 text-xs text-gray-700 whitespace-pre-line">{variantGuardModal.message}</p>
              )}
              {variantGuardModal.footer && (
                <p className="mt-3 text-xs text-gray-700 whitespace-pre-line">{variantGuardModal.footer}</p>
              )}
              {variantGuardModal.policy && (
                <div className="mt-3 rounded-lg border border-gray-200 bg-gray-50 p-3">
                  <p className="text-xs font-semibold text-gray-900">{tCatalog('variantGuard.whatToDoInstead')}</p>
                  <p className="mt-1 text-xs text-gray-700 whitespace-pre-line">{variantGuardModal.policy}</p>
                </div>
              )}
              <div className="mt-4 flex justify-end gap-2">
                {variantGuardModal.action?.kind === 'create_option' && (
                  <button
                    type="button"
                    onClick={() => {
                      addVariantOption(variantGuardModal.action!.variantId, variantGuardModal.action!.initialName);
                      setVariantGuardModal(null);
                    }}
                    className="px-4 py-2 text-xs font-semibold rounded-lg bg-white text-gray-700 border border-gray-200 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#0a61d7]/30"
                  >
                    {tCatalog('variantGuard.createNewOption')}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setVariantGuardModal(null)}
                  className="px-4 py-2 text-xs font-semibold rounded-lg bg-[#0a61d7] text-white hover:bg-[#0851b8] focus:outline-none focus:ring-2 focus:ring-[#0a61d7]/40"
                >
                  {tCatalog('variantGuard.ok')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <VariationListImport
        open={showVariationImport}
        onCloseAction={() => setShowVariationImport(false)}
        variantColumns={variationImportColumns}
        onImportAction={handleVariationImport}
      />
    </div>
  );
}

