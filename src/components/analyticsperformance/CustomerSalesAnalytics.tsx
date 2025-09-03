"use client";

import React, { useEffect, useMemo, useState } from 'react';
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
	Legend
} from 'recharts';
import {
	Users,
	ShoppingCart,
	Package,
	Repeat,
	TrendingUp,
	ChevronLeft,
	ChevronRight,
	ArrowRight
} from 'lucide-react';
import { useUserStore } from '@/store/userStore';
import { Order } from '@/types/order';
import { Product } from '@/types/product';
import {
	AnalyticsMetricCard,
	formatCurrency as formatCurrencyShared,
	parseCurrencyToNumber
} from '@/components/analyticsperformance/FinancialAnalytics';

interface BuyerLite {
	buyerId: string;
	name?: string;
	storeName?: string;
	owner?: string;
	businessType?: string;
}

// ===== Reusable types & utilities (exported) =====
export type SalesTrendPoint = { month: string; orders: number; units: number };

export const calculateSalesTrend = (orders: Order[], hasData: boolean): SalesTrendPoint[] => {
	if (!hasData || orders.length === 0) return [];
	const monthly: Record<string, { orders: number; units: number }> = {};
	orders.forEach(o => {
		const date = new Date(o.orderDate);
		const key = date.toLocaleDateString('en-US', { month: 'short' });
		if (!monthly[key]) monthly[key] = { orders: 0, units: 0 };
		monthly[key].orders += 1;
		if (o.orderItems && Array.isArray(o.orderItems)) {
			o.orderItems.forEach(i => monthly[key].units += i.quantity);
		}
	});
	const monthOrder = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
	return Object.entries(monthly)
		.map(([month, v]) => ({ month, ...v }))
		.sort((a, b) => monthOrder.indexOf(a.month) - monthOrder.indexOf(b.month));
};

export const calculateSalesMetrics = (
	orders: Order[],
	products: Product[],
	hasData: boolean
) => {
	if (!hasData || orders.length === 0) {
		return {
			totalOrders: 0,
			totalUnitsSold: 0,
			avgItemsPerOrder: 0,
			avgOrderValue: 0,
			uniqueCustomers: 0,
			repeatCustomerRate: 0
		};
	}
	let totalUnitsSold = 0;
	let revenueSum = 0;
	const buyerOrderCount = new Map<string | number, number>();
	orders.forEach(order => {
		buyerOrderCount.set(order.buyerId as any, (buyerOrderCount.get(order.buyerId as any) || 0) + 1);
		if (order.orderItems && Array.isArray(order.orderItems)) {
			order.orderItems.forEach(item => {
				totalUnitsSold += item.quantity;
				const product = products.find(p => p.productId === item.productId);
				const unitPrice = product ? parseCurrencyToNumber(product.sellingPrice || '0') : item.unitPrice || 0;
				revenueSum += unitPrice * item.quantity;
			});
		} else if (order.totalAmount) {
			revenueSum += parseFloat(String(order.totalAmount));
		}
	});
	const totalOrders = orders.length;
	const uniqueCustomers = Array.from(buyerOrderCount.keys()).length;
	const repeatCustomers = Array.from(buyerOrderCount.values()).filter(c => c > 1).length;
	const repeatCustomerRate = uniqueCustomers > 0 ? (repeatCustomers / uniqueCustomers) * 100 : 0;
	const avgItemsPerOrder = totalOrders > 0 ? totalUnitsSold / totalOrders : 0;
	const avgOrderValue = totalOrders > 0 ? revenueSum / totalOrders : 0;
	return {
		totalOrders,
		totalUnitsSold,
		avgItemsPerOrder,
		avgOrderValue,
		uniqueCustomers,
		repeatCustomerRate
	};
};

