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
  Package, 
  Truck, 
  Clock, 
  CheckCircle,
  XCircle,
  AlertTriangle,
  Target,
  Users,
  BarChart3,
  ArrowUpRight,
  ArrowDownRight,
  ArrowRight,
  Calendar,
  Filter,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  Zap
} from 'lucide-react';
import { useUserStore } from '@/store/userStore';
import { formatCurrency as utilsFormatCurrency, getDefaultCurrency } from '@/utils/currencyUtils';
import { Order, OrderItem } from '@/types/order';
import { Product } from '@/types/product';
import { fetchGraphQL } from '@/lib/graphqlClient';
import { useAnalyticsTranslations } from '@/hooks/useAnalyticsTranslations';
import { AnalyticsTimeRange, filterOrdersByTimeRange } from '@/utils/analyticsTimeRange';

// Types for operational metrics
interface OperationalMetrics {
  totalOrders: number;
  completedOrders: number;
  pendingOrders: number;
  completionRate: number;
  averageProcessingTime: number;
  onTimeDeliveryRate: number;
  orderAcceptanceRate: number;
  trackingCoverageRate: number;
  lowStockPieces: number;
  stockoutRate: number;
  stockHealthScore: number;
  activeProducts: number;
  dataCompletenessScore: number;
}

interface OrderStatusData {
  status: string;
  count: number;
  percentage: number;
  color: string;
}

interface DeliveryMethodData {
  method: string;
  count: number;
  percentage: number;
}

interface ProcessingTimeData {
  month: string;
  avgProcessingTime: number;
  totalOrders: number;
  completedOrders: number;
}

interface InventoryHealthData {
  category: string;
  totalPieces: number;
  lowStockPieces: number;
  stockoutPieces: number;
  healthScore: number;
}

interface QualityMetric {
  metric: string;
  value: number;
  target: number;
  status: 'good' | 'warning' | 'critical';
}

/** Accepted = any status beyond Pending (Confirmed, Packed, Shipped, Delivered, Cancelled, Failed, etc.). */
function isOrderAcceptedForQuality(status: string): boolean {
  return status !== 'Pending';
}

function getProductStockTotals(product: Product, useVariantOptions: boolean) {
  const variants = useVariantOptions ? product.variantOptions : product.variants;
  const totalStock = variants?.reduce((sum, variant) => sum + (variant.stockQuantity || 0), 0) || 0;
  const totalLowStockThreshold =
    variants?.reduce((sum, variant) => sum + (variant.lowStockThreshold || 0), 0) || 0;
  return { totalStock, totalLowStockThreshold };
}

function isProductStockout(totals: { totalStock: number }): boolean {
  return totals.totalStock === 0;
}

function isProductLowStock(totals: { totalStock: number; totalLowStockThreshold: number }): boolean {
  return totals.totalLowStockThreshold > 0 && totals.totalStock > 0 && totals.totalStock <= totals.totalLowStockThreshold;
}

/** Healthy products = neither out of stock nor at/below low-stock threshold. */
function computeStockHealthScore(products: Product[], useVariantOptions: boolean): number {
  const totalProducts = products.length;
  if (totalProducts === 0) return 0;
  const healthyCount = products.filter((product) => {
    const totals = getProductStockTotals(product, useVariantOptions);
    return !isProductStockout(totals) && !isProductLowStock(totals);
  }).length;
  return (healthyCount / totalProducts) * 100;
}

function countLowStockProducts(products: Product[], useVariantOptions: boolean): number {
  return products.filter((product) => isProductLowStock(getProductStockTotals(product, useVariantOptions))).length;
}

function countOrdersWithTracking(orders: Order[]): number {
  return orders.filter((order) => Boolean(order.trackingNumber?.trim())).length;
}

/** Share of orders that have tracking #, assigned logistics, and POD/confirmation filled. */
function computeDataCompletenessScore(orders: Order[]): number {
  const totalOrders = orders.length;
  if (totalOrders === 0) return 0;
  const ordersWithTracking = countOrdersWithTracking(orders);
  const ordersWithLogistics = orders.filter((order) => Boolean(order.assignedLogistics?.trim())).length;
  const ordersWithPOD = orders.filter(
    (order) => Boolean(order.pod?.trim()) || Boolean(order.deliveryConfirmation?.trim()),
  ).length;
  const actualDataPoints = ordersWithTracking + ordersWithLogistics + ordersWithPOD;
  const maxDataPoints = totalOrders * 3;
  return maxDataPoints > 0 ? (actualDataPoints / maxDataPoints) * 100 : 0;
}

function computeStockoutRate(products: Product[], useVariantOptions: boolean): number {
  const totalProducts = products.length;
  if (totalProducts === 0) return 0;
  const stockoutPieces = products.filter((product) => {
    const variants = useVariantOptions ? product.variantOptions : product.variants;
    const totalStock =
      variants?.reduce((sum, variant) => sum + (variant.stockQuantity || 0), 0) || 0;
    return totalStock === 0;
  }).length;
  return (stockoutPieces / totalProducts) * 100;
}

