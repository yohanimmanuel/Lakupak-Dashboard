'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Package, Plus, Search, X, Trash2, Grid, List, Check, ChevronLeft, ChevronRight, ChevronDown } from 'lucide-react';
import { SalesAgent, FavoriteProduct } from './TeamList';
import { Product } from '@/types/product';
import { useUserStore } from '@/store/userStore';
import { fetchGraphQL } from '@/lib/graphqlClient';
import { formatCurrency, getDefaultCurrency, parsePrice } from '@/utils/currencyUtils';
import { parseNumberByCurrency } from '@/config/currencyConfig';
import { useSalesTranslations } from '@/hooks/useSalesTranslations';

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
  const { tFavouriteProducts, translateFilter } = useSalesTranslations();
  const user = useUserStore(state => state.user);
  const userCurrency = user?.currency || getDefaultCurrency();
  
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedProducts, setSelectedProducts] = useState<FavoriteProduct[]>(() => {
    // Initialize from formData if available
    return formData.favoriteProducts || [];
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
  const prevFormDataFavoriteProductsRef = useRef<FavoriteProduct[] | undefined>(formData.favoriteProducts);

  // Fetch products from GraphQL API
  const fetchProducts = useCallback(async () => {
    if (!user?.id) return;
    
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
  }, [user?.id]);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  // Sync selectedProducts with formData when formData changes (e.g., when navigating back to this tab)
  // Use ref to track previous value and avoid unnecessary updates
  useEffect(() => {
    const currentFavoriteProducts = formData.favoriteProducts;
    const prevFavoriteProducts = prevFormDataFavoriteProductsRef.current;
    
    // Only update if formData.favoriteProducts reference actually changed
    if (currentFavoriteProducts !== prevFavoriteProducts) {
      if (currentFavoriteProducts && currentFavoriteProducts.length > 0) {
        // Use shallow comparison for productIds to avoid JSON.stringify
        const currentIds = currentFavoriteProducts.map(p => p.productId).sort().join(',');
        const prevIds = prevFavoriteProducts?.map(p => p.productId).sort().join(',') || '';
        if (currentIds !== prevIds) {
          setSelectedProducts(currentFavoriteProducts);
          prevFormDataFavoriteProductsRef.current = currentFavoriteProducts;
        }
      } else if (!currentFavoriteProducts && prevFavoriteProducts) {
        // Clear selection if formData.favoriteProducts was removed
        setSelectedProducts([]);
        prevFormDataFavoriteProductsRef.current = undefined;
      } else {
        // Update ref even if no change to avoid re-checking
        prevFormDataFavoriteProductsRef.current = currentFavoriteProducts;
      }
    }
  }, [formData.favoriteProducts]);

  // Update tab completion - products are optional, so always complete
  useEffect(() => {
    onTabCompletion('products', true);
  }, [onTabCompletion]); // onTabCompletion is a prop function - should be in dependencies

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
    
    const prices: number[] = [];
    
    variantOptions.forEach(option => {
      const price = parsePrice(String(option.sellingPrice), userCurrency);
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
        productDbId: product.id, // Store database ID for GraphQL mutations
        name: product.name,
        productType: product.productType,
        brand: product.brand,
        images: product.images,
        sellingPrice: getPriceDisplay(product),
      };
      const updatedProducts = [...selectedProducts, favoriteProduct];
      setSelectedProducts(updatedProducts);
      // Update formData immediately in event handler (not in useEffect)
      onFormChange({ favoriteProducts: updatedProducts });
    }
  };

  const handleRemoveProduct = (productId: string) => {
    const updatedProducts = selectedProducts.filter(p => p.productId !== productId);
    setSelectedProducts(updatedProducts);
    // Update formData immediately in event handler (not in useEffect)
    onFormChange({ favoriteProducts: updatedProducts });
  };

  const isProductSelected = (productId: string) => {
    return selectedProducts.some(p => p.productId === productId);
  };

  const handleSelectAll = () => {
    // Check if all filtered products (across all pages) are selected
    const allFilteredSelected = filteredProducts.every(p => isProductSelected(p.productId));
    let updatedProducts: FavoriteProduct[];
    
    if (allFilteredSelected) {
      // Deselect all filtered products
      const filteredProductIds = filteredProducts.map(p => p.productId);
      updatedProducts = selectedProducts.filter(p => !filteredProductIds.includes(p.productId));
    } else {
      // Select all filtered products that aren't already selected
      const newProducts = filteredProducts
        .filter(p => !isProductSelected(p.productId))
        .map(product => ({
          productId: product.productId,
          productDbId: product.id, // Store database ID for GraphQL mutations
          name: product.name,
          productType: product.productType,
          brand: product.brand,
          images: product.images,
          sellingPrice: getPriceDisplay(product),
        }));
      updatedProducts = [...selectedProducts, ...newProducts];
    }
    
    setSelectedProducts(updatedProducts);
    // Update formData immediately in event handler (not in useEffect)
    onFormChange({ favoriteProducts: updatedProducts });
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-center py-12">
          <div className="text-center">
            <div className="w-8 h-8 border-4 border-[#0a61d7] border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
            <p className="text-gray-600">{tFavouriteProducts('loading')}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-gray-900 mb-1">{tFavouriteProducts('title')}</h3>
      </div>

      {/* Search and Filters */}
      <div className="bg-white border border-[#e6e6e6] rounded-lg p-4">
        <div className="flex flex-col md:flex-row md:items-center gap-4">
          {/* Search */}
          <div className="relative w-full md:w-64 shrink-0">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setPage(1);
              }}
              placeholder={tFavouriteProducts('searchPlaceholder')}
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
              {translateFilter(selectedType)}
              <ChevronDown className="w-4 h-4 ml-1 text-gray-500" />
            </button>
            {showTypeDropdown && (
              <div className="absolute right-0 mt-2 w-48 bg-white border border-[#e6e6e6] rounded-lg shadow z-20">
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
                    {translateFilter(type)}
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
              {translateFilter(selectedCategory)}
              <ChevronDown className="w-4 h-4 ml-1 text-gray-500" />
            </button>
            {showCategoryDropdown && (
              <div className="absolute right-0 mt-2 w-48 bg-white border border-[#e6e6e6] rounded-lg shadow z-20">
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
                    {translateFilter(category)}
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
                {tFavouriteProducts('selectedCount', { count: selectedProducts.length })}
              </span>
              <button
                onClick={() => {
                  setSelectedProducts([]);
                  onFormChange({ favoriteProducts: [] });
                }}
                className="text-xs text-blue-600 hover:text-blue-800 font-medium"
              >
                {tFavouriteProducts('clearAll')}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Select All Button */}
      {filteredProducts.length > 0 && (
        <div className="flex items-center gap-2">
          <button
            onClick={handleSelectAll}
            className={`w-5 h-5 border-2 rounded transition-all duration-200 flex items-center justify-center ${
              filteredProducts.every(p => isProductSelected(p.productId)) && filteredProducts.length > 0
                ? 'bg-green-500 border-green-500'
                : 'bg-white border-gray-300 hover:border-green-400'
            }`}
          >
            {filteredProducts.every(p => isProductSelected(p.productId)) && filteredProducts.length > 0 && (
              <Check className="w-3 h-3 text-white" />
            )}
          </button>
          <span className="text-sm text-gray-700">
            {tFavouriteProducts('selectAll', {
              selected: filteredProducts.filter(p => isProductSelected(p.productId)).length,
              total: filteredProducts.length,
            })}
          </span>
        </div>
      )}

      {/* Products Grid/List */}
      {pagedProducts.length === 0 ? (
        <div className="text-center py-12 border-2 border-dashed border-gray-300 rounded-lg">
          <Package className="w-12 h-12 mx-auto mb-4 text-gray-400" />
          <p className="text-sm text-gray-500">{tFavouriteProducts('emptyTitle')}</p>
          <p className="text-xs text-gray-400 mt-1">{tFavouriteProducts('emptyHint')}</p>
        </div>
      ) : (
        <>
          {viewMode === 'grid' ? (
            <div className="grid grid-cols-1 gap-4 @3xl/main:grid-cols-2 @5xl/main:grid-cols-4">
              {pagedProducts.map((product) => {
                const isSelected = isProductSelected(product.productId);
                const productImage = product.images?.[0] || '/placeholder-product.png';
                
                return (
                  <div
                    key={product.productId}
                    className={`border-2 rounded-lg overflow-hidden transition-all cursor-pointer ${
                      isSelected
                        ? 'border-green-500 bg-green-50'
                        : 'border-[#e6e6e6] hover:border-gray-300 bg-white'
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
                        : 'border-[#e6e6e6] hover:border-gray-300 bg-white'
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
                {tFavouriteProducts('pagination.showing', {
                  from: startIndex + 1,
                  to: Math.min(endIndex, filteredProducts.length),
                  total: filteredProducts.length,
                })}
              </div>
              {/* Right: Pagination Controls */}
              <div className="flex items-center gap-3">
                <button
                  className="p-2 rounded-lg hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1 || totalPages === 0}
                  aria-label={tFavouriteProducts('previousPage')}
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
                  aria-label={tFavouriteProducts('nextPage')}
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
        <p className="text-sm text-blue-800">{tFavouriteProducts('tip')}</p>
      </div>
    </div>
  );
}

