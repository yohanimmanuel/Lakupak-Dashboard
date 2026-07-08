'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  LineChart, 
  Line, 
  AreaChart, 
  Area, 
  BarChart, 
  Bar, 
  ComposedChart,
  PieChart, 
  Pie, 
  Cell,
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend, 
  ResponsiveContainer 
} from 'recharts';
import { 
  TrendingUp, 
  TrendingDown, 
  DollarSign, 
  ShoppingCart, 
  Package, 
  Users,
  ArrowUpRight,
  ArrowDownRight,
  ArrowRight,
  Calendar,
  Filter,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ArrowRightIcon
} from 'lucide-react';
import { useUserStore } from '@/store/userStore';
import { formatCurrency as utilsFormatCurrency, formatCompactCurrency, getDefaultCurrency, parseAmountSafely, type DecimalLike, type CurrencyValue } from '@/utils/currencyUtils';
import { Order, OrderItem } from '@/types/order';
import { Product, ProductVariant } from '@/types/product';
import { fetchGraphQL } from '@/lib/graphqlClient';
import { forecastRevenue } from '@/utils/forecasting';
import { calculatePromotionGift, PromotionDetails } from '@/utils/promotionUtils';
import Image from 'next/image';
import Link from 'next/link';
import { useAnalyticsTranslations } from '@/hooks/useAnalyticsTranslations';
import TopProductVariantDetailModal from './TopProductVariantDetailModal';
import type { TopProductVariantRow } from './TopProductVariantDetailModal';
import {
  AnalyticsTimeRange,
  filterOrdersByTimeRange,
  getAnalyticsBucketKey,
  getAnalyticsGrowthComparisonKey,
  getAnalyticsPeriodBuckets,
} from '@/utils/analyticsTimeRange';

function getOrderBucketDate(order: Pick<Order, 'orderDate'>): Date {
  return new Date(order.orderDate);
}

// Types for financial data
interface FinancialMetrics {
  totalRevenue: number;
  totalProfit: number;
  profitMargin: number;
  totalOrders: number;
  averageOrderValue: number;
  totalProducts: number;
  totalBuyers: number;
  totalSuppliers: number;
}

interface RevenueData {
  month: string;
  revenue: number;
  profit: number;
  orders: number;
}

interface CategoryData {
  category: string;
  revenue: number;
  profit: number;
  percentage: number;
}

interface TopProduct {
  name: string;
  productType: string;
  productCategory: string;
  orderVolume: number;
  profit: number;
  margin: number;
  unitsSold: number;
  piecesSold: number;
  productId: string;
  image?: string | null;
}

interface CashFlowData {
  month: string;
  inflows: number;
  outflows: number;
  netFlow: number;
}