const OPERATIONAL_ANALYTICS_QUERY = `
  query OperationalAnalyticsData($userId: Int!, $orderLimit: Int!, $productLimit: Int!) {
    orders(userId: $userId, limit: $orderLimit) {
      nodes {
        orderId
        id
        buyerId
        orderDate
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

type OperationalPerformanceAnalyticsProps = {
  timeRange?: AnalyticsTimeRange;
  onReadyAction?: () => void;
};

const OperationalPerformanceAnalytics: React.FC<OperationalPerformanceAnalyticsProps> = ({ timeRange = '1M', onReadyAction }) => {
  const { user } = useUserStore();
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const onReadyRef = useRef(onReadyAction);
  useEffect(() => { onReadyRef.current = onReadyAction; });
  // Metrics are calculated directly via useMemo - no need for state
  const [orders, setOrders] = useState<Order[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [hasData, setHasData] = useState(false);

  const userCurrency = user?.currency || getDefaultCurrency();

  // Restrict orders to the selected time-range window so order-based graphs react to the dropdown
  const filteredOrders = useMemo(() => filterOrdersByTimeRange(orders, timeRange), [orders, timeRange]);
  const hasFilteredData = hasData && filteredOrders.length > 0;
  const {
    tShared,
    tMetrics,
    tCharts,
    tQualityMetrics,
    tInventoryLegend,
    translateOrderStatus,
    translateQualityMetric,
  } = useAnalyticsTranslations();

  // Fetch real data from APIs
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
      }>(OPERATIONAL_ANALYTICS_QUERY, {
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
    } catch {
      setHasData(false);
    } finally {
      setLoading(false);
      onReadyRef.current?.();
    }
  };

  // Calculate operational metrics
  const calculateMetrics = useMemo(() => {
    if (!hasFilteredData || filteredOrders.length === 0) {
      return {
        totalOrders: 0,
        completedOrders: 0,
        pendingOrders: 0,
        completionRate: 0,
        averageProcessingTime: 0,
        onTimeDeliveryRate: 0,
        orderAcceptanceRate: 0,
        trackingCoverageRate: 0,
        lowStockPieces: 0,
        stockoutRate: 0,
        stockHealthScore: 0,
        activeProducts: 0,
        dataCompletenessScore: 0
      };
    }

    const totalOrders = filteredOrders.length;
    const completedOrders = filteredOrders.filter(order => 
      order.orderStatus === 'Delivered' || order.orderStatus === 'Shipped'
    ).length;
    const pendingOrders = filteredOrders.filter(order => 
      order.orderStatus === 'Pending' || order.orderStatus === 'Confirmed'
    ).length;
    
    // Order acceptance rate: any status beyond Pending (Confirmed, Packed, Shipped, Delivered, etc.)
    const acceptedOrders = filteredOrders.filter((order) => isOrderAcceptedForQuality(order.orderStatus)).length;
    const orderAcceptanceRate = totalOrders > 0 ? (acceptedOrders / totalOrders) * 100 : 0;

    // Tracking coverage: orders with a tracking number
    const ordersWithTracking = countOrdersWithTracking(filteredOrders);
    const trackingCoverageRate = totalOrders > 0 ? (ordersWithTracking / totalOrders) * 100 : 0;
    
    // Processing time calculation (acceptedAt - orderDate)
    const ordersWithProcessingTime = filteredOrders.filter(order => 
      order.acceptedAt && order.orderDate
    );
    const totalProcessingTime = ordersWithProcessingTime.reduce((sum, order) => {
      const orderDate = new Date(order.orderDate);
      const acceptedDate = new Date(order.acceptedAt!);
      const diffHours = (acceptedDate.getTime() - orderDate.getTime()) / (1000 * 60 * 60);
      return sum + Math.max(0, diffHours);
    }, 0);
    const averageProcessingTime = ordersWithProcessingTime.length > 0 
      ? totalProcessingTime / ordersWithProcessingTime.length 
      : 0;

    // Inventory metrics
    const totalProducts = products.length;
    const lowStockPieces = countLowStockProducts(products, true);
    const stockoutRate = computeStockoutRate(products, true);
    const stockHealthScore = computeStockHealthScore(products, true);

    const dataCompletenessScore = computeDataCompletenessScore(filteredOrders);

    return {
      totalOrders,
      completedOrders,
      pendingOrders,
      completionRate: totalOrders > 0 ? (completedOrders / totalOrders) * 100 : 0,
      averageProcessingTime,
      onTimeDeliveryRate: 85, // Placeholder - would need delivery dates
      orderAcceptanceRate,
      trackingCoverageRate,
      lowStockPieces,
      stockoutRate,
      stockHealthScore,
      activeProducts: totalProducts,
      dataCompletenessScore
    };
  }, [filteredOrders, products, hasFilteredData]);

  // Calculate order status distribution
  const orderStatusData: OrderStatusData[] = useMemo(() => {
    if (!hasFilteredData || filteredOrders.length === 0) return [];

    const statusCount: { [key: string]: number } = {};
    const statusColors: { [key: string]: string } = {
      'Pending': '#F59E0B',
      'Confirmed': '#3B82F6', 
      'Packed': '#8B5CF6',
      'Shipped': '#10B981',
      'Delivered': '#10B981',
      'Failed': '#EF4444',
      'Cancelled': '#EF4444',
      'Returned': '#6B7280'
    };

    filteredOrders.forEach(order => {
      statusCount[order.orderStatus] = (statusCount[order.orderStatus] || 0) + 1;
    });

    const total = filteredOrders.length;
    return Object.entries(statusCount).map(([status, count]) => ({
      status,
      count,
      percentage: (count / total) * 100,
      color: statusColors[status] || '#6B7280'
    }));
  }, [filteredOrders, hasFilteredData]);

  // Calculate delivery method distribution
  const deliveryMethodData: DeliveryMethodData[] = useMemo(() => {
    if (!hasFilteredData || filteredOrders.length === 0) return [];

    const methodCount: { [key: string]: number } = {};
    filteredOrders.forEach(order => {
      methodCount[order.deliveryMethod] = (methodCount[order.deliveryMethod] || 0) + 1;
    });

    const total = filteredOrders.length;
    return Object.entries(methodCount).map(([method, count]) => ({
      method,
      count,
      percentage: (count / total) * 100
    }));
  }, [filteredOrders, hasFilteredData]);

  // Calculate processing time trends (last 6 months dynamically)
  const processingTimeData: ProcessingTimeData[] = useMemo(() => {
    if (!hasFilteredData || filteredOrders.length === 0) return [];

    const monthlyData: { [key: string]: { label: string; totalTime: number; count: number; totalOrders: number; completed: number } } = {};
    
    filteredOrders.forEach(order => {
      const date = new Date(order.orderDate);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2,'0')}`;
      const label = `${date.toLocaleDateString('en-US', { month: 'short' })} ${date.getFullYear()}`;
      
      if (!monthlyData[key]) {
        monthlyData[key] = { label, totalTime: 0, count: 0, totalOrders: 0, completed: 0 };
      }
      
      monthlyData[key].totalOrders += 1;
      
      if (order.orderStatus === 'Delivered' || order.orderStatus === 'Shipped') {
        monthlyData[key].completed += 1;
      }
      
      if (order.acceptedAt && order.orderDate) {
        const orderDate = new Date(order.orderDate);
        const acceptedDate = new Date(order.acceptedAt);
        const diffHours = (acceptedDate.getTime() - orderDate.getTime()) / (1000 * 60 * 60);
        if (diffHours >= 0) {
          monthlyData[key].totalTime += diffHours;
          monthlyData[key].count += 1;
        }
      }
    });

    const sorted = Object.entries(monthlyData)
      .map(([key, d]) => ({ key, month: d.label, avgProcessingTime: d.count > 0 ? d.totalTime / d.count : 0, totalOrders: d.totalOrders, completedOrders: d.completed }))
      .sort((a, b) => a.key.localeCompare(b.key))
      .slice(-6);
    return sorted;
  }, [filteredOrders, hasFilteredData]);

  // Calculate inventory health by category
  const inventoryHealthData: InventoryHealthData[] = useMemo(() => {
    if (!hasData || products.length === 0) return [];

    const categoryData: { [key: string]: { total: number; lowStock: number; stockout: number } } = {};
    
    products.forEach(product => {
      const category = product.productType || 'Uncategorized';
      if (!categoryData[category]) {
        categoryData[category] = { total: 0, lowStock: 0, stockout: 0 };
      }
      
      categoryData[category].total += 1;
      
      const variantOptionsStock = product.variantOptions?.reduce((sum, variant) => sum + (variant.stockQuantity || 0), 0) || 0;
      const totalStock = variantOptionsStock;
      
      const variantOptionsThreshold = product.variantOptions?.reduce((sum, variant) => sum + (variant.lowStockThreshold || 0), 0) || 0;
      const totalLowStockThreshold = variantOptionsThreshold;
      
      if (totalStock === 0) {
        categoryData[category].stockout += 1;
      } else if (totalLowStockThreshold > 0 && totalStock <= totalLowStockThreshold) {
        categoryData[category].lowStock += 1;
      }
    });

    return Object.entries(categoryData).map(([category, data]) => {
      const healthyStock = data.total - data.lowStock - data.stockout;
      const healthScore = data.total > 0 ? (healthyStock / data.total) * 100 : 0;
      
      return {
        category,
        totalPieces: data.total,
        lowStockPieces: data.lowStock,
        stockoutPieces: data.stockout,
        healthScore
      };
    }).sort((a, b) => b.totalPieces - a.totalPieces);
  }, [products, hasData]);


  // Calculate quality metrics
  const qualityMetrics: QualityMetric[] = useMemo(() => {
    const getStatus = (value: number, target: number): 'good' | 'warning' | 'critical' => {
      if (value >= target) return 'good';
      if (value >= target * 0.8) return 'warning';
      return 'critical';
    };

    return [
      {
        metric: 'Order Acceptance Rate',
        value: calculateMetrics.orderAcceptanceRate,
        target: 95,
        status: getStatus(calculateMetrics.orderAcceptanceRate, 95)
      },
      {
        metric: 'Tracking Coverage',
        value: calculateMetrics.trackingCoverageRate,
        target: 90,
        status: getStatus(calculateMetrics.trackingCoverageRate, 90)
      },
      {
        metric: 'Data Completeness',
        value: calculateMetrics.dataCompletenessScore,
        target: 85,
        status: getStatus(calculateMetrics.dataCompletenessScore, 85)
      },
      {
        metric: 'Stock Health',
        value: calculateMetrics.stockHealthScore,
        target: 95,
        status: getStatus(calculateMetrics.stockHealthScore, 95)
      }
    ];
  }, [calculateMetrics]);

  useEffect(() => {
    fetchData();
  }, [user?.id]); // Added user?.id dependency since fetchData uses it

  // Reusable MetricCard component
  const MetricCard: React.FC<{
    title: string;
    value: string;
    icon: React.ReactNode;
    color: string;
  }> = ({ title, value, icon, color }) => (
    <div className={`flex flex-col justify-between p-4 rounded-lg bg-white border border-[#e6e6e6] ${color}`}>
      <div className="flex items-center gap-4">
        <div className="flex items-center justify-center w-12 h-12 rounded-lg bg-white">
          {icon}
        </div>
        <div>
          <div className="text-xs text-gray-500 font-semibold uppercase tracking-wide">{title}</div>
          <div className="text-xl font-bold text-black">{value}</div>
        </div>
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
          title={tMetrics('orderCompletionRate')}
          value={`${calculateMetrics.completionRate.toFixed(1)}%`}
          icon={<CheckCircle className="w-6 h-6 text-green-500" />}
          color="bg-[#e6f7ec]"
        />
        <MetricCard
          title={tMetrics('avgProcessingTime')}
          value={`${calculateMetrics.averageProcessingTime.toFixed(1)}h`}
          icon={<Clock className="w-6 h-6 text-blue-500" />}
          color="bg-[#f7faff]"
        />
        <MetricCard
          title={tMetrics('trackingCoverage')}
          value={`${calculateMetrics.trackingCoverageRate.toFixed(1)}%`}
          icon={<Truck className="w-6 h-6 text-purple-500" />}
          color="bg-[#f3f4f6]"
        />
        <MetricCard
          title={tMetrics('stockHealth')}
          value={`${calculateMetrics.stockHealthScore.toFixed(1)}%`}
          icon={<Package className="w-6 h-6 text-orange-500" />}
          color="bg-[#fff7ed]"
        />
      </div>

      {/* Charts Grid */}
      <div className="space-y-3">
        {/* First Row - Order Status Distribution + Processing Time Trend */}
        <div className="grid grid-cols-1 lg:grid-cols-11 gap-3">
          <div className="lg:col-span-5 h-full">
            {/* Order Status Distribution */}
            <div className="bg-white rounded-lg border border-[#e6e6e6] p-4 h-full flex flex-col">
              <h3 className="text-lg font-semibold text-black">{tCharts('orderStatusDistribution')}</h3>
              <div className="flex-1 min-h-0 min-h-[280px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                  <defs>
                    {orderStatusData.map((entry, index) => (
                      <linearGradient key={index} id={`statusGradient${index}`} x1="0" y1="0" x2="1" y2="1">
                        <stop offset="0%" stopColor={entry.color} stopOpacity={0.9}/>
                        <stop offset="100%" stopColor={entry.color} stopOpacity={0.7}/>
                      </linearGradient>
                    ))}
                  </defs>
                  <Pie
                    data={orderStatusData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={100}
                    paddingAngle={2}
                    dataKey="count"
                    stroke="white"
                    strokeWidth={2}
                    cornerRadius={6}
                  >
                    {orderStatusData.map((entry, index) => (
                      <Cell 
                        key={`cell-${index}`} 
                        fill={`url(#statusGradient${index})`}
                      />
                    ))}
                  </Pie>
                  <Tooltip 
                    content={({ active, payload }) => {
                      if (!active || !payload || payload.length === 0) return null;
                      const entry = payload[0];
                      const status = (entry as { payload: { status: string; percentage: number; color: string }; value: number })?.payload?.status as string;
                      const count = (entry as { payload: { status: string; percentage: number; color: string }; value: number })?.value as number;
                      const percentage = (entry as { payload: { status: string; percentage: number; color: string }; value: number })?.payload?.percentage as number;
                      const color = (entry as { payload: { status: string; percentage: number; color: string }; value: number })?.payload?.color as string;
                      return (
                        <div className="bg-white rounded-xl border border-[#e6e6e6] p-4">
                          <div className="flex items-center mb-2">
                            <div className="w-3 h-3 rounded-full mr-2" style={{ backgroundColor: color }} />
                            <span className="font-semibold" style={{ color }}>{translateOrderStatus(status)}</span>
                          </div>
                          <div className="text-sm">
                            <span className="font-semibold" style={{ color }}>{count}</span>
                            <span className="text-gray-500"> {tShared('ordersSuffix')} </span>
                            <span className="font-semibold" style={{ color }}>{percentage.toFixed(1)}%</span>
                          </div>
                        </div>
                      );
                    }}
                    cursor={{ fill: '#F1F5F9', fillOpacity: 0.3 }}
                  />
                </PieChart>
              </ResponsiveContainer>
              </div>
              
              {/* Custom Legend */}
              <div className="flex flex-wrap justify-center gap-4 mt-4">
                {orderStatusData.map((entry, index) => (
                  <div key={index} className="flex items-center space-x-2">
                    <div 
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: entry.color }}
                    />
                    <span className="text-sm text-gray-700 font-medium">
                      {translateOrderStatus(entry.status)} ({entry.count})
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
          
          <div className="lg:col-span-6 h-full">
            {/* Processing Time Trend */}
            <div className="bg-white rounded-lg border border-[#e6e6e6] p-4 h-full flex flex-col">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-semibold text-gray-900">{tCharts('processingTimeTrend')}</h3>
                <div className="flex items-center space-x-4">
                  <div className="flex items-center">
                    <div className="w-3 h-3 bg-gradient-to-r from-[#3b82f6] to-[#0a61d7] rounded-full mr-2"></div>
                    <span className="text-sm text-gray-600 font-medium">{tCharts('avgHours')}</span>
                  </div>
                  <div className="flex items-center">
                    <div className="w-3 h-3 bg-gradient-to-r from-emerald-400 to-emerald-600 rounded-full mr-2"></div>
                    <span className="text-sm text-gray-600 font-medium">{tCharts('ordersCountLegend')}</span>
                  </div>
                </div>
              </div>
              <div className="flex-1 min-h-0 min-h-[280px]">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={processingTimeData} margin={{ top: 20, right: 50, left: 50, bottom: 20 }}>
                  <defs>
                    <linearGradient id="processingGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="20%" stopColor="#0a61d7" stopOpacity={0.6}/>
                      <stop offset="100%" stopColor="#0a61d7" stopOpacity={0.4}/>
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
                    yAxisId="time"
                    stroke="#64748B" 
                    fontSize={12}
                    fontWeight={500}
                    tickFormatter={(value) => `${value}h`}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis 
                    yAxisId="orders"
                    orientation="right"
                    stroke="#64748B" 
                    fontSize={12}
                    fontWeight={500}
                    tickLine={false}
                    axisLine={false}
                  />
                  <Tooltip 
                    content={({ active, payload, label }) => {
                      if (!active || !payload) return null;
                      const colors: Record<string, string> = {
                        avgProcessingTime: '#0a61d7',
                        totalOrders: '#10B981'
                      };
                      const labels: Record<string, string> = {
                        avgProcessingTime: tMetrics('avgProcessingTime'),
                        totalOrders: tMetrics('totalOrders')
                      };
                      return (
                        <div className="bg-white rounded-xl border border-[#e6e6e6] p-4">
                          <p className="font-semibold text-gray-900 mb-2">{label}</p>
                          {payload.map((p, idx) => {
                            const key = String(p.dataKey || p.name || '');
                            const color = colors[key] || '#64748B';
                            const isTime = key === 'avgProcessingTime';
                            const value = Number(p.value || 0);
                            return (
                              <div key={idx} className="flex items-center space-x-2 mb-1">
                                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: color }} />
                                <span className="font-medium" style={{ color }}>
                                  {isTime ? `${value.toFixed(1)} ${tShared('hoursSuffix')}` : `${value} ${tShared('ordersSuffix')}`}
                                </span>
                                <span className="text-gray-500 ml-1">{labels[key] || key}</span>
                              </div>
                            );
                          })}
                        </div>
                      );
                    }}
                    cursor={{ fill: '#F1F5F9', fillOpacity: 0.3 }}
                  />
                  <Bar 
                    yAxisId="orders"
                    dataKey="totalOrders" 
                    fill="url(#processingGradient)" 
                    name="totalOrders"
                    radius={[4, 4, 0, 0]}
                    maxBarSize={30}
                  />
                  <Line 
                    yAxisId="time"
                    type="monotone" 
                    dataKey="avgProcessingTime" 
                    stroke="#0a61d7" 
                    strokeWidth={3}
                    name="avgProcessingTime"
                    dot={{ 
                      fill: '#0a61d7', 
                      strokeWidth: 2, 
                      r: 4,
                      stroke: 'white'
                    }}
                    activeDot={{ 
                      r: 6, 
                      stroke: '#3B82F6', 
                      strokeWidth: 3,
                      fill: 'white'
                    }}
                  />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </div>

        {/* Second Row - Inventory Health + Quality Metrics */}
        <div className="grid grid-cols-1 lg:grid-cols-11 gap-3">
          <div className="lg:col-span-6 h-full">
            {/* Inventory Health by Category */}
            <div className="bg-white rounded-lg border border-[#e6e6e6] p-4 h-full flex flex-col">
              <h3 className="text-lg font-semibold text-gray-900 mb-6">{tCharts('inventoryHealthByCategory')}</h3>
              <div className="flex-1 min-h-0">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={inventoryHealthData} margin={{ top: 20, right: 50, left: 50, bottom: 20 }}>
                  <defs>
                    <linearGradient id="healthyGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#10B981" stopOpacity={0.8}/>
                      <stop offset="100%" stopColor="#10B981" stopOpacity={0.6}/>
                    </linearGradient>
                    <linearGradient id="lowStockGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#F59E0B" stopOpacity={0.8}/>
                      <stop offset="100%" stopColor="#F59E0B" stopOpacity={0.6}/>
                    </linearGradient>
                    <linearGradient id="stockoutGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#EF4444" stopOpacity={0.8}/>
                      <stop offset="100%" stopColor="#EF4444" stopOpacity={0.6}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="2 4" stroke="#000000" strokeOpacity={0.2} horizontal={true} vertical={false} />
                  <XAxis 
                    dataKey="category" 
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
                    tickLine={false}
                    axisLine={false}
                  />
                  <Tooltip 
                    content={({ active, payload, label }) => {
                      if (!active || !payload) return null;
                      const colors: Record<string, string> = {
                        healthyPieces: '#10B981',
                        lowStockPieces: '#F59E0B',
                        stockoutPieces: '#EF4444'
                      };
                      const labelsMap: Record<string, string> = {
                        healthyPieces: tInventoryLegend('healthyStock'),
                        lowStockPieces: tInventoryLegend('lowStock'),
                        stockoutPieces: tInventoryLegend('outOfStock')
                      };
                      const displayLabel = label === 'Uncategorized' ? tShared('uncategorized') : String(label);
                      return (
                        <div className="bg-white rounded-xl border border-[#e6e6e6] p-4">
                          <p className="font-semibold text-gray-900 mb-2">{displayLabel}</p>
                          {payload.map((p, idx) => {
                            const key = String(p.name || p.dataKey || '');
                            const color = colors[key] || '#64748B';
                            const display = labelsMap[key] || key;
                            const value = Number(p.value || 0);
                            return (
                              <div key={idx} className="flex items-center space-x-2 mb-1">
                                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: color }} />
                                <span className="font-medium" style={{ color }}>{value} {tShared('piecesSuffix')}</span>
                                <span className="text-gray-500 ml-1">{display}</span>
                              </div>
                            );
                          })}
                        </div>
                      );
                    }}
                    cursor={{ fill: '#F1F5F9', fillOpacity: 0.3 }}
                  />
                  <Bar 
                    dataKey="stockoutPieces" 
                    stackId="a"
                    fill="url(#stockoutGradient)" 
                    name="stockoutPieces"
                    radius={[0, 0, 0, 0]}
                  />
                  <Bar 
                    dataKey="lowStockPieces" 
                    stackId="a"
                    fill="url(#lowStockGradient)" 
                    name="lowStockPieces"
                    radius={[0, 0, 0, 0]}
                  />
                  <Bar 
                    dataKey={(entry) => entry.totalPieces - entry.lowStockPieces - entry.stockoutPieces}
                    stackId="a"
                    fill="url(#healthyGradient)" 
                    name="healthyPieces"
                    radius={[4, 4, 0, 0]}
                  />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              
              {/* Legend */}
              <div className="flex justify-center gap-6 mt-4">
                <div className="flex items-center space-x-2">
                  <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                  <span className="text-sm text-gray-700 font-medium">{tInventoryLegend('healthyStock')}</span>
                </div>
                <div className="flex items-center space-x-2">
                  <div className="w-3 h-3 bg-yellow-500 rounded-full"></div>
                  <span className="text-sm text-gray-700 font-medium">{tInventoryLegend('lowStock')}</span>
                </div>
                <div className="flex items-center space-x-2">
                  <div className="w-3 h-3 bg-red-500 rounded-full"></div>
                  <span className="text-sm text-gray-700 font-medium">{tInventoryLegend('outOfStock')}</span>
                </div>
              </div>
            </div>
          </div>
          
          <div className="lg:col-span-5 h-full">
            {/* Quality Metrics Dashboard */}
            <div className="bg-white rounded-lg border border-[#e6e6e6] p-4 h-full flex flex-col">
              <h3 className="text-lg font-semibold text-gray-900 mb-6">{tCharts('operationalQualityMetrics')}</h3>
              <div className="space-y-4">
                {qualityMetrics.map((metric, index) => (
                  <div key={index} className="p-4 rounded-lg border border-[#e6e6e6] bg-gray-50">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center space-x-2">
                        <div className={`w-3 h-3 rounded-full ${
                          metric.status === 'good' ? 'bg-green-500' :
                          metric.status === 'warning' ? 'bg-yellow-500' : 'bg-red-500'
                        }`}></div>
                        <span className="text-sm font-medium text-gray-900">{translateQualityMetric(metric.metric)}</span>
                      </div>
                      <span className={`text-sm font-semibold ${
                        metric.status === 'good' ? 'text-green-600' :
                        metric.status === 'warning' ? 'text-yellow-600' : 'text-red-600'
                      }`}>
                        {metric.value.toFixed(1)}%
                      </span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div 
                        className={`h-2 rounded-full transition-all duration-300 ${
                          metric.status === 'good' ? 'bg-green-500' :
                          metric.status === 'warning' ? 'bg-yellow-500' : 'bg-red-500'
                        }`}
                        style={{ width: `${Math.min(metric.value, 100)}%` }}
                      ></div>
                    </div>
                    <div className="flex justify-between mt-1">
                      <span className="text-xs text-gray-500">{tShared('currentLabel')}</span>
                      <span className="text-xs text-gray-500">{tShared('targetLabel', { percent: metric.target })}</span>
                    </div>
                  </div>
                ))}
              </div>
              
              {/* Overall Score */}
              <div className="mt-6 p-4 bg-blue-50 rounded-lg border border-blue-200">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <Target className="w-5 h-5 text-blue-600" />
                    <span className="font-semibold text-blue-900">{tQualityMetrics('overallQualityScore')}</span>
                  </div>
                  <span className="text-lg font-bold text-blue-900">
                    {(qualityMetrics.reduce((sum, m) => sum + m.value, 0) / qualityMetrics.length).toFixed(1)}%
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Third Row - Delivery Methods */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
          <div className="lg:col-span-12">
            {/* Delivery Methods Performance */}
            <div className="bg-white rounded-lg border border-[#e6e6e6] p-4">
              <h3 className="text-lg font-semibold text-gray-900 mb-6">{tCharts('deliveryMethodsDistribution')}</h3>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={deliveryMethodData} margin={{ top: 20, right: 50, left: 50, bottom: 20 }}>
                  <defs>
                    <linearGradient id="deliveryGradient" x1="0" y1="0" x2="1" y2="0">
                      <stop offset="0%" stopColor="#3B82F6" stopOpacity={0.8}/>
                      <stop offset="100%" stopColor="#0a61d7" stopOpacity={0.8}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="2 4" stroke="#000000" strokeOpacity={0.2} horizontal={true} vertical={false} />
                  <XAxis 
                    dataKey="method" 
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
                    tickLine={false}
                    axisLine={false}
                  />
                  <Tooltip 
                    content={({ active, payload }) => {
                      if (!active || !payload || payload.length === 0) return null;
                      const p = payload[0];
                      const method = (p as { payload: { method: string; percentage: number }; value: number })?.payload?.method as string;
                      const count = Number(p.value || 0);
                      const percentage = (p as { payload: { method: string; percentage: number }; value: number })?.payload?.percentage as number;
                      const color = '#0a61d7';
                      return (
                        <div className="bg-white rounded-xl border border-[#e6e6e6] p-4">
                          <div className="flex items-center mb-2">
                            <div className="w-3 h-3 rounded-full mr-2" style={{ backgroundColor: color }} />
                            <span className="font-semibold" style={{ color }}>{method}</span>
                          </div>
                          <div className="text-sm">
                            <span className="font-semibold" style={{ color }}>{count}</span>
                            <span className="text-gray-500"> {tShared('ordersSuffix')} </span>
                            <span className="font-semibold" style={{ color }}>{percentage.toFixed(1)}%</span>
                          </div>
                        </div>
                      );
                    }}
                    cursor={{ fill: '#F1F5F9', fillOpacity: 0.3 }}
                  />
                  <Bar 
                    dataKey="count" 
                    fill="url(#deliveryGradient)" 
                    radius={[6, 6, 0, 0]}
                    maxBarSize={80}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default OperationalPerformanceAnalytics;

