/**
 * Shared time-range helpers for the Analytics module dropdowns
 * (Per Month / Per Quarter / Per 6 Months / Per Year).
 */

export type AnalyticsTimeRange = '1M' | '3M' | '6M' | '1Y';

/** Number of months each dropdown range looks back from today. */
export const ANALYTICS_TIME_RANGE_MONTHS: Record<AnalyticsTimeRange, number> = {
	'1M': 1,
	'3M': 3,
	'6M': 6,
	'1Y': 12,
};

/**
 * Cutoff date N months before `from`, with day-of-month clamped so month-end dates
 * do not overflow (e.g. Mar 31 minus 1 month → Feb 28, not Mar 3).
 */
function getCutoffMonthsAgo(months: number, from: Date = new Date()): Date {
	const day = from.getDate();
	const cutoff = new Date(from);
	cutoff.setHours(0, 0, 0, 0);
	cutoff.setDate(1);
	cutoff.setMonth(cutoff.getMonth() - months);
	const lastDayOfMonth = new Date(cutoff.getFullYear(), cutoff.getMonth() + 1, 0).getDate();
	cutoff.setDate(Math.min(day, lastDayOfMonth));
	return cutoff;
}

/**
 * Keep only orders whose `orderDate` falls within the selected look-back window.
 * Orders with an invalid/unparseable date are excluded.
 */
export function filterOrdersByTimeRange<T extends { orderDate: string | Date }>(
	orders: T[],
	timeRange: AnalyticsTimeRange,
): T[] {
	const months = ANALYTICS_TIME_RANGE_MONTHS[timeRange] ?? 1;
	const cutoff = getCutoffMonthsAgo(months);
	return orders.filter((order) => {
		const date = new Date(order.orderDate);
		return !Number.isNaN(date.getTime()) && date >= cutoff;
	});
}
