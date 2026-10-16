'use client';

import React, { useState, useMemo, useRef, useEffect } from 'react';
import { TrendingUp, Eye, ShoppingCart, Heart, X, ChevronDown, DollarSign, ChevronLeft, ChevronRight, Star } from 'lucide-react';
import { formatCurrency } from '@/utils/currencyUtils';
import { useMarketplaceTranslations } from '@/hooks/useMarketplaceTranslations';

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
  favorites: number;
  addedToCart: number;
  cartAbandoned: number;
  sales: number;
  reviews?: number;
  revenue: number;
}

interface OverallMetrics {
  totalSales: number;
  totalOrders: number;
  totalViews: number;
  totalFavorites?: number;
  totalAddedToCart?: number;
  cartAbandonedCount?: number;
  totalReviews?: number;
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
  const { tShared, tPerformance, translateSortOption } = useMarketplaceTranslations();
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [modalTab, setModalTab] = useState<'analytics' | 'reviews'>('analytics');
  type ProductReview = {
    id: number;
    rating: number;
    title?: string;
    comment?: string;
    imageUrls: string[];
    createdAt: string;
    reviewerDisplayName: string;
    purchasedVariantName?: string;
    purchasedPackage?: string;
  };

  const [productReviews, setProductReviews] = useState<ProductReview[] | null>(null);

