'use client';
import { DollarSign, ShoppingCart } from 'lucide-react';
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
import { CustomerUnitsSoldCard, SalesTrendChart, calculateSalesTrend, calculateSalesMetrics } from '@/components/analyticsperformance/CustomerSalesAnalytics';

export default function AnalyticsPage() {
  const { user } = useUserStore();
  const [orders, setOrders] = useState<Order[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasData, setHasData] = useState(false);

  const userCurrency = user?.currency || 'IDR';

  const totalRevenue = calculateTotalRevenue(orders, products);

  const revenueData = useMemo(() => {
    return calculateRevenueData(orders, products, hasData);
  }, [orders, products, hasData]);

  // Customer Sales metrics reused
  const customerMetrics = useMemo(() => calculateSalesMetrics(orders, products, hasData), [orders, products, hasData]);
  const salesTrend = useMemo(() => calculateSalesTrend(orders, hasData), [orders, hasData]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const ordersResponse = await fetch('/api/orders?userId=1&limit=1000');
        if (ordersResponse.ok) {
          const ordersData = await ordersResponse.json();
          const ordersList = ordersData.orders || [];
          setOrders(ordersList);
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
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Analytics Dashboard</h1>
        <p className="text-sm text-gray-600">Key insights and performance metrics for your business</p>
      </div>

      {/* Row 1: Metric Cards (4 columns) */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <>
            <AnalyticsMetricCard
              title="Total Revenue"
              value={formatCurrency(totalRevenue, userCurrency)}
              change={12.5}
              icon={<DollarSign className="w-6 h-6 text-[#0a61d7]" />}
              color="bg-[#f7faff]"
            />
            <CustomerUnitsSoldCard unitsSold={customerMetrics.totalUnitsSold} />
          </>
      </div>

      {/* Rows 2+: Charts/Tables in two-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div>
          <AnalyticsRevenueTrendChart 
            revenueData={revenueData}
            userCurrency={userCurrency}
            hasData={hasData}
          />
        </div>
        <div>
          <SalesTrendChart data={salesTrend} showSeeMore />
        </div>
      </div>
    </div>
  );
}
