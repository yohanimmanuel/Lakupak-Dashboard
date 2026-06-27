"use client";

import React, { useEffect, useMemo, useState, useRef } from 'react';
import {
	Bar,
	BarChart,
	CartesianGrid,
	ComposedChart,
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
import { useAnalyticsTranslations } from '@/hooks/useAnalyticsTranslations';
import { AnalyticsTimeRange, filterOrdersByTimeRange } from '@/utils/analyticsTimeRange';

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
	avatar?: string | null;
	status?: string;
	createdAt?: string;
	updatedAt?: string;
}

const CHURNED_BUYER_STATUSES = new Set(['Inactive', 'Blocked']);

function monthBucket(date: Date, dateLocale: string): { key: string; label: string } {
	const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
	const label = date.toLocaleDateString(dateLocale, { month: 'short', year: 'numeric' });
	return { key, label };
}

function monthLabelShort(date: Date, dateLocale: string): string {
	return date.toLocaleDateString(dateLocale, { month: 'short' });
}

export type CustomerAcquisitionPoint = {
	month: string;
	acquired: number;
	churned: number;
	net: number;
};

export const calculateCustomerAcquisitionTrend = (
	buyers: BuyerLite[],
	hasData: boolean,
	dateLocale = 'en-US'
): CustomerAcquisitionPoint[] => {
	if (!hasData || buyers.length === 0) return [];

	const monthly = new Map<string, { acquired: number; churned: number }>();

	buyers.forEach((buyer) => {
		if (!buyer.createdAt) return;
		const createdAt = new Date(buyer.createdAt);
		if (Number.isNaN(createdAt.getTime())) return;

		const createdBucket = monthBucket(createdAt, dateLocale);
		const createdRow = monthly.get(createdBucket.key) ?? { acquired: 0, churned: 0 };
		createdRow.acquired += 1;
		monthly.set(createdBucket.key, createdRow);

		const status = buyer.status ?? 'Active';
		if (!CHURNED_BUYER_STATUSES.has(status) || !buyer.updatedAt) return;

		const updatedAt = new Date(buyer.updatedAt);
		if (Number.isNaN(updatedAt.getTime()) || updatedAt.getTime() <= createdAt.getTime()) return;

		const churnBucket = monthBucket(updatedAt, dateLocale);
		const churnRow = monthly.get(churnBucket.key) ?? { acquired: 0, churned: 0 };
		churnRow.churned += 1;
		monthly.set(churnBucket.key, churnRow);
	});

	return Array.from(monthly.entries())
		.filter(([, row]) => row.acquired > 0 || row.churned > 0)
		.sort(([a], [b]) => a.localeCompare(b))
		.map(([key, row]) => {
			const [yearStr, monthStr] = key.split('-');
			const date = new Date(Number(yearStr), Number(monthStr) - 1, 1);
			const bucket = monthBucket(date, dateLocale);
			return {
				month: bucket.label,
				acquired: row.acquired,
				churned: row.churned,
				net: row.acquired - row.churned,
			};
		});
};

