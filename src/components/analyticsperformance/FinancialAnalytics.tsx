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
  ArrowRightIcon
} from 'lucide-react';
import { useUserStore } from '@/store/userStore';
import { formatCurrency as utilsFormatCurrency, getDefaultCurrency } from '@/utils/currencyUtils';
import { Order, OrderItem } from '@/types/order';
import { Product } from '@/types/product';

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
  monthlyGrowth: number;
  orderGrowth: number;
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
  category: string;
  revenue: number;
  profit: number;
  margin: number;
  unitsSold: number;
  productId: string;
}

interface CashFlowData {
  month: string;
  inflows: number;
  outflows: number;
  netFlow: number;
}

const FinancialAnalytics: React.FC = () => {
  const { user } = useUserStore();
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState('6M');
  const [currentPage, setCurrentPage] = useState(1);
  const [metrics, setMetrics] = useState<FinancialMetrics>({
    totalRevenue: 0,
    totalProfit: 0,
    profitMargin: 0,
    totalOrders: 0,
    averageOrderValue: 0,
    totalProducts: 0,
    totalBuyers: 0,
    totalSuppliers: 0,
    monthlyGrowth: 0,
    orderGrowth: 0
  });
  const [orders, setOrders] = useState<Order[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [hasData, setHasData] = useState(false);

  const userCurrency = user?.currency || getDefaultCurrency();

  // Helper function to parse currency strings to numbers
  const parseCurrencyToNumber = (currencyString: string): number => {
    if (!currencyString || currencyString === '0' || currencyString === '0,00') return 0;
    
    // Remove all currency symbols, spaces, and commas, then parse
    const cleanString = currencyString
      .replace(/[^\d.-]/g, '') // Remove all non-numeric characters except dots and dashes
      .replace(/\./g, '') // Remove dots (thousand separators)
      .trim();
    
    const parsed = parseFloat(cleanString);
    return isNaN(parsed) ? 0 : parsed;
  };

  // Fetch real data from APIs - Orders and Products for category data
  const fetchData = async () => {
    try {
      setLoading(true);
      
      // Try to fetch with userId first, then fallback to without userId for existing data
      let ordersResponse, productsResponse;
      
      if (user?.id) {
        [ordersResponse, productsResponse] = await Promise.all([
          fetch(`/api/orders?userId=${user.id}&limit=1000`),
          fetch(`/api/products?userId=${user.id}&limit=1000`)
        ]);
      } else {
        // Fallback: fetch existing data without userId filter
        [ordersResponse, productsResponse] = await Promise.all([
          fetch(`/api/orders?limit=1000`),
          fetch(`/api/products?userId=1&limit=1000`) // Products still need userId
        ]);
      }

      if (ordersResponse.ok && productsResponse.ok) {
        const ordersData = await ordersResponse.json();
        const productsData = await productsResponse.json();
        
        // Handle different response formats
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

  // Calculate real metrics from orders and products data - using actual product margins
  const calculateMetrics = useMemo(() => {
    if (!hasData || orders.length === 0) {
      return {
        totalRevenue: 0,
        totalProfit: 0,
        profitMargin: 0,
        totalOrders: 0,
        averageOrderValue: 0,
        totalProducts: 0,
        totalBuyers: 0,
        totalSuppliers: 0,
        monthlyGrowth: 0,
        orderGrowth: 0
      };
    }

    // Use consistent revenue calculation with Orders module
    const totalRevenue = calculateTotalRevenue(orders, products);

    // Build quick lookup for product purchase prices (as numbers)
    const productCostById: Record<string, number> = {};
    products.forEach(p => {
      const cost = parseCurrencyToNumber(p.purchasePrice || '0');
      if (!isNaN(cost) && cost > 0) {
        productCostById[p.productId] = cost;
      }
    });

    // Compute precise profit based on recorded costs only (no estimates)
    let totalProfit = 0;
    const uniqueProducts = new Set();
    const uniqueBuyers = new Set();

    // Collect unique products and buyers
    orders.forEach(order => {
      if (order.buyerId) {
        uniqueBuyers.add(order.buyerId);
      }
      
      // Compute order-level profit components
      let orderCogs = 0;
      if (order.orderItems && Array.isArray(order.orderItems)) {
        order.orderItems.forEach(item => {
          const pid = item.productId;
          if (!pid) { return; }
          const cost = productCostById[pid];
          // Only include COGS when product exists and purchasePrice > 0
          if (typeof cost === 'number' && cost > 0) {
            orderCogs += cost * item.quantity;
            uniqueProducts.add(pid);
          }
        });
      }

      const shippingExpense = order.deliveryMethod === '3rd-Party Courier' ? (order.shippingFee || 0) : 0;
      const orderRevenue = parseFloat(String(order.totalAmount || 0));
      const orderProfit = orderRevenue - orderCogs - shippingExpense;
      totalProfit += orderProfit;
    });

    const profitMargin = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;
    const totalOrders = orders.length;
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
      monthlyGrowth: 0, // TODO: Calculate from historical data
      orderGrowth: 0    // TODO: Calculate from historical data
    };
  }, [orders, products, hasData, userCurrency]);

  // Calculate real revenue data by month using actual product margins
  const revenueData: RevenueData[] = useMemo(() => {
    return calculateRevenueData(orders, products, hasData);
  }, [orders, products, hasData, userCurrency]);

  // Calculate real category revenue using actual product margins
  const categoryData: CategoryData[] = useMemo(() => {
    if (!hasData || orders.length === 0) {
      return [];
    }

    const categoryStats: { [key: string]: { revenue: number; profit: number } } = {};
    
    // Calculate product margins first
    const productMargins: { [key: string]: number } = {};
    products.forEach(product => {
      const sellingPrice = parseCurrencyToNumber(product.sellingPrice || '0');
      const purchasePrice = parseCurrencyToNumber(product.purchasePrice || '0');
      
      if (sellingPrice > 0 && purchasePrice > 0) {
        const margin = ((sellingPrice - purchasePrice) / sellingPrice) * 100;
        productMargins[product.productId] = margin;
      }
    });
    
    orders.forEach(order => {
      if (order.orderItems && Array.isArray(order.orderItems)) {
        order.orderItems.forEach(item => {
          // Handle missing category field gracefully
          let category = 'Uncategorized';
          
          // First try to get category from order item (if it exists)
          if (item.category) {
            category = item.category;
          } else {
            // Fallback to product data
            const product = products.find(p => p.productId === item.productId);
            if (product?.category) {
              category = product.category;
            }
          }
          
          // Calculate actual revenue and profit using product prices
          const product = products.find(p => p.productId === item.productId);
          
          if (product) {
            const sellingPrice = parseCurrencyToNumber(product.sellingPrice || '0');
            const purchasePrice = parseCurrencyToNumber(product.purchasePrice || '0');
            
            if (sellingPrice > 0 && purchasePrice > 0) {
              const itemRevenue = sellingPrice * item.quantity;
              const itemCost = purchasePrice * item.quantity;
              const itemProfit = itemRevenue - itemCost;
              
              if (!categoryStats[category]) {
                categoryStats[category] = { revenue: 0, profit: 0 };
              }
              categoryStats[category].revenue += itemRevenue;
              categoryStats[category].profit += itemProfit;
            } else {
              // Fallback to item pricing if product prices are invalid
              const revenue = item.unitPrice * item.quantity;
              // Use average margin from other products, otherwise 0%
              const avgMargin = Object.values(productMargins).length > 0 
                ? Object.values(productMargins).reduce((a, b) => a + b, 0) / Object.values(productMargins).length
                : 0;
              const profit = revenue * (avgMargin / 100);
              
              if (!categoryStats[category]) {
                categoryStats[category] = { revenue: 0, profit: 0 };
              }
              categoryStats[category].revenue += revenue;
              categoryStats[category].profit += profit;
            }
          } else {
            // Fallback to item pricing if product not found
            const revenue = item.unitPrice * item.quantity;
            // Use average margin from other products, otherwise 0%
            const avgMargin = Object.values(productMargins).length > 0 
              ? Object.values(productMargins).reduce((a, b) => a + b, 0) / Object.values(productMargins).length
              : 0;
            const profit = revenue * (avgMargin / 100);
            
            if (!categoryStats[category]) {
              categoryStats[category] = { revenue: 0, profit: 0 };
            }
            categoryStats[category].revenue += revenue;
            categoryStats[category].profit += profit;
          }
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
  }, [orders, products, hasData, userCurrency]);

  // Calculate real top products using actual product margins
  const allTopProducts: TopProduct[] = useMemo(() => {
    if (!hasData || orders.length === 0) {
      return [];
    }

    const productStats: { [key: string]: { revenue: number; unitsSold: number; category: string; name: string; profit: number } } = {};
    
    // Calculate product margins first
    const productMargins: { [key: string]: number } = {};
    products.forEach(product => {
      const sellingPrice = parseCurrencyToNumber(product.sellingPrice || '0');
      const purchasePrice = parseCurrencyToNumber(product.purchasePrice || '0');
      
      if (sellingPrice > 0 && purchasePrice > 0) {
        const margin = ((sellingPrice - purchasePrice) / sellingPrice) * 100;
        productMargins[product.productId] = margin;
      }
    });
    
    orders.forEach(order => {
      if (order.orderItems && Array.isArray(order.orderItems)) {
        order.orderItems.forEach(item => {
          const pid = item.productId;
          if (!pid) { return; }
          const productId = pid as string;
          if (!productStats[productId]) {
            // Find the product to get its name and category
            const product = products.find(p => p.productId === productId);
            
            // Handle missing category field gracefully
            let category = 'Uncategorized';
            if (item.category) {
              category = item.category;
            } else if (product?.category) {
              category = product.category;
            }
            
            productStats[productId] = {
              revenue: 0,
              unitsSold: 0,
              category: category,
              name: product?.name || `Product ${productId}`,
              profit: 0
            };
          }
          
          // Calculate actual revenue and profit using product prices
          const product = products.find(p => p.productId === productId);
          
          if (product) {
            const sellingPrice = parseCurrencyToNumber(product.sellingPrice || '0');
            const purchasePrice = parseCurrencyToNumber(product.purchasePrice || '0');
            
            if (sellingPrice > 0 && purchasePrice > 0) {
              const itemRevenue = sellingPrice * item.quantity;
              const itemCost = purchasePrice * item.quantity;
              const itemProfit = itemRevenue - itemCost;
              
              productStats[productId].revenue += itemRevenue;
              productStats[productId].profit += itemProfit;
            } else {
              // Fallback to item pricing if product prices are invalid
              const itemRevenue = item.unitPrice * item.quantity;
              // Use average margin from other products, otherwise 0%
              const avgMargin = Object.values(productMargins).length > 0 
                ? Object.values(productMargins).reduce((a, b) => a + b, 0) / Object.values(productMargins).length
                : 0;
              const itemProfit = itemRevenue * (avgMargin / 100);
              
              productStats[productId].revenue += itemRevenue;
              productStats[productId].profit += itemProfit;
            }
          } else {
            // Fallback to item pricing if product not found
            const itemRevenue = item.unitPrice * item.quantity;
            // Use average margin from other products, otherwise 0%
            const avgMargin = Object.values(productMargins).length > 0 
              ? Object.values(productMargins).reduce((a, b) => a + b, 0) / Object.values(productMargins).length
              : 0;
            const itemProfit = itemRevenue * (avgMargin / 100);
            
            productStats[productId].revenue += itemRevenue;
            productStats[productId].profit += itemProfit;
          }
          
          productStats[productId].unitsSold += item.quantity;
        });
      }
    });

    return Object.entries(productStats).map(([productId, stats]) => {
      const margin = stats.revenue > 0 ? (stats.profit / stats.revenue) * 100 : 0;
      
      return {
        name: stats.name,
        revenue: stats.revenue,
        unitsSold: stats.unitsSold,
        margin,
        category: stats.category,
        profit: stats.profit,
        productId: productId
      };
    }).sort((a, b) => b.revenue - a.revenue).slice(0, 50);
  }, [orders, products, hasData, userCurrency]);

  // Calculate cash flow data: inflows from totalAmount; outflows from COGS (valid purchasePrice only) + shipping (3rd-Party Courier only)
  const cashFlowData: CashFlowData[] = useMemo(() => {
    if (!hasData || orders.length === 0) {
      return [];
    }

    // Precompute product costs
    const productCostById: Record<string, number> = {};
    products.forEach(p => {
      const cost = parseCurrencyToNumber(p.purchasePrice || '0');
      if (!isNaN(cost) && cost > 0) {
        productCostById[p.productId] = cost;
      }
    });

    const monthlyFlow: { [key: string]: { inflows: number; outflows: number; label: string } } = {};
    orders.forEach(order => {
      const date = new Date(order.orderDate);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2,'0')}`;
      const label = date.toLocaleDateString('en-US', { month: 'short' }) + ' ' + date.getFullYear();
      
      if (!monthlyFlow[key]) {
        monthlyFlow[key] = { inflows: 0, outflows: 0, label };
      }
      
      const orderAmount = parseFloat(String(order.totalAmount || 0));
      monthlyFlow[key].inflows += orderAmount;

      // Compute COGS for this order
      let orderCogs = 0;
      if (order.orderItems && Array.isArray(order.orderItems)) {
        order.orderItems.forEach(item => {
          const pid = item.productId;
          if (!pid) { return; }
          const cost = productCostById[pid];
          if (typeof cost === 'number' && cost > 0) {
            orderCogs += cost * item.quantity;
          }
        });
      }
      const shippingExpense = order.deliveryMethod === '3rd-Party Courier' ? (order.shippingFee || 0) : 0;
      monthlyFlow[key].outflows += (orderCogs + shippingExpense);
    });

    const sorted = Object.entries(monthlyFlow)
      .map(([key, flow]) => ({ key, month: flow.label, inflows: flow.inflows, outflows: flow.outflows, netFlow: flow.inflows - flow.outflows }))
      .sort((a, b) => a.key.localeCompare(b.key))
      .slice(-6)
      .map(({ month, inflows, outflows, netFlow }) => ({ month, inflows, outflows, netFlow }));
    return sorted;
  }, [orders, products, hasData, userCurrency]);

  // Pagination logic for Top Products
  const productsPerPage = 5;
  const totalProducts = allTopProducts.length;
  const totalPages = Math.max(1, Math.ceil(totalProducts / productsPerPage));
  const fromProduct = totalProducts === 0 ? 0 : (currentPage - 1) * productsPerPage + 1;
  const toProduct = Math.min(currentPage * productsPerPage, totalProducts);
  const pagedProducts = allTopProducts.slice((currentPage - 1) * productsPerPage, currentPage * productsPerPage);

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
  };

  const COLORS = ['#10B981', '#3B82F6', '#F59E0B', '#EF4444', '#8B5CF6'];

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    setMetrics(calculateMetrics);
  }, [calculateMetrics]);

  // Reusable MetricCard component for both Analytics pages
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
            <DollarSign className="w-12 h-12 text-gray-400" />
          </div>
          <h3 className="text-xl font-semibold text-gray-900 mb-2">No Financial Data Available</h3>
          <p className="text-gray-500 mb-6 max-w-md mx-auto">
            Start by adding products and tracking orders to see your financial analytics. 
            Your revenue, profit, and performance metrics will appear here once you have data.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <button 
              onClick={() => window.location.href = '/products'}
              className="px-6 py-3 bg-[#0a61d7] text-white rounded-lg hover:bg-[#084ba6] transition-colors"
            >
              Add Products
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
          title="Total Revenue"
          value={utilsFormatCurrency(metrics.totalRevenue, userCurrency)}
          change={metrics.monthlyGrowth}
          icon={<DollarSign className="w-6 h-6 text-[#0a61d7]" />}
          color="bg-[#f7faff]"
        />
        <MetricCard
          title="Total Profit"
          value={utilsFormatCurrency(metrics.totalProfit, userCurrency)}
          change={15.2}
          icon={<TrendingUp className="w-6 h-6 text-green-500" />}
          color="bg-[#e6f7ec]"
        />
        <MetricCard
          title="Profit Margin"
          value={`${metrics.profitMargin.toFixed(1)}%`}
          change={2.1}
          icon={<TrendingUp className="w-6 h-6 text-yellow-500" />}
          color="bg-[#f7faff]"
        />
        <MetricCard
          title="Average Order Value"
          value={utilsFormatCurrency(metrics.averageOrderValue, userCurrency)}
          change={-1.8}
          icon={<ShoppingCart className="w-6 h-6 text-gray-500" />}
          color="bg-[#e6e6e6]"
        />
      </div>

             {/* Charts Grid */}
       <div className="space-y-4">
         {/* Second Row - Revenue Trend (smaller) + Revenue by Category (larger) */}
         <div className="grid grid-cols-1 lg:grid-cols-11 gap-4">
           <div className="lg:col-span-5">
                 {/* Revenue Trend */}
         <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-4">
           <div className="flex items-center justify-between mb-6">
             <h3 className="text-lg font-semibold text-gray-900">Revenue Trend</h3>
             <div className="flex items-center space-x-4">
               <div className="flex items-center">
                 <div className="w-3 h-3 bg-gradient-to-r from-[#3b82f6] to-[#0a61d7] rounded-full mr-2"></div>
                 <span className="text-sm text-gray-600 font-medium">Revenue</span>
               </div>
               <div className="flex items-center">
                 <div className="w-3 h-3 bg-gradient-to-r from-emerald-400 to-emerald-600 rounded-full mr-2"></div>
                 <span className="text-sm text-gray-600 font-medium">Profit</span>
               </div>
             </div>
           </div>
           <ResponsiveContainer width="100%" height={320}>
             <AreaChart data={revenueData} margin={{ top: 20, right: 50, left: 50, bottom: 20 }}>
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
               />
               <YAxis 
                 stroke="#64748B" 
                 fontSize={12}
                 fontWeight={500}
                 tickFormatter={(value) => utilsFormatCurrency(value, userCurrency)}
                 tickLine={false}
                 axisLine={false}
               />
               <Tooltip 
                 formatter={(value: number, name: string) => [
                   utilsFormatCurrency(value, userCurrency), 
                   name === 'revenue' ? 'Revenue' : 'Profit'
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
           </div>
           <div className="lg:col-span-6">
         {/* Revenue by Category */}
         <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-4">
           <h3 className="text-lg font-semibold text-gray-900 mb-6">Revenue by Category</h3>
           <ResponsiveContainer width="100%" height={284}>
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

         {/* Third Row - Top Products (larger) + Cash Flow Trend (smaller) */}
         <div className="grid grid-cols-1 lg:grid-cols-11 gap-4">
           <div className="lg:col-span-6">
                  {/* Top Products */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-4 h-full flex flex-col">
           <h3 className="text-lg font-semibold text-gray-900 mb-6">Top Performing Products</h3>
           <div className="flex-1 overflow-x-auto rounded-lg">
             <table className="min-w-full text-sm text-left whitespace-nowrap text-xs">
                               <thead className="bg-gray-100 text-gray-500 whitespace-nowrap">
                  <tr>
                    <th className="py-3 px-4 font-medium uppercase text-left">Rank</th>
                    <th className="py-3 px-4 font-medium uppercase text-left">Product Name</th>
                    <th className="py-3 px-4 font-medium uppercase text-center">Category</th>
                    <th className="py-3 px-4 font-medium uppercase text-center">Units Sold</th>
                    <th className="py-3 px-4 font-medium uppercase text-center">Revenue</th>
                    <th className="py-3 px-4 font-medium uppercase text-center">CR</th>
                  </tr>
                </thead>
               <tbody className="bg-white">
                 {pagedProducts.map((product, index) => (
                   <tr key={index} className="border-b transition-colors">
                     <td className="py-3 px-4 text-left text-black">
                       {(currentPage - 1) * productsPerPage + index + 1}
                     </td>
                                                 <td className="py-3 px-4 font-semibold text-[#0a61d7] max-w-40 truncate text-left">
                         <span 
                           className="cursor-pointer transition-all duration-200 hover:text-blue-800"
                           onClick={() => window.location.href = `/products/catalog/${product.productId}`}
                           title="Click to view product details"
                         >
                            {product.name}
                          </span>
                      </td>
                      <td className="py-3 px-4 text-center text-gray-600">
                        {product.category}
                      </td>
                      <td className="py-3 px-4 text-center text-black">
                        {product.unitsSold.toLocaleString()}
                      </td>
                     <td className="py-3 px-4 text-center font-semibold text-black">
                       {utilsFormatCurrency(product.revenue, userCurrency)}
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
               Showing {fromProduct} to {toProduct} of {totalProducts} products
             </div>
             {/* Right: Pagination Controls */}
             <div className="flex items-center gap-3">
               <button
                 className="p-2 rounded-lg hover:bg-gray-100 disabled:opacity-50 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
                 onClick={() => handlePageChange(currentPage - 1)}
                 disabled={currentPage === 1}
                 aria-label="Previous page"
               >
                 <ChevronLeft className="w-4 h-4 text-gray-500" />
               </button>
               <button
                 className="px-3 py-2 rounded-lg font-semibold text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 bg-[#0a61d7] text-white"
                 aria-label={`Page ${currentPage}`}
                 aria-current="page"
               >
                 {currentPage}
               </button>
               <button
                 className="p-2 rounded-lg hover:bg-gray-100 disabled:opacity-50 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
                 onClick={() => handlePageChange(currentPage + 1)}
                 disabled={currentPage === totalPages}
                 aria-label="Next page"
               >
                 <ChevronRight className="w-4 h-4 text-gray-500" />
               </button>
             </div>
           </div>
          </div>
           </div>
           <div className="lg:col-span-5">
                  {/* Cash Flow Trend */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-4">
           <div className="flex items-center justify-between mb-4">
             <h3 className="text-lg font-semibold text-gray-900">Cash Flow Trend</h3>
             <div className="flex items-center space-x-4">
               <div className="flex items-center">
                 <div className="w-3 h-3 bg-gradient-to-r from-emerald-400 to-emerald-600 rounded-full mr-1"></div>
                 <span className="text-sm text-gray-600 font-medium">Cash In</span>
               </div>
               <div className="flex items-center">
                 <div className="w-3 h-3 bg-gradient-to-r from-red-400 to-red-600 rounded-full mr-1"></div>
                 <span className="text-sm text-gray-600 font-medium">Cash Out</span>
               </div>
               <div className="flex items-center">
                 <div className="w-3 h-3 bg-gradient-to-r from-[#3b82f6] to-[#0a61d7] rounded-full mr-1"></div>
                 <span className="text-sm text-gray-600 font-medium">Net Flow</span>
               </div>
             </div>
           </div>
           <ResponsiveContainer width="100%" height={312}>
             <ComposedChart data={cashFlowData} margin={{ top: 20, right: 50, left: 50, bottom: 20 }}>
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
                 tickFormatter={(value) => utilsFormatCurrency(value, userCurrency)}
                 tickLine={false}
                 axisLine={false}
               />
               <Tooltip 
                 content={({ active, payload, label }: { active?: boolean; payload?: Array<{ dataKey?: string; value?: number }>; label?: string | number }) => {
                   if (active && payload && payload.length) {
                     return (
                       <div className="bg-white border-none rounded-xl shadow-lg p-4">
                         <p className="font-semibold text-gray-900 mb-2">{label}</p>
                         {payload.map((entry, index) => {
                           let dotColor = '#64748B';
                           let labelText = '';
                           
                           if (entry.dataKey === 'inflows') {
                             dotColor = '#059669';
                             labelText = 'Cash In';
                           } else if (entry.dataKey === 'outflows') {
                             dotColor = '#DC2626';
                             labelText = 'Cash Out';
                           } else if (entry.dataKey === 'netFlow') {
                             dotColor = '#0a61d7';
                             labelText = 'Net Flow';
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
                 name="Cash In"
                 radius={[6, 6, 0, 0]}
                 maxBarSize={40}
               />
               <Bar 
                 dataKey="outflows" 
                 fill="url(#outflowGradient)" 
                 name="Cash Out"
                 radius={[6, 6, 0, 0]}
                 maxBarSize={40}
               />
               <Line 
                 type="monotone" 
                 dataKey="netFlow" 
                 stroke="url(#netFlowGradient)" 
                 strokeWidth={4}
                 name="Net Flow"
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
         </div>
       </div>
     </div>
   );
 };

// ===== REUSABLE COMPONENTS FOR ANALYTICS PAGES =====

// Shared MetricCard component
export const AnalyticsMetricCard: React.FC<{
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

// Shared Revenue Trend Chart component
export const AnalyticsRevenueTrendChart: React.FC<{
  revenueData: RevenueData[];
  userCurrency: string;
  hasData: boolean;
}> = ({ revenueData, userCurrency, hasData }) => (
  <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-4">
    <div className="flex items-center justify-between mb-4">
      <h3 className="text-lg font-semibold text-gray-900">Revenue Trend</h3>
      <div className="flex items-center space-x-4">
        <div className="flex items-center">
          <div className="w-3 h-3 bg-gradient-to-r from-[#3b82f6] to-[#0a61d7] rounded-full mr-2"></div>
          <span className="text-sm text-gray-600 font-medium">Revenue</span>
        </div>
        <div className="flex items-center">
          <div className="w-3 h-3 bg-gradient-to-r from-emerald-400 to-emerald-600 rounded-full mr-2"></div>
          <span className="text-sm text-gray-600 font-medium">Profit</span>
        </div>
        <button 
          onClick={() => window.location.href = '/analytics/financial'}
          className="flex items-center px-3 py-1.5 text-xs font-medium text-black bg-white shadow-sm hover:bg-gray-100 rounded-md transition-colors"
        >
          See More
          <ArrowRight className="w-4 h-4 ml-1" />
        </button>
      </div>
    </div>
    
    {hasData && revenueData.length > 0 ? (
      <ResponsiveContainer width="100%" height={320}>
        <AreaChart data={revenueData} margin={{ top: 20, right: 50, left: 60, bottom: 20 }}>
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
            tickFormatter={(value) => utilsFormatCurrency(value, userCurrency)}
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
              name === 'revenue' ? 'Revenue' : 'Profit'
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
            dot={{ 
              fill: '#3B82F6', 
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
      <div className="h-80 flex items-center justify-center">
        <div className="text-center">
          <TrendingUp className="w-12 h-12 text-gray-300 mx-auto mb-2" />
          <p className="text-gray-500 text-sm">No revenue data available</p>
          <p className="text-gray-400 text-xs">Create orders to see revenue trends</p>
        </div>
      </div>
    )}
  </div>
);

// ===== SHARED DATA CALCULATION UTILITIES =====

// Shared function to parse currency strings to numbers
export const parseCurrencyToNumber = (currencyString: string): number => {
  if (!currencyString || currencyString === '0' || currencyString === '0,00') return 0;
  
  // Remove currency symbols, spaces, and commas, then parse
  const cleanString = currencyString
    .replace(/[^\d.-]/g, '') // Remove all non-numeric characters except dots and dashes
    .replace(/\./g, '') // Remove dots (thousand separators)
    .trim();
  
  const parsed = parseFloat(cleanString);
  return isNaN(parsed) ? 0 : parsed;
};

// Shared function to format currency - uses proper currencyConfig.ts
export const formatCurrency = (amount: number, currency: string): string => {
  return utilsFormatCurrency(amount, currency);
};

// Shared function to calculate revenue data from orders and products
export const calculateRevenueData = (
  orders: Order[], 
  products: Product[], 
  hasData: boolean
): RevenueData[] => {
  if (!hasData || orders.length === 0) {
    return [];
  }

  // Precompute product costs from recorded data only (no estimates)
  const productCostById: Record<string, number> = {};
  products.forEach(p => {
    const cost = parseCurrencyToNumber(p.purchasePrice || '0');
    if (!isNaN(cost) && cost > 0) {
      productCostById[p.productId] = cost;
    }
  });

  const monthlyData: { [key: string]: { revenue: number; profit: number; orders: number; label: string } } = {};
  
  orders.forEach(order => {
    const date = new Date(order.orderDate);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2,'0')}`;
    const label = date.toLocaleDateString('en-US', { month: 'short' }) + ' ' + date.getFullYear();
    
    if (!monthlyData[key]) {
      monthlyData[key] = { revenue: 0, profit: 0, orders: 0, label };
    }
    
    monthlyData[key].orders += 1;
    
    // Use order totals to match Orders module
    const orderAmount = parseFloat(String(order.totalAmount || 0));
    monthlyData[key].revenue += orderAmount;

    // Compute actual profit = revenue - COGS - shipping(if 3rd-party)
    let orderCogs = 0;
    if (order.orderItems && Array.isArray(order.orderItems)) {
      order.orderItems.forEach(item => {
        const pid = item.productId;
        if (!pid) { return; }
        const cost = productCostById[pid];
        if (typeof cost === 'number' && cost > 0) {
          orderCogs += cost * item.quantity;
        }
      });
    }
    const shippingExpense = order.deliveryMethod === '3rd-Party Courier' ? (order.shippingFee || 0) : 0;
    const orderProfit = orderAmount - orderCogs - shippingExpense;
    monthlyData[key].profit += orderProfit;
  });

  const sorted = Object.entries(monthlyData)
    .map(([key, data]) => ({ month: data.label, revenue: data.revenue, profit: data.profit, orders: data.orders, key }))
    .sort((a, b) => a.key.localeCompare(b.key))
    .slice(-6)
    .map(({ month, revenue, profit, orders }) => ({ month, revenue, profit, orders }));
  return sorted;
};

// Shared function to calculate total revenue from orders and products
export const calculateTotalRevenue = (orders: Order[], _products: Product[]): number => {
  // Match Orders module: sum full order totals (includes shipping, taxes, discounts)
  return orders.reduce((sum, order) => sum + parseFloat(String(order.totalAmount || 0)), 0);
};

export default FinancialAnalytics;

// ===== Shared Top Products utilities and component =====

export type TopProductRow = {
  name: string;
  category: string;
  revenue: number;
  profit: number;
  margin: number;
  unitsSold: number;
  productId: string;
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

  const productStats: { [key: string]: { revenue: number; unitsSold: number; category: string; name: string; profit: number } } = {};

  const productMargins: { [key: string]: number } = {};
  products.forEach(product => {
    const sellingPrice = parseCurrencyToNumber(product.sellingPrice || '0');
    const purchasePrice = parseCurrencyToNumber(product.purchasePrice || '0');
    if (sellingPrice > 0 && purchasePrice > 0) {
      const margin = ((sellingPrice - purchasePrice) / sellingPrice) * 100;
      productMargins[product.productId] = margin;
    }
  });

  orders.forEach(order => {
    if (order.orderItems && Array.isArray(order.orderItems)) {
      order.orderItems.forEach(item => {
        const pid = item.productId;
        if (!pid) { return; }
        const productId = pid as string;
        const product = products.find(p => p.productId === productId);
        if (!product) { return; }
        if (!productStats[productId]) {
          const category = item.category || product?.category || 'Uncategorized';
          productStats[productId] = {
            revenue: 0,
            unitsSold: 0,
            category,
            name: product?.name || `Product ${productId}`,
            profit: 0
          };
        }

        if (product) {
          const sellingPrice = parseCurrencyToNumber(product.sellingPrice || '0');
          const purchasePrice = parseCurrencyToNumber(product.purchasePrice || '0');
          if (sellingPrice > 0 && purchasePrice > 0) {
            const itemRevenue = sellingPrice * item.quantity;
            const itemCost = purchasePrice * item.quantity;
            const itemProfit = itemRevenue - itemCost;
            productStats[productId].revenue += itemRevenue;
            productStats[productId].profit += itemProfit;
          } else {
            const itemRevenue = item.unitPrice * item.quantity;
            const avgMargin = Object.values(productMargins).length > 0 
              ? Object.values(productMargins).reduce((a, b) => a + b, 0) / Object.values(productMargins).length
              : 0;
            const itemProfit = itemRevenue * (avgMargin / 100);
            productStats[productId].revenue += itemRevenue;
            productStats[productId].profit += itemProfit;
          }
        } else {
          const itemRevenue = item.unitPrice * item.quantity;
          const avgMargin = Object.values(productMargins).length > 0 
            ? Object.values(productMargins).reduce((a, b) => a + b, 0) / Object.values(productMargins).length
            : 0;
          const itemProfit = itemRevenue * (avgMargin / 100);
          productStats[productId].revenue += itemRevenue;
          productStats[productId].profit += itemProfit;
        }

        productStats[productId].unitsSold += item.quantity;
      });
    }
  });

  return Object.entries(productStats).map(([productId, stats]) => {
    const margin = stats.revenue > 0 ? (stats.profit / stats.revenue) * 100 : 0;
    return {
      name: stats.name,
      revenue: stats.revenue,
      unitsSold: stats.unitsSold,
      margin,
      category: stats.category,
      profit: stats.profit,
      productId
    };
  }).sort((a, b) => b.revenue - a.revenue).slice(0, limit);
};

export const AnalyticsTopProductsTable: React.FC<{
  products: TopProductRow[];
  userCurrency: string;
  maxRows?: number;
  seeMoreHref?: string;
}> = ({ products, userCurrency, maxRows = 5, seeMoreHref = '/analytics/financial' }) => (
  <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-4">
    <div className="flex items-center justify-between mb-6">
      <h3 className="text-lg font-semibold text-gray-900">Top Performing Products</h3>
      <button 
        onClick={() => (window.location.href = seeMoreHref)}
        className="flex items-center px-3 py-1.5 text-xs font-medium text-black bg-white shadow-sm hover:bg-gray-100 rounded-md transition-colors"
        aria-label="See more financial analytics"
      >
        See More
        <ArrowRightIcon className="w-4 h-4 ml-1" />
      </button>
    </div>
    <div className="overflow-x-auto rounded-lg">
      <table className="min-w-full text-sm text-left whitespace-nowrap text-xs">
        <thead className="bg-gray-100 text-gray-500 whitespace-nowrap">
          <tr>
            <th className="py-3 px-4 font-medium uppercase text-left">Rank</th>
            <th className="py-3 px-4 font-medium uppercase text-left">Product Name</th>
            <th className="py-3 px-4 font-medium uppercase text-center">Category</th>
            <th className="py-3 px-4 font-medium uppercase text-center">Units Sold</th>
            <th className="py-3 px-4 font-medium uppercase text-center">Revenue</th>
            <th className="py-3 px-4 font-medium uppercase text-center">Margin</th>
          </tr>
        </thead>
        <tbody className="bg-white">
          {products.slice(0, maxRows).map((product, index) => (
            <tr key={product.productId} className="border-b transition-colors">
              <td className="py-3 px-4 text-left text-black">{index + 1}</td>
              <td className="py-3 px-4 font-semibold text-[#0a61d7] max-w-40 truncate text-left">
                <span 
                  className="cursor-pointer transition-all duration-200 hover:text-blue-800"
                  onClick={() => window.location.href = `/products/catalog/${product.productId}`}
                  title="Click to view product details"
                >
                  {product.name}
                </span>
              </td>
              <td className="py-3 px-4 text-center text-gray-600">{product.category}</td>
              <td className="py-3 px-4 text-center text-black">{product.unitsSold.toLocaleString()}</td>
              <td className="py-3 px-4 text-center font-semibold text-black">{formatCurrency(product.revenue, userCurrency)}</td>
              <td className="py-3 px-4 text-center text-black">{product.margin.toFixed(2)}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </div>
);
