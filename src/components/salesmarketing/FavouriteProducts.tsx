'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Package, Plus, Search, X, Trash2, Grid, List, Check, ChevronLeft, ChevronRight, ChevronDown } from 'lucide-react';
import { SalesAgent } from './TeamList';
import { Product } from '@/types/product';
import { useUserStore } from '@/store/userStore';
import { fetchGraphQL } from '@/lib/graphqlClient';
import { formatCurrency, getDefaultCurrency, parsePrice } from '@/utils/currencyUtils';
import { parseNumberByCurrency } from '@/config/currencyConfig';

interface FavoriteProduct {
  productId: string;
  name: string;
  productType: string;
  brand?: string;
  images?: string[];
  sellingPrice?: string;
}

interface FavouriteProductsProps {
  formData: Partial<SalesAgent>;
  onFormChange: (updates: Partial<SalesAgent>) => void;
  onTabCompletion: (tabId: 'products', isComplete: boolean) => void;
  mode: 'create' | 'edit';
}

export default function FavouriteProducts({
  formData,
  onFormChange,
  onTabCompletion,
  mode,
}: FavouriteProductsProps) {
  const user = useUserStore(state => state.user);
  const userCurrency = user?.currency || getDefaultCurrency();
  const [isClient, setIsClient] = useState(false);
  
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedProducts, setSelectedProducts] = useState<FavoriteProduct[]>(() => {
    // In production, this would come from formData.favoriteProducts
    // For now, using empty array
    return [];
  });
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedType, setSelectedType] = useState('All Types');
  const [selectedCategory, setSelectedCategory] = useState('All Categories');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [page, setPage] = useState(1);
  const [showTypeDropdown, setShowTypeDropdown] = useState(false);
  const [showCategoryDropdown, setShowCategoryDropdown] = useState(false);
  const rowsPerPage = 8;
  
  const typeDropdownRef = useRef<HTMLDivElement>(null);
  const categoryDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setIsClient(true);
  }, []);

  // Fetch products from GraphQL API
  const fetchProducts = useCallback(async () => {
    if (!user?.id || !isClient) return;
    
    setLoading(true);
    try {
      const PRODUCTS_QUERY = `
        query GetProducts($userId: Int!, $page: Int, $limit: Int) {
          products(userId: $userId, page: $page, limit: $limit) {
            nodes {
              id
              productId
              sku
              name
              description
              productType
              brand
              supplier
              status
              productCategory
              catalogName
              images
              variantOptions {
                id
                variantName
                sku
                purchasePrice
                sellingPrice
                originalSellingPrice
                moq
                stockQuantity
                lowStockThreshold
                stockStatus
                isDefault
                isActive
                attributes
              }
              variantDefinitions
              legacyVariants
            }
            pagination {
              totalCount
            }
          }
        }
      `;

      const data = await fetchGraphQL<{
        products: {
          nodes: Product[];
          pagination: { totalCount: number };
        };
      }>(PRODUCTS_QUERY, {
        userId: user.id,
        page: 1,
        limit: 1000, // Fetch all products
      });

      setProducts(data.products.nodes);
    } catch (error) {
      console.error('Error fetching products:', error);
      setProducts([]);
    } finally {
      setLoading(false);
    }
  }, [user?.id, isClient]);

  useEffect(() => {
    if (isClient) {
      fetchProducts();
    }
  }, [isClient, fetchProducts]);

  // Update tab completion - products are optional, so always complete
  useEffect(() => {
    onTabCompletion('products', true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only run once on mount

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (typeDropdownRef.current && !typeDropdownRef.current.contains(event.target as Node)) {
        setShowTypeDropdown(false);
      }
      if (categoryDropdownRef.current && !categoryDropdownRef.current.contains(event.target as Node)) {
        setShowCategoryDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Get unique product types and categories
  const productTypes = ['All Types', ...Array.from(new Set(products.map(p => p.productType).filter(Boolean)))];
  const productCategories = ['All Categories', ...Array.from(new Set(products.map(p => p.productCategory).filter(Boolean)))];

  // Filter products
  const filteredProducts = products.filter(product => {
    const matchesSearch = searchQuery === '' || 
      product.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      product.sku.toLowerCase().includes(searchQuery.toLowerCase()) ||
      product.brand?.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesType = selectedType === 'All Types' || product.productType === selectedType;
    const matchesCategory = selectedCategory === 'All Categories' || product.productCategory === selectedCategory;
    const isPublished = product.status === 'Published';

    return matchesSearch && matchesType && matchesCategory && isPublished;
  });

  // Pagination
  const totalPages = Math.ceil(filteredProducts.length / rowsPerPage);
  const startIndex = (page - 1) * rowsPerPage;
  const endIndex = startIndex + rowsPerPage;
  const pagedProducts = filteredProducts.slice(startIndex, endIndex);

  // Calculate price display
  const getPriceDisplay = (product: Product): string => {
    const variantOptions = product.variantOptions || [];
    const legacyVariants = product.legacyVariants || [];
    
    const prices: number[] = [];
    
    variantOptions.forEach(option => {
      const price = parsePrice(String(option.sellingPrice), userCurrency);
      if (price > 0) prices.push(price);
    });
    
    legacyVariants.forEach(variant => {
      const price = parsePrice(String(variant.sellingPrice), userCurrency);
      if (price > 0) prices.push(price);
    });
    
    if (prices.length === 0) {
      return formatCurrency(0, userCurrency);
    }
    
    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);
    
    if (minPrice === maxPrice) {
      return formatCurrency(minPrice, userCurrency);
    } else {
      return `${formatCurrency(minPrice, userCurrency)} – ${formatCurrency(maxPrice, userCurrency)}`;
    }
  };

  const handleAddProduct = (product: Product) => {
    if (!selectedProducts.find(p => p.productId === product.productId)) {
      const favoriteProduct: FavoriteProduct = {
        productId: product.productId,
        name: product.name,
        productType: product.productType,
        brand: product.brand,
        images: product.images,
        sellingPrice: getPriceDisplay(product),
      };
      setSelectedProducts([...selectedProducts, favoriteProduct]);
    }
  };

  const handleRemoveProduct = (productId: string) => {
    setSelectedProducts(selectedProducts.filter(p => p.productId !== productId));
  };

  const isProductSelected = (productId: string) => {
    return selectedProducts.some(p => p.productId === productId);
  };

  const handleSelectAll = () => {
    const allSelected = pagedProducts.every(p => isProductSelected(p.productId));
    if (allSelected) {
      // Deselect all products on current page
      const currentPageProductIds = pagedProducts.map(p => p.productId);
      setSelectedProducts(selectedProducts.filter(p => !currentPageProductIds.includes(p.productId)));
    } else {
      // Select all products on current page that aren't already selected
      const newProducts = pagedProducts
        .filter(p => !isProductSelected(p.productId))
        .map(product => ({
          productId: product.productId,
          name: product.name,
          productType: product.productType,
          brand: product.brand,
          images: product.images,
          sellingPrice: getPriceDisplay(product),
        }));
      setSelectedProducts([...selectedProducts, ...newProducts]);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
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
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-gray-900 mb-1">Favourite Products to be Sold</h3>
        <p className="text-sm text-gray-500">Select products from your catalog that this agent specializes in selling</p>
      </div>

      {/* Search and Filters */}
      <div className="bg-white border border-gray-200 rounded-lg p-4">
        <div className="flex flex-col md:flex-row md:items-center gap-4">
          {/* Search */}
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setPage(1); // Reset to first page on search
              }}
              placeholder="Search products by name, SKU, or brand..."
              className="w-full pl-10 pr-4 py-2 text-black border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0a61d7] text-sm"
            />
          </div>

          {/* Type Filter */}
          <div className="relative" ref={typeDropdownRef}>
            <button
              className="flex items-center gap-1 px-3 py-2 rounded-lg border border-[#e6e6e6] bg-white text-gray-700 hover:bg-gray-100 text-sm"
              onClick={() => {
                setShowTypeDropdown(!showTypeDropdown);
                setShowCategoryDropdown(false);
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
                      setPage(1);
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

          {/* Category Filter */}
          <div className="relative" ref={categoryDropdownRef}>
            <button
              className="flex items-center gap-1 px-3 py-2 rounded-lg border border-[#e6e6e6] bg-white text-gray-700 hover:bg-gray-100 text-sm"
              onClick={() => {
                setShowCategoryDropdown(!showCategoryDropdown);
                setShowTypeDropdown(false);
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
                      setPage(1);
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
                {selectedProducts.length} product{selectedProducts.length !== 1 ? 's' : ''} selected as favorites
              </span>
              <button
                onClick={() => setSelectedProducts([])}
                className="text-xs text-blue-600 hover:text-blue-800 font-medium"
              >
                Clear All
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Select All Button */}
      {pagedProducts.length > 0 && (
        <div className="flex items-center gap-2">
          <button
            onClick={handleSelectAll}
            className={`w-5 h-5 border-2 rounded transition-all duration-200 flex items-center justify-center ${
              pagedProducts.every(p => isProductSelected(p.productId)) && pagedProducts.length > 0
                ? 'bg-green-500 border-green-500'
                : 'bg-white border-gray-300 hover:border-green-400'
            }`}
          >
            {pagedProducts.every(p => isProductSelected(p.productId)) && pagedProducts.length > 0 && (
              <Check className="w-3 h-3 text-white" />
            )}
          </button>
          <span className="text-sm text-gray-700">
            Select All on This Page ({pagedProducts.filter(p => isProductSelected(p.productId)).length}/{pagedProducts.length})
          </span>
        </div>
      )}

      {/* Products Grid/List */}
      {pagedProducts.length === 0 ? (
        <div className="text-center py-12 border-2 border-dashed border-gray-300 rounded-lg">
          <Package className="w-12 h-12 mx-auto mb-4 text-gray-400" />
          <p className="text-sm text-gray-500">No products found</p>
          <p className="text-xs text-gray-400 mt-1">Try adjusting your search or filters</p>
        </div>
      ) : (
        <>
          {viewMode === 'grid' ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {pagedProducts.map((product) => {
                const isSelected = isProductSelected(product.productId);
                const productImage = product.images?.[0] || '/placeholder-product.png';
                
                return (
                  <div
                    key={product.productId}
                    className={`border-2 rounded-lg overflow-hidden transition-all cursor-pointer ${
                      isSelected
                        ? 'border-green-500 bg-green-50'
                        : 'border-gray-200 hover:border-gray-300 bg-white'
                    }`}
                    onClick={() => {
                      if (isSelected) {
                        handleRemoveProduct(product.productId);
                      } else {
                        handleAddProduct(product);
                      }
                    }}
                  >
                    <div className="relative">
                      <img
                        src={productImage}
                        alt={product.name}
                        className="w-full h-40 object-cover"
                        onError={(e) => {
                          (e.target as HTMLImageElement).src = '/placeholder-product.png';
                        }}
                      />
                      {isSelected && (
                        <div className="absolute top-2 right-2 w-6 h-6 bg-green-500 rounded-full flex items-center justify-center">
                          <Check className="w-4 h-4 text-white" />
                        </div>
                      )}
                    </div>
                    <div className="p-4">
                      <h4 className="text-sm font-semibold text-gray-900 mb-1 line-clamp-2">{product.name}</h4>
                      <p className="text-xs text-gray-500 mb-2">{product.productType}</p>
                      <p className="text-sm font-bold text-[#0a61d7]">{getPriceDisplay(product)}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="space-y-2">
              {pagedProducts.map((product) => {
                const isSelected = isProductSelected(product.productId);
                
                return (
                  <div
                    key={product.productId}
                    className={`flex items-center gap-4 p-4 border-2 rounded-lg transition-all cursor-pointer ${
                      isSelected
                        ? 'border-green-500 bg-green-50'
                        : 'border-gray-200 hover:border-gray-300 bg-white'
                    }`}
                    onClick={() => {
                      if (isSelected) {
                        handleRemoveProduct(product.productId);
                      } else {
                        handleAddProduct(product);
                      }
                    }}
                  >
                    <div className="w-16 h-16 rounded-lg overflow-hidden flex-shrink-0">
                      <img
                        src={product.images?.[0] || '/placeholder-product.png'}
                        alt={product.name}
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          (e.target as HTMLImageElement).src = '/placeholder-product.png';
                        }}
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="text-sm font-semibold text-gray-900 mb-1">{product.name}</h4>
                      <p className="text-xs text-gray-500">{product.productType} {product.brand && `• ${product.brand}`}</p>
                      <p className="text-sm font-bold text-[#0a61d7] mt-1">{getPriceDisplay(product)}</p>
                    </div>
                    {isSelected && (
                      <div className="w-6 h-6 bg-green-500 rounded-full flex items-center justify-center flex-shrink-0">
                        <Check className="w-4 h-4 text-white" />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Pagination */}
          {filteredProducts.length > 0 && (
            <div className="flex flex-col md:flex-row md:items-center md:justify-between mt-6 gap-2">
              {/* Left: Showing X to Y of Z */}
              <div className="text-sm text-gray-500">
                Showing {startIndex + 1} to {Math.min(endIndex, filteredProducts.length)} of {filteredProducts.length}
              </div>
              {/* Right: Pagination Controls */}
              <div className="flex items-center gap-3">
                <button
                  className="p-2 rounded-lg hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1 || totalPages === 0}
                  aria-label="Previous page"
                >
                  <ChevronLeft className="w-4 h-4 text-gray-500" />
                </button>
                {totalPages > 0 && Array.from({ length: Math.min(7, totalPages) }, (_, i) => {
                  let pageNum;
                  if (totalPages <= 7) {
                    pageNum = i + 1;
                  } else if (page <= 4) {
                    pageNum = i + 1;
                  } else if (page >= totalPages - 3) {
                    pageNum = totalPages - 6 + i;
                  } else {
                    pageNum = page - 3 + i;
                  }
                  return (
                    <button
                      key={pageNum}
                      className={`px-3 py-2 rounded-lg font-semibold text-sm transition ${
                        pageNum === page 
                          ? 'bg-[#0a61d7] text-white' 
                          : 'bg-white text-[#0a61d7] hover:bg-[#f7faff]'
                      }`}
                      onClick={() => setPage(pageNum)}
                    >
                      {pageNum}
                    </button>
                  );
                })}
                {totalPages > 7 && page < totalPages - 3 && (
                  <span className="px-2 text-gray-500">...</span>
                )}
                {totalPages > 7 && page < totalPages - 3 && (
                  <button
                    className={`px-3 py-2 rounded-lg font-semibold text-sm transition ${
                      page === totalPages
                        ? 'bg-[#0a61d7] text-white'
                        : 'bg-white text-[#0a61d7] hover:bg-[#f7faff]'
                    }`}
                    onClick={() => setPage(totalPages)}
                  >
                    {totalPages}
                  </button>
                )}
                <button
                  className="p-2 rounded-lg hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages || totalPages === 0}
                  aria-label="Next page"
                >
                  <ChevronRight className="w-4 h-4 text-gray-500" />
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Info Note */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <p className="text-sm text-blue-800">
          <strong>Tip:</strong> Select products from your catalog that this sales agent specializes in selling. 
          This helps track performance and improve sales analysis.
        </p>
      </div>
    </div>
  );
}

