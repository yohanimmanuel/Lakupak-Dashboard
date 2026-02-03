'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useUserStore } from '@/store/userStore';
import ProductsList from '@/components/marketplacecomp/ProductsList';
import MarketplacePerformance from '@/components/marketplacecomp/MarketplacePerformance';
import StorefrontInfo from '@/components/marketplacecomp/StorefrontInfo';
import { Calendar, RefreshCw, ChevronDown } from 'lucide-react';

interface ProductVariantOption {
  sellingPrice: string;
}

interface MarketplaceProduct {
  id: number;
  productId: string;
  name: string;
  images: string[];
  status: string;
  marketplaceStatus: string;
  publishedAt?: string;
  returnPolicyDays?: number;
  variantOptions?: ProductVariantOption[];
  // Real marketplace metrics from UserActivity
  views: number;
  clicks: number;
  favorites: number;
  addedToCart: number;
  cartAbandoned: number;
  sales: number;
  revenue: number;
}

interface Company {
  name?: string;
  logo?: string;
  bannerImage?: string;
  businessAddress?: string;
  businessPhone?: string;
  businessEmail?: string;
  baseShippingPrice?: number;
  baseShippingRadius?: number;
  freeShippingThreshold?: number;
  sameDayShippingPrice?: number;
  nextDayShippingPrice?: number;
  expressShippingPrice?: number;
  maxShippingRadius?: number;
  additionalPricePerKm?: number;
  pickupAddress?: string;
  minimumOrderValue?: number;
}

// Removed GraphQL query and helper function - now using consolidated REST API

interface MarketplaceMetrics {
  totalSales: number;
  totalOrders: number;
  totalViews: number;
}

interface PaginationMetadata {
  totalCount: number;
  totalPages: number;
  currentPage: number;
  pageSize: number;
  hasMore: boolean;
  isTruncated: boolean;
}

export default function MarketplacePage() {
  const { user } = useUserStore();
  const userCurrency = user?.currency || 'IDR';
  const [loading, setLoading] = useState(true);
  const [products, setProducts] = useState<MarketplaceProduct[]>([]);
  const [company, setCompany] = useState<Company | undefined>();
  const [overallMetrics, setOverallMetrics] = useState<MarketplaceMetrics | undefined>();
  const [paginationInfo, setPaginationInfo] = useState<PaginationMetadata | undefined>();
  const [timeRange, setTimeRange] = useState('30d');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const timeRanges = [
    { value: '7d', label: 'Last 7 days' },
    { value: '30d', label: 'Last 30 days' },
    { value: '90d', label: 'Last 90 days' },
    { value: '1y', label: 'Last year' }
  ];

  const currentRange = timeRanges.find(range => range.value === timeRange);

  const fetchMarketplaceData = useCallback(async () => {
    if (!user?.id) return;

    try {
      setLoading(true);
      
      // Single consolidated API call for all marketplace data
      // Fetches all products by default (limit=1000) for now
      // Can be updated to support client-side pagination in the future
      const response = await fetch(`/api/marketplace/data?userId=${user.id}`);
      
      if (!response.ok) {
        throw new Error('Failed to fetch marketplace data');
      }
      
      const data = await response.json();
      
      // Set all state from single response
      setProducts(data.products || []);
      setCompany(data.company);
      setOverallMetrics(data.overallMetrics);
      setPaginationInfo(data.pagination);
      
      // Log warning if results are truncated
      if (data.pagination?.isTruncated) {
        console.warn(
          `Marketplace data truncated: Showing ${data.products?.length || 0} of ${data.pagination.totalCount} products. ` +
          `Consider implementing pagination for better performance.`
        );
      }
      
    } catch (error) {
      console.error('Error fetching marketplace data:', error);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    fetchMarketplaceData();
  }, [fetchMarketplaceData]);

  // Handle dropdown click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  if (loading) {
    return (
      <div className="w-full mx-auto p-4 bg-gray-50 min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-[#0a61d7] border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600">Loading marketplace data...</p>
        </div>
      </div>
    );
  }

  const publishedCount = products.filter(p => p.marketplaceStatus === 'Published').length;

  return (
    <div className="w-full mx-auto p-4 bg-gradient-to-b from-gray-50 to-white min-h-screen">
      {/* Header */}
      <div className="mb-4">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">Marketplace Dashboard</h1>
            <p className="text-sm text-gray-600">
              Monitor your marketplace performance and customer behavior
            </p>
          </div>
          <div className="flex items-center gap-3">
            {/* Time Range Selector */}
            <div className="relative" ref={dropdownRef}>
              <button
                onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                className="flex items-center gap-2 px-4 py-2 bg-white border border-[#e6e6e6] text-black rounded-lg hover:bg-gray-50 transition-colors text-sm font-medium"
              >
                <Calendar className="w-4 h-4" />
                {currentRange?.label}
                <ChevronDown className="w-4 h-4" />
              </button>
              
              {isDropdownOpen && (
                <div className="absolute top-full left-0 mt-1 w-full bg-white border border-[#e6e6e6] rounded-lg shadow-lg z-10">
                  {timeRanges.map((range) => (
                    <button
                      key={range.value}
                      onClick={() => {
                        setTimeRange(range.value);
                        setIsDropdownOpen(false);
                      }}
                      className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-50 transition-colors first:rounded-t-lg last:rounded-b-lg ${
                        timeRange === range.value ? 'bg-blue-50 text-blue-600' : 'text-gray-700'
                      }`}
                    >
                      {range.label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Refresh Button */}
            <button
              onClick={fetchMarketplaceData}
              className="flex items-center gap-2 px-4 py-2 bg-white border border-[#e6e6e6] text-black rounded-lg hover:bg-gray-50 transition-colors text-sm font-medium"
            >
              <RefreshCw className="w-4 h-4" />
              Refresh
            </button>
          </div>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <p className="text-sm text-gray-600 mb-1">Published Products</p>
          <p className="text-3xl font-bold text-gray-900">{publishedCount}</p>
          <p className="text-xs text-gray-500 mt-1">Live on marketplace</p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <p className="text-sm text-gray-600 mb-1">Total Products</p>
          <p className="text-3xl font-bold text-gray-900">{products.length}</p>
          <p className="text-xs text-gray-500 mt-1">In your catalog</p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <p className="text-sm text-gray-600 mb-1">Unpublished</p>
          <p className="text-3xl font-bold text-gray-900">{products.length - publishedCount}</p>
          <p className="text-xs text-gray-500 mt-1">Ready to publish</p>
        </div>
      </div>

      {/* Main Content */}
      <div className="space-y-4">
        {/* Products List Section */}
        <ProductsList products={products} />

        {/* Performance Section (Main Focus) */}
        <MarketplacePerformance 
          products={products} 
          userCurrency={userCurrency}
          overallMetrics={overallMetrics}
        />

        {/* Storefront Info Section */}
        <StorefrontInfo company={company} userCurrency={userCurrency} products={products} />
      </div>
    </div>
  );
}
