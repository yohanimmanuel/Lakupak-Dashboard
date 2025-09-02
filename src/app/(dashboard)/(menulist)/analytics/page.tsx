'use client';
import { ArrowRight, DollarSign, TrendingUp } from 'lucide-react';
import { useUserStore } from '@/store/userStore';
import { useState, useEffect, useMemo } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

interface Order {
  id: number;
  orderId: string;
  totalAmount: number;
  orderDate: string;
  orderItems: any[];
}

interface Product {
  productId: string;
  name: string;
  sellingPrice: string;
  purchasePrice: string;
  category: string;
}

// Helper function to parse currency strings to numbers
const parseCurrencyToNumber = (currencyString: string): number => {
  if (!currencyString || currencyString === '0' || currencyString === '0,00') return 0;
  
  const cleanString = currencyString
    .replace(/[Rp\s,]/g, '') // Remove Rp, spaces, and commas
    .replace(/\./g, '') // Remove dots (thousand separators)
    .trim();
  const parsed = parseFloat(cleanString);
  return isNaN(parsed) ? 0 : parsed;
};

// Helper function to format currency
const formatCurrency = (amount: number, currency: string): string => {
  if (currency === 'USD') {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  } else if (currency === 'SGD') {
    return new Intl.NumberFormat('en-SG', {
      style: 'currency',
      currency: 'SGD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  } else {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  }
};

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
        <TrendingUp className="w-5 h-5 text-[#f65911]" />
      )}
      <span className={change >= 0 ? "text-[#3ea73b] text-xs font-semibold" : "text-[#f65911] text-xs font-semibold"}>
        {Math.abs(change)}%
      </span>
      <span className="text-gray-400 text-xs">vs last month</span>
    </div>
  </div>
);

