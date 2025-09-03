'use client';
import { DollarSign } from 'lucide-react';
import { useUserStore } from '@/store/userStore';
import { useState, useEffect, useMemo } from 'react';
import { 
  AnalyticsMetricCard, 
  AnalyticsRevenueTrendChart,
  calculateRevenueData,
  calculateTotalRevenue,
  formatCurrency,
  parseCurrencyToNumber
} from '@/components/analyticsperformance/FinancialAnalytics';
import { Order } from '@/types/order';
import { Product } from '@/types/product';



export default function AnalyticsPage() {
  const { user } = useUserStore();
  const [orders, setOrders] = useState<Order[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasData, setHasData] = useState(false);

  const userCurrency = user?.currency || 'IDR';

  // Calculate total revenue using shared function
  const totalRevenue = calculateTotalRevenue(orders, products);

  // Calculate monthly growth (simplified)
  const monthlyGrowth = 12.5; // This would be calculated from historical data

  // Calculate revenue data using shared function
  const revenueData = useMemo(() => {
    return calculateRevenueData(orders, products, hasData);
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
          <AnalyticsMetricCard
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
      <AnalyticsRevenueTrendChart 
        revenueData={revenueData}
        userCurrency={userCurrency}
        hasData={hasData}
      />
    </div>
  );
}