// ===== Reusable exports for main Analytics page (mirrors FinancialAnalytics pattern) =====

export const OperationalMetricCard: React.FC<{
  title: string;
  value: string;
  change: number | null;
  icon: React.ReactNode;
  color: string;
}> = ({ title, value, change, icon, color }) => {
  const { tShared } = useAnalyticsTranslations();

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
      {(() => {
        if (change === null || change === undefined) {
          return (
            <>
              <ArrowRight className="w-5 h-5 text-gray-400" />
              <span className="text-gray-400 text-xs font-semibold">{tShared('na')}</span>
              <span className="text-gray-400 text-xs">{tShared('vsLastMonth')}</span>
            </>
          );
        }

        if (change === 0) {
          return (
            <>
              <ArrowRight className="w-5 h-5 text-gray-400" />
              <span className="text-gray-400 text-xs font-semibold">0.0%</span>
              <span className="text-gray-400 text-xs">{tShared('vsLastMonth')}</span>
            </>
          );
        }

        const changeValue = change;
        return (
          <>
            {changeValue >= 0 ? (
              <TrendingUp className="w-5 h-5 text-[#3ea73b]" />
            ) : (
              <TrendingDown className="w-5 h-5 text-[#f65911]" />
            )}
            <span className={changeValue >= 0 ? "text-[#3ea73b] text-xs font-semibold" : "text-[#f65911] text-xs font-semibold"}>
              {Math.abs(changeValue).toFixed(1)}%
            </span>
            <span className="text-gray-400 text-xs">{tShared('vsLastMonth')}</span>
          </>
        );
      })()}
    </div>
  </div>
  );
};

