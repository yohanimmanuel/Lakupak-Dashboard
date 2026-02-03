'use client';

import React, { useState, useMemo, useRef, useEffect } from 'react';
import { TrendingUp, Eye, ShoppingCart, Heart, MousePointerClick, X, ArrowUpRight, ArrowDownRight, ChevronDown, DollarSign, ChevronLeft, ChevronRight } from 'lucide-react';
import { formatCurrency } from '@/utils/currencyUtils';

interface Product {
  id: number;
  productId: string;
  name: string;
  images: string[];
  marketplaceStatus: string;
  variantOptions?: {
    sellingPrice: string;
  }[];
  // Real marketplace metrics from UserActivity
  views: number;
  clicks: number;
  favorites: number;
  addedToCart: number;
  cartAbandoned: number;
  sales: number;
  revenue: number;
}

interface OverallMetrics {
  totalSales: number;
  totalOrders: number;
  totalViews: number;
}

interface MarketplacePerformanceProps {
  products: Product[];
  userCurrency?: string;
  overallMetrics?: OverallMetrics;
}

export default function MarketplacePerformance({ 
  products, 
  userCurrency = 'IDR',
  overallMetrics: apiOverallMetrics
}: MarketplacePerformanceProps) {
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [sortBy, setSortBy] = useState<'views' | 'sales' | 'revenue'>('views');
  const [isSortDropdownOpen, setIsSortDropdownOpen] = useState(false);
  const sortDropdownRef = useRef<HTMLDivElement>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 5;

  const sortOptions = [
    { value: 'views' as const, label: 'Views' },
    { value: 'sales' as const, label: 'Sales' },
    { value: 'revenue' as const, label: 'Revenue' }
  ];

  const currentSort = sortOptions.find(option => option.value === sortBy);

  // Handle dropdown click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (sortDropdownRef.current && !sortDropdownRef.current.contains(event.target as Node)) {
        setIsSortDropdownOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Filter only published products
  const publishedProducts = products.filter(
    (p) => p.marketplaceStatus === 'Published'
  );

  // Calculate overall metrics (use single consistent source: API if available, otherwise products)
  const overallMetrics = useMemo(() => {
    // Detect if API data is present and should be used as primary source
    const useApi = !!apiOverallMetrics;

    let totalViews: number;
    let totalClicks: number;
    let totalAddedToCart: number;
    let totalSalesAmount: number;
    let totalOrdersCount: number;
    let totalFavorites: number;
    let totalAbandoned: number;

    if (useApi) {
      // Use API data for all available metrics
      totalViews = apiOverallMetrics.totalViews;
      totalSalesAmount = apiOverallMetrics.totalSales;
      totalOrdersCount = apiOverallMetrics.totalOrders;
      
      // API doesn't provide these metrics yet, compute from products
      // TODO: Add these to API response for full consistency
      totalClicks = publishedProducts.reduce((sum, p) => sum + p.clicks, 0);
      totalAddedToCart = publishedProducts.reduce((sum, p) => sum + p.addedToCart, 0);
      totalFavorites = publishedProducts.reduce((sum, p) => sum + p.favorites, 0);
      totalAbandoned = publishedProducts.reduce((sum, p) => sum + p.cartAbandoned, 0);
    } else {
      // Compute all metrics from products
      totalViews = publishedProducts.reduce((sum, p) => sum + p.views, 0);
      totalClicks = publishedProducts.reduce((sum, p) => sum + p.clicks, 0);
      totalAddedToCart = publishedProducts.reduce((sum, p) => sum + p.addedToCart, 0);
      totalSalesAmount = publishedProducts.reduce((sum, p) => sum + p.revenue, 0);
      totalOrdersCount = publishedProducts.reduce((sum, p) => sum + p.sales, 0);
      totalFavorites = publishedProducts.reduce((sum, p) => sum + p.favorites, 0);
      totalAbandoned = publishedProducts.reduce((sum, p) => sum + p.cartAbandoned, 0);
    }

    // Calculate rates from the chosen totals (consistent source)
    const conversionRate = totalViews > 0 ? (totalOrdersCount / totalViews) * 100 : 0;
    const clickRate = totalViews > 0 ? (totalClicks / totalViews) * 100 : 0;
    const cartConversionRate = totalAddedToCart > 0 ? (totalOrdersCount / totalAddedToCart) * 100 : 0;
    const abandonmentRate = totalAddedToCart > 0 ? (totalAbandoned / totalAddedToCart) * 100 : 0;

    return {
      totalViews,
      totalClicks,
      totalAddedToCart,
      totalSalesAmount,
      totalOrdersCount,
      totalFavorites,
      totalAbandoned,
      conversionRate,
      clickRate,
      cartConversionRate,
      abandonmentRate,
    };
  }, [publishedProducts, apiOverallMetrics]);

  // Sort products
  const sortedProducts = useMemo(() => {
    return [...publishedProducts].sort((a, b) => {
      if (sortBy === 'views') return b.views - a.views;
      if (sortBy === 'sales') return b.sales - a.sales;
      if (sortBy === 'revenue') return b.revenue - a.revenue;
      return 0;
    });
  }, [publishedProducts, sortBy]);

  // Reset to first page when sort changes or products change
  useEffect(() => {
    setCurrentPage(1);
  }, [sortBy, publishedProducts.length]);

  // Pagination
  const totalPages = Math.ceil(sortedProducts.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedProducts = sortedProducts.slice(startIndex, endIndex);
  const handlePrevPage = () => {
    setCurrentPage((prev) => Math.max(prev - 1, 1));
  };

  const handleNextPage = () => {
    setCurrentPage((prev) => Math.min(prev + 1, totalPages));
  };

  return (
    <div className="space-y-6">
      {/* Overall Metrics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-600">Total Sales</span>
            <DollarSign className="w-4 h-4 text-green-500" />
          </div>
          <p className="text-2xl font-bold text-gray-900">
            {formatCurrency(overallMetrics.totalSalesAmount, userCurrency)}
          </p>
          <p className="text-xs text-gray-500 mt-1">
            {overallMetrics.totalOrdersCount} orders
          </p>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-600">Total Views</span>
            <Eye className="w-4 h-4 text-blue-500" />
          </div>
          <p className="text-2xl font-bold text-gray-900">
            {overallMetrics.totalViews.toLocaleString()}
          </p>
          <p className="text-xs text-gray-500 mt-1">
            {overallMetrics.clickRate.toFixed(1)}% click rate
          </p>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-600">Conversion Rate</span>
            <TrendingUp className="w-4 h-4 text-purple-500" />
          </div>
          <p className="text-2xl font-bold text-gray-900">
            {overallMetrics.conversionRate.toFixed(1)}%
          </p>
          <p className="text-xs text-gray-500 mt-1">
            {overallMetrics.totalOrdersCount} orders from {overallMetrics.totalViews.toLocaleString()} views
          </p>
        </div>
      </div>

      {/* Funnel Visualization */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Customer Journey Funnel</h3>
        <div className="space-y-3">
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-medium text-gray-900">Views</span>
                <span className="text-sm font-semibold text-gray-900">{overallMetrics.totalViews.toLocaleString()}</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-3">
                <div className="bg-blue-500 h-3 rounded-full" style={{ width: '100%' }}></div>
              </div>
            </div>
          </div>
          
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-medium text-gray-900">Clicks</span>
                <span className="text-sm font-semibold text-gray-900">{overallMetrics.totalClicks.toLocaleString()}</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-3">
                <div 
                  className="bg-indigo-500 h-3 rounded-full" 
                  style={{ width: `${overallMetrics.totalViews > 0 ? (overallMetrics.totalClicks / overallMetrics.totalViews) * 100 : 0}%` }}
                ></div>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex-1">
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-medium text-gray-900">Added to Cart</span>
                <span className="text-sm font-semibold text-gray-900">{overallMetrics.totalAddedToCart.toLocaleString()}</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-3">
                <div 
                  className="bg-purple-500 h-3 rounded-full" 
                  style={{ width: `${overallMetrics.totalViews > 0 ? (overallMetrics.totalAddedToCart / overallMetrics.totalViews) * 100 : 0}%` }}
                ></div>
              </div>
            </div>          </div>

          <div className="flex items-center gap-4">
            <div className="flex-1">
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-medium text-gray-900">Purchases</span>
                <span className="text-sm font-semibold text-gray-900">{overallMetrics.totalOrdersCount.toLocaleString()}</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-3">
                <div 
                  className="bg-green-500 h-3 rounded-full" 
                  style={{ width: `${overallMetrics.totalViews > 0 ? (overallMetrics.totalOrdersCount / overallMetrics.totalViews) * 100 : 0}%` }}
                ></div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Product Performance Table */}
      <div className="bg-white rounded-lg border border-gray-200">
        <div className="p-4 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Product Performance</h3>
              <p className="text-sm text-gray-600">Click on a product to see detailed analytics</p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-600">Sort by:</span>
              <div className="relative" ref={sortDropdownRef}>
                <button
                  onClick={() => setIsSortDropdownOpen(!isSortDropdownOpen)}
                  className="flex items-center gap-2 px-4 py-2 bg-white border border-[#e6e6e6] text-black rounded-lg hover:bg-gray-50 transition-colors text-sm font-medium"
                >
                  {currentSort?.label}
                  <ChevronDown className="w-4 h-4" />
                </button>
                
                {isSortDropdownOpen && (
                  <div className="absolute top-full right-0 mt-1 w-full bg-white border border-[#e6e6e6] rounded-lg shadow-lg z-10">
                    {sortOptions.map((option) => (
                      <button
                        key={option.value}
                        onClick={() => {
                          setSortBy(option.value);
                          setIsSortDropdownOpen(false);
                        }}
                        className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-50 transition-colors first:rounded-t-lg last:rounded-b-lg ${
                          sortBy === option.value ? 'bg-blue-50 text-blue-600' : 'text-gray-700'
                        }`}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Product</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Views</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Clicks</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Cart</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Favorites</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Sold</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Sales</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Conv %</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {paginatedProducts.map((product) => {
                const convRate = product.views > 0 ? (product.sales / product.views) * 100 : 0;
                
                return (
                  <tr 
                    key={product.id}
                    onClick={() => setSelectedProduct(product)}
                    className="hover:bg-gray-50 cursor-pointer transition-colors"
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-gray-100 rounded flex-shrink-0">
                          {product.images?.[0] && (
                            <img src={product.images[0]} alt={product.name} className="w-full h-full object-cover rounded" />
                          )}
                        </div>
                        <span className="text-sm font-medium text-gray-900 line-clamp-1">{product.name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right text-sm text-gray-900">{product.views.toLocaleString()}</td>
                    <td className="px-4 py-3 text-right text-sm text-gray-900">{product.clicks.toLocaleString()}</td>
                    <td className="px-4 py-3 text-right text-sm text-gray-900">{product.addedToCart.toLocaleString()}</td>
                    <td className="px-4 py-3 text-right text-sm text-gray-900">{product.favorites.toLocaleString()}</td>
                    <td className="px-4 py-3 text-right text-sm font-semibold text-gray-900">{product.sales.toLocaleString()}</td>
                    <td className="px-4 py-3 text-right text-sm font-semibold text-[#0a61d7]">
                      {formatCurrency(product.revenue, userCurrency)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className={`text-sm font-semibold ${convRate >= 3 ? 'text-green-600' : convRate >= 1 ? 'text-yellow-600' : 'text-red-600'}`}>
                        {convRate.toFixed(1)}%
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="flex items-center justify-between mt-4 px-4 py-3 border-t border-gray-200">
          <div className="text-sm text-gray-500">
            Showing {startIndex + 1} to {Math.min(endIndex, sortedProducts.length)} of {sortedProducts.length} results
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handlePrevPage}
              disabled={currentPage === 1}
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
                    onClick={() => setCurrentPage(pageNum)}
                    className={`px-3 py-2 text-sm rounded-lg ${
                      currentPage === pageNum
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
                    onClick={() => setCurrentPage(totalPages)}
                    className={`px-3 py-1 text-sm rounded ${
                      currentPage === totalPages
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
              onClick={handleNextPage}
              disabled={currentPage === totalPages}
              className="px-3 py-1 text-sm text-gray-500 hover:text-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Product Detail Modal */}
      {selectedProduct && (
        <div 
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          onClick={() => setSelectedProduct(null)}
        >
          <div 
            className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="sticky top-0 bg-white border-b border-gray-200 p-4 flex items-center justify-between z-10">
              <div className="flex items-center gap-3">
                {selectedProduct.images?.[0] && (
                  <img src={selectedProduct.images[0]} alt={selectedProduct.name} className="w-12 h-12 object-cover rounded" />
                )}
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">{selectedProduct.name}</h3>
                  <p className="text-sm text-gray-600">Detailed Performance Analytics</p>
                </div>
              </div>
              <button
                onClick={() => setSelectedProduct(null)}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-gray-600" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-6 space-y-6">
              {/* Key Metrics Grid */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-blue-50 rounded-lg p-4">
                  <Eye className="w-5 h-5 text-blue-600 mb-2" />
                  <p className="text-2xl font-bold text-gray-900">{selectedProduct.views.toLocaleString()}</p>
                  <p className="text-sm text-gray-600">Total Views</p>
                </div>
                <div className="bg-purple-50 rounded-lg p-4">
                  <MousePointerClick className="w-5 h-5 text-purple-600 mb-2" />
                  <p className="text-2xl font-bold text-gray-900">{selectedProduct.clicks.toLocaleString()}</p>
                  <p className="text-sm text-gray-600">Clicks</p>
                </div>
                <div className="bg-pink-50 rounded-lg p-4">
                  <Heart className="w-5 h-5 text-pink-600 mb-2" />
                  <p className="text-2xl font-bold text-gray-900">{selectedProduct.favorites.toLocaleString()}</p>
                  <p className="text-sm text-gray-600">Favorites</p>
                </div>
                <div className="bg-green-50 rounded-lg p-4">
                  <ShoppingCart className="w-5 h-5 text-green-600 mb-2" />
                  <p className="text-2xl font-bold text-gray-900">{selectedProduct.sales.toLocaleString()}</p>
                  <p className="text-sm text-gray-600">Sales</p>
                </div>
              </div>

              {/* Conversion Funnel */}
              <div>
                <h4 className="text-sm font-semibold text-gray-900 mb-3">Conversion Funnel</h4>
                <div className="space-y-2">
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm text-gray-600">Views</span>
                      <span className="text-sm font-semibold text-gray-900">{selectedProduct.views.toLocaleString()}</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div className="bg-blue-500 h-2 rounded-full" style={{ width: '100%' }}></div>
                    </div>
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm text-gray-600">Clicks</span>
                      <span className="text-sm font-semibold text-gray-900">{selectedProduct.clicks.toLocaleString()}</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div 
                        className="bg-purple-500 h-2 rounded-full" 
                        style={{ width: `${selectedProduct.views > 0 ? (selectedProduct.clicks / selectedProduct.views) * 100 : 0}%` }}
                      ></div>
                    </div>
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm text-gray-600">Added to Cart</span>
                      <span className="text-sm font-semibold text-gray-900">{selectedProduct.addedToCart.toLocaleString()}</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div 
                        className="bg-indigo-500 h-2 rounded-full" 
                        style={{ width: `${selectedProduct.views > 0 ? (selectedProduct.addedToCart / selectedProduct.views) * 100 : 0}%` }}
                      ></div>
                    </div>
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm text-gray-600">Purchases</span>
                      <span className="text-sm font-semibold text-gray-900">{selectedProduct.sales.toLocaleString()}</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div 
                        className="bg-green-500 h-2 rounded-full" 
                        style={{ width: `${selectedProduct.views > 0 ? (selectedProduct.sales / selectedProduct.views) * 100 : 0}%` }}
                      ></div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Additional Insights */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-gray-50 rounded-lg p-4">
                  <h5 className="text-sm font-semibold text-gray-900 mb-2">Engagement Rate</h5>
                  <p className="text-2xl font-bold text-gray-900">
                    {selectedProduct.views > 0 ? ((selectedProduct.clicks / selectedProduct.views) * 100).toFixed(1) : '0.0'}%
                  </p>
                  <p className="text-xs text-gray-600 mt-1">Clicks per view</p>
                </div>
                <div className="bg-gray-50 rounded-lg p-4">
                  <h5 className="text-sm font-semibold text-gray-900 mb-2">Cart Abandonment</h5>
                  <p className="text-2xl font-bold text-gray-900">
                    {selectedProduct.addedToCart > 0 ? ((selectedProduct.cartAbandoned / selectedProduct.addedToCart) * 100).toFixed(1) : '0.0'}%
                  </p>
                  <p className="text-xs text-gray-600 mt-1">{selectedProduct.cartAbandoned} abandoned carts</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
