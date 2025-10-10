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
  Package
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
    stockQuantity: product?.stockQuantity || 0,
    lowStockThreshold: product?.lowStockThreshold || 0,
    stockStatus: product?.stockStatus || 'In Stock',
    purchasePrice: product?.purchasePrice || '',
    sellingPrice: product?.sellingPrice || '',
    status: product?.status || 'Draft',
    productCategory: product?.productCategory || '',
    catalogName: product?.catalogName || '',
    images: product?.images || [],
    halalCertified: (product as { halalCertified?: boolean })?.halalCertified ?? false,
    bpomApproved: (product as { bpomApproved?: boolean })?.bpomApproved ?? false,
    originalProduct: (product as { originalProduct?: boolean })?.originalProduct ?? true,
    returnPolicyDays: (product as { returnPolicyDays?: number })?.returnPolicyDays ?? 7,
    packageType: (product as { packageType?: string })?.packageType ?? '',
    piecesPerPackage: (product as { piecesPerPackage?: number })?.piecesPerPackage ?? 1
  });


  const [isDragOver, setIsDragOver] = useState(false);
  const [uploadingImages, setUploadingImages] = useState(false);
  const [saving, setSaving] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [originalFormData, setOriginalFormData] = useState<ProductFormData | null>(null);
  const [showSuccessModal, setShowSuccessModal] = useState(false);

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
        stockQuantity: product?.stockQuantity || 0,
        lowStockThreshold: product?.lowStockThreshold || 0,
        stockStatus: product?.stockStatus || 'In Stock',
        purchasePrice: product?.purchasePrice || '',
        sellingPrice: product?.sellingPrice || '',
        status: product?.status || 'Draft',
        productCategory: product?.productCategory || '',
        catalogName: product?.catalogName || '',
        images: product?.images || [],
        halalCertified: (product as { halalCertified?: boolean })?.halalCertified ?? false,
        bpomApproved: (product as { bpomApproved?: boolean })?.bpomApproved ?? false,
        originalProduct: (product as { originalProduct?: boolean })?.originalProduct ?? true,
        returnPolicyDays: (product as { returnPolicyDays?: number })?.returnPolicyDays ?? 7,
        packageType: (product as { packageType?: string })?.packageType ?? '',
        piecesPerPackage: (product as { piecesPerPackage?: number })?.piecesPerPackage ?? 1
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
  }, [mode, formData.productId, product]);

  // Initialize stock status based on stock quantity and threshold
  useEffect(() => {
    if (formData.stockQuantity !== undefined && formData.lowStockThreshold !== undefined) {
      let newStockStatus: 'In Stock' | 'Low Stock' | 'Out of Stock';
      
      if (formData.stockQuantity === 0) {
        newStockStatus = 'Out of Stock';
      } else if (formData.lowStockThreshold === 0) {
        // If threshold is 0, only "Out of Stock" when quantity is 0, otherwise "In Stock"
        newStockStatus = 'In Stock';
      } else if (formData.stockQuantity <= formData.lowStockThreshold) {
        newStockStatus = 'Low Stock';
      } else {
        newStockStatus = 'In Stock';
      }
      
      if (newStockStatus !== formData.stockStatus) {
        setFormData(prev => ({
          ...prev,
          stockStatus: newStockStatus
        }));
      }
    }
  }, [formData.stockQuantity, formData.lowStockThreshold, formData.stockStatus]);

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
  const handlePriceInput = (field: 'purchasePrice' | 'sellingPrice', value: string) => {
    // Allow typing without immediate formatting
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  // Helper function to format price on blur
  const handlePriceBlur = (field: 'purchasePrice' | 'sellingPrice') => {
    const currentValue = formData[field];
    if (currentValue && currentValue.trim() !== '') {
      // Parse the current value to get the numeric value
      const numericValue = parseNumberByCurrency(currentValue, userCurrency);
      
      // Format it properly according to currency
      const formattedValue = formatNumberByCurrency(numericValue, userCurrency);
      
      setFormData(prev => ({
        ...prev,
        [field]: formattedValue
      }));
    }
  };

  const handleInputChange = (field: keyof ProductFormData, value: string | number | string[] | boolean) => {
    setFormData(prev => {
      const newFormData = {
        ...prev,
        [field]: value
      };
      
             // Automatically update stock status based on stock quantity and threshold
       if (field === 'stockQuantity' || field === 'lowStockThreshold') {
         const stockQty = field === 'stockQuantity' ? value : newFormData.stockQuantity;
         const threshold = field === 'lowStockThreshold' ? value : newFormData.lowStockThreshold;
         
         if (stockQty === 0) {
           newFormData.stockStatus = 'Out of Stock';
         } else if (threshold === 0) {
           // If threshold is 0, only "Out of Stock" when quantity is 0, otherwise "In Stock"
           newFormData.stockStatus = 'In Stock';
         } else if (stockQty <= threshold) {
           newFormData.stockStatus = 'Low Stock';
         } else {
           newFormData.stockStatus = 'In Stock';
         }
       }
      
      return newFormData;
    });
  };


  const handleImageUpload = (files: FileList) => {
    setUploadingImages(true);
    
    // Convert files to data URLs for preview
    const newImages: string[] = [];
    const maxFileSize = 5 * 1024 * 1024; // 5MB
    const maxImages = 10;
    
    // Validate total image count first
    if (formData.images.length + files.length > maxImages) {
      alert(`Maximum ${maxImages} images allowed. You currently have ${formData.images.length} images. Please remove some images first.`);
      setUploadingImages(false);
      return;
    }
    
    Array.from(files).forEach((file) => {
      // Validate file type
      if (!file.type.startsWith('image/')) {
        alert(`File "${file.name}" is not an image. Please select only image files.`);
        return;
      }
      
      // Validate file size
      if (file.size > maxFileSize) {
        alert(`File "${file.name}" is too large. Maximum size is 5MB.`);
        return;
      }
      
      const reader = new FileReader();
      reader.onload = (e) => {
        if (e.target?.result) {
          newImages.push(e.target.result as string);
          if (newImages.length === files.length) {
            setFormData(prev => ({
              ...prev,
              images: [...prev.images, ...newImages]
            }));
            setUploadingImages(false);
          }
        }
      };
      reader.readAsDataURL(file);
    });
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

    

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!user?.id) {
      alert('User not authenticated');
      return;
    }

    setSaving(true);
    
    try {
      const finalData: ProductFormData = {
        ...formData
      };

      // Generate product ID in LKP format if not exists
      if (!finalData.productId && mode === 'add') {
        finalData.productId = generateLKPProductId();
      }

      // Submit the full text values including currency symbols
      const payload = {
        ...finalData,
        id: formData.id,
        productId: formData.productId,
        purchasePrice: formData.purchasePrice,
        sellingPrice: formData.sellingPrice,
        userId: user.id
      };

      let response;
      if (mode === 'add') {
        response = await fetch('/api/products', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      } else if (mode === 'edit' && (finalData.id || finalData.productId)) {
        response = await fetch('/api/products', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      } else if (mode === 'edit') {
        alert('Cannot edit product: Missing product ID');
        return;
      }

      if (response?.ok) {
        const savedProduct = await response.json();
        
        if (mode === 'edit') {
          // Show success modal for edit mode
          setHasUnsavedChanges(false);
          setOriginalFormData(JSON.parse(JSON.stringify(formData)));
          setShowSuccessModal(true);
          setTimeout(() => {
            setShowSuccessModal(false);
          }, 3000);
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

  const handleCancel = () => {
    if (originalFormData) {
      setFormData(JSON.parse(JSON.stringify(originalFormData)));
      setHasUnsavedChanges(false);
    }
  };

  const isViewMode = mode === 'view';
  const isEditMode = mode === 'edit';

  return (
    <div className="w-full mx-auto bg-white rounded-lg shadow-sm border border-gray-200">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200">
        <div className="flex items-center gap-4">
          <button
            onClick={() => {
              if (mode === 'edit' && hasUnsavedChanges) {
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
            Back to Products
          </button>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-gray-900">
              {mode === 'add' && 'Add New Product'}
              {mode === 'view' && 'Product Details'}
              {mode === 'edit' && 'Edit Product'}
            </h1>
            {mode === 'view' && formData.status === 'Published' && (
              <span className="px-3 py-1 bg-green-100 text-green-600 text-sm font-semibold rounded-full">
                Published
              </span>
            )}
            {(product as any)?.offerBadge && (
              <span className={`px-3 py-1 text-sm font-semibold rounded-full ${
                (product as any).offerBadge === 'Discount' ? 'bg-red-100 text-red-700' :
                (product as any).offerBadge === 'Promotion' ? 'bg-green-100 text-green-700' :
                (product as any).offerBadge === 'All Offers' ? 'bg-purple-100 text-purple-700' :
                'bg-blue-100 text-blue-700'
              }`}>
                {(product as any).offerBadge}
              </span>
            )}
            {mode === 'edit' && hasUnsavedChanges && (
              <span className="text-sm text-orange-600 font-medium">• Unsaved changes</span>
            )}
          </div>
          {mode === 'view' && formData.status === 'Published' && (
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
          {mode === 'add' && (
            <>
              <button
                type="submit"
                form="product-form"
                disabled={saving}
                className="flex items-center gap-2 px-6 py-2 font-semibold bg-[#0a61d7] text-white rounded-lg hover:bg-[#0851b8] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    Saving...
                  </>
                ) : (
                  <>
                    <CheckCircle className="w-5 h-5" />
                    Add Product
                  </>
                )}
              </button>
            </>
          )}
          {mode === 'edit' && (
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
                type="submit"
                form="product-form"
                disabled={!hasUnsavedChanges || saving}
                className="flex items-center gap-2 px-4 py-2 bg-[#0a61d7] text-white rounded-lg hover:bg-[#084ba6] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    Save Changes
                  </>
                )}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Mode Descriptions */}
      <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
        {mode === 'add' && (
          <p className="text-sm text-gray-600">
            Create a new product by filling out the form below. All fields marked with descriptions are required for proper product cataloging.
          </p>
        )}
        {mode === 'view' && (
          <p className="text-sm text-gray-600">
            View detailed information about this product. You can see all product specifications, images, and current status.
          </p>
        )}
        {mode === 'edit' && (
          <p className="text-sm text-gray-600">
            Modify existing product information. Update any fields as needed and save your changes to the product catalog.
          </p>
        )}
      </div>

      {/* Profile Completion Progress */}
      {(mode === 'view' || mode === 'edit') && product && (
        <div className="mx-4 mt-4 mb-4 p-4 bg-gradient-to-r from-blue-50 to-amber-50 border border-blue-200 rounded-lg">
          {(() => {
            // Calculate completion progress
            const requiredFields = [
              { name: 'SKU Number', value: String(product.sku || '').trim() },
              { name: 'Product Name', value: String(product.name || '').trim() },
              { name: 'Description', value: String(product.description || '').trim() },
                { name: 'Category', value: String(product.productType || '').trim() },
              { name: 'Brand', value: String(product.brand || '').trim() },
              { name: 'Supplier', value: String(product.supplier || '').trim() },
              { name: 'Purchase Price', value: String(product.purchasePrice || '').trim() },
              { name: 'Selling Price', value: String(product.sellingPrice || '').trim() },
              { name: 'Stock Quantity', value: product.stockQuantity !== undefined && product.stockQuantity !== null },
              { name: 'Product Images', value: product.images && product.images.length > 0 }
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
        {/* 4-Grid Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          
          {/* Top Row - Left: General Information */}
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <h2 className="text-md font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <Package className="w-5 h-5 text-gray-500" />
              General Information
            </h2>
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-2">
                  Product ID
                </label>
                                                 <input
                  type="text"
                  value={formData.productId || ''}
                  onChange={(e) => handleInputChange('productId', e.target.value)}
                  disabled={mode === 'add' || isViewMode || mode === 'edit'}
                  className="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0a61d7] focus:border-transparent disabled:bg-gray-50 text-black"
                  placeholder="Auto-generated Product ID"
                />
                 {mode === 'add' && (
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
              </div>
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

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                             <div className="border-b border-gray-200 pb-2">
                 <label className="block text-xs font-medium text-gray-700 mb-2">
                   Product Description
                 </label>
                 <textarea
                   value={formData.description}
                   onChange={(e) => handleInputChange('description', e.target.value)}
                   disabled={isViewMode}
                   rows={4}
                   className="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0a61d7] focus:border-transparent disabled:bg-gray-50 text-black"
                   placeholder="Enter product description"
                 />
               </div>

              {/* Product Assurance */}
              <div>
                <h3 className="text-sm font-semibold text-gray-900 mb-3">Product Assurance</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
                </div>
                <div className="mt-3">
                  <label className="block text-xs font-medium text-gray-700 mb-2">Return Policy (days)</label>
                  <input
                    type="number"
                    min="0"
                    value={formData.returnPolicyDays ?? 7}
                    onChange={(e) => handleInputChange('returnPolicyDays', parseInt(e.target.value) || 0)}
                    disabled={isViewMode}
                    className="w-50 px-3 py-2 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0a61d7] focus:border-transparent disabled:bg-gray-50 text-black"
                    placeholder="7"
                  />
                </div>
              </div>

                <div className="border-t border-gray-200 pt-4">
                  <h3 className="text-sm font-semibold text-gray-900 mb-4">Stock Information</h3>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-2">
                      Package Type
                    </label>
                    <input
                      type="text"
                      value={formData.packageType}
                      onChange={(e) => handleInputChange('packageType', e.target.value)}
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
                      value={formData.piecesPerPackage}
                      onChange={(e) => handleInputChange('piecesPerPackage', parseInt(e.target.value) || 1)}
                      disabled={isViewMode}
                      className="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0a61d7] focus:border-transparent disabled:bg-gray-50 text-black"
                      placeholder="1"
                      min="1"
                    />
                    <p className="text-xs text-gray-500 mt-1">Number of individual pieces per package</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-2">
                      Stock Quantity
                    </label>
                   <input
                     type="number"
                     value={formData.stockQuantity}
                     onChange={(e) => handleInputChange('stockQuantity', parseInt(e.target.value) || 0)}
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
                      value={formData.lowStockThreshold || 0}
                      onChange={(e) => handleInputChange('lowStockThreshold', parseInt(e.target.value) || 0)}
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
                       value={formData.stockStatus || 'In Stock'}
                       disabled={true}
                       className="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg bg-gray-50 text-gray-600 cursor-not-allowed"
                       readOnly
                     />
                     <p className="text-xs text-gray-500 mt-1">Automatically calculated based on stock quantity and threshold</p>
                   </div>
               </div>

            </div>
          </div>

          {/* Top Row - Right: Upload Images */}
          <div className="bg-white rounded-lg border border-gray-200 p-4">
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
            
            <div className="space-y-4">
              {/* Main Image Upload Area */}
              <div 
                className={`w-full h-110 bg-gray-100 rounded-lg border-2 border-dashed transition-colors ${
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
              
              {/* Thumbnail Images */}
              <div className="flex items-center gap-3 flex-wrap">
                {formData.images.slice(1).map((image, index) => (
                  <div 
                    key={index} 
                    className="relative w-28 h-28 bg-gray-100 rounded-lg border border-gray-300 overflow-hidden cursor-move hover:shadow-md transition-shadow"
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
                          className="absolute top-1 right-1 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center hover:bg-red-600 transition-colors"
                        >
                          <X className="w-3 h-3" />
                        </button>
                        <div className="absolute bottom-1 left-1 w-6 h-6 bg-gray-800 bg-opacity-70 text-white text-xs rounded-full flex items-center justify-center">
                          {index + 2}
                        </div>
                      </>
                    )}
                  </div>
                ))}
                
                {/* Add more images button */}
                {!isViewMode && formData.images.length < 10 && (
                  <div className="relative">
                    <div className="w-28 h-28 bg-gray-100 border-2 border-dashed border-gray-300 rounded-lg flex items-center justify-center hover:border-[#0a61d7] transition-colors">
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
              
              {/* Upload Progress */}
              {uploadingImages && (
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <div className="w-4 h-4 border-2 border-gray-300 border-t-[#0a61d7] rounded-full animate-spin"></div>
                  <span>Uploading images...</span>
                </div>
              )}
              {/* Image Count Info */}
              <div className="flex items-center justify-between">
                <div className="text-xs text-gray-500">
                  {formData.images.length}/10 images uploaded
                </div>
              </div>
            </div>
          </div>

          {/* Bottom Row - Left: Catalog Settings */}
           <div className="bg-white rounded-lg border border-gray-200 p-4">
             <div className="flex items-center justify-between mb-2">
               <h2 className="text-md font-semibold text-gray-900 flex items-center gap-2">
                 <Tag className="w-5 h-5 text-gray-500" />
                 Product Settings
               </h2>
                 
                  <div className="flex items-center gap-2">
                     <p className="text-xs text-gray-500 italic">
                       All Product Types input will be added as a new filter.
                     </p>
                  </div>
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
                  placeholder="Distributor-specific rule (e.g, Wholesale, Retail)"
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
                   placeholder="e.g., Daily Essentials, Seasonal Promotions"
                 />
               </div>
            </div>
          </div>

          {/* Bottom Row - Right: Pricing and Stock */}
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <h2 className="text-md font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <DollarSign className="w-5 h-5 text-gray-500" />
              Pricing
              <span className="text-xs text-gray-500 font-normal">(format matches {userCurrency})</span>
            </h2>
            
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
                       value={formData.sellingPrice}
                       onChange={(e) => handlePriceInput('sellingPrice', e.target.value)}
                       onBlur={() => handlePriceBlur('sellingPrice')}
                       disabled={isViewMode}
                       className="w-full pl-8 pr-3 py-2 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0a61d7] focus:border-transparent disabled:bg-gray-50 text-black"
                       placeholder={getPricePlaceholder(userCurrency)}
                     />
                   </div>
                   {(product as any)?.originalPrice && mode === 'view' && (
                     <div className="mt-1 text-xs text-gray-400 line-through">
                       Original: {formatCurrencyAmount(parseNumberByCurrency((product as any).originalPrice, userCurrency), userCurrency)}
                     </div>
                   )}
                   {(product as any)?.offerName && mode === 'view' && (
                     <div className="mt-1 text-xs text-green-600">
                       Applied Offer: {(product as any).offerName}
                     </div>
                   )}
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
                       value={formData.purchasePrice}
                       onChange={(e) => handlePriceInput('purchasePrice', e.target.value)}
                       onBlur={() => handlePriceBlur('purchasePrice')}
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
                        const sellingPrice = parseNumberByCurrency(formData.sellingPrice, userCurrency) || 0;
                        const piecesPerPackage = formData.piecesPerPackage || 1;
                        const packagePrice = sellingPrice * piecesPerPackage;
                        return packagePrice > 0 ? formatNumberByCurrency(packagePrice, userCurrency) : '0';
                      })()}
                      disabled={true}
                      className="w-full pl-8 pr-3 py-2 text-xs border border-gray-300 rounded-lg bg-gray-50 text-gray-600 cursor-not-allowed"
                      readOnly
                    />
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    {formData.piecesPerPackage || 1} {formData.packageType || 'pieces'} × {currencySymbol}{formatNumberByCurrency(parseNumberByCurrency(formData.sellingPrice, userCurrency), userCurrency)} per {formData.packageType || 'piece'}
                  </p>
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