export const CustomerAcquisitionChart: React.FC<{ data: CustomerAcquisitionPoint[] }> = ({ data }) => {
	const { tCharts } = useAnalyticsTranslations();

	if (data.length === 0) {
		return (
			<div className="bg-white rounded-lg border border-[#e6e6e6] p-4">
				<h3 className="text-lg font-semibold text-gray-900 mb-4">{tCharts('customerAcquisition')}</h3>
				<div className="h-[320px] flex items-center justify-center">
					<div className="text-center">
						<Users className="w-12 h-12 text-gray-300 mx-auto mb-2" />
						<p className="text-gray-500 text-sm">{tCharts('noCustomerAcquisitionData')}</p>
						<p className="text-gray-400 text-xs">{tCharts('noCustomerAcquisitionHint')}</p>
					</div>
				</div>
			</div>
		);
	}

	const latest = data[data.length - 1];

	return (
		<div className="bg-white rounded-lg border border-[#e6e6e6] p-4">
			<div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-6">
				<h3 className="text-lg font-semibold text-gray-900">{tCharts('customerAcquisition')}</h3>
				<div className="flex flex-wrap items-center gap-x-4 gap-y-2">
					<div className="flex items-center">
						<div className="w-3 h-3 rounded-full bg-[#10B981] mr-2" />
						<span className="text-sm text-gray-600 font-medium">{tCharts('acquiredLegend')}</span>
					</div>
					<div className="flex items-center">
						<div className="w-3 h-3 rounded-full bg-[#EF4444] mr-2" />
						<span className="text-sm text-gray-600 font-medium">{tCharts('churnedLegend')}</span>
					</div>
					<div className="flex items-center">
						<div className="w-3 h-3 rounded-full bg-[#6366F1] mr-2" />
						<span className="text-sm text-gray-600 font-medium">{tCharts('netGrowthLegend')}</span>
					</div>
				</div>
			</div>
			<ResponsiveContainer width="100%" height={320}>
				<ComposedChart data={data} margin={{ top: 20, right: 30, left: 40, bottom: 20 }}>
					<defs>
						<linearGradient id="acquiredGradient" x1="0" y1="0" x2="0" y2="1">
							<stop offset="0%" stopColor="#10B981" stopOpacity={0.9} />
							<stop offset="100%" stopColor="#059669" stopOpacity={0.7} />
						</linearGradient>
						<linearGradient id="churnedGradient" x1="0" y1="0" x2="0" y2="1">
							<stop offset="0%" stopColor="#EF4444" stopOpacity={0.9} />
							<stop offset="100%" stopColor="#DC2626" stopOpacity={0.7} />
						</linearGradient>
					</defs>
					<CartesianGrid strokeDasharray="2 4" stroke="#000000" strokeOpacity={0.2} horizontal vertical={false} />
					<XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#6B7280' }} />
					<YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#6B7280' }} allowDecimals={false} />
					<Tooltip
						content={({ active, payload, label }) => {
							if (!active || !payload?.length) return null;
							return (
								<div className="bg-white rounded-xl border border-[#e6e6e6] p-4">
									<p className="font-semibold text-gray-900 mb-2">{label}</p>
									{payload.map((entry: { dataKey: string; value: number; color?: string }, index: number) => {
										let labelText = '';
										if (entry.dataKey === 'acquired') labelText = tCharts('acquiredLegend');
										else if (entry.dataKey === 'churned') labelText = tCharts('churnedLegend');
										else if (entry.dataKey === 'net') labelText = tCharts('netGrowthLegend');
										return (
											<div key={index} className="flex items-center space-x-2 mb-1">
												<div className="w-3 h-3 rounded-full" style={{ backgroundColor: entry.color }} />
												<span className="text-gray-700">{labelText}: {entry.value}</span>
											</div>
										);
									})}
								</div>
							);
						}}
						cursor={{ fill: '#F1F5F9', fillOpacity: 0.3 }}
					/>
					<Bar dataKey="acquired" name={tCharts('acquiredLegend')} fill="url(#acquiredGradient)" radius={[6, 6, 0, 0]} maxBarSize={36} />
					<Bar dataKey="churned" name={tCharts('churnedLegend')} fill="url(#churnedGradient)" radius={[6, 6, 0, 0]} maxBarSize={36} />
					<Line type="monotone" dataKey="net" name={tCharts('netGrowthLegend')} stroke="#6366F1" strokeWidth={2} dot={{ fill: '#6366F1', r: 3 }} />
				</ComposedChart>
			</ResponsiveContainer>
			<div className="mt-4 pt-4 border-t border-[#e6e6e6] flex flex-wrap items-center gap-4 text-sm">
				<div>
					<span className="text-xs text-gray-500">{tCharts('latestMonthAcquired')}: </span>
					<span className="font-semibold text-green-600">{latest.acquired}</span>
				</div>
				<div>
					<span className="text-xs text-gray-500">{tCharts('latestMonthChurned')}: </span>
					<span className="font-semibold text-red-600">{latest.churned}</span>
				</div>
				<div>
					<span className="text-xs text-gray-500">{tCharts('latestMonthNet')}: </span>
					<span className={`font-semibold ${latest.net >= 0 ? 'text-indigo-600' : 'text-red-600'}`}>
						{latest.net >= 0 ? `+${latest.net}` : latest.net}
					</span>
				</div>
			</div>
		</div>
	);
};

// ===== Reusable types & utilities (exported) =====
export type SalesTrendPoint = { month: string; orders: number; pieces: number; units: number };