export const OrderStatusDistributionChart: React.FC<{
  data: OrderStatusData[];
}> = ({ data }) => {
  const { tShared, tCharts, translateOrderStatus } = useAnalyticsTranslations();

  return (
  <div className="bg-white rounded-lg border border-[#e6e6e6] p-4 h-full flex flex-col">
    <div className="flex items-center justify-between mb-2">
      <h3 className="text-lg font-semibold text-black">{tCharts('orderStatusDistribution')}</h3>
      <button 
        onClick={() => (window.location.href = '/analytics/performance')}
        className="flex items-center px-3 py-1.5 text-xs font-medium text-black bg-white shadow-sm hover:bg-gray-100 rounded-md transition-colors"
        aria-label={tShared('seeMoreOperationalAria')}
      >
        {tShared('seeMore')}
        <ArrowRight className="w-4 h-4 ml-1" />
      </button>
    </div>
    <div className="flex-1 min-h-0 min-h-[280px]">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <defs>
            {data.map((entry, index) => (
              <linearGradient key={index} id={`statusGradientMain${index}`} x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor={entry.color} stopOpacity={0.9}/>
                <stop offset="100%" stopColor={entry.color} stopOpacity={0.7}/>
              </linearGradient>
            ))}
          </defs>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={60}
            outerRadius={100}
            paddingAngle={2}
            dataKey="count"
            stroke="white"
            strokeWidth={2}
            cornerRadius={6}
          >
            {data.map((entry, index) => (
              <Cell key={`cell-main-${index}`} fill={`url(#statusGradientMain${index})`} />
            ))}
          </Pie>
          <Tooltip 
            content={({ active, payload }) => {
              if (!active || !payload || payload.length === 0) return null;
              const entry = payload[0] as { payload: { status: string; percentage: number; color: string }; value: number };
              const status = entry?.payload?.status as string;
              const count = entry?.value as number;
              const percentage = entry?.payload?.percentage as number;
              const color = entry?.payload?.color as string;
              return (
                <div className="bg-white rounded-xl border border-[#e6e6e6] p-4">
                  <div className="flex items-center mb-2">
                    <div className="w-3 h-3 rounded-full mr-2" style={{ backgroundColor: color }} />
                    <span className="font-semibold" style={{ color }}>{translateOrderStatus(status)}</span>
                  </div>
                  <div className="text-sm">
                    <span className="font-semibold" style={{ color }}>{count}</span>
                    <span className="text-gray-500"> {tShared('ordersSuffix')} </span>
                    <span className="font-semibold" style={{ color }}>{percentage.toFixed(1)}%</span>
                  </div>
                </div>
              );
            }}
            cursor={{ fill: '#F1F5F9', fillOpacity: 0.3 }}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
    {/* Legend */}
    <div className="flex flex-wrap justify-center gap-4 mt-4">
      {data.map((entry, index) => (
        <div key={index} className="flex items-center space-x-2">
          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: entry.color }} />
          <span className="text-sm text-gray-700 font-medium">
            {translateOrderStatus(entry.status)} ({entry.count})
          </span>
        </div>
      ))}
    </div>
  </div>
  );
};

