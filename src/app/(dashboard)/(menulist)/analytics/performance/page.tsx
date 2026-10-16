'use client';

import { SkeletonAnalyticsPage } from '@/components/skeleton/SkeletonAnalyticsPage';
import React, { useEffect, useRef, useState } from 'react';
import OperationalPerformanceAnalytics from '@/components/analyticsperformance/OperationalPerformanceAnalytics';
import { AnalyticsTimeRange } from '@/utils/analyticsTimeRange';
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
  const [childReady, setChildReady] = useState(false);

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
    return <SkeletonAnalyticsPage />;
  }

  if (!hasData) {
    return (
      <div className="flex min-h-full w-full min-w-0 flex-col bg-gradient-to-b from-gray-50 to-white p-4">
        <div className="mb-4">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">{tOperational('title')}</h1>
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
    <>
      {!childReady && <SkeletonAnalyticsPage />}
      <div className={!childReady ? 'h-0 overflow-hidden' : 'flex min-h-full w-full min-w-0 flex-col bg-gradient-to-b from-gray-50 to-white p-4'}>
        {/* Page Header */}
        <div className="mb-4 flex min-w-0 flex-col gap-4 @5xl/main:flex-row @5xl/main:items-center @5xl/main:justify-between">
          <div className="min-w-0">
            <h1 className="mb-2 truncate text-2xl font-bold text-gray-900">{tOperational('title')}</h1>
          </div>

          <div className="flex w-full min-w-0 flex-col gap-2 @4xl/main:flex-row @4xl/main:flex-wrap @4xl/main:items-center @5xl/main:w-auto">
            <div className="relative w-full @4xl/main:w-auto" ref={dropdownRef}>
              <button
                onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                className="flex w-full items-center justify-between gap-2 rounded-lg border border-[#e6e6e6] bg-white px-4 py-2 text-sm font-medium text-black transition-colors hover:bg-gray-50 @4xl/main:w-auto @4xl/main:justify-start"
              >
                <span className="inline-flex items-center gap-2">
                  <Calendar className="h-4 w-4" />
                  {currentRange?.label}
                </span>
                <ChevronDown className="h-4 w-4" />
              </button>

              {isDropdownOpen && (
                <div className="absolute left-0 right-0 top-full z-10 mt-1 rounded-lg border border-[#e6e6e6] bg-white shadow-lg @4xl/main:right-auto @4xl/main:w-full">
                  {timeRanges.map((range) => (
                    <button
                      key={range.value}
                      onClick={() => {
                        setTimeRange(range.value);
                        setIsDropdownOpen(false);
                      }}
                      className={`w-full px-4 py-2 text-left text-sm transition-colors hover:bg-gray-50 first:rounded-t-lg last:rounded-b-lg ${
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

        <OperationalPerformanceAnalytics timeRange={timeRange as AnalyticsTimeRange} onReadyAction={() => setChildReady(true)} />
      </div>
    </>
  );
}

