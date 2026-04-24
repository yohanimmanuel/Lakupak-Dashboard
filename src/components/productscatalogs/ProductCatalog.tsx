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
  ChevronDown
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useUserStore } from "@/store/userStore";
import { Product, ProductFormData } from "@/types/product";
import { getDefaultCurrency, getCurrencySymbol, formatCurrencyAmount } from '@/utils/currencyUtils';
import { formatNumberByCurrency, parseNumberByCurrency, getPricePlaceholder } from '@/config/currencyConfig';
import { getAvailableCategories, getCategoryByValue, getCategoryColor, getCategoryIconComponent } from '@/utils/categoryUtils';
import { fetchGraphQL } from '@/lib/graphqlClient';
import { uploadToCloudinaryDirect } from '@/utils/cloudinaryDirect';

const MARKETPLACE_STATUS_MUTATION = `
  mutation PublishMarketplaceProduct($userId: Int!, $productId: String!, $action: String!) {
    publishMarketplaceProduct(userId: $userId, productId: $productId, action: $action) {
      success
      message
    }
  }
`;

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
  const [variationRefreshTick, setVariationRefreshTick] = useState(0);
  const didInitVariationListRef = useRef(false);


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

  // Initial build of variation list once variants are loaded.
  useEffect(() => {
    if (didInitVariationListRef.current) return;
    if (!Array.isArray(variants) || variants.length === 0) return;
    didInitVariationListRef.current = true;
    setVariationRefreshTick((v) => v + 1);
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
      
      // Load combinations with proper mapping
      const loadedCombinations = product.variantOptions.map(option => {
        // If originalSellingPrice exists, use it for the form (this is the original price before discount)
        // Otherwise, use sellingPrice (which is the actual price when no offer is active)
        // Convert to string first to handle number/null/undefined types
        const originalPriceStr = option.originalSellingPrice 
          ? String(option.originalSellingPrice).trim() 
          : '';
        const hasOffer = originalPriceStr !== '';
        const formSellingPrice = hasOffer
          ? originalPriceStr
          : option.sellingPrice || '';
        // Store the database's sellingPrice (discounted price) for display when offer is active
        const dbSellingPrice = option.sellingPrice || '';
        
        const base: Combination = {
          id: `combination-${option.id}`,
          variantName: option.variantName,
          sku: option.sku || '',
          purchasePrice: option.purchasePrice || '',
          sellingPrice: formSellingPrice,
          // Store database sellingPrice for display (discounted price when offer is active)
          dbSellingPrice: dbSellingPrice,
          // Preserve originalSellingPrice if it exists, so it doesn't get lost on save
          originalSellingPrice: hasOffer ? originalPriceStr : undefined,
          moq: option.moq,
          stockQuantity: option.stockQuantity || 0,
          lowStockThreshold: option.lowStockThreshold || 0,
          stockStatus: option.stockStatus || 'In Stock'
        };
        
        const attrs = option.attributes && typeof option.attributes === 'object' ? option.attributes as Record<string, unknown> : undefined;
        if (attrs) {
          for (const variant of inferredVariants) {
            const key = variant.variantType;
            const value = attrs[key];
            base[`variant_${variant.id}`] = value !== undefined && value !== null ? String(value) : 'None';
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
    footer?: string;
    message?: string;
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
  
  // Derive current mode and status from props - use directly instead of state
  // Logic: Published products are view-only, Draft products are editable
  const currentMode = useMemo(() => {
    if (product?.status === 'Published') return 'view';
    if (product && product.status === 'Draft') return 'edit';
    return mode;
  }, [mode, product, product?.status]);

  const currentProductStatus = useMemo(() => {
    return product?.status || 'Draft';
  }, [product?.status]);

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
      if (hasUnsavedChanges) {
        e.preventDefault();
        e.returnValue = '';
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hasUnsavedChanges, mode]);
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
                  title: 'Cannot delete: used in orders',
                intro: 'Some affected variant options are referenced by existing order items:',
                items: tied.slice(0, 8).map((u) => ({
                  variantName: u.variantName,
                  orderItemCount: u.orderItemCount,
                  orderIds: u.orderIds ?? [],
                })),
                footer:
                  (tied.length > 8 ? `...and ${tied.length - 8} more.\n\n` : '') +
                  'To keep data integrity, delete/rename is blocked for those variants.',
                });
                return;
              }
              setVariants((prev) => prev.filter((variant) => variant.id !== variantId));
            })
            .catch((err) => {
              const msg = err instanceof Error ? err.message : 'Failed to validate variant usage';
              setVariantGuardModal({ title: 'Cannot validate deletion', message: msg });
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
  ) => {
    setVariantGuardModal({
      title: 'Cannot rename: used in orders',
      intro: 'This rename would affect variant options referenced by existing order items:',
      items: tied.slice(0, 8).map((u) => ({
        variantName: u.variantName,
        orderItemCount: u.orderItemCount,
        orderIds: u.orderIds ?? [],
      })),
      footer:
        tied.length > 8
          ? `...and ${tied.length - 8} more.\n\nThis variant is used in past orders. Create a new variant to continue selling.`
          : 'This variant is used in past orders. Create a new variant to continue selling.',
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
                title: 'Cannot rename: used in orders',
                message:
                  `This rename would affect variant options referenced by existing order items:\n\n${lines}` +
                  (tied.length > 8 ? `\n- ...and ${tied.length - 8} more` : '') +
                  `\n\nThis variant is used in past orders. Create a new variant to continue selling.`,
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
            const msg = err instanceof Error ? err.message : 'Failed to validate variant usage';
            setVariantGuardModal({ title: 'Cannot validate rename', message: msg });
            setVariantDrafts((prevDrafts) =>
              prevDrafts.map((v) => (v.id === variantId ? { ...v, variantType: prev } : v)),
            );
          });
        return;
      }
    }

    setVariants((prevState) => prevState.map((v) => (v.id === variantId ? { ...v, variantType: next } : v)));
  };

  const addVariantOption = (variantId: string) => {
    setVariants(prev => prev.map(variant => {
      if (variant.id === variantId) {
        const newOption = {
          id: `${variantId}-option-${Date.now()}`,
          name: ''
        };
        return {
          ...variant,
          options: [...variant.options, newOption]
        };
      }
      return variant;
    }));
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
                title: 'Cannot delete: used in orders',
                intro: 'Removing this option impacts variant options referenced by existing order items:',
                items: tied.slice(0, 8).map((u) => ({
                  variantName: u.variantName,
                  orderItemCount: u.orderItemCount,
                  orderIds: u.orderIds ?? [],
                })),
                footer:
                  (tied.length > 8 ? `...and ${tied.length - 8} more.\n\n` : '') +
                  'To keep data integrity, delete/rename is blocked for those variants.',
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
            const msg = err instanceof Error ? err.message : 'Failed to validate variant usage';
            setVariantGuardModal({ title: 'Cannot validate deletion', message: msg });
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
              const lines = tied
                .slice(0, 8)
                .map((u) => `- ${u.variantName} (${u.orderItemCount})`)
                .join('\n');
              setVariantGuardModal({
                title: 'Cannot rename: used in orders',
                message:
                  `This rename would affect variant options referenced by existing order items:\n\n${lines}` +
                  (tied.length > 8 ? `\n- ...and ${tied.length - 8} more` : '') +
                  `\n\nThis variant is used in past orders. Create a new variant to continue selling.`,
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
            const msg = err instanceof Error ? err.message : 'Failed to validate variant usage';
            setVariantGuardModal({ title: 'Cannot validate rename', message: msg });
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
        showRenameBlockedModal(tied);
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
        
        return updated;
      }
      return combination;
    }));
  };

  const updateCombinationVariantValue = (combo: Combination, variantId: string, nextValue: string): Combination => {
    return { ...combo, [`variant_${variantId}`]: nextValue };
  };

  // Keep ref in sync with combinations state
  useEffect(() => {
    combinationsRef.current = combinations;
  }, [combinations]);

  // Rebuild combinations only when user clicks Refresh (or initial load).
  useEffect(() => {
    if (variationRefreshTick === 0) return;

    const validVariants = variants.filter(v => v.variantType && v.options.some(opt => opt.name));
    
    if (validVariants.length === 0) {
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
      return;
    }

    // Generate cartesian product
    const cartesian = (arrays: string[][]): string[][] => {
      if (arrays.length === 0) return [];
      if (arrays.length === 1) return arrays[0].map(item => [item]);
      const [first, ...rest] = arrays;
      const restProduct = cartesian(rest);
      return first.flatMap(item => restProduct.map(combination => [item, ...combination]));
    };

    const optionArrays = validVariants.map(v => v.options.filter(opt => opt.name).map(opt => opt.name));
    const combinationsGenerated = cartesian(optionArrays);
    
    // Preserve existing row inputs by keying combinations on stable variant ids + values
    // (so renaming variantType doesn't reset the whole row).
    const keyFor = (valsByVariantId: Record<string, string>, variantIds: string[]) =>
      variantIds.map((id) => `${id}:${valsByVariantId[id] ?? 'None'}`).join('|');

    const variantIdsInOrder = validVariants.map((v) => v.id);

    const existingFullKeyMap = new Map<string, Combination>();
    const existingPrefixKeyMap = new Map<string, Combination>();

    combinationsRef.current.forEach((combo) => {
      const valsByVariantId: Record<string, string> = {};
      validVariants.forEach((variant) => {
        const v = combo[`variant_${variant.id}`];
        if (typeof v === 'string' && v.trim() !== '') valsByVariantId[variant.id] = v;
      });

      // Full key (missing values treated as "None")
      existingFullKeyMap.set(keyFor(valsByVariantId, variantIdsInOrder), combo);

      // Prefix keys allow preserving inputs when new variant dimensions are added later.
      for (let len = variantIdsInOrder.length; len >= 1; len -= 1) {
        const prefixIds = variantIdsInOrder.slice(0, len);
        const prefixKey = keyFor(valsByVariantId, prefixIds);
        if (!existingPrefixKeyMap.has(prefixKey)) existingPrefixKeyMap.set(prefixKey, combo);
      }
    });

    const usedSourceIds = new Set<string>();
    const makeStableId = (fullKey: string) => `combination-${fullKey}`;

    const newCombinations: Combination[] = combinationsGenerated.map((combinationValues, index) => {
      const valsByVariantId: Record<string, string> = {};
      validVariants.forEach((variant, idx) => {
        valsByVariantId[variant.id] = combinationValues[idx];
      });

      const fullKey = keyFor(valsByVariantId, variantIdsInOrder);
      const stableId = makeStableId(fullKey);

      let combinationData: Combination | undefined = existingFullKeyMap.get(fullKey);
      if (!combinationData) {
        // Fallback: try to match prefix (helps when a new variant dimension is introduced)
        for (let len = variantIdsInOrder.length - 1; len >= 1; len -= 1) {
          const prefixIds = variantIdsInOrder.slice(0, len);
          const prefixKey = keyFor(valsByVariantId, prefixIds);
          const found = existingPrefixKeyMap.get(prefixKey);
          if (found) {
            combinationData = found;
            break;
          }
        }
      }

      // Always create a fresh object with a unique id.
      // If we matched an existing combo, copy its editable fields; never reuse the same source twice.
      const canCopyFromExisting =
        combinationData && typeof combinationData.id === 'string' && !usedSourceIds.has(combinationData.id);
      if (canCopyFromExisting && combinationData?.id) usedSourceIds.add(combinationData.id);

      const base: Combination = canCopyFromExisting
        ? {
            id: stableId,
            sku: combinationData!.sku ?? '',
            purchasePrice: combinationData!.purchasePrice ?? '',
            sellingPrice: combinationData!.sellingPrice ?? '',
            originalSellingPrice: combinationData!.originalSellingPrice,
            dbSellingPrice: combinationData!.dbSellingPrice,
            moq: combinationData!.moq,
            stockQuantity: combinationData!.stockQuantity ?? 0,
            lowStockThreshold: combinationData!.lowStockThreshold ?? 0,
            stockStatus: (combinationData!.stockStatus ?? 'In Stock') as 'In Stock' | 'Low Stock' | 'Out of Stock',
            variantName: '',
          }
        : {
            id: stableId,
            sku: '',
            purchasePrice: '',
            sellingPrice: '',
            moq: undefined,
            stockQuantity: 0,
            lowStockThreshold: 0,
            stockStatus: 'In Stock' as const,
            variantName: '',
          };

      // Set variant values (dynamic columns)
      validVariants.forEach((variant, idx) => {
        base[`variant_${variant.id}`] = combinationValues[idx];
      });

      // Generate variant name
      const variantName = validVariants
        .map((v, idx) => `${v.variantType}: ${combinationValues[idx]}`)
        .join(' | ');
      base.variantName = variantName;

      return base;
    });
    
    setCombinations(newCombinations);
  }, [variationRefreshTick]);


  const handleImageUpload = async (files: FileList) => {
    setUploadingImages(true);
    
    const maxFileSize = 5 * 1024 * 1024; // 5MB
    const maxImages = 10;
    
    // Validate total image count first
    if (formData.images.length + files.length > maxImages) {
      alert(`Maximum ${maxImages} images allowed. You currently have ${formData.images.length} images. Please remove some images first.`);
      setUploadingImages(false);
      return;
    }
    
    const uploadedImages: string[] = [];
    
    for (const file of Array.from(files)) {
      // Validate file type
      if (!file.type.startsWith('image/')) {
        alert(`File "${file.name}" is not an image. Please select only image files.`);
        continue;
      }
      
      // Validate file size
      if (file.size > maxFileSize) {
        alert(`File "${file.name}" is too large. Maximum size is 5MB.`);
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
        alert(`Failed to upload "${file.name}": ${error instanceof Error ? error.message : 'Unknown error'}`);
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
    if (!user?.id || !product?.id) {
      alert('User not authenticated or product not found');
      return;
    }

    setSaving(true);
    
    try {
      const UNPUBLISH_PRODUCT_MUTATION = `
        mutation UpdateProduct(
          $userId: Int!
          $productId: String!
          $status: String!
        ) {
          updateProduct(
            userId: $userId
            productId: $productId
            status: $status
          ) {
            id
            productId
            status
          }
        }
      `;

      const result = await fetchGraphQL<{ updateProduct: { id: number; productId: string; status: string } }>(UNPUBLISH_PRODUCT_MUTATION, {
        userId: user.id,
        productId: product.productId,
          status: 'Draft',
      });

        // Also update marketplace status to unpublished
        try {
          await fetchGraphQL(MARKETPLACE_STATUS_MUTATION, {
              userId: user.id,
            productId: product.productId,
            action: 'unpublish',
          });
        } catch (marketplaceError) {
          // Don't fail the entire operation, just warn
          console.warn('Failed to unpublish product from marketplace', marketplaceError);
        }

      // Optimistically update local state immediately
      if (result?.updateProduct) {
        setFormData(prev => ({ ...prev, status: 'Draft' }));
        prevProductStatusRef.current = 'Draft';
      }

        // Show success modal and reload page
        setShowSuccessModal(true);
        setTimeout(() => {
          setShowSuccessModal(false);
        // Force complete page reload to get fresh data
          window.location.href = window.location.href;
        }, 1000);
    } catch (error) {
      alert('Error unpublishing product. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleSubmitWithStatus = async (status: 'Draft' | 'Published') => {
    if (!user?.id) {
      alert('User not authenticated');
      return;
    }

    setSaving(true);
    
    try {
      const finalData: ProductFormData = {
        ...formData,
        status: status
      };

      // Guardrail warning: removing variants can affect existing orders.
      // Backend will archive (deactivate) ordered variants instead of deleting, but we still warn upfront.
      if (currentMode === 'edit' && product?.variantOptions && product.variantOptions.length > 0) {
        const previousNames = new Set(
          product.variantOptions.map((vo) => (vo?.variantName ? String(vo.variantName) : '')).filter(Boolean),
        );
        const nextNames = new Set(
          (combinations || []).map((c) => (c?.variantName ? String(c.variantName) : '')).filter(Boolean),
        );
        const removed = Array.from(previousNames).filter((name) => !nextNames.has(name));
        if (removed.length > 0) {
          const ok = window.confirm(
            `You are removing ${removed.length} variant option(s).\n\n` +
              `If any of these variants are referenced by existing orders, they will be archived (deactivated) instead of deleted to preserve order history.\n\n` +
              `Continue?`,
          );
          if (!ok) {
            setSaving(false);
            return;
          }
        }
      }

      // Generate product ID in LKP format if not exists
      if (!finalData.productId && currentMode === 'add') {
        finalData.productId = generateLKPProductId();
      }

      // Calculate total stock from combinations
      const totalStock = combinations.reduce((sum, combo) => sum + combo.stockQuantity, 0);
      const lowStockThreshold = combinations.reduce((max, combo) => Math.max(max, combo.lowStockThreshold), 0);
      const hasLowStock = combinations.some(combo => combo.stockQuantity < combo.lowStockThreshold);
      const hasOutOfStock = combinations.some(combo => combo.stockQuantity === 0);
      const stockStatus = hasOutOfStock ? 'Out of Stock' : hasLowStock ? 'Low Stock' : 'In Stock';

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
      };

      // Only include variant definitions if variants exist and are not empty
      if (variants && variants.length > 0) {
        payload.variantDefinitions = variants.map((variant, index) => ({
          variantType: variant.variantType,
          options: variant.options.map(opt => opt.name).filter(name => name),
          position: index + 1
        }));
      }

      // Only include variant options if combinations exist and are not empty
      if (combinations && combinations.length > 0) {
        payload.variantOptions = combinations.map(combo => ({
          variantName: combo.variantName,
          attributes: Object.fromEntries(
            variants.map((variant) => {
              const key = variant.variantType;
              const lowerKey = `variant_${String(key).toLowerCase()}`;
              const idKey = `variant_${variant.id}`;
              const value = (combo as Record<string, unknown>)[lowerKey] ?? (combo as Record<string, unknown>)[idKey] ?? 'None';
              return [key, value];
            })
          ),
          sku: combo.sku,
          // Convert purchasePrice and sellingPrice to strings (accept both number and string)
          purchasePrice: typeof combo.purchasePrice === 'number' 
            ? String(combo.purchasePrice) 
            : String(combo.purchasePrice || '0'),
          sellingPrice: typeof combo.sellingPrice === 'number'
            ? String(combo.sellingPrice)
            : String(combo.sellingPrice || '0'),
          originalSellingPrice: combo.originalSellingPrice 
            ? (typeof combo.originalSellingPrice === 'number' 
                ? String(combo.originalSellingPrice) 
                : String(combo.originalSellingPrice))
            : null,
          moq: combo.moq,
          stockQuantity: combo.stockQuantity,
          lowStockThreshold: combo.lowStockThreshold,
          stockStatus: combo.stockStatus as 'In Stock' | 'Low Stock' | 'Out of Stock',
          isDefault: false,
          isActive: true
        }));
      }

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
          alert('Cannot update product: Missing product ID');
          setSaving(false);
          return;
        }

        // Include catalogName only if it exists
        if (payload.catalogName) {
          updateVariables.catalogName = payload.catalogName;
        }

        // Only include variantDefinitions if provided and not empty
        const variantDefs = payload.variantDefinitions;
        if (variantDefs && Array.isArray(variantDefs) && variantDefs.length > 0) {
          updateVariables.variantDefinitions = variantDefs;
        }

        // Only include variantOptions if provided and not empty
        const variantOpts = payload.variantOptions;
        if (variantOpts && Array.isArray(variantOpts) && variantOpts.length > 0) {
          updateVariables.variantOptions = variantOpts;
        }

        try {
          const data = await fetchGraphQL<{ updateProduct: Product }>(UPDATE_PRODUCT_MUTATION, updateVariables);
          savedProduct = data.updateProduct;
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Failed to update product';
          setVariantGuardModal({
            title: 'Update blocked',
            message: errorMessage,
          });
          setSaving(false);
          return;
        }
      } else if (currentMode === 'edit') {
        alert('Cannot edit product: Missing product ID');
        setSaving(false);
        return;
      }

      if (savedProduct) {
        
        // If publishing, also update marketplace status
        if (status === 'Published') {
          try {
            await fetchGraphQL(MARKETPLACE_STATUS_MUTATION, {
                userId: user.id,
              productId: savedProduct.productId,
              action: 'publish',
            });
          } catch (marketplaceError) {
            // Don't fail the entire operation, just warn
            console.warn('Failed to publish product to marketplace', marketplaceError);
          }
        }
        
        if (currentMode === 'edit') {
          // Show success modal and reload page
          // Update originalFormData to match current formData - this will make hasUnsavedChanges false
          setOriginalFormData(JSON.parse(JSON.stringify(formData)));
          setShowSuccessModal(true);
          setTimeout(() => {
            setShowSuccessModal(false);
            // Force complete page reload
            window.location.href = window.location.href;
          }, 500);
        } else if (onSave) {
          onSave(savedProduct);
        } else {
          // Navigate back to products page for add mode
          router.push('/products');
        }
      }
    } catch (error) {
      alert('Error saving product. Please try again.');
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

  // Disable price editing when product has any connected offer (discount or promotion)
  const isOfferConnected = Boolean(product && (
    (product as { hasActiveOffer?: boolean }).hasActiveOffer ||
    (product as { offerBadge?: string }).offerBadge ||
    (product as { discountType?: unknown }).discountType ||
    (product as { promotionDetails?: unknown }).promotionDetails
  ));

  // Validation function to check if all required fields are filled
  const validateRequiredFields = () => {
    const requiredFields = [
      { field: 'sku', value: formData.sku, name: 'SKU Number' },
      { field: 'name', value: formData.name, name: 'Product Name' },
      { field: 'description', value: formData.description, name: 'Product Description' },
      { field: 'productType', value: formData.productType, name: 'Product Type' },
      { field: 'brand', value: formData.brand, name: 'Brand' },
      { field: 'supplier', value: formData.supplier, name: 'Supplier' },
      { field: 'images', value: formData.images, name: 'Product Images' }
    ];

    // Check if combinations are properly configured
    const variantValidation = combinations.length > 0 && combinations.every(combo => 
      combo.purchasePrice && String(combo.purchasePrice).trim() !== '' &&
      combo.sellingPrice && String(combo.sellingPrice).trim() !== ''
    );

    // Check if all combinations have valid stock
    const stockValidation = combinations.every(combo => combo.stockQuantity >= 0);

    const missingFields = requiredFields.filter(field => {
      if (field.field === 'images') {
        return !field.value || (Array.isArray(field.value) && field.value.length === 0);
      }
      return !field.value || String(field.value).trim() === '';
    });

    // Add variant validation to missing fields
    if (!variantValidation) {
      missingFields.push({ field: 'variants', value: '', name: 'Product Variants' });
    }

    // Add stock validation to missing fields
    if (!stockValidation) {
      missingFields.push({ field: 'stock', value: '', name: 'Product Stock' });
    }

    return {
      isValid: missingFields.length === 0,
      missingFields: missingFields.map(f => f.name)
    };
  };

  const validation = validateRequiredFields();

  return (
    <div className="w-full mx-auto bg-white rounded-lg border border-[#e6e6e6]">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-[#e6e6e6]">
        <div className="flex items-center gap-4">
          <button
            onClick={() => {
              if (currentMode === 'edit' && hasUnsavedChanges) {
                if (confirm('You have unsaved changes. Are you sure you want to leave?')) {
                  router.push('/products');
                }
              } else {
                router.push('/products');
              }
            }}
            className="flex items-center gap-2 px-3 py-2 text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </button>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-gray-900">
              {currentMode === 'add' && 'Add New Product'}
              {currentMode === 'view' && 'Product Details'}
              {currentMode === 'edit' && 'Edit Product'}
            </h1>
            {currentMode === 'view' && currentProductStatus === 'Published' && (
              <span className="px-3 py-1 bg-green-100 text-green-600 text-sm font-semibold rounded-full">
                Published
              </span>
            )}
            {product?.offerBadge && (
              <>
                {product.offerBadge === 'All Offers' ? (
                  <>
                    <span className="px-3 py-1 text-sm font-semibold rounded-full bg-red-100 text-red-700">
                      Discount
                    </span>
                    <span className="px-3 py-1 text-sm font-semibold rounded-full bg-purple-100 text-purple-700">
                      Promotion
                    </span>
                  </>
                ) : (
                  <span className={`px-3 py-1 text-sm font-semibold rounded-full ${
                    product.offerBadge === 'Discount' ? 'bg-red-100 text-red-700' :
                    product.offerBadge === 'Promotion' ? 'bg-purple-100 text-purple-700' :
                    'bg-blue-100 text-blue-700'
                  }`}>
                    {product.offerBadge}
                  </span>
                )}
              </>
            )}
            {currentMode === 'edit' && hasUnsavedChanges && (
              <span className="text-sm text-orange-600 font-medium">• Unsaved changes</span>
            )}
          </div>
          {currentMode === 'view' && currentProductStatus === 'Published' && (
            <div className="flex items-center justify-end gap-3">
              <div className="flex gap-2 px-3 py-2 bg-orange-50 border border-orange-200 rounded-lg">
                <Info className="w-4 h-4 text-orange-600" />
                <span className="text-sm text-orange-700 font-medium">
                  To edit, you need to unpublish this product in the marketplace.
                </span>
              </div>
            </div>
          )}
        </div>
        <div className="flex items-center gap-3">
          {currentMode === 'view' && currentProductStatus === 'Published' && (
            <>
              <button
                type="button"
                onClick={handleUnpublish}
                disabled={saving}
                className="flex items-center gap-2 px-4 py-2 font-semibold bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    Delisting...
                  </>
                ) : (
                  <>
                    <X className="w-4 h-4" />
                    Unpublish
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
                className="flex items-center gap-2 px-4 py-2 text-gray-600 hover:text-black hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed border border-gray-300"
              >
                <X className="w-4 h-4" />
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleSubmitWithStatus('Draft')}
                disabled={saving}
                className="flex items-center gap-2 px-4 py-2 font-medium bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    Save Draft
                  </>
                )}
              </button>
              <button
                type="submit"
                form="product-form"
                disabled={saving || !validation.isValid}
                className="flex items-center gap-2 px-4 py-2 font-semibold bg-[#0a61d7] text-white rounded-lg hover:bg-[#0851b8] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                title={!validation.isValid ? `Missing required fields: ${validation.missingFields.join(', ')}` : ''}
              >
                {saving ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    Saving...
                  </>
                ) : (
                  <>
                    <CheckCircle className="w-5 h-5" />
                    Save and Publish
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
                className="flex items-center gap-2 px-4 py-2 text-gray-600 hover:text-black hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed border border-gray-300"
              >
                <X className="w-4 h-4" />
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleSubmitWithStatus('Draft')}
                disabled={saving}
                className="flex items-center gap-2 px-4 py-2 font-medium bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    Save Draft
                  </>
                )}
              </button>
              <button
                type="submit"
                form="product-form"
                disabled={saving || !validation.isValid}
                className="flex items-center gap-2 px-4 py-2 bg-[#0a61d7] font-semibold text-white rounded-lg hover:bg-[#084ba6] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                title={!validation.isValid ? `Missing required fields: ${validation.missingFields.join(', ')}` : ''}
              >
                {saving ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    Saving...
                  </>
                ) : (
                  <>
                    <CheckCircle className="w-4 h-4" />
                    Save and Publish
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
            Create a new product by filling out the form below. All fields marked with descriptions are required for proper product cataloging.
          </p>
        )}
        {currentMode === 'view' && (
          <p className="text-sm text-gray-600">
            View detailed information about this product. You can see all product specifications, images, and current status.
          </p>
        )}
        {currentMode === 'edit' && (
          <p className="text-sm text-gray-600">
            Modify existing product information. Update any fields as needed and save your changes to the product catalog.
          </p>
        )}
      </div>

      {/* Profile Completion Progress */}
      {(currentMode === 'view' || currentMode === 'edit' || currentMode === 'add') && (
        <div className="mx-4 mt-4 mb-4 p-4 bg-gradient-to-r from-blue-50 to-amber-50 border border-blue-200 rounded-lg">
          {(() => {
            // Calculate completion progress - use formData for all modes
            const dataSource = currentMode === 'add' ? formData : product;
            const requiredFields = [
              { name: 'SKU Number', value: String(dataSource?.sku || '').trim() },
              { name: 'Product Name', value: String(dataSource?.name || '').trim() },
              { name: 'Description', value: String(dataSource?.description || '').trim() },
              { name: 'Category', value: String(dataSource?.productType || '').trim() },
              { name: 'Brand', value: String(dataSource?.brand || '').trim() },
              { name: 'Supplier', value: String(dataSource?.supplier || '').trim() },
              { name: 'Product Images', value: dataSource?.images && dataSource?.images.length > 0 },
              { name: 'Product Variants', value: combinations.length > 0 && combinations.every(combo => 
                combo.purchasePrice && String(combo.purchasePrice).trim() !== '' &&
                combo.sellingPrice && String(combo.sellingPrice).trim() !== ''
              ) },
              { name: 'Product Stock', value: combinations.length > 0 }
            ];
            
            const completedFields = requiredFields.filter(field => 
              typeof field.value === 'boolean' ? field.value : field.value !== ''
            );
            const totalFields = requiredFields.length;
            const completionPercentage = Math.round((completedFields.length / totalFields) * 100);
            const missingFields = requiredFields.filter(field => 
              typeof field.value === 'boolean' ? !field.value : field.value === ''
            );
            
            return (
              <>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-semibold text-gray-800">Product Catalog Completion</h3>
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
                  {completedFields.length} of {totalFields} fields completed
                  {missingFields.length > 0 && (
                    <span className="ml-2 text-amber-700">
                      • Missing: {missingFields.map(field => field.name).join(', ')}
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
              General Information
            </h2>
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-2">
                    Product ID
                  </label>
                  <input
                    type="text"
                    value={formData.productId || ''}
                    disabled={true}
                    className="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0a61d7] focus:border-transparent disabled:bg-gray-50 text-black"
                    placeholder="Auto-generated Product ID"
                  />
                  {currentMode === 'add' && (
                    <p className="text-xs text-gray-500 mt-1">Product ID is automatically generated in LKP format</p>
                  )}
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-2">
                    SKU Number
                  </label>
                  <input
                    type="text"
                    value={formData.sku}
                    onChange={(e) => handleInputChange('sku', e.target.value)}
                    disabled={isViewMode}
                    className="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0a61d7] focus:border-transparent disabled:bg-gray-50 text-black"
                    placeholder="Enter SKU"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-2">
                    Brand
                  </label>
                  <input
                    type="text"
                    value={formData.brand}
                    onChange={(e) => handleInputChange('brand', e.target.value)}
                    disabled={isViewMode}
                    className="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0a61d7] focus:border-transparent disabled:bg-gray-50 text-black"
                    placeholder="Enter brand"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-2">
                    Type
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
                              const IconComponent = getCategoryIconComponent(formData.productType);
                              return (
                                <span style={{ color: selectedCategory?.color }}>
                                  <IconComponent className="w-4 h-4" />
                                </span>
                              );
                            })()}
                            <span className="text-black">{getSelectedCategory(formData.productType)?.label || formData.productType}</span>
                          </>
                        ) : (
                          <span className="text-gray-500">Select category</span>
                        )}
                      </span>
                      <ChevronDown className="w-4 h-4 text-gray-400" />
                    </button>
                    
                    {showGeneralCategoryDropdown && !isViewMode && (
                      <div className="absolute z-50 w-full mt-1 bg-white border border-[#e6e6e6] rounded-lg shadow-lg max-h-60 overflow-y-auto">
                        {availableCategories.map((category) => {
                          const IconComponent = getCategoryIconComponent(category.value);
                          return (
                            <button
                              key={category.value}
                              type="button"
                              onClick={() => handleCategorySelect(category.value, 'productType')}
                              className="w-full px-3 py-2 text-xs text-left hover:bg-gray-100 flex items-center gap-2"
                            >
                              <span style={{ color: category.color }}>
                                <IconComponent className="w-4 h-4" />
                              </span>
                              <span className="text-black">{category.label}</span>
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
                    Product Name
                  </label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => handleInputChange('name', e.target.value)}
                    disabled={isViewMode}
                    className="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0a61d7] focus:border-transparent disabled:bg-gray-50 text-black"
                    placeholder="Enter product name"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-2">
                    Supplier
                  </label>
                  <input
                    type="text"
                    value={formData.supplier}
                    onChange={(e) => handleInputChange('supplier', e.target.value)}
                    disabled={isViewMode}
                    className="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0a61d7] focus:border-transparent disabled:bg-gray-50 text-black"
                    placeholder="Enter supplier"
                  />
                </div>
              </div>
              
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-2">
                  Product Description
                </label>
                <textarea
                  value={formData.description}
                  onChange={(e) => handleInputChange('description', e.target.value)}
                  disabled={isViewMode}
                  rows={3}
                  className="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0a61d7] focus:border-transparent disabled:bg-gray-50 text-black"
                  placeholder="Enter product description"
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
                    <span>Halal Certified</span>
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
                    <span>BPOM Approved</span>
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
                    <span>Original Product</span>
                  </label>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-2">Return Policy (days)</label>
                    <input
                      type="number"
                      min="0"
                      value={formData.returnPolicyDays ?? 7}
                      onChange={(e) => handleInputChange('returnPolicyDays', parseInt(e.target.value) || 0)}
                      disabled={isViewMode}
                      className="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0a61d7] focus:border-transparent disabled:bg-gray-50 text-black"
                      placeholder="7"
                    />
                  </div>
                </div>
              </div>

              {/* Buy X Get Y Promotion Notice */}
              {product?.promotionDetails && (
                <div className="mt-4 p-4 bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200 rounded-lg">
                  <div className="flex items-start gap-3">
                    <div className="flex-shrink-0">
                      <div className="w-8 h-8 bg-green-500 rounded-full flex items-center justify-center">
                        <Gift className="w-4 h-4 text-white" />
                      </div>
                    </div>
                    <div className="flex-1">
                      <h4 className="text-sm font-semibold text-green-900 mb-1">
                        Active Promotion: Buy X Get Y
                      </h4>
                      <p className="text-xs text-green-800 mb-2">
                        {product.promotionDetails.description}
                      </p>
                      <div className="flex items-center gap-4 text-xs">
                        <div className="flex items-center gap-1">
                          <span className="font-medium text-green-900">Buy:</span>
                          <span className="px-2 py-0.5 bg-green-200 text-green-900 rounded font-semibold">
                            {product.promotionDetails.minQuantity} items
                          </span>
                        </div>
                        <div className="flex items-center gap-1">
                          <span className="font-medium text-green-900">Get Free:</span>
                          <span className="px-2 py-0.5 bg-green-200 text-green-900 rounded font-semibold">
                            {product.promotionDetails.freeQuantity} item{product.promotionDetails.freeQuantity > 1 ? 's' : ''}
                          </span>
                        </div>
                      </div>
                      <p className="text-xs text-green-700 mt-2 flex items-center gap-1">
                        <Info className="w-4 h-4 text-green-500" /> <span className="italic">Customers must purchase at least {product.promotionDetails.minQuantity} items to receive {product.promotionDetails.freeQuantity} free item{product.promotionDetails.freeQuantity > 1 ? 's' : ''}.</span>
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Row 2: Upload Images (3/4) + Product Settings (1/4) */}
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
            {/* Upload Images - 3/4 width */}
            <div className="lg:col-span-3 bg-white rounded-lg border border-[#e6e6e6] p-4">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-md font-semibold text-gray-900 flex items-center gap-2">
                  <Upload className="w-5 h-5 text-gray-500" />
                  Upload Images
                </h2>
                {!isViewMode && formData.images.length > 0 && (
                  <button
                    type="button"
                    onClick={clearAllImages}
                    className="text-xs text-red-500 hover:text-red-700 font-medium"
                  >
                    Clear All
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
                          alt="Main product" 
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
                          {isDragOver ? 'Drop images here' : 'Drag & drop or click to upload'}
                        </p>
                        <p className="text-xs text-gray-400 mt-1">Supports: JPG, PNG, GIF (Max 5MB)</p>
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
                  <div className="text-xs text-gray-500 mb-2">Additional Images</div>
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
                        <img src={image} alt={`Product ${index + 2}`} className="w-full h-full object-cover" />
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
                  <span>Uploading images...</span>
                </div>
              )}
              {/* Image Count Info */}
              <div className="flex items-center justify-between mt-4">
                <div className="text-xs text-gray-500">
                  {formData.images.length}/10 images uploaded
                </div>
              </div>
            </div>

            {/* Product Settings - 1/4 width */}
            <div className="lg:col-span-2 bg-white rounded-lg border border-[#e6e6e6] p-4">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-md font-semibold text-gray-900 flex items-center gap-2">
                  <Tag className="w-5 h-5 text-gray-500" />
                  Product Settings
                </h2>
              </div>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-2">
                    Product Type
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
                              const IconComponent = getCategoryIconComponent(formData.productType);
                              return (
                                <span style={{ color: selectedCategory?.color }}>
                                  <IconComponent className="w-4 h-4" />
                                </span>
                              );
                            })()}
                            <span className="text-black">{getSelectedCategory(formData.productType)?.label || formData.productType}</span>
                          </>
                        ) : (
                          <span className="text-gray-500">Select category</span>
                        )}
                      </span>
                      <ChevronDown className="w-4 h-4 text-gray-400" />
                    </button>
                    
                    {showCatalogCategoryDropdown && !isViewMode && (
                      <div className="absolute z-50 w-full mt-1 bg-white border border-[#e6e6e6] rounded-lg shadow-lg max-h-40 overflow-y-auto">
                        {availableCategories.map((category) => {
                          const IconComponent = getCategoryIconComponent(category.value);
                          return (
                            <button
                              key={category.value}
                              type="button"
                              onClick={() => handleCategorySelect(category.value, 'productType')}
                              className="w-full px-3 py-2 text-xs text-left hover:bg-gray-100 flex items-center gap-2"
                            >
                              <span style={{ color: category.color }}>
                                <IconComponent className="w-4 h-4" />
                              </span>
                              <span className="text-black">{category.label}</span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
                
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-2">
                    Product Category (by Channel)
                  </label>
                  <input
                    type="text"
                    value={formData.productCategory}
                    onChange={(e) => handleInputChange('productCategory', e.target.value)}
                    disabled={isViewMode}
                    className="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0a61d7] focus:border-transparent disabled:bg-gray-50 text-black"
                    placeholder="e.g., Wholesale, Retail"
                  />
                </div>
                
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-2">
                    Catalog Name
                  </label>
                  <input
                    type="text"
                    value={formData.catalogName}
                    onChange={(e) => handleInputChange('catalogName', e.target.value)}
                    disabled={isViewMode}
                    className="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0a61d7] focus:border-transparent disabled:bg-gray-50 text-black"
                    placeholder="e.g., Daily Essentials"
                  />
                </div>
                
                <div className="text-xs text-gray-500 italic pt-2 border-t border-[#e6e6e6]">
                  All Product Types input will be added as a new filter.
                </div>
              </div>
            </div>
          </div>

          {/* Row 3: Product Stock Summary - Full Width */}
          <div className="bg-white rounded-lg border border-[#e6e6e6] p-4">
            <div className="mb-6">
              <h2 className="text-md font-semibold text-gray-900 flex items-center gap-2 mb-4">
                <Package className="w-5 h-5 text-gray-500" />
                Product Stock Summary
                <span className="text-xs text-gray-500 font-normal">(Computed from all variants)</span>
              </h2>
              
              {/* Product-Level Stock Summary (Read-Only) */}
              <div className="p-4 bg-gray-50 rounded-lg">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-2">
                      Total Stock (Pieces)
                    </label>
                    <div className="px-3 py-2 text-xs border border-gray-300 rounded-lg bg-white text-gray-900 font-medium">
                      {combinations.reduce((sum, combo) => sum + combo.stockQuantity, 0).toLocaleString()}
                    </div>
                    <p className="text-xs text-gray-500 mt-1">Sum of all combination stocks</p>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-2">
                      Low Stock Threshold
                    </label>
                    <div className="px-3 py-2 text-xs border border-gray-300 rounded-lg bg-white text-gray-900 font-medium">
                      {combinations.reduce((max, combo) => Math.max(max, combo.lowStockThreshold), 0).toLocaleString()}
                    </div>
                    <p className="text-xs text-gray-500 mt-1">Minimum threshold across combinations</p>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-2">
                      Overall Status
                    </label>
                    <div className={`px-3 py-2 text-xs border rounded-lg font-medium ${
                      (() => {
                        const hasLowStock = combinations.some(combo => combo.stockQuantity < combo.lowStockThreshold);
                        const hasOutOfStock = combinations.some(combo => combo.stockQuantity === 0);
                        const status = hasOutOfStock ? 'Out of Stock' : hasLowStock ? 'Low Stock' : 'In Stock';
                        return status;
                      })() === 'Out of Stock' 
                        ? 'bg-red-50 border-red-200 text-red-800'
                        : (() => {
                            const hasLowStock = combinations.some(combo => (combo.stockQuantity || 0) < (combo.lowStockThreshold || 0));
                            const hasOutOfStock = combinations.some(combo => (combo.stockQuantity || 0) === 0);
                            const status = hasOutOfStock ? 'Out of Stock' : hasLowStock ? 'Low Stock' : 'In Stock';
                            return status;
                          })() === 'Low Stock'
                        ? 'bg-yellow-50 border-yellow-200 text-yellow-800'
                        : 'bg-green-50 border-green-200 text-green-800'
                    }`}>
                      {(() => {
                        const hasLowStock = combinations.some(combo => combo.stockQuantity < combo.lowStockThreshold);
                        const hasOutOfStock = combinations.some(combo => combo.stockQuantity === 0);
                        const status = hasOutOfStock ? 'Out of Stock' : hasLowStock ? 'Low Stock' : 'In Stock';
                        return status;
                      })()}
                    </div>
                    <p className="text-xs text-gray-500 mt-1">Overall product status</p>
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
                        Product variants and the variation list are locked because this product has an active offer. To modify them, first deactivate or disconnect the offer from the product.
                      </div>
                    </div>
                  </div>
                )}
                <h2 className="text-md font-semibold text-gray-900 flex items-center gap-2">
                  <DollarSign className="w-5 h-5 text-gray-500" />
                  Product Variants
                  <span className="text-xs text-gray-500 font-normal">(Define variants and options)</span>
                </h2>
                <p className="mt-2 text-xs text-gray-600">
                  Please define a <span className="font-semibold">clear and complete</span> variant structure first.
                  Avoid frequent changes unless required, because editing variants can impact existing variant lists and order integrity.
                </p>
              </div>

            {/* Simplified Variants Input */}
            <div className="space-y-4 mb-6">
              {variants.map((variant, index) => (
                <div key={variant.id} className="border border-[#e6e6e6] rounded-lg bg-white p-4">
                  <div className="flex items-start justify-between gap-4 mb-4">
                    <div className="flex items-center gap-4 flex-1">
                      <div className="w-48">
                        <label className="block text-xs font-medium text-gray-700 mb-1">
                          Variant Type
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
                          placeholder="e.g., Color, Size, Flavor"
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
                            title="Move up"
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
                            title="Move down"
                          >
                            <ChevronDown className="w-4 h-4" />
                          </button>
                        )}
                        {variants.length > 1 && index > 0 && (
                        <button
                          type="button"
                            onClick={() => removeVariant(variant.id)}
                          className="text-red-500 hover:text-red-700 p-1"
                            title="Remove variant"
                        >
                          <X className="w-4 h-4" />
                        </button>
                        )}
                      </div>
                      )}
                    </div>
                    
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-2">
                      Options
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
                            placeholder="e.g., White"
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
                          Add Option
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
                  Add Variant Type
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
                      Prices are locked because this product has an active offer. To modify prices, first deactivate or disconnect the offer from the product.
                    </div>
                  </div>
                </div>
              )}
              <div className="mb-4">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-md font-semibold text-gray-900 flex items-center gap-2">
                    <Package className="w-5 h-5 text-gray-500" />
                    Variation Lists
                  </h2>
                  {!isViewMode && (
                    <button
                      type="button"
                      disabled={isOfferConnected}
                      onClick={() => setVariationRefreshTick((v) => v + 1)}
                      className="inline-flex items-center gap-2 px-3 py-2 text-xs font-semibold rounded-lg bg-white text-gray-700 border border-gray-200 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                      title="Refresh variation table"
                    >
                      <RefreshCw className="w-4 h-4" />
                      Refresh
                    </button>
                  )}
                </div>
                <p className="mt-2 text-xs text-gray-600">
                  Fill this table carefully. If you need to change variants later, create new variants instead of renaming/deleting ones that were used in past orders.
                </p>
              </div>

              {/* Apply To All Section */}
              {!isViewMode && combinations.length > 0 && (
                <div className="bg-orange-50 rounded-lg p-4 mb-4">
                  <h3 className="text-sm font-semibold text-orange-900 mb-3">Quick Action</h3>
                  <div className="flex gap-3 items-end">
                          <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">
                        SKU
                            </label>
                            <input
                              type="text"
                        id="apply-sku"
                         disabled={isOfferConnected}
                         className="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent text-black disabled:bg-gray-50"
                        placeholder="SKU-001"
                      />
                          </div>
                          <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">
                        Selling Price
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
                        Purchase Price
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
                        MOQ
                              </label>
                      <input
                        type="number"
                        id="apply-moq"
                         disabled={isOfferConnected}
                         className="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent text-black disabled:bg-gray-50"
                        placeholder="0"
                        min="0"
                      />
                            </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">
                        Stock Qty
                      </label>
                                <input
                                  type="number"
                        id="apply-stock"
                         disabled={isOfferConnected}
                         className="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent text-black disabled:bg-gray-50"
                        placeholder="0"
                        min="0"
                      />
                          </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">
                        Low Threshold
                      </label>
                      <input
                        type="number"
                        id="apply-threshold"
                         disabled={isOfferConnected}
                         className="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent text-black disabled:bg-gray-50"
                        placeholder="0"
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
                        
                        setCombinations(prev => prev.map(combo => ({
                          ...combo,
                          sku: sku || combo.sku,
                          sellingPrice: selling || combo.sellingPrice,
                          purchasePrice: purchase || combo.purchasePrice,
                          moq: moq ? parseInt(moq) : combo.moq,
                          stockQuantity: stock ? parseInt(stock) : combo.stockQuantity,
                          lowStockThreshold: threshold ? parseInt(threshold) : combo.lowStockThreshold,
                        })));
                      }}
                       disabled={isOfferConnected}
                       className="bg-orange-500 text-white px-6 py-2 text-sm font-semibold rounded-lg hover:bg-orange-600 transition-colors whitespace-nowrap disabled:bg-orange-300 disabled:cursor-not-allowed"
                    >
                      Apply To All
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
                            {variant.variantType || `Var ${index + 1}`}
                          </th>
                        ))}
                        <th className="text-xs font-semibold text-gray-700 p-3 text-left border-b border-r border-gray-300">
                          SKU
                        </th>
                        <th className="text-xs font-semibold text-gray-700 p-3 text-left border-b border-r border-gray-300">
                          Selling Price
                        </th>
                        <th className="text-xs font-semibold text-gray-700 p-3 text-left border-b border-r border-gray-300">
                          Purchase Price
                        </th>
                        <th className="text-xs font-semibold text-gray-700 p-3 text-left border-b border-r border-gray-300">
                          MOQ
                        </th>
                        <th className="text-xs font-semibold text-gray-700 p-3 text-left border-b border-r border-gray-300">
                          Stock Qty
                        </th>
                        <th className="text-xs font-semibold text-gray-700 p-3 text-left border-b border-r border-gray-300">
                          Low Threshold
                        </th>
                        <th className="w-25 text-xs font-semibold text-gray-700 p-3 text-left border-b border-r border-gray-300">
                          Status
                        </th>
                        {!isViewMode && (
                          <th className="text-xs font-semibold text-gray-700 p-3 text-center border-b border-gray-300">
                            Actions
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
                                 {combination[`variant_${variant.id}` as keyof typeof combination]?.toString() || 'None'}
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
                              placeholder="SKU-001"
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
                              placeholder="0"
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
                              placeholder="0"
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
                              placeholder="0"
                              min="0"
                            />
                          </td>
                          <td className="p-3 border-r border-b border-gray-300">
                            <span className={`text-xs font-medium ${
                              combination.stockStatus === 'Out of Stock' 
                                ? 'text-red-600'
                                : combination.stockStatus === 'Low Stock'
                                ? 'text-yellow-600'
                                : 'text-green-600'
                            }`}>
                              {combination.stockStatus}
                            </span>
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
                                  title="Move up"
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
                                  title="Move down"
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
              <h3 className="text-md font-semibold">Changes Saved Successfully!</h3>
              <p className="text-xs text-white/90">Product has been updated successfully.</p>
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
                          Orders:{' '}
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
              <div className="mt-4 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setVariantGuardModal(null)}
                  className="px-4 py-2 text-xs font-semibold rounded-lg bg-[#0a61d7] text-white hover:bg-[#0851b8] focus:outline-none focus:ring-2 focus:ring-[#0a61d7]/40"
                >
                  OK
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