export const ProcessingTimeTrendChart: React.FC<{
  data: ProcessingTimeData[];
}> = ({ data }) => {
  const { tShared, tMetrics, tCharts } = useAnalyticsTranslations();

  return (
  <div className="bg-white rounded-lg border border-[#e6e6e6] p-4 h-full flex flex-col">
    <div className="flex items-center justify-between mb-6">
      <h3 className="text-lg font-semibold text-gray-900">{tCharts('processingTimeTrend')}</h3>
      <div className="flex items-center space-x-4">
        <div className="flex items-center">
          <div className="w-3 h-3 bg-gradient-to-r from-[#3b82f6] to-[#0a61d7] rounded-full mr-2"></div>
          <span className="text-sm text-gray-600 font-medium">{tCharts('avgHours')}</span>
        </div>
        <div className="flex items-center">
          <div className="w-3 h-3 bg-gradient-to-r from-emerald-400 to-emerald-600 rounded-full mr-2"></div>
          <span className="text-sm text-gray-600 font-medium">{tCharts('ordersCountLegend')}</span>
        </div>
        <button 
          onClick={() => (window.location.href = '/analytics/performance')}
          className="flex items-center px-3 py-1.5 text-xs font-medium text-black bg-white shadow-sm hover:bg-gray-100 rounded-md transition-colors"
          aria-label={tShared('seeMoreOperationalAria')}
        >
          {tShared('seeMore')}
          <ArrowRight className="w-4 h-4 ml-1" />
        </button>
      </div>
    </div>
    <div className="flex-1 min-h-0 min-h-[280px]">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 20, right: 50, left: 50, bottom: 20 }}>
          <defs>
            <linearGradient id="processingGradientMain" x1="0" y1="0" x2="0" y2="1">
              <stop offset="20%" stopColor="#0a61d7" stopOpacity={0.6}/>
              <stop offset="100%" stopColor="#0a61d7" stopOpacity={0.4}/>
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="2 4" stroke="#000000" strokeOpacity={0.2} horizontal={true} vertical={false} />
          <XAxis dataKey="month" stroke="#64748B" fontSize={12} fontWeight={500} tickLine={false} axisLine={false} />
          <YAxis yAxisId="time" stroke="#64748B" fontSize={12} fontWeight={500} tickFormatter={(v) => `${v}h`} tickLine={false} axisLine={false} />
          <YAxis yAxisId="orders" orientation="right" stroke="#64748B" fontSize={12} fontWeight={500} tickLine={false} axisLine={false} />
          <Tooltip 
            content={({ active, payload, label }) => {
              if (!active || !payload) return null;
              const colors: Record<string, string> = { avgProcessingTime: '#0a61d7', totalOrders: '#10B981' };
              const labels: Record<string, string> = { avgProcessingTime: tMetrics('avgProcessingTime'), totalOrders: tMetrics('totalOrders') };
              return (
                <div className="bg-white rounded-xl border border-[#e6e6e6] p-4">
                  <p className="font-semibold text-gray-900 mb-2">{label}</p>
                  {payload.map((p, idx) => {
                    const key = String(p.dataKey || p.name || '');
                    const color = colors[key] || '#64748B';
                    const isTime = key === 'avgProcessingTime';
                    const value = Number(p.value || 0);
                    return (
                      <div key={idx} className="flex items-center space-x-2 mb-1">
                        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: color }} />
                        <span className="font-medium" style={{ color }}>
                          {isTime ? `${value.toFixed(1)} ${tShared('hoursSuffix')}` : `${value} ${tShared('ordersSuffix')}`}
                        </span>
                        <span className="text-gray-500 ml-1">{labels[key] || key}</span>
                      </div>
                    );
                  })}
                </div>
              );
            }}
            cursor={{ fill: '#F1F5F9', fillOpacity: 0.3 }}
          />
          <Bar yAxisId="orders" dataKey="totalOrders" fill="url(#processingGradientMain)" name="totalOrders" radius={[4, 4, 0, 0]} maxBarSize={30} />
          <Line yAxisId="time" type="monotone" dataKey="avgProcessingTime" stroke="#0a61d7" strokeWidth={3} name="avgProcessingTime" 
            dot={{ fill: '#0a61d7', strokeWidth: 2, r: 4, stroke: 'white' }}
            activeDot={{ r: 6, stroke: '#3B82F6', strokeWidth: 3, fill: 'white' }}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  </div>
  );
};

