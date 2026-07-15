'use client';
import { SkeletonAnalyticsPage } from '@/components/skeleton/SkeletonAnalyticsPage';
import { DollarSign, ShoppingCart, Calendar, ChevronDown } from 'lucide-react';
import { useUserStore } from '@/store/userStore';
import { useState, useEffect, useMemo, useRef } from 'react';
import { 
  AnalyticsMetricCard, 
  AnalyticsRevenueTrendChart,
  AnalyticsTopProductsTable,
  calculateTopProducts,
  calculateRevenueData,
  calculateTotalRevenue,
  formatCurrency,
  parseCurrencyToNumber
} from '@/components/analyticsperformance/FinancialAnalytics';
import { Order } from '@/types/order';
import { Product } from '@/types/product';
import { CustomerPiecesSoldCard, SalesTrendChart, calculateSalesTrend, calculateSalesMetrics } from '@/components/analyticsperformance/CustomerSalesAnalytics';
import { 
  OperationalMetricCard,
  OrderStatusDistributionChart,
  ProcessingTimeTrendChart,
  computeOperationalMetrics,
  computeOrderStatusData,
  computeProcessingTimeData
} from '@/components/analyticsperformance/OperationalPerformanceAnalytics';
import { fetchGraphQL } from '@/lib/graphqlClient';
import { computeOrderPeriodGrowth } from '@/utils/monthOverMonthGrowth';
import { useAnalyticsTranslations } from '@/hooks/useAnalyticsTranslations';
import { AnalyticsTimeRange, filterOrdersByTimeRange } from '@/utils/analyticsTimeRange';

const TIME_RANGE_VALUES = ['1M', '3M', '6M', '1Y'] as const;

