'use client';

import React, { useEffect, useRef, useState } from 'react';
import OperationalPerformanceAnalytics from '@/components/analyticsperformance/OperationalPerformanceAnalytics';
import { Calendar, ChevronDown, BarChart3 } from 'lucide-react';
import { useUserStore } from '@/store/userStore';
import { fetchGraphQL } from '@/lib/graphqlClient';
import { Order } from '@/types/order';
import { Product } from '@/types/product';
import { useAnalyticsTranslations } from '@/hooks/useAnalyticsTranslations';

const TIME_RANGE_VALUES = ['1M', '3M', '6M', '1Y'] as const;

const OPERATIONAL_ANALYTICS_PAGE_QUERY = `
  query OperationalAnalyticsPageData($userId: Int!, $orderLimit: Int!, $productLimit: Int!) {
    orders(userId: $userId, limit: $orderLimit) {
      nodes {
        orderId
        buyerId
        orderDate
        orderStatus
        paymentStatus
        deliveryMethod
        shippingFee
        totalAmount
        acceptedBy
        acceptedAt
        trackingNumber
        orderItems {
          productId
          packageQuantity
          packageType
          piecesPerPackage
          pricePerPackage
        }
      }
    }
    products(userId: $userId, limit: $productLimit) {
      nodes {
        id
        productId
        sku
        name
        description
        productType
        productCategory
        brand
        supplier
        status
        catalogName
        images
        stockQuantity
        lowStockThreshold
        stockStatus
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
        variants: variantDefinitions
      }
    }
  }
`;

export default function OperationalPerformancePage() {
  const { user } = useUserStore();
  const { tOperational, tShared, translateTimeRange } = useAnalyticsTranslations();
  const [timeRange, setTimeRange] = useState('1M');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [hasData, setHasData] = useState(false);

  const timeRanges = TIME_RANGE_VALUES.map((value) => ({ value, label: translateTimeRange(value) }));

  const currentRange = timeRanges.find(range => range.value === timeRange);

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

  // Fetch data to check if we have data
  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        if (!user?.id) {
          setHasData(false);
          setLoading(false);
          return;
        }
        const data = await fetchGraphQL<{
          orders: { nodes: Order[] };
          products: {
            nodes: Array<
              Product & {
                variants?: Product['variants'];
              }
            >;
          };
        }>(OPERATIONAL_ANALYTICS_PAGE_QUERY, {
          userId: user.id,
          orderLimit: 1000,
          productLimit: 1000,
        });

        const ordersList = data.orders?.nodes ?? [];
        setHasData(ordersList.length > 0);
        setLoading(false);
      } catch (error) {
        setHasData(false);
        setLoading(false);
      }
    };

    fetchData();
  }, [user?.id]);

  if (loading) {
    return (
      <div className="w-full mx-auto p-4 bg-gray-50 min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-[#0a61d7] border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600">{tOperational('loading')}</p>
        </div>
      </div>
    );
  }

  if (!hasData) {
    return (
      <div className="w-full mx-auto p-4 bg-gradient-to-b from-gray-50 to-white min-h-screen">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">{tOperational('title')}</h1>
          <p className="text-sm text-gray-600">{tOperational('subtitle')}</p>
        </div>
        <div className="text-center mt-30">
          <div className="w-20 h-20 mx-auto mb-6 bg-gray-100 rounded-full flex items-center justify-center">
            <BarChart3 className="w-10 h-10 text-gray-400" />
          </div>
          <h3 className="text-xl font-semibold text-gray-900 mb-2">{tOperational('emptyTitle')}</h3>
          <p className="text-gray-500 max-w-md mx-auto">
            {tOperational('emptyBody')}
          </p>
        </div>
        <div className="flex flex-col sm:flex-row mt-6 justify-center">
          <button 
            onClick={() => window.location.href = '/orders'}
            className="px-6 py-3 bg-[#0a61d7] text-white rounded-lg hover:bg-[#084ba6] transition-colors"
          >
            {tShared('manageOrders')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full mx-auto p-4 bg-gradient-to-b from-gray-50 to-white min-h-screen">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-2">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">{tOperational('title')}</h1>
          <p className="text-sm text-gray-500 mb-4">{tOperational('subtitle')}</p>
        </div>

        {/* Time Range Dropdown */}
        <div className="flex items-center gap-3">
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
        </div>
      </div>

      <OperationalPerformanceAnalytics />
    </div>
  );
}


