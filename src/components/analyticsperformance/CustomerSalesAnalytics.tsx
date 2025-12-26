"use client";

import React, { useEffect, useMemo, useState, useRef } from 'react';
import {
	Bar,
	BarChart,
	CartesianGrid,
	Pie,
	PieChart,
	ResponsiveContainer,
	Tooltip,
	XAxis,
	YAxis,
	Cell,
	Legend,
	Line
} from 'recharts';
import {
	Users,
	ShoppingCart,
	Package,
	Repeat,
	TrendingUp,
	ChevronLeft,
	ChevronRight,
	ChevronDown,
	Filter,
	ArrowRight
} from 'lucide-react';
import { useUserStore } from '@/store/userStore';
import { Order } from '@/types/order';
import { Product } from '@/types/product';
import {
	AnalyticsMetricCard
} from '@/components/analyticsperformance/FinancialAnalytics';
import { formatCurrency as formatCurrencyShared } from '@/utils/currencyUtils';
import { fetchGraphQL } from '@/lib/graphqlClient';
import { forecastSales } from '@/utils/forecasting';

// Helper function to parse currency to number (matching FinancialAnalytics)
const parseCurrencyToNumber = (currencyValue: string | number): number => {
	if (currencyValue == null) return 0;
	if (typeof currencyValue === 'number') {
		return Number.isFinite(currencyValue) ? currencyValue : 0;
	}
	if (!currencyValue || currencyValue === '0' || currencyValue === '0,00') return 0;
	const cleanString = currencyValue
		.replace(/[^\d.-]/g, '')
		.replace(/\./g, '')
		.trim();
	const parsed = parseFloat(cleanString);
	return isNaN(parsed) ? 0 : parsed;
};

interface BuyerLite {
	buyerId: string;
	name?: string;
	storeName?: string;
	owner?: string;
	businessType?: string;
}

// ===== Reusable types & utilities (exported) =====
export type SalesTrendPoint = { month: string; orders: number; pieces: number; units: number };