export const SalesTrendChart: React.FC<{ data: SalesTrendPoint[]; showSeeMore?: boolean }> = ({ data, showSeeMore = false }) => (
	<div className="bg-white rounded-lg shadow-sm border border-gray-100 p-4">
		<div className="flex items-center justify-between mb-4">
			<h3 className="text-lg font-semibold text-gray-900">Sales Trend</h3>
			<div className="flex items-center space-x-4">
				<div className="flex items-center"><div className="w-3 h-3 rounded-full bg-[#3B82F6] mr-2"></div><span className="text-sm text-gray-600 font-medium">Orders</span></div>
				<div className="flex items-center"><div className="w-3 h-3 rounded-full bg-[#10B981] mr-2"></div><span className="text-sm text-gray-600 font-medium">Units</span></div>
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
		<ResponsiveContainer width="100%" height={320}>
			<BarChart data={data} margin={{ top: 20, right: 30, left: 40, bottom: 20 }}>
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
									{payload.map((entry: any, index: number) => (
										<div key={index} className="flex items-center space-x-2 mb-1">
											<div className="w-3 h-3 rounded-full" style={{ backgroundColor: entry.dataKey === 'orders' ? '#3B82F6' : '#10B981' }} />
											<span className="text-gray-700">{entry.dataKey === 'orders' ? 'Orders' : 'Units'} : {entry.value}</span>
										</div>
									))}
							</div>
						);
					}
					return null;
					}}
					cursor={{ fill: '#F1F5F9', fillOpacity: 0.3 }}
				/>
				<Bar dataKey="orders" name="Orders" fill="url(#ordersGradient)" radius={[6,6,0,0]} maxBarSize={40} />
				<Bar dataKey="units" name="Units" fill="url(#unitsGradient)" radius={[6,6,0,0]} maxBarSize={40} />
			</BarChart>
		</ResponsiveContainer>
	</div>
);

export const CustomerUnitsSoldCard: React.FC<{ unitsSold: number; userCurrency?: string }> = ({ unitsSold }) => (
	<AnalyticsMetricCard
		title="Units Sold"
		value={unitsSold.toLocaleString()}
		change={0}
		icon={<Package className="w-6 h-6 text-green-600" />}
		color="bg-[#e6f7ec]"
	/>
);