// ===== Data calculators for the main page =====
export const computeOperationalMetrics = (orders: Order[], products: Product[]): OperationalMetrics => {
  const hasDataLocal = Array.isArray(orders) && orders.length > 0;
  if (!hasDataLocal) {
    return {
      totalOrders: 0,
      completedOrders: 0,
      pendingOrders: 0,
      completionRate: 0,
      averageProcessingTime: 0,
      onTimeDeliveryRate: 0,
      orderAcceptanceRate: 0,
      trackingCoverageRate: 0,
      lowStockPieces: 0,
      stockoutRate: 0,
      stockHealthScore: 0,
      activeProducts: products?.length || 0,
      dataCompletenessScore: 0
    };
  }

  const totalOrders = orders.length;
  const completedOrders = orders.filter(o => o.orderStatus === 'Delivered' || o.orderStatus === 'Shipped').length;
  const pendingOrders = orders.filter(o => o.orderStatus === 'Pending' || o.orderStatus === 'Confirmed').length;
  const acceptedOrders = orders.filter((o) => isOrderAcceptedForQuality(o.orderStatus)).length;
  const orderAcceptanceRate = totalOrders > 0 ? (acceptedOrders / totalOrders) * 100 : 0;
  const ordersWithTracking = countOrdersWithTracking(orders);
  const trackingCoverageRate = totalOrders > 0 ? (ordersWithTracking / totalOrders) * 100 : 0;
  const withProc = orders.filter(o => o.acceptedAt && o.orderDate);
  const totalProc = withProc.reduce((sum, o) => {
    const start = new Date(o.orderDate).getTime();
    const end = new Date(o.acceptedAt as Date).getTime();
    return sum + Math.max(0, (end - start) / (1000 * 60 * 60));
  }, 0);
  const averageProcessingTime = withProc.length > 0 ? totalProc / withProc.length : 0;
  const totalProducts = products?.length || 0;
  const lowStockPieces = countLowStockProducts(products || [], false);
  const stockoutRate = computeStockoutRate(products || [], false);
  const stockHealthScore = computeStockHealthScore(products || [], false);
  const dataCompletenessScore = computeDataCompletenessScore(orders);

  return {
    totalOrders,
    completedOrders,
    pendingOrders,
    completionRate: totalOrders > 0 ? (completedOrders / totalOrders) * 100 : 0,
    averageProcessingTime,
    onTimeDeliveryRate: 85,
    orderAcceptanceRate,
    trackingCoverageRate,
    lowStockPieces,
    stockoutRate,
    stockHealthScore,
    activeProducts: totalProducts,
    dataCompletenessScore
  };
};

