'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Package, Search, Filter, Plus, Check, X, Target, Tag, Grid, List, ChevronDown, ChevronLeft, ChevronRight, Calendar, Clock, ChevronUp } from 'lucide-react';
import { formatCurrency, getDefaultCurrency } from '@/utils/currencyUtils';
import { parseNumberByCurrency } from '@/config/currencyConfig';
import { useUserStore } from '@/store/userStore';
import { Product } from '@/types/product';
import { SelectedProduct, useOfferCreationStore } from '@/store/offerCreationStore';

interface ProductIntegrationProps {
  isNewOffer?: boolean;
  offerData?: any; // Offer data from database for details view
  onOfferChange?: (updatedData: any) => void; // Callback for batch edit mode
  onAddProduct: (product: SelectedProduct) => void;
  onRemoveProduct: (productId: string) => void;
  onUpdateProductDiscount: (productId: string, discountType: 'percentage' | 'fixed', discountValue: number) => void;
}

interface ProductWithOffer extends Product {
  hasOffer?: boolean;
  offerDiscount?: number;
  offerType?: 'percentage' | 'fixed';
  offerBadge?: string;
}

interface OfferProduct {
  productId: string;
  discountType: 'percentage' | 'fixed';
  discountValue: number;
  isActive: boolean;
}

