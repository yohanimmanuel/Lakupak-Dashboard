'use client';
import React, { useState } from "react";
import { 
  Package, 
  DollarSign, 
  Tag, 
  Upload, 
  Plus, 
  X, 
  Save,
  CheckCircle,
  Eye,
  Edit,
  Info
} from "lucide-react";

interface ProductCatalogProps {
  mode: 'add' | 'view' | 'edit';
  product?: ProductData;
  onSave?: (data: ProductData) => void;
  onCancel?: () => void;
}

interface ProductData {
  id?: string;
  sku: string;
  name: string;
  description: string;
  category: string;
  brand: string;
  supplier: string;
  stockQuantity: number;
  lowStockThreshold?: number;
  stockStatus?: 'In Stock' | 'Low Stock' | 'Out of Stock';
  purchasePrice: number;
  sellingPrice: number;
  status: 'Active' | 'Inactive' | 'Draft';
  catalogType: 'Internal' | 'External';
  catalogName: string;
  images: string[];
  sizes: string[];
  gender: 'Men' | 'Woman' | 'Unisex';
  discount?: number;
  discountType?: string;
}

export default function ProductCatalog({ 
  mode = 'add', 
  product, 
  onSave, 
  onCancel 
}: ProductCatalogProps) {
  const [formData, setFormData] = useState<ProductData>(product || {
    sku: '',
    name: '',
    description: '',
    category: '',
    brand: '',
    supplier: '',
    stockQuantity: 0,
    lowStockThreshold: 30,
    stockStatus: 'In Stock',
    purchasePrice: 0,
    sellingPrice: 0,
    status: 'Draft',
    catalogType: 'Internal',
    catalogName: '',
    images: [],
    sizes: [],
    gender: 'Men',
    discount: 0,
    discountType: ''
  });

  const [selectedSizes, setSelectedSizes] = useState<string[]>(product?.sizes || []);
  const [selectedGender, setSelectedGender] = useState<string>(product?.gender || 'Men');

  const categories = ['Foods', 'Beverages', 'Electronics', 'Machineries', 'Household', 'Beauty', 'Fashion', 'Jacket'];
  const availableSizes = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];
  const genders = ['Men', 'Woman', 'Unisex'];
  const statusOptions = ['Active', 'Inactive', 'Draft'];
  const catalogTypes = ['Internal', 'External'];

  const handleInputChange = (field: keyof ProductData, value: any) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleSizeToggle = (size: string) => {
    setSelectedSizes(prev => 
      prev.includes(size) 
        ? prev.filter(s => s !== size)
        : [...prev, size]
    );
  };

  const handleGenderChange = (gender: string) => {
    setSelectedGender(gender);
    setFormData(prev => ({ ...prev, gender: gender as 'Men' | 'Woman' | 'Unisex' }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const finalData: ProductData = {
      ...formData,
      sizes: selectedSizes,
      gender: selectedGender as 'Men' | 'Woman' | 'Unisex'
    };
    onSave?.(finalData);
  };

  const isViewMode = mode === 'view';
  const isEditMode = mode === 'edit';

  return (
    <div className="w-full mx-auto bg-white rounded-lg shadow-sm border border-gray-200">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200">
        <h1 className="text-2xl font-bold text-gray-900">
          {mode === 'add' && 'Add New Product'}
          {mode === 'view' && 'Product Details'}
          {mode === 'edit' && 'Edit Product'}
        </h1>
        <div className="flex items-center gap-3">
          {mode === 'add' && (
            <>
              <button
                type="submit"
                form="product-form"
                className="flex items-center gap-2 px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
              >
                <CheckCircle className="w-4 h-4" />
                Add Product
              </button>
            </>
          )}
          {mode === 'edit' && (
            <button
              type="submit"
              form="product-form"
              className="flex items-center gap-2 px-6 py-2 bg-[#0a61d7] text-white rounded-lg hover:bg-[#0851b8] transition-colors"
            >
              <Save className="w-4 h-4" />
              Update Product
            </button>
          )}
          {mode === 'view' && (
            <button
              onClick={() => onCancel?.()}
              className="flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
            >
              <X className="w-4 h-4" />
              Close
            </button>
          )}
        </div>
      </div>

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
                   value={formData.id || ''}
                   onChange={(e) => handleInputChange('id', e.target.value)}
                   disabled={isViewMode}
                   className="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0a61d7] focus:border-transparent disabled:bg-gray-50 text-black"
                   placeholder="Enter product ID"
                 />
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
                    Category
                  </label>
                  <select
                    value={formData.category}
                    onChange={(e) => handleInputChange('category', e.target.value)}
                    disabled={isViewMode}
                    className="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0a61d7] focus:border-transparent disabled:bg-gray-50 text-black"
                  >
                    <option value="">Select Category</option>
                    {categories.map(category => (
                      <option key={category} value={category}>{category}</option>
                    ))}
                  </select>
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

                <div className="border-t border-gray-200 pt-4">
                  <h3 className="text-sm font-semibold text-gray-900 mb-4">Stock Information</h3>
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
                   <p className="text-xs text-gray-500 mt-1">Current units available</p>
                 </div>
                 <div>
                   <label className="block text-xs font-medium text-gray-700 mb-2">
                     Low Stock Threshold
                   </label>
                   <input
                     type="number"
                     value={formData.lowStockThreshold || 30}
                     onChange={(e) => handleInputChange('lowStockThreshold', parseInt(e.target.value) || 30)}
                     disabled={isViewMode}
                     className="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0a61d7] focus:border-transparent disabled:bg-gray-50 text-black"
                     placeholder="30"
                     min="0"
                   />
                   <p className="text-xs text-gray-500 mt-1">Optional, default 30-40</p>
                 </div>
                                   <div>
                    <label className="block text-xs font-medium text-gray-700 mb-2">
                      Stock Status
                    </label>
                    <select
                      value={formData.stockStatus || 'In Stock'}
                      onChange={(e) => handleInputChange('stockStatus', e.target.value)}
                      disabled={isViewMode}
                      className="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0a61d7] focus:border-transparent disabled:bg-gray-50 text-black"
                    >
                      <option value="In Stock">In Stock</option>
                      <option value="Low Stock">Low Stock</option>
                      <option value="Out of Stock">Out of Stock</option>
                    </select>
                    <p className="text-xs text-gray-500 mt-1">Select stock status</p>
                  </div>
               </div>

            </div>
          </div>

          {/* Top Row - Right: Upload Images */}
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <h2 className="text-md font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <Upload className="w-5 h-5 text-gray-500" />
              Upload Images
            </h2>
            
            <div className="space-y-4">
              {/* Main Image */}
              <div className="w-full h-110 bg-gray-100 rounded-lg border-2 border-dashed border-gray-300 flex items-center justify-center">
                {formData.images.length > 0 ? (
                  <img 
                    src={formData.images[0]} 
                    alt="Main product" 
                    className="w-full h-full object-cover rounded-lg"
                  />
                ) : (
                  <div className="text-center">
                    <Upload className="w-12 h-12 text-gray-400 mx-auto mb-2" />
                    <p className="text-gray-500">Click to upload main product image</p>
                  </div>
                )}
              </div>
              
              {/* Thumbnail Images */}
              <div className="flex items-center gap-3">
                {formData.images.slice(1).map((image, index) => (
                  <div key={index} className="w-28 h-28 bg-gray-100 rounded-lg border border-gray-300 overflow-hidden">
                    <img src={image} alt={`Product ${index + 2}`} className="w-full h-full object-cover" />
                  </div>
                ))}
                {!isViewMode && (
                  <button
                    type="button"
                    className="w-28 h-28 bg-gray-100 border-2 border-dashed border-gray-300 rounded-lg flex items-center justify-center hover:border-[#0a61d7] transition-colors"
                  >
                    <Plus className="w-6 h-6 text-gray-400" />
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Bottom Row - Left: Catalog Settings */}
           <div className="bg-white rounded-lg border border-gray-200 p-4">
             <div className="flex items-center justify-between mb-2">
               <h2 className="text-md font-semibold text-gray-900 flex items-center gap-2">
                 <Tag className="w-5 h-5 text-gray-500" />
                 Catalog Settings
               </h2>
                               {!isViewMode && (
                  <div className="flex items-center gap-2">
                    <div className="relative group">
                      <Info className="w-4 h-4 text-gray-400 cursor-help" />
                      <div className="absolute bottom-full right-0 mb-2 px-3 py-2 bg-gray-800 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none whitespace-nowrap z-10">
                        Add category as a new category filter
                        <div className="absolute top-full right-2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-800"></div>
                      </div>
                    </div>
                    
                    <button
                      type="button"
                      className="flex items-center gap-2 px-3 py-2 bg-green-500 text-white text-xs rounded-lg hover:bg-green-600 transition-colors font-medium"
                    >
                      Add Category
                    </button>
                  </div>
                )}
             </div>
            
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-2">
                  Product Category
                </label>
                <select
                  value={formData.category}
                  onChange={(e) => handleInputChange('category', e.target.value)}
                  disabled={isViewMode}
                  className="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0a61d7] focus:border-transparent disabled:bg-gray-50 text-black"
                >
                  <option value="">Select Category</option>
                  {categories.map(category => (
                    <option key={category} value={category}>{category}</option>
                  ))}
                </select>
              </div>
              
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-2">
                  Catalog Type
                </label>
                <select
                  value={formData.catalogType}
                  onChange={(e) => handleInputChange('catalogType', e.target.value)}
                  disabled={isViewMode}
                  className="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0a61d7] focus:border-transparent disabled:bg-gray-50 text-black"
                >
                  {catalogTypes.map(type => (
                    <option key={type} value={type}>{type}</option>
                  ))}
                </select>
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
              Pricing and Stock
            </h2>
            
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-2">
                    Base Pricing
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-2 text-gray-500">$</span>
                    <input
                      type="number"
                      value={formData.sellingPrice}
                      onChange={(e) => handleInputChange('sellingPrice', parseFloat(e.target.value) || 0)}
                      disabled={isViewMode}
                      className="w-full pl-8 pr-3 py-2 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0a61d7] focus:border-transparent disabled:bg-gray-50 text-black"
                      placeholder="0.00"
                      step="0.01"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-2">
                    Purchase Price
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-2 text-gray-500">$</span>
                    <input
                      type="number"
                      value={formData.purchasePrice}
                      onChange={(e) => handleInputChange('purchasePrice', parseFloat(e.target.value) || 0)}
                      disabled={isViewMode}
                      className="w-full pl-8 pr-3 py-2 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0a61d7] focus:border-transparent disabled:bg-gray-50 text-black"
                      placeholder="0.00"
                      step="0.01"
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-2">
                    Stock
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
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-2">
                    Status
                  </label>
                  <select
                    value={formData.status}
                    onChange={(e) => handleInputChange('status', e.target.value)}
                    disabled={isViewMode}
                    className="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0a61d7] focus:border-transparent disabled:bg-gray-50 text-black"
                  >
                    {statusOptions.map(status => (
                      <option key={status} value={status}>{status}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-2">
                    Discount (%)
                  </label>
                  <input
                    type="number"
                    value={formData.discount || 0}
                    onChange={(e) => handleInputChange('discount', parseFloat(e.target.value) || 0)}
                    disabled={isViewMode}
                    className="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0a61d7] focus:border-transparent disabled:bg-gray-50 text-black"
                    placeholder="0"
                    min="0"
                    max="100"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-2">
                    Discount Type
                  </label>
                  <input
                    type="text"
                    value={formData.discountType || ''}
                    onChange={(e) => handleInputChange('discountType', e.target.value)}
                    disabled={isViewMode}
                    className="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0a61d7] focus:border-transparent disabled:bg-gray-50 text-black"
                    placeholder="e.g., Seasonal Sale"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}