export const computeOrderStatusData = (orders: Order[]): OrderStatusData[] => {
  if (!orders?.length) return [];
  const statusColors: { [key: string]: string } = {
    'Pending': '#F59E0B',
    'Confirmed': '#3B82F6',
    'Packed': '#8B5CF6',
    'Shipped': '#10B981',
    'Delivered': '#10B981',
    'Failed': '#EF4444',
    'Cancelled': '#EF4444',
    'Returned': '#6B7280'
  };
  const statusCount: Record<string, number> = {};
  orders.forEach(o => { statusCount[o.orderStatus] = (statusCount[o.orderStatus] || 0) + 1; });
  const total = orders.length;
  return Object.entries(statusCount).map(([status, count]) => ({
    status,
    count,
    percentage: (count / total) * 100,
    color: statusColors[status] || '#6B7280'
  }));
};

export const computeProcessingTimeData = (orders: Order[]): ProcessingTimeData[] => {
  if (!orders?.length) return [];
  const monthly: { [key: string]: { label: string; totalTime: number; count: number; totalOrders: number; completed: number } } = {};
  orders.forEach(order => {
    const d = new Date(order.orderDate);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2,'0')}`;
    const label = `${d.toLocaleDateString('en-US', { month: 'short' })} ${d.getFullYear()}`;
    if (!monthly[key]) monthly[key] = { label, totalTime: 0, count: 0, totalOrders: 0, completed: 0 };
    monthly[key].totalOrders += 1;
    if (order.orderStatus === 'Delivered' || order.orderStatus === 'Shipped') monthly[key].completed += 1;
    if (order.acceptedAt && order.orderDate) {
      const start = new Date(order.orderDate).getTime();
      const end = new Date(order.acceptedAt).getTime();
      const diffH = (end - start) / (1000 * 60 * 60);
      if (diffH >= 0) { monthly[key].totalTime += diffH; monthly[key].count += 1; }
    }
  });
  return Object.entries(monthly)
    .map(([key, v]) => ({ key, month: v.label, avgProcessingTime: v.count > 0 ? v.totalTime / v.count : 0, totalOrders: v.totalOrders, completedOrders: v.completed }))
    .sort((a, b) => a.key.localeCompare(b.key))
    .slice(-6)
    .map(({ month, avgProcessingTime, totalOrders, completedOrders }) => ({ month, avgProcessingTime, totalOrders, completedOrders }));
};
