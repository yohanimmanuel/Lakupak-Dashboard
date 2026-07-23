'use client';
import { SkeletonAnalyticsPage } from '@/components/skeleton/SkeletonAnalyticsPage';
import FinancialAnalytics, {
  buildProductLookup,
  calculateOrderItemCogs,
  getCatalogAverageMargin,
} from '@/components/analyticsperformance/FinancialAnalytics';
import { AnalyticsTimeRange, filterOrdersByTimeRange } from '@/utils/analyticsTimeRange';
import { Calendar, ChevronDown, Download, DollarSign } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';
import { useUserStore } from '@/store/userStore';
import { fetchGraphQL } from '@/lib/graphqlClient';
import { Order, OrderItem } from '@/types/order';
import { Product } from '@/types/product';
import { parseAmountSafely } from '@/utils/currencyUtils';
import { useAnalyticsTranslations } from '@/hooks/useAnalyticsTranslations';
import { percentChange, percentagePointChange } from '@/utils/monthOverMonthGrowth';

const TIME_RANGE_VALUES = ['1M', '3M', '6M', '1Y'] as const;

const FINANCIAL_ANALYTICS_PAGE_QUERY = `
  query FinancialAnalyticsPageData($userId: Int!, $orderLimit: Int!, $productLimit: Int!) {
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

export default function FinancialAnalyticsPage() {
  const { user } = useUserStore();
  const { tFinancial, tShared, translateTimeRange } = useAnalyticsTranslations();
  const [timeRange, setTimeRange] = useState('1M');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [hasData, setHasData] = useState(false);
  const [childReady, setChildReady] = useState(false);

  const timeRanges = TIME_RANGE_VALUES.map((value) => ({ value, label: translateTimeRange(value) }));

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
    setChildReady(false);

    const fetchData = async () => {
      try {
        setLoading(true);
        if (!user?.id) {
          setHasData(false);
          setLoading(false);
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
        }>(FINANCIAL_ANALYTICS_PAGE_QUERY, {
          userId: user.id,
          orderLimit: 1000,
          productLimit: 1000,
        });

        const ordersList = data.orders?.nodes ?? [];
        setHasData(ordersList.length > 0);
        setLoading(false);
      } catch (error) {
        setHasData(false);
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
        alert(tShared('exportLoginRequired'));
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
              paidAt
              paymentStatus
              totalAmount
              orderItems {
                productId
                subtotal
                packageQuantity
                pricePerPackage
                piecesPerPackage
                packageType
                variantId
                variantOptionId
                variantNameSnapshot
                promotionDetailsSnapshot
                moqSnapshot
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
            paidAt?: string | null;
            paymentStatus?: string | null;
            totalAmount?: number | null;
            orderItems?: Array<{
              productId: string;
              subtotal?: number | null;
              packageQuantity?: number | null;
              pricePerPackage?: number | null;
              piecesPerPackage?: number | null;
              packageType?: string | null;
              variantId?: number | null;
              variantOptionId?: number | null;
              variantNameSnapshot?: string | null;
              promotionDetailsSnapshot?: string | null;
              moqSnapshot?: number | null;
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
              productCategory
              variantOptions {
                id
                variantName
                purchasePrice
                sellingPrice
                isDefault
              }
            }
          }
        }
      `;

      type ProductsQueryResult = {
        products: {
          nodes: Product[];
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
        paidAt: order.paidAt ?? undefined,
        paymentStatus: order.paymentStatus ?? undefined,
        totalAmount: order.totalAmount ?? undefined,
        orderItems: order.orderItems?.map((item) => ({
          productId: item.productId,
          subtotal: item.subtotal ?? 0,
          packageQuantity: item.packageQuantity ?? 0,
          pricePerPackage: item.pricePerPackage ?? 0,
          piecesPerPackage: item.piecesPerPackage ?? undefined,
          packageType: item.packageType ?? undefined,
          variantId: item.variantId ?? undefined,
          variantOptionId: item.variantOptionId ?? undefined,
          variantNameSnapshot: item.variantNameSnapshot ?? undefined,
          promotionDetailsSnapshot: item.promotionDetailsSnapshot ?? undefined,
          moqSnapshot: item.moqSnapshot ?? undefined,
          productTypeSnapshot: item.productTypeSnapshot ?? undefined,
        })),
      }));
      const products = productsData.products?.nodes || [];
      
      // Apply the same time-range filter as the UI so export metrics match the selected range
      const filteredOrders = filterOrdersByTimeRange(orders, timeRange as AnalyticsTimeRange);

      // Create export content as HTML (which can be opened in Word)
      const exportContent = createWordDocument(filteredOrders, products, timeRange);
      
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
      alert(tShared('exportFailed'));
    }
  };

  // Types for export generation (explicit, no any)
  type ExportOrderItem = {
    productId: string;
    subtotal?: number;
    packageQuantity: number;
    pricePerPackage: number;
    piecesPerPackage?: number;
    packageType?: string;
    variantId?: number;
    variantOptionId?: number;
    variantNameSnapshot?: string;
    promotionDetailsSnapshot?: string;
    moqSnapshot?: number;
    productTypeSnapshot?: string;
  };
  type ExportOrder = {
    buyerId: string;
    orderDate: string | Date;
    paidAt?: string | Date | null;
    totalAmount?: number;
    orderItems?: ExportOrderItem[];
    paymentStatus?: string | null;
  };
  // Helper function to create Word document content
  const createWordDocument = (orders: ExportOrder[], products: Product[], timeRange: string): string => {
    const timestamp = new Date().toLocaleString();
    const timeRangeLabel = timeRanges.find(range => range.value === timeRange)?.label || timeRange;
    
    const safeTotalAmount = (amount: unknown): number => {
      return parseAmountSafely(amount as unknown);
    };

    const getItemPackageQuantity = (item: ExportOrderItem): number => {
      const quantity = Number(item.packageQuantity || 1);
      return Number.isFinite(quantity) && quantity > 0 ? quantity : 1;
    };

    const getItemPiecesPerPackage = (item: ExportOrderItem): number => {
      const pieces = Number(item.piecesPerPackage || 1);
      return Number.isFinite(pieces) && pieces > 0 ? pieces : 1;
    };

    const getItemRevenue = (item: ExportOrderItem): number => {
      const subtotal = safeTotalAmount(item.subtotal);
      if (subtotal > 0) return subtotal;
      return safeTotalAmount(item.pricePerPackage) * getItemPackageQuantity(item);
    };

    const productById = buildProductLookup(products);
    const avgMargin = getCatalogAverageMargin(products);
    const totalOrders = orders.length;
    const totalProducts = products.length;

    const getItemCogs = (item: ExportOrderItem): number =>
      calculateOrderItemCogs(item as OrderItem, productById.get(item.productId));

    const getItemProfit = (item: ExportOrderItem): number => {
      const itemRevenue = getItemRevenue(item);
      const itemCost = getItemCogs(item);
      return itemCost > 0 ? itemRevenue - itemCost : itemRevenue * (avgMargin / 100);
    };

    const getOrderItemProfit = (order: ExportOrder): number => {
      if (!order.orderItems || !Array.isArray(order.orderItems)) return 0;
      return order.orderItems.reduce((sum, item) => sum + getItemProfit(item), 0);
    };

    // Revenue stays order-total based; profit aggregates item-level getItemProfit
    // (same avg-margin fallback as category/product breakdowns) so export totals reconcile.
    let totalRevenue = 0;
    let totalProfit = 0;
    const uniqueBuyers = new Set<string>();

    orders.forEach(order => {
      uniqueBuyers.add(String(order.buyerId));
      const orderRevenue = safeTotalAmount(order.totalAmount);
      totalRevenue += orderRevenue;
      totalProfit += getOrderItemProfit(order);
    });

    const totalBuyers = uniqueBuyers.size;
    const totalSuppliers = 0;

    const profitMargin = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;
    const averageOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;

    const monthlyAll: { [key: string]: { revenue: number; profit: number; orders: number } } = {};
    orders.forEach(order => {
      const orderDate = new Date(order.orderDate);
      const monthKey = `${orderDate.getFullYear()}-${String(orderDate.getMonth() + 1).padStart(2, '0')}`;

      if (!monthlyAll[monthKey]) monthlyAll[monthKey] = { revenue: 0, profit: 0, orders: 0 };
      monthlyAll[monthKey].orders += 1;

      const orderRevenue = safeTotalAmount(order.totalAmount);
      monthlyAll[monthKey].revenue += orderRevenue;
      monthlyAll[monthKey].profit += getOrderItemProfit(order);
    });

    const monthlyEntriesAll = Object.entries(monthlyAll)
      .map(([key, data]) => ({ key, ...data }))
      .sort((a, b) => a.key.localeCompare(b.key));

    const lastAll = monthlyEntriesAll[monthlyEntriesAll.length - 1];
    const prevAll = monthlyEntriesAll[monthlyEntriesAll.length - 2];

    const revenueGrowth =
      lastAll && prevAll ? percentChange(lastAll.revenue, prevAll.revenue) : null;
    const profitGrowth =
      lastAll && prevAll ? percentChange(lastAll.profit, prevAll.profit) : null;

    const lastMarginExport = lastAll && lastAll.revenue > 0 ? (lastAll.profit / lastAll.revenue) * 100 : null;
    const prevMarginExport = prevAll && prevAll.revenue > 0 ? (prevAll.profit / prevAll.revenue) * 100 : null;
    const marginGrowth =
      lastMarginExport !== null && prevMarginExport !== null
        ? percentagePointChange(lastMarginExport, prevMarginExport)
        : null;

    const lastAovExport = lastAll && lastAll.orders > 0 ? lastAll.revenue / lastAll.orders : null;
    const prevAovExport = prevAll && prevAll.orders > 0 ? prevAll.revenue / prevAll.orders : null;
    const aovGrowth =
      lastAovExport !== null && prevAovExport !== null
        ? percentChange(lastAovExport, prevAovExport)
        : null;

    const monthlyData = monthlyAll;

    const categoryStats: { [key: string]: { revenue: number; profit: number } } = {};
    orders.forEach(order => {
      if (order.orderItems && Array.isArray(order.orderItems)) {
        order.orderItems.forEach((item: ExportOrderItem) => {
          const product = productById.get(item.productId);
          const category = product?.productType || item.productTypeSnapshot || 'Uncategorized';
          const itemRevenue = getItemRevenue(item);
          const itemProfit = getItemProfit(item);
          
          if (!categoryStats[category]) categoryStats[category] = { revenue: 0, profit: 0 };
          categoryStats[category].revenue += itemRevenue;
          categoryStats[category].profit += itemProfit;
        });
      }
    });

    const productStats: { [key: string]: { orderVolume: number; unitsSold: number; category: string; name: string; profit: number } } = {};
    orders.forEach(order => {
      if (order.orderItems && Array.isArray(order.orderItems)) {
        order.orderItems.forEach((item: ExportOrderItem) => {
          const product = productById.get(item.productId);
          if (product) {
            if (!productStats[item.productId]) {
              productStats[item.productId] = {
                orderVolume: 0,
                unitsSold: 0,
                category: product.productCategory || product.productType || 'Uncategorized',
                name: product.name,
                profit: 0
              };
            }
            
            const itemRevenue = getItemRevenue(item);
            productStats[item.productId].orderVolume += itemRevenue;
            productStats[item.productId].profit += getItemProfit(item);
            
            productStats[item.productId].unitsSold += getItemPackageQuantity(item) * getItemPiecesPerPackage(item);
          }
        });
      }
    });

    const topProducts = Object.entries(productStats)
      .map(([productId, stats]) => {
        const margin = stats.orderVolume > 0 ? (stats.profit / stats.orderVolume) * 100 : 0;
        return {
          name: stats.name,
          productType: stats.category,
          orderVolume: stats.orderVolume,
          profit: stats.profit,
          margin,
          unitsSold: stats.unitsSold,
          productId
        };
      })
      .sort((a, b) => b.orderVolume - a.orderVolume)
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
                <div class="metric-label">Order Volume</div>
                <div class="metric-change">${
                  revenueGrowth == null
                    ? 'N/A last month'
                    : `${revenueGrowth >= 0 ? '+' : ''}${revenueGrowth.toFixed(1)}% last month`
                }</div>
            </div>
            <div class="metric-card">
                <div class="metric-value">$${totalProfit.toLocaleString()}</div>
                <div class="metric-label">Total Profit</div>
                <div class="metric-change">${
                  profitGrowth == null
                    ? 'N/A last month'
                    : `${profitGrowth >= 0 ? '+' : ''}${profitGrowth.toFixed(1)}% last month`
                }</div>
            </div>
            <div class="metric-card">
                <div class="metric-value">${profitMargin.toFixed(1)}%</div>
                <div class="metric-label">Profit Margin</div>
                <div class="metric-change">${
                  marginGrowth == null
                    ? 'N/A last month'
                    : `${marginGrowth >= 0 ? '+' : ''}${marginGrowth.toFixed(1)}% last month`
                }</div>
            </div>
            <div class="metric-card">
                <div class="metric-value">$${averageOrderValue.toLocaleString()}</div>
                <div class="metric-label">Average Order Value</div>
                <div class="metric-change">${
                  aovGrowth == null
                    ? 'N/A last month'
                    : `${aovGrowth >= 0 ? '+' : ''}${aovGrowth.toFixed(1)}% last month`
                }</div>
            </div>
        </div>
    </div>

    <!-- SECTION 2: REVENUE TREND & CATEGORY -->
    <div class="section">
        <h2>Revenue Trend & Category Analysis</h2>
        
        <h3>Revenue Trend — Last 6 Months</h3>
        <table>
            <thead>
                <tr>
                    <th>Month</th>
                    <th>Order Volume</th>
                    <th>Profit</th>
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
                    <th>Order Volume</th>
                    <th>Total Profit</th>
                    <th>Order Conversion Rate</th>
                </tr>
            </thead>
            <tbody>
                ${(() => {
                  const totalProductOrderVolume = topProducts.reduce((sum, product) => sum + product.orderVolume, 0);
                  const totalUnitsSold = topProducts.reduce((sum, product) => sum + product.unitsSold, 0);
                  const totalProfit = topProducts.reduce((sum, product) => sum + product.profit, 0);
                  
                  // Calculate overall conversion rate: (Total Orders / Total Products Available) * 100
                  // This shows what percentage of available products actually got ordered
                  const totalProductsAvailable = products.length;
                  const conversionRate = totalProductsAvailable > 0 ? (totalOrders / totalProductsAvailable) * 100 : 0;
                  
                  return `
                    <tr>
                      <td>${totalUnitsSold}</td>
                      <td>$${totalProductOrderVolume.toLocaleString()}</td>
                      <td>$${totalProfit.toLocaleString()}</td>
                      <td>${conversionRate.toFixed(1)}%</td>
                    </tr>
                  `;
                })()}
            </tbody>
        </table>

        <h3>Top 5 Performing Products by Order Volume</h3>
        <table>
            <thead>
                <tr>
                    <th>Rank</th>
                    <th>Product Name</th>
                    <th>Category</th>
                    <th>Order Volume</th>
                    <th>Units Sold</th>
                    <th>Total Profit</th>
                    <th>Profit Margin</th>
                    <th>Conversion Rate</th>
                </tr>
            </thead>
            <tbody>
                ${topProducts.slice(0, 5).map((product, index) => {
                  // Calculate individual product conversion rate: (Orders containing this product / Total Orders) * 100
                  // This shows what percentage of all orders include this specific product
                  
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
                      <td>$${product.orderVolume.toLocaleString()}</td>
                      <td>${product.unitsSold}</td>
                      <td>$${product.profit.toLocaleString()}</td>
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
                  const monthlyEntries = Object.entries(monthlyAll).sort(([a], [b]) => a.localeCompare(b));
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
        <p>This report was generated automatically by the Laku Financial Analytics System.</p>
        <p>For questions or support, please contact your system administrator.</p>
    </div>
</body>
</html>
    `;
    
    return htmlContent;
  };

  if (loading) {
    return <SkeletonAnalyticsPage />;
  }

  if (!hasData) {
    return (
      <div className="w-full mx-auto p-4 bg-gradient-to-b from-gray-50 to-white min-h-screen">
        <div className="mb-4">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">{tFinancial('title')}</h1>
        </div>
        <div className="text-center mt-30">
          <div className="w-20 h-20 mx-auto mb-6 bg-gray-100 rounded-full flex items-center justify-center">
            <DollarSign className="w-10 h-10 text-gray-400" />
          </div>
          <h3 className="text-xl font-semibold text-gray-900 mb-2">{tFinancial('emptyTitle')}</h3>
          <p className="text-gray-500 max-w-md mx-auto">
            {tFinancial('emptyBody')}
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
    <>
      {!childReady && <SkeletonAnalyticsPage />}
      <div
        aria-hidden={!childReady}
        className={childReady ? 'w-full mx-auto p-4 bg-gradient-to-b from-gray-50 to-white min-h-screen' : 'hidden'}
      >
        {/* Page Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">{tFinancial('title')}</h1>
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
              {tShared('export')}
            </button>
          </div>
        </div>

        <FinancialAnalytics timeRange={timeRange as AnalyticsTimeRange} onReadyAction={() => setChildReady(true)} />
      </div>
    </>
  )

}
