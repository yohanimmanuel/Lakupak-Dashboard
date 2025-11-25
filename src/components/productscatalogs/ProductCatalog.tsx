'use client';
import React, { useState, useEffect, useRef } from "react";
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
  ChevronUp,
  ChevronDown
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useUserStore } from "@/store/userStore";
import { Product, ProductFormData } from "@/types/product";
import { getDefaultCurrency, getCurrencySymbol, formatCurrencyAmount } from '@/utils/currencyUtils';
import { formatNumberByCurrency, parseNumberByCurrency, getPricePlaceholder } from '@/config/currencyConfig';
import { getAvailableCategories, getCategoryByValue, getCategoryColor, getCategoryIconComponent } from '@/utils/categoryUtils';
import { getProductTotalStock, getVariantStockStatus } from '@/utils/stockUtils';
import { fetchGraphQL } from '@/lib/graphqlClient';
 

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

  // Final combinations table (manual entry)
  const [combinations, setCombinations] = useState<Combination[]>([]);
  const combinationsRef = useRef<Combination[]>([]);


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
    } else if (product?.legacyVariants && product.legacyVariants.length > 0) {
      // Legacy structure: group variants by type
      const groupedVariants = product.legacyVariants.reduce((acc, variant) => {
        const type = variant.variantType || 'Default';
        if (!acc[type]) {
          acc[type] = {
            id: `variant-${type}`,
            variantType: type,
            moq: variant.moq,
            options: []
          };
        }
        acc[type].options.push({
        id: variant.id?.toString() || Math.random().toString(36).substr(2, 9),
          name: variant.variantName
        });
        return acc;
      }, {} as Record<string, { id: string; variantType: string; moq?: number; options: Array<{ id: string; name: string }> }>);
      
      setVariants(Object.values(groupedVariants));
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
        const base: Combination = {
          id: `combination-${option.id}`,
          variantName: option.variantName,
          sku: option.sku || '',
          purchasePrice: option.purchasePrice || '',
          sellingPrice: option.sellingPrice || '',
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
    } else if (product?.legacyVariants && product.legacyVariants.length > 0) {
      // Legacy structure: convert variants to combinations
      const legacyCombinations: Combination[] = product.legacyVariants.map(variant => ({
        id: `combination-${variant.id}`,
        variantName: variant.variantName,
        sku: variant.sku || '',
        purchasePrice: variant.purchasePrice || '',
        sellingPrice: variant.sellingPrice || '',
        moq: variant.moq,
        stockQuantity: variant.stockQuantity || 0,
        lowStockThreshold: variant.lowStockThreshold || 0,
        stockStatus: variant.stockStatus || 'In Stock'
      }));
      setCombinations(legacyCombinations);
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
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [originalFormData, setOriginalFormData] = useState<ProductFormData | null>(null);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  
  // Internal state management for mode and product status
  const [currentMode, setCurrentMode] = useState(mode);
  const [currentProductStatus, setCurrentProductStatus] = useState(product?.status || 'Draft');

  // Effect to synchronize internal mode/status with props after a refresh
  useEffect(() => {
    if (product) {
      const newStatus = product.status;
      const newMode = newStatus === 'Published' ? 'view' : 'edit';
      
      // Only update if status or mode actually changed
      if (currentProductStatus !== newStatus) {
        setCurrentProductStatus(newStatus);
      }
      if (currentMode !== newMode) {
        setCurrentMode(newMode);
      }
      
      // Update formData with fresh product data only if product actually changed
      const freshFormData = {
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
      
      // Only update form data if it's actually different
      setFormData(prev => {
        const isDifferent = JSON.stringify(prev) !== JSON.stringify(freshFormData);
        return isDifferent ? freshFormData : prev;
      });
      
      setOriginalFormData(JSON.parse(JSON.stringify(freshFormData)));
      setHasUnsavedChanges(false);
    } else {
      if (currentMode !== mode) {
        setCurrentMode(mode);
      }
      if (currentProductStatus !== 'Draft') {
        setCurrentProductStatus('Draft');
      }
    }
  }, [mode, product]);

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

  // Track changes
  useEffect(() => {
    if (mode === 'edit' && originalFormData) {
      const hasChanges = JSON.stringify(formData) !== JSON.stringify(originalFormData);
      setHasUnsavedChanges(hasChanges);
    }
  }, [formData, originalFormData, mode]);

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
      setVariants(prev => prev.filter(variant => variant.id !== variantId));
    }
  };

  const updateVariant = (variantId: string, field: string, value: string | number | undefined) => {
    setVariants(prev => prev.map(variant => {
      if (variant.id === variantId) {
        return { ...variant, [field]: value };
      }
      return variant;
    }));
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

  // Keep ref in sync with combinations state
  useEffect(() => {
    combinationsRef.current = combinations;
  }, [combinations]);

  // Auto-generate combinations when variant options change
  useEffect(() => {
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
    
    // Create a map for existing combinations for efficient lookup
    const existingCombinationsMap = new Map<string, Combination>();
    combinationsRef.current.forEach(combo => {
      const attributes: Record<string, string> = {};
      validVariants.forEach(variant => {
        const variantValue = combo[`variant_${variant.id}`];
        if (typeof variantValue === 'string') {
          attributes[variant.variantType] = variantValue;
        }
      });
      const key = JSON.stringify(attributes); // Use attributes as a unique key
      existingCombinationsMap.set(key, combo);
    });

    const newCombinations: Combination[] = combinationsGenerated.map((combinationValues, index) => {
      const attributes: Record<string, string> = {};
      validVariants.forEach((variant, idx) => {
        attributes[variant.variantType] = combinationValues[idx];
      });
      const key = JSON.stringify(attributes);

      let combinationData: Combination;
      if (existingCombinationsMap.has(key)) {
        // Preserve existing data for this combination
        combinationData = existingCombinationsMap.get(key)!;
        // Remove from map to track which ones are left (i.e., removed)
        existingCombinationsMap.delete(key);
      } else {
        // Create a new combination with default values
        combinationData = {
          id: `combination-${Date.now()}-${index}`, // Ensure unique ID
          sku: '',
          purchasePrice: '',
          sellingPrice: '',
          moq: undefined,
          stockQuantity: 0,
          lowStockThreshold: 0,
          stockStatus: 'In Stock' as const,
          variantName: '' // Will be set below
        };
      }

      // Set variant values (dynamic columns)
      validVariants.forEach((variant, idx) => {
        combinationData[`variant_${variant.id}`] = combinationValues[idx];
      });

      // Generate variant name
      const variantName = validVariants
        .map((v, idx) => `${v.variantType}: ${combinationValues[idx]}`)
        .join(' | ');
      combinationData.variantName = variantName;

      return combinationData;
    });
    
    setCombinations(newCombinations);
  }, [variants]);


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
        // Step 1: Get upload signature from our API
        const signatureResponse = await fetch('/api/upload/image', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            getSignature: true,
            folder: 'products',
          }),
        });

        if (!signatureResponse.ok) {
          throw new Error('Failed to get upload signature');
        }

        const signatureData = await signatureResponse.json();

        // Step 2: Upload directly to Cloudinary
        const formDataUpload = new FormData();
        formDataUpload.append('file', file);
        formDataUpload.append('signature', signatureData.signature);
        formDataUpload.append('timestamp', signatureData.timestamp.toString());
        formDataUpload.append('api_key', signatureData.apiKey);
        formDataUpload.append('folder', signatureData.folder);

        const uploadResponse = await fetch(
          `https://api.cloudinary.com/v1_1/${signatureData.cloudName}/image/upload`,
          {
            method: 'POST',
            body: formDataUpload,
          }
        );

        if (!uploadResponse.ok) {
          const errorData = await uploadResponse.json();
          throw new Error(errorData.error?.message || 'Upload to Cloudinary failed');
        }

        const result = await uploadResponse.json();
        uploadedImages.push(result.secure_url);
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

      await fetchGraphQL(UNPUBLISH_PRODUCT_MUTATION, {
        userId: user.id,
        productId: product.productId,
          status: 'Draft',
      });

        // Also update marketplace status to unpublished
        try {
          const marketplaceResponse = await fetch('/api/marketplace', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              productId: product.productId,
              userId: user.id,
              action: 'unpublish'
            }),
          });

          if (!marketplaceResponse.ok) {
            const marketplaceError = await marketplaceResponse.json();
            // Don't fail the entire operation, just warn
          }
        } catch (marketplaceError) {
          // Don't fail the entire operation, just warn
        }

        // Show success modal and reload page
        setShowSuccessModal(true);
        setTimeout(() => {
          setShowSuccessModal(false);
          // Force complete page reload
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
          alert(`Error updating product: ${errorMessage}`);
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
            const marketplaceResponse = await fetch('/api/marketplace', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                productId: savedProduct.productId,
                userId: user.id,
                action: 'publish'
              }),
            });

            if (!marketplaceResponse.ok) {
              const marketplaceError = await marketplaceResponse.json();
              // Don't fail the entire operation, just warn
            }
          } catch (marketplaceError) {
            // Don't fail the entire operation, just warn
          }
        }
        
        if (currentMode === 'edit') {
          // Show success modal and reload page
          setHasUnsavedChanges(false);
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
      setHasUnsavedChanges(false);
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
    <div className="w-full mx-auto bg-white rounded-lg shadow-sm border border-gray-200">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200">
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
      <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
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
          <div className="bg-white rounded-lg border border-gray-200 p-4">
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
                      <div className="absolute z-50 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-y-auto">
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
            <div className="lg:col-span-3 bg-white rounded-lg border border-gray-200 p-4">
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
                        className="relative w-28 h-20 bg-gray-100 rounded-lg border border-gray-300 overflow-hidden cursor-move hover:shadow-md transition-shadow"
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
            <div className="lg:col-span-2 bg-white rounded-lg border border-gray-200 p-4">
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
                      <div className="absolute z-50 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-40 overflow-y-auto">
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
                    Product Category
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
                
                <div className="text-xs text-gray-500 italic pt-2 border-t border-gray-200">
                  All Product Types input will be added as a new filter.
                </div>
              </div>
            </div>
          </div>

          {/* Row 3: Product Stock Summary - Full Width */}
          <div className="bg-white rounded-lg border border-gray-200 p-4">
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
            <div className="border-t border-gray-200 pt-6">
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
              </div>

            {/* Simplified Variants Input */}
            <div className="space-y-4 mb-6">
              {variants.map((variant, index) => (
                <div key={variant.id} className="border border-gray-200 rounded-lg bg-white p-4">
                  <div className="flex items-start justify-between gap-4 mb-4">
                    <div className="flex items-center gap-4 flex-1">
                      <div className="w-48">
                        <label className="block text-xs font-medium text-gray-700 mb-1">
                          Variant Type
                        </label>
                        <input
                          type="text"
                          value={variant.variantType}
                          onChange={(e) => updateVariant(variant.id, 'variantType', e.target.value)}
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
                            value={option.name}
                            onChange={(e) => updateVariantOption(variant.id, option.id, 'name', e.target.value)}
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
            <div className="border-t border-gray-200 pt-6">
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
                <h2 className="text-md font-semibold text-gray-900 flex items-center gap-2">
                  <Package className="w-5 h-5 text-gray-500" />
                  Variation Lists
                </h2>
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
                          <td className="p-3 border-r border-b border-gray-300">
                            <div className="relative">
                              <div className="absolute left-3 top-1/2 transform -translate-y-1/2 text-xs text-gray-500 pointer-events-none">
                                {currencySymbol}
                              </div>
                              <input
                                type="text"
                                value={String(combination.sellingPrice)}
                                onChange={(e) => updateCombination(combination.id, 'sellingPrice', e.target.value)}
                                disabled={isViewMode || isOfferConnected}
                                className="w-full pl-8 pr-3 py-2 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0a61d7] focus:border-transparent disabled:bg-gray-50 text-black"
                                placeholder={getPricePlaceholder(userCurrency)}
                              />
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
                                onChange={(e) => updateCombination(combination.id, 'purchasePrice', e.target.value)}
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
    </div>
  );
}