export const calculateSalesTrend = (
	orders: Order[],
	hasData: boolean,
	dateLocale = 'en-US'
): SalesTrendPoint[] => {
	if (!hasData || orders.length === 0) return [];
	const monthly: Record<string, { orders: number; pieces: number; units: number; label: string }> = {};
	orders.forEach(o => {
		const d = new Date(o.orderDate);
		const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2,'0')}`;
		const label = monthLabelShort(d, dateLocale);
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
			// Handle Decimal types from Prisma
			const amount = typeof order.totalAmount === 'number' 
				? (Number.isFinite(order.totalAmount) && !isNaN(order.totalAmount) ? order.totalAmount : 0)
				: (typeof order.totalAmount === 'object' && order.totalAmount !== null && 'toNumber' in order.totalAmount
					? (() => {
						try {
							const num = (order.totalAmount as { toNumber: () => number }).toNumber();
							return Number.isFinite(num) && !isNaN(num) ? num : 0;
						} catch {
							return 0;
						}
					})()
					: parseFloat(String(order.totalAmount)) || 0);
			revenueSum += amount;
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
	const { tShared, tCharts } = useAnalyticsTranslations();
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
			salesForecast.forecast.forEach(f => {
				combined.push({ month: f.date, orders: f.value, pieces: 0, units: 0, isForecast: true });
			});
		}
		return combined;
	}, [data, salesForecast]);

	return (
		<div className="bg-white rounded-lg border border-[#e6e6e6] p-4">
			<div className="flex items-center justify-between mb-4">
				<h3 className="text-lg font-semibold text-gray-900">
					{salesForecast
						? `${tCharts('salesTrend')}${tCharts('salesTrendForecastSuffix')}`
						: tCharts('salesTrend')}
				</h3>
				<div className="flex items-center space-x-4">
					<div className="flex items-center"><div className="w-3 h-3 rounded-full bg-[#3B82F6] mr-2"></div><span className="text-sm text-gray-600 font-medium">{tCharts('ordersLegend')}</span></div>
					<div className="flex items-center"><div className="w-3 h-3 rounded-full bg-[#10B981] mr-2"></div><span className="text-sm text-gray-600 font-medium">{tCharts('unitsLegend')}</span></div>
					{salesForecast && (
						<div className="flex items-center"><div className="w-3 h-3 border-2 border-dashed border-[#9CA3AF] rounded-full mr-2"></div><span className="text-sm text-gray-600 font-medium">{tCharts('forecast')}</span></div>
					)}
					{showSeeMore && (
						<button 
							onClick={() => (window.location.href = '/analytics/sales')}
							className="flex items-center px-3 py-1.5 text-xs font-medium text-black bg-white shadow-sm hover:bg-gray-100 rounded-md transition-colors"
						>
							{tShared('seeMore')}
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
								<div className="bg-white rounded-xl border border-[#e6e6e6] p-4">
									<div className="flex items-center mb-2">
										<div className="w-3 h-3 rounded-full bg-[#0a61d7] mr-2"></div>
										<p className="font-semibold text-gray-900">{label}</p>
									</div>
									{payload.map((entry: { dataKey: string; value: number }, index: number) => {
										let label = '';
										let color = '';
										if (entry.dataKey === 'orders') {
											label = tCharts('ordersLegend');
											color = '#3B82F6';
										} else if (entry.dataKey === 'units') {
											label = tCharts('unitsLegend');
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
					<Bar dataKey="orders" name={tCharts('ordersLegend')} fill="url(#ordersGradient)" radius={[6,6,0,0]} maxBarSize={40} />
					<Bar dataKey="units" name={tCharts('unitsLegend')} fill="url(#unitsGradient)" radius={[6,6,0,0]} maxBarSize={40} />
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

export const CustomerPiecesSoldCard: React.FC<{ piecesSold: number; unitsSold: number; change: number | null; userCurrency?: string }> = ({ piecesSold, unitsSold, change }) => {
	const { tMetrics } = useAnalyticsTranslations();
	return (
		<AnalyticsMetricCard
			title={tMetrics('piecesSold')}
			value={`${piecesSold.toLocaleString()}`}
			change={change}
			icon={<Package className="w-6 h-6 text-green-600" />}
			color="bg-[#e6f7ec]"
		/>
	);
};

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
        variants: variantDefinitions
      }
    }
    buyers(userId: $userId, limit: $buyerLimit) {
      nodes {
        buyerId
        storeName
        owner
        businessType
        avatar
        status
        createdAt
        updatedAt
      }
    }
  }
`;

export type SalesTimeRange = AnalyticsTimeRange;

type CustomerSalesAnalyticsProps = {
	timeRange?: SalesTimeRange;
};

const CustomerSalesAnalytics: React.FC<CustomerSalesAnalyticsProps> = ({ timeRange = '1M' }) => {
	const { user } = useUserStore();
	const { tShared, tMetrics, tCharts, tTables, translateCategoryFilter, translateForecastTrend, dateLocale } = useAnalyticsTranslations();
	const [orders, setOrders] = useState<Order[]>([]);
	const [products, setProducts] = useState<Product[]>([]);
	const [buyers, setBuyers] = useState<BuyerLite[]>([]);
	const [loading, setLoading] = useState(true);
	const [hasData, setHasData] = useState(false);
	const [categoryFilter, setCategoryFilter] = useState<'productType' | 'productCategory'>('productCategory');
	const [isCategoryDropdownOpen, setIsCategoryDropdownOpen] = useState(false);
	const categoryDropdownRef = useRef<HTMLDivElement>(null);

	const userCurrency = user?.currency || 'IDR';

	const categoryOptions = useMemo(
		() => [
			{ value: 'productCategory' as const, label: translateCategoryFilter('productCategory') },
			{ value: 'productType' as const, label: translateCategoryFilter('productType') },
		],
		[translateCategoryFilter],
	);

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
					buyerLimit: 1000,
				});

				const ordersList = data.orders?.nodes ?? [];
				const productsList = (data.products?.nodes ?? []).map((product) => ({
					...product,
					variants: (product.variants ?? []) as Product['variants'],
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

	// Restrict orders to the selected time-range window so every metric/graph reacts to the dropdown
	const filteredOrders = useMemo(() => filterOrdersByTimeRange(orders, timeRange), [orders, timeRange]);

	const hasFilteredData = hasData && filteredOrders.length > 0;

	// Derived metrics
	const metrics = useMemo(() => calculateSalesMetrics(filteredOrders, products, hasFilteredData), [filteredOrders, products, hasFilteredData, userCurrency]);

	// Sales trend
	const salesTrend = useMemo(() => calculateSalesTrend(filteredOrders, hasFilteredData, dateLocale), [filteredOrders, hasFilteredData, dateLocale]);

	const hasBuyerData = buyers.length > 0;
	const customerAcquisitionTrend = useMemo(
		() => calculateCustomerAcquisitionTrend(buyers, hasBuyerData, dateLocale),
		[buyers, hasBuyerData, dateLocale]
	);

	// Sales forecast
	const salesForecast = useMemo(() => {
		if (salesTrend.length < 2) return null;
		return forecastSales(salesTrend, 'orders', 3);
	}, [salesTrend]);

	// Month-over-month growth metrics for key cards
	const growthMetrics = useMemo(() => {
		if (!hasFilteredData || salesTrend.length < 2) {
			return {
				ordersGrowth: null as number | null,
				piecesGrowth: null as number | null,
				avgPiecesGrowth: null as number | null,
				avgOrderValueGrowth: null as number | null,
			};
		}

		const last = salesTrend[salesTrend.length - 1];
		const prev = salesTrend[salesTrend.length - 2];

		const ordersGrowth =
			prev.orders > 0 ? ((last.orders - prev.orders) / prev.orders) * 100 : null;

		const unitsCurrent = last.units;
		const unitsPrev = prev.units;
		const piecesGrowth =
			unitsPrev > 0 ? ((unitsCurrent - unitsPrev) / unitsPrev) * 100 : null;

		const avgPiecesLast = last.orders > 0 ? last.units / last.orders : 0;
		const avgPiecesPrev = prev.orders > 0 ? prev.units / prev.orders : 0;
		const avgPiecesGrowth =
			avgPiecesPrev !== 0 ? ((avgPiecesLast - avgPiecesPrev) / Math.abs(avgPiecesPrev)) * 100 : null;

		// For Avg Order Value, compute monthly revenue per order from orders list
		const monthlyRevenue: Record<string, { revenue: number; orders: number }> = {};
		filteredOrders.forEach(o => {
			const d = new Date(o.orderDate);
			const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2,'0')}`;
			if (!monthlyRevenue[key]) {
				monthlyRevenue[key] = { revenue: 0, orders: 0 };
			}
			const amount = o.totalAmount
				? (typeof o.totalAmount === 'number'
						? (Number.isFinite(o.totalAmount) && !isNaN(o.totalAmount) ? o.totalAmount : 0)
						: (typeof o.totalAmount === 'object' && o.totalAmount !== null && 'toNumber' in o.totalAmount
							? (() => {
								try {
									const num = (o.totalAmount as { toNumber: () => number }).toNumber();
									return Number.isFinite(num) && !isNaN(num) ? num : 0;
								} catch {
									return 0;
								}
							})()
							: parseFloat(String(o.totalAmount)) || 0))
				: 0;
			monthlyRevenue[key].revenue += amount;
			monthlyRevenue[key].orders += 1;
		});

		const monthlyKeysSorted = Object.keys(monthlyRevenue).sort();
		if (monthlyKeysSorted.length < 2) {
			return {
				ordersGrowth,
				piecesGrowth,
				avgPiecesGrowth,
				avgOrderValueGrowth: null,
			};
		}
		const lastKey = monthlyKeysSorted[monthlyKeysSorted.length - 1];
		const prevKey = monthlyKeysSorted[monthlyKeysSorted.length - 2];
		const lastMonth = monthlyRevenue[lastKey];
		const prevMonth = monthlyRevenue[prevKey];

		const lastAov = lastMonth.orders > 0 ? lastMonth.revenue / lastMonth.orders : 0;
		const prevAov = prevMonth.orders > 0 ? prevMonth.revenue / prevMonth.orders : 0;
		const avgOrderValueGrowth =
			prevAov !== 0 ? ((lastAov - prevAov) / Math.abs(prevAov)) * 100 : null;

		return {
			ordersGrowth,
			piecesGrowth,
			avgPiecesGrowth,
			avgOrderValueGrowth,
		};
	}, [hasFilteredData, salesTrend, filteredOrders]);

	// Category units (better than duplicating Top Products already in financial)
	const unitsByCategory = useMemo(() => {
		if (!hasFilteredData || filteredOrders.length === 0) return [] as { category: string; units: number }[];
		const map: Record<string, number> = {};
		filteredOrders.forEach(o => {
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
	}, [filteredOrders, products, hasFilteredData, categoryFilter]);

	// Top customers (exclude deleted/missing buyers)
	type TopCustomer = { buyerId: string | number; name: string; businessType: string; orders: number; totalValue: number; avatar?: string | null };
	const topCustomers: TopCustomer[] = useMemo(() => {
		if (!hasFilteredData || filteredOrders.length === 0) return [] as TopCustomer[];
		const map = new Map<string | number, { orders: number; totalValue: number }>();
		filteredOrders.forEach(o => {
			const buyerKey = String(o.buyerId);
			const cur = map.get(buyerKey) || { orders: 0, totalValue: 0 };
			// Rank by actual purchase volume: use full order total (handle Prisma Decimal types)
			let orderAmount = 0;
			if (o.totalAmount != null) {
				if (typeof o.totalAmount === 'number') {
					orderAmount = Number.isFinite(o.totalAmount) && !isNaN(o.totalAmount) ? o.totalAmount : 0;
				} else if (typeof o.totalAmount === 'object' && 'toNumber' in o.totalAmount) {
					try {
						const num = (o.totalAmount as { toNumber: () => number }).toNumber();
						orderAmount = Number.isFinite(num) && !isNaN(num) ? num : 0;
					} catch {
						orderAmount = 0;
					}
				} else {
					orderAmount = parseFloat(String(o.totalAmount)) || 0;
				}
			}
			map.set(buyerKey, { orders: cur.orders + 1, totalValue: cur.totalValue + orderAmount });
		});
		const buyerIndex = new Map<string, BuyerLite>();
		buyers.forEach(b => buyerIndex.set(b.buyerId, b));
		return Array.from(map.entries())
			.flatMap(([buyerId, v]) => {
				const buyer = buyerIndex.get(String(buyerId));
				if (!buyer) return [];
				const orderForBuyer = filteredOrders.find(o => String(o.buyerId) === String(buyerId));
				const orderDerivedName = orderForBuyer?.storeName || orderForBuyer?.contactPerson;
				const displayName = (buyer?.storeName && String(buyer.storeName).trim().length > 0)
					? (buyer.storeName as string)
					: ((buyer?.owner && String(buyer.owner).trim().length > 0) ? (buyer.owner as string)
					: (orderDerivedName && String(orderDerivedName).trim().length > 0 ? String(orderDerivedName) : String(buyerId)));
				const displayBusinessType = (buyer?.businessType as string) || '—';
				return [{
					buyerId,
					name: displayName,
					businessType: displayBusinessType,
					orders: v.orders,
					totalValue: v.totalValue,
					avatar: buyer.avatar ?? null,
				} satisfies TopCustomer];
			})
			.sort((a, b) => b.totalValue - a.totalValue);
	}, [filteredOrders, products, buyers, hasFilteredData]);

	// Pagination for Top Customers
	const customersPerPage = 5;
	const [customerPage, setCustomerPage] = useState(1);

	// Reset customer pagination when the time window changes to avoid landing on an empty page
	useEffect(() => {
		setCustomerPage(1);
	}, [timeRange]);
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
		<div className="space-y-3">
			{/* Key Metrics */}
			<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 mt-6">
				<AnalyticsMetricCard
					title={tMetrics('totalOrders')}
					value={String(metrics.totalOrders)}
					change={growthMetrics.ordersGrowth}
					icon={<ShoppingCart className="w-6 h-6 text-[#0a61d7]" />}
					color="bg-[#f7faff]"
				/>
				<CustomerPiecesSoldCard
					piecesSold={metrics.totalPiecesSold || 0}
					unitsSold={metrics.totalUnitsSold}
					change={growthMetrics.piecesGrowth}
					userCurrency={user?.currency}
				/>
				<AnalyticsMetricCard
					title={tMetrics('avgPiecesPerOrder')}
					value={`${(metrics.avgPiecesPerOrder || 0).toFixed(2)}`}
					change={growthMetrics.avgPiecesGrowth}
					icon={<TrendingUp className="w-6 h-6 text-amber-500" />}
					color="bg-[#fff7ed]"
				/>
				<AnalyticsMetricCard
					title={tMetrics('avgOrderValue')}
					value={formatCurrencyShared(metrics.avgOrderValue, userCurrency)}
					change={growthMetrics.avgOrderValueGrowth}
					icon={<Repeat className="w-6 h-6 text-violet-600" />}
					color="bg-[#f5f3ff]"
				/>
			</div>

			{/* Charts */}
			<div className="grid grid-cols-1 lg:grid-cols-11 gap-3">
				{/* Sales Trend (Orders & Units) */}
				<div className="lg:col-span-6">
					<SalesTrendChart data={salesTrend} showForecast={false} />
				</div>

				{/* Units by Category (Pie) */}
				<div className="lg:col-span-5">
					<div className="bg-white rounded-lg border border-[#e6e6e6] p-4">
						<div className="flex items-center justify-between mb-6">
							<h3 className="text-lg font-semibold text-gray-900">{tCharts('unitsByCategory')}</h3>
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
									formatter={(value: number, name: string, props: { payload?: { category?: string } }) => {
										const category = props?.payload?.category ?? name;
										const displayCategory = category === 'Uncategorized' ? tShared('uncategorized') : category;
										return [`${value} ${tShared('unitsSuffix')}`, displayCategory];
									}}
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
									<span className="text-sm text-gray-700 font-medium">
										{entry.category === 'Uncategorized' ? tShared('uncategorized') : entry.category}
									</span>
								</div>
							))}
						</div>
					</div>
				</div>
			</div>

			{/* Sales Trend Forecast */}
			<div className="bg-white rounded-lg border border-[#e6e6e6] p-4">
				<div className="flex items-center justify-between mb-6">
					<h3 className="text-lg font-semibold text-gray-900">{tCharts('salesTrendForecast')}</h3>
					{salesForecast && salesForecast.forecast.length > 0 && (
						<div className="flex items-center space-x-4">
							<div className="flex items-center">
								<div className="w-3 h-3 rounded-full bg-[#3B82F6] mr-2"></div>
								<span className="text-sm text-gray-600 font-medium">{tCharts('historicalOrders')}</span>
							</div>
							<div className="flex items-center">
								<div className="w-3 h-3 border-2 border-dashed border-[#9CA3AF] rounded-full mr-2"></div>
								<span className="text-sm text-gray-600 font-medium">{tCharts('forecast')}</span>
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
												<div className="bg-white rounded-xl border border-[#e6e6e6] p-4">
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
																		{tCharts('ordersTooltip', {
																			count: entry.value,
																			forecastSuffix: isForecast ? tCharts('forecastSuffix') : '',
																		})}
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
									name={tCharts('ordersLegend')} 
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
						<div className="mt-4 pt-4 border-t border-[#e6e6e6] flex items-center justify-between">
							<div className="flex items-center gap-4">
								<div>
									<span className="text-xs text-gray-500">{tShared('trendLabel')} </span>
									<span className={`text-sm font-semibold ${
										salesForecast.trend === 'increasing' ? 'text-green-600' : 
										salesForecast.trend === 'decreasing' ? 'text-red-600' : 
										'text-gray-600'
									}`}>
										{translateForecastTrend(salesForecast.trend)}
									</span>
								</div>
								<div>
									<span className="text-xs text-gray-500">{tShared('confidenceLabel')} </span>
									<span className="text-sm font-semibold text-black">{(salesForecast.confidence * 100).toFixed(1)}%</span>
								</div>
							</div>
						</div>
					</>
				) : (
					<div className="h-[320px] flex items-center justify-center">
						<div className="text-center">
							<TrendingUp className="w-12 h-12 text-gray-300 mx-auto mb-2" />
							<p className="text-gray-500 text-sm">{tCharts('insufficientForecastData')}</p>
							<p className="text-gray-400 text-xs">{tCharts('insufficientForecastHint')}</p>
						</div>
					</div>
				)}
			</div>

			{/* Customer Acquisition */}
			<CustomerAcquisitionChart data={customerAcquisitionTrend} />

			{/* Top Customers Table */}
			<div className="bg-white rounded-lg border border-[#e6e6e6] p-4">
				<h3 className="text-lg font-semibold text-gray-900 mb-4">{tTables('topCustomers')}</h3>
				<div className="overflow-x-auto rounded-lg">
					<table className="min-w-full text-sm text-left whitespace-nowrap text-xs">
						<thead className="bg-gray-100 text-gray-500 whitespace-nowrap">
							<tr>
								<th className="py-3 px-4 font-medium uppercase text-left">{tTables('customer')}</th>
								<th className="py-3 px-4 font-medium uppercase text-left">{tTables('buyer')}</th>
								<th className="py-3 px-4 font-medium uppercase text-left">{tTables('name')}</th>
								<th className="py-3 px-4 font-medium uppercase text-left">{tTables('businessType')}</th>
								<th className="py-3 px-4 font-medium uppercase text-center">{tTables('orders')}</th>
								<th className="py-3 px-4 font-medium uppercase text-right">{tTables('orderVolume')}</th>
							</tr>
						</thead>
						<tbody className="bg-white">
							{pagedCustomers.map((c, idx) => (
								<tr key={idx} className="border-b transition-colors">
									<td className="py-3 px-4 text-left">
										{c.avatar ? (
											<img
												src={c.avatar}
												alt={c.name}
												className="h-10 w-10 rounded-full border border-[#e6e6e6] object-cover"
											/>
										) : (
											<div className="flex h-10 w-10 items-center justify-center rounded-full border border-[#e6e6e6] bg-[#f7faff]">
												<Users className="h-4 w-4 text-[#0a61d7]" />
											</div>
										)}
									</td>
									<td className="py-3 px-4 text-left text-black"><span className="cursor-pointer text-[#0a61d7] font-semibold hover:text-blue-800" onClick={() => (window.location.href = `/clients/buyers/details/${String(c.buyerId)}`)} title={tShared('viewBuyerProfile')}>{String(c.buyerId)}</span></td>
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
						{tShared('pagination.showing', { from: fromCustomer, to: toCustomer, total: totalCustomers })}
					</div>
					<div className="flex items-center gap-3">
						<button
							className="p-2 rounded-lg hover:bg-gray-100 disabled:opacity-50 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
							onClick={() => setCustomerPage(customerPage - 1)}
							disabled={customerPage === 1}
							aria-label={tShared('pagination.previousPage')}
						>
							<ChevronLeft className="w-4 h-4 text-gray-500" />
						</button>
						<button
							className="px-3 py-2 rounded-lg font-semibold text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 bg-[#0a61d7] text-white"
							aria-label={tShared('pagination.pageAria', { page: customerPage })}
							aria-current="page"
						>
							{customerPage}
						</button>
						<button
							className="p-2 rounded-lg hover:bg-gray-100 disabled:opacity-50 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
							onClick={() => setCustomerPage(customerPage + 1)}
							disabled={customerPage === totalCustomerPages}
							aria-label={tShared('pagination.nextPage')}
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