export default function ProductIntegration({ 
  isNewOffer = false, 
  offerData,
  onOfferChange,
  onAddProduct, 
  onRemoveProduct, 
  onUpdateProductDiscount 
}: ProductIntegrationProps) {
  const user = useUserStore(state => state.user);
  const userCurrency = user?.currency || getDefaultCurrency();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedType, setSelectedType] = useState('All Types');
  const [selectedCategory, setSelectedCategory] = useState('All Categories');
  const [selectedBrand, setSelectedBrand] = useState('All Brands');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [selectedProducts, setSelectedProducts] = useState<string[]>([]);
  const [showOfferModal, setShowOfferModal] = useState(false);
  const [showTypeDropdown, setShowTypeDropdown] = useState(false);
  const [showCategoryDropdown, setShowCategoryDropdown] = useState(false);
  const [showBrandDropdown, setShowBrandDropdown] = useState(false);
  const [products, setProducts] = useState<ProductWithOffer[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const rowsPerPage = 8;
  
  // Ranges/time slots and configured offer types come from centralized offer creation store
  const store = useOfferCreationStore();
  const { dateRanges: storeDateRanges, timeSlots: storeTimeSlots, discountTypes: storeDiscountTypes, productOfferBadges: storeProductOfferBadges, setProductOfferBadge, clearProductOfferBadge } = store;
  
  // Use offerData if provided (details view), otherwise use store data (create view)
  const dateRanges = offerData?.dateRanges || storeDateRanges;
  const timeSlots = offerData?.timeSlots || storeTimeSlots;
  const discountTypes = offerData?.discountTypes || storeDiscountTypes;
  const productOfferBadges = offerData?.productOfferBadges || storeProductOfferBadges;
  const isDetailsView = Boolean(offerData); // Flag to determine if we're in details view
  const isBatchEditMode = Boolean(offerData && onOfferChange);
  
  // Modal states
  const [rangeTab, setRangeTab] = useState<'date' | 'time'>('date');
  const [showMoreOfferTypes, setShowMoreOfferTypes] = useState(false);
  const [showMoreRanges, setShowMoreRanges] = useState(false);
  const [showRemoveConfirm, setShowRemoveConfirm] = useState(false);

  // Map real discount types from store to display-friendly items
  const getTypeLabel = (t: 'percentage' | 'fixed' | 'buy_x_get_y') => {
    switch (t) {
      case 'percentage':
        return 'Percentage Discount';
      case 'fixed':
        return 'Fixed Amount Discount';
      case 'buy_x_get_y':
        return 'Buy X Get Y';
      default:
        return 'Discount';
    }
  };

  const offerTypes = (discountTypes || []).map((dt: any) => ({
    id: dt.id,
    name: dt.name && dt.name.trim().length > 0 ? dt.name : getTypeLabel(dt.discountType),
    type: dt.discountType,
  }));

  // Determine badge label to apply to selected products
  const computeOfferBadge = (): string => {
    const hasDiscount = (discountTypes || []).some((dt: any) => dt.discountType === 'percentage' || dt.discountType === 'fixed');
    const hasPromotion = (discountTypes || []).some((dt: any) => dt.discountType === 'buy_x_get_y');
    if (hasDiscount && hasPromotion) return 'All Offers';
    if (hasPromotion) return 'Promotion';
    if (hasDiscount) return 'Discount';
    return 'Offer';
  };

  // Calculate discount amount for a product based on configured discount types
  const calculateDiscountAmount = (product: ProductWithOffer): number => {
    if (!discountTypes || discountTypes.length === 0) return 0;
    
    const productPrice = parseNumberByCurrency(String(product.sellingPrice), userCurrency);
    let totalDiscount = 0;
    
    discountTypes.forEach((dt: any) => {
      if (dt.discountType === 'percentage') {
        totalDiscount += (productPrice * dt.discountValue) / 100;
      } else if (dt.discountType === 'fixed') {
        totalDiscount += dt.discountValue;
      }
      // buy_x_get_y doesn't affect individual product discount calculation
    });
    
    return totalDiscount;
  };

  // Fetch products from API
  const fetchProducts = useCallback(async () => {
    if (!user?.id) return;
    
    setLoading(true);
    try {
      const response = await fetch(`/api/products?userId=${user.id}`);
      if (response.ok) {
        const data = await response.json();
        // Handle both old format (array) and new format (with pagination)
        const productsData = data.products || data;
        
        // Transform products to include offer information
        const productsWithOffers: ProductWithOffer[] = productsData.map((product: Product) => {
          const hasOffer = Boolean(productOfferBadges[product.productId]);
          const discountAmount = hasOffer ? calculateDiscountAmount(product as ProductWithOffer) : 0;
          
          return {
          ...product,
            hasOffer,
            offerDiscount: discountAmount,
            offerType: hasOffer ? 'percentage' : undefined, // Default to percentage for display
            offerBadge: productOfferBadges[product.productId],
          };
        });
        
        setProducts(productsWithOffers);
      } else {
        setProducts([]);
      }
    } catch (error) {
      setProducts([]);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  const productTypes = ['All Types', ...Array.from(new Set(products.map(p => p.productType).filter(Boolean)))];
  const productCategories = ['All Categories', ...Array.from(new Set(products.map(p => p.productCategory).filter(Boolean)))];
  const brands = ['All Brands', ...Array.from(new Set(products.map(p => p.brand)))];

  const filteredProducts = products.filter(product => {
    const matchesSearch = product.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         product.productType.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         product.productCategory.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         product.brand.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesType = selectedType === 'All Types' || product.productType === selectedType;
    const matchesCategory = selectedCategory === 'All Categories' || product.productCategory === selectedCategory;
    const matchesBrand = selectedBrand === 'All Brands' || product.brand === selectedBrand;
    
    return matchesSearch && matchesType && matchesCategory && matchesBrand;
  });

  // Pagination logic
  const totalRows = filteredProducts.length;
  const totalPages = Math.max(1, Math.ceil(totalRows / rowsPerPage));
  const pagedProducts = filteredProducts.slice((page - 1) * rowsPerPage, page * rowsPerPage);
  const fromRow = totalRows === 0 ? 0 : (page - 1) * rowsPerPage + 1;
  const toRow = Math.min(page * rowsPerPage, totalRows);

  // Reset page when filters change
  useEffect(() => {
    setPage(1);
  }, [searchTerm, selectedType, selectedCategory, selectedBrand]);

  // Show bulk 'Remove Offer' only if any selected product currently has an offer
  const canRemoveOffer = selectedProducts.some((productId) => {
    const product = products.find((p) => p.productId === productId);
    return Boolean(product?.hasOffer);
  });

  const handleProductSelect = (productId: string) => {
    setSelectedProducts(prev => 
      prev.includes(productId) 
        ? prev.filter(id => id !== productId)
        : [...prev, productId]
    );
  };

  const handleRowClick = (productId: string, event: React.MouseEvent) => {
    if ((event.target as HTMLElement).closest('button') || (event.target as HTMLElement).closest('th')) {
      return;
    }
    handleProductSelect(productId);
  };

  const handleSelectAll = () => {
    if (selectedProducts.length === pagedProducts.length) {
      setSelectedProducts([]);
    } else {
      setSelectedProducts(pagedProducts.map(product => product.productId));
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status.toLowerCase()) {
      case 'published':
        return 'bg-green-100 text-green-800 border border-green-200';
      case 'draft':
        return 'bg-gray-100 text-gray-800 border border-gray-200';
      default:
        return 'bg-gray-100 text-gray-800 border border-gray-200';
    }
  };

  const getStockStatus = (product: ProductWithOffer) => {
    const stock = product.stockQuantity;
    const threshold = product.lowStockThreshold || 30;
    
    if (stock === 0) return { color: 'text-red-600', bg: 'bg-red-50', label: 'Out of Stock' };
    if (threshold > 0 && stock <= threshold) return { color: 'text-orange-600', bg: 'bg-orange-50', label: 'Low Stock' };
    return { color: 'text-green-600', bg: 'bg-green-50', label: 'In Stock' };
  };

  if (loading) {
    return (
      <div className="p-4 space-y-4">
        <div className="flex items-center justify-center py-12">
          <div className="text-center">
            <div className="w-8 h-8 border-4 border-[#0a61d7] border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
            <p className="text-gray-600">Loading products...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-black">
            {isNewOffer ? 'Select Products for Offer' : 'Your Products'}
          </h2>
          <p className="text-gray-500 text-sm">
            {isNewOffer ? 'Choose which products to include in your new offer' : 'Select products for offers and discounts'}
          </p>
        </div>
        {selectedProducts.length > 0 && (
          <button
            onClick={() => setShowOfferModal(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#0a61d7] text-white font-semibold hover:bg-[#084ba6] transition text-sm"
          >
            <Plus className="w-4 h-4" />
            Apply Offer ({selectedProducts.length})
          </button>
        )}
      </div>

      {/* Filters and Search */}
      <div className="bg-white">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          {/* Search */}
          <div className="flex gap-2 w-full md:w-auto items-center">
            <div className="relative w-full md:w-150">
              <input
                type="text"
                placeholder="Search products..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 rounded-lg border border-[#e6e6e6] text-sm text-black focus:outline-none focus:ring-2 focus:ring-[#0a61d7] bg-white"
              />
              <Search className="absolute left-3 top-2 text-gray-400 w-5 h-5" />
            </div>

            {/* Product Type Filter Dropdown */}
            <div className="relative">
              <button
                className="flex items-center gap-1 px-3 py-2 rounded-lg border border-[#e6e6e6] bg-white text-gray-700 hover:bg-gray-100 text-sm"
                onClick={() => {
                  setShowTypeDropdown(!showTypeDropdown);
                  setShowCategoryDropdown(false);
                  setShowBrandDropdown(false); // Close other dropdowns when opening type dropdown
                }}
              >
                {selectedType}
                <ChevronDown className="w-4 h-4 ml-1 text-gray-500" />
              </button>
              {showTypeDropdown && (
                <div className="absolute right-0 mt-2 w-48 bg-white border border-gray-200 rounded-lg shadow z-20">
                  {productTypes.map((type) => (
                    <button
                      key={type}
                      onClick={() => {
                        setSelectedType(type);
                        setShowTypeDropdown(false);
                      }}
                      className={`w-full text-left px-4 py-2 text-sm first:rounded-t-lg last:rounded-b-lg ${
                        selectedType === type
                          ? 'text-[#0a61d7] font-semibold hover:bg-gray-100'
                          : 'text-gray-700 hover:bg-gray-100'
                      }`}
                    >
                      {type}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Product Category Filter Dropdown */}
            <div className="relative">
              <button
                className="flex items-center gap-1 px-3 py-2 rounded-lg border border-[#e6e6e6] bg-white text-gray-700 hover:bg-gray-100 text-sm"
                onClick={() => {
                  setShowCategoryDropdown(!showCategoryDropdown);
                  setShowTypeDropdown(false);
                  setShowBrandDropdown(false); // Close other dropdowns when opening category dropdown
                }}
              >
                {selectedCategory}
                <ChevronDown className="w-4 h-4 ml-1 text-gray-500" />
              </button>
              {showCategoryDropdown && (
                <div className="absolute right-0 mt-2 w-48 bg-white border border-gray-200 rounded-lg shadow z-20">
                  {productCategories.map((category) => (
                    <button
                      key={category}
                      onClick={() => {
                        setSelectedCategory(category);
                        setShowCategoryDropdown(false);
                      }}
                      className={`w-full text-left px-4 py-2 text-sm first:rounded-t-lg last:rounded-b-lg ${
                        selectedCategory === category
                          ? 'text-[#0a61d7] font-semibold hover:bg-gray-100'
                          : 'text-gray-700 hover:bg-gray-100'
                      }`}
                    >
                      {category}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Brand Filter Dropdown */}
            <div className="relative">
              <button
                className="flex items-center gap-1 px-3 py-2 rounded-lg border border-[#e6e6e6] bg-white text-gray-700 hover:bg-gray-100 text-sm"
                onClick={() => {
                  setShowBrandDropdown(!showBrandDropdown);
                  setShowTypeDropdown(false);
                  setShowCategoryDropdown(false); // Close other dropdowns when opening brand dropdown
                }}
              >
                {selectedBrand}
                <ChevronDown className="w-4 h-4 ml-1 text-gray-500" />
              </button>
              {showBrandDropdown && (
                <div className="absolute right-0 mt-2 w-48 bg-white border border-gray-200 rounded-lg shadow z-20">
                  {brands.map((brand) => (
                    <button
                      key={brand}
                      onClick={() => {
                        setSelectedBrand(brand);
                        setShowBrandDropdown(false);
                      }}
                      className={`w-full text-left px-4 py-2 text-sm first:rounded-t-lg last:rounded-b-lg ${
                        selectedBrand === brand
                          ? 'text-[#0a61d7] font-semibold hover:bg-gray-100'
                          : 'text-gray-700 hover:bg-gray-100'
                      }`}
                    >
                      {brand}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* View Mode Toggle */}
          <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
            <button
              onClick={() => setViewMode('grid')}
              className={`p-2 rounded transition-colors ${
                viewMode === 'grid' ? 'bg-white text-[#0a61d7] shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <Grid className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`p-2 rounded transition-colors ${
                viewMode === 'list' ? 'bg-white text-[#0a61d7] shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <List className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Select All Checkbox - Only show in grid view */}
        {viewMode === 'grid' && pagedProducts.length > 0 && (
          <div className="flex items-center gap-2 mt-4">
            <button
              onClick={handleSelectAll}
              className={`w-5 h-5 border-2 rounded transition-all duration-200 flex items-center justify-center ${
                selectedProducts.length === pagedProducts.length && pagedProducts.length > 0
                  ? 'bg-green-500 border-green-500'
                  : 'bg-white border-gray-300 hover:border-green-400'
              }`}
            >
              {selectedProducts.length === pagedProducts.length && pagedProducts.length > 0 && (
                <Check className="w-3 h-3 text-white" />
              )}
            </button>
            <span className="text-sm text-gray-700">
              Select All ({selectedProducts.length}/{pagedProducts.length})
            </span>
          </div>
        )}

        {/* Selection Summary */}
        {selectedProducts.length > 0 && (
          <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
            <div className="flex items-center justify-between">
              <span className="text-sm text-blue-700">
                {selectedProducts.length} product{selectedProducts.length !== 1 ? 's' : ''} selected
              </span>
              <div className="flex items-center gap-3">
                {canRemoveOffer && (
                  <button
                    onClick={() => setShowRemoveConfirm(true)}
                    className="text-xs text-red-600 hover:text-red-800 font-medium"
                  >
                    Remove Offer
                  </button>
                )}
              <button
                onClick={() => setSelectedProducts([])}
                className="text-xs text-blue-600 hover:text-blue-800"
              >
                Clear Selection
              </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Products Display */}
      {pagedProducts.length === 0 ? (
        <div className="bg-white rounded-lg border border-gray-200 p-8 text-center">
          <Package className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No products found</h3>
          <p className="text-gray-500 mb-4">
            {searchTerm || selectedType !== 'All Types' || selectedCategory !== 'All Categories' || selectedBrand !== 'All Brands'
              ? 'No products match your current filters. Try adjusting your search criteria.'
              : 'You don\'t have any products yet. Create your first product to get started.'
            }
          </p>
          {searchTerm || selectedType !== 'All Types' || selectedCategory !== 'All Categories' || selectedBrand !== 'All Brands' ? (
            <button
              onClick={() => {
                setSearchTerm('');
                setSelectedType('All Types');
                setSelectedCategory('All Categories');
                setSelectedBrand('All Brands');
              }}
              className="px-4 py-2 bg-[#0a61d7] text-white rounded-lg hover:bg-[#084ba6] transition-colors"
            >
              Clear Filters
            </button>
          ) : (
            <button
              onClick={() => window.location.href = '/products/add'}
              className="px-4 py-2 bg-[#0a61d7] text-white rounded-lg hover:bg-[#084ba6] transition-colors"
            >
              Add Product
            </button>
          )}
        </div>
      ) : viewMode === 'grid' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {pagedProducts.map((product) => (
            <div 
              key={product.id} 
              className={`bg-white rounded-lg border border-gray-200 overflow-hidden hover:shadow-md transition-shadow cursor-pointer ${
                selectedProducts.includes(product.productId) 
                  ? 'ring-2 ring-blue-500 border-blue-500' 
                  : ''
              }`}
              onClick={(e) => {
                if (!(e.target as HTMLElement).closest('button')) {
                  handleProductSelect(product.productId);
                }
              }}
            >
              <div className="p-4">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleProductSelect(product.productId)}
                      className={`w-4 h-4 border-2 rounded transition-all duration-200 flex items-center justify-center ${
                        selectedProducts.includes(product.productId)
                          ? 'bg-green-500 border-green-500'
                          : 'bg-white border-gray-300 hover:border-green-400'
                      }`}
                    >
                      {selectedProducts.includes(product.productId) && (
                        <Check className="w-3 h-3 text-white" />
                      )}
                    </button>
                    <div className="flex-1">
                      <h3 className="font-medium text-black text-sm line-clamp-2">{product.name}</h3>
                      <p className="text-xs text-gray-500">{product.brand}</p>
                    </div>
                  </div>
                    {product.hasOffer && product.offerBadge && (
                      <div className="bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded-full">
                        {product.offerBadge}
                    </div>
                  )}
                </div>

                <div className="space-y-2 mb-3">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-500">Type:</span>
                    <span className="text-black">{product.productType}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-500">Category:</span>
                    <span className="text-black">{product.productCategory}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-500">Price:</span>
                    <span className="text-black font-medium">
                      {formatCurrency(parseNumberByCurrency(String(product.sellingPrice), userCurrency), userCurrency)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-500">Stock:</span>
                    <span className={`${getStockStatus(product).color}`}>
                      {product.stockQuantity} units
                    </span>
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusBadge(product.status)}`}>
                    {product.status.charAt(0).toUpperCase() + product.status.slice(1).toLowerCase()}
                  </span>
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStockStatus(product).bg} ${getStockStatus(product).color}`}>
                    {getStockStatus(product).label}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="py-3 px-4 font-medium text-xs uppercase text-gray-500">
                    <button
                      onClick={handleSelectAll}
                      className={`w-4 h-4 border-2 rounded transition-all duration-200 flex items-center justify-center ${
                        selectedProducts.length === pagedProducts.length && pagedProducts.length > 0
                          ? 'bg-green-500 border-green-500'
                          : 'bg-white border-gray-300 hover:border-green-400'
                      }`}
                    >
                      {selectedProducts.length === pagedProducts.length && pagedProducts.length > 0 && (
                        <Check className="w-3 h-3 text-white" />
                      )}
                    </button>
                  </th>
                  <th className="text-left py-3 px-4 font-medium text-xs uppercase text-gray-500">Product</th>
                  <th className="text-left py-3 px-4 font-medium text-xs uppercase text-gray-500">Type</th>
                  <th className="text-left py-3 px-4 font-medium text-xs uppercase text-gray-500">Category</th>
                  <th className="text-left py-3 px-4 font-medium text-xs uppercase text-gray-500">Brand</th>
                  <th className="text-right py-3 px-4 font-medium text-xs uppercase text-gray-500">Price</th>
                  <th className="text-right py-3 px-4 font-medium text-xs uppercase text-gray-500">Stock</th>
                  <th className="text-left py-3 px-4 font-medium text-xs uppercase text-gray-500">Status</th>
                </tr>
              </thead>
              <tbody>
                {pagedProducts.map((product) => (
                  <tr 
                    key={product.id} 
                    className={`border-b border-gray-100 hover:bg-gray-50 text-xs transition cursor-pointer whitespace-nowrap${
                      selectedProducts.includes(product.productId) 
                        ? 'bg-blue-50' 
                        : ''
                    }`}
                    onClick={(e) => handleRowClick(product.productId, e)}
                  >
                    <td className="w-12 py-4 px-4">
                      <div className="flex items-center justify-center">
                        <button
                          onClick={() => handleProductSelect(product.productId)}
                          className={`w-4 h-4 border-2 rounded transition-all duration-200 flex items-center justify-center ${
                            selectedProducts.includes(product.productId)
                              ? 'bg-green-500 border-green-500'
                              : 'bg-white border-gray-300 hover:border-green-400'
                          }`}
                        >
                          {selectedProducts.includes(product.productId) && (
                            <Check className="w-3 h-3 text-white" />
                          )}
                        </button>
                      </div>
                    </td>
                    <td className="py-4 px-4 text-gray-700">
                      <div className="font-medium text-black truncate">{product.name}</div>
                    </td>
                    <td className="py-4 px-4 text-gray-700 truncate">{product.productType}</td>
                    <td className="py-4 px-4 text-gray-700 truncate">{product.productCategory}</td>
                    <td className="py-4 px-4 text-gray-700 truncate">{product.brand}</td>
                    <td className="py-4 px-4 text-gray-700 font-medium text-right">
                      {formatCurrency(parseNumberByCurrency(String(product.sellingPrice), userCurrency), userCurrency)}
                    </td>
                    <td className="py-4 px-4 text-right">
                      <span className={`${getStockStatus(product).color}`}>
                        {product.stockQuantity}
                      </span>
                    </td>
                    <td className="py-4 px-4">
                      <div className="flex flex-col gap-1">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusBadge(product.status)}`}>
                          {product.status.charAt(0).toUpperCase() + product.status.slice(1).toLowerCase()}
                        </span>
                        {product.hasOffer && product.offerBadge ? (
                          <span className="bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded-full border border-blue-200">{product.offerBadge}</span>
                        ) : (
                          <span className="text-gray-400 text-xs">No offer</span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Pagination */}
      {totalRows > 0 && (
        <div className="flex items-center justify-between mt-4">
          <div className="text-sm text-gray-500">
            Showing {fromRow} to {toRow} of {totalRows} results
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage(Math.max(1, page - 1))}
              disabled={page === 1}
              className="px-3 py-1 text-sm text-gray-500 hover:text-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            
            <div className="flex items-center gap-1">
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                const pageNum = i + 1;
                return (
                  <button
                    key={pageNum}
                    onClick={() => setPage(pageNum)}
                    className={`px-3 py-2 text-sm rounded-lg ${
                      page === pageNum
                        ? 'bg-[#0a61d7] text-white'
                        : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
                    }`}
                  >
                    {pageNum}
                  </button>
                );
              })}
              {totalPages > 5 && (
                <>
                  {totalPages > 6 && <span className="px-2 text-gray-500">...</span>}
                  <button
                    onClick={() => setPage(totalPages)}
                    className={`px-3 py-1 text-sm rounded ${
                      page === totalPages
                        ? 'bg-[#0a61d7] text-white'
                        : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
                    }`}
                  >
                    {totalPages}
                  </button>
                </>
              )}
            </div>
            
            <button
              onClick={() => setPage(Math.min(totalPages, page + 1))}
              disabled={page === totalPages}
              className="px-3 py-1 text-sm text-gray-500 hover:text-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Apply Offer Modal */}
      {showOfferModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-gray-200 bg-white rounded-t-lg">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-[#0a61d7] rounded-lg flex items-center justify-center">
                  <Target className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-black">Apply Offer to Products</h3>
                  <p className="text-gray-500 text-sm">
                    Configure offer settings for {selectedProducts.length} selected product{selectedProducts.length !== 1 ? 's' : ''}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowOfferModal(false)}
                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Form - Scrollable Content */}
            <div className="p-4 space-y-4 overflow-y-auto hide-scrollbar flex-1">
              {/* Selected Products Summary */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <h4 className="text-sm font-semibold text-blue-900 mb-2">Selected Products</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {selectedProducts.slice(0, 4).map((productId) => {
                    const product = products.find(p => p.productId === productId);
                    return product ? (
                      <div key={productId} className="flex items-center gap-2 text-xs">
                        <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                        <span className="text-blue-800">{product.name}</span>
                      </div>
                    ) : null;
                  })}
                  {selectedProducts.length > 4 && (
                    <div className="flex items-center gap-2 text-xs">
                      <div className="w-2 h-2 bg-blue-300 rounded-full"></div>
                      <span className="text-blue-600 font-medium">
                        and {selectedProducts.length - 4} more products...
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Offer Information */}
              <div className="space-y-4">
                <h4 className="text-md font-semibold text-black">Offer Information</h4>
                
                {/* Offer Types Section */}
                <div className="space-y-2">
                  <h5 className="text-sm font-medium text-gray-700">Offer Types</h5>
                  <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                    <div className="space-y-3">
                      {/* Show first offer type */}
                      {offerTypes && offerTypes.length > 0 ? (
                      <div>
                        <div className="flex items-center justify-between">
                            <span className="text-xs text-gray-600">Offer Name:</span>
                          <span className="text-xs font-medium text-black">{offerTypes[0].name}</span>
                        </div>
                        <div className="flex items-center justify-between">
                            <span className="text-xs text-gray-600">Type:</span>
                            <span className="text-xs font-medium text-black">{getTypeLabel(offerTypes[0].type as any)}</span>
                        </div>
                        </div>
                      ) : (
                        <div className="text-xs text-gray-500">No offer types configured.</div>
                      )}

                      {/* Show expanded offer types when dropdown is open */}
                      {showMoreOfferTypes && (
                        <div className="space-y-3">
                          {offerTypes.slice(1).map((offerType: any, index: number) => (
                            <div key={offerType.id}>
                              {index === 0 && <div className="border-t border-gray-300 mt-3 pb-3"></div>}
                              <div className="flex items-center justify-between">
                                <span className="text-xs text-gray-600">Offer Name:</span>
                                <span className="text-xs font-medium text-black">{offerType.name}</span>
                              </div>
                              <div className="flex items-center justify-between">
                                <span className="text-xs text-gray-600">Type:</span>
                                <span className="text-xs font-medium text-black">{getTypeLabel(offerType.type as any)}</span>
                              </div>
                              {index < offerTypes.slice(1).length - 1 && (
                                <div className="border-t border-gray-300 mt-3"></div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Dropdown button at the bottom */}
                      {offerTypes.length > 1 && (
                        <div className="pt-2 border-t border-gray-200">
                          <button
                            onClick={() => setShowMoreOfferTypes(!showMoreOfferTypes)}
                            className="flex items-center justify-center gap-1 w-full text-xs text-gray-500 hover:text-gray-700 transition-colors"
                          >
                            {showMoreOfferTypes ? 'Show less' : `and ${offerTypes.length - 1} more offer types`}
                            {showMoreOfferTypes ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Date & Time Ranges Section */}
                <div className="space-y-2">
                  <h5 className="text-sm font-medium text-gray-700">Active Periods</h5>
                  
                  {/* Range Tabs */}
                  <div className="flex gap-1">
                    <button
                      onClick={() => setRangeTab('date')}
                      className={`flex items-center gap-1 px-3 py-1 rounded text-xs font-medium transition-colors ${
                        rangeTab === 'date'
                          ? 'bg-[#0a61d7] text-white'
                          : 'text-gray-600 hover:text-black hover:bg-gray-100'
                      }`}
                    >
                      <Calendar className="w-3 h-3" />
                      Date Ranges
                    </button>
                    <button
                      onClick={() => setRangeTab('time')}
                      className={`flex items-center gap-1 px-3 py-1 rounded text-xs font-medium transition-colors ${
                        rangeTab === 'time'
                          ? 'bg-[#0a61d7] text-white'
                          : 'text-gray-600 hover:text-black hover:bg-gray-100'
                      }`}
                    >
                      <Clock className="w-3 h-3" />
                      Time Slots
                    </button>
                  </div>

                  <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                    {rangeTab === 'date' ? (
                      <div className="space-y-3">
                        {/* Show first date range */}
                        {dateRanges && dateRanges.length > 0 ? (
                        <div>
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-gray-600">Active Period:</span>
                            <span className="text-xs font-medium text-black">{dateRanges[0].name}</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-gray-600">Duration:</span>
                            <span className="text-xs font-medium text-black">
                              {new Date(dateRanges[0].startDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - {new Date(dateRanges[0].endDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                            </span>
                          </div>
                        </div>
                        ) : (
                          <div className="text-xs text-gray-500">No date ranges configured.</div>
                        )}

                        {/* Show expanded date ranges when dropdown is open */}
                        {showMoreRanges && (
                          <div className="space-y-3">
                            {dateRanges.slice(1).map((range: any, index: number) => (
                              <div key={range.id}>
                                {index === 0 && <div className="border-t border-gray-300 mt-3 pb-3"></div>}
                                <div className="flex items-center justify-between">
                                  <span className="text-xs text-gray-600">Active Period:</span>
                                  <span className="text-xs font-medium text-black">{range.name}</span>
                                </div>
                                <div className="flex items-center justify-between">
                                  <span className="text-xs text-gray-600">Duration:</span>
                                  <span className="text-xs font-medium text-black">
                                    {new Date(range.startDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - {new Date(range.endDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                  </span>
                                </div>
                                {index < dateRanges.slice(1).length - 1 && (
                                  <div className="border-t border-gray-300 mt-3"></div>
                                )}
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Dropdown button at the bottom */}
                        {dateRanges && dateRanges.length > 1 && (
                          <div className="pt-2 border-t border-gray-200">
                            <button
                              onClick={() => setShowMoreRanges(!showMoreRanges)}
                              className="flex items-center justify-center gap-1 w-full text-xs text-gray-500 hover:text-gray-700 transition-colors"
                            >
                              {showMoreRanges ? 'Show less' : `and ${dateRanges.length - 1} more date ranges`}
                              {showMoreRanges ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                            </button>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {/* Show first time slot */}
                        {timeSlots && timeSlots.length > 0 ? (
                        <div>
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-gray-600">Time Slot:</span>
                            <span className="text-xs font-medium text-black">{timeSlots[0].name}</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-gray-600">Schedule:</span>
                            <span className="text-xs font-medium text-black">
                              {timeSlots[0].startTime} - {timeSlots[0].endTime}
                            </span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-gray-600">Days:</span>
                            <span className="text-xs font-medium text-black">{timeSlots[0].days.join(', ')}</span>
                          </div>
                        </div>
                        ) : (
                          <div className="text-xs text-gray-500">No time slots configured.</div>
                        )}

                        {/* Show expanded time slots when dropdown is open */}
                        {showMoreRanges && (
                          <div className="space-y-3">
                            {timeSlots.slice(1).map((slot: any, index: number) => (
                              <div key={slot.id}>
                                {index === 0 && <div className="border-t border-gray-300 mt-3 pb-3"></div>}
                                <div className="flex items-center justify-between">
                                  <span className="text-xs text-gray-600">Time Slot:</span>
                                  <span className="text-xs font-medium text-black">{slot.name}</span>
                                </div>
                                <div className="flex items-center justify-between">
                                  <span className="text-xs text-gray-600">Schedule:</span>
                                  <span className="text-xs font-medium text-black">
                                    {slot.startTime} - {slot.endTime}
                                  </span>
                                </div>
                                <div className="flex items-center justify-between">
                                  <span className="text-xs text-gray-600">Days:</span>
                                  <span className="text-xs font-medium text-black">{slot.days.join(', ')}</span>
                                </div>
                                {index < timeSlots.slice(1).length - 1 && (
                                  <div className="border-t border-gray-300 mt-3"></div>
                                )}
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Dropdown button at the bottom */}
                        {timeSlots && timeSlots.length > 1 && (
                          <div className="pt-2 border-t border-gray-200">
                            <button
                              onClick={() => setShowMoreRanges(!showMoreRanges)}
                              className="flex items-center justify-center gap-1 w-full text-xs text-gray-500 hover:text-gray-700 transition-colors"
                            >
                              {showMoreRanges ? 'Show less' : `and ${timeSlots.length - 1} more time slots`}
                              {showMoreRanges ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-3 p-4 border-t border-gray-200 text-sm flex-shrink-0 rounded-b-lg">
              <button
                onClick={() => setShowOfferModal(false)}
                className="px-4 py-2 rounded-lg bg-gray-100 text-gray-700 font-medium hover:bg-gray-200 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  if (isBatchEditMode) {
                    // In batch edit mode, update parent state
                    const existingProducts = offerData.products || [];
                    const newProducts = selectedProducts.map(productId => ({
                      id: `po-${Date.now()}-${productId}`,
                      productId,
                      offerId: offerData.id,
                      discountType: 'percentage' as const,
                      discountValue: 0,
                      isActive: true,
                    }));
                    const updatedProducts = [...existingProducts, ...newProducts];
                    
                    // Update product offer badges
                    const badge = computeOfferBadge();
                    const updatedBadges = { ...productOfferBadges };
                    selectedProducts.forEach(id => {
                      updatedBadges[id] = badge;
                    });
                    
                    onOfferChange!({ 
                      products: updatedProducts,
                      productOfferBadges: updatedBadges
                    });
                    
                    // Update local UI
                    setProducts((prev) => prev.map((p) => {
                      if (selectedProducts.includes(p.productId)) {
                        const discountAmount = calculateDiscountAmount(p);
                        return { 
                          ...p, 
                          hasOffer: true, 
                          offerBadge: badge,
                          offerDiscount: discountAmount,
                          offerType: 'percentage'
                        };
                      }
                      return p;
                    }));
                  } else {
                    // In create view, update local state
                    const badge = computeOfferBadge();
                    setProducts((prev) => prev.map((p) => {
                      if (selectedProducts.includes(p.productId)) {
                        const discountAmount = calculateDiscountAmount(p);
                        return { 
                          ...p, 
                          hasOffer: true, 
                          offerBadge: badge,
                          offerDiscount: discountAmount,
                          offerType: 'percentage'
                        };
                      }
                      return p;
                    }));
                    selectedProducts.forEach((id) => setProductOfferBadge(id, badge));
                  }
                  setShowOfferModal(false);
                  setSelectedProducts([]);
                }}
                className="flex items-center gap-2 px-6 py-2 bg-[#0a61d7] text-white rounded-lg hover:bg-[#084ba6] transition-colors"
              >
                Apply Offer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm Remove Offer Modal */}
      {showRemoveConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-md w-full">
            <div className="p-4 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-black">Remove Offer</h3>
            </div>
            <div className="p-4 space-y-2">
              <p className="text-sm text-gray-700">
                Are you sure you want to remove offers from {selectedProducts.filter(id => {
                  const p = products.find(pp => pp.productId === id);
                  return p?.hasOffer;
                }).length} selected product{selectedProducts.filter(id => {
                  const p = products.find(pp => pp.productId === id);
                  return p?.hasOffer;
                }).length !== 1 ? 's' : ''}?
              </p>
              <p className="text-xs text-gray-500">This action only affects products that currently have an offer.</p>
            </div>
            <div className="flex items-center justify-end gap-2 p-4 border-t border-gray-200">
              <button
                onClick={() => setShowRemoveConfirm(false)}
                className="px-4 py-2 rounded-lg bg-gray-100 text-gray-700 text-sm hover:bg-gray-200"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  if (isBatchEditMode) {
                    // In batch edit mode, update parent state
                    const productsWithOffers = selectedProducts.filter(id => {
                      const p = products.find(pp => pp.productId === id);
                      return p?.hasOffer;
                    });
                    
                    const existingProducts = offerData.products || [];
                    const updatedProducts = existingProducts.filter((p: any) => 
                      !productsWithOffers.includes(p.productId)
                    );
                    
                    // Update product offer badges
                    const updatedBadges = { ...productOfferBadges };
                    productsWithOffers.forEach(id => {
                      delete updatedBadges[id];
                    });
                    
                    onOfferChange!({ 
                      products: updatedProducts,
                      productOfferBadges: updatedBadges
                    });
                    
                    // Update local UI
                    setProducts((prev) => prev.map((p) => (
                      selectedProducts.includes(p.productId) && p.hasOffer
                        ? { ...p, hasOffer: false, offerBadge: undefined }
                        : p
                    )));
                  } else {
                    // In create view, update local state
                    setProducts((prev) => prev.map((p) => (
                      selectedProducts.includes(p.productId) && p.hasOffer
                        ? { ...p, hasOffer: false, offerBadge: undefined }
                        : p
                    )));
                    selectedProducts.forEach((id) => clearProductOfferBadge(id));
                  }
                  setShowRemoveConfirm(false);
                  setSelectedProducts([]);
                }}
                className="px-4 py-2 rounded-lg bg-red-600 text-white text-sm hover:bg-red-700"
              >
                Remove
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
