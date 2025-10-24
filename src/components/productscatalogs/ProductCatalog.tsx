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
  Gift
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useUserStore } from "@/store/userStore";
import { Product, ProductFormData } from "@/types/product";
import { getDefaultCurrency, getCurrencySymbol, formatCurrencyAmount } from '@/utils/currencyUtils';
import { formatNumberByCurrency, parseNumberByCurrency, getPricePlaceholder } from '@/config/currencyConfig';
import { getAvailableCategories, getCategoryByValue, getCategoryColor, getCategoryIconComponent } from '@/utils/categoryUtils';
import { ChevronDown } from 'lucide-react';

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

  // Product variants state
  const [variants, setVariants] = useState<Array<{
    id: string;
    variantName: string;
    packageType: string;
    piecesPerPackage: number;
    stockQuantity: number;
    lowStockThreshold: number;
    stockStatus: 'In Stock' | 'Low Stock' | 'Out of Stock';
    purchasePrice: string;
    sellingPrice: string;
    originalSellingPrice?: string;
    isDefault: boolean;
    isActive: boolean;
  }>>([]);

  // Initialize variants from product data
  useEffect(() => {
    if (product?.variants && product.variants.length > 0) {
      // Load existing variants from product
        setVariants(product.variants.map(variant => ({
          id: variant.id ? String(variant.id) : `variant-${Date.now()}`,
          variantName: variant.variantName,
          packageType: variant.packageType,
          piecesPerPackage: variant.piecesPerPackage,
          stockQuantity: variant.stockQuantity,
          lowStockThreshold: variant.lowStockThreshold,
          stockStatus: variant.stockStatus,
          purchasePrice: variant.purchasePrice,
          sellingPrice: variant.sellingPrice,
          originalSellingPrice: variant.originalSellingPrice,
          isDefault: variant.isDefault,
          isActive: variant.isActive
        })));
    } else {
      // Create default single piece variant
      setVariants([{
        id: 'default',
        variantName: 'Single Piece',
        packageType: 'Piece',
        piecesPerPackage: 1, // Default to 1, but can be changed
        stockQuantity: 0,
        lowStockThreshold: 0,
        stockStatus: 'In Stock',
        purchasePrice: '',
        sellingPrice: '',
        originalSellingPrice: '',
        isDefault: true,
        isActive: true
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
    const newVariant = {
      id: `variant-${Date.now()}`,
      variantName: `Package ${variants.length}`, // Start from Package 1 (since first is Single Piece)
      packageType: '',
      piecesPerPackage: 1, // Will be editable for non-first variants
      stockQuantity: 0,
      lowStockThreshold: 0,
      stockStatus: 'In Stock' as const,
      purchasePrice: '',
      sellingPrice: '',
      originalSellingPrice: '',
      isDefault: false,
      isActive: true
    };
    setVariants(prev => [...prev, newVariant]);
  };

  const removeVariant = (variantId: string) => {
    // Prevent removing the first variant (Single Piece)
    if (variants.length > 1 && variantId !== variants[0].id) {
      setVariants(prev => prev.filter(variant => variant.id !== variantId));
    }
  };

  const updateVariant = (variantId: string, field: string, value: string | number | boolean) => {
    setVariants(prev => prev.map(variant => {
      if (variant.id === variantId) {
        const updatedVariant = { ...variant, [field]: value };
        
        // Auto-calculate stock status for stock-related fields
        if (field === 'stockQuantity' || field === 'lowStockThreshold') {
          const stockQty = field === 'stockQuantity' ? value : updatedVariant.stockQuantity;
          const threshold = field === 'lowStockThreshold' ? value : updatedVariant.lowStockThreshold;
          
          if (stockQty === 0) {
            updatedVariant.stockStatus = 'Out of Stock';
          } else if (threshold === 0) {
            updatedVariant.stockStatus = 'In Stock';
          } else if (stockQty <= threshold) {
            updatedVariant.stockStatus = 'Low Stock';
          } else {
            updatedVariant.stockStatus = 'In Stock';
          }
        }
        
        // Auto-set originalSellingPrice when sellingPrice is first set
        if (field === 'sellingPrice' && value && !variant.originalSellingPrice) {
          updatedVariant.originalSellingPrice = String(value);
        }
        
        return updatedVariant;
      }
      return variant;
    }));
  };


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
      const response = await fetch('/api/products', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...product,
          status: 'Draft',
          userId: user.id
        }),
      });

      if (response.ok) {
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
      } else {
        const errorData = await response?.json();
        alert(`Error: ${errorData?.error || 'Failed to unpublish product'}`);
      }
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

      // Submit the full text values including currency symbols
      const payload = {
        ...finalData,
        id: formData.id,
        productId: formData.productId,
        userId: user.id,
        currency: user.currency,
        variants: variants.map(variant => ({
          variantName: variant.variantName,
          packageType: variant.packageType,
          piecesPerPackage: variant.piecesPerPackage,
          stockQuantity: variant.stockQuantity,
          lowStockThreshold: variant.lowStockThreshold,
          stockStatus: variant.stockStatus,
          purchasePrice: variant.purchasePrice,
          sellingPrice: variant.sellingPrice,
          originalSellingPrice: variant.originalSellingPrice,
          isDefault: variant.isDefault,
          isActive: variant.isActive
        }))
      };

      let response;
      if (currentMode === 'add') {
        response = await fetch('/api/products', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      } else if (currentMode === 'edit' && (finalData.id || finalData.productId)) {
        response = await fetch('/api/products', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      } else if (currentMode === 'edit') {
        alert('Cannot edit product: Missing product ID');
        return;
      }

      if (response?.ok) {
        const savedProduct = await response.json();
        
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
      } else {
        const errorData = await response?.json();
        alert(`Error: ${errorData?.error || 'Failed to save product'}`);
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

    // Check if variants are properly configured
    const variantValidation = variants.every(variant => 
      variant.purchasePrice && variant.purchasePrice.trim() !== '' &&
      variant.sellingPrice && variant.sellingPrice.trim() !== '' &&
      variant.stockQuantity >= 0
    );

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
              { name: 'Product Variants', value: variants.every(variant => 
                variant.purchasePrice && variant.purchasePrice.trim() !== '' &&
                variant.sellingPrice && variant.sellingPrice.trim() !== '' &&
                variant.stockQuantity >= 0
              ) }
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

          {/* Row 3: Product Variants (Pricing & Stock Information) - Full Width */}
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-md font-semibold text-gray-900 flex items-center gap-2">
                <DollarSign className="w-5 h-5 text-gray-500" />
                Product Variants
                <span className="text-xs text-gray-500 font-normal">(Different package sizes and pricing)</span>
              </h2>
              {!isViewMode && (
                <button
                  type="button"
                  onClick={addVariant}
                  className="flex items-center gap-2 px-3 py-2 text-xs font-medium bg-[#0a61d7] text-white rounded-lg hover:bg-[#0851b8] transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  Add Variant
                </button>
              )}
            </div>
            
            {/* Variants List */}
            <div className="space-y-4">
              {variants.map((variant, index) => (
                <div key={variant.id} className="border border-gray-200 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className="flex-1">
                        <label className="block text-xs font-medium text-gray-700 mb-1">
                          Variant Name
                        </label>
                        <input
                          type="text"
                          value={variant.variantName}
                          onChange={(e) => updateVariant(variant.id, 'variantName', e.target.value)}
                          disabled={isViewMode}
                          className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0a61d7] focus:border-transparent disabled:bg-gray-50 text-black font-semibold"
                          placeholder="e.g., Single Piece, 20-Pack Box, Bulk Case"
                        />
                      </div>
                      {variant.isDefault && (
                        <span className="px-2 py-1 text-xs bg-blue-100 text-blue-800 rounded-full font-medium">
                          Default
                        </span>
                      )}
                    </div>
                    {!isViewMode && variants.length > 1 && index > 0 && (
                      <button
                        type="button"
                        onClick={() => removeVariant(variant.id)}
                        className="text-red-500 hover:text-red-700 p-1"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                  
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {/* Stock Information Section */}
                    <div className="bg-gray-50 rounded-lg p-4">
                      <h4 className="text-sm font-semibold text-gray-900 mb-4">Stock Information</h4>
                      
                      <div className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <label className="block text-xs font-medium text-gray-700 mb-2">
                              Package Type
                            </label>
                            <input
                              type="text"
                              value={variant.packageType}
                              onChange={(e) => updateVariant(variant.id, 'packageType', e.target.value)}
                              disabled={isViewMode}
                              className="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0a61d7] focus:border-transparent disabled:bg-gray-50 text-black"
                              placeholder="e.g., Box, Carton, Case"
                            />
                            <p className="text-xs text-gray-500 mt-1">Type of packaging unit</p>
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-gray-700 mb-2">
                              Pieces per Package
                            </label>
                            <input
                              type="number"
                              value={variant.piecesPerPackage}
                              onChange={(e) => updateVariant(variant.id, 'piecesPerPackage', parseInt(e.target.value) || 1)}
                              disabled={isViewMode}
                              className="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0a61d7] focus:border-transparent disabled:bg-gray-50 text-black"
                              placeholder="1"
                              min="1"
                            />
                            <p className="text-xs text-gray-500 mt-1">
                              Number of individual pieces per package
                            </p>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                          <div>
                            <label className="block text-xs font-medium text-gray-700 mb-2">
                              Stock Quantity
                            </label>
                            <input
                              type="number"
                              value={variant.stockQuantity}
                              onChange={(e) => updateVariant(variant.id, 'stockQuantity', parseInt(e.target.value) || 0)}
                              disabled={isViewMode}
                              className="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0a61d7] focus:border-transparent disabled:bg-gray-50 text-black"
                              placeholder="0"
                              min="0"
                            />
                            <p className="text-xs text-gray-500 mt-1">Current packages available</p>
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-gray-700 mb-2">
                              Low Stock Threshold
                            </label>
                            <input
                              type="number"
                              value={variant.lowStockThreshold}
                              onChange={(e) => updateVariant(variant.id, 'lowStockThreshold', parseInt(e.target.value) || 0)}
                              disabled={isViewMode}
                              className="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0a61d7] focus:border-transparent disabled:bg-gray-50 text-black"
                              placeholder="0"
                              min="0"
                            />
                            <p className="text-xs text-gray-500 mt-1">Set to your own stock threshold</p>
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-gray-700 mb-2">
                              Stock Status
                            </label>
                            <input
                              type="text"
                              value={variant.stockStatus}
                              disabled={true}
                              className="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg bg-gray-50 text-gray-600 cursor-not-allowed"
                              readOnly
                            />
                            <p className="text-xs text-gray-500 mt-1">Automatically calculated</p>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Pricing Section */}
                    <div className="bg-gray-50 rounded-lg p-4">
                      <h4 className="text-sm font-semibold text-gray-900 mb-4">Pricing <span className="text-xs text-gray-500 font-medium">(per 1-piece)</span></h4>
                      
                      <div className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <label className="block text-xs font-medium text-gray-700 mb-2">
                              Base/Selling Price 
                            </label>
                            <div className="relative">
                              <div className="absolute left-3 top-1/2 transform -translate-y-1/2 text-xs text-gray-500 pointer-events-none">
                                {currencySymbol}
                              </div>
                              <input
                                type="text"
                                value={variant.sellingPrice}
                                onChange={(e) => updateVariant(variant.id, 'sellingPrice', e.target.value)}
                                disabled={isViewMode}
                                className="w-full pl-8 pr-3 py-2 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0a61d7] focus:border-transparent disabled:bg-gray-50 text-black"
                                placeholder={getPricePlaceholder(userCurrency)}
                              />
                            </div>
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-gray-700 mb-2">
                              Purchase Price
                            </label>
                            <div className="relative">
                              <div className="absolute left-3 top-1/2 transform -translate-y-1/2 text-xs text-gray-500 pointer-events-none">
                                {currencySymbol}
                              </div>
                              <input
                                type="text"
                                value={variant.purchasePrice}
                                onChange={(e) => updateVariant(variant.id, 'purchasePrice', e.target.value)}
                                disabled={isViewMode}
                                className="w-full pl-8 pr-3 py-2 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0a61d7] focus:border-transparent disabled:bg-gray-50 text-black"
                                placeholder={getPricePlaceholder(userCurrency)}
                              />
                            </div>
                          </div>
                        </div>

                        {/* Calculated Price per Package */}
                        <div className="border-t border-gray-200 pt-4">
                          <div>
                            <label className="block text-xs font-medium text-gray-700 mb-2">
                              Price per Package (Calculated)
                            </label>
                            <div className="relative">
                              <div className="absolute left-3 top-1/2 transform -translate-y-1/2 text-xs text-gray-500 pointer-events-none">
                                {currencySymbol}
                              </div>
                              <input
                                type="text"
                                value={(() => {
                                  const sellingPrice = parseNumberByCurrency(variant.sellingPrice, userCurrency) || 0;
                                  const piecesPerPackage = variant.piecesPerPackage || 1;
                                  const packagePrice = sellingPrice * piecesPerPackage;
                                  return packagePrice > 0 ? formatNumberByCurrency(packagePrice, userCurrency) : '0';
                                })()}
                                disabled={true}
                                className="w-full pl-8 pr-3 py-2 text-xs border border-gray-300 rounded-lg bg-gray-50 text-gray-600 cursor-not-allowed"
                                readOnly
                              />
                            </div>
                            <p className="text-xs text-gray-500 mt-1">
                              {variant.piecesPerPackage || 1} {variant.packageType || 'pieces'} × {currencySymbol}{formatNumberByCurrency(parseNumberByCurrency(variant.sellingPrice, userCurrency), userCurrency)} per {variant.packageType || 'piece'}
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
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