  const isProductReview = (v: unknown): v is ProductReview => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) return false;
    const r = v as Record<string, unknown>;
    return (
      typeof r.id === 'number' &&
      typeof r.rating === 'number' &&
      typeof r.createdAt === 'string' &&
      typeof r.reviewerDisplayName === 'string' &&
      Array.isArray(r.imageUrls) &&
      r.imageUrls.every((x) => typeof x === 'string')
    );
  };
  const [reviewsLoading, setReviewsLoading] = useState(false);
  const [sortBy, setSortBy] = useState<'views' | 'sales' | 'revenue'>('views');
  const [isSortDropdownOpen, setIsSortDropdownOpen] = useState(false);
  const sortDropdownRef = useRef<HTMLDivElement>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 5;

  const sortOptions = [
    { value: 'views' as const, label: translateSortOption('views') },
    { value: 'sales' as const, label: translateSortOption('sales') },
    { value: 'revenue' as const, label: translateSortOption('revenue') }
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
    let totalAddedToCart: number;
    let totalSalesAmount: number;
    let totalOrdersCount: number;
    let totalFavorites: number;
    let totalAbandoned: number;

    if (useApi) {
      // Use API data for all available metrics (overall totals from API when present)
      totalViews = apiOverallMetrics.totalViews;
      totalSalesAmount = apiOverallMetrics.totalSales;
      totalOrdersCount = apiOverallMetrics.totalOrders;
      totalAddedToCart = apiOverallMetrics.totalAddedToCart ?? publishedProducts.reduce((sum, p) => sum + p.addedToCart, 0);
      totalFavorites = apiOverallMetrics.totalFavorites ?? publishedProducts.reduce((sum, p) => sum + p.favorites, 0);
      totalAbandoned = apiOverallMetrics.cartAbandonedCount ?? publishedProducts.reduce((sum, p) => sum + p.cartAbandoned, 0);
    } else {
      // Compute all metrics from products
      totalViews = publishedProducts.reduce((sum, p) => sum + p.views, 0);
      totalAddedToCart = publishedProducts.reduce((sum, p) => sum + p.addedToCart, 0);
      totalSalesAmount = publishedProducts.reduce((sum, p) => sum + p.revenue, 0);
      totalOrdersCount = publishedProducts.reduce((sum, p) => sum + p.sales, 0);
      totalFavorites = publishedProducts.reduce((sum, p) => sum + p.favorites, 0);
      totalAbandoned = publishedProducts.reduce((sum, p) => sum + p.cartAbandoned, 0);
    }

    // Calculate rates from the chosen totals (consistent source)
    const conversionRate = totalViews > 0 ? (totalOrdersCount / totalViews) * 100 : 0;
    const cartConversionRate = totalAddedToCart > 0 ? (totalOrdersCount / totalAddedToCart) * 100 : 0;
    const abandonmentRate = totalAddedToCart > 0 ? (totalAbandoned / totalAddedToCart) * 100 : 0;

    return {
      totalViews,
      totalAddedToCart,
      totalSalesAmount,
      totalOrdersCount,
      totalFavorites,
      totalAbandoned,
      conversionRate,
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

  // Load reviews when the modal switches to Reviews tab
  useEffect(() => {
    if (!selectedProduct || modalTab !== 'reviews') return;
    let cancelled = false;
    setReviewsLoading(true);
    setProductReviews(null);
    fetch(`/api/mobile/reviews/product?productId=${encodeURIComponent(selectedProduct.productId)}&page=1&limit=50`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('Failed to load reviews'))))
      .then((json: { reviews?: unknown[] }) => {
        if (cancelled) return;
        const reviews = Array.isArray(json.reviews) ? json.reviews.filter(isProductReview) : [];
        setProductReviews(reviews);
      })
      .catch(() => {
        if (!cancelled) setProductReviews([]);
      })
      .finally(() => {
        if (!cancelled) setReviewsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedProduct, modalTab]);

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
    <div className="space-y-3">
      {/* Overall Metrics Cards */}
      <div className="grid grid-cols-1 gap-3 @3xl/main:grid-cols-2 @5xl/main:grid-cols-3">
        <div className="bg-white rounded-lg border border-[#e6e6e6] p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-600">{tPerformance('totalSales')}</span>
            <DollarSign className="w-4 h-4 text-green-500" />
          </div>
          <p className="text-2xl font-bold text-gray-900">
            {formatCurrency(overallMetrics.totalSalesAmount, userCurrency)}
          </p>
          <p className="text-xs text-gray-500 mt-1">
            {tShared('ordersCount', { count: overallMetrics.totalOrdersCount })}
          </p>
        </div>

        <div className="bg-white rounded-lg border border-[#e6e6e6] p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-600">{tPerformance('totalViews')}</span>
            <Eye className="w-4 h-4 text-blue-500" />
          </div>
          <p className="text-2xl font-bold text-gray-900">
            {overallMetrics.totalViews.toLocaleString()}
          </p>
          <p className="text-xs text-gray-500 mt-1">
            {tPerformance('productPageViews')}
          </p>
        </div>

        <div className="bg-white rounded-lg border border-[#e6e6e6] p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-600">{tPerformance('conversionRate')}</span>
            <TrendingUp className="w-4 h-4 text-purple-500" />
          </div>
          <p className="text-2xl font-bold text-gray-900">
            {overallMetrics.conversionRate.toFixed(1)}%
          </p>
          <p className="text-xs text-gray-500 mt-1">
            {tShared('conversionFromViews', {
              orders: overallMetrics.totalOrdersCount,
              views: overallMetrics.totalViews.toLocaleString(),
            })}
          </p>
        </div>
      </div>

      {/* Funnel Visualization - bar width capped at 100% to prevent overflow */}
      <div className="bg-white rounded-lg border border-[#e6e6e6] p-4 min-w-0 overflow-hidden">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">{tPerformance('customerJourney')}</h3>
        <div className="space-y-3">
          <div className="flex items-center gap-4 min-w-0">
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-medium text-gray-900">{tPerformance('journeyViews')}</span>
                <span className="text-sm font-semibold text-gray-900">{overallMetrics.totalViews.toLocaleString()}</span>
              </div>
              <div className="w-full min-w-0 bg-gray-200 rounded-full h-3 overflow-hidden">
                <div className="bg-blue-500 h-3 rounded-full max-w-full" style={{ width: '100%' }} />
              </div>
            </div>
          </div>

          <div className="flex items-center gap-4 min-w-0">
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-medium text-gray-900">{tPerformance('journeyAddedToCart')}</span>
                <span className="text-sm font-semibold text-gray-900">{overallMetrics.totalAddedToCart.toLocaleString()}</span>
              </div>
              <div className="w-full min-w-0 bg-gray-200 rounded-full h-3 overflow-hidden">
                <div 
                  className="bg-purple-500 h-3 rounded-full max-w-full"
                  style={{ width: `${Math.min(100, overallMetrics.totalViews > 0 ? (overallMetrics.totalAddedToCart / overallMetrics.totalViews) * 100 : 0)}%` }}
                />
              </div>
            </div>
          </div>

          <div className="flex items-center gap-4 min-w-0">
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-medium text-gray-900">{tPerformance('journeyPurchases')}</span>
                <span className="text-sm font-semibold text-gray-900">{overallMetrics.totalOrdersCount.toLocaleString()}</span>
              </div>
              <div className="w-full min-w-0 bg-gray-200 rounded-full h-3 overflow-hidden">
                <div 
                  className="bg-green-500 h-3 rounded-full max-w-full"
                  style={{ width: `${Math.min(100, overallMetrics.totalViews > 0 ? (overallMetrics.totalOrdersCount / overallMetrics.totalViews) * 100 : 0)}%` }}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Product Performance Table */}
      <div className="bg-white rounded-lg border border-[#e6e6e6]">
        <div className="p-4 border-b border-[#e6e6e6]">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold text-gray-900">{tPerformance('productPerformance')}</h3>
              <p className="text-sm text-gray-600">{tPerformance('productPerformanceHint')}</p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-600">{tShared('sortBy')}</span>
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
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{tPerformance('tableProduct')}</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">{tPerformance('tableViews')}</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">{tPerformance('tableCart')}</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">{tPerformance('tableFavorites')}</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">{tPerformance('tableSold')}</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">{tPerformance('tableReviews')}</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">{tPerformance('tableSales')}</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">{tPerformance('tableConv')}</th>
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
                        <span className="text-xs font-medium text-gray-900 line-clamp-1">{product.name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right text-xs text-gray-900">{product.views.toLocaleString()}</td>
                    <td className="px-4 py-3 text-right text-xs text-gray-900">{product.addedToCart.toLocaleString()}</td>
                    <td className="px-4 py-3 text-right text-xs text-gray-900">{product.favorites.toLocaleString()}</td>
                    <td className="px-4 py-3 text-right text-xs font-semibold text-gray-900">{product.sales.toLocaleString()}</td>
                    <td className="px-4 py-3 text-right text-xs text-gray-900">{(product.reviews ?? 0).toLocaleString()}</td>
                    <td className="px-4 py-3 text-right text-xs font-semibold text-[#0a61d7]">
                      {formatCurrency(product.revenue, userCurrency)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className={`text-xs font-semibold ${convRate >= 3 ? 'text-green-600' : convRate >= 1 ? 'text-yellow-600' : 'text-red-600'}`}>
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
        <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200">
          <div className="text-sm text-gray-500">
            {tShared('pagination.showing', {
              from: startIndex + 1,
              to: Math.min(endIndex, sortedProducts.length),
              total: sortedProducts.length,
            })}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handlePrevPage}
              disabled={currentPage === 1}
              aria-label={tShared('pagination.previousPage')}
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
              aria-label={tShared('pagination.nextPage')}
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
          onClick={() => {
            setSelectedProduct(null);
            setModalTab('analytics');
          }}
        >
          <div 
            className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto overflow-x-hidden min-w-0"
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
                  <p className="text-sm text-gray-600">{tPerformance('modalSubtitle')}</p>
                </div>
              </div>
              <button
                onClick={() => {
                  setSelectedProduct(null);
                  setModalTab('analytics');
                }}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-gray-600" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-4 space-y-4 min-w-0">
              {modalTab === 'reviews' ? (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <button
                      type="button"
                      onClick={() => setModalTab('analytics')}
                      className="text-sm font-semibold text-[#0a61d7] hover:underline"
                    >
                      {tPerformance('back')}
                    </button>
                    <div className="text-sm text-gray-600">
                      {tShared('reviewsCount', { count: selectedProduct.reviews ?? 0 })}
                    </div>
                  </div>

                  <div className="bg-white rounded-lg border border-gray-200">
                    {reviewsLoading ? (
                      <div className="p-4 text-sm text-gray-600">{tPerformance('loadingReviews')}</div>
                    ) : (productReviews?.length ?? 0) === 0 ? (
                      <div className="p-4 text-sm text-gray-600">{tPerformance('noReviews')}</div>
                    ) : (
                      <div className="max-h-[60vh] overflow-y-auto divide-y divide-gray-200">
                        {productReviews!.map((r) => (
                          <div key={r.id} className="p-4">
                            <div className="flex items-center justify-between gap-3">
                              <div className="min-w-0">
                                <p className="text-sm font-semibold text-gray-900 truncate">
                                  {r.reviewerDisplayName || tShared('customerFallback')}
                                </p>
                                <div className="flex items-center gap-1 text-yellow-500">
                                  {Array.from({ length: 5 }, (_, i) => (
                                    <Star key={i} className="w-4 h-4" fill={i < (r.rating ?? 0) ? 'currentColor' : 'none'} />
                                  ))}
                                </div>
                                {(r.purchasedVariantName || r.purchasedPackage) && (
                                  <div className="mt-1 text-xs text-gray-600 space-y-0.5">
                                    {r.purchasedVariantName ? (
                                      <p className="line-clamp-2">{r.purchasedVariantName}</p>
                                    ) : null}
                                    {r.purchasedPackage ? (
                                      <p className="line-clamp-1">{r.purchasedPackage}</p>
                                    ) : null}
                                  </div>
                                )}
                              </div>
                              <p className="text-xs text-gray-500 whitespace-nowrap">
                                {r.createdAt ? new Date(r.createdAt).toLocaleDateString() : ''}
                              </p>
                            </div>

                            {r.title ? <p className="mt-2 text-sm font-semibold text-gray-900">{r.title}</p> : null}
                            {r.comment ? <p className="mt-1 text-sm text-gray-700 whitespace-pre-line">{r.comment}</p> : null}

                            {Array.isArray(r.imageUrls) && r.imageUrls.length > 0 ? (
                              <div className="mt-3 flex flex-wrap gap-2">
                                {r.imageUrls.slice(0, 5).map((url: string, idx: number) => (
                                  <a
                                    key={`${r.id}-${idx}`}
                                    href={url}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="block w-16 h-16 rounded-md overflow-hidden border border-gray-200"
                                  >
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img src={url} alt="" className="w-full h-full object-cover" />
                                  </a>
                                ))}
                              </div>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <>
                {/* Key Metrics Grid */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-blue-50 rounded-lg p-4">
                  <Eye className="w-5 h-5 text-blue-600 mb-2" />
                  <p className="text-2xl font-bold text-gray-900">{selectedProduct.views.toLocaleString()}</p>
                  <p className="text-sm text-gray-600">{tPerformance('totalViews')}</p>
                </div>
                <div className="bg-pink-50 rounded-lg p-4">
                  <Heart className="w-5 h-5 text-pink-600 mb-2" />
                  <p className="text-2xl font-bold text-gray-900">{selectedProduct.favorites.toLocaleString()}</p>
                  <p className="text-sm text-gray-600">{tPerformance('favorites')}</p>
                </div>
                <div className="bg-green-50 rounded-lg p-4">
                  <ShoppingCart className="w-5 h-5 text-green-600 mb-2" />
                  <p className="text-2xl font-bold text-gray-900">{selectedProduct.sales.toLocaleString()}</p>
                  <p className="text-sm text-gray-600">{tPerformance('sales')}</p>
                </div>
                <div className="bg-yellow-50 rounded-lg p-4 flex flex-col justify-between">
                  <div>
                    <Star className="w-5 h-5 text-yellow-600 mb-2" />
                    <p className="text-2xl font-bold text-gray-900">{(selectedProduct.reviews ?? 0).toLocaleString()}</p>
                    <p className="text-sm text-gray-600">{tPerformance('reviews')}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setModalTab('reviews')}
                    className="mt-3 inline-flex items-center justify-center rounded-md bg-white px-3 py-2 text-xs font-semibold text-gray-900 border border-gray-200 hover:bg-gray-50"
                  >
                    {tPerformance('viewReviews')}
                  </button>
                </div>
              </div>

              {/* Conversion Funnel - bar width capped at 100% so bars never overflow */}
              <div className="min-w-0 overflow-hidden">
                <h4 className="text-sm font-semibold text-gray-900 mb-3">{tPerformance('conversionCounts')}</h4>
                <div className="space-y-2">
                  <div className="min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm text-gray-600">{tPerformance('journeyViews')}</span>
                      <span className="text-sm font-semibold text-gray-900">{selectedProduct.views.toLocaleString()}</span>
                    </div>
                    <div className="w-full min-w-0 bg-gray-200 rounded-full h-2 overflow-hidden">
                      <div className="bg-blue-500 h-2 rounded-full max-w-full" style={{ width: '100%' }} />
                    </div>
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm text-gray-600">{tPerformance('journeyAddedToCart')}</span>
                      <span className="text-sm font-semibold text-gray-900">{selectedProduct.addedToCart.toLocaleString()}</span>
                    </div>
                    <div className="w-full min-w-0 bg-gray-200 rounded-full h-2 overflow-hidden">
                      <div 
                        className="bg-indigo-500 h-2 rounded-full max-w-full"
                        style={{ width: `${Math.min(100, selectedProduct.views > 0 ? (selectedProduct.addedToCart / selectedProduct.views) * 100 : 0)}%` }}
                      />
                    </div>
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm text-gray-600">{tPerformance('journeyPurchases')}</span>
                      <span className="text-sm font-semibold text-gray-900">{selectedProduct.sales.toLocaleString()}</span>
                    </div>
                    <div className="w-full min-w-0 bg-gray-200 rounded-full h-2 overflow-hidden">
                      <div 
                        className="bg-green-500 h-2 rounded-full max-w-full"
                        style={{ width: `${Math.min(100, selectedProduct.views > 0 ? (selectedProduct.sales / selectedProduct.views) * 100 : 0)}%` }}
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Additional Insights - show counts as primary; % only when it's a meaningful rate */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-gray-50 rounded-lg p-4">
                  <h5 className="text-sm font-semibold text-gray-900 mb-2">{tPerformance('favoritesInsight')}</h5>
                  <p className="text-2xl font-bold text-gray-900">
                    {selectedProduct.favorites.toLocaleString()}{' '}
                    <span className="text-base font-normal text-gray-600">
                      {tShared('ofViews', { count: selectedProduct.views.toLocaleString() })}
                    </span>
                  </p>
                  <p className="text-xs text-gray-600 mt-1">
                    {selectedProduct.views > 0 && selectedProduct.views <= 1
                      ? (selectedProduct.favorites === 0 ? tPerformance('noFavoritesYet') : tPerformance('singleViewRateHint'))
                      : selectedProduct.views > 0
                        ? tPerformance('favoritedPercent', {
                            percent: ((selectedProduct.favorites / selectedProduct.views) * 100).toFixed(1),
                          })
                        : tPerformance('favoritesPerView')}
                  </p>
                </div>
                <div className="bg-gray-50 rounded-lg p-4">
                  <h5 className="text-sm font-semibold text-gray-900 mb-2">{tPerformance('cartAbandonment')}</h5>
                  <p className="text-2xl font-bold text-gray-900">
                    {selectedProduct.cartAbandoned.toLocaleString()}{' '}
                    <span className="text-base font-normal text-gray-600">
                      {tShared('abandoned')}
                    </span>
                  </p>
                  <p className="text-xs text-gray-600 mt-1">
                    {selectedProduct.cartAbandoned === 0
                      ? tPerformance('cartAbandonmentZeroHint')
                      : selectedProduct.addedToCart > 0
                        ? tPerformance('cartAbandonmentRateHint', {
                            percent: ((selectedProduct.cartAbandoned / (selectedProduct.addedToCart + selectedProduct.cartAbandoned)) * 100).toFixed(0),
                          })
                        : tPerformance('cartAbandonmentFallbackHint')}
                  </p>
                </div>
              </div>
              </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