export const calculateSalesTrend = (orders: Order[], hasData: boolean): SalesTrendPoint[] => {
	if (!hasData || orders.length === 0) return [];
	const monthly: Record<string, { orders: number; pieces: number; units: number; label: string }> = {};
	orders.forEach(o => {
		const d = new Date(o.orderDate);
		const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2,'0')}`;
		const label = d.toLocaleDateString('en-US', { month: 'short' });
		if (!monthly[key]) monthly[key] = { orders: 0, pieces: 0, units: 0, label };
		monthly[key].orders += 1;
		if (o.orderItems && Array.isArray(o.orderItems)) {
			o.orderItems.forEach(i => {
				// Calculate pieces and units using piece-based pricing
				const packageQuantity = i.packageQuantity || 1;
				const piecesPerPackage = i.piecesPerPackage || 1;
				monthly[key].pieces += packageQuantity;
				monthly[key].units += packageQuantity * piecesPerPackage;
			});
		}
	});
	const sorted = Object.entries(monthly)
		.map(([key, v]) => ({ key, month: `${v.label} ${key.split('-')[0]}`, orders: v.orders, pieces: v.pieces, units: v.units }))
		.sort((a, b) => a.key.localeCompare(b.key));
	return sorted.slice(-6);
};

export const calculateSalesMetrics = (
	orders: Order[],
	products: Product[],
	hasData: boolean
) => {
	if (!hasData || orders.length === 0) {
		return {
			totalOrders: 0,
			totalPackagesSold: 0,
			totalUnitsSold: 0,
			avgPackagesPerOrder: 0,
			avgUnitsPerOrder: 0,
			avgOrderValue: 0,
			uniqueCustomers: 0,
			repeatCustomerRate: 0
		};
	}
	let totalPiecesSold = 0;
	let totalUnitsSold = 0;
	let revenueSum = 0;
	const buyerOrderCount = new Map<string | number, number>();
	orders.forEach(order => {
		buyerOrderCount.set(order.buyerId as string, (buyerOrderCount.get(order.buyerId as string) || 0) + 1);
		if (order.orderItems && Array.isArray(order.orderItems)) {
			order.orderItems.forEach(item => {
				// Calculate pieces and units from piece-based pricing
				const packageQuantity = item.packageQuantity || 1;
				const piecesPerPackage = item.piecesPerPackage || 1;
				totalPiecesSold += packageQuantity;
				totalUnitsSold += packageQuantity * piecesPerPackage;
			});
		}
		if (order.totalAmount) {
			revenueSum += parseFloat(String(order.totalAmount));
		}
	});
	const totalOrders = orders.length;
	const uniqueCustomers = Array.from(buyerOrderCount.keys()).length;
	const repeatCustomers = Array.from(buyerOrderCount.values()).filter(c => c > 1).length;
	const repeatCustomerRate = uniqueCustomers > 0 ? (repeatCustomers / uniqueCustomers) * 100 : 0;
	const avgPiecesPerOrder = totalOrders > 0 ? totalPiecesSold / totalOrders : 0;
	const avgUnitsPerOrder = totalOrders > 0 ? totalUnitsSold / totalOrders : 0;
	const avgOrderValue = totalOrders > 0 ? revenueSum / totalOrders : 0;
	return {
		totalOrders,
		totalPiecesSold,
		totalUnitsSold,
		avgPiecesPerOrder,
		avgUnitsPerOrder,
		avgOrderValue,
		uniqueCustomers,
		repeatCustomerRate
	};
};

export const SalesTrendChart: React.FC<{ data: SalesTrendPoint[]; showSeeMore?: boolean; showForecast?: boolean }> = ({ data, showSeeMore = false, showForecast = true }) => {
	const salesForecast = showForecast && data.length >= 2 
		? forecastSales(data, 'orders', 3) 
		: null;

	const chartData = useMemo(() => {
		if (!salesForecast) return data;
		const combined: Array<{ month: string; orders: number; pieces: number; units: number; isForecast?: boolean }> = [];
		
		data.forEach((d) => {
			combined.push({ ...d, isForecast: false });
		});
		
		if (salesForecast.forecast.length > 0 && data.length > 0) {
			const lastHistorical = data[data.length - 1];
			combined.push({ ...lastHistorical, isForecast: false });
			salesForecast.forecast.forEach(f => {
				combined.push({ month: f.date, orders: f.value, pieces: 0, units: 0, isForecast: true });
			});
		}
		return combined;
	}, [data, salesForecast]);

	return (
		<div className="bg-white rounded-lg shadow-sm border border-gray-100 p-4">
			<div className="flex items-center justify-between mb-4">
				<h3 className="text-lg font-semibold text-gray-900">Sales Trend{salesForecast ? ' & Forecast' : ''}</h3>
				<div className="flex items-center space-x-4">
					<div className="flex items-center"><div className="w-3 h-3 rounded-full bg-[#3B82F6] mr-2"></div><span className="text-sm text-gray-600 font-medium">Orders</span></div>
					<div className="flex items-center"><div className="w-3 h-3 rounded-full bg-[#10B981] mr-2"></div><span className="text-sm text-gray-600 font-medium">Units</span></div>
					{salesForecast && (
						<div className="flex items-center"><div className="w-3 h-3 border-2 border-dashed border-[#9CA3AF] rounded-full mr-2"></div><span className="text-sm text-gray-600 font-medium">Forecast</span></div>
					)}
					{showSeeMore && (
						<button 
							onClick={() => (window.location.href = '/analytics/sales')}
							className="flex items-center px-3 py-1.5 text-xs font-medium text-black bg-white shadow-sm hover:bg-gray-100 rounded-md transition-colors"
						>
							See More
							<ArrowRight className="w-4 h-4 ml-1" />
						</button>
					)}
				</div>
			</div>
			<ResponsiveContainer width="100%" height={330}>
				<BarChart data={chartData} margin={{ top: 20, right: 30, left: 40, bottom: 20 }}>
				<defs>
					<linearGradient id="ordersGradient" x1="0" y1="0" x2="0" y2="1">
						<stop offset="0%" stopColor="#3B82F6" stopOpacity={0.9}/>
						<stop offset="100%" stopColor="#1D4ED8" stopOpacity={0.7}/>
					</linearGradient>
					<linearGradient id="unitsGradient" x1="0" y1="0" x2="0" y2="1">
						<stop offset="0%" stopColor="#10B981" stopOpacity={0.9}/>
						<stop offset="100%" stopColor="#059669" stopOpacity={0.7}/>
					</linearGradient>
				</defs>
				<CartesianGrid strokeDasharray="2 4" stroke="#000000" strokeOpacity={0.2} horizontal={true} vertical={false} />
				<XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#6B7280' }} />
				<YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#6B7280' }} />
				<Tooltip 
					content={({ active, payload, label }) => {
						if (active && payload && payload.length) {
							return (
								<div className="bg-white border-none rounded-xl shadow-lg p-4">
									<div className="flex items-center mb-2">
										<div className="w-3 h-3 rounded-full bg-[#0a61d7] mr-2"></div>
										<p className="font-semibold text-gray-900">{label}</p>
									</div>
									{payload.map((entry: { dataKey: string; value: number }, index: number) => {
										let label = '';
										let color = '';
										if (entry.dataKey === 'orders') {
											label = 'Orders';
											color = '#3B82F6';
										} else if (entry.dataKey === 'units') {
											label = 'Pieces';
											color = '#10B981';
										}
										return (
											<div key={index} className="flex items-center space-x-2 mb-1">
												<div className="w-3 h-3 rounded-full" style={{ backgroundColor: color }} />
												<span className="text-gray-700">{label} : {entry.value}</span>
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
					<Bar dataKey="orders" name="Orders" fill="url(#ordersGradient)" radius={[6,6,0,0]} maxBarSize={40} />
					<Bar dataKey="units" name="Pieces" fill="url(#unitsGradient)" radius={[6,6,0,0]} maxBarSize={40} />
					{salesForecast && salesForecast.forecast.length > 0 && (
						<Line
							type="monotone"
							dataKey="orders"
							stroke="#9CA3AF"
							strokeWidth={2}
							strokeDasharray="5 5"
							dot={{ fill: '#9CA3AF', r: 3 }}
							connectNulls={true}
						/>
					)}
				</BarChart>
			</ResponsiveContainer>
		</div>
	);
};

export const CustomerPiecesSoldCard: React.FC<{ piecesSold: number; unitsSold: number; userCurrency?: string }> = ({ piecesSold, unitsSold }) => (
	<AnalyticsMetricCard
		title="Pieces Sold"
		value={`${piecesSold.toLocaleString()}`}
		change={0}
		icon={<Package className="w-6 h-6 text-green-600" />}
		color="bg-[#e6f7ec]"
	/>
);

// ===== Main Page Component (unchanged) =====
const CUSTOMER_ANALYTICS_QUERY = `
  query CustomerSalesData($userId: Int!, $orderLimit: Int!, $productLimit: Int!, $buyerLimit: Int!) {
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
    buyers(userId: $userId, limit: $buyerLimit) {
      nodes {
        buyerId
        storeName
        owner
        businessType
      }
    }
  }
`;

const CustomerSalesAnalytics: React.FC = () => {
	const { user } = useUserStore();
	const [orders, setOrders] = useState<Order[]>([]);
	const [products, setProducts] = useState<Product[]>([]);
	const [buyers, setBuyers] = useState<BuyerLite[]>([]);
	const [loading, setLoading] = useState(true);
	const [hasData, setHasData] = useState(false);
	const [categoryFilter, setCategoryFilter] = useState<'productType' | 'productCategory'>('productCategory');
	const [isCategoryDropdownOpen, setIsCategoryDropdownOpen] = useState(false);
	const categoryDropdownRef = useRef<HTMLDivElement>(null);

	const userCurrency = user?.currency || 'IDR';

	const categoryOptions = [
		{ value: 'productCategory', label: 'Product Category' },
		{ value: 'productType', label: 'Product Type' }
	];

	const currentCategoryOption = categoryOptions.find(option => option.value === categoryFilter);

	// Handle dropdown click outside
	useEffect(() => {
		const handleClickOutside = (event: MouseEvent) => {
			if (categoryDropdownRef.current && !categoryDropdownRef.current.contains(event.target as Node)) {
				setIsCategoryDropdownOpen(false);
			}
		};

		document.addEventListener('mousedown', handleClickOutside);
		return () => document.removeEventListener('mousedown', handleClickOutside);
	}, []);

	useEffect(() => {
		const fetchData = async () => {
			try {
				setLoading(true);
				
				if (!user?.id) {
					setOrders([]);
					setProducts([]);
					setBuyers([]);
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
					buyers: {
						nodes: BuyerLite[];
					};
				}>(CUSTOMER_ANALYTICS_QUERY, {
					userId: user.id,
					orderLimit: 1000,
					productLimit: 1000,
					buyerLimit: 100,
				});

				const ordersList = data.orders?.nodes ?? [];
				const productsList = (data.products?.nodes ?? []).map((product) => ({
					...product,
					variants: (product.variants ?? []) as Product['variants'],
					legacyVariants: (product.legacyVariants ?? []) as Product['legacyVariants'],
				}));
				const buyersList = data.buyers?.nodes ?? [];

				setOrders(ordersList);
				setProducts(productsList);
				setBuyers(buyersList);
				setHasData(ordersList.length > 0);
			} finally {
				setLoading(false);
			}
		};
		fetchData();
	}, [user?.id]);

	// Derived metrics
	const metrics = useMemo(() => calculateSalesMetrics(orders, products, hasData), [orders, products, hasData, userCurrency]);

	// Sales trend
	const salesTrend = useMemo(() => calculateSalesTrend(orders, hasData), [orders, hasData]);

	// Sales forecast
	const salesForecast = useMemo(() => {
		if (salesTrend.length < 2) return null;
		return forecastSales(salesTrend, 'orders', 3);
	}, [salesTrend]);

	// Category units (better than duplicating Top Products already in financial)
	const unitsByCategory = useMemo(() => {
		if (!hasData || orders.length === 0) return [] as { category: string; units: number }[];
		const map: Record<string, number> = {};
		orders.forEach(o => {
			if (!o.orderItems) return;
			o.orderItems.forEach(it => {
				const prod = products.find(p => p.productId === it.productId);
				// Get category based on selected filter
				let category = 'Uncategorized';
				if (categoryFilter === 'productType') {
					category = prod?.productType || 'Uncategorized';
				} else {
					category = prod?.productCategory || 'Uncategorized';
				}
				// Calculate units using piece-based pricing
				const piecesPerPackage = it.piecesPerPackage || 1;
				const packageQuantity = it.packageQuantity || 1;
				map[category] = (map[category] || 0) + (packageQuantity * piecesPerPackage);
			});
		});
		return Object.entries(map).map(([category, units]) => ({ category, units }))
			.sort((a, b) => b.units - a.units)
			.slice(0, 8);
	}, [orders, products, hasData, categoryFilter]);

	// Top customers (exclude deleted/missing buyers)
	type TopCustomer = { buyerId: string | number; name: string; businessType: string; orders: number; totalValue: number };
	const topCustomers: TopCustomer[] = useMemo(() => {
		if (!hasData || orders.length === 0) return [] as TopCustomer[];
		const map = new Map<string | number, { orders: number; totalValue: number }>();
		orders.forEach(o => {
			const buyerKey = String(o.buyerId);
			const cur = map.get(buyerKey) || { orders: 0, totalValue: 0 };
			const orderAmount = parseFloat(String(o.totalAmount || 0));
			map.set(buyerKey, { orders: cur.orders + 1, totalValue: cur.totalValue + orderAmount });
		});
		const buyerIndex = new Map<string, BuyerLite>();
		buyers.forEach(b => buyerIndex.set(b.buyerId, b));
		return Array.from(map.entries())
			.map(([buyerId, v]) => {
				const buyer = buyerIndex.get(String(buyerId));
				if (!buyer) { return null; }
				// Fallback: derive from any order with same buyerId
				const orderForBuyer = orders.find(o => String(o.buyerId) === String(buyerId));
				const orderDerivedName = orderForBuyer?.storeName || orderForBuyer?.contactPerson;
				const displayName = (buyer?.storeName && String(buyer.storeName).trim().length > 0)
					? (buyer.storeName as string)
					: ((buyer?.owner && String(buyer.owner).trim().length > 0) ? (buyer.owner as string)
					: (orderDerivedName && String(orderDerivedName).trim().length > 0 ? String(orderDerivedName) : String(buyerId)));
				const displayBusinessType = (buyer?.businessType as string) || '—';
				return {
					buyerId,
					name: displayName,
					businessType: displayBusinessType,
					orders: v.orders,
					totalValue: v.totalValue
				};
			})
			.filter((x): x is TopCustomer => x !== null)
			.sort((a, b) => b.orders - a.orders);
	}, [orders, products, buyers, hasData]);

	// Pagination for Top Customers
	const customersPerPage = 5;
	const [customerPage, setCustomerPage] = useState(1);
	const totalCustomers = topCustomers.length;
	const totalCustomerPages = Math.max(1, Math.ceil(totalCustomers / customersPerPage));
	const fromCustomer = totalCustomers === 0 ? 0 : (customerPage - 1) * customersPerPage + 1;
	const toCustomer = Math.min(customerPage * customersPerPage, totalCustomers);
	const pagedCustomers = topCustomers.slice((customerPage - 1) * customersPerPage, customerPage * customersPerPage);

	const COLORS = ['#10B981', '#3B82F6', '#F59E0B', '#EF4444', '#8B5CF6', '#14B8A6', '#F97316', '#06B6D4'];

	// Don't render content until data is loaded to avoid showing 0 values
	if (loading) {
		return null;
	}

	return (
		<div className="space-y-4">
			{/* Key Metrics */}
			<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
				<AnalyticsMetricCard
					title="Total Orders"
					value={String(metrics.totalOrders)}
					change={0}
					icon={<ShoppingCart className="w-6 h-6 text-[#0a61d7]" />}
					color="bg-[#f7faff]"
				/>
				<CustomerPiecesSoldCard
					piecesSold={metrics.totalPiecesSold || 0}
					unitsSold={metrics.totalUnitsSold}
					userCurrency={user?.currency}
				/>
				<AnalyticsMetricCard
					title="Avg Pieces / Order"
					value={`${(metrics.avgPiecesPerOrder || 0).toFixed(2)}`}
					change={0}
					icon={<TrendingUp className="w-6 h-6 text-amber-500" />}
					color="bg-[#fff7ed]"
				/>
				<AnalyticsMetricCard
					title="Avg Order Value"
					value={formatCurrencyShared(metrics.avgOrderValue, userCurrency)}
					change={0}
					icon={<Repeat className="w-6 h-6 text-violet-600" />}
					color="bg-[#f5f3ff]"
				/>
			</div>

			{/* Charts */}
			<div className="grid grid-cols-1 lg:grid-cols-11 gap-4">
				{/* Sales Trend (Orders & Units) */}
				<div className="lg:col-span-6">
					<SalesTrendChart data={salesTrend} />
				</div>

				{/* Units by Category (Pie) */}
				<div className="lg:col-span-5">
					<div className="bg-white rounded-lg shadow-sm border border-gray-100 p-4">
						<div className="flex items-center justify-between mb-6">
							<h3 className="text-lg font-semibold text-gray-900">Units by Product Category</h3>
							<div className="relative" ref={categoryDropdownRef}>
								<button
									onClick={() => setIsCategoryDropdownOpen(!isCategoryDropdownOpen)}
									className="flex items-center gap-2 px-4 py-2 bg-white border border-[#e6e6e6] text-black rounded-lg hover:bg-gray-50 transition-colors text-sm font-medium"
								>
									<Filter className="w-4 h-4" />
									{currentCategoryOption?.label}
									<ChevronDown className="w-4 h-4" />
								</button>
								
								{isCategoryDropdownOpen && (
									<div className="absolute top-full left-0 mt-1 w-full bg-white border border-[#e6e6e6] rounded-lg shadow-lg z-10">
										{categoryOptions.map((option) => (
											<button
												key={option.value}
												onClick={() => {
													setCategoryFilter(option.value as 'productType' | 'productCategory');
													setIsCategoryDropdownOpen(false);
												}}
												className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-50 transition-colors first:rounded-t-lg last:rounded-b-lg ${
													categoryFilter === option.value ? 'bg-blue-50 text-blue-600' : 'text-gray-700'
												}`}
											>
												{option.label}
											</button>
										))}
									</div>
								)}
							</div>
						</div>
						<ResponsiveContainer width="100%" height={284}>
							<PieChart>
								<Pie data={unitsByCategory} dataKey="units" nameKey="category" cx="50%" cy="50%" innerRadius={70} outerRadius={110} paddingAngle={2} stroke="white" strokeWidth={2} cornerRadius={8}>
									{unitsByCategory.map((_, i) => (
										<Cell key={i} fill={COLORS[i % COLORS.length]} />
									))}
								</Pie>
								<Tooltip 
									formatter={(value: number, name: string, props: { payload?: { category?: string } }) => [
										`${value} units`, `${props?.payload?.category ?? name}`
									]}
									labelStyle={{ color: '#1E293B', fontWeight: 600, fontSize: '14px' }}
									contentStyle={{ backgroundColor: 'white', border: 'none', borderRadius: '12px', boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)', padding: '16px' }}
								/>
							</PieChart>
						</ResponsiveContainer>

						{/* Custom Legend Below Chart */}
						<div className="flex flex-wrap justify-center gap-4 mt-2">
							{unitsByCategory.map((entry, index) => (
								<div key={index} className="flex items-center space-x-2">
									<div 
										className="w-3 h-3 rounded-full"
										style={{ backgroundColor: COLORS[index % COLORS.length], boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}
									/>
									<span className="text-sm text-gray-700 font-medium">{entry.category}</span>
								</div>
							))}
						</div>
					</div>
				</div>
			</div>

			{/* Sales Trend Forecast */}
			<div className="bg-white rounded-lg shadow-sm border border-gray-100 p-4">
				<div className="flex items-center justify-between mb-6">
					<h3 className="text-lg font-semibold text-gray-900">Sales Trend Forecast</h3>
					{salesForecast && salesForecast.forecast.length > 0 && (
						<div className="flex items-center space-x-4">
							<div className="flex items-center">
								<div className="w-3 h-3 rounded-full bg-[#3B82F6] mr-2"></div>
								<span className="text-sm text-gray-600 font-medium">Historical Orders</span>
							</div>
							<div className="flex items-center">
								<div className="w-3 h-3 border-2 border-dashed border-[#9CA3AF] rounded-full mr-2"></div>
								<span className="text-sm text-gray-600 font-medium">Forecast</span>
							</div>
						</div>
					)}
				</div>
				{salesForecast && salesForecast.forecast.length > 0 ? (
					<>
						<ResponsiveContainer width="100%" height={320}>
							<BarChart 
								data={[
									...salesTrend.map(d => ({ month: d.month, orders: d.orders, pieces: d.pieces, units: d.units, isForecast: false })),
									...(salesTrend.length > 0 ? [{ ...salesTrend[salesTrend.length - 1], isForecast: false }] : []),
									...salesForecast.forecast.map(f => ({ month: f.date, orders: f.value, pieces: 0, units: 0, isForecast: true }))
								]} 
								margin={{ top: 20, right: 50, left: 50, bottom: 20 }}
							>
								<defs>
									<linearGradient id="salesForecastOrdersGradient" x1="0" y1="0" x2="0" y2="1">
										<stop offset="0%" stopColor="#3B82F6" stopOpacity={0.9}/>
										<stop offset="100%" stopColor="#1D4ED8" stopOpacity={0.7}/>
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
									tickLine={false}
									axisLine={false}
								/>
								<Tooltip 
									content={({ active, payload, label }) => {
										if (active && payload && payload.length) {
											return (
												<div className="bg-white border-none rounded-xl shadow-lg p-4">
													<div className="flex items-center mb-2">
														<div className="w-3 h-3 rounded-full bg-[#0a61d7] mr-2"></div>
														<p className="font-semibold text-gray-900">{label}</p>
													</div>
													{payload.map((entry: { dataKey: string; value: number; payload?: { isForecast?: boolean } }, index: number) => {
														if (entry.dataKey === 'orders') {
															const isForecast = entry.payload?.isForecast;
															return (
																<div key={index} className="flex items-center space-x-2 mb-1">
																	<div className={`w-3 h-3 rounded-full ${isForecast ? 'border-2 border-dashed border-[#9CA3AF]' : 'bg-[#3B82F6]'}`} />
																	<span className="text-gray-700">
																		Orders: {entry.value} {isForecast ? '(Forecast)' : ''}
																	</span>
																</div>
															);
														}
														return null;
													})}
												</div>
											);
										}
										return null;
									}}
									cursor={{ fill: '#F1F5F9', fillOpacity: 0.3 }}
								/>
								<Bar 
									dataKey="orders" 
									name="Orders" 
									fill="url(#salesForecastOrdersGradient)" 
									radius={[6, 6, 0, 0]} 
									maxBarSize={40}
								/>
								<Line
									type="monotone"
									dataKey="orders"
									stroke="#9CA3AF"
									strokeWidth={2}
									strokeDasharray="5 5"
									dot={{ fill: '#9CA3AF', r: 3 }}
									data={salesForecast.forecast.map(f => ({ month: f.date, orders: f.value, isForecast: true }))}
									connectNulls={true}
								/>
							</BarChart>
						</ResponsiveContainer>
						<div className="mt-4 pt-4 border-t border-gray-200 flex items-center justify-between">
							<div className="flex items-center gap-4">
								<div>
									<span className="text-xs text-gray-500">Trend: </span>
									<span className={`text-sm font-semibold ${
										salesForecast.trend === 'increasing' ? 'text-green-600' : 
										salesForecast.trend === 'decreasing' ? 'text-red-600' : 
										'text-gray-600'
									}`}>
										{salesForecast.trend.charAt(0).toUpperCase() + salesForecast.trend.slice(1)}
									</span>
								</div>
								<div>
									<span className="text-xs text-gray-500">Confidence: </span>
									<span className="text-sm font-semibold text-black">{(salesForecast.confidence * 100).toFixed(1)}%</span>
								</div>
							</div>
						</div>
					</>
				) : (
					<div className="h-[320px] flex items-center justify-center">
						<div className="text-center">
							<TrendingUp className="w-12 h-12 text-gray-300 mx-auto mb-2" />
							<p className="text-gray-500 text-sm">Insufficient data for forecast</p>
							<p className="text-gray-400 text-xs">Need at least 2 months of data</p>
						</div>
					</div>
				)}
			</div>

			{/* Top Customers Table */}
			<div className="bg-white rounded-lg shadow-sm border border-gray-100 p-4">
				<h3 className="text-lg font-semibold text-gray-900 mb-4">Top Customers</h3>
				<div className="overflow-x-auto rounded-lg">
					<table className="min-w-full text-sm text-left whitespace-nowrap text-xs">
						<thead className="bg-gray-100 text-gray-500 whitespace-nowrap">
							<tr>
								<th className="py-3 px-4 font-medium uppercase text-left">Buyer</th>
								<th className="py-3 px-4 font-medium uppercase text-left">Name</th>
								<th className="py-3 px-4 font-medium uppercase text-left">Business Type</th>
								<th className="py-3 px-4 font-medium uppercase text-center">Orders</th>
								<th className="py-3 px-4 font-medium uppercase text-right">Total Value</th>
							</tr>
						</thead>
						<tbody className="bg-white">
							{pagedCustomers.map((c, idx) => (
								<tr key={idx} className="border-b transition-colors">
									<td className="py-3 px-4 text-left text-black"><span className="cursor-pointer text-[#0a61d7] font-semibold hover:text-blue-800" onClick={() => (window.location.href = `/clients/buyers/details/${String(c.buyerId)}`)} title="View buyer profile">{String(c.buyerId)}</span></td>
									<td className="py-3 px-4 text-left text-black">{c.name}</td>
									<td className="py-3 px-4 text-left text-black">{c.businessType}</td>
									<td className="py-3 px-4 text-center text-black">{c.orders}</td>
									<td className="py-3 px-4 text-right text-black">{formatCurrencyShared(c.totalValue, userCurrency)}</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>

				{/* Pagination */}
				<div className="flex flex-col md:flex-row md:items-center md:justify-between mt-6 gap-2">
					<div className="text-sm text-gray-500">
						Showing {fromCustomer} to {toCustomer} of {totalCustomers} customers
					</div>
					<div className="flex items-center gap-3">
						<button
							className="p-2 rounded-lg hover:bg-gray-100 disabled:opacity-50 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
							onClick={() => setCustomerPage(customerPage - 1)}
							disabled={customerPage === 1}
							aria-label="Previous page"
						>
							<ChevronLeft className="w-4 h-4 text-gray-500" />
						</button>
						<button
							className="px-3 py-2 rounded-lg font-semibold text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 bg-[#0a61d7] text-white"
							aria-label={`Page ${customerPage}`}
							aria-current="page"
						>
							{customerPage}
						</button>
						<button
							className="p-2 rounded-lg hover:bg-gray-100 disabled:opacity-50 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
							onClick={() => setCustomerPage(customerPage + 1)}
							disabled={customerPage === totalCustomerPages}
							aria-label="Next page"
						>
							<ChevronRight className="w-4 h-4 text-gray-500" />
						</button>
					</div>
				</div>
			</div>
		</div>
	);
};

export default CustomerSalesAnalytics;