const FINANCIAL_ANALYTICS_QUERY = `
  query FinancialAnalyticsData($userId: Int!, $orderLimit: Int!, $productLimit: Int!) {
    orders(userId: $userId, limit: $orderLimit) {
      nodes {
        orderId
        id
        buyerId
        orderDate
        paidAt
        orderStatus
        paymentStatus
        deliveryMethod
        deliveryOption
        shippingMethod
        shippingMethodLabel
        subtotal
        discounts
        shippingFee
        totalAmount
        paymentTerms
        totalOrders
        contactPerson
        storeName
        contactPhone
        customerEmail
        deliveryAddress
        preferredDeliveryDate
        preferredDeliveryTime
        preferredPickupDate
        preferredPickupTime
        assignedLogistics
        trackingNumber
        deliveryNote
        deliveryConfirmation
        pod
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
        halalCertified
        bpomApproved
        originalProduct
        returnPolicyDays
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

/** Empty state used by `AnalyticsRevenueTrendChart` and the full Financial Analytics revenue trend card. */
export function AnalyticsRevenueTrendChartEmpty() {
  const { tCharts } = useAnalyticsTranslations();

  return (
    <div className="h-80 flex items-center justify-center">
      <div className="text-center">
        <TrendingUp className="w-12 h-12 text-gray-300 mx-auto mb-2" />
        <p className="text-gray-500 text-sm">{tCharts('noRevenueData')}</p>
        <p className="text-gray-400 text-xs">{tCharts('noRevenueDataHint')}</p>
      </div>
    </div>
  );
}

type FinancialAnalyticsProps = {
  timeRange?: AnalyticsTimeRange;
  onReadyAction?: () => void;
};

const FinancialAnalytics: React.FC<FinancialAnalyticsProps> = ({ timeRange = '1M', onReadyAction }) => {
  const { user } = useUserStore();
  const { tShared, tMetrics, tCharts, tTables, translateCategoryFilter, translateForecastTrend, dateLocale } =
    useAnalyticsTranslations();
  const growthComparisonLabel = tShared(getAnalyticsGrowthComparisonKey(timeRange));
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [categoryFilter, setCategoryFilter] = useState<'productType' | 'productCategory'>('productCategory');
  const [isCategoryDropdownOpen, setIsCategoryDropdownOpen] = useState(false);
  const [selectedTopProduct, setSelectedTopProduct] = useState<TopProduct | null>(null);
  const categoryDropdownRef = useRef<HTMLDivElement>(null);
  const onReadyRef = useRef(onReadyAction);
  useEffect(() => { onReadyRef.current = onReadyAction; });
  // Metrics are calculated directly via useMemo - no need for state
  const [orders, setOrders] = useState<Order[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [hasData, setHasData] = useState(false);

  const userCurrency = user?.currency || getDefaultCurrency();

  // Restrict orders to the selected time-range window so every metric/graph reacts to the dropdown
  const filteredOrders = useMemo(() => filterOrdersByTimeRange(orders, timeRange), [orders, timeRange]);
  const hasFilteredData = hasData && filteredOrders.length > 0;

  // Reset table pagination when the time window changes to avoid landing on an empty page
  useEffect(() => {
    setCurrentPage(1);
  }, [timeRange]);

  const categoryOptions = useMemo(
    () => [
      { value: 'productCategory', label: translateCategoryFilter('productCategory') },
      { value: 'productType', label: translateCategoryFilter('productType') },
    ],
    [translateCategoryFilter]
  );

  const currentCategoryOption = categoryOptions.find(option => option.value === categoryFilter);

  // Handle dropdown click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (categoryDropdownRef.current && !categoryDropdownRef.current.contains(event.target as Node)) {
        setIsCategoryDropdownOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Helper function to calculate free items from buy-x-get-y promotions
  const calculateFreeItems = (item: OrderItem): number => {
    if (!item.promotionDetailsSnapshot) return 0;
    
    try {
      const promotionDetails: PromotionDetails = JSON.parse(item.promotionDetailsSnapshot);
      const paidPieces = (item.packageQuantity || 1) * (item.piecesPerPackage || 1);
      const moq = item.moqSnapshot ?? null;
      
      const promotionGift = calculatePromotionGift(promotionDetails, paidPieces, moq);
      return promotionGift?.freeQty || 0;
    } catch {
      // Invalid JSON, no free items
      return 0;
    }
  };

  // Helper function to parse currency strings/numbers to numbers (handles Decimal types)
  const parseCurrencyToNumber = (currencyValue: CurrencyValue): number => {
    if (currencyValue == null) return 0;
    
    if (typeof currencyValue === 'number') {
      return Number.isFinite(currencyValue) ? currencyValue : 0;
    }
    
    // Handle Prisma Decimal type
    if (typeof currencyValue === 'object' && currencyValue !== null) {
      try {
        if (typeof currencyValue.toNumber === 'function') {
          const num = currencyValue.toNumber();
          return Number.isFinite(num) ? num : 0;
        }
        if (typeof currencyValue.toString === 'function') {
          currencyValue = currencyValue.toString();
        } else {
          return 0;
        }
      } catch {
        return 0;
      }
    }
    
    if (typeof currencyValue === 'string') {
      if (!currencyValue || currencyValue === '0' || currencyValue === '0,00') return 0;
      
      // Remove currency symbols and spaces, keep dots and commas for decimal detection
      let cleanString = currencyValue.replace(/[^\d.,-]/g, '').trim();
      
      // Detect decimal separator: use the rightmost of '.' or ',' as decimal separator
      const lastDotIndex = cleanString.lastIndexOf('.');
      const lastCommaIndex = cleanString.lastIndexOf(',');
      
      if (lastDotIndex === -1 && lastCommaIndex === -1) {
        // No separators, just parse as integer
        const parsed = parseFloat(cleanString);
        return Number.isFinite(parsed) ? parsed : 0;
      }
      
      // Determine which is the decimal separator (rightmost)
      const decimalSeparator = lastDotIndex > lastCommaIndex ? '.' : ',';
      const groupingSeparator = decimalSeparator === '.' ? ',' : '.';
      
      // Remove grouping separators (the other character)
      cleanString = cleanString.replace(new RegExp(`\\${groupingSeparator}`, 'g'), '');
      
      // Normalize decimal separator to '.'
      if (decimalSeparator === ',') {
        cleanString = cleanString.replace(/,/g, '.');
      }
      
      const parsed = parseFloat(cleanString);
      return Number.isFinite(parsed) ? parsed : 0;
    }
    
    return 0;
  };
  
  // Helper to safely convert order amounts (handles Decimal types)
  // Uses shared utility for consistent parsing across the codebase
  const safeOrderAmount = (amount: unknown): number => {
    return parseAmountSafely(amount);
  };

  // Fetch real data from APIs - Orders and Products for category data
  const fetchData = async () => {
    try {
      setLoading(true);
      
      // Only fetch data if user is authenticated
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
      }>(FINANCIAL_ANALYTICS_QUERY, {
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
      onReadyRef.current?.();
    }
  };

  // Calculate real metrics from orders and products data - using actual product margins
  const calculateMetrics = useMemo(() => {
    if (!hasFilteredData || filteredOrders.length === 0) {
      return {
        totalRevenue: 0,
        totalProfit: 0,
        profitMargin: 0,
        totalOrders: 0,
        averageOrderValue: 0,
        totalProducts: 0,
        totalBuyers: 0,
        totalSuppliers: 0,
      };
    }

    // Use consistent revenue calculation with Orders module (handle Decimal types)
    const totalRevenue = filteredOrders.reduce((sum, order) => sum + safeOrderAmount(order.totalAmount), 0);

    const productById = createProductLookup(products);

    // Profit and margin: all orders (recorded when buyer places order)
    let totalProfit = 0;
    const uniqueProducts = new Set();
    const uniqueBuyers = new Set();

    // Collect unique products and buyers
    filteredOrders.forEach(order => {
      if (order.buyerId) {
        uniqueBuyers.add(order.buyerId);
      }
      
      // Compute order-level profit components
      let orderCogs = 0;
      if (order.orderItems && Array.isArray(order.orderItems)) {
        order.orderItems.forEach(item => {
          const pid = item.productId;
          if (!pid) { return; }
          orderCogs += calculateOrderItemCost(item, productById.get(pid), calculateFreeItems(item));
          uniqueProducts.add(pid);
        });
      }

      const orderRevenue = safeOrderAmount(order.totalAmount);
      const orderProfit = orderRevenue - orderCogs;
      totalProfit += orderProfit;
    });

    const profitMargin = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;
    const totalOrders = filteredOrders.length;
    const averageOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;

    return {
      totalRevenue,
      totalProfit,
      profitMargin,
      totalOrders,
      averageOrderValue,
      totalProducts: uniqueProducts.size,
      totalBuyers: uniqueBuyers.size,
      totalSuppliers: 0, // Not available from orders alone
    };
  }, [filteredOrders, products, hasFilteredData, userCurrency]);

  const revenueData: RevenueData[] = useMemo(
    () => calculateRevenueData(filteredOrders, products, hasFilteredData, timeRange, dateLocale),
    [filteredOrders, products, hasFilteredData, timeRange, dateLocale],
  );

  const growthMetrics = useMemo(() => {
    if (!hasFilteredData || revenueData.length < 2) {
      return {
        revenueGrowth: null as number | null,
        profitGrowth: null as number | null,
        marginGrowth: null as number | null,
        aovGrowth: null as number | null,
      };
    }

    const last = revenueData[revenueData.length - 1];
    const prev = revenueData[revenueData.length - 2];

    const revenueGrowth = prev.revenue > 0 ? ((last.revenue - prev.revenue) / prev.revenue) * 100 : null;
    const profitGrowth = prev.profit > 0 ? ((last.profit - prev.profit) / prev.profit) * 100 : null;
    const lastMargin = last.revenue > 0 ? (last.profit / last.revenue) * 100 : 0;
    const prevMargin = prev.revenue > 0 ? (prev.profit / prev.revenue) * 100 : 0;
    const marginGrowth = prevMargin !== 0 ? ((lastMargin - prevMargin) / Math.abs(prevMargin)) * 100 : null;
    const lastAov = last.orders > 0 ? last.revenue / last.orders : 0;
    const prevAov = prev.orders > 0 ? prev.revenue / prev.orders : 0;
    const aovGrowth = prevAov !== 0 ? ((lastAov - prevAov) / Math.abs(prevAov)) * 100 : null;

    return { revenueGrowth, profitGrowth, marginGrowth, aovGrowth };
  }, [hasFilteredData, revenueData]);

  // Calculate revenue forecast
  const revenueForecast = useMemo(() => {
    if (revenueData.length < 2) return null;
    return forecastRevenue(revenueData, timeRange, dateLocale);
  }, [revenueData, timeRange, dateLocale]);

  const revenueForecastChartData = useMemo(() => {
    if (!revenueForecast?.forecast.length) return [];

    const points: Array<{
      month: string;
      historicalRevenue: number | null;
      forecastRevenue: number | null;
    }> = revenueData.map((d) => ({
      month: d.month,
      historicalRevenue: d.revenue,
      forecastRevenue: null,
    }));

    if (points.length > 0) {
      const lastIndex = points.length - 1;
      points[lastIndex] = {
        ...points[lastIndex],
        forecastRevenue: points[lastIndex].historicalRevenue,
      };
    }

    revenueForecast.forecast.forEach((f) => {
      points.push({
        month: f.date,
        historicalRevenue: null,
        forecastRevenue: f.value,
      });
    });

    return points;
  }, [revenueData, revenueForecast]);

  const revenueForecastYMax = useMemo(() => {
    const values = revenueForecastChartData.flatMap((point) =>
      [point.historicalRevenue, point.forecastRevenue].filter((value): value is number => value != null),
    );
    if (values.length === 0) return 1;
    return Math.ceil(Math.max(...values) * 1.12);
  }, [revenueForecastChartData]);

  // Calculate real category revenue using actual product margins
  const categoryData: CategoryData[] = useMemo(() => {
    if (!hasFilteredData || filteredOrders.length === 0) {
      return [];
    }

    const categoryStats: { [key: string]: { revenue: number; profit: number } } = {};
    
    const productById = createProductLookup(products);
    const avgMargin = getAverageProductMargin(products);
    
    filteredOrders.forEach(order => {
      if (order.orderItems && Array.isArray(order.orderItems)) {
        order.orderItems.forEach(item => {
          // Calculate actual revenue and profit using product prices
          const product = item.productId ? productById.get(item.productId) : undefined;
          
          // Get category based on selected filter
          let category = 'Uncategorized';
          if (categoryFilter === 'productType') {
            category = product?.productType || 'Uncategorized';
          } else {
            category = product?.productCategory || 'Uncategorized';
          }
          
          const revenue = calculateOrderItemRevenue(item, findOrderItemVariantOption(product, item));
          const cost = calculateOrderItemCost(item, product, calculateFreeItems(item));
          const profit = cost > 0 ? revenue - cost : revenue * (avgMargin / 100);

          if (!categoryStats[category]) {
            categoryStats[category] = { revenue: 0, profit: 0 };
          }
          categoryStats[category].revenue += revenue;
          categoryStats[category].profit += profit;
        });
      }
    });

    const totalRevenue = Object.values(categoryStats).reduce((sum, stats) => sum + stats.revenue, 0);

    return Object.entries(categoryStats).map(([category, stats]) => ({
      category,
      revenue: stats.revenue,
      profit: stats.profit,
      percentage: totalRevenue > 0 ? (stats.revenue / totalRevenue) * 100 : 0
    })).sort((a, b) => b.revenue - a.revenue);
  }, [filteredOrders, products, hasFilteredData, userCurrency, categoryFilter]);

  // Calculate real top products using actual product margins
  const allTopProducts: TopProduct[] = useMemo(() => {
    if (!hasFilteredData || filteredOrders.length === 0) {
      return [];
    }

    const productStats: { [key: string]: { orderVolume: number; unitsSold: number; piecesSold: number; category: string; productCategory: string; name: string; profit: number; image?: string | null } } = {};
    
    const productById = createProductLookup(products);
    const avgMargin = getAverageProductMargin(products);
    
    filteredOrders.forEach(order => {
      if (order.orderItems && Array.isArray(order.orderItems)) {
        order.orderItems.forEach(item => {
          const pid = item.productId;
          if (!pid) { return; }
          const productId = pid as string;
          if (!productStats[productId]) {
            // Find the product to get its name and category
                const product = productById.get(productId);
            
            // Get category - use the same simple logic as CustomerSalesAnalytics
            const category = product?.productCategory || 'Uncategorized';
            
            productStats[productId] = {
              orderVolume: 0,
              unitsSold: 0,
              piecesSold: 0,
              category: category,
              productCategory: product?.productCategory || 'Uncategorized',
              name: product?.name || `Product ${productId}`,
              profit: 0,
              image: product?.images?.[0] ?? null,
            };
          }
          
          const product = productById.get(productId);
          const itemRevenue = calculateOrderItemRevenue(item, findOrderItemVariantOption(product, item));
          const itemCost = calculateOrderItemCost(item, product, calculateFreeItems(item));
          const itemProfit = itemCost > 0 ? itemRevenue - itemCost : itemRevenue * (avgMargin / 100);
          productStats[productId].orderVolume += itemRevenue;
          productStats[productId].profit += itemProfit;
          
          // Calculate units sold using piece-based pricing
          const piecesPerPackage = getOrderItemPiecesPerPackage(item);
          const packageQuantity = getOrderItemPackageQuantity(item);
          productStats[productId].unitsSold += packageQuantity * piecesPerPackage;
          productStats[productId].piecesSold += packageQuantity;
        });
      }
    });

    return Object.entries(productStats).map(([productId, stats]) => {
      const margin = stats.orderVolume > 0 ? (stats.profit / stats.orderVolume) * 100 : 0;
      
      return {
        name: stats.name,
        orderVolume: stats.orderVolume,
        unitsSold: stats.unitsSold,
        piecesSold: stats.piecesSold,
        margin,
        productType: stats.category,
        productCategory: stats.productCategory,
        profit: stats.profit,
        productId: productId,
        image: stats.image ?? null,
      };
    }).sort((a, b) => b.orderVolume - a.orderVolume).slice(0, 50);
  }, [filteredOrders, products, hasFilteredData, userCurrency]);

  // Calculate cash flow data: inflows from totalAmount; outflows from COGS only (shippingFee is part of revenue and often marked up, so actual cost unknown)
  const cashFlowData: CashFlowData[] = useMemo(() => {
    if (!hasFilteredData || filteredOrders.length === 0) {
      return [];
    }

    const productById = createProductLookup(products);

    const flowByKey = new Map<string, { inflows: number; outflows: number }>();
    filteredOrders.forEach(order => {
      const date = new Date(order.orderDate);
      const key = getAnalyticsBucketKey(date, timeRange);
      const current = flowByKey.get(key) ?? { inflows: 0, outflows: 0 };

      const orderAmount = safeOrderAmount(order.totalAmount);
      current.inflows += orderAmount;

      let orderCogs = 0;
      if (order.orderItems && Array.isArray(order.orderItems)) {
        order.orderItems.forEach(item => {
          const pid = item.productId;
          if (!pid) { return; }
          orderCogs += calculateOrderItemCost(item, productById.get(pid), calculateFreeItems(item));
        });
      }
      current.outflows += orderCogs;
      flowByKey.set(key, current);
    });

    return getAnalyticsPeriodBuckets(timeRange, { locale: dateLocale }).map((bucket) => {
      const flow = flowByKey.get(bucket.key) ?? { inflows: 0, outflows: 0 };
      return {
        month: bucket.label,
        inflows: flow.inflows,
        outflows: flow.outflows,
        netFlow: flow.inflows - flow.outflows,
      };
    });
  }, [filteredOrders, products, hasFilteredData, timeRange, dateLocale]);

  // Pagination logic for Top Products
  const productsPerPage = 6;
  const totalProducts = allTopProducts.length;
  const totalPages = Math.max(1, Math.ceil(totalProducts / productsPerPage));
  const fromProduct = totalProducts === 0 ? 0 : (currentPage - 1) * productsPerPage + 1;
  const toProduct = Math.min(currentPage * productsPerPage, totalProducts);
  const pagedProducts = allTopProducts.slice((currentPage - 1) * productsPerPage, currentPage * productsPerPage);

  const selectedProductVariants = useMemo(() => {
    if (!selectedTopProduct) return [];
    return calculateTopProductVariantBreakdown(selectedTopProduct.productId, filteredOrders, products);
  }, [selectedTopProduct, filteredOrders, products]);

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
  };

  const COLORS = ['#10B981', '#3B82F6', '#F59E0B', '#EF4444', '#8B5CF6'];

  useEffect(() => {
    fetchData();
  }, [user?.id]); // Added user?.id dependency since fetchData uses it

  // Reusable MetricCard component for both Analytics pages
  const MetricCard: React.FC<{
    title: string;
    value: string;
    change: number | null;
    icon: React.ReactNode;
    color: string;
    comparisonLabel?: string;
  }> = ({ title, value, change, icon, color, comparisonLabel }) => (
    <div className={`flex flex-col justify-between p-4 rounded-lg bg-white border border-[#e6e6e6] ${color}`}>
      <div className="flex items-center gap-4 border-b border-[#e6e6e6] pb-4">
        <div className="flex items-center justify-center w-12 h-12 rounded-lg bg-white">
          {icon}
        </div>
        <div>
          <div className="text-xs text-gray-500 font-semibold uppercase tracking-wide">{title}</div>
          <div className="text-xl font-bold text-black">{value}</div>
        </div>
      </div>
    <div className="flex items-center gap-2 mt-4 ml-1">
      <MetricChangeFooter change={change} comparisonLabel={comparisonLabel ?? growthComparisonLabel} />
    </div>
    </div>
  );

  // Don't render content until data is loaded to avoid showing 0 values
  if (loading) {
    return null;
  }

  return (
    <div className="space-y-3">

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
        <MetricCard
          title={tMetrics('orderVolume')}
          value={utilsFormatCurrency(calculateMetrics.totalRevenue, userCurrency)}
          change={growthMetrics.revenueGrowth}
          icon={<DollarSign className="w-6 h-6 text-[#0a61d7]" />}
          color="bg-[#f7faff]"
        />
        <MetricCard
          title={tMetrics('totalProfit')}
          value={utilsFormatCurrency(calculateMetrics.totalProfit, userCurrency)}
          change={growthMetrics.profitGrowth}
          icon={<TrendingUp className="w-6 h-6 text-green-500" />}
          color="bg-[#e6f7ec]"
        />
        <MetricCard
          title={tMetrics('profitMargin')}
          value={`${calculateMetrics.profitMargin.toFixed(1)}%`}
          change={growthMetrics.marginGrowth}
          icon={<TrendingUp className="w-6 h-6 text-yellow-500" />}
          color="bg-[#f7faff]"
        />
        <MetricCard
          title={tMetrics('averageOrderValue')}
          value={utilsFormatCurrency(calculateMetrics.averageOrderValue, userCurrency)}
          change={growthMetrics.aovGrowth}
          icon={<ShoppingCart className="w-6 h-6 text-gray-500" />}
          color="bg-[#e6e6e6]"
        />
      </div>

      {/* Charts Grid */}
       <div className="space-y-3">
         {/* Second Row - Revenue Trend (smaller) + Revenue by Category (larger) */}
         <div className="grid grid-cols-1 lg:grid-cols-16 gap-3">
           <div className="lg:col-span-10">
                 {/* Revenue Trend */}
         <div className="bg-white rounded-lg border border-[#e6e6e6] p-4">
           <div className="flex items-center justify-between mb-6">
             <h3 className="text-lg font-semibold text-gray-900">{tCharts('revenueTrend')}</h3>
               <div className="flex items-center space-x-4">
               <div className="flex items-center">
                 <div className="w-3 h-3 bg-gradient-to-r from-[#3b82f6] to-[#0a61d7] rounded-full mr-2"></div>
                 <span className="text-sm text-gray-600 font-medium">{tCharts('orderVolumeLegend')}</span>
               </div>
               <div className="flex items-center">
                 <div className="w-3 h-3 bg-gradient-to-r from-emerald-400 to-emerald-600 rounded-full mr-2"></div>
                 <span className="text-sm text-gray-600 font-medium">{tCharts('profitLegend')}</span>
               </div>
             </div>
           </div>
           {revenueData.length > 0 ? (
             <div className="-mx-1">
             <ResponsiveContainer width="100%" height={320}>
               <AreaChart data={revenueData} margin={{ top: 16, right: 50, left: 25, bottom: 12 }}>
                 <defs>
                   <linearGradient id="revenueGradient" x1="0" y1="0" x2="0" y2="1">
                     <stop offset="0%" stopColor="#0a61d7" stopOpacity={0.4}/>
                     <stop offset="50%" stopColor="#0a61d7" stopOpacity={0.2}/>
                     <stop offset="100%" stopColor="#0a61d7" stopOpacity={0.1}/>
                   </linearGradient>
                   <linearGradient id="profitGradient" x1="0" y1="0" x2="0" y2="1">
                     <stop offset="0%" stopColor="#10B981" stopOpacity={0.4}/>
                     <stop offset="50%" stopColor="#10B981" stopOpacity={0.2}/>
                     <stop offset="100%" stopColor="#10B981" stopOpacity={0.05}/>
                   </linearGradient>
                 </defs>
                 <CartesianGrid strokeDasharray="2 4" stroke="#000000" strokeOpacity={0.2} horizontal={true} vertical={false} />
                 <XAxis 
                   dataKey="month" 
                   stroke="#64748B" 
                   fontSize={12}
                   fontWeight={500}
                   tickLine={false}
                   axisLine={false}
                   padding={{ left: 0, right: 0 }}
                 />
                 <YAxis 
                   width={58}
                   stroke="#64748B" 
                   fontSize={11}
                   fontWeight={500}
                   tickFormatter={(value) => formatCompactCurrency(value, userCurrency)}
                   tickLine={false}
                   axisLine={false}
                   tick={{ style: { whiteSpace: 'nowrap' } }}
                 />
                 <Tooltip 
                   formatter={(value: number, name: string) => [
                     utilsFormatCurrency(value, userCurrency), 
                     name === 'revenue' ? tCharts('orderVolumeLegend') : tCharts('profitLegend')
                   ]}
                   labelStyle={{ 
                     color: '#1E293B', 
                     fontWeight: 600,
                     fontSize: '14px'
                   }}
                   contentStyle={{ 
                     backgroundColor: 'white', 
                     border: 'none',
                     borderRadius: '12px',
                     boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
                     padding: '16px'
                   }}
                   cursor={{ fill: '#F1F5F9', fillOpacity: 0.3 }}
                 />
                 <Area
                   type="monotone"
                   dataKey="revenue"
                   stroke="#3B82F6"
                   fillOpacity={1}
                   fill="url(#revenueGradient)"
                   strokeWidth={3}
                   dot={{ 
                     fill: '#3B82F6', 
                     strokeWidth: 2, 
                     r: 4,
                     stroke: 'white',
                     filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.1))'
                   }}
                   activeDot={{ 
                     r: 6, 
                     stroke: '#3B82F6', 
                     strokeWidth: 3,
                     fill: 'white',
                     filter: 'drop-shadow(0 4px 8px rgba(0,0,0,0.15))'
                   }}
                 />
                 <Area
                   type="monotone"
                   dataKey="profit"
                   stroke="#10B981"
                   fillOpacity={1}
                   fill="url(#profitGradient)"
                   strokeWidth={3}
                   dot={{ 
                     fill: '#10B981', 
                     strokeWidth: 2, 
                     r: 4,
                     stroke: 'white',
                     filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.1))'
                   }}
                   activeDot={{ 
                     r: 6, 
                     stroke: '#10B981', 
                     strokeWidth: 3,
                     fill: 'white',
                     filter: 'drop-shadow(0 4px 8px rgba(0,0,0,0.15))'
                   }}
                 />
               </AreaChart>
             </ResponsiveContainer>
             </div>
           ) : (
             <AnalyticsRevenueTrendChartEmpty />
           )}
         </div>
           </div>
           <div className="lg:col-span-6">
         {/* Revenue by Category */}
         <div className="bg-white rounded-lg border border-[#e6e6e6] p-4">
           <div className="flex items-center justify-between mb-6">
             <h3 className="text-lg font-semibold text-gray-900">{tCharts('revenueByCategory')}</h3>
             <div className="relative" ref={categoryDropdownRef}>
               <button
                 onClick={() => setIsCategoryDropdownOpen(!isCategoryDropdownOpen)}
                 className="flex items-center gap-2 px-4 py-2 bg-white border border-[#e6e6e6] text-black rounded-lg hover:bg-gray-50 transition-colors text-sm font-medium"
               >
                 <Filter className="w-4 h-4" />
                 {currentCategoryOption?.label}
                 <ChevronDown className="w-4 h-4" />
               </button>
               
               {isCategoryDropdownOpen && (
                 <div className="absolute top-full left-0 mt-1 w-full bg-white border border-[#e6e6e6] rounded-lg shadow-lg z-10">
                   {categoryOptions.map((option) => (
                     <button
                       key={option.value}
                       onClick={() => {
                         setCategoryFilter(option.value as 'productType' | 'productCategory');
                         setIsCategoryDropdownOpen(false);
                       }}
                       className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-50 transition-colors first:rounded-t-lg last:rounded-b-lg ${
                         categoryFilter === option.value ? 'bg-blue-50 text-blue-600' : 'text-gray-700'
                       }`}
                     >
                       {option.label}
                     </button>
                   ))}
                 </div>
               )}
             </div>
           </div>
           <ResponsiveContainer width="100%" height={275}>
             <PieChart>
               <defs>
                 <linearGradient id="electronicsGradient" x1="0" y1="0" x2="1" y2="1">
                   <stop offset="0%" stopColor="#10B981" stopOpacity={0.9}/>
                   <stop offset="100%" stopColor="#059669" stopOpacity={0.7}/>
                 </linearGradient>
                 <linearGradient id="clothingGradient" x1="0" y1="0" x2="1" y2="1">
                   <stop offset="0%" stopColor="#0a61d7" stopOpacity={0.9}/>
                   <stop offset="100%" stopColor="#1D4ED8" stopOpacity={0.7}/>
                 </linearGradient>
                 <linearGradient id="homeGradient" x1="0" y1="0" x2="1" y2="1">
                   <stop offset="0%" stopColor="#F59E0B" stopOpacity={0.9}/>
                   <stop offset="100%" stopColor="#D97706" stopOpacity={0.7}/>
                 </linearGradient>
                 <linearGradient id="sportsGradient" x1="0" y1="0" x2="1" y2="1">
                   <stop offset="0%" stopColor="#EF4444" stopOpacity={0.9}/>
                   <stop offset="100%" stopColor="#DC2626" stopOpacity={0.7}/>
                 </linearGradient>
               </defs>
               <Pie
                 data={categoryData}
                 cx="50%"
                 cy="50%"
                 innerRadius={70}
                 outerRadius={110}
                 paddingAngle={2}
                 dataKey="revenue"
                 stroke="white"
                 strokeWidth={2}
                 cornerRadius={8}
               >
                 {categoryData.map((entry, index) => {
                   const gradients = [
                     'url(#electronicsGradient)',
                     'url(#clothingGradient)', 
                     'url(#homeGradient)',
                     'url(#sportsGradient)'
                   ];
                   return (
                     <Cell 
                       key={`cell-${index}`} 
                       fill={gradients[index % gradients.length]}
                     />
                   );
                 })}
               </Pie>
               <Tooltip 
                 formatter={(value: number, name: string, item?: { payload?: { category?: string } }) => [
                   utilsFormatCurrency(value, userCurrency), 
                   `${item?.payload?.category ?? name}`
                 ]}
                 labelStyle={{ 
                   color: '#1E293B', 
                   fontWeight: 600,
                   fontSize: '14px'
                 }}
                 contentStyle={{ 
                   backgroundColor: 'white', 
                   border: 'none',
                   borderRadius: '12px',
                   boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
                   padding: '16px'
                 }}
               />

             </PieChart>
           </ResponsiveContainer>
           
           {/* Custom Legend */}
           <div className="flex flex-wrap justify-center gap-4 mt-4">
             {categoryData.map((entry, index) => {
               const colors = [
                 '#10B981', // Electronics - Emerald
                 '#3B82F6', // Clothing - Blue
                 '#F59E0B', // Home & Garden - Amber
                 '#EF4444'  // Sports - Red
               ];
               return (
                 <div key={index} className="flex items-center space-x-2">
                   <div 
                     className="w-3 h-3 rounded-full"
                     style={{ 
                       backgroundColor: colors[index % colors.length],
                       boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
                     }}
                   />
                   <span className="text-sm text-gray-700 font-medium">{entry.category}</span>
                 </div>
               );
             })}
           </div>
         </div>
           </div>
         </div>

         {/* Third Row - Revenue Forecast + Cash Flow Trend */}
         <div className="space-y-3">
           {/* Revenue Forecast */}
            <div className="bg-white rounded-lg border border-[#e6e6e6] p-4">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-semibold text-gray-900">{tCharts('revenueForecast')}</h3>
                {revenueForecast && revenueForecast.forecast.length > 0 && (
                  <div className="flex items-center space-x-4">
                    <div className="flex items-center">
                      <div className="w-3 h-3 bg-gradient-to-r from-[#3b82f6] to-[#0a61d7] rounded-full mr-2"></div>
                      <span className="text-sm text-gray-600 font-medium">{tCharts('historical')}</span>
                    </div>
                    <div className="flex items-center">
                      <div className="w-3 h-3 border-2 border-dashed border-[#9CA3AF] rounded-full mr-2"></div>
                      <span className="text-sm text-gray-600 font-medium">{tCharts('forecast')}</span>
                    </div>
                  </div>
                )}
              </div>
              {revenueForecast && revenueForecast.forecast.length > 0 ? (
                <>
                  <ResponsiveContainer width="100%" height={300}>
                    <AreaChart 
                      data={revenueForecastChartData}
                      margin={{ top: 20, right: 35, left: 15, bottom: 20 }}
                    >
                      <defs>
                        <linearGradient id="revenueForecastGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#0a61d7" stopOpacity={0.4}/>
                          <stop offset="50%" stopColor="#0a61d7" stopOpacity={0.2}/>
                          <stop offset="100%" stopColor="#0a61d7" stopOpacity={0.1}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="2 4" stroke="#000000" strokeOpacity={0.2} horizontal={true} vertical={false} />
                      <XAxis 
                        dataKey="month" 
                        stroke="#64748B" 
                        fontSize={12}
                        fontWeight={500}
                        tickLine={false}
                        axisLine={false}
                      />
                      <YAxis 
                        width={58}
                        stroke="#64748B" 
                        fontSize={11}
                        fontWeight={500}
                        domain={[0, revenueForecastYMax]}
                        tickFormatter={(value) => formatCompactCurrency(value, userCurrency)}
                        tickLine={false}
                        axisLine={false}
                        tick={{ style: { whiteSpace: 'nowrap' } }}
                      />
                      <Tooltip 
                        content={({ active, payload, label }) => {
                          if (!active || !payload?.length) return null;

                          const historical = payload.find(
                            (entry) => entry.dataKey === 'historicalRevenue' && entry.value != null,
                          );
                          const forecast = payload.find(
                            (entry) => entry.dataKey === 'forecastRevenue' && entry.value != null,
                          );

                          return (
                            <div className="rounded-lg border border-[#E5E7EB] bg-white p-4 shadow-md">
                              <p className="mb-2 font-semibold text-gray-900">{label}</p>
                              {historical ? (
                                <div className="mb-1 flex items-center gap-2">
                                  <div className="h-3 w-3 rounded-full bg-[#0a61d7]" />
                                  <span className="text-gray-700">
                                    {tCharts('historical')}: {utilsFormatCurrency(Number(historical.value), userCurrency)}
                                  </span>
                                </div>
                              ) : null}
                              {forecast ? (
                                <div className="flex items-center gap-2">
                                  <div className="h-3 w-3 rounded-full border-2 border-dashed border-[#9CA3AF]" />
                                  <span className="text-gray-700">
                                    {tCharts('forecast')}: {utilsFormatCurrency(Number(forecast.value), userCurrency)}
                                  </span>
                                </div>
                              ) : null}
                            </div>
                          );
                        }}
                      />
                      <Area 
                        type="monotone" 
                        dataKey="historicalRevenue" 
                        name={tCharts('historical')}
                        stroke="#0a61d7" 
                        strokeWidth={2}
                        fillOpacity={1} 
                        fill="url(#revenueForecastGradient)" 
                        connectNulls={false}
                        dot={{ fill: '#3B82F6', strokeWidth: 2, r: 4, stroke: 'white' }}
                        activeDot={{ 
                          r: 6, 
                          stroke: '#3B82F6', 
                          strokeWidth: 3,
                          fill: 'white'
                        }}
                      />
                      <Line
                        type="monotone"
                        dataKey="forecastRevenue"
                        name={tCharts('forecast')}
                        stroke="#9CA3AF"
                        strokeWidth={2}
                        strokeDasharray="5 5"
                        connectNulls
                        dot={{ fill: '#9CA3AF', r: 3 }}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                  <div className="mt-4 pt-4 border-t border-[#e6e6e6] flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div>
                        <span className="text-xs text-gray-500">{tShared('trendLabel')} </span>
                        <span className={`text-sm font-semibold ${
                          revenueForecast.trend === 'increasing' ? 'text-green-600' : 
                          revenueForecast.trend === 'decreasing' ? 'text-red-600' : 
                          'text-gray-600'
                        }`}>
                          {translateForecastTrend(revenueForecast.trend)}
                        </span>
                      </div>
                      <div>
                        <span className="text-xs text-gray-500">{tShared('confidenceLabel')} </span>
                        <span className="text-sm font-semibold text-black">{revenueForecast.confidence.toFixed(1)}%</span>
                      </div>
                    </div>
                  </div>
                </>
              ) : (
                <div className="h-[357px] flex items-center justify-center">
                  <div className="text-center">
                    <TrendingUp className="w-12 h-12 text-gray-300 mx-auto mb-2" />
                    <p className="text-gray-500 text-sm">{tCharts('insufficientForecastData')}</p>
                    <p className="text-gray-400 text-xs">{tCharts('insufficientForecastHint')}</p>
                  </div>
                </div>
              )}
            </div>

           {/* Cash Flow Trend */}
          <div className="bg-white rounded-lg border border-[#e6e6e6] p-4">
           <div className="flex items-center justify-between mb-4">
             <h3 className="text-lg font-semibold text-gray-900">{tCharts('cashFlowTrend')}</h3>
             <div className="flex items-center space-x-4">
               <div className="flex items-center">
                 <div className="w-3 h-3 bg-gradient-to-r from-emerald-400 to-emerald-600 rounded-full mr-1"></div>
                 <span className="text-sm text-gray-600 font-medium">{tCharts('cashIn')}</span>
               </div>
               <div className="flex items-center">
                 <div className="w-3 h-3 bg-gradient-to-r from-red-400 to-red-600 rounded-full mr-1"></div>
                 <span className="text-sm text-gray-600 font-medium">{tCharts('cashOut')}</span>
               </div>
               <div className="flex items-center">
                 <div className="w-3 h-3 bg-gradient-to-r from-[#3b82f6] to-[#0a61d7] rounded-full mr-1"></div>
                 <span className="text-sm text-gray-600 font-medium">{tCharts('netFlow')}</span>
               </div>
             </div>
           </div>
           <ResponsiveContainer width="100%" height={365}>
             <ComposedChart data={cashFlowData} margin={{ top: 20, right: 35, left: 15, bottom: 20 }}>
               <defs>
                 <linearGradient id="netFlowGradient" x1="0" y1="0" x2="1" y2="0">
                   <stop offset="0%" stopColor="#3B82F6" stopOpacity={0.8}/>
                   <stop offset="100%" stopColor="#0a61d7" stopOpacity={0.8}/>
                 </linearGradient>
                 <linearGradient id="inflowGradient" x1="0" y1="0" x2="0" y2="1">
                   <stop offset="0%" stopColor="#10B981" stopOpacity={0.8}/>
                   <stop offset="100%" stopColor="#10B981" stopOpacity={0.6}/>
                 </linearGradient>
                 <linearGradient id="outflowGradient" x1="0" y1="0" x2="0" y2="1">
                   <stop offset="0%" stopColor="#EF4444" stopOpacity={0.8}/>
                   <stop offset="100%" stopColor="#EF4444" stopOpacity={0.6}/>
                 </linearGradient>
               </defs>
               <CartesianGrid strokeDasharray="2 4" stroke="#000000" strokeOpacity={0.2} horizontal={true} vertical={false} />
               <XAxis 
                 dataKey="month" 
                 stroke="#64748B" 
                 fontSize={12}
                 fontWeight={500}
                 tickLine={false}
                 axisLine={false}
               />
               <YAxis 
                 stroke="#64748B" 
                 fontSize={12}
                 fontWeight={500}
                 tickFormatter={(value) => formatCompactCurrency(value, userCurrency)}
                 tickLine={false}
                 axisLine={false}
               />
               <Tooltip 
                 content={({ active, payload, label }: { active?: boolean; payload?: Array<{ dataKey?: string; value?: number }>; label?: string | number }) => {
                   if (active && payload && payload.length) {
                     return (
                       <div className="bg-white rounded-xl border border-[#e6e6e6] p-4">
                         <p className="font-semibold text-gray-900 mb-2">{label}</p>
                         {payload.map((entry, index) => {
                           let dotColor = '#64748B';
                           let labelText = '';
                           
                           if (entry.dataKey === 'inflows') {
                             dotColor = '#059669';
                             labelText = tCharts('cashIn');
                           } else if (entry.dataKey === 'outflows') {
                             dotColor = '#DC2626';
                             labelText = tCharts('cashOut');
                           } else if (entry.dataKey === 'netFlow') {
                             dotColor = '#0a61d7';
                             labelText = tCharts('netFlow');
                           }
                           
                           return (
                             <div key={index} className="flex items-center space-x-2 mb-1">
                               <div 
                                 className="w-3 h-3 rounded-full"
                                 style={{ backgroundColor: dotColor }}
                               />
                               <span className="text-gray-700">
                                 {utilsFormatCurrency(Number(entry.value || 0), userCurrency)}
                               </span>
                               <span className="text-gray-500 ml-1">
                                 {labelText}
                               </span>
                             </div>
                           );
                         })}
                       </div>
                     );
                   }
                   return null;
                 }}
                 cursor={{ fill: '#F1F5F9', fillOpacity: 0.3 }}
               />
               <Bar 
                 dataKey="inflows" 
                 fill="url(#inflowGradient)" 
                 name={tCharts('cashIn')}
                 radius={[6, 6, 0, 0]}
                 maxBarSize={40}
               />
               <Bar 
                 dataKey="outflows" 
                 fill="url(#outflowGradient)" 
                 name={tCharts('cashOut')}
                 radius={[6, 6, 0, 0]}
                 maxBarSize={40}
               />
               <Line 
                 type="monotone" 
                 dataKey="netFlow" 
                 stroke="url(#netFlowGradient)" 
                 strokeWidth={4}
                 name={tCharts('netFlow')}
                 dot={{ 
                   fill: '#0a61d7', 
                   strokeWidth: 3, 
                   r: 6,
                   stroke: 'white',
                   filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.1))'
                 }}
                 activeDot={{ 
                   r: 8, 
                   stroke: '#3B82F6', 
                   strokeWidth: 3,
                   fill: 'white',
                   filter: 'drop-shadow(0 4px 8px rgba(0,0,0,0.15))'
                 }}
               />
             </ComposedChart>
           </ResponsiveContainer>
         </div>
         </div>

         {/* Fourth Row - Top Performing Products Table */}
         <div className="mt-3">
           <div className="bg-white rounded-lg border border-[#e6e6e6] p-4 h-full flex flex-col">
            <h3 className="text-lg font-semibold text-gray-900 mb-6">{tTables('topPerformingProducts')}</h3>
            <div className="flex-1 overflow-x-auto rounded-lg">
              <table className="min-w-full text-sm text-left whitespace-nowrap text-xs">
                <thead className="bg-gray-100 text-gray-500 whitespace-nowrap">
                  <tr>
                    <th className="py-3 px-4 font-medium uppercase text-left">{tTables('rank')}</th>
                    <th className="py-3 px-4 font-medium uppercase text-left">{tTables('productName')}</th>
                    <th className="py-3 px-4 font-medium uppercase text-center">{tTables('category')}</th>
                    <th className="py-3 px-4 font-medium uppercase text-center">{tTables('piecesSold')}</th>
                    <th className="py-3 px-4 font-medium uppercase text-center">{tTables('orderVolume')}</th>
                    <th className="py-3 px-4 font-medium uppercase text-center">{tTables('margin')}</th>
                  </tr>
                </thead>
               <tbody className="bg-white">
                 {pagedProducts.map((product, index) => (
                   <tr
                     key={product.productId}
                     role="button"
                     tabIndex={0}
                     className="cursor-pointer border-b transition-colors hover:bg-[#f7faff]"
                     onClick={() => setSelectedTopProduct(product)}
                     onKeyDown={(event) => handleTopProductRowKeyDown(event, () => setSelectedTopProduct(product))}
                     title={tTables('viewVariantDetails', { name: product.name })}
                   >
                     <td className="py-3 px-4 text-left text-black">
                       {(currentPage - 1) * productsPerPage + index + 1}
                     </td>
                      <td className="py-3 px-4 text-left min-w-0">
                         <div className="flex items-center gap-2 min-w-0">
                           <ProductImageThumb src={product.image} alt={product.name} size="sm" />
                           <Link
                             href={`/products/catalog/${product.productId}`}
                             className="truncate font-semibold text-[#0a61d7] transition-all duration-200 hover:text-blue-800"
                             title={tShared('viewProduct', { name: product.name })}
                             onClick={(e) => e.stopPropagation()}
                           >
                             {product.name}
                           </Link>
                         </div>
                      </td>
                      <td className="py-3 px-4 text-center text-gray-600">
                        {product.productCategory}
                      </td>
                      <td className="py-3 px-4 text-center text-black">
                        {product.piecesSold.toLocaleString()}
                      </td>
                     <td className="py-3 px-4 text-center font-semibold text-black">
                       {utilsFormatCurrency(product.orderVolume, userCurrency)}
                     </td>
                     <td className="py-3 px-4 text-center text-black">
                       {product.margin.toFixed(2)}%
                     </td>
                   </tr>
                 ))}
               </tbody>
             </table>
           </div>
           
           {/* Pagination */}
           <div className="flex flex-col md:flex-row md:items-center md:justify-between mt-6 gap-2">
             {/* Left: Showing X to Y of Z */}
             <div className="text-sm text-gray-500">
               {tShared('pagination.showing', { from: fromProduct, to: toProduct, total: totalProducts })}
             </div>
             {/* Right: Pagination Controls */}
             <div className="flex items-center gap-3">
               <button
                 className="p-2 rounded-lg hover:bg-gray-100 disabled:opacity-50 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
                 onClick={() => handlePageChange(currentPage - 1)}
                 disabled={currentPage === 1}
                 aria-label={tShared('pagination.previousPage')}
               >
                 <ChevronLeft className="w-4 h-4 text-gray-500" />
               </button>
               <button
                 className="px-3 py-2 rounded-lg font-semibold text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 bg-[#0a61d7] text-white"
                 aria-label={tShared('pagination.pageAria', { page: currentPage })}
                 aria-current="page"
               >
                 {currentPage}
               </button>
               <button
                 className="p-2 rounded-lg hover:bg-gray-100 disabled:opacity-50 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
                 onClick={() => handlePageChange(currentPage + 1)}
                 disabled={currentPage === totalPages}
                 aria-label={tShared('pagination.nextPage')}
               >
                 <ChevronRight className="w-4 h-4 text-gray-500" />
               </button>
             </div>
           </div>
          </div>
         </div>

         <TopProductVariantDetailModal
           isOpen={selectedTopProduct != null}
           onCloseAction={() => setSelectedTopProduct(null)}
           product={selectedTopProduct}
           variants={selectedProductVariants}
           userCurrency={userCurrency}
         />
       </div>
     </div>
   );
 };

// ===== REUSABLE COMPONENTS FOR ANALYTICS PAGES =====

function MetricChangeFooter({
  change,
  comparisonLabel,
  naLabel,
}: {
  change: number | null;
  comparisonLabel?: string;
  naLabel?: string;
}) {
  const { tShared } = useAnalyticsTranslations();
  const resolvedComparisonLabel = comparisonLabel ?? tShared('vsLastMonth');
  const resolvedNaLabel = naLabel ?? tShared('na');

  if (change === null || change === undefined) {
    return (
      <>
        <ArrowRight className="w-5 h-5 text-gray-400" />
        <span className="text-gray-400 text-xs font-semibold">{resolvedNaLabel}</span>
        <span className="text-gray-400 text-xs">{resolvedComparisonLabel}</span>
      </>
    );
  }

  if (change === 0) {
    return (
      <>
        <ArrowRight className="w-5 h-5 text-gray-400" />
        <span className="text-gray-400 text-xs font-semibold">0.0%</span>
        <span className="text-gray-400 text-xs">{resolvedComparisonLabel}</span>
      </>
    );
  }

  return (
    <>
      {change >= 0 ? (
        <TrendingUp className="w-5 h-5 text-[#3ea73b]" />
      ) : (
        <TrendingDown className="w-5 h-5 text-[#f65911]" />
      )}
      <span
        className={
          change >= 0 ? 'text-[#3ea73b] text-xs font-semibold' : 'text-[#f65911] text-xs font-semibold'
        }
      >
        {Math.abs(change).toFixed(1)}%
      </span>
      <span className="text-gray-400 text-xs">{resolvedComparisonLabel}</span>
    </>
  );
}

// Shared MetricCard component
export const AnalyticsMetricCard: React.FC<{
  title: string;
  value: string;
  change: number | null;
  icon: React.ReactNode;
  color: string;
  comparisonLabel?: string;
  naLabel?: string;
}> = ({
  title,
  value,
  change,
  icon,
  color,
  comparisonLabel,
  naLabel,
}) => {
  const { tShared } = useAnalyticsTranslations();
  const resolvedComparisonLabel = comparisonLabel ?? tShared('vsLastMonth');
  const resolvedNaLabel = naLabel ?? tShared('na');

  return (
  <div className={`flex flex-col justify-between p-4 rounded-lg bg-white border border-[#e6e6e6] ${color}`}>
    <div className="flex items-center gap-4 border-b border-[#e6e6e6] pb-4">
      <div className="flex items-center justify-center w-12 h-12 rounded-lg bg-white">
        {icon}
      </div>
      <div>
        <div className="text-xs text-gray-500 font-semibold uppercase tracking-wide">{title}</div>
        <div className="text-xl font-bold text-black">{value}</div>
      </div>
    </div>
    <div className="flex items-center gap-2 mt-4 ml-1">
      <MetricChangeFooter change={change} comparisonLabel={resolvedComparisonLabel} naLabel={resolvedNaLabel} />
    </div>
  </div>
  );
};

// Shared Revenue Trend Chart component
export const AnalyticsRevenueTrendChart: React.FC<{
  revenueData: RevenueData[];
  userCurrency: string;
  hasData: boolean;
}> = ({ revenueData, userCurrency, hasData }) => {
  const { tShared, tCharts } = useAnalyticsTranslations();

  return (
  <div className="bg-white rounded-lg border border-[#e6e6e6] p-4">
    <div className="flex items-center justify-between mb-4">
      <h3 className="text-lg font-semibold text-gray-900">{tCharts('revenueTrend')}</h3>
      <div className="flex items-center space-x-4">
        <div className="flex items-center">
          <div className="w-3 h-3 bg-gradient-to-r from-[#3b82f6] to-[#0a61d7] rounded-full mr-2"></div>
          <span className="text-sm text-gray-600 font-medium">{tCharts('orderVolumeLegend')}</span>
        </div>
        <div className="flex items-center">
          <div className="w-3 h-3 bg-gradient-to-r from-emerald-400 to-emerald-600 rounded-full mr-2"></div>
          <span className="text-sm text-gray-600 font-medium">{tCharts('profitLegend')}</span>
        </div>
        <button 
          onClick={() => window.location.href = '/analytics/financial'}
          className="flex items-center px-3 py-1.5 text-xs font-medium text-black bg-white shadow-sm hover:bg-gray-100 rounded-md transition-colors"
        >
          {tShared('seeMore')}
          <ArrowRight className="w-4 h-4 ml-1" />
        </button>
      </div>
    </div>
    
    {hasData && revenueData.length > 0 ? (
      <ResponsiveContainer width="100%" height={320}>
        <AreaChart data={revenueData} margin={{ top: 20, right: 50, left: 25, bottom: 20 }}>
        <defs>
          <linearGradient id="revenueGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#0a61d7" stopOpacity={0.4}/>
            <stop offset="50%" stopColor="#0a61d7" stopOpacity={0.2}/>
            <stop offset="100%" stopColor="#0a61d7" stopOpacity={0.1}/>
          </linearGradient>
          <linearGradient id="profitGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#10B981" stopOpacity={0.4}/>
            <stop offset="50%" stopColor="#10B981" stopOpacity={0.2}/>
            <stop offset="100%" stopColor="#10B981" stopOpacity={0.05}/>
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="2 4" stroke="#000000" strokeOpacity={0.2} horizontal={true} vertical={false} />
        <XAxis 
          dataKey="month"
          axisLine={false}
          tickLine={false}
          tick={{ fontSize: 12, fill: '#6B7280' }}
          tickMargin={10}
        />
        <YAxis 
          axisLine={false}
          tickLine={false}
          tick={{ fontSize: 12, fill: '#6B7280' }}
          tickFormatter={(value) => formatCompactCurrency(value, userCurrency)}
        />
        <Tooltip 
          contentStyle={{
            backgroundColor: 'white',
            border: '1px solid #E5E7EB',
            borderRadius: '8px',
            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
          }}
          formatter={(value: number, name: string) => [
            utilsFormatCurrency(value, userCurrency), 
            name === 'revenue' ? tCharts('orderVolumeLegend') : tCharts('profitLegend')
          ]}
          labelStyle={{ color: '#374151', fontWeight: '600' }}
        />
        <Area 
          type="monotone" 
          dataKey="revenue" 
          stroke="#0a61d7" 
          strokeWidth={2}
          fillOpacity={1} 
          fill="url(#revenueGradient)" 
          dot={{ fill: '#3B82F6', strokeWidth: 2, r: 4, stroke: 'white' }}
          activeDot={{ 
            r: 6, 
            stroke: '#3B82F6', 
            strokeWidth: 3,
            fill: 'white'
          }}
        />
        <Area 
          type="monotone" 
          dataKey="profit" 
          stroke="#10B981" 
          strokeWidth={2}
          fillOpacity={1} 
          fill="url(#profitGradient)" 
          dot={{ 
            fill: '#10B981', 
            strokeWidth: 2, 
            r: 4,
            stroke: 'white'
          }}
          activeDot={{ 
            r: 6, 
            stroke: '#10B981', 
            strokeWidth: 3,
            fill: 'white'
          }}
        />
      </AreaChart>
    </ResponsiveContainer>
  ) : (
    <AnalyticsRevenueTrendChartEmpty />
  )}
</div>
  );
};

// ===== SHARED DATA CALCULATION UTILITIES =====

// Shared function to parse currency strings/numbers to numbers
export const parseCurrencyToNumber = (currencyValue: CurrencyValue): number => {
  if (currencyValue == null) return 0;
  
  if (typeof currencyValue === 'number') {
    return Number.isFinite(currencyValue) ? currencyValue : 0;
  }
  
  // Handle Prisma Decimal type
  if (typeof currencyValue === 'object' && currencyValue !== null) {
    try {
      if (typeof currencyValue.toNumber === 'function') {
        const num = currencyValue.toNumber();
        return Number.isFinite(num) ? num : 0;
      }
      if (typeof currencyValue.toString === 'function') {
        currencyValue = currencyValue.toString();
      } else {
        return 0;
      }
    } catch {
      return 0;
    }
  }
  
  if (typeof currencyValue === 'string') {
    if (!currencyValue || currencyValue === '0' || currencyValue === '0,00') return 0;
    
    // Remove currency symbols and spaces, keep dots and commas for decimal detection
    let cleanString = currencyValue.replace(/[^\d.,-]/g, '').trim();
    
    // Detect decimal separator: use the rightmost of '.' or ',' as decimal separator
    const lastDotIndex = cleanString.lastIndexOf('.');
    const lastCommaIndex = cleanString.lastIndexOf(',');
    
    if (lastDotIndex === -1 && lastCommaIndex === -1) {
      // No separators, just parse as integer
      const parsed = parseFloat(cleanString);
      return Number.isFinite(parsed) ? parsed : 0;
    }
    
    // Determine which is the decimal separator (rightmost)
    const decimalSeparator = lastDotIndex > lastCommaIndex ? '.' : ',';
    const groupingSeparator = decimalSeparator === '.' ? ',' : '.';
    
    // Remove grouping separators (the other character)
    cleanString = cleanString.replace(new RegExp(`\\${groupingSeparator}`, 'g'), '');
    
    // Normalize decimal separator to '.'
    if (decimalSeparator === ',') {
      cleanString = cleanString.replace(/,/g, '.');
    }
    
    const parsed = parseFloat(cleanString);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  
  return 0;
};

// Shared function to format currency - uses proper currencyConfig.ts
export const formatCurrency = (amount: number, currency: string): string => {
  return utilsFormatCurrency(amount, currency);
};

// Helper function to calculate free items from buy-x-get-y promotions (for shared functions)
const calculateFreeItemsForOrderItem = (item: OrderItem): number => {
  if (!item.promotionDetailsSnapshot) return 0;
  
  try {
    const promotionDetails: PromotionDetails = JSON.parse(item.promotionDetailsSnapshot);
    const paidPieces = (item.packageQuantity || 1) * (item.piecesPerPackage || 1);
    const moq = item.moqSnapshot ?? null;
    
    const promotionGift = calculatePromotionGift(promotionDetails, paidPieces, moq);
    return promotionGift?.freeQty || 0;
  } catch {
    // Invalid JSON, no free items
    return 0;
  }
};

type AnalyticsVariantOption = NonNullable<Product['variantOptions']>[number];

const getOrderItemPackageQuantity = (item: OrderItem): number => {
  const quantity = Number(item.packageQuantity ?? 1);
  return Number.isFinite(quantity) && quantity > 0 ? quantity : 1;
};

const getOrderItemPiecesPerPackage = (item: OrderItem): number => {
  const pieces = Number(item.piecesPerPackage ?? 1);
  return Number.isFinite(pieces) && pieces > 0 ? pieces : 1;
};

const getOrderItemPaidPieces = (item: OrderItem): number =>
  getOrderItemPackageQuantity(item) * getOrderItemPiecesPerPackage(item);

const createProductLookup = (products: Product[]): Map<string, Product> =>
  new Map(products.map((product) => [product.productId, product]));

const findOrderItemVariantOption = (
  product: Product | undefined,
  item: OrderItem,
): AnalyticsVariantOption | undefined => {
  const variantOptions = product?.variantOptions ?? [];
  if (variantOptions.length === 0) return undefined;

  const variantId = item.variantOptionId ?? item.variantId;
  if (variantId != null) {
    const matchedById = variantOptions.find((variant) => variant.id === variantId);
    if (matchedById) return matchedById;
  }

  if (item.variantNameSnapshot) {
    const matchedByName = variantOptions.find((variant) => variant.variantName === item.variantNameSnapshot);
    if (matchedByName) return matchedByName;
  }

  return variantOptions.find((variant) => variant.isDefault) ?? variantOptions[0];
};

const calculateOrderItemRevenue = (
  item: OrderItem,
  variantOption?: AnalyticsVariantOption,
): number => {
  const subtotal = parseAmountSafely(item.subtotal);
  if (subtotal > 0) return subtotal;

  const pricePerPackage = parseAmountSafely(item.pricePerPackage);
  if (pricePerPackage > 0) {
    return pricePerPackage * getOrderItemPackageQuantity(item);
  }

  const sellingPrice = parseCurrencyToNumber(variantOption?.sellingPrice || '0');
  return sellingPrice * getOrderItemPaidPieces(item);
};

const calculateOrderItemCost = (
  item: OrderItem,
  product: Product | undefined,
  freePieces: number,
): number => {
  const variantOption = findOrderItemVariantOption(product, item);
  const purchasePrice = parseCurrencyToNumber(variantOption?.purchasePrice || '0');
  if (purchasePrice <= 0) return 0;

  return purchasePrice * (getOrderItemPaidPieces(item) + Math.max(0, freePieces));
};

const getAverageProductMargin = (products: Product[]): number => {
  const margins = products.flatMap((product) =>
    (product.variantOptions ?? [])
      .map((variantOption) => {
        const sellingPrice = parseCurrencyToNumber(variantOption.sellingPrice || '0');
        const purchasePrice = parseCurrencyToNumber(variantOption.purchasePrice || '0');
        return sellingPrice > 0 && purchasePrice > 0
          ? ((sellingPrice - purchasePrice) / sellingPrice) * 100
          : null;
      })
      .filter((margin): margin is number => margin != null),
  );

  return margins.length > 0
    ? margins.reduce((sum, margin) => sum + margin, 0) / margins.length
    : 0;
};

// Shared function to calculate revenue data from orders and products
export const calculateRevenueData = (
  orders: Order[], 
  products: Product[], 
  hasData: boolean,
  timeRange: AnalyticsTimeRange = '1M',
  dateLocale = 'en-US',
): RevenueData[] => {
  if (!hasData || orders.length === 0) {
    return [];
  }

  // Precompute product costs from recorded data only (no estimates)
  const productById = createProductLookup(products);

  const aggregated = new Map<string, { revenue: number; profit: number; orders: number }>();

  orders.forEach(order => {
    const date = getOrderBucketDate(order);
    const key = getAnalyticsBucketKey(date, timeRange);
    const current = aggregated.get(key) ?? { revenue: 0, profit: 0, orders: 0 };
    current.orders += 1;

    const orderAmount = parseAmountSafely(order.totalAmount);

    let orderCogs = 0;
    if (order.orderItems && Array.isArray(order.orderItems)) {
      order.orderItems.forEach(item => {
        const pid = item.productId;
        if (!pid) { return; }
        orderCogs += calculateOrderItemCost(item, productById.get(pid), calculateFreeItemsForOrderItem(item));
      });
    }
    const orderProfit = orderAmount - orderCogs;
    current.revenue += orderAmount;
    current.profit += orderProfit;
    aggregated.set(key, current);
  });

  return getAnalyticsPeriodBuckets(timeRange, { locale: dateLocale }).map((bucket) => {
    const data = aggregated.get(bucket.key) ?? { revenue: 0, profit: 0, orders: 0 };
    return {
      month: bucket.label,
      revenue: data.revenue,
      profit: data.profit,
      orders: data.orders,
    };
  });
};

// Shared function to calculate total revenue from orders and products
export const calculateTotalRevenue = (orders: Order[], _products: Product[]): number => {
  return orders.reduce((sum, order) => sum + parseAmountSafely(order.totalAmount), 0);
};

/** Order volume — sum of order totals when buyers place orders. */
export const calculateOrderVolume = calculateTotalRevenue;

export default FinancialAnalytics;

// ===== Shared Top Products utilities and component =====

function ProductImageThumb({ src, alt, size = 'md' }: { src?: string | null; alt: string; size?: 'sm' | 'md' }) {
  const dim = size === 'sm' ? 'h-8 w-8' : 'h-10 w-10';
  const iconSize = size === 'sm' ? 'h-3.5 w-3.5' : 'h-4 w-4';
  const px = size === 'sm' ? 32 : 40;
  if (src) {
    return (
      <Image
        src={src}
        alt={alt}
        width={px}
        height={px}
        className={`${dim} shrink-0 rounded-lg border border-[#e6e6e6] object-cover`}
      />
    );
  }
  return (
    <div className={`flex ${dim} shrink-0 items-center justify-center rounded-lg border border-[#e6e6e6] bg-[#f7faff]`}>
      <Package className={`${iconSize} text-[#0a61d7]`} />
    </div>
  );
}

function handleTopProductRowKeyDown(
  event: React.KeyboardEvent<HTMLTableRowElement>,
  action: () => void,
) {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    action();
  }
}

export type TopProductRow = {
  name: string;
  productType: string;
  productCategory: string;
  orderVolume: number;
  profit: number;
  margin: number;
  unitsSold: number;
  piecesSold: number;
  productId: string;
  image?: string | null;
};

export const calculateTopProducts = (
  orders: Order[],
  products: Product[],
  hasData: boolean,
  limit: number = 50
): TopProductRow[] => {
  if (!hasData || orders.length === 0) {
    return [];
  }

  const productStats: { [key: string]: { orderVolume: number; unitsSold: number; piecesSold: number; category: string; productCategory: string; name: string; profit: number; image?: string | null } } = {};
  const productById = createProductLookup(products);
  const avgMargin = getAverageProductMargin(products);

  orders.forEach(order => {
    if (order.orderItems && Array.isArray(order.orderItems)) {
      order.orderItems.forEach(item => {
        const pid = item.productId;
        if (!pid) { return; }
        const productId = pid as string;
        if (!productStats[productId]) {
          const product = productById.get(productId);
          const category = product?.productCategory || 'Uncategorized';
            productStats[productId] = {
              orderVolume: 0,
              unitsSold: 0,
              piecesSold: 0,
              category,
              productCategory: product?.productCategory || 'Uncategorized',
              name: product?.name || `Product ${productId}`,
              profit: 0,
              image: product?.images?.[0] ?? null,
            };
        }

        const product = productById.get(productId);
        const itemRevenue = calculateOrderItemRevenue(item, findOrderItemVariantOption(product, item));
        const itemCost = calculateOrderItemCost(item, product, calculateFreeItemsForOrderItem(item));
        const itemProfit = itemCost > 0 ? itemRevenue - itemCost : itemRevenue * (avgMargin / 100);
        productStats[productId].orderVolume += itemRevenue;
        productStats[productId].profit += itemProfit;

        const piecesPerPackage = getOrderItemPiecesPerPackage(item);
        const packageQuantity = getOrderItemPackageQuantity(item);
        productStats[productId].unitsSold += packageQuantity * piecesPerPackage;
        productStats[productId].piecesSold += packageQuantity;
      });
    }
  });

  return Object.entries(productStats).map(([productId, stats]) => {
    const margin = stats.orderVolume > 0 ? (stats.profit / stats.orderVolume) * 100 : 0;
    return {
      name: stats.name,
      orderVolume: stats.orderVolume,
      unitsSold: stats.unitsSold,
      piecesSold: stats.piecesSold,
      margin,
      productType: stats.category,
      productCategory: stats.productCategory,
      profit: stats.profit,
      productId,
      image: stats.image ?? null,
    };
  }).sort((a, b) => b.orderVolume - a.orderVolume).slice(0, limit);
};

export type { TopProductVariantRow } from './TopProductVariantDetailModal';

export const calculateTopProductVariantBreakdown = (
  productId: string,
  orders: Order[],
  products: Product[],
): TopProductVariantRow[] => {
  const productById = createProductLookup(products);
  const product = productById.get(productId);
  const avgMargin = getAverageProductMargin(products);

  const variantStats: Record<
    string,
    { variantName: string; orderVolume: number; piecesSold: number; freeItems: number; profit: number }
  > = {};

  orders.forEach((order) => {
    if (!order.orderItems || !Array.isArray(order.orderItems)) return;

    order.orderItems.forEach((item) => {
      if (item.productId !== productId) return;

      const variantOption = findOrderItemVariantOption(product, item);
      const variantKey = String(
        item.variantOptionId ?? item.variantId ?? item.variantNameSnapshot ?? variantOption?.id ?? 'default',
      );
      const variantName = item.variantNameSnapshot?.trim() || variantOption?.variantName || 'Default';

      if (!variantStats[variantKey]) {
        variantStats[variantKey] = {
          variantName,
          orderVolume: 0,
          piecesSold: 0,
          freeItems: 0,
          profit: 0,
        };
      }

      const freePieces = calculateFreeItemsForOrderItem(item);
      const itemRevenue = calculateOrderItemRevenue(item, variantOption);
      const itemCost = calculateOrderItemCost(item, product, freePieces);
      const itemProfit = itemCost > 0 ? itemRevenue - itemCost : itemRevenue * (avgMargin / 100);

      variantStats[variantKey].orderVolume += itemRevenue;
      variantStats[variantKey].profit += itemProfit;
      variantStats[variantKey].piecesSold += getOrderItemPackageQuantity(item);
      variantStats[variantKey].freeItems += freePieces;

      if (variantName && variantName !== 'Default') {
        variantStats[variantKey].variantName = variantName;
      }
    });
  });

  return Object.entries(variantStats)
    .map(([variantKey, stats]) => ({
      variantKey,
      variantName: stats.variantName,
      piecesSold: stats.piecesSold,
      freeItems: stats.freeItems,
      orderVolume: stats.orderVolume,
      profit: stats.profit,
      margin: stats.orderVolume > 0 ? (stats.profit / stats.orderVolume) * 100 : 0,
    }))
    .sort((a, b) => b.orderVolume - a.orderVolume);
};

export const AnalyticsTopProductsTable: React.FC<{
  products: TopProductRow[];
  userCurrency: string;
  maxRows?: number;
  seeMoreHref?: string;
  orders?: Order[];
  catalogProducts?: Product[];
}> = ({ products, userCurrency, maxRows = 5, seeMoreHref = '/analytics/financial', orders = [], catalogProducts = [] }) => {
  const { tShared, tTables } = useAnalyticsTranslations();
  const [selectedProduct, setSelectedProduct] = useState<TopProductRow | null>(null);

  const selectedVariants = useMemo(() => {
    if (!selectedProduct || orders.length === 0 || catalogProducts.length === 0) return [];
    return calculateTopProductVariantBreakdown(selectedProduct.productId, orders, catalogProducts);
  }, [selectedProduct, orders, catalogProducts]);
  return (
  <>
  <div className="bg-white rounded-lg border border-[#e6e6e6] p-4">
    <div className="flex items-center justify-between mb-6">
      <h3 className="text-lg font-semibold text-gray-900">{tTables('topPerformingProducts')}</h3>
      <button 
        onClick={() => (window.location.href = seeMoreHref)}
        className="flex items-center px-3 py-1.5 text-xs font-medium text-black bg-white shadow-sm hover:bg-gray-100 rounded-md transition-colors"
        aria-label={tShared('seeMoreFinancialAria')}
      >
        {tShared('seeMore')}
        <ArrowRightIcon className="w-4 h-4 ml-1" />
      </button>
    </div>
    <div className="overflow-x-auto rounded-lg">
      <table className="min-w-full text-sm text-left whitespace-nowrap text-xs">
        <thead className="bg-gray-100 text-gray-500 whitespace-nowrap">
          <tr>
            <th className="py-3 px-4 font-medium uppercase text-left">{tTables('rank')}</th>
            <th className="py-3 px-4 font-medium uppercase text-left">{tTables('productName')}</th>
            <th className="py-3 px-4 font-medium uppercase text-center">{tTables('category')}</th>
            <th className="py-3 px-4 font-medium uppercase text-center">{tTables('piecesSold')}</th>
            <th className="py-3 px-4 font-medium uppercase text-center">{tTables('orderVolume')}</th>
            <th className="py-3 px-4 font-medium uppercase text-center">{tTables('margin')}</th>
          </tr>
        </thead>
        <tbody className="bg-white">
          {products.slice(0, maxRows).map((product, index) => (
            <tr
              key={product.productId}
              role="button"
              tabIndex={0}
              className="cursor-pointer border-b transition-colors hover:bg-[#f7faff] focus:outline-none focus:ring-2 focus:ring-inset focus:ring-[#0a61d7]"
              onClick={() => setSelectedProduct(product)}
              onKeyDown={(event) => handleTopProductRowKeyDown(event, () => setSelectedProduct(product))}
              title={tTables('viewVariantDetails', { name: product.name })}
            >
              <td className="py-3 px-4 text-left text-black">{index + 1}</td>
              <td className="py-3 px-4 text-left min-w-0">
                <div className="flex items-center gap-2 min-w-0">
                  <ProductImageThumb src={product.image} alt={product.name} size="sm" />
                  <Link
                    href={`/products/catalog/${product.productId}`}
                    className="truncate font-semibold text-[#0a61d7] transition-all duration-200 hover:text-blue-800"
                    title={tShared('viewProduct', { name: product.name })}
                    onClick={(e) => e.stopPropagation()}
                  >
                    {product.name}
                  </Link>
                </div>
              </td>
              <td className="py-3 px-4 text-center text-gray-600">{product.productCategory}</td>
              <td className="py-3 px-4 text-center text-black">{product.piecesSold.toLocaleString()}</td>
              <td className="py-3 px-4 text-center font-semibold text-black">{utilsFormatCurrency(product.orderVolume, userCurrency)}</td>
              <td className="py-3 px-4 text-center text-black">{product.margin.toFixed(2)}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </div>

  <TopProductVariantDetailModal
    isOpen={selectedProduct != null}
    onCloseAction={() => setSelectedProduct(null)}
    product={selectedProduct}
    variants={selectedVariants}
    userCurrency={userCurrency}
  />
  </>
  );
};
