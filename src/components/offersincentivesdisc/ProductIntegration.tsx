'use client';

import React, { useState } from 'react';
import { Package, Search, Filter, Plus, Check, X, Target, Tag, Grid, List, ChevronDown } from 'lucide-react';
import { formatCurrency, getDefaultCurrency } from '@/utils/currencyUtils';
import { useUserStore } from '@/store/userStore';

interface Product {
  id: string;
  name: string;
  category: string;
  brand: string;
  price: number;
  stock: number;
  status: 'published' | 'draft';
  hasOffer: boolean;
  offerDiscount?: number;
  offerType?: 'percentage' | 'fixed';
}

interface OfferProduct {
  productId: string;
  discountType: 'percentage' | 'fixed';
  discountValue: number;
  isActive: boolean;
}

export default function ProductIntegration() {
  const user = useUserStore(state => state.user);
  const userCurrency = user?.currency || getDefaultCurrency();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All Categories');
  const [selectedBrand, setSelectedBrand] = useState('All Brands');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [selectedProducts, setSelectedProducts] = useState<string[]>([]);
  const [showOfferModal, setShowOfferModal] = useState(false);
  const [showCategoryDropdown, setShowCategoryDropdown] = useState(false);
  const [showBrandDropdown, setShowBrandDropdown] = useState(false);

  // Mock data - replace with actual API calls
  const products: Product[] = [
    {
      id: '1',
      name: 'Premium Coffee Beans',
      category: 'Beverages',
      brand: 'CoffeeMaster',
      price: 250000,
      stock: 150,
      status: 'published',
      hasOffer: true,
      offerDiscount: 15,
      offerType: 'percentage',
    },
    {
      id: '2',
      name: 'Organic Tea Leaves',
      category: 'Beverages',
      brand: 'TeaGarden',
      price: 180000,
      stock: 89,
      status: 'published',
      hasOffer: false,
    },
    {
      id: '3',
      name: 'Energy Drink',
      category: 'Beverages',
      brand: 'PowerUp',
      price: 45000,
      stock: 200,
      status: 'published',
      hasOffer: true,
      offerDiscount: 5000,
      offerType: 'fixed',
    },
    {
      id: '4',
      name: 'Mineral Water',
      category: 'Beverages',
      brand: 'PureWater',
      price: 15000,
      stock: 500,
      status: 'published',
      hasOffer: false,
    },
    {
      id: '5',
      name: 'Chocolate Bar',
      category: 'Snacks',
      brand: 'SweetTreat',
      price: 35000,
      stock: 120,
      status: 'published',
      hasOffer: true,
      offerDiscount: 20,
      offerType: 'percentage',
    },
  ];

  const categories = ['All Categories', ...Array.from(new Set(products.map(p => p.category)))];
  const brands = ['All Brands', ...Array.from(new Set(products.map(p => p.brand)))];

  const filteredProducts = products.filter(product => {
    const matchesSearch = product.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         product.category.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         product.brand.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = selectedCategory === 'All Categories' || product.category === selectedCategory;
    const matchesBrand = selectedBrand === 'All Brands' || product.brand === selectedBrand;
    
    return matchesSearch && matchesCategory && matchesBrand;
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
    if (selectedProducts.length === filteredProducts.length) {
      setSelectedProducts([]);
    } else {
      setSelectedProducts(filteredProducts.map(product => product.id));
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'published':
        return 'bg-green-100 text-green-800 border border-green-200';
      case 'draft':
        return 'bg-gray-100 text-gray-800 border border-gray-200';
      default:
        return 'bg-gray-100 text-gray-800 border border-gray-200';
    }
  };

  const getStockStatus = (stock: number) => {
    if (stock === 0) return { color: 'text-red-600', bg: 'bg-red-50', label: 'Out of Stock' };
    if (stock < 50) return { color: 'text-orange-600', bg: 'bg-orange-50', label: 'Low Stock' };
    return { color: 'text-green-600', bg: 'bg-green-50', label: 'In Stock' };
  };

  return (
    <div className="p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-black">Product Integration</h2>
          <p className="text-gray-500 text-sm">Select products for offers and discounts</p>
        </div>
        {selectedProducts.length > 0 && (
          <button
            onClick={() => setShowOfferModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-[#0a61d7] text-white rounded-lg hover:bg-[#084ba6] transition-colors"
          >
            <Plus className="w-4 h-4" />
            Apply Offer ({selectedProducts.length})
          </button>
        )}
      </div>

      {/* Filters and Search */}
      <div className="bg-white rounded-lg border border-gray-200 p-4">
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

            {/* Category Filter Dropdown */}
            <div className="relative">
              <button
                className="flex items-center gap-1 px-3 py-2 rounded-lg border border-[#e6e6e6] bg-white text-gray-700 hover:bg-gray-100 text-sm"
                onClick={() => {
                  setShowCategoryDropdown(!showCategoryDropdown);
                  setShowBrandDropdown(false); // Close brand dropdown when opening category dropdown
                }}
              >
                {selectedCategory}
                <ChevronDown className="w-4 h-4 ml-1 text-gray-500" />
              </button>
              {showCategoryDropdown && (
                <div className="absolute right-0 mt-2 w-48 bg-white border border-gray-200 rounded-lg shadow z-20">
                  {categories.map((category) => (
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
                  setShowCategoryDropdown(false); // Close category dropdown when opening brand dropdown
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

        {/* Selection Summary */}
        {selectedProducts.length > 0 && (
          <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
            <div className="flex items-center justify-between">
              <span className="text-sm text-blue-700">
                {selectedProducts.length} product{selectedProducts.length !== 1 ? 's' : ''} selected
              </span>
              <button
                onClick={() => setSelectedProducts([])}
                className="text-xs text-blue-600 hover:text-blue-800"
              >
                Clear Selection
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Products Display */}
      {viewMode === 'grid' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filteredProducts.map((product) => (
            <div key={product.id} className="bg-white rounded-lg border border-gray-200 overflow-hidden hover:shadow-md transition-shadow">
              <div className="p-4">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleProductSelect(product.id)}
                      className={`w-4 h-4 border-2 rounded transition-all duration-200 flex items-center justify-center ${
                        selectedProducts.includes(product.id)
                          ? 'bg-green-500 border-green-500'
                          : 'bg-white border-gray-300 hover:border-green-400'
                      }`}
                    >
                      {selectedProducts.includes(product.id) && (
                        <Check className="w-3 h-3 text-white" />
                      )}
                    </button>
                    <div className="flex-1">
                      <h3 className="font-medium text-black text-sm line-clamp-2">{product.name}</h3>
                      <p className="text-xs text-gray-500">{product.brand}</p>
                    </div>
                  </div>
                  {product.hasOffer && (
                    <div className="bg-orange-100 text-orange-800 text-xs px-2 py-1 rounded-full">
                      {product.offerType === 'percentage' ? `${product.offerDiscount}%` : formatCurrency(product.offerDiscount!, userCurrency)}
                    </div>
                  )}
                </div>

                <div className="space-y-2 mb-3">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-500">Category:</span>
                    <span className="text-black">{product.category}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-500">Price:</span>
                    <span className="text-black font-medium">{formatCurrency(product.price, userCurrency)}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-500">Stock:</span>
                    <span className={`${getStockStatus(product.stock).color}`}>
                      {product.stock} units
                    </span>
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusBadge(product.status)}`}>
                    {product.status}
                  </span>
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStockStatus(product.stock).bg} ${getStockStatus(product.stock).color}`}>
                    {getStockStatus(product.stock).label}
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
                  <th className="text-left py-3 px-4 font-medium text-xs uppercase text-gray-500">
                    <button
                      onClick={handleSelectAll}
                      className={`w-4 h-4 border-2 rounded transition-all duration-200 flex items-center justify-center ${
                        selectedProducts.length === filteredProducts.length && filteredProducts.length > 0
                          ? 'bg-green-500 border-green-500'
                          : 'bg-white border-gray-300 hover:border-green-400'
                      }`}
                    >
                      {selectedProducts.length === filteredProducts.length && filteredProducts.length > 0 && (
                        <Check className="w-3 h-3 text-white" />
                      )}
                    </button>
                  </th>
                  <th className="text-left py-3 px-4 font-medium text-xs uppercase text-gray-500">Product</th>
                  <th className="text-left py-3 px-4 font-medium text-xs uppercase text-gray-500">Category</th>
                  <th className="text-left py-3 px-4 font-medium text-xs uppercase text-gray-500">Brand</th>
                  <th className="text-left py-3 px-4 font-medium text-xs uppercase text-gray-500">Price</th>
                  <th className="text-left py-3 px-4 font-medium text-xs uppercase text-gray-500">Stock</th>
                  <th className="text-left py-3 px-4 font-medium text-xs uppercase text-gray-500">Status</th>
                  <th className="text-left py-3 px-4 font-medium text-xs uppercase text-gray-500">Offer</th>
                </tr>
              </thead>
              <tbody>
                {filteredProducts.map((product) => (
                  <tr 
                    key={product.id} 
                    className={`border-b border-gray-100 hover:bg-gray-50 text-xs transition cursor-pointer ${
                      selectedProducts.includes(product.id) 
                        ? 'bg-blue-50' 
                        : ''
                    }`}
                    onClick={(e) => handleRowClick(product.id, e)}
                  >
                    <td className="py-4 px-4">
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => handleProductSelect(product.id)}
                          className={`w-4 h-4 border-2 rounded transition-all duration-200 flex items-center justify-center ${
                            selectedProducts.includes(product.id)
                              ? 'bg-green-500 border-green-500'
                              : 'bg-white border-gray-300 hover:border-green-400'
                          }`}
                        >
                          {selectedProducts.includes(product.id) && (
                            <Check className="w-3 h-3 text-white" />
                          )}
                        </button>
                        <div>
                          <div className="font-medium text-black">{product.name}</div>
                        </div>
                      </div>
                    </td>
                    <td className="py-4 px-4 text-gray-700">{product.category}</td>
                    <td className="py-4 px-4 text-gray-700">{product.brand}</td>
                    <td className="py-4 px-4 text-gray-700 font-medium">
                      {formatCurrency(product.price, userCurrency)}
                    </td>
                    <td className="py-4 px-4">
                      <span className={`${getStockStatus(product.stock).color}`}>
                        {product.stock}
                      </span>
                    </td>
                    <td className="py-4 px-4">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusBadge(product.status)}`}>
                        {product.status}
                      </span>
                    </td>
                    <td className="py-4 px-4">
                      {product.hasOffer ? (
                        <span className="bg-orange-100 text-orange-800 text-xs px-2 py-1 rounded-full">
                          {product.offerType === 'percentage' ? `${product.offerDiscount}%` : formatCurrency(product.offerDiscount!, userCurrency)}
                        </span>
                      ) : (
                        <span className="text-gray-400 text-xs">No offer</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Apply Offer Modal Placeholder */}
      {showOfferModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-black">Apply Offer to Products</h3>
              <button
                onClick={() => setShowOfferModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                ×
              </button>
            </div>
            <div className="text-gray-500 text-center py-8">
              Offer application form will be implemented here for {selectedProducts.length} selected products
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