export default function AnalyticsPage() {
  const { user } = useUserStore();
  const [orders, setOrders] = useState<Order[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasData, setHasData] = useState(false);

  const userCurrency = user?.currency || 'IDR';

  // Calculate total revenue from orders and products
  const totalRevenue = orders.reduce((sum, order) => {
    if (order.orderItems && Array.isArray(order.orderItems)) {
      return sum + order.orderItems.reduce((itemSum, item) => {
        const product = products.find(p => p.productId === item.productId);
        if (product) {
          const sellingPrice = parseCurrencyToNumber(product.sellingPrice || '0');
          return itemSum + (sellingPrice * item.quantity);
        }
        return itemSum + (item.unitPrice * item.quantity);
      }, 0);
    }
    return sum + order.totalAmount;
  }, 0);

  // Calculate monthly growth (simplified)
  const monthlyGrowth = 12.5; // This would be calculated from historical data

  // Calculate revenue data by month for the chart
  const revenueData = useMemo(() => {
    if (!hasData || orders.length === 0) return [];
    
    const monthlyData: { [key: string]: { revenue: number; profit: number } } = {};
    
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
      const orderDate = new Date(order.orderDate);
      const monthKey = `${orderDate.getFullYear()}-${String(orderDate.getMonth() + 1).padStart(2, '0')}`;
      
      if (order.orderItems && Array.isArray(order.orderItems)) {
        order.orderItems.forEach(item => {
          const product = products.find(p => p.productId === item.productId);
          if (product) {
            const sellingPrice = parseCurrencyToNumber(product.sellingPrice || '0');
            const purchasePrice = parseCurrencyToNumber(product.purchasePrice || '0');
            if (sellingPrice > 0 && purchasePrice > 0) {
              const itemRevenue = sellingPrice * item.quantity;
              const itemCost = purchasePrice * item.quantity;
              const itemProfit = itemRevenue - itemCost;
              if (!monthlyData[monthKey]) monthlyData[monthKey] = { revenue: 0, profit: 0 };
              monthlyData[monthKey].revenue += itemRevenue;
              monthlyData[monthKey].profit += itemProfit;
            } else {
              const revenue = item.unitPrice * item.quantity;
              const avgMargin = Object.values(productMargins).length > 0
                ? Object.values(productMargins).reduce((a, b) => a + b, 0) / Object.values(productMargins).length
                : 30;
              const profit = revenue * (avgMargin / 100);
              if (!monthlyData[monthKey]) monthlyData[monthKey] = { revenue: 0, profit: 0 };
              monthlyData[monthKey].revenue += revenue;
              monthlyData[monthKey].profit += profit;
            }
          } else {
            const revenue = item.unitPrice * item.quantity;
            const avgMargin = Object.values(productMargins).length > 0
              ? Object.values(productMargins).reduce((a, b) => a + b, 0) / Object.values(productMargins).length
              : 30;
            const profit = revenue * (avgMargin / 100);
            if (!monthlyData[monthKey]) monthlyData[monthKey] = { revenue: 0, profit: 0 };
            monthlyData[monthKey].revenue += revenue;
            monthlyData[monthKey].profit += profit;
          }
        });
      } else {
        const revenue = order.totalAmount;
        const avgMargin = Object.values(productMargins).length > 0
          ? Object.values(productMargins).reduce((a, b) => a + b, 0) / Object.values(productMargins).length
          : 30;
        const profit = revenue * (avgMargin / 100);
        if (!monthlyData[monthKey]) monthlyData[monthKey] = { revenue: 0, profit: 0 };
        monthlyData[monthKey].revenue += revenue;
        monthlyData[monthKey].profit += profit;
      }
    });

    return Object.entries(monthlyData)
      .map(([month, data]) => ({
        month: new Date(month + '-01').toLocaleDateString('en-US', { month: 'short', year: 'numeric' }),
        revenue: data.revenue,
        profit: data.profit
      }))
      .sort((a, b) => new Date(a.month).getTime() - new Date(b.month).getTime())
      .slice(-6); // Show last 6 months
  }, [orders, products, hasData]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        
        // Fetch orders
        const ordersResponse = await fetch('/api/orders?userId=1&limit=1000');
        if (ordersResponse.ok) {
          const ordersData = await ordersResponse.json();
          const ordersList = ordersData.orders || [];
          setOrders(ordersList);
          
          // Fetch products
          const productsResponse = await fetch('/api/products?userId=1&limit=1000');
          if (productsResponse.ok) {
            const productsData = await productsResponse.json();
            const productsList = productsData.products || [];
            setProducts(productsList);
            setHasData(ordersList.length > 0);
          } else {
            setHasData(ordersList.length > 0);
          }
        } else {
          setHasData(false);
        }
      } catch (error) {
        setHasData(false);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  if (loading) {
    return (
      <div className="w-full mx-auto p-4 bg-gradient-to-b from-gray-50 to-white min-h-screen">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 rounded w-1/4 mb-2"></div>
          <div className="h-4 bg-gray-200 rounded w-1/2 mb-8"></div>
          <div className="h-32 bg-gray-200 rounded-xl"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full mx-auto p-4 bg-gradient-to-b from-gray-50 to-white min-h-screen">
      {/* Page Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Analytics Dashboard</h1>
        <p className="text-sm text-gray-600">Key insights and performance metrics for your business</p>
      </div>

      {/* Key Financial Metric */}
      <div className="mb-4">
        {hasData ? (
          <MetricCard
            title="Total Revenue"
            value={formatCurrency(totalRevenue, userCurrency)}
            change={monthlyGrowth}
            icon={<DollarSign className="w-6 h-6 text-[#0a61d7]" />}
            color="bg-[#f7faff]"
          />
        ) : (
          <div className="flex flex-col justify-between p-4 rounded-lg shadow bg-white border border-[#e6e6e6] bg-[#f7faff]">
            <div className="flex items-center gap-4 border-b border-gray-200 pb-4">
              <div className="flex items-center justify-center w-12 h-12 rounded-lg bg-white shadow-sm">
                <DollarSign className="w-6 h-6 text-gray-400" />
              </div>
              <div>
                <div className="text-xs text-gray-500 font-semibold uppercase tracking-wide">Total Revenue</div>
                <div className="text-xl font-bold text-gray-500">No data available</div>
              </div>
            </div>
            <div className="flex items-center gap-2 mt-4 ml-1">
              <span className="text-gray-400 text-xs">Start by adding products and orders</span>
            </div>
          </div>
        )}
      </div>

      {/* Revenue Trend Chart */}
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
                  tickFormatter={(value) => formatCurrency(value, userCurrency)}
                />
                <Tooltip 
                  contentStyle={{
                    backgroundColor: 'white',
                    border: '1px solid #E5E7EB',
                    borderRadius: '8px',
                    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
                  }}
                  formatter={(value: number, name: string) => [
                    formatCurrency(value, userCurrency), 
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
                />
                <Area 
                  type="monotone" 
                  dataKey="profit" 
                  stroke="#10B981" 
                  strokeWidth={2}
                  fillOpacity={1} 
                  fill="url(#profitGradient)" 
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
    </div>
  );
}
