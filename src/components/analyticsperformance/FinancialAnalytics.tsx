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
  Calendar,
  Filter,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import { useUserStore } from '@/store/userStore';
import { formatCurrency, getDefaultCurrency } from '@/utils/currencyUtils';

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

  const userCurrency = user?.currency || getDefaultCurrency();

  // Mock data - Replace with actual API calls
  const revenueData: RevenueData[] = useMemo(() => [
    { month: 'Jan', revenue: 45000, profit: 12000, orders: 45 },
    { month: 'Feb', revenue: 52000, profit: 15000, orders: 52 },
    { month: 'Mar', revenue: 48000, profit: 13000, orders: 48 },
    { month: 'Apr', revenue: 61000, profit: 18000, orders: 61 },
    { month: 'May', revenue: 55000, profit: 16000, orders: 55 },
    { month: 'Jun', revenue: 67000, profit: 20000, orders: 67 }
  ], []);

  const categoryData: CategoryData[] = useMemo(() => [
    { category: 'Electronics', revenue: 25000, profit: 8000, percentage: 37 },
    { category: 'Clothing', revenue: 18000, profit: 6000, percentage: 27 },
    { category: 'Home & Garden', revenue: 15000, profit: 4500, percentage: 22 },
    { category: 'Sports', revenue: 9000, profit: 2500, percentage: 14 }
  ], []);

  const allTopProducts: TopProduct[] = useMemo(() => [
    { name: 'Smart Bulb C26', category: 'Electronics', revenue: 5120, profit: 3600, margin: 10.00, unitsSold: 713 },
    { name: 'Rely A13', category: 'Electronics', revenue: 4900, profit: 2940, margin: 9.25, unitsSold: 642 },
    { name: 'Smart Motor', category: 'Electronics', revenue: 3210, profit: 2550, margin: 8.30, unitsSold: 550 },
    { name: 'LED Strip', category: 'Electronics', revenue: 2800, profit: 2160, margin: 7.50, unitsSold: 420 },
    { name: 'Smart Switch', category: 'Electronics', revenue: 2400, profit: 1950, margin: 6.80, unitsSold: 380 },
    { name: 'Smart Thermostat', category: 'Electronics', revenue: 2200, profit: 1800, margin: 6.50, unitsSold: 350 },
    { name: 'WiFi Router', category: 'Electronics', revenue: 2000, profit: 1600, margin: 6.20, unitsSold: 320 },
    { name: 'Security Camera', category: 'Electronics', revenue: 1800, profit: 1400, margin: 5.90, unitsSold: 290 },
    { name: 'Smart Doorbell', category: 'Electronics', revenue: 1600, profit: 1200, margin: 5.60, unitsSold: 260 },
    { name: 'Smart Lock', category: 'Electronics', revenue: 1400, profit: 1000, margin: 5.30, unitsSold: 230 },
    { name: 'Smart Speaker', category: 'Electronics', revenue: 1200, profit: 800, margin: 5.00, unitsSold: 200 },
    { name: 'Smart TV', category: 'Electronics', revenue: 1000, profit: 600, margin: 4.70, unitsSold: 170 },
    { name: 'Smart Watch', category: 'Electronics', revenue: 900, profit: 500, margin: 4.40, unitsSold: 150 },
    { name: 'Smartphone', category: 'Electronics', revenue: 800, profit: 400, margin: 4.10, unitsSold: 130 },
    { name: 'Tablet', category: 'Electronics', revenue: 700, profit: 300, margin: 3.80, unitsSold: 110 },
    { name: 'Laptop', category: 'Electronics', revenue: 600, profit: 200, margin: 3.50, unitsSold: 90 },
    { name: 'Desktop PC', category: 'Electronics', revenue: 500, profit: 150, margin: 3.20, unitsSold: 80 },
    { name: 'Monitor', category: 'Electronics', revenue: 450, profit: 120, margin: 2.90, unitsSold: 70 },
    { name: 'Keyboard', category: 'Electronics', revenue: 400, profit: 100, margin: 2.60, unitsSold: 60 },
    { name: 'Mouse', category: 'Electronics', revenue: 350, profit: 80, margin: 2.30, unitsSold: 50 },
    { name: 'Headphones', category: 'Electronics', revenue: 300, profit: 60, margin: 2.00, unitsSold: 45 },
    { name: 'Webcam', category: 'Electronics', revenue: 250, profit: 50, margin: 1.70, unitsSold: 40 },
    { name: 'Microphone', category: 'Electronics', revenue: 200, profit: 40, margin: 1.40, unitsSold: 35 },
    { name: 'Printer', category: 'Electronics', revenue: 180, profit: 30, margin: 1.10, unitsSold: 30 },
    { name: 'Scanner', category: 'Electronics', revenue: 160, profit: 25, margin: 0.80, unitsSold: 25 },
    { name: 'Projector', category: 'Electronics', revenue: 140, profit: 20, margin: 0.50, unitsSold: 20 },
    { name: 'Smart Scale', category: 'Electronics', revenue: 120, profit: 18, margin: 0.20, unitsSold: 18 },
    { name: 'Fitness Tracker', category: 'Electronics', revenue: 100, profit: 15, margin: 0.10, unitsSold: 15 },
    { name: 'Bluetooth Speaker', category: 'Electronics', revenue: 90, profit: 12, margin: 0.05, unitsSold: 12 },
    { name: 'Power Bank', category: 'Electronics', revenue: 80, profit: 10, margin: 0.02, unitsSold: 10 },
    { name: 'USB Cable', category: 'Electronics', revenue: 70, profit: 8, margin: 0.01, unitsSold: 8 },
    { name: 'Charger', category: 'Electronics', revenue: 60, profit: 6, margin: 0.01, unitsSold: 6 },
    { name: 'Case', category: 'Electronics', revenue: 50, profit: 5, margin: 0.01, unitsSold: 5 },
    { name: 'Screen Protector', category: 'Electronics', revenue: 40, profit: 4, margin: 0.01, unitsSold: 4 },
    { name: 'Stand', category: 'Electronics', revenue: 30, profit: 3, margin: 0.01, unitsSold: 3 },
    { name: 'Mount', category: 'Electronics', revenue: 25, profit: 2, margin: 0.01, unitsSold: 2 },
    { name: 'Adapter', category: 'Electronics', revenue: 20, profit: 1, margin: 0.01, unitsSold: 1 },
    { name: 'Extension Cord', category: 'Electronics', revenue: 18, profit: 1, margin: 0.01, unitsSold: 1 },
    { name: 'Surge Protector', category: 'Electronics', revenue: 15, profit: 1, margin: 0.01, unitsSold: 1 },
    { name: 'Ethernet Cable', category: 'Electronics', revenue: 12, profit: 1, margin: 0.01, unitsSold: 1 },
    { name: 'HDMI Cable', category: 'Electronics', revenue: 10, profit: 1, margin: 0.01, unitsSold: 1 },
    { name: 'Audio Cable', category: 'Electronics', revenue: 8, profit: 1, margin: 0.01, unitsSold: 1 },
    { name: 'Video Cable', category: 'Electronics', revenue: 6, profit: 1, margin: 0.01, unitsSold: 1 },
    { name: 'Network Switch', category: 'Electronics', revenue: 5, profit: 1, margin: 0.01, unitsSold: 1 },
    { name: 'Router Accessory', category: 'Electronics', revenue: 4, profit: 1, margin: 0.01, unitsSold: 1 },
    { name: 'WiFi Extender', category: 'Electronics', revenue: 3, profit: 1, margin: 0.01, unitsSold: 1 },
    { name: 'Smart Plug', category: 'Electronics', revenue: 2, profit: 1, margin: 0.01, unitsSold: 1 },
    { name: 'Smart Hub', category: 'Electronics', revenue: 1, profit: 1, margin: 0.01, unitsSold: 1 }
  ], []);

  // Pagination logic for Top Products
  const productsPerPage = 5;
  const totalProducts = allTopProducts.length;
  const totalPages = Math.max(1, Math.ceil(totalProducts / productsPerPage));
  const pagedProducts = useMemo(() => 
    allTopProducts.slice((currentPage - 1) * productsPerPage, currentPage * productsPerPage), 
    [allTopProducts, currentPage, productsPerPage]
  );
  
  const fromProduct = totalProducts === 0 ? 0 : (currentPage - 1) * productsPerPage + 1;
  const toProduct = Math.min(currentPage * productsPerPage, totalProducts);

  const handlePageChange = (newPage: number) => {
    if (newPage >= 1 && newPage <= totalPages) {
      setCurrentPage(newPage);
    }
  };

  const cashFlowData: CashFlowData[] = useMemo(() => [
    { month: 'Jan', inflows: 45000, outflows: 32000, netFlow: 13000 },
    { month: 'Feb', inflows: 52000, outflows: 38000, netFlow: 14000 },
    { month: 'Mar', inflows: 48000, outflows: 35000, netFlow: 13000 },
    { month: 'Apr', inflows: 61000, outflows: 42000, netFlow: 19000 },
    { month: 'May', inflows: 55000, outflows: 39000, netFlow: 16000 },
    { month: 'Jun', inflows: 67000, outflows: 45000, netFlow: 22000 }
  ], []);

  const COLORS = ['#10B981', '#3B82F6', '#F59E0B', '#EF4444', '#8B5CF6'];

  useEffect(() => {
    const fetchFinancialData = async () => {
      try {
        setLoading(true);
        
        // Calculate metrics from mock data
        const totalRevenue = revenueData.reduce((sum, item) => sum + item.revenue, 0);
        const totalProfit = revenueData.reduce((sum, item) => sum + item.profit, 0);
        const totalOrders = revenueData.reduce((sum, item) => sum + item.orders, 0);
        
        setMetrics({
          totalRevenue,
          totalProfit,
          profitMargin: totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0,
          totalOrders,
          averageOrderValue: totalOrders > 0 ? totalRevenue / totalOrders : 0,
          totalProducts: 156,
          totalBuyers: 89,
          totalSuppliers: 23,
          monthlyGrowth: 12.5,
          orderGrowth: 8.3
        });
      } catch (error) {
        console.error('Error fetching financial data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchFinancialData();
  }, [revenueData]);

  const MetricCard: React.FC<{
    title: string;
    value: string;
    change: number;
    icon: React.ReactNode;
    color: string;
  }> = ({ title, value, change, icon, color }) => (
    <div className={`flex flex-col justify-between p-4 rounded-lg shadow bg-white border border-[#e6e6e6] ${color}`}>
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

  return (
    <div className="space-y-4">

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          title="Total Revenue"
          value={formatCurrency(metrics.totalRevenue, userCurrency)}
          change={metrics.monthlyGrowth}
          icon={<DollarSign className="w-6 h-6 text-[#0a61d7]" />}
          color="bg-[#f7faff]"
        />
        <MetricCard
          title="Total Profit"
          value={formatCurrency(metrics.totalProfit, userCurrency)}
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
          value={formatCurrency(metrics.averageOrderValue, userCurrency)}
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
         <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
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
             <AreaChart data={revenueData} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
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
               <CartesianGrid strokeDasharray="2 4" stroke="#F1F5F9" strokeOpacity={0.6} />
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
                 tickFormatter={(value) => formatCurrency(value, userCurrency)}
                 tickLine={false}
                 axisLine={false}
               />
               <Tooltip 
                 formatter={(value: number, name: string) => [
                   formatCurrency(value, userCurrency), 
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
         <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
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
                 formatter={(value: number, name: string, props: any) => [
                   formatCurrency(value, userCurrency), 
                   `${props.payload.category}`
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
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
           <h3 className="text-lg font-semibold text-gray-900 mb-6">Top Performing Products</h3>
           <div className="overflow-x-auto rounded-lg">
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
                   <tr key={index} className="border-b hover:bg-gray-50 transition-colors">
                     <td className="py-3 px-4 text-left text-black">
                       {(currentPage - 1) * productsPerPage + index + 1}
                     </td>
                                                                 <td className="py-3 px-4 font-semibold text-[#0a61d7] max-w-40 truncate text-left">
                        <span className="cursor-pointer hover:underline transition-all duration-200 hover:text-[#1d4ed8]">
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
                       {formatCurrency(product.revenue, userCurrency)}
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
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
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
             <ComposedChart data={cashFlowData} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
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
               <CartesianGrid strokeDasharray="2 4" stroke="#F1F5F9" strokeOpacity={0.6} />
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
                 tickFormatter={(value) => formatCurrency(value, userCurrency)}
                 tickLine={false}
                 axisLine={false}
               />
               <Tooltip 
                 content={({ active, payload, label }) => {
                   if (active && payload && payload.length) {
                     return (
                       <div className="bg-white border-none rounded-xl shadow-lg p-4">
                         <p className="font-semibold text-gray-900 mb-2">{label}</p>
                         {payload.map((entry: any, index: number) => {
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
                                 {formatCurrency(entry.value, userCurrency)}
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

export default FinancialAnalytics;