// ===== Main Page Component (unchanged) =====
const CustomerSalesAnalytics: React.FC = () => {
	const { user } = useUserStore();
	const [orders, setOrders] = useState<Order[]>([]);
	const [products, setProducts] = useState<Product[]>([]);
	const [buyers, setBuyers] = useState<BuyerLite[]>([]);
	const [loading, setLoading] = useState(true);
	const [hasData, setHasData] = useState(false);

	const userCurrency = user?.currency || 'IDR';

	useEffect(() => {
		const fetchData = async () => {
			try {
				setLoading(true);
				let ordersResponse: Response | undefined;
				let productsResponse: Response | undefined;
				let buyersResponse: Response | undefined;

				if (user?.id) {
					[ordersResponse, productsResponse, buyersResponse] = await Promise.all([
						fetch(`/api/orders?userId=${user.id}&limit=1000`),
						fetch(`/api/products?userId=${user.id}&limit=1000`),
						fetch(`/api/buyers?userId=${user.id}&limit=100`)
					]);
				} else {
					[ordersResponse, productsResponse, buyersResponse] = await Promise.all([
						fetch(`/api/orders?limit=1000`),
						fetch(`/api/products?userId=1&limit=1000`),
						fetch(`/api/buyers?userId=1&limit=100`)
					]);
				}

				let ordersList: Order[] = [];
				let productsList: Product[] = [];
				let buyersList: BuyerLite[] = [];

				if (ordersResponse && ordersResponse.ok) {
					const ordersData = await ordersResponse.json();
					ordersList = ordersData.orders || ordersData || [];
				}
				if (productsResponse && productsResponse.ok) {
					const productsData = await productsResponse.json();
					productsList = productsData.products || productsData || [];
				}
				if (buyersResponse && buyersResponse.ok) {
					const buyersData = await buyersResponse.json();
					buyersList = buyersData.buyers || buyersData || [];
				}
				if ((!buyersList || buyersList.length === 0)) {
					try {
						const alt = await fetch(`/api/buyers?userId=1&limit=100`);
						if (alt.ok) {
							const altData = await alt.json();
							buyersList = altData.buyers || altData || [];
						}
					} catch {}
				}

				setOrders(ordersList);
				setProducts(productsList);
				setBuyers(buyersList);
				setHasData((ordersList?.length || 0) > 0);
			} finally {
				setLoading(false);
			}
		};
		fetchData();
	}, [user?.id]);

	// Derived metrics
	const metrics = useMemo(() => calculateSalesMetrics(orders, products, hasData), [orders, products, hasData]);

	// Sales trend
	const salesTrend = useMemo(() => calculateSalesTrend(orders, hasData), [orders, hasData]);

	// Category units (better than duplicating Top Products already in financial)
	const unitsByCategory = useMemo(() => {
		if (!hasData || orders.length === 0) return [] as { category: string; units: number }[];
		const map: Record<string, number> = {};
		orders.forEach(o => {
			if (!o.orderItems) return;
			o.orderItems.forEach(it => {
				const prod = products.find(p => p.productId === it.productId);
				const category = it.category || prod?.category || 'Uncategorized';
				map[category] = (map[category] || 0) + it.quantity;
			});
		});
		return Object.entries(map).map(([category, units]) => ({ category, units }))
			.sort((a, b) => b.units - a.units)
			.slice(0, 8);
	}, [orders, products, hasData]);

	// Top customers by revenue
	type TopCustomer = { buyerId: string | number; name: string; businessType: string; orders: number; revenue: number };
	const topCustomers: TopCustomer[] = useMemo(() => {
		if (!hasData || orders.length === 0) return [] as TopCustomer[];
		const map = new Map<string | number, { orders: number; revenue: number }>();
		orders.forEach(o => {
			let orderRevenue = 0;
			if (o.orderItems && Array.isArray(o.orderItems)) {
				o.orderItems.forEach(i => {
					const prod = products.find(p => p.productId === i.productId);
					const unitPrice = prod ? parseCurrencyToNumber(prod.sellingPrice || '0') : i.unitPrice || 0;
					orderRevenue += unitPrice * i.quantity;
				});
			} else if (o.totalAmount) {
				orderRevenue = parseFloat(String(o.totalAmount));
			}
			const cur = map.get(o.buyerId as any) || { orders: 0, revenue: 0 };
			map.set(o.buyerId as any, { orders: cur.orders + 1, revenue: cur.revenue + orderRevenue });
		});
		const buyerIndex = new Map<string, BuyerLite>();
		buyers.forEach(b => buyerIndex.set(b.buyerId, b));
		return Array.from(map.entries())
			.map(([buyerId, v]) => {
				const buyer = buyerIndex.get(String(buyerId));
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
					revenue: v.revenue
				};
			})
			.sort((a, b) => b.revenue - a.revenue);
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

	if (!hasData) {
		return (
			<div className="p-6">
				<div className="text-center py-12">
					<div className="w-24 h-24 mx-auto mb-6 bg-gray-100 rounded-full flex items-center justify-center">
						<Users className="w-12 h-12 text-gray-400" />
					</div>
					<h3 className="text-xl font-semibold text-gray-900 mb-2">No Customer/Sales Data</h3>
					<p className="text-gray-500 mb-6 max-w-md mx-auto">Add orders to see customer and sales analytics.</p>
				</div>
			</div>
		);
	}

	return (
		<div className="space-y-4">
			{/* Key Metrics */}
			<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
				<AnalyticsMetricCard
					title="Total Orders"
					value={String(metrics.totalOrders)}
					change={0}
					icon={<ShoppingCart className="w-6 h-6 text-[#0a61d7]" />}
					color="bg-[#f7faff]"
				/>
				<AnalyticsMetricCard
					title="Units Sold"
					value={metrics.totalUnitsSold.toLocaleString()}
					change={0}
					icon={<Package className="w-6 h-6 text-green-600" />}
					color="bg-[#e6f7ec]"
				/>
				<AnalyticsMetricCard
					title="Avg Items / Order"
					value={metrics.avgItemsPerOrder.toFixed(2)}
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
						<h3 className="text-lg font-semibold text-gray-900 mb-6">Units by Category</h3>
						<ResponsiveContainer width="100%" height={284}>
							<PieChart>
								<Pie data={unitsByCategory} dataKey="units" nameKey="category" cx="50%" cy="50%" innerRadius={70} outerRadius={110} paddingAngle={2} stroke="white" strokeWidth={2} cornerRadius={8}>
									{unitsByCategory.map((_, i) => (
										<Cell key={i} fill={COLORS[i % COLORS.length]} />
									))}
								</Pie>
								<Tooltip 
									formatter={(value: number, name: string, props: any) => [
										`${value} units`, `${props?.payload?.category || name}`
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
								<th className="py-3 px-4 font-medium uppercase text-center">Revenue</th>
							</tr>
						</thead>
						<tbody className="bg-white">
							{pagedCustomers.map((c, idx) => (
								<tr key={idx} className="border-b transition-colors">
									<td className="py-3 px-4 text-left text-black">{String(c.buyerId)}</td>
									<td className="py-3 px-4 text-left text-black">{c.name}</td>
									<td className="py-3 px-4 text-left text-black">{c.businessType}</td>
									<td className="py-3 px-4 text-center text-black">{c.orders}</td>
									<td className="py-3 px-4 text-center font-semibold text-black">{formatCurrencyShared(c.revenue, userCurrency)}</td>
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