const ANALYTICS_PAGE_QUERY = `
  query AnalyticsPageData($userId: Int!, $orderLimit: Int!, $productLimit: Int!) {
    orders(userId: $userId, limit: $orderLimit) {
      nodes {
        orderId
        buyerId
        orderDate
        paidAt
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
          subtotal
          packageQuantity
          packageType
          piecesPerPackage
          pricePerPackage
          variantId
          variantOptionId
          variantNameSnapshot
          promotionDetailsSnapshot
          moqSnapshot
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

export default function AnalyticsPage() {
  const { user } = useUserStore();
  const { tOverview, tMetrics, tShared, translateTimeRange, dateLocale } = useAnalyticsTranslations();
  const [orders, setOrders] = useState<Order[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasData, setHasData] = useState(false);
  const [timeRange, setTimeRange] = useState<AnalyticsTimeRange>('1M');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const userCurrency = user?.currency || 'IDR';

  const timeRanges = useMemo(
    () => TIME_RANGE_VALUES.map((value) => ({ value, label: translateTimeRange(value) })),
    [translateTimeRange],
  );

  const currentRange = timeRanges.find(range => range.value === timeRange);

  const filteredOrders = useMemo(() => {
    if (!hasData || orders.length === 0) return [];
    return filterOrdersByTimeRange(orders, timeRange);
  }, [orders, timeRange, hasData]);

  const filteredProducts = useMemo(() => {
    if (!hasData) return [];
    // For products, we might want to filter based on creation date or keep all
    // For now, keeping all products as they're referenced by orders
    return products;
  }, [products, hasData]);

  const orderVolume = calculateTotalRevenue(filteredOrders, filteredProducts);
  const averageOrderVolume =
    filteredOrders.length > 0 ? orderVolume / filteredOrders.length : 0;

  const revenueData = useMemo(() => {
    return calculateRevenueData(filteredOrders, filteredProducts, hasData, timeRange, dateLocale);
  }, [filteredOrders, filteredProducts, hasData, timeRange, dateLocale]);

  // Operational metrics reused from OperationalPerformanceAnalytics
  const opMetrics = useMemo(() => computeOperationalMetrics(filteredOrders, filteredProducts), [filteredOrders, filteredProducts]);
  const opStatusData = useMemo(() => computeOrderStatusData(filteredOrders), [filteredOrders]);
  const opProcessingData = useMemo(
    () => computeProcessingTimeData(filteredOrders, timeRange, dateLocale),
    [filteredOrders, timeRange, dateLocale],
  );

  // Top products (reused from FinancialAnalytics exports)
  const topProducts = useMemo(() => calculateTopProducts(filteredOrders, filteredProducts, hasData, 10), [filteredOrders, filteredProducts, hasData]);

  // Customer Sales metrics reused
  const customerMetrics = useMemo(() => calculateSalesMetrics(filteredOrders, filteredProducts, hasData), [filteredOrders, filteredProducts, hasData]);
  const salesTrend = useMemo(
    () => calculateSalesTrend(filteredOrders, hasData, dateLocale, timeRange),
    [filteredOrders, hasData, dateLocale, timeRange],
  );

  const orderGrowth = useMemo(
    () => computeOrderPeriodGrowth(filteredOrders, timeRange, dateLocale),
    [filteredOrders, timeRange, dateLocale],
  );

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

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        if (!user?.id) {
          setOrders([]);
          setProducts([]);
          setHasData(false);
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
        }>(ANALYTICS_PAGE_QUERY, {
          userId: user.id,
          orderLimit: 1000,
          productLimit: 1000,
        });

        const ordersList = data.orders?.nodes ?? [];
        const productsList = (data.products?.nodes ?? []).map((product) => ({
          ...product,
          variants: (product.variants ?? []) as Product['variants'],
        }));

          setOrders(ordersList);
            setProducts(productsList);
            setHasData(ordersList.length > 0);
      } catch (error) {
        setHasData(false);
      } finally {
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
      <div className="w-full mx-auto p-4 bg-gradient-to-b from-gray-50 to-white min-h-screen">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">{tOverview('title')}</h1>
        </div>
        <div className="text-center mt-30">
          <div className="w-20 h-20 mx-auto mb-6 bg-gray-100 rounded-full flex items-center justify-center">
            <DollarSign className="w-10 h-10 text-gray-400" />
          </div>
          <h3 className="text-xl font-semibold text-gray-900 mb-2">{tOverview('emptyTitle')}</h3>
          <p className="text-gray-500 max-w-md mx-auto">
            {tOverview('emptyBody')}
          </p>
        </div>
        <div className="flex flex-col sm:flex-row mt-6 justify-center">
          <button 
            onClick={() => window.location.href = '/products'}
            className="px-6 py-3 bg-[#0a61d7] text-white rounded-lg hover:bg-[#084ba6] transition-colors"
          >
            {tShared('addProducts')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full mx-auto p-4 bg-gradient-to-b from-gray-50 to-white min-h-screen">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">{tOverview('title')}</h1>
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

      {/* Row 1: Metric Cards (4 columns) */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 mb-3">
          <>
            <AnalyticsMetricCard
              title={tMetrics('orderVolume')}
              value={formatCurrency(orderVolume, userCurrency)}
              change={orderGrowth.orderVolumeGrowth}
              icon={<DollarSign className="w-6 h-6 text-[#0a61d7]" />}
              color="bg-[#f7faff]"
            />
            <CustomerPiecesSoldCard 
              piecesSold={customerMetrics.totalPiecesSold || 0} 
              unitsSold={customerMetrics.totalUnitsSold} 
              change={orderGrowth.piecesGrowth}
            />
            {/* Operational metric card reused */}
            <OperationalMetricCard
              title={tMetrics('orderCompletionRate')}
              value={`${opMetrics.completionRate.toFixed(1)}%`}
              change={orderGrowth.completionGrowth}
              icon={<ShoppingCart className="w-6 h-6 text-green-600" />}
              color="bg-[#e6f7ec]"
            />
            <AnalyticsMetricCard
              title={tMetrics('averageOrderValue')}
              value={formatCurrency(averageOrderVolume, userCurrency)}
              change={orderGrowth.averageOrderVolumeGrowth}
              icon={<DollarSign className="w-6 h-6 text-emerald-600" />}
              color="bg-[#e6f7ec]"
            />
          </>
      </div>

      {/* Rows 2+: Charts/Tables in two-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <div>
          <AnalyticsRevenueTrendChart 
            revenueData={revenueData}
            userCurrency={userCurrency}
            hasData={hasData}
          />
        </div>
        <div>
          <SalesTrendChart data={salesTrend} showSeeMore timeRange={timeRange} dateLocale={dateLocale} />
        </div>
        {/* Reused Operational charts */}
        <div>
          <OrderStatusDistributionChart data={opStatusData} />
        </div>
        <div>
          <ProcessingTimeTrendChart data={opProcessingData} />
        </div>
      </div>

      {/* Row 4: Top Performing Products Table */}
      <div className="mt-3">
        <AnalyticsTopProductsTable
          products={topProducts}
          userCurrency={userCurrency}
          maxRows={5}
          seeMoreHref="/analytics/financial"
          orders={filteredOrders}
          catalogProducts={filteredProducts}
        />
      </div>
    </div>
  );
}
