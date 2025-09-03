'use client';

import React, { useEffect, useRef, useState } from 'react';
import CustomerSalesAnalytics from '@/components/analyticsperformance/CustomerSalesAnalytics';
import { Calendar, ChevronDown, Download } from 'lucide-react';

export default function SalesAnalyticsPage() {
	const [timeRange, setTimeRange] = useState('1M');
	const [isDropdownOpen, setIsDropdownOpen] = useState(false);
	const dropdownRef = useRef<HTMLDivElement>(null);

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

	const handleExport = async () => {
		try {
			const ordersResponse = await fetch('/api/orders?userId=1&limit=1000');
			const productsResponse = await fetch('/api/products?userId=1&limit=1000');
			if (!ordersResponse.ok || !productsResponse.ok) throw new Error('Failed to fetch data');
			const ordersData = await ordersResponse.json();
			const productsData = await productsResponse.json();
			const blob = new Blob([JSON.stringify({ timeRange, orders: ordersData.orders || [], products: productsData.products || [] }, null, 2)], { type: 'application/json' });
			const link = document.createElement('a');
			const url = URL.createObjectURL(blob);
			link.setAttribute('href', url);
			link.setAttribute('download', `sales-analytics-${timeRange}-${new Date().toISOString().split('T')[0]}.json`);
			link.style.visibility = 'hidden';
			document.body.appendChild(link);
			link.click();
			document.body.removeChild(link);
		} catch (e) {
			alert('Failed to export data. Please try again.');
		}
	};

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
