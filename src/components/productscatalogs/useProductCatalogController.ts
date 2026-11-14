'use client';
import React, { useState, useEffect, useRef, useMemo } from 'react';
import * as XLSX from 'xlsx';
import type { VariationImportPayload, VariationImportResult, VariationImportRow } from '@/components/productscatalogs/VariationListImport';
import { useRouter } from 'next/navigation';
import { useUserStore } from '@/store/userStore';
import type { Product, ProductFormData, StockLevel, ProductVariantDefinition, VariantOption } from '../../types/product';
import { getDefaultCurrency, getCurrencySymbol } from '@/utils/currencyUtils';
import { parseNumberByCurrency } from '@/config/currencyConfig';
import { getPriceAnchorPieces, scaleAnchoredPrice, priceToPieceValue } from '@/utils/priceAnchorUtils';
import { getAvailableCategories, getCategoryByValue } from '@/utils/categoryUtils';
import { fetchGraphQL } from '@/lib/graphqlClient';
import { uploadToCloudinaryDirect } from '@/utils/cloudinaryDirect';
import { useProductsTranslations } from '@/hooks/useProductsTranslations';
import {
  getProductStockStatus,
  getVariantStockStatus,
  normalizeStockLevels,
  validateStockLevels,
  updateStockLevelRatio as applyStockLevelRatio,
} from '@/utils/stockUtils';
import { CATALOG_COMPLETION_OPTIONS } from '@/utils/productCompletion';
import {
  PRODUCT_REQUIRED_TEXT,
  productMarketSegmentError,
  productRequiredTextError,
  type ProductRequiredTextField,
} from '@/utils/product-security';
import { useProductVariantManager } from './useProductVariantManager';
const MARKETPLACE_STATUS_MUTATION = `
  mutation PublishMarketplaceProduct($userId: Int!, $productId: String!, $action: String!) {
    publishMarketplaceProduct(userId: $userId, productId: $productId, action: $action) {
      success
      message
    }
  }
`;
import type {
  ProductCatalogProps,
  Combination,
  CatalogVariant,
  StockUnitValue,
} from './productCatalogHelpers';
import {
  isFormDataEqual,
  isFiniteNonNegativeNumber,
  isCompleteCombination,
  combinationHasDraftData,
  normalizeImportMatchValue,
  getImportRowVariantValue,
  buildCombinationFromImportRow,
  syncVariantDefinitionsWithCombinations,
  namedOptionCount,
  findSharedSkuAxisVariantId,
  cartesianProduct,
  draftCombinationAxisKey,
  rebuiltMatrixKeys,
  shouldPreserveDraftCombinations,
  variationMatrixCoversOptions,
  rebuildCombinationsFromVariants,
  hasValidVariants,
  readVariantAttributeValue,
  buildVariantsFromImport,
  collapseImportStatus,
  normalizeImportedStockStatus,
  VARIATION_COL_WEIGHTS,
  VARIATION_COL_MIN,
  VARIATION_ROW_MIN,
  VARIATION_ROW_DEFAULT,
  STOCK_UNIT_OPTIONS,
  normalizeStockUnitValue,
  VARIATION_COL_WIDTHS_KEY_PREFIX,
  variationColWidthsStorageKey,
  readVariationColWidths,
  writeVariationColWidths,
  startSizeDrag,
} from './productCatalogHelpers';
export function useProductCatalogController({ mode = 'add', product, onSave, onCancel }: ProductCatalogProps) {
  const router = useRouter();
  const user = useUserStore(state => state.user);
  const { tCatalog, tShared, tMarketplace, translateStockStatus, translateCategory, translateStatus, translateFieldName } = useProductsTranslations();
  const userCurrency = user?.currency || getDefaultCurrency();
  const currencySymbol = getCurrencySymbol(userCurrency);
  const [formData, setFormData] = useState<ProductFormData>({
    id: product?.id,
    productId: product?.productId || '',
    sku: product?.sku || '',
    marketSegment: product?.marketSegment || '',
    name: product?.name || '',
    description: product?.description || '',
    productType: product?.productType || '',
    brand: product?.brand || '',
    supplier: product?.supplier || '',
    status: product?.status || 'Draft',
    catalogName: product?.catalogName || '',
    stockUnit: 'Pieces',
    stockLevels: normalizeStockLevels(product?.stockLevels),
    sellingPriceUnit: product?.sellingPriceUnit || 'Pieces',
    purchasePriceUnit: product?.purchasePriceUnit || 'Pieces',
    images: product?.images || [],
    halalCertified: (product as { halalCertified?: boolean })?.halalCertified ?? false,
    bpomApproved: (product as { bpomApproved?: boolean })?.bpomApproved ?? false,
    originalProduct: (product as { originalProduct?: boolean })?.originalProduct ?? true,
    returnPolicyDays: (product as { returnPolicyDays?: number })?.returnPolicyDays ?? 7
  });
  // Keep ratio text in a draft state while the user is typing. Committing only on blur
  // prevents intermediate digits (e.g. "1" while entering "100") from being rejected.
  const [stockLevelRatioDrafts, setStockLevelRatioDrafts] = useState<Record<number, string>>({});
  // Older records may still store variant stock in their legacy single stockUnit.
  // Do not reinterpret those numbers as pieces until the distributor supplies the ratio.
  const initialLegacyStockUnit = product && !Array.isArray(product.stockLevels) &&
    normalizeStockUnitValue(product.stockUnit) !== 'Pieces'
      ? normalizeStockUnitValue(product.stockUnit)
      : null;
  const [legacyStockUnit, setLegacyStockUnit] = useState<StockUnitValue | null>(initialLegacyStockUnit);
  const [legacyPiecesPerUnit, setLegacyPiecesPerUnit] = useState('');
  const [legacyConversionError, setLegacyConversionError] = useState('');
  const legacyConversionAppliedRef = useRef(false);
  const originalStockByCombinationIdRef = useRef<Record<string, { stockQuantity: number; lowStockThreshold: number }>>({});
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
  const [showImportStockSetup, setShowImportStockSetup] = useState(false);
  const [variationColWidths, setVariationColWidths] = useState<Record<string, number>>({});
  const [variationColWidthsReady, setVariationColWidthsReady] = useState(false);
  const [variationRowHeights, setVariationRowHeights] = useState<Record<string, number>>({});
  const variationTableRef = useRef<HTMLTableElement | null>(null);
  const variationSizeDragDisposeRef = useRef<(() => void) | null>(null);
  const variationColWidthsLoadedKeyRef = useRef<string | null>(null);
  const variationLayoutProductKey =
    String(product?.productId || formData.productId || '').trim() ||
    (product?.id != null ? `id:${product.id}` : 'draft');
  useEffect(() => {
    return () => {
      variationSizeDragDisposeRef.current?.();
      variationSizeDragDisposeRef.current = null;
    };
  }, []);
  useEffect(() => {
    setVariationColWidthsReady(false);
    variationColWidthsLoadedKeyRef.current = null;
    const widths = readVariationColWidths(variationLayoutProductKey);
    setVariationColWidths(widths);
    variationColWidthsLoadedKeyRef.current = variationLayoutProductKey;
    setVariationColWidthsReady(true);
  }, [variationLayoutProductKey]);
  useEffect(() => {
    if (!variationColWidthsReady) return;
    if (variationColWidthsLoadedKeyRef.current !== variationLayoutProductKey) return;
    writeVariationColWidths(variationLayoutProductKey, variationColWidths);
  }, [variationColWidths, variationColWidthsReady, variationLayoutProductKey]);
  const trackVariationSizeDrag = (
    ...args: Parameters<typeof startSizeDrag>
  ) => {
    variationSizeDragDisposeRef.current?.();
    variationSizeDragDisposeRef.current = startSizeDrag(...args);
  };
  // Initialize variants from product data
  useEffect(() => {
    if (product?.variants && product.variants.length > 0) {
      // New structure: load from variants (ProductVariant model) with proper ordering
      const loadedVariants: CatalogVariant[] = [...product.variants]
        .sort((a: ProductVariantDefinition, b: ProductVariantDefinition) => (a.position || 0) - (b.position || 0)) // Sort by position
        .map((def: ProductVariantDefinition, index: number): CatalogVariant => ({
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
      let inferredVariants: CatalogVariant[];
      if (product.variants && product.variants.length > 0) {
        // Use the properly ordered variants from the first useEffect
        inferredVariants = [...product.variants]
          .sort((a: ProductVariantDefinition, b: ProductVariantDefinition) => (a.position || 0) - (b.position || 0))
          .map((def: ProductVariantDefinition, index: number): CatalogVariant => ({
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
      const loadedCombinations: Combination[] = product.variantOptions.map((option: VariantOption): Combination => {
        const base: Combination = {
          id: `combination-${option.id}`,
          variantName: option.variantName,
          sku: option.sku || '',
          purchasePrice: scaleAnchoredPrice(option.purchasePrice, 1, getPriceAnchorPieces(normalizeStockLevels(product.stockLevels), product.purchasePriceUnit), userCurrency),
          sellingPrice: scaleAnchoredPrice(option.sellingPrice, 1, getPriceAnchorPieces(normalizeStockLevels(product.stockLevels), product.sellingPriceUnit), userCurrency),
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
      originalStockByCombinationIdRef.current = Object.fromEntries(loadedCombinations.map((combo: Combination) => [
        combo.id,
        { stockQuantity: combo.stockQuantity, lowStockThreshold: combo.lowStockThreshold },
      ]));
      combinationsRef.current = loadedCombinations;
      setVariants(inferredVariants.length > 0 ? inferredVariants : [{
        id: 'variant-1',
        variantType: '',
        moq: undefined,
        options: [{ id: 'option-1', name: '' }]
      }]);
      setCombinations(loadedCombinations);
    } else {
      // Create default combination
      originalStockByCombinationIdRef.current = {};
      combinationsRef.current = [{
        id: 'combination-1',
        sku: '',
        purchasePrice: '',
        sellingPrice: '',
        moq: undefined,
        stockQuantity: 0,
        lowStockThreshold: 0,
        stockStatus: 'In Stock' as const
      }];
      setCombinations(combinationsRef.current);
    }
  }, [product]);
  const [isDragOver, setIsDragOver] = useState(false);
  const [uploadingImages, setUploadingImages] = useState(false);
  const [saving, setSaving] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
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
        marketSegment: product.marketSegment || '',
        name: product.name || '',
        description: product.description || '',
        productType: product.productType || '',
        brand: product.brand || '',
        supplier: product.supplier || '',
        status: product.status || 'Draft',
        catalogName: product.catalogName || '',
        stockUnit: 'Pieces',
        stockLevels: normalizeStockLevels(product.stockLevels),
        sellingPriceUnit: product.sellingPriceUnit || 'Pieces',
        purchasePriceUnit: product.purchasePriceUnit || 'Pieces',
        images: product.images || [],
        halalCertified: (product as { halalCertified?: boolean })?.halalCertified ?? false,
        bpomApproved: (product as { bpomApproved?: boolean })?.bpomApproved ?? false,
        originalProduct: (product as { originalProduct?: boolean })?.originalProduct ?? true,
        returnPolicyDays: (product as { returnPolicyDays?: number })?.returnPolicyDays ?? 7,
      };
      const nextLegacyUnit = !Array.isArray(product.stockLevels) && normalizeStockUnitValue(product.stockUnit) !== 'Pieces'
        ? normalizeStockUnitValue(product.stockUnit)
        : null;
      setLegacyStockUnit(nextLegacyUnit);
      setLegacyPiecesPerUnit('');
      setLegacyConversionError('');
      legacyConversionAppliedRef.current = false;
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
  const [showMarketSegmentDropdown, setShowMarketSegmentDropdown] = useState(false);
  const [showSupplierDropdown, setShowSupplierDropdown] = useState(false);
  const [supplierSearch, setSupplierSearch] = useState('');
  const [supplierOptions, setSupplierOptions] = useState<Array<{ supplierId: string; name: string }>>([]);
  const [marketSegmentOptions, setMarketSegmentOptions] = useState<string[]>([]);
  // Refs for click outside detection
  const generalCategoryRef = useRef<HTMLDivElement>(null);
  const marketSegmentRef = useRef<HTMLDivElement>(null);
  const supplierDropdownRef = useRef<HTMLDivElement>(null);
  // Store original form data on mount for edit mode
  useEffect(() => {
    if (mode === 'edit' && product) {
      const initial = {
        id: product?.id,
        productId: product?.productId || '',
        sku: product?.sku || '',
        marketSegment: product?.marketSegment || '',
        name: product?.name || '',
        description: product?.description || '',
        productType: product?.productType || '',
        brand: product?.brand || '',
        supplier: product?.supplier || '',
        status: product?.status || 'Draft',
        catalogName: product?.catalogName || '',
        stockUnit: 'Pieces',
        stockLevels: normalizeStockLevels(product?.stockLevels),
        sellingPriceUnit: product?.sellingPriceUnit || 'Pieces',
        purchasePriceUnit: product?.purchasePriceUnit || 'Pieces',
        images: product?.images || [],
        halalCertified: (product as { halalCertified?: boolean })?.halalCertified ?? false,
        bpomApproved: (product as { bpomApproved?: boolean })?.bpomApproved ?? false,
        originalProduct: (product as { originalProduct?: boolean })?.originalProduct ?? true,
        returnPolicyDays: (product as { returnPolicyDays?: number })?.returnPolicyDays ?? 7,
      };
      setOriginalFormData(JSON.parse(JSON.stringify(initial)));
    }
  }, [mode, product]);
  // Load market segments from buyer business types (same source as assortment heatmap).
  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    (async () => {
      try {
        const result = await fetchGraphQL<{
          assortmentGapHeatmap: { segments: string[] };
        }>(
          `query MarketSegments($userId: Int!) {
            assortmentGapHeatmap(userId: $userId, period: "90d", page: 1, limit: 1) {
              segments
            }
          }`,
          { userId: user.id },
        );
        if (cancelled) return;
        const segments = (result.assortmentGapHeatmap?.segments || [])
          .map((segment) => segment.trim())
          .filter(Boolean);
        setMarketSegmentOptions(segments);
      } catch {
        if (!cancelled) setMarketSegmentOptions([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);
  // Load CRM suppliers for match-dropdown (import/create suppliers first, then link products).
  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    (async () => {
      try {
        const result = await fetchGraphQL<{
          suppliers: { nodes: Array<{ supplierId: string; name: string }> };
        }>(
          `query ProductSupplierOptions($userId: Int!) {
            suppliers(userId: $userId, page: 1, limit: 1000) {
              nodes { supplierId name }
            }
          }`,
          { userId: user.id },
        );
        if (cancelled) return;
        const rows = (result.suppliers?.nodes || [])
          .map((row) => ({
            supplierId: String(row.supplierId || '').trim(),
            name: String(row.name || '').trim(),
          }))
          .filter((row) => row.name);
        rows.sort((a, b) => a.name.localeCompare(b.name));
        setSupplierOptions(rows);
      } catch {
        if (!cancelled) setSupplierOptions([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);
  const filteredSupplierOptions = useMemo(() => {
    const q = supplierSearch.trim().toLowerCase();
    if (!q) return supplierOptions;
    return supplierOptions.filter((row) => row.name.toLowerCase().includes(q));
  }, [supplierOptions, supplierSearch]);
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
      if (marketSegmentRef.current && !marketSegmentRef.current.contains(event.target as Node)) {
        setShowMarketSegmentDropdown(false);
      }
      if (supplierDropdownRef.current && !supplierDropdownRef.current.contains(event.target as Node)) {
        setShowSupplierDropdown(false);
      }
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
    setFieldErrors((prev) => {
      if (!prev[field]) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
  };
  const updatePriceAnchor = (kind: 'selling' | 'purchase', nextUnitName: string) => {
    const field = kind === 'selling' ? 'sellingPriceUnit' : 'purchasePriceUnit';
    const priceField = kind === 'selling' ? 'sellingPrice' : 'purchasePrice';
    const fromPieces = getPriceAnchorPieces(formData.stockLevels, formData[field]);
    const toPieces = getPriceAnchorPieces(formData.stockLevels, nextUnitName);
    if (formData[field] === nextUnitName) return;
    setCombinations((current) => current.map((combo) => ({
      ...combo,
      [priceField]: scaleAnchoredPrice(combo[priceField], fromPieces, toPieces, userCurrency),
    })));
    setFormData((prev) => ({ ...prev, [field]: nextUnitName }));
  };
  const updateStockLevel = (index: number, patch: Partial<StockLevel>) => {
    setFormData((prev) => {
      const previousName = prev.stockLevels[index]?.name;
      const nextName = patch.name;
      return {
        ...prev,
        stockUnit: 'Pieces',
        sellingPriceUnit: nextName !== undefined && prev.sellingPriceUnit === previousName ? nextName : prev.sellingPriceUnit,
        purchasePriceUnit: nextName !== undefined && prev.purchasePriceUnit === previousName ? nextName : prev.purchasePriceUnit,
        stockLevels: prev.stockLevels.map((level, levelIndex) =>
          levelIndex === index ? { ...level, ...patch } : level,
        ),
      };
    });
  };
  const updateStockLevelRatioValue = (index: number, rawValue: string) => {
    const ratio = rawValue.trim() === '' ? 0 : Number(rawValue);
    setFormData((prev) => ({
      ...prev,
      stockUnit: 'Pieces',
      stockLevels: applyStockLevelRatio(prev.stockLevels, index, ratio),
    }));
  };
  const commitStockLevelRatioDraft = (index: number) => {
    const rawValue = stockLevelRatioDrafts[index];
    if (rawValue === undefined) return;
    const normalized = rawValue.trim();
    const ratio = normalized === '' ? 0 : Number(normalized);
    const isValidWholeRatio = /^\d+$/.test(normalized) && Number.isSafeInteger(ratio) && ratio >= 2;
    updateStockLevelRatioValue(index, isValidWholeRatio ? normalized : '');
    setStockLevelRatioDrafts((prev) => {
      const next = { ...prev };
      delete next[index];
      return next;
    });
  };
  const addStockLevel = () => {
    setFormData((prev) => ({
      ...prev,
      stockUnit: 'Pieces',
      stockLevels: [...prev.stockLevels, { name: '', piecesPerUnit: 0, unitsPerPreviousLevel: 0 }],
    }));
  };
  const removeStockLevel = (index: number) => {
    if (index === 0) return;
    setStockLevelRatioDrafts({});
    const removedName = formData.stockLevels[index]?.name;
    const resetSellingAnchor = formData.sellingPriceUnit === removedName;
    const resetPurchaseAnchor = formData.purchasePriceUnit === removedName;
    if (resetSellingAnchor) {
      const fromPieces = getPriceAnchorPieces(formData.stockLevels, formData.sellingPriceUnit);
      setCombinations((current) => current.map((combo) => ({ ...combo, sellingPrice: scaleAnchoredPrice(combo.sellingPrice, fromPieces, 1, userCurrency) })));
    }
    if (resetPurchaseAnchor) {
      const fromPieces = getPriceAnchorPieces(formData.stockLevels, formData.purchasePriceUnit);
      setCombinations((current) => current.map((combo) => ({ ...combo, purchasePrice: scaleAnchoredPrice(combo.purchasePrice, fromPieces, 1, userCurrency) })));
    }
    setFormData((prev) => ({
      ...prev,
      stockLevels: prev.stockLevels.filter((_, levelIndex) => levelIndex !== index),
      sellingPriceUnit: resetSellingAnchor ? 'Pieces' : prev.sellingPriceUnit,
      purchasePriceUnit: resetPurchaseAnchor ? 'Pieces' : prev.purchasePriceUnit,
    }));
  };
  const convertLegacyStockToPieces = () => {
    if (!legacyStockUnit || legacyConversionAppliedRef.current) return;
    const ratio = Number(legacyPiecesPerUnit);
    if (!Number.isSafeInteger(ratio) || ratio < 2) {
      setLegacyConversionError(tCatalog('variants.legacyRatioInvalid'));
      return;
    }
    const source = combinationsRef.current.length ? combinationsRef.current : combinations;
    const converted = source.map((combo) => {
      const stockQuantity = combo.stockQuantity * ratio;
      const lowStockThreshold = combo.lowStockThreshold * ratio;
      if (!Number.isSafeInteger(stockQuantity) || stockQuantity > 2147483647 || !Number.isSafeInteger(lowStockThreshold) || lowStockThreshold > 2147483647) {
        return null;
      }
      return {
        ...combo,
        stockQuantity,
        lowStockThreshold,
        stockStatus: getVariantStockStatus(stockQuantity, lowStockThreshold),
      };
    });
    if (converted.some((row) => row === null)) {
      setLegacyConversionError(tCatalog('variants.legacyConversionOverflow'));
      return;
    }
    const nextCombinations = converted as Combination[];
    const nextLevels = [
      ...normalizeStockLevels(formData.stockLevels),
      { name: legacyStockUnit, piecesPerUnit: ratio },
    ];
    const dedupedLevels = normalizeStockLevels(nextLevels);
    legacyConversionAppliedRef.current = true;
    combinationsRef.current = nextCombinations;
    originalStockByCombinationIdRef.current = Object.fromEntries(nextCombinations.map((combo) => [
      combo.id,
      { stockQuantity: combo.stockQuantity, lowStockThreshold: combo.lowStockThreshold },
    ]));
    setCombinations(nextCombinations);
    setFormData((prev) => ({ ...prev, stockUnit: 'Pieces', stockLevels: dedupedLevels }));
    setLegacyStockUnit(null);
    setLegacyPiecesPerUnit('');
    setLegacyConversionError('');
  };
  // Variant management functions
  const variantManager = useProductVariantManager({
    variants,
    setVariants,
    variantDrafts,
    setVariantDrafts,
    setCombinations,
    currentMode,
    userId: user?.id ?? undefined,
    productId: formData.productId,
    getAffectedVariantOptionIds,
    setVariantGuardModal,
  });
  const {
    addVariant,
    removeVariant,
    updateVariant,
    showRenameBlockedModal,
    commitVariantTypeRename,
    addVariantOption,
    removeVariantOption,
    updateVariantOption,
    commitVariantOptionRename,
    guardVariantTypeEditOnFocus,
    guardVariantOptionEditOnFocus,
  } = variantManager;
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
    // Stock is stored once, in absolute Pieces. Package columns are equivalent views
    // of that same value and are exported as exact decimal equivalents for readability.
    const packageStockLevels = displayStockLevels.filter(
      (level) => String(level.name).trim().toLocaleLowerCase() !== 'pieces',
    );
    const headers = [
      ...variationImportColumns.map((col) => col.label),
      tCatalog('variants.sku'),
      tCatalog('variants.sellingPrice'),
      tCatalog('variants.purchasePrice'),
      tCatalog('variants.moq'),
      'Stock Quantity', // Canonical inventory column, always in Pieces.
      ...packageStockLevels.map((level) => level.name),
      'Low Stock Threshold', // Threshold is also stored in Pieces.
      tCatalog('variants.status'),
    ];
    const dataRows = combinations.map((combo) => [
      ...variants.map((variant) => String(combo[`variant_${variant.id}`] ?? tCatalog('variants.none'))),
      combo.sku,
      combo.sellingPrice,
      combo.purchasePrice,
      combo.moq ?? '',
      combo.stockQuantity,
      ...packageStockLevels.map((level) => {
        const ratio = Number(level.piecesPerUnit);
        return Number.isSafeInteger(ratio) && ratio >= 1 ? combo.stockQuantity / ratio : '';
      }),
      combo.lowStockThreshold,
      combo.stockStatus,
    ]);
    const ws = XLSX.utils.aoa_to_sheet([headers, ...dataRows]);
    // Keep the standard headers so the import mapper can recognize them, while
    // documenting the configured unit in the Excel header comments.
    const sellingPriceHeader = XLSX.utils.encode_cell({ r: 0, c: variationImportColumns.length + 1 });
    const purchasePriceHeader = XLSX.utils.encode_cell({ r: 0, c: variationImportColumns.length + 2 });
    if (ws[sellingPriceHeader]) {
      ws[sellingPriceHeader].c = [{ a: 'Lakupak', t: `Each Selling Price value is per ${formData.sellingPriceUnit || 'Pieces'}.` }];
    }
    if (ws[purchasePriceHeader]) {
      ws[purchasePriceHeader].c = [{ a: 'Lakupak', t: `Each Purchase Price value is per ${formData.purchasePriceUnit || 'Pieces'}.` }];
    }
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Variations');
    const safeName = (formData.name || formData.productId || 'product').replace(/[^\w\-]+/g, '_').slice(0, 40);
    XLSX.writeFile(wb, `variation-list-${safeName}.xlsx`);
  };
  const handleVariationImport = async (
    payload: VariationImportPayload,
  ): Promise<VariationImportResult> => {
    const { rows, variantLevels } = payload;
    // The import dialog treats unrecognized spreadsheet columns as flexible variant
    // columns. Recognize columns whose headers match this product's configured stock
    // levels so carton/box columns are never turned into product variant definitions.
    const stockLevelMappings = variantLevels.flatMap((column) => {
      const stockLevel = displayStockLevels.find(
        (level) => normalizeImportMatchValue(level.name) === normalizeImportMatchValue(column.typeName),
      );
      return stockLevel ? [{ columnId: column.columnId, stockLevel }] : [];
    });
    const productVariantLevels = variantLevels.filter(
      (column) => !stockLevelMappings.some((mapping) => mapping.columnId === column.columnId),
    );
    const parseImportedQuantity = (raw: unknown): number | null => {
      const text = String(raw ?? '').trim();
      if (!text) return null;
      const parsed = Number(text.replace(/,/g, ''));
      return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
    };
    const rowsWithCanonicalPieceStock = rows.map((row) => {
      // Prefer the canonical Stock Quantity column when it exists. For package-only
      // spreadsheets, convert the highest mapped package equivalent back into Pieces.
      const canonicalPieces = parseImportedQuantity(row.stockQuantity);
      if (canonicalPieces !== null) {
        return { ...row, stockQuantity: String(Math.round(canonicalPieces)) };
      }
      for (let index = stockLevelMappings.length - 1; index >= 0; index -= 1) {
        const mapping = stockLevelMappings[index];
        const importedEquivalent = parseImportedQuantity(row.variantValues[mapping.columnId]);
        if (importedEquivalent === null) continue;
        const convertedPieces = Math.round(importedEquivalent * Number(mapping.stockLevel.piecesPerUnit));
        if (Number.isSafeInteger(convertedPieces) && convertedPieces >= 0 && convertedPieces <= 2147483647) {
          return { ...row, stockQuantity: String(convertedPieces) };
        }
      }
      return row;
    });
    const applyRowsToCombinations = (
      combos: Combination[],
      variantsList: CatalogVariant[],
    ): { combinations: Combination[]; updated: number } => {
      const hasVariantColumns = productVariantLevels.length > 0;
      const usedRowIndices = new Set<number>();
      let updated = 0;
      let nextCombinations = combos.map((combo) => {
        const rowIndex = rowsWithCanonicalPieceStock.findIndex((row, idx) => {
          if (usedRowIndices.has(idx)) return false;
          return comboMatchesImportRow(combo, row, variantsList, hasVariantColumns);
        });
        if (rowIndex < 0) return combo;
        usedRowIndices.add(rowIndex);
        updated += 1;
        return mergeImportRowIntoCombo(combo, rowsWithCanonicalPieceStock[rowIndex]);
      });
      rowsWithCanonicalPieceStock.forEach((row, rowIndex) => {
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
    const buildingFromImport = productVariantLevels.length > 0 && !hasValidVariants(variants);
    const seedVariants = buildingFromImport ? buildVariantsFromImport(productVariantLevels, rowsWithCanonicalPieceStock) : variants;
    if (buildingFromImport && seedVariants.length === 0) {
      return { updated: 0, skipped: rowsWithCanonicalPieceStock.length };
    }
    const seedCombinations = buildingFromImport
      ? rebuildCombinationsFromVariants(seedVariants, [])
      : sourceCombinations;
    const { combinations: merged, updated } = applyRowsToCombinations(seedCombinations, seedVariants);
    const syncedVariants = syncVariantDefinitionsWithCombinations(seedVariants, merged, rowsWithCanonicalPieceStock);
    const validSynced = syncedVariants.filter((v) => v.variantType && v.options.some((opt) => opt.name));
    // Import should show the full matrix immediately (including PACK/KARTON counterparts).
    // Refresh stays for manual variant-type / option edits only.
    const rebuilt =
      validSynced.length > 0 ? rebuildCombinationsFromVariants(validSynced, merged) : merged;
    setVariants(syncedVariants);
    combinationsRef.current = rebuilt;
    setCombinations(rebuilt);
    return { updated, skipped: rowsWithCanonicalPieceStock.length - updated };
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
      setFieldErrors((prev) => {
        if (!prev.images) return prev;
        const next = { ...prev };
        delete next.images;
        return next;
      });
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
  const activeStockLevels: StockLevel[] = legacyStockUnit
    ? [{ name: legacyStockUnit, piecesPerUnit: 1 }]
    : (formData.stockLevels.length ? formData.stockLevels : [{ name: 'Pieces', piecesPerUnit: 1 }]);
  // Display stock levels in ascending package size: Pieces, then each larger
  // level in the order it is configured. Ratios are chained to the previous
  // level, so this same order is used by the summary cards and variation table.
  const displayStockLevels = activeStockLevels;
  const stockSummary = useMemo(() => {
    const totalUpdated = combinations.reduce((sum, combo) => sum + combo.stockQuantity, 0);
    const originalRows = Object.values(originalStockByCombinationIdRef.current) as Array<{ stockQuantity: number; lowStockThreshold: number }>;
    const totalExisting = originalRows.reduce((sum, original) => sum + original.stockQuantity, 0);
    return {
      existing: totalExisting,
      added: totalUpdated - totalExisting,
      updated: totalUpdated,
    };
  }, [combinations]);
  const productFieldMessage = (field: ProductRequiredTextField, code: NonNullable<ReturnType<typeof productRequiredTextError>>) => {
    const label = translateFieldName(field);
    if (code === 'tooLong') return tCatalog('validation.tooLong', { field: label });
    if (code === 'tooShort') return tCatalog('validation.nameMin');
    return tCatalog('validation.required', { field: label });
  };
  const buildVariationMatrixForSave = (status: 'Draft' | 'Published') => {
    const validVariants = variants.filter((v) => v.variantType && v.options.some((opt) => opt.name));
    if (validVariants.length > 0) {
      // Draft only: keep collapsed/unresolved populated rows. Published must rebuild (or fail
      // validation) so cleared axes cannot ship a partial preserved matrix.
      if (status === 'Draft' && shouldPreserveDraftCombinations(validVariants, combinations)) {
        return combinations.filter(combinationHasDraftData);
      }
      return rebuildCombinationsFromVariants(validVariants, combinations);
    }
    // No named axes. Draft keeps populated default rows and still clears truly empty ones.
    // Publish must not treat that default row as a valid variation matrix.
    if (status === 'Published') return [];
    return combinations.filter(combinationHasDraftData);
  };
  const collectProductErrors = (status: 'Draft' | 'Published') => {
    const errors: Record<string, string> = {};
    for (const field of Object.keys(PRODUCT_REQUIRED_TEXT) as ProductRequiredTextField[]) {
      const code = productRequiredTextError(field, String(formData[field] ?? ''));
      if (code) errors[field] = productFieldMessage(field, code);
    }
    const marketSegmentError = productMarketSegmentError(formData.marketSegment);
    if (marketSegmentError) {
      errors.marketSegment =
        marketSegmentError === 'Market segment is too long.'
          ? tCatalog('validation.tooLong', { field: translateFieldName('marketSegment') })
          : marketSegmentError;
    }
    const priceCurrency = user?.currency || userCurrency;
    const validVariants = variants.filter((v) => v.variantType && v.options.some((opt) => opt.name));
    const variationMatrix = buildVariationMatrixForSave(status);
    if (legacyStockUnit) {
      errors.stockLevels = tCatalog('variants.legacyConversionRequired', { unit: legacyStockUnit });
    } else {
      const stockLevelsError = validateStockLevels(formData.stockLevels);
      if (stockLevelsError) errors.stockLevels = stockLevelsError;
    }
    // Draft may be incomplete (empty/partial variants). Publish still requires a full matrix.
    if (status === 'Published') {
      if (variationMatrix.length === 0) {
        errors.variants = tCatalog('validation.variationListRequired');
      } else if (shouldPreserveDraftCombinations(validVariants, combinations)) {
        // Axis cleared / unresolved drafts — do not publish until the matrix is consistent.
        errors.variants = tCatalog('validation.variantsRequired');
      } else if (!variationMatrixCoversOptions(validVariants, variationMatrix)) {
        errors.variants = tCatalog('validation.variantsRequired');
      } else if (!variationMatrix.every((combo) => isCompleteCombination(combo, priceCurrency))) {
        errors.variants = tCatalog('validation.variantsRequired');
      }
      if (!formData.images?.length) errors.images = tCatalog('validation.imageRequired');
      const totalStock = variationMatrix.reduce((sum, combo) => sum + combo.stockQuantity, 0);
      const stockReady =
        variationMatrix.every(
          (combo) =>
            isFiniteNonNegativeNumber(combo.stockQuantity) &&
            isFiniteNonNegativeNumber(combo.lowStockThreshold),
        ) && totalStock > 0;
      if (!stockReady) errors.stock = tCatalog('validation.stockRequired');
    }
    return errors;
  };
  const productControlClass = (field: string) =>
    `w-full px-3 py-2 text-xs border rounded-lg focus:outline-none focus:ring-2 focus:border-transparent disabled:bg-gray-50 text-black ${
      fieldErrors[field]
        ? 'border-red-300 bg-red-50 focus:ring-red-500'
        : 'border-gray-300 focus:ring-[#0a61d7]'
    }`;
  const handleSubmitWithStatus = async (status: 'Draft' | 'Published') => {
    if (!user?.id) {
      alert(tCatalog('alerts.userNotAuthenticated'));
      return;
    }
    const errors = collectProductErrors(status);
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }
    setFieldErrors({});
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
      // When no valid variant types remain, preserve populated draft rows (or [] if blank).
      const validVariants = variants.filter((v) => v.variantType && v.options.some((opt) => opt.name));
      const combinationsForSave = buildVariationMatrixForSave(status);
      const priceCurrency = user.currency || userCurrency;
      // Always persist the full rebuilt matrix (including incomplete draft rows).
      // Filtering incomplete rows on draft previously dropped newly imported PACK/etc. rows from
      // both the API payload and local state, so they vanished on save and never reloaded.
      const combinationsForPayload = combinationsForSave;
      if (
        status === 'Published' &&
        combinationsForPayload.some((combo) => !isCompleteCombination(combo, priceCurrency))
      ) {
        setFieldErrors({ variants: tCatalog('validation.variantsRequired') });
        setSaving(false);
        return;
      }
      // Product-level stock from all variants (not "any variant out of stock")
      const totalStock = combinationsForPayload.reduce((sum, combo) => sum + combo.stockQuantity, 0);
      const lowStockThreshold = combinationsForPayload.reduce((sum, combo) => sum + combo.lowStockThreshold, 0);
      const stockStatus = getProductStockStatus(combinationsForPayload);
      const serializeComboPrice = (raw: unknown, anchorUnit: string): string => {
        const text = String(raw ?? '').trim();
        if (!text && status !== 'Published') return '';
        return priceToPieceValue(text, getPriceAnchorPieces(formData.stockLevels, anchorUnit), priceCurrency);
      };
      // Keep product.sku populated for legacy/search; prefer existing or first variant SKU.
      const derivedSku =
        String(finalData.sku || '').trim() ||
        combinationsForPayload.map((combo) => String(combo.sku || '').trim()).find(Boolean) ||
        String(finalData.productId || '').trim() ||
        '';
      // Submit the new variant structure
      const payload: Record<string, unknown> = {
        ...finalData,
        stockUnit: 'Pieces',
        stockLevels: formData.stockLevels,
        id: formData.id,
        productId: formData.productId,
        sku: derivedSku,
        marketSegment: String(finalData.marketSegment || '').trim(),
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
          purchasePrice: serializeComboPrice(combo.purchasePrice, formData.purchasePriceUnit),
          sellingPrice: serializeComboPrice(combo.sellingPrice, formData.sellingPriceUnit),
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
          $marketSegment: String
          $name: String!
          $description: String!
          $productType: String!
          $brand: String!
          $supplier: String!
          $status: String
          $catalogName: String
          $stockUnit: String
          $stockLevels: [JSONObject!]
          $sellingPriceUnit: String
          $purchasePriceUnit: String
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
            marketSegment: $marketSegment
            name: $name
            description: $description
            productType: $productType
            brand: $brand
            supplier: $supplier
            status: $status
            catalogName: $catalogName
            stockUnit: $stockUnit
            stockLevels: $stockLevels
            sellingPriceUnit: $sellingPriceUnit
            purchasePriceUnit: $purchasePriceUnit
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
            marketSegment
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
          $marketSegment: String
          $name: String
          $description: String
          $productType: String
          $brand: String
          $supplier: String
          $status: String
          $catalogName: String
          $stockUnit: String
          $stockLevels: [JSONObject!]
          $sellingPriceUnit: String
          $purchasePriceUnit: String
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
            marketSegment: $marketSegment
            name: $name
            description: $description
            productType: $productType
            brand: $brand
            supplier: $supplier
            status: $status
            catalogName: $catalogName
            stockUnit: $stockUnit
            stockLevels: $stockLevels
            sellingPriceUnit: $sellingPriceUnit
            purchasePriceUnit: $purchasePriceUnit
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
            marketSegment
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
          marketSegment: payload.marketSegment,
          name: payload.name,
          description: payload.description,
          productType: payload.productType,
          brand: payload.brand,
          supplier: payload.supplier,
          status: payload.status,
          stockUnit: 'Pieces',
        stockLevels: payload.stockLevels,
          sellingPriceUnit: payload.sellingPriceUnit,
          purchasePriceUnit: payload.purchasePriceUnit,
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
          marketSegment: payload.marketSegment,
          name: payload.name,
          description: payload.description,
          productType: payload.productType,
          brand: payload.brand,
          supplier: payload.supplier,
          status: payload.status,
          stockUnit: 'Pieces',
          stockLevels: payload.stockLevels,
          sellingPriceUnit: payload.sellingPriceUnit,
          purchasePriceUnit: payload.purchasePriceUnit,
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
          router.push('/products/list');
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
  const variationRowHeight = (rowId: string) =>
    variationRowHeights[rowId] ?? VARIATION_ROW_DEFAULT;
  const variationColKeys = useMemo(() => {
    const keys: Array<{ key: string; weight: number }> = [
      ...variants.map((variant) => ({
        key: `v:${variant.id}`,
        weight: VARIATION_COL_WEIGHTS.variant,
      })),
      { key: 'sku', weight: VARIATION_COL_WEIGHTS.sku },
      { key: 'sellingPrice', weight: VARIATION_COL_WEIGHTS.sellingPrice },
      { key: 'purchasePrice', weight: VARIATION_COL_WEIGHTS.purchasePrice },
      { key: 'moq', weight: VARIATION_COL_WEIGHTS.moq },
      { key: 'stock', weight: VARIATION_COL_WEIGHTS.stock },
      { key: 'lowThreshold', weight: VARIATION_COL_WEIGHTS.lowThreshold },
      { key: 'status', weight: VARIATION_COL_WEIGHTS.status },
    ];
    if (!isViewMode) {
      keys.push({ key: 'actions', weight: VARIATION_COL_WEIGHTS.actions });
    }
    return keys;
  }, [variants, isViewMode]);
  const hasCustomVariationColWidths = variationColKeys.some(
    (col) => typeof variationColWidths[col.key] === 'number',
  );
  const variationColWeightTotal = useMemo(
    () => variationColKeys.reduce((sum, col) => sum + col.weight, 0),
    [variationColKeys],
  );
  const variationTablePixelWidth = useMemo(() => {
    if (!hasCustomVariationColWidths) return null;
    return variationColKeys.reduce(
      (sum, col) => sum + (variationColWidths[col.key] ?? VARIATION_COL_MIN),
      0,
    );
  }, [hasCustomVariationColWidths, variationColKeys, variationColWidths]);
  const variationColStyle = (key: string, weight: number): React.CSSProperties => {
    if (hasCustomVariationColWidths) {
      const width = variationColWidths[key] ?? VARIATION_COL_MIN;
      return { width, minWidth: width };
    }
    const pct = `${(weight / Math.max(variationColWeightTotal, 1)) * 100}%`;
    return { width: pct };
  };
  const beginVariationColResize = (colKey: string, event: React.PointerEvent<HTMLElement>) => {
    event.preventDefault();
    event.stopPropagation();
    const table = variationTableRef.current;
    let snapshot = variationColWidths;
    if (!hasCustomVariationColWidths && table) {
      const measured: Record<string, number> = {};
      table.querySelectorAll<HTMLElement>('thead th[data-col-key]').forEach((th) => {
        const key = th.dataset.colKey;
        if (!key) return;
        measured[key] = Math.max(VARIATION_COL_MIN, Math.round(th.getBoundingClientRect().width));
      });
      snapshot = measured;
      setVariationColWidths(measured);
    }
    const startSize = snapshot[colKey] ?? VARIATION_COL_MIN;
    trackVariationSizeDrag({
      axis: 'x',
      startClient: event.clientX,
      startSize,
      min: VARIATION_COL_MIN,
      applySize: (next: number) =>
        setVariationColWidths((prev) => {
          const base = Object.keys(prev).length > 0 ? prev : snapshot;
          return { ...base, [colKey]: next };
        }),
    });
  };
  // Per-retailer offers no longer rewrite base catalog price — keep price editing unlocked
  const isOfferConnected = false;
  const customOfferClientCount = Number(
    (product as { customOfferClientCount?: number } | null | undefined)?.customOfferClientCount ?? 0,
  );
  return {
    CATALOG_COMPLETION_OPTIONS,
    PRODUCT_REQUIRED_TEXT,
    VARIATION_COL_WEIGHTS,
    VARIATION_ROW_MIN,
    activeStockLevels,
    addStockLevel,
    addVariant,
    addVariantOption,
    availableCategories,
    beginVariationColResize,
    catalogCategoryRef,
    clearAllImages,
    combinations,
    commitStockLevelRatioDraft,
    commitVariantOptionRename,
    commitVariantTypeRename,
    convertLegacyStockToPieces,
    currencySymbol,
    currentMode,
    currentProductStatus,
    customOfferClientCount,
    displayStockLevels,
    fieldErrors,
    filteredSupplierOptions,
    formData,
    generalCategoryRef,
    getSelectedCategory,
    guardVariantOptionEditOnFocus,
    guardVariantTypeEditOnFocus,
    handleCancel,
    handleCategorySelect,
    handleDragLeave,
    handleDragOver,
    handleDrop,
    handleExportVariationList,
    handleFileInput,
    handleInputChange,
    handleSubmit,
    handleSubmitWithStatus,
    handleUnpublish,
    handleVariationImport,
    hasUnsavedChanges,
    isDragOver,
    isOfferConnected,
    isViewMode,
    legacyConversionError,
    legacyPiecesPerUnit,
    legacyStockUnit,
    marketSegmentOptions,
    marketSegmentRef,
    parseNumberByCurrency,
    product,
    productControlClass,
    removeImage,
    removeStockLevel,
    removeVariant,
    removeVariantOption,
    reorderImages,
    router,
    saving,
    setCombinations,
    setLegacyConversionError,
    setLegacyPiecesPerUnit,
    setShowCatalogCategoryDropdown,
    setShowGeneralCategoryDropdown,
    setShowImportStockSetup,
    setShowMarketSegmentDropdown,
    setShowSupplierDropdown,
    setShowVariationImport,
    setStockLevelRatioDrafts,
    setSupplierSearch,
    setVariantGuardModal,
    setVariants,
    setVariationRefreshTick,
    setVariationRowHeights,
    showCatalogCategoryDropdown,
    showGeneralCategoryDropdown,
    showImportStockSetup,
    showMarketSegmentDropdown,
    showSuccessModal,
    showSupplierDropdown,
    showVariationImport,
    stockLevelRatioDrafts,
    stockSummary,
    supplierDropdownRef,
    supplierOptions,
    supplierSearch,
    tCatalog,
    tShared,
    trackVariationSizeDrag,
    translateCategory,
    translateFieldName,
    translateStatus,
    translateStockStatus,
    updateCombination,
    updateStockLevel,
    updateStockLevelRatioValue,
    updatePriceAnchor,
    updateVariant,
    updateVariantOption,
    uploadingImages,
    userCurrency,
    validateNumericInput,
    variantDrafts,
    variantGuardModal,
    variants,
    variationColStyle,
    variationImportColumns,
    variationRowHeight,
    variationTablePixelWidth,
    variationTableRef,
  };
}
