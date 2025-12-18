'use client';

import React, { useEffect, useRef, useState } from 'react';
import CustomerSalesAnalytics from '@/components/analyticsperformance/CustomerSalesAnalytics';
import { Calendar, ChevronDown, Download, Users } from 'lucide-react';
import { useUserStore } from '@/store/userStore';
import { fetchGraphQL } from '@/lib/graphqlClient';
import { Order } from '@/types/order';
import { Product } from '@/types/product';

const SALES_ANALYTICS_PAGE_QUERY = `
  query SalesAnalyticsPageData($userId: Int!, $orderLimit: Int!, $productLimit: Int!) {
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

export default function SalesAnalyticsPage() {
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

	useEffect(() => {
		const onClick = (e: MouseEvent) => {
			if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
				setIsDropdownOpen(false);
			}
		};
		document.addEventListener('mousedown', onClick);
		return () => document.removeEventListener('mousedown', onClick);
	}, []);

	// Fetch data to check if we have data
	useEffect(() => {
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
								legacyVariants?: Product['legacyVariants'];
							}
						>;
					};
				}>(SALES_ANALYTICS_PAGE_QUERY, {
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

	// ===== Types for export calculations (explicit, no any) =====
	interface ExportOrderItem { productId: string; packageQuantity: number; pricePerPackage: number; piecesPerPackage?: number; packageType?: string; category?: string; productTypeSnapshot?: string }
	interface ExportOrder { buyerId: string; orderDate: string; totalAmount?: number; orderItems?: ExportOrderItem[]; storeName?: string; contactPerson?: string }
	interface ExportProduct { productId: string; name: string; category?: string; productType?: string; sellingPrice?: string; purchasePrice?: string }
	interface ExportBuyer { buyerId: string; storeName?: string; owner?: string; businessType?: string }

	const parseCurrencyToNumber = (currencyString: string | undefined): number => {
		if (!currencyString || currencyString === '0' || currencyString === '0,00') return 0;
		const cleanString = currencyString.replace(/[^\d.-]/g, '').replace(/\./g, '').trim();
		const parsed = parseFloat(cleanString);
		return Number.isNaN(parsed) ? 0 : parsed;
	};

	const createWordDocument = (
		orders: ExportOrder[],
		products: ExportProduct[],
		buyers: ExportBuyer[],
		timeRangeValue: string
	): string => {
		const timestamp = new Date().toLocaleString();
		const timeRangeLabel = timeRanges.find(r => r.value === timeRangeValue)?.label || timeRangeValue;

		// Build indices
		const productIndex = new Map<string, ExportProduct>();
		products.forEach(p => productIndex.set(String(p.productId), p));
		const buyerIndex = new Map<string, ExportBuyer>();
		buyers.forEach(b => buyerIndex.set(String(b.buyerId), b));

		// Metrics
		let totalUnitsSold = 0;
		let revenueSum = 0;
		const buyerOrderCount = new Map<string, number>();
		orders.forEach(o => {
			buyerOrderCount.set(o.buyerId, (buyerOrderCount.get(o.buyerId) || 0) + 1);
			if (o.orderItems && Array.isArray(o.orderItems)) {
				o.orderItems.forEach(it => {
					// Calculate units and revenue using package-based pricing
					const piecesPerPackage = it.piecesPerPackage || 1;
					const packageQuantity = it.packageQuantity || 1;
					totalUnitsSold += packageQuantity * piecesPerPackage;
					const prod = productIndex.get(String(it.productId));
					const unitPrice = prod ? parseCurrencyToNumber(prod.sellingPrice) : (it.pricePerPackage || 0);
					revenueSum += unitPrice * packageQuantity;
				});
			} else if (typeof o.totalAmount === 'number') {
				revenueSum += o.totalAmount;
			}
		});
		const totalOrders = orders.length;
		const uniqueCustomers = Array.from(buyerOrderCount.keys()).length;
		const repeatCustomers = Array.from(buyerOrderCount.values()).filter(c => c > 1).length;
		const repeatCustomerRate = uniqueCustomers > 0 ? (repeatCustomers / uniqueCustomers) * 100 : 0;
		const avgItemsPerOrder = totalOrders > 0 ? totalUnitsSold / totalOrders : 0;
		const avgOrderValue = totalOrders > 0 ? revenueSum / totalOrders : 0;

		// Sales trend (by month)
		const monthly: Record<string, { orders: number; units: number; revenue: number }> = {};
		orders.forEach(o => {
			const d = new Date(o.orderDate);
			const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
			if (!monthly[key]) monthly[key] = { orders: 0, units: 0, revenue: 0 };
			monthly[key].orders += 1;
			if (o.orderItems && Array.isArray(o.orderItems)) {
				o.orderItems.forEach(it => {
					// Calculate units and revenue using package-based pricing
					const piecesPerPackage = it.piecesPerPackage || 1;
					const packageQuantity = it.packageQuantity || 1;
					monthly[key].units += packageQuantity * piecesPerPackage;
					const prod = productIndex.get(String(it.productId));
					const unitPrice = prod ? parseCurrencyToNumber(prod.sellingPrice) : (it.pricePerPackage || 0);
					monthly[key].revenue += unitPrice * packageQuantity;
				});
			} else if (typeof o.totalAmount === 'number') {
				monthly[key].revenue += o.totalAmount;
			}
		});
		const monthlyEntries = Object.entries(monthly).sort(([a],[b]) => a.localeCompare(b));
		const last6 = monthlyEntries.slice(-6);

		// Units by category
		const unitsByCategoryMap = new Map<string, number>();
		orders.forEach(o => {
			if (!o.orderItems) return;
			o.orderItems.forEach(it => {
				const prod = productIndex.get(String(it.productId));
				const category = it.productTypeSnapshot || prod?.productType || 'Uncategorized';
				// Calculate units using package-based pricing
				const piecesPerPackage = it.piecesPerPackage || 1;
				const packageQuantity = it.packageQuantity || 1;
				unitsByCategoryMap.set(category, (unitsByCategoryMap.get(category) || 0) + (packageQuantity * piecesPerPackage));
			});
		});
		const unitsByCategory = Array.from(unitsByCategoryMap.entries())
			.map(([category, units]) => ({ category, units }))
			.sort((a, b) => b.units - a.units)
			.slice(0, 8);

		// Top customers by revenue
		type TopCustomer = { buyerId: string; name: string; businessType: string; orders: number; revenue: number };
		const revenueByBuyer = new Map<string, { orders: number; revenue: number }>();
		orders.forEach(o => {
			let orderRevenue = 0;
			if (o.orderItems && Array.isArray(o.orderItems)) {
				o.orderItems.forEach(it => {
					const prod = productIndex.get(it.productId);
					// Calculate revenue using package-based pricing
					const packageQuantity = it.packageQuantity || 1;
					const unitPrice = prod ? parseCurrencyToNumber(prod.sellingPrice) : (it.pricePerPackage || 0);
					orderRevenue += unitPrice * packageQuantity;
				});
			} else if (typeof o.totalAmount === 'number') {
				orderRevenue = o.totalAmount;
			}
			const cur = revenueByBuyer.get(String(o.buyerId)) || { orders: 0, revenue: 0 };
			revenueByBuyer.set(String(o.buyerId), { orders: cur.orders + 1, revenue: cur.revenue + orderRevenue });
		});
		const topCustomers: TopCustomer[] = Array.from(revenueByBuyer.entries()).map(([buyerId, v]) => {
			const buyer = buyerIndex.get(String(buyerId));
			const displayName = (buyer?.storeName && String(buyer.storeName).trim().length > 0)
				? String(buyer.storeName)
				: ((buyer?.owner && String(buyer.owner).trim().length > 0) ? String(buyer.owner) : String(buyerId));
			const displayBusinessType = buyer?.businessType ? String(buyer.businessType) : '—';
			return { buyerId: String(buyerId), name: displayName, businessType: displayBusinessType, orders: v.orders, revenue: v.revenue };
		}).sort((a,b) => b.revenue - a.revenue).slice(0, 10);

		// Build HTML content
		const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Sales Analytics Report</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 40px; line-height: 1.6; }
    h1 { color: #0a61d7; text-align: center; border-bottom: 3px solid #0a61d7; padding-bottom: 10px; }
    h2 { color: #333; margin-top: 30px; border-bottom: 1px solid #ccc; padding-bottom: 5px; }
    h3 { color: #666; margin-top: 25px; }
    .header-info { text-align: center; margin-bottom: 30px; color: #666; }
    .metrics-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 20px; margin: 20px 0; }
    .metric-card { background: #f8f9fa; padding: 15px; border-radius: 8px; border-left: 4px solid #0a61d7; }
    .metric-value { font-size: 20px; font-weight: bold; color: #0a61d7; }
    .metric-label { color: #666; font-size: 14px; }
    table { width: 100%; border-collapse: collapse; margin: 20px 0; }
    th, td { border: 1px solid #ddd; padding: 10px; text-align: left; }
    th { background-color: #0a61d7; color: white; font-weight: bold; }
    tr:nth-child(even) { background-color: #f9f9f9; }
    .section { margin: 40px 0; }
    .footer { margin-top: 40px; text-align: center; color: #666; font-size: 12px; }
  </style>
</head>
<body>
  <h1>Sales Analytics Report</h1>
  <div class="header-info">
    <p><strong>Generated:</strong> ${timestamp}</p>
    <p><strong>Time Range:</strong> ${timeRangeLabel}</p>
    <p><strong>Report Type:</strong> Comprehensive Sales Analysis</p>
  </div>

  <div class="section">
    <h2>Key Sales Metrics</h2>
    <div class="metrics-grid">
      <div class="metric-card"><div class="metric-value">${totalOrders.toLocaleString()}</div><div class="metric-label">Total Orders</div></div>
      <div class="metric-card"><div class="metric-value">${totalUnitsSold.toLocaleString()}</div><div class="metric-label">Units Sold</div></div>
      <div class="metric-card"><div class="metric-value">${avgItemsPerOrder.toFixed(2)}</div><div class="metric-label">Avg Items / Order</div></div>
      <div class="metric-card"><div class="metric-value">$${avgOrderValue.toLocaleString()}</div><div class="metric-label">Avg Order Value</div></div>
    </div>
    <div class="metrics-grid" style="grid-template-columns: repeat(2, 1fr);">
      <div class="metric-card"><div class="metric-value">${uniqueCustomers.toLocaleString()}</div><div class="metric-label">Unique Customers</div></div>
      <div class="metric-card"><div class="metric-value">${repeatCustomerRate.toFixed(1)}%</div><div class="metric-label">Repeat Customer Rate</div></div>
    </div>
  </div>

  <div class="section">
    <h2>Sales Trend (Last 6 Months)</h2>
    <table>
      <thead><tr><th>Month</th><th>Orders</th><th>Units</th><th>Revenue</th><th>Growth Rate</th></tr></thead>
      <tbody>
        ${last6.map(([month, data], idx) => {
          const monthName = new Date(month + '-01').toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
          let growth = 0;
          if (idx > 0) {
            const prev = last6[idx-1][1] as { orders: number; units: number; revenue: number };
            if (prev.revenue > 0) growth = ((data.revenue - prev.revenue) / (prev.revenue)) * 100;
          }
          return `<tr><td>${monthName}</td><td>${data.orders}</td><td>${data.units}</td><td>$${data.revenue.toLocaleString()}</td><td>${growth > 0 ? '+' : ''}${growth.toFixed(1)}%</td></tr>`;
        }).join('')}
      </tbody>
    </table>
  </div>

  <div class="section">
    <h2>Units by Category (Top 8)</h2>
    <table>
      <thead><tr><th>Rank</th><th>Category</th><th>Units</th><th>% of Total Units</th></tr></thead>
      <tbody>
        ${(() => {
          const totalUnits = unitsByCategory.reduce((s, c) => s + c.units, 0);
          return unitsByCategory.map((c, i) => {
            const pct = totalUnits > 0 ? (c.units / totalUnits) * 100 : 0;
            return `<tr><td>${i+1}</td><td>${c.category}</td><td>${c.units}</td><td>${pct.toFixed(1)}%</td></tr>`;
          }).join('');
        })()}
      </tbody>
    </table>
  </div>

  <div class="section">
    <h2>Top Customers (by Revenue)</h2>
    <table>
      <thead><tr><th>Rank</th><th>Buyer</th><th>Business Type</th><th>Orders</th><th>Revenue</th></tr></thead>
      <tbody>
        ${topCustomers.slice(0, 10).map((c, i) => `<tr><td>${i+1}</td><td>${c.name}</td><td>${c.businessType}</td><td>${c.orders}</td><td>$${c.revenue.toLocaleString()}</td></tr>`).join('')}
      </tbody>
    </table>
  </div>

  <div class="footer">
    <p>This report was generated automatically by the Laku-Laku Sales Analytics System.</p>
    <p>For questions or support, please contact your system administrator.</p>
  </div>
</body>
</html>
`;
		return html;
	};

	const handleExport = async () => {
		try {
			// Get user ID from Zustand store - NO FALLBACK
			if (!user?.id) {
				alert('Please log in to export data.');
				return;
			}

			const userId = user.id;

			// GraphQL queries to fetch orders, products, and buyers
			const ORDERS_QUERY = `
				query GetOrders($userId: Int!, $limit: Int!) {
					orders(userId: $userId, limit: $limit) {
						nodes {
							id
							orderId
							buyerId
							orderDate
							totalAmount
							storeName
							contactPerson
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
						storeName?: string | null;
						contactPerson?: string | null;
						orderItems?: Array<{
							productId: string;
							packageQuantity?: number | null;
							pricePerPackage?: number | null;
							piecesPerPackage?: number | null;
							packageType?: string | null;
							category?: string | null;
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

			const BUYERS_QUERY = `
				query GetBuyers($userId: Int!, $limit: Int!) {
					buyers(userId: $userId, limit: $limit) {
						nodes {
							buyerId
							storeName
							owner
							businessType
						}
					}
				}
			`;

			type BuyersQueryResult = {
				buyers: {
					nodes: Array<{
						buyerId: string;
						storeName?: string | null;
						owner?: string | null;
						businessType?: string | null;
					}>;
				};
			};

			// Fetch data using GraphQL
			const [ordersData, productsData, buyersData] = await Promise.all([
				fetchGraphQL<OrdersQueryResult>(ORDERS_QUERY, { userId, limit: 1000 }),
				fetchGraphQL<ProductsQueryResult>(PRODUCTS_QUERY, { userId, limit: 1000 }),
				fetchGraphQL<BuyersQueryResult>(BUYERS_QUERY, { userId, limit: 100 }),
			]);

			const orders: ExportOrder[] = (ordersData.orders?.nodes || []).map((order) => ({
				...order,
				buyerId: order.buyerId || '',
				totalAmount: order.totalAmount ?? undefined,
				storeName: order.storeName || undefined,
				contactPerson: order.contactPerson || undefined,
				orderItems: order.orderItems?.map((item) => ({
					productId: item.productId,
					packageQuantity: item.packageQuantity ?? 0,
					pricePerPackage: item.pricePerPackage ?? 0,
					piecesPerPackage: item.piecesPerPackage ?? undefined,
					packageType: item.packageType ?? undefined,
					category: item.category ?? undefined,
					productTypeSnapshot: item.productTypeSnapshot ?? undefined,
				})),
			}));
			const productsRaw = productsData.products?.nodes || [];
			const buyers: ExportBuyer[] = (buyersData.buyers?.nodes || []).map((buyer) => ({
				buyerId: buyer.buyerId,
				storeName: buyer.storeName || undefined,
				owner: buyer.owner || undefined,
				businessType: buyer.businessType || undefined,
			}));

			// Transform GraphQL products to match expected format
			const products: ExportProduct[] = productsRaw.map((product) => {
				const firstVariant = product.variantOptions?.[0];
				return {
					productId: product.productId,
					name: product.name,
					productType: product.productType || undefined,
					sellingPrice: firstVariant?.sellingPrice ? String(firstVariant.sellingPrice) : '0',
					purchasePrice: firstVariant?.purchasePrice ? String(firstVariant.purchasePrice) : '0',
				};
			});

			const content = createWordDocument(orders, products, buyers, timeRange);
			const blob = new Blob([content], { type: 'application/msword;charset=utf-8;' });
			const link = document.createElement('a');
			const url = URL.createObjectURL(blob);
			link.setAttribute('href', url);
			link.setAttribute('download', `sales-analytics-${timeRange}-${new Date().toISOString().split('T')[0]}.doc`);
			link.style.visibility = 'hidden';
			document.body.appendChild(link);
			link.click();
			document.body.removeChild(link);
		} catch (_) {
			alert('Failed to export data. Please try again.');
		}
	};

	if (loading) {
		return (
			<div className="w-full mx-auto p-4 bg-gray-50 min-h-screen flex items-center justify-center">
				<div className="text-center">
					<div className="w-8 h-8 border-4 border-[#0a61d7] border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
					<p className="text-gray-600">Loading sales analytics...</p>
				</div>
			</div>
		);
	}

	if (!hasData) {
		return (
			<div className="w-full mx-auto p-4 bg-gradient-to-b from-gray-50 to-white min-h-screen">
				<div className="mb-6">
					<h1 className="text-2xl font-bold text-gray-900 mb-2">Customer & Sales Analytics</h1>
					<p className="text-sm text-gray-600">Insights on customers, sales volume, and product performance</p>
				</div>
				<div className="text-center mt-30">
					<div className="w-20 h-20 mx-auto mb-6 bg-gray-100 rounded-full flex items-center justify-center">
						<Users className="w-10 h-10 text-gray-400" />
					</div>
					<h3 className="text-xl font-semibold text-gray-900 mb-2">No Customer/Sales Data</h3>
					<p className="text-gray-500 max-w-md mx-auto">Add products and track orders to see customer and sales analytics.</p>
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
			<div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-2">
				<div>
					<h1 className="text-2xl font-bold text-gray-900 mb-2">Customer & Sales Analytics</h1>
					<p className="text-sm text-gray-600">Insights on customers, sales volume, and product performance</p>
				</div>
				<div className="flex items-center gap-3">
					<div className="relative" ref={dropdownRef}>
						<button onClick={() => setIsDropdownOpen(!isDropdownOpen)} className="flex items-center gap-2 px-4 py-2 bg-white border border-[#e6e6e6] text-black rounded-lg hover:bg-gray-50 transition-colors text-sm font-medium">
							<Calendar className="w-4 h-4" />
							{currentRange?.label}
							<ChevronDown className="w-4 h-4" />
						</button>
						{isDropdownOpen && (
							<div className="absolute top-full left-0 mt-1 w-full bg-white border border-[#e6e6e6] rounded-lg shadow-lg z-10">
								{timeRanges.map(range => (
									<button key={range.value} onClick={() => { setTimeRange(range.value); setIsDropdownOpen(false); }} className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-50 transition-colors first:rounded-t-lg last:rounded-b-lg ${timeRange === range.value ? 'bg-blue-50 text-blue-600' : 'text-gray-700'}`}>
										{range.label}
									</button>
								))}
							</div>
						)}
					</div>
					<button onClick={handleExport} className="flex items-center gap-2 px-4 py-2 bg-[#0a61d7] border border-[#e6e6e6] text-white rounded-lg hover:bg-[#084ba6] transition-colors text-sm font-medium">
						<Download className="w-4 h-4" />
						Export
					</button>
				</div>
			</div>
			<CustomerSalesAnalytics />
		</div>
	);
}
