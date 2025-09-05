'use client';

import React, { useState, useEffect, useMemo } from 'react';
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
  lowStockSKUs: number;
  stockoutRate: number;
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
  totalSKUs: number;
  lowStockSKUs: number;
  stockoutSKUs: number;
  healthScore: number;
}

interface QualityMetric {
  metric: string;
  value: number;
  target: number;
  status: 'good' | 'warning' | 'critical';
}

const OperationalPerformanceAnalytics: React.FC = () => {
  const { user } = useUserStore();
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState('6M');
  const [currentPage, setCurrentPage] = useState(1);
  const [metrics, setMetrics] = useState<OperationalMetrics>({
    totalOrders: 0,
    completedOrders: 0,
    pendingOrders: 0,
    completionRate: 0,
    averageProcessingTime: 0,
    onTimeDeliveryRate: 0,
    orderAcceptanceRate: 0,
    trackingCoverageRate: 0,
    lowStockSKUs: 0,
    stockoutRate: 0,
    activeProducts: 0,
    dataCompletenessScore: 0
  });
  const [orders, setOrders] = useState<Order[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [hasData, setHasData] = useState(false);

  const userCurrency = user?.currency || getDefaultCurrency();

  // Fetch real data from APIs
  const fetchData = async () => {
    try {
      setLoading(true);
      
      let ordersResponse, productsResponse;
      
      if (user?.id) {
        [ordersResponse, productsResponse] = await Promise.all([
          fetch(`/api/orders?userId=${user.id}&limit=1000`),
          fetch(`/api/products?userId=${user.id}&limit=1000`)
        ]);
      } else {
        [ordersResponse, productsResponse] = await Promise.all([
          fetch(`/api/orders?limit=1000`),
          fetch(`/api/products?userId=1&limit=1000`)
        ]);
      }

      if (ordersResponse.ok && productsResponse.ok) {
        const ordersData = await ordersResponse.json();
        const productsData = await productsResponse.json();
        
        const ordersList = ordersData.orders || ordersData || [];
        const productsList = productsData.products || productsData || [];
        
        setOrders(ordersList);
        setProducts(productsList);
        setHasData(ordersList.length > 0);
      } else {
        setHasData(false);
      }
    } catch (error) {
      setHasData(false);
    } finally {
      setLoading(false);
    }
  };

  // Calculate operational metrics
  const calculateMetrics = useMemo(() => {
    if (!hasData || orders.length === 0) {
      return {
        totalOrders: 0,
        completedOrders: 0,
        pendingOrders: 0,
        completionRate: 0,
        averageProcessingTime: 0,
        onTimeDeliveryRate: 0,
        orderAcceptanceRate: 0,
        trackingCoverageRate: 0,
        lowStockSKUs: 0,
        stockoutRate: 0,
        activeProducts: 0,
        dataCompletenessScore: 0
      };
    }

    const totalOrders = orders.length;
    const completedOrders = orders.filter(order => 
      order.orderStatus === 'Delivered' || order.orderStatus === 'Shipped'
    ).length;
    const pendingOrders = orders.filter(order => 
      order.orderStatus === 'Pending' || order.orderStatus === 'Confirmed'
    ).length;
    
    // Order acceptance rate (orders with acceptedBy field)
    const acceptedOrders = orders.filter(order => order.acceptedBy).length;
    const orderAcceptanceRate = totalOrders > 0 ? (acceptedOrders / totalOrders) * 100 : 0;
    
    // Tracking coverage rate (orders with tracking number)
    const ordersWithTracking = orders.filter(order => order.trackingNumber).length;
    const trackingCoverageRate = totalOrders > 0 ? (ordersWithTracking / totalOrders) * 100 : 0;
    
    // Processing time calculation (acceptedAt - orderDate)
    const ordersWithProcessingTime = orders.filter(order => 
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
    const lowStockSKUs = products.filter(product => 
      product.lowStockThreshold && 
      product.stockQuantity <= product.lowStockThreshold
    ).length;
    const stockoutSKUs = products.filter(product => 
      product.stockQuantity === 0 || product.stockStatus === 'Out of Stock'
    ).length;
    const stockoutRate = totalProducts > 0 ? (stockoutSKUs / totalProducts) * 100 : 0;
    
    // Data completeness score
    const ordersWithLogistics = orders.filter(order => order.assignedLogistics).length;
    const ordersWithPOD = orders.filter(order => 
      order.pod || order.deliveryConfirmation
    ).length;
    const dataPoints = [ordersWithTracking, ordersWithLogistics, ordersWithPOD];
    const maxDataPoints = totalOrders * 3; // 3 data points per order
    const actualDataPoints = dataPoints.reduce((sum, count) => sum + count, 0);
    const dataCompletenessScore = maxDataPoints > 0 ? (actualDataPoints / maxDataPoints) * 100 : 0;

    return {
      totalOrders,
      completedOrders,
      pendingOrders,
      completionRate: totalOrders > 0 ? (completedOrders / totalOrders) * 100 : 0,
      averageProcessingTime,
      onTimeDeliveryRate: 85, // Placeholder - would need delivery dates
      orderAcceptanceRate,
      trackingCoverageRate,
      lowStockSKUs,
      stockoutRate,
      activeProducts: totalProducts,
      dataCompletenessScore
    };
  }, [orders, products, hasData]);

  // Calculate order status distribution
  const orderStatusData: OrderStatusData[] = useMemo(() => {
    if (!hasData || orders.length === 0) return [];

    const statusCount: { [key: string]: number } = {};
    const statusColors: { [key: string]: string } = {
      'Pending': '#F59E0B',
      'Confirmed': '#3B82F6', 
      'Packed': '#8B5CF6',
      'Shipped': '#10B981',
      'Delivered': '#10B981',
      'Cancelled': '#EF4444',
      'Returned': '#6B7280'
    };

    orders.forEach(order => {
      statusCount[order.orderStatus] = (statusCount[order.orderStatus] || 0) + 1;
    });

    const total = orders.length;
    return Object.entries(statusCount).map(([status, count]) => ({
      status,
      count,
      percentage: (count / total) * 100,
      color: statusColors[status] || '#6B7280'
    }));
  }, [orders, hasData]);

  // Calculate delivery method distribution
  const deliveryMethodData: DeliveryMethodData[] = useMemo(() => {
    if (!hasData || orders.length === 0) return [];

    const methodCount: { [key: string]: number } = {};
    orders.forEach(order => {
      methodCount[order.deliveryMethod] = (methodCount[order.deliveryMethod] || 0) + 1;
    });

    const total = orders.length;
    return Object.entries(methodCount).map(([method, count]) => ({
      method,
      count,
      percentage: (count / total) * 100
    }));
  }, [orders, hasData]);

  // Calculate processing time trends (last 6 months dynamically)
  const processingTimeData: ProcessingTimeData[] = useMemo(() => {
    if (!hasData || orders.length === 0) return [];

    const monthlyData: { [key: string]: { label: string; totalTime: number; count: number; totalOrders: number; completed: number } } = {};
    
    orders.forEach(order => {
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
  }, [orders, hasData]);

  // Calculate inventory health by category
  const inventoryHealthData: InventoryHealthData[] = useMemo(() => {
    if (!hasData || products.length === 0) return [];

    const categoryData: { [key: string]: { total: number; lowStock: number; stockout: number } } = {};
    
    products.forEach(product => {
      const category = product.category || 'Uncategorized';
      if (!categoryData[category]) {
        categoryData[category] = { total: 0, lowStock: 0, stockout: 0 };
      }
      
      categoryData[category].total += 1;
      
      if (product.stockQuantity === 0 || product.stockStatus === 'Out of Stock') {
        categoryData[category].stockout += 1;
      } else if (product.lowStockThreshold && product.stockQuantity <= product.lowStockThreshold) {
        categoryData[category].lowStock += 1;
      }
    });

    return Object.entries(categoryData).map(([category, data]) => {
      const healthyStock = data.total - data.lowStock - data.stockout;
      const healthScore = data.total > 0 ? (healthyStock / data.total) * 100 : 0;
      
      return {
        category,
        totalSKUs: data.total,
        lowStockSKUs: data.lowStock,
        stockoutSKUs: data.stockout,
        healthScore
      };
    }).sort((a, b) => b.totalSKUs - a.totalSKUs);
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
        value: metrics.orderAcceptanceRate,
        target: 95,
        status: getStatus(metrics.orderAcceptanceRate, 95)
      },
      {
        metric: 'Tracking Coverage',
        value: metrics.trackingCoverageRate,
        target: 90,
        status: getStatus(metrics.trackingCoverageRate, 90)
      },
      {
        metric: 'Data Completeness',
        value: metrics.dataCompletenessScore,
        target: 85,
        status: getStatus(metrics.dataCompletenessScore, 85)
      },
      {
        metric: 'Stock Health',
        value: 100 - metrics.stockoutRate,
        target: 95,
        status: getStatus(100 - metrics.stockoutRate, 95)
      }
    ];
  }, [metrics]);

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    setMetrics(calculateMetrics);
  }, [calculateMetrics]);

  // Reusable MetricCard component
  const MetricCard: React.FC<{
    title: string;
    value: string;
    change: number;
    icon: React.ReactNode;
    color: string;
  }> = ({ title, value, change, icon, color }) => (
    <div className={`flex flex-col justify-between p-4 rounded-lg shadow-sm bg-white border border-[#e6e6e6] ${color}`}>
      <div className="flex items-center gap-4 border-b border-gray-200 pb-4">
        <div className="flex items-center justify-center w-12 h-12 rounded-lg bg-white shadow-sm">
          {icon}
        </div>
        <div>
          <div className="text-xs text-gray-500 font-semibold uppercase tracking-wide">{title}</div>
          <div className="text-xl font-bold text-black">{value}</div>
        </div>
      </div>
      <div className="flex items-center gap-2 mt-4 ml-1">
        {change >= 0 ? (
          <TrendingUp className="w-5 h-5 text-[#3ea73b]" />
        ) : (
          <TrendingDown className="w-5 h-5 text-[#f65911]" />
        )}
        <span className={change >= 0 ? "text-[#3ea73b] text-xs font-semibold" : "text-[#f65911] text-xs font-semibold"}>
          {Math.abs(change)}%
        </span>
        <span className="text-gray-400 text-xs">vs last month</span>
      </div>
    </div>
  );

  if (loading) {
    return (
      <div className="p-6">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 rounded w-1/4 mb-6"></div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-32 bg-gray-200 rounded-xl"></div>
            ))}
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-80 bg-gray-200 rounded-xl"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Show placeholder when no data
  if (!hasData) {
    return (
      <div className="p-6">
        <div className="text-center py-12">
          <div className="w-24 h-24 mx-auto mb-6 bg-gray-100 rounded-full flex items-center justify-center">
            <BarChart3 className="w-12 h-12 text-gray-400" />
          </div>
          <h3 className="text-xl font-semibold text-gray-900 mb-2">No Operational Data Available</h3>
          <p className="text-gray-500 mb-6 max-w-md mx-auto">
            Start by creating orders and managing products to see your operational performance metrics. 
            Order processing, delivery tracking, and inventory insights will appear here once you have data.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <button 
              onClick={() => window.location.href = '/orders'}
              className="px-6 py-3 bg-[#0a61d7] text-white rounded-lg hover:bg-[#084ba6] transition-colors"
            >
              Manage Orders
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          title="Order Completion Rate"
          value={`${metrics.completionRate.toFixed(1)}%`}
          change={5.2}
          icon={<CheckCircle className="w-6 h-6 text-green-500" />}
          color="bg-[#e6f7ec]"
        />
        <MetricCard
          title="Avg Processing Time"
          value={`${metrics.averageProcessingTime.toFixed(1)}h`}
          change={-8.5}
          icon={<Clock className="w-6 h-6 text-blue-500" />}
          color="bg-[#f7faff]"
        />
        <MetricCard
          title="Tracking Coverage"
          value={`${metrics.trackingCoverageRate.toFixed(1)}%`}
          change={12.3}
          icon={<Truck className="w-6 h-6 text-purple-500" />}
          color="bg-[#f3f4f6]"
        />
        <MetricCard
          title="Stock Health"
          value={`${(100 - metrics.stockoutRate).toFixed(1)}%`}
          change={-2.1}
          icon={<Package className="w-6 h-6 text-orange-500" />}
          color="bg-[#fff7ed]"
        />
      </div>

      {/* Charts Grid */}
      <div className="space-y-4">
        {/* First Row - Order Status Distribution + Processing Time Trend */}
        <div className="grid grid-cols-1 lg:grid-cols-11 gap-4">
          <div className="lg:col-span-5 h-full">
            {/* Order Status Distribution */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-4 h-full flex flex-col">
              <h3 className="text-lg font-semibold text-black">Order Status Distribution</h3>
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
                      const status = (entry as any)?.payload?.status as string;
                      const count = (entry as any)?.value as number;
                      const percentage = (entry as any)?.payload?.percentage as number;
                      const color = (entry as any)?.payload?.color as string;
                      return (
                        <div className="bg-white border-none rounded-xl shadow-lg p-4">
                          <div className="flex items-center mb-2">
                            <div className="w-3 h-3 rounded-full mr-2" style={{ backgroundColor: color }} />
                            <span className="font-semibold" style={{ color }}>{status}</span>
                          </div>
                          <div className="text-sm">
                            <span className="font-semibold" style={{ color }}>{count}</span>
                            <span className="text-gray-500"> orders </span>
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
                      {entry.status} ({entry.count})
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
          
          <div className="lg:col-span-6 h-full">
            {/* Processing Time Trend */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-4 h-full flex flex-col">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-semibold text-gray-900">Processing Time Trend</h3>
                <div className="flex items-center space-x-4">
                  <div className="flex items-center">
                    <div className="w-3 h-3 bg-gradient-to-r from-[#3b82f6] to-[#0a61d7] rounded-full mr-2"></div>
                    <span className="text-sm text-gray-600 font-medium">Avg Hours</span>
                  </div>
                  <div className="flex items-center">
                    <div className="w-3 h-3 bg-gradient-to-r from-emerald-400 to-emerald-600 rounded-full mr-2"></div>
                    <span className="text-sm text-gray-600 font-medium">Orders</span>
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
                        avgProcessingTime: 'Avg Processing Time',
                        totalOrders: 'Total Orders'
                      };
                      return (
                        <div className="bg-white border-none rounded-xl shadow-lg p-4">
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
                                  {isTime ? `${value.toFixed(1)} hours` : `${value} orders`}
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
        <div className="grid grid-cols-1 lg:grid-cols-11 gap-4">
          <div className="lg:col-span-6 h-full">
            {/* Inventory Health by Category */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-4 h-full flex flex-col">
              <h3 className="text-lg font-semibold text-gray-900 mb-6">Inventory Health by Category</h3>
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
                        healthySKUs: '#10B981',
                        lowStockSKUs: '#F59E0B',
                        stockoutSKUs: '#EF4444'
                      };
                      const labelsMap: Record<string, string> = {
                        healthySKUs: 'Healthy stock (In-stock)',
                        lowStockSKUs: 'Low Stock',
                        stockoutSKUs: 'Out of Stock'
                      };
                      return (
                        <div className="bg-white border-none rounded-xl shadow-lg p-4">
                          <p className="font-semibold text-gray-900 mb-2">{label}</p>
                          {payload.map((p, idx) => {
                            const key = String(p.name || p.dataKey || '');
                            const color = colors[key] || '#64748B';
                            const display = labelsMap[key] || key;
                            const value = Number(p.value || 0);
                            return (
                              <div key={idx} className="flex items-center space-x-2 mb-1">
                                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: color }} />
                                <span className="font-medium" style={{ color }}>{value} SKUs</span>
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
                    dataKey="stockoutSKUs" 
                    stackId="a"
                    fill="url(#stockoutGradient)" 
                    name="stockoutSKUs"
                    radius={[0, 0, 0, 0]}
                  />
                  <Bar 
                    dataKey="lowStockSKUs" 
                    stackId="a"
                    fill="url(#lowStockGradient)" 
                    name="lowStockSKUs"
                    radius={[0, 0, 0, 0]}
                  />
                  <Bar 
                    dataKey={(entry) => entry.totalSKUs - entry.lowStockSKUs - entry.stockoutSKUs}
                    stackId="a"
                    fill="url(#healthyGradient)" 
                    name="healthySKUs"
                    radius={[4, 4, 0, 0]}
                  />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              
              {/* Legend */}
              <div className="flex justify-center gap-6 mt-4">
                <div className="flex items-center space-x-2">
                  <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                  <span className="text-sm text-gray-700 font-medium">Healthy stock (In-stock)</span>
                </div>
                <div className="flex items-center space-x-2">
                  <div className="w-3 h-3 bg-yellow-500 rounded-full"></div>
                  <span className="text-sm text-gray-700 font-medium">Low Stock</span>
                </div>
                <div className="flex items-center space-x-2">
                  <div className="w-3 h-3 bg-red-500 rounded-full"></div>
                  <span className="text-sm text-gray-700 font-medium">Out of Stock</span>
                </div>
              </div>
            </div>
          </div>
          
          <div className="lg:col-span-5 h-full">
            {/* Quality Metrics Dashboard */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-4 h-full flex flex-col">
              <h3 className="text-lg font-semibold text-gray-900 mb-6">Operational Quality Metrics</h3>
              <div className="space-y-4">
                {qualityMetrics.map((metric, index) => (
                  <div key={index} className="p-4 rounded-lg border border-gray-100 bg-gray-50">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center space-x-2">
                        <div className={`w-3 h-3 rounded-full ${
                          metric.status === 'good' ? 'bg-green-500' :
                          metric.status === 'warning' ? 'bg-yellow-500' : 'bg-red-500'
                        }`}></div>
                        <span className="text-sm font-medium text-gray-900">{metric.metric}</span>
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
                      <span className="text-xs text-gray-500">Current</span>
                      <span className="text-xs text-gray-500">Target: {metric.target}%</span>
                    </div>
                  </div>
                ))}
              </div>
              
              {/* Overall Score */}
              <div className="mt-6 p-4 bg-blue-50 rounded-lg border border-blue-200">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <Target className="w-5 h-5 text-blue-600" />
                    <span className="font-semibold text-blue-900">Overall Quality Score</span>
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
        <div className="grid grid-cols-1 lg:grid-cols-11 gap-4">
          <div className="lg:col-span-12">
            {/* Delivery Methods Performance */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-4">
              <h3 className="text-lg font-semibold text-gray-900 mb-6">Delivery Methods Distribution</h3>
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
                      const method = (p as any)?.payload?.method as string;
                      const count = Number(p.value || 0);
                      const percentage = (p as any)?.payload?.percentage as number;
                      const color = '#0a61d7';
                      return (
                        <div className="bg-white border-none rounded-xl shadow-lg p-4">
                          <div className="flex items-center mb-2">
                            <div className="w-3 h-3 rounded-full mr-2" style={{ backgroundColor: color }} />
                            <span className="font-semibold" style={{ color }}>{method}</span>
                          </div>
                          <div className="text-sm">
                            <span className="font-semibold" style={{ color }}>{count}</span>
                            <span className="text-gray-500"> orders </span>
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
  change: number;
  icon: React.ReactNode;
  color: string;
}> = ({ title, value, change, icon, color }) => (
  <div className={`flex flex-col justify-between p-4 rounded-lg shadow-sm bg-white border border-[#e6e6e6] ${color}`}>
    <div className="flex items-center gap-4 border-b border-gray-200 pb-4">
      <div className="flex items-center justify-center w-12 h-12 rounded-lg bg-white shadow-sm">
        {icon}
      </div>
      <div>
        <div className="text-xs text-gray-500 font-semibold uppercase tracking-wide">{title}</div>
        <div className="text-xl font-bold text-black">{value}</div>
      </div>
    </div>
    <div className="flex items-center gap-2 mt-4 ml-1">
      {change >= 0 ? (
        <TrendingUp className="w-5 h-5 text-[#3ea73b]" />
      ) : (
        <TrendingDown className="w-5 h-5 text-[#f65911]" />
      )}
      <span className={change >= 0 ? "text-[#3ea73b] text-xs font-semibold" : "text-[#f65911] text-xs font-semibold"}>
        {Math.abs(change)}%
      </span>
      <span className="text-gray-400 text-xs">vs last month</span>
    </div>
  </div>
);

export const OrderStatusDistributionChart: React.FC<{
  data: OrderStatusData[];
}> = ({ data }) => (
  <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-4 h-full flex flex-col">
    <div className="flex items-center justify-between mb-2">
      <h3 className="text-lg font-semibold text-black">Order Status Distribution</h3>
      <button 
        onClick={() => (window.location.href = '/analytics/performance')}
        className="flex items-center px-3 py-1.5 text-xs font-medium text-black bg-white shadow-sm hover:bg-gray-100 rounded-md transition-colors"
        aria-label="See more operational performance analytics"
      >
        See More
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
              const entry: any = payload[0];
              const status = entry?.payload?.status as string;
              const count = entry?.value as number;
              const percentage = entry?.payload?.percentage as number;
              const color = entry?.payload?.color as string;
              return (
                <div className="bg-white border-none rounded-xl shadow-lg p-4">
                  <div className="flex items-center mb-2">
                    <div className="w-3 h-3 rounded-full mr-2" style={{ backgroundColor: color }} />
                    <span className="font-semibold" style={{ color }}>{status}</span>
                  </div>
                  <div className="text-sm">
                    <span className="font-semibold" style={{ color }}>{count}</span>
                    <span className="text-gray-500"> orders </span>
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
            {entry.status} ({entry.count})
          </span>
        </div>
      ))}
    </div>
  </div>
);

export const ProcessingTimeTrendChart: React.FC<{
  data: ProcessingTimeData[];
}> = ({ data }) => (
  <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-4 h-full flex flex-col">
    <div className="flex items-center justify-between mb-6">
      <h3 className="text-lg font-semibold text-gray-900">Processing Time Trend</h3>
      <div className="flex items-center space-x-4">
        <div className="flex items-center">
          <div className="w-3 h-3 bg-gradient-to-r from-[#3b82f6] to-[#0a61d7] rounded-full mr-2"></div>
          <span className="text-sm text-gray-600 font-medium">Avg Hours</span>
        </div>
        <div className="flex items-center">
          <div className="w-3 h-3 bg-gradient-to-r from-emerald-400 to-emerald-600 rounded-full mr-2"></div>
          <span className="text-sm text-gray-600 font-medium">Orders</span>
        </div>
        <button 
          onClick={() => (window.location.href = '/analytics/performance')}
          className="flex items-center px-3 py-1.5 text-xs font-medium text-black bg-white shadow-sm hover:bg-gray-100 rounded-md transition-colors"
          aria-label="See more operational performance analytics"
        >
          See More
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
              const labels: Record<string, string> = { avgProcessingTime: 'Avg Processing Time', totalOrders: 'Total Orders' };
              return (
                <div className="bg-white border-none rounded-xl shadow-lg p-4">
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
                          {isTime ? `${value.toFixed(1)} hours` : `${value} orders`}
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
      lowStockSKUs: 0,
      stockoutRate: 0,
      activeProducts: products?.length || 0,
      dataCompletenessScore: 0
    };
  }

  const totalOrders = orders.length;
  const completedOrders = orders.filter(o => o.orderStatus === 'Delivered' || o.orderStatus === 'Shipped').length;
  const pendingOrders = orders.filter(o => o.orderStatus === 'Pending' || o.orderStatus === 'Confirmed').length;
  const acceptedOrders = orders.filter(o => o.acceptedBy).length;
  const orderAcceptanceRate = totalOrders > 0 ? (acceptedOrders / totalOrders) * 100 : 0;
  const ordersWithTracking = orders.filter(o => o.trackingNumber).length;
  const trackingCoverageRate = totalOrders > 0 ? (ordersWithTracking / totalOrders) * 100 : 0;
  const withProc = orders.filter(o => o.acceptedAt && o.orderDate);
  const totalProc = withProc.reduce((sum, o) => {
    const start = new Date(o.orderDate).getTime();
    const end = new Date(o.acceptedAt as Date).getTime();
    return sum + Math.max(0, (end - start) / (1000 * 60 * 60));
  }, 0);
  const averageProcessingTime = withProc.length > 0 ? totalProc / withProc.length : 0;
  const totalProducts = products?.length || 0;
  const lowStockSKUs = (products || []).filter(p => p.lowStockThreshold && p.stockQuantity <= p.lowStockThreshold).length;
  const stockoutSKUs = (products || []).filter(p => p.stockQuantity === 0 || p.stockStatus === 'Out of Stock').length;
  const stockoutRate = totalProducts > 0 ? (stockoutSKUs / totalProducts) * 100 : 0;
  const ordersWithLogistics = orders.filter(o => o.assignedLogistics).length;
  const ordersWithPOD = orders.filter(o => o.pod || o.deliveryConfirmation).length;
  const dataPoints = [ordersWithTracking, ordersWithLogistics, ordersWithPOD];
  const maxData = totalOrders * 3;
  const dataCompletenessScore = maxData > 0 ? (dataPoints.reduce((a, b) => a + b, 0) / maxData) * 100 : 0;

  return {
    totalOrders,
    completedOrders,
    pendingOrders,
    completionRate: totalOrders > 0 ? (completedOrders / totalOrders) * 100 : 0,
    averageProcessingTime,
    onTimeDeliveryRate: 85,
    orderAcceptanceRate,
    trackingCoverageRate,
    lowStockSKUs,
    stockoutRate,
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
