'use client';
import FinancialAnalytics from '@/components/analyticsperformance/FinancialAnalytics';
import { Calendar, ChevronDown, Download, DollarSign } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';
import { useUserStore } from '@/store/userStore';
import { fetchGraphQL } from '@/lib/graphqlClient';
import { Order } from '@/types/order';
import { Product } from '@/types/product';

const FINANCIAL_ANALYTICS_PAGE_QUERY = `
  query FinancialAnalyticsPageData($userId: Int!, $orderLimit: Int!, $productLimit: Int!) {
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
        legacyVariants
        variants: variantDefinitions
      }
    }
  }
`;

export default function FinancialAnalyticsPage() {
  const { user } = useUserStore();
  const [timeRange, setTimeRange] = useState('1M');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [hasData, setHasData] = useState(false);

  const timeRanges = [
    { value: '1M', label: 'Last Month' },
    { value: '3M', label: 'Last 3 Months' },
    { value: '6M', label: 'Last 6 Months' },
    { value: '1Y', label: 'Last Year' }
  ];

  const currentRange = timeRanges.find(range => range.value === timeRange);

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

  // Fetch data to check if we have data
  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        if (!user?.id) {
          setHasData(false);
          return;
        }
        const data = await fetchGraphQL<{
          orders: { nodes: Order[] };
          products: {
            nodes: Array<
              Product & {
                variants?: Product['variants'];
                legacyVariants?: Product['legacyVariants'];
              }
            >;
          };
        }>(FINANCIAL_ANALYTICS_PAGE_QUERY, {
          userId: user.id,
          orderLimit: 1000,
          productLimit: 1000,
        });

        const ordersList = data.orders?.nodes ?? [];
        setHasData(ordersList.length > 0);
      } catch (error) {
        setHasData(false);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [user?.id]);

  // Export function to download financial data as Word document
  const handleExport = async () => {
    try {
      // Get user ID from Zustand store - NO FALLBACK
      if (!user?.id) {
        alert('Please log in to export data.');
        return;
      }

      const userId = user.id;

      // GraphQL queries to fetch orders and products
      const ORDERS_QUERY = `
        query GetOrders($userId: Int!, $limit: Int!) {
          orders(userId: $userId, limit: $limit) {
            nodes {
              id
              orderId
              buyerId
              orderDate
              totalAmount
              orderItems {
                productId
                packageQuantity
                pricePerPackage
                piecesPerPackage
                packageType
                productTypeSnapshot
              }
            }
          }
        }
      `;

      type OrdersQueryResult = {
        orders: {
          nodes: Array<{
            id: number;
            orderId: string;
            buyerId?: string | null;
            orderDate: string;
            totalAmount?: number | null;
            orderItems?: Array<{
              productId: string;
              packageQuantity?: number | null;
              pricePerPackage?: number | null;
              piecesPerPackage?: number | null;
              packageType?: string | null;
              productTypeSnapshot?: string | null;
            }>;
          }>;
        };
      };

      const PRODUCTS_QUERY = `
        query GetProducts($userId: Int!, $limit: Int!) {
          products(userId: $userId, limit: $limit) {
            nodes {
              productId
              name
              productType
              variantOptions {
                sellingPrice
                purchasePrice
              }
            }
          }
        }
      `;

      type ProductsQueryResult = {
        products: {
          nodes: Array<{
            productId: string;
            name: string;
            productType?: string | null;
            variantOptions?: Array<{
              sellingPrice?: string | number | null;
              purchasePrice?: string | number | null;
            }>;
          }>;
        };
      };

      // Fetch data using GraphQL
      const [ordersData, productsData] = await Promise.all([
        fetchGraphQL<OrdersQueryResult>(ORDERS_QUERY, { userId, limit: 1000 }),
        fetchGraphQL<ProductsQueryResult>(PRODUCTS_QUERY, { userId, limit: 1000 }),
      ]);
      
      const orders: ExportOrder[] = (ordersData.orders?.nodes || []).map((order) => ({
        buyerId: order.buyerId || '',
        orderDate: order.orderDate,
        totalAmount: order.totalAmount ?? undefined,
        orderItems: order.orderItems?.map((item) => ({
          productId: item.productId,
          packageQuantity: item.packageQuantity ?? 0,
          pricePerPackage: item.pricePerPackage ?? 0,
          piecesPerPackage: item.piecesPerPackage ?? undefined,
          packageType: item.packageType ?? undefined,
          productTypeSnapshot: item.productTypeSnapshot ?? undefined,
        })),
      }));
      const products = productsData.products?.nodes || [];
      
      // Transform GraphQL products to match expected format
      const transformedProducts: ExportProduct[] = products.map((product) => {
        const firstVariant = product.variantOptions?.[0];
        return {
          productId: product.productId,
          name: product.name,
          productType: product.productType ?? undefined,
          sellingPrice: firstVariant?.sellingPrice ? String(firstVariant.sellingPrice) : '0',
          purchasePrice: firstVariant?.purchasePrice ? String(firstVariant.purchasePrice) : '0',
        };
      });
      
      // Create export content as HTML (which can be opened in Word)
      const exportContent = createWordDocument(orders, transformedProducts, timeRange);
      
      // Create and download file as HTML (opens in Word)
      const blob = new Blob([exportContent], { type: 'application/msword;charset=utf-8;' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', `financial-analytics-${timeRange}-${new Date().toISOString().split('T')[0]}.doc`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (error) {
      alert('Failed to export data. Please try again.');
    }
  };

  // Types for export generation (explicit, no any)
  type ExportOrderItem = { productId: string; packageQuantity: number; pricePerPackage: number; piecesPerPackage?: number; packageType?: string; productTypeSnapshot?: string };
  type ExportOrder = { buyerId: string; orderDate: string | Date; totalAmount?: number; orderItems?: ExportOrderItem[] };
  type ExportProduct = { productId: string; name: string; category?: string; productType?: string; sellingPrice?: string; purchasePrice?: string };

  // Helper function to create Word document content
  const createWordDocument = (orders: ExportOrder[], products: ExportProduct[], timeRange: string): string => {
    const timestamp = new Date().toLocaleString();
    const timeRangeLabel = timeRanges.find(range => range.value === timeRange)?.label || timeRange;
    
    // Helper function to parse currency strings to numbers
    const parseCurrencyToNumber = (currencyString: string): number => {
      if (!currencyString || currencyString === '0' || currencyString === '0,00') return 0;
      const cleanString = currencyString
        .replace(/[Rp\s,]/g, '')
        .replace(/\./g, '')
        .trim();
      const parsed = parseFloat(cleanString);
      return isNaN(parsed) ? 0 : parsed;
    };

    // Calculate comprehensive metrics like FinancialAnalytics component
    const totalOrders = orders.length;
    const totalProducts = products.length;
    
    // Calculate real revenue and profit from orders and products
    let totalRevenue = 0;
    let totalProfit = 0;
    let totalBuyers = 0;
    let totalSuppliers = 0;
    
    const uniqueBuyers = new Set<string>();
    const uniqueSuppliers = new Set<string>();
    
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
      uniqueBuyers.add(String(order.buyerId));
      
      if (order.orderItems && Array.isArray(order.orderItems)) {
        order.orderItems.forEach((item: ExportOrderItem) => {
          const product = products.find(p => p.productId === item.productId);
          if (product) {
            const sellingPrice = parseCurrencyToNumber(product.sellingPrice || '0');
            const purchasePrice = parseCurrencyToNumber(product.purchasePrice || '0');
            if (sellingPrice > 0 && purchasePrice > 0) {
              // Calculate revenue and cost using package-based pricing
              const piecesPerPackage = item.piecesPerPackage || 1;
              const packageQuantity = item.packageQuantity || 1;
              const itemRevenue = sellingPrice * packageQuantity * piecesPerPackage;
              const itemCost = purchasePrice * packageQuantity * piecesPerPackage;
              const itemProfit = itemRevenue - itemCost;
              totalRevenue += itemRevenue;
              totalProfit += itemProfit;
            } else {
              // Calculate revenue using package-based pricing
              const piecesPerPackage = item.piecesPerPackage || 1;
              const packageQuantity = item.packageQuantity || 1;
              const revenue = (item.pricePerPackage || 0) * packageQuantity;
              const avgMargin = Object.values(productMargins).length > 0
                ? Object.values(productMargins).reduce((a, b) => a + b, 0) / Object.values(productMargins).length
                : 30;
              const profit = revenue * (avgMargin / 100);
              totalRevenue += revenue;
              totalProfit += profit;
            }
          } else {
            // Calculate revenue using package-based pricing
            const piecesPerPackage = item.piecesPerPackage || 1;
            const packageQuantity = item.packageQuantity || 1;
            const revenue = item.pricePerPackage * packageQuantity;
            const avgMargin = Object.values(productMargins).length > 0
              ? Object.values(productMargins).reduce((a, b) => a + b, 0) / Object.values(productMargins).length
              : 30;
            const profit = revenue * (avgMargin / 100);
            totalRevenue += revenue;
            totalProfit += profit;
          }
        });
      } else {
        const revenue = Number(order.totalAmount || 0);
        const avgMargin = Object.values(productMargins).length > 0
          ? Object.values(productMargins).reduce((a, b) => a + b, 0) / Object.values(productMargins).length
          : 30;
        const profit = revenue * (avgMargin / 100);
        totalRevenue += revenue;
        totalProfit += profit;
      }
    });

    totalBuyers = uniqueBuyers.size;
    totalSuppliers = uniqueSuppliers.size;
    
    const profitMargin = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;
    const averageOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;
    const monthlyGrowth = 12.5; // This would be calculated from historical data
    
    // Calculate revenue trend data
    const monthlyData: { [key: string]: { revenue: number; profit: number; orders: number } } = {};
    orders.forEach(order => {
      const orderDate = new Date(order.orderDate);
      const monthKey = `${orderDate.getFullYear()}-${String(orderDate.getMonth() + 1).padStart(2, '0')}`;
      
      if (!monthlyData[monthKey]) monthlyData[monthKey] = { revenue: 0, profit: 0, orders: 0 };
      monthlyData[monthKey].orders += 1;
      
      if (order.orderItems && Array.isArray(order.orderItems)) {
        order.orderItems.forEach((item: ExportOrderItem) => {
          const product = products.find(p => p.productId === item.productId);
          if (product) {
            const sellingPrice = parseCurrencyToNumber(product.sellingPrice || '0');
            const purchasePrice = parseCurrencyToNumber(product.purchasePrice || '0');
            
            let itemRevenue = 0;
            let itemProfit = 0;
            
            if (sellingPrice > 0 && purchasePrice > 0) {
              // Calculate revenue and cost using package-based pricing
              const piecesPerPackage = item.piecesPerPackage || 1;
              const packageQuantity = item.packageQuantity || 1;
              itemRevenue = sellingPrice * packageQuantity * piecesPerPackage;
              const itemCost = purchasePrice * packageQuantity * piecesPerPackage;
              itemProfit = itemRevenue - itemCost;
            } else {
              // Use unitPrice from order item if product prices are not available
              // Calculate revenue using package-based pricing
            const piecesPerPackage = item.piecesPerPackage || 1;
            const packageQuantity = item.packageQuantity || 1;
            itemRevenue = (item.pricePerPackage || 0) * packageQuantity;
              const avgMargin = Object.values(productMargins).length > 0
                ? Object.values(productMargins).reduce((a, b) => a + b, 0) / Object.values(productMargins).length
                : 30;
              itemProfit = itemRevenue * (avgMargin / 100);
            }
            
            monthlyData[monthKey].revenue += itemRevenue;
            monthlyData[monthKey].profit += itemProfit;
          } else {
            // If product not found, use order item data
            // Calculate revenue using package-based pricing
            const piecesPerPackage = item.piecesPerPackage || 1;
            const packageQuantity = item.packageQuantity || 1;
            const itemRevenue = item.pricePerPackage * packageQuantity;
            const avgMargin = Object.values(productMargins).length > 0
              ? Object.values(productMargins).reduce((a, b) => a + b, 0) / Object.values(productMargins).length
              : 30;
            const itemProfit = itemRevenue * (avgMargin / 100);
            monthlyData[monthKey].revenue += itemRevenue;
            monthlyData[monthKey].profit += itemProfit;
          }
        });
      } else {
        // If no orderItems, use totalAmount
        const revenue = Number(order.totalAmount || 0);
        const avgMargin = Object.values(productMargins).length > 0
          ? Object.values(productMargins).reduce((a, b) => a + b, 0) / Object.values(productMargins).length
          : 30;
        const profit = revenue * (avgMargin / 100);
        monthlyData[monthKey].revenue += revenue;
        monthlyData[monthKey].profit += profit;
      }
    });

    // Calculate category data
    const categoryStats: { [key: string]: { revenue: number; profit: number } } = {};
    orders.forEach(order => {
      if (order.orderItems && Array.isArray(order.orderItems)) {
        order.orderItems.forEach((item: ExportOrderItem) => {
          const product = products.find(p => p.productId === item.productId);
          const category = product?.productType || 'Uncategorized';
          const sellingPrice = parseCurrencyToNumber(product?.sellingPrice || '0');
          const purchasePrice = parseCurrencyToNumber(product?.purchasePrice || '0');
          
          let itemRevenue = 0;
          let itemProfit = 0;
          
          if (sellingPrice > 0 && purchasePrice > 0) {
            // Calculate revenue and cost using package-based pricing
            const piecesPerPackage = item.piecesPerPackage || 1;
            const packageQuantity = item.packageQuantity || 1;
            itemRevenue = sellingPrice * packageQuantity * piecesPerPackage;
            const itemCost = purchasePrice * packageQuantity * piecesPerPackage;
            itemProfit = itemRevenue - itemCost;
          } else {
            // Use unitPrice from order item if product prices are not available
            // Calculate revenue using package-based pricing
            const piecesPerPackage = item.piecesPerPackage || 1;
            const packageQuantity = item.packageQuantity || 1;
            itemRevenue = (item.pricePerPackage || 0) * packageQuantity;
            const avgMargin = Object.values(productMargins).length > 0
              ? Object.values(productMargins).reduce((a, b) => a + b, 0) / Object.values(productMargins).length
              : 30;
            itemProfit = itemRevenue * (avgMargin / 100);
          }
          
          if (!categoryStats[category]) categoryStats[category] = { revenue: 0, profit: 0 };
          categoryStats[category].revenue += itemRevenue;
          categoryStats[category].profit += itemProfit;
        });
      }
    });

    // Calculate top performing products
    const productStats: { [key: string]: { revenue: number; unitsSold: number; category: string; name: string; profit: number } } = {};
    orders.forEach(order => {
      if (order.orderItems && Array.isArray(order.orderItems)) {
        order.orderItems.forEach((item: ExportOrderItem) => {
          const product = products.find(p => p.productId === item.productId);
          if (product) {
            const sellingPrice = parseCurrencyToNumber(product.sellingPrice || '0');
            const purchasePrice = parseCurrencyToNumber(product.purchasePrice || '0');
            
            if (!productStats[item.productId]) {
              productStats[item.productId] = {
                revenue: 0,
                unitsSold: 0,
                category: product.productType || 'Uncategorized',
                name: product.name,
                profit: 0
              };
            }
            
            if (sellingPrice > 0 && purchasePrice > 0) {
              // Calculate revenue and cost using package-based pricing
              const piecesPerPackage = item.piecesPerPackage || 1;
              const packageQuantity = item.packageQuantity || 1;
              const itemRevenue = sellingPrice * packageQuantity * piecesPerPackage;
              const itemCost = purchasePrice * packageQuantity * piecesPerPackage;
              const itemProfit = itemRevenue - itemCost;
              productStats[item.productId].revenue += itemRevenue;
              productStats[item.productId].profit += itemProfit;
            } else {
              // Calculate revenue using package-based pricing
              const piecesPerPackage = item.piecesPerPackage || 1;
              const packageQuantity = item.packageQuantity || 1;
              const revenue = (item.pricePerPackage || 0) * packageQuantity;
              const avgMargin = Object.values(productMargins).length > 0
                ? Object.values(productMargins).reduce((a, b) => a + b, 0) / Object.values(productMargins).length
                : 30;
              const profit = revenue * (avgMargin / 100);
              productStats[item.productId].revenue += revenue;
              productStats[item.productId].profit += profit;
            }
            
            // Calculate units sold using package-based pricing
            const piecesPerPackage = item.piecesPerPackage || 1;
            const packageQuantity = item.packageQuantity || 1;
            productStats[item.productId].unitsSold += packageQuantity * piecesPerPackage;
          }
        });
      }
    });

    const topProducts = Object.entries(productStats)
      .map(([productId, stats]) => {
        const margin = stats.revenue > 0 ? (stats.profit / stats.revenue) * 100 : 0;
        return {
          name: stats.name,
          productType: stats.category,
          revenue: stats.revenue,
          profit: stats.profit,
          margin,
          unitsSold: stats.unitsSold,
          productId
        };
      })
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10);

    // Create HTML content that can be opened in Word
    const htmlContent = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Financial Analytics Report</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 40px; line-height: 1.6; }
        h1 { color: #0a61d7; text-align: center; border-bottom: 3px solid #0a61d7; padding-bottom: 10px; }
        h2 { color: #333; margin-top: 30px; border-bottom: 1px solid #ccc; padding-bottom: 5px; }
        h3 { color: #666; margin-top: 25px; }
        .header-info { text-align: center; margin-bottom: 30px; color: #666; }
        .metrics-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 20px; margin: 20px 0; }
        .metric-card { background: #f8f9fa; padding: 15px; border-radius: 8px; border-left: 4px solid #0a61d7; }
        .metric-value { font-size: 24px; font-weight: bold; color: #0a61d7; }
        .metric-label { color: #666; font-size: 14px; }
        .metric-change { color: #3ea73b; font-size: 12px; margin-top: 5px; }
        table { width: 100%; border-collapse: collapse; margin: 20px 0; }
        th, td { border: 1px solid #ddd; padding: 12px; text-align: left; }
        th { background-color: #0a61d7; color: white; font-weight: bold; }
        tr:nth-child(even) { background-color: #f9f9f9; }
        .section { margin: 40px 0; }
        .footer { margin-top: 40px; text-align: center; color: #666; font-size: 12px; }
    </style>
</head>
<body>
    <h1>Financial Analytics Report</h1>
    
    <div class="header-info">
        <p><strong>Generated:</strong> ${timestamp}</p>
        <p><strong>Time Range:</strong> ${timeRangeLabel}</p>
        <p><strong>Report Type:</strong> Comprehensive Financial Analysis</p>
    </div>

    <!-- SECTION 1: KEY METRICS -->
    <div class="section">
        <h2>Key Financial Metrics</h2>
        <div class="metrics-grid">
            <div class="metric-card">
                <div class="metric-value">$${totalRevenue.toLocaleString()}</div>
                <div class="metric-label">Total Revenue</div>
                <div class="metric-change">+${monthlyGrowth}% vs last month</div>
            </div>
            <div class="metric-card">
                <div class="metric-value">$${totalProfit.toLocaleString()}</div>
                <div class="metric-label">Total Profit</div>
                <div class="metric-change">+15.2% vs last month</div>
            </div>
            <div class="metric-card">
                <div class="metric-value">${profitMargin.toFixed(1)}%</div>
                <div class="metric-label">Profit Margin</div>
                <div class="metric-change">+2.1% vs last month</div>
            </div>
            <div class="metric-card">
                <div class="metric-value">$${averageOrderValue.toLocaleString()}</div>
                <div class="metric-label">Average Order Value</div>
                <div class="metric-change">-1.8% vs last month</div>
            </div>
        </div>
    </div>

    <!-- SECTION 2: REVENUE TREND & CATEGORY -->
    <div class="section">
        <h2>Revenue Trend & Category Analysis</h2>
        
        <h3>Revenue Trend (Last 6 Months)</h3>
        <table>
            <thead>
                <tr>
                    <th>Month</th>
                    <th>Revenue</th>
                    <th>Profit/Loss</th>
                    <th>Orders</th>
                    <th>Growth Rate</th>
                </tr>
            </thead>
            <tbody>
                ${(() => {
                  const monthlyEntries = Object.entries(monthlyData).sort(([a], [b]) => a.localeCompare(b));
                  const last6Months = monthlyEntries.slice(-6); // Get last 6 months
                  
                  return last6Months.map(([month, data], index) => {
                    const monthName = new Date(month + '-01').toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
                    
                    // Calculate growth rate compared to previous month
                    let growthRate = 0;
                    if (index > 0) {
                      const prevMonth = last6Months[index - 1][1];
                      if (prevMonth.revenue > 0) {
                        growthRate = ((data.revenue - prevMonth.revenue) / prevMonth.revenue) * 100;
                      }
                    }
                    
                    return `
                      <tr>
                        <td>${monthName}</td>
                        <td>$${data.revenue.toLocaleString()}</td>
                        <td>$${data.profit.toLocaleString()}</td>
                        <td>${data.orders}</td>
                        <td>${growthRate > 0 ? '+' : ''}${growthRate.toFixed(1)}%</td>
                      </tr>
                    `;
                  }).join('');
                })()}
            </tbody>
        </table>

        <h3>Top 5 Revenue Categories</h3>
        <table>
            <thead>
                <tr>
                    <th>Rank</th>
                    <th>Category</th>
                    <th>Revenue</th>
                    <th>Profit</th>
                    <th>Profit Margin</th>
                    <th>% of Total</th>
                </tr>
            </thead>
            <tbody>
                ${(() => {
                  const sortedCategories = Object.entries(categoryStats)
                    .sort(([, a], [, b]) => b.revenue - a.revenue)
                    .slice(0, 5);
                  
                  return sortedCategories.map(([category, stats], index) => {
                    const margin = stats.revenue > 0 ? (stats.profit / stats.revenue) * 100 : 0;
                    const percentage = totalRevenue > 0 ? (stats.revenue / totalRevenue) * 100 : 0;
                    return `
                      <tr>
                        <td>${index + 1}</td>
                        <td>${category}</td>
                        <td>$${stats.revenue.toLocaleString()}</td>
                        <td>$${stats.profit.toLocaleString()}</td>
                        <td>${margin.toFixed(1)}%</td>
                        <td>${percentage.toFixed(1)}%</td>
                      </tr>
                    `;
                  }).join('');
                })()}
            </tbody>
        </table>
    </div>

    <!-- SECTION 3: TOP PERFORMING PRODUCTS & CASH FLOW -->
    <div class="section">
        <h2>Top Performing Products & Cash Flow Analysis</h2>
        
        <h3>Product Performance Summary</h3>
        <table>
            <thead>
                <tr>
                    <th>Units Sold</th>
                    <th>Total Revenue</th>
                    <th>Total Profit</th>
                    <th>Order Conversion Rate</th>
                </tr>
            </thead>
            <tbody>
                ${(() => {
                  const totalProductRevenue = topProducts.reduce((sum, product) => sum + product.revenue, 0);
                  const totalUnitsSold = topProducts.reduce((sum, product) => sum + product.unitsSold, 0);
                  const totalProfit = topProducts.reduce((sum, product) => sum + product.profit, 0);
                  
                  // Calculate overall conversion rate: (Total Orders / Total Products Available) * 100
                  // This shows what percentage of available products actually got ordered
                  const totalOrders = Object.values(monthlyData).reduce((sum, data) => sum + data.orders, 0);
                  const totalProductsAvailable = products.length;
                  const conversionRate = totalProductsAvailable > 0 ? (totalOrders / totalProductsAvailable) * 100 : 0;
                  
                  return `
                    <tr>
                      <td>${totalUnitsSold}</td>
                      <td>$${totalProductRevenue.toLocaleString()}</td>
                      <td>$${totalProfit.toLocaleString()}</td>
                      <td>${conversionRate.toFixed(1)}%</td>
                    </tr>
                  `;
                })()}
            </tbody>
        </table>

        <h3>Top 5 Performing Products by Revenue</h3>
        <table>
            <thead>
                <tr>
                    <th>Rank</th>
                    <th>Product Name</th>
                    <th>Category</th>
                    <th>Revenue</th>
                    <th>Units Sold</th>
                    <th>Profit Margin</th>
                    <th>Conversion Rate</th>
                </tr>
            </thead>
            <tbody>
                ${topProducts.slice(0, 5).map((product, index) => {
                  // Calculate individual product conversion rate: (Orders containing this product / Total Orders) * 100
                  // This shows what percentage of all orders include this specific product
                  const totalOrders = Object.values(monthlyData).reduce((sum, data) => sum + data.orders, 0);
                  
                  // Count how many orders contain this product
                  let ordersWithThisProduct = 0;
                  orders.forEach(order => {
                    if (order.orderItems && Array.isArray(order.orderItems)) {
                      const hasProduct = order.orderItems.some((item: ExportOrderItem) => item.productId === product.productId);
                      if (hasProduct) ordersWithThisProduct++;
                    }
                  });
                  
                  const conversionRate = totalOrders > 0 ? (ordersWithThisProduct / totalOrders) * 100 : 0;
                  
                  return `
                    <tr>
                      <td>${index + 1}</td>
                      <td>${product.name}</td>
                      <td>${product.productType}</td>
                      <td>$${product.revenue.toLocaleString()}</td>
                      <td>${product.unitsSold}</td>
                      <td>${product.margin.toFixed(1)}%</td>
                      <td>${conversionRate.toFixed(1)}%</td>
                    </tr>
                  `;
                }).join('')}
            </tbody>
        </table>

        <h3>Cash Flow Trend (Last 6 Months)</h3>
        <table>
            <thead>
                <tr>
                    <th>Month</th>
                    <th>Cash Inflows</th>
                    <th>Cash Outflows</th>
                    <th>Net Cash Flow</th>
                    <th>Growth Rate</th>
                </tr>
            </thead>
            <tbody>
                ${(() => {
                  const monthlyEntries = Object.entries(monthlyData).sort(([a], [b]) => a.localeCompare(b));
                  const last6Months = monthlyEntries.slice(-6); // Get last 6 months
                  
                  return last6Months.map(([month, data], index) => {
                    const monthName = new Date(month + '-01').toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
                    const inflows = data.revenue;
                    const outflows = data.revenue - data.profit; // Estimated outflows
                    const netFlow = data.profit;
                    
                    // Calculate growth rate compared to previous month
                    let growthRate = 0;
                    if (index > 0) {
                      const prevMonth = last6Months[index - 1][1];
                      const prevNetFlow = prevMonth.profit;
                      if (prevNetFlow > 0) {
                        growthRate = ((netFlow - prevNetFlow) / prevNetFlow) * 100;
                      }
                    }
                    
                    return `
                      <tr>
                        <td>${monthName}</td>
                        <td>$${inflows.toLocaleString()}</td>
                        <td>$${outflows.toLocaleString()}</td>
                        <td>$${netFlow.toLocaleString()}</td>
                        <td>${growthRate > 0 ? '+' : ''}${growthRate.toFixed(1)}%</td>
                      </tr>
                    `;
                  }).join('');
                })()}
            </tbody>
        </table>
    </div>

    <div class="footer">
        <p>This report was generated automatically by the Laku-Laku Financial Analytics System.</p>
        <p>For questions or support, please contact your system administrator.</p>
    </div>
</body>
</html>
    `;
    
    return htmlContent;
  };

  if (loading) {
    return (
      <div className="w-full mx-auto p-4 bg-gray-50 min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-[#0a61d7] border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600">Loading financial analytics...</p>
        </div>
      </div>
    );
  }

  if (!hasData) {
    return (
      <div className="w-full mx-auto p-4 bg-gradient-to-b from-gray-50 to-white min-h-screen">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Financial Analytics</h1>
          <p className="text-sm text-gray-600">Comprehensive financial overview and insights</p>
        </div>
        <div className="text-center mt-30">
          <div className="w-20 h-20 mx-auto mb-6 bg-gray-100 rounded-full flex items-center justify-center">
            <DollarSign className="w-10 h-10 text-gray-400" />
          </div>
          <h3 className="text-xl font-semibold text-gray-900 mb-2">No Financial Data Available</h3>
          <p className="text-gray-500 max-w-md mx-auto">
            Start by adding products and tracking orders to see your financial analytics. 
            Your revenue, profit, and performance metrics will appear here once you have data.
          </p>
        </div>
        <div className="flex flex-col sm:flex-row mt-6 justify-center">
          <button 
            onClick={() => window.location.href = '/products'}
            className="px-6 py-3 bg-[#0a61d7] text-white rounded-lg hover:bg-[#084ba6] transition-colors"
          >
            Add Products
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full mx-auto p-4 bg-gradient-to-b from-gray-50 to-white min-h-screen">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-2">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Financial Analytics</h1>
          <p className="text-sm text-gray-500 mb-4">Comprehensive financial overview and insights</p>
        </div>
        
        {/* Action Buttons */}
        <div className="flex items-center gap-3">
          {/* Time Range Dropdown */}
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

          {/* Export Button */}
          <button 
            onClick={handleExport}
            className="flex items-center gap-2 px-4 py-2 bg-[#0a61d7] border border-[#e6e6e6] text-white rounded-lg hover:bg-[#084ba6] transition-colors text-sm font-medium"
          >
            <Download className="w-4 h-4" />
            Export
          </button>
        </div>
      </div>

      <FinancialAnalytics />
    </div>
  )

}
