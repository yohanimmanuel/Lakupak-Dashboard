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

export type AnalyticsPeriodBucket = {
	key: string;
	label: string;
	start: Date;
	end: Date;
};

export type AnalyticsGrowthComparisonKey = 'vsLastWeek' | 'vsLastMonth';

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

export function getAnalyticsCutoffDate(
	timeRange: AnalyticsTimeRange,
	from: Date = new Date(),
): Date {
	const months = ANALYTICS_TIME_RANGE_MONTHS[timeRange] ?? 1;
	return getCutoffMonthsAgo(months, from);
}

/** Monday-based week start (local time). */
function getWeekStart(date: Date): Date {
	const d = new Date(date);
	d.setHours(0, 0, 0, 0);
	const day = d.getDay();
	const diff = day === 0 ? -6 : 1 - day;
	d.setDate(d.getDate() + diff);
	return d;
}

function formatMonthLabel(date: Date, locale: string): string {
	return date.toLocaleDateString(locale, { month: 'short', year: 'numeric' });
}

function formatWeekLabel(weekStart: Date, locale: string): string {
	const weekEnd = new Date(weekStart);
	weekEnd.setDate(weekEnd.getDate() + 6);

	const startDay = weekStart.toLocaleDateString(locale, { day: 'numeric', month: 'short' });

	if (weekStart.getMonth() === weekEnd.getMonth() && weekStart.getFullYear() === weekEnd.getFullYear()) {
		return `${startDay} – ${weekEnd.getDate()}`;
	}

	const endDay = weekEnd.toLocaleDateString(locale, { day: 'numeric', month: 'short' });
	return `${startDay} – ${endDay}`;
}

function buildWeeklyBuckets(cutoff: Date, now: Date, locale: string): AnalyticsPeriodBucket[] {
	const buckets: AnalyticsPeriodBucket[] = [];
	let cursor = getWeekStart(cutoff);
	const endLimit = new Date(now);
	endLimit.setHours(23, 59, 59, 999);

	while (cursor <= endLimit) {
		const weekEnd = new Date(cursor);
		weekEnd.setDate(weekEnd.getDate() + 6);
		weekEnd.setHours(23, 59, 59, 999);

		buckets.push({
			key: getAnalyticsBucketKey(cursor, '1M'),
			label: formatWeekLabel(cursor, locale),
			start: new Date(cursor),
			end: weekEnd,
		});

		cursor = new Date(cursor);
		cursor.setDate(cursor.getDate() + 7);
	}

	return buckets;
}

function buildMonthlyBuckets(cutoff: Date, now: Date, locale: string): AnalyticsPeriodBucket[] {
	const buckets: AnalyticsPeriodBucket[] = [];
	const cursor = new Date(cutoff.getFullYear(), cutoff.getMonth(), 1);
	const end = new Date(now.getFullYear(), now.getMonth(), 1);

	while (cursor <= end) {
		const bucketEnd = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0, 23, 59, 59, 999);
		buckets.push({
			key: getAnalyticsBucketKey(cursor, '3M'),
			label: formatMonthLabel(cursor, locale),
			start: new Date(cursor),
			end: bucketEnd,
		});
		cursor.setMonth(cursor.getMonth() + 1);
	}

	return buckets;
}

/**
 * Stable bucket key for grouping orders on trend charts.
 * - Per Month (1M): one bucket per calendar week (Monday start)
 * - Per Quarter / 6 Months / Year: one bucket per calendar month
 */
export function getAnalyticsBucketKey(date: Date, timeRange: AnalyticsTimeRange): string {
	if (timeRange === '1M') {
		const start = getWeekStart(date);
		return `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-${String(start.getDate()).padStart(2, '0')}`;
	}

	return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * Pre-filled period buckets for the selected range so charts always show the full window,
 * including empty periods with zero values.
 */
export function getAnalyticsPeriodBuckets(
	timeRange: AnalyticsTimeRange,
	options?: { now?: Date; locale?: string },
): AnalyticsPeriodBucket[] {
	const now = options?.now ?? new Date();
	const locale = options?.locale ?? 'en-US';
	const cutoff = getAnalyticsCutoffDate(timeRange, now);

	if (timeRange === '1M') {
		return buildWeeklyBuckets(cutoff, now, locale);
	}

	return buildMonthlyBuckets(cutoff, now, locale);
}

/** Forward-looking period buckets that match the selected range granularity. */
export function getForecastPeriodBuckets(
	timeRange: AnalyticsTimeRange,
	anchorEnd: Date,
	count: number,
	locale = 'en-US',
): AnalyticsPeriodBucket[] {
	if (count <= 0) return [];

	const buckets: AnalyticsPeriodBucket[] = [];

	if (timeRange === '1M') {
		let cursor = getWeekStart(anchorEnd);
		cursor.setDate(cursor.getDate() + 7);

		for (let i = 0; i < count; i += 1) {
			const weekEnd = new Date(cursor);
			weekEnd.setDate(weekEnd.getDate() + 6);
			weekEnd.setHours(23, 59, 59, 999);

			buckets.push({
				key: getAnalyticsBucketKey(cursor, '1M'),
				label: formatWeekLabel(cursor, locale),
				start: new Date(cursor),
				end: weekEnd,
			});

			cursor.setDate(cursor.getDate() + 7);
		}

		return buckets;
	}

	let cursor = new Date(anchorEnd.getFullYear(), anchorEnd.getMonth() + 1, 1);
	cursor.setHours(0, 0, 0, 0);

	for (let i = 0; i < count; i += 1) {
		const bucketEnd = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0, 23, 59, 59, 999);
		buckets.push({
			key: getAnalyticsBucketKey(cursor, '3M'),
			label: formatMonthLabel(cursor, locale),
			start: new Date(cursor),
			end: bucketEnd,
		});
		cursor.setMonth(cursor.getMonth() + 1);
	}

	return buckets;
}

/** i18n key for KPI growth footers (week-over-week vs month-over-month). */
export function getAnalyticsGrowthComparisonKey(timeRange: AnalyticsTimeRange): AnalyticsGrowthComparisonKey {
	return timeRange === '1M' ? 'vsLastWeek' : 'vsLastMonth';
}

/**
 * Forward-looking bucket count aligned with the selected analytics range.
 * - Per Month: ~30 days → 5 weekly buckets
 * - Per Quarter / 6 Months / Year: 3 / 6 / 12 monthly buckets
 */
export function getForecastPeriodCount(timeRange: AnalyticsTimeRange): number {
	if (timeRange === '1M') {
		return 5;
	}
	return ANALYTICS_TIME_RANGE_MONTHS[timeRange];
}

/**
 * Keep only orders whose `orderDate` falls within the selected look-back window.
 * Orders with an invalid/unparseable date are excluded.
 */
export function filterOrdersByTimeRange<T extends { orderDate: string | Date }>(
	orders: T[],
	timeRange: AnalyticsTimeRange,
): T[] {
	const cutoff = getAnalyticsCutoffDate(timeRange);
	return orders.filter((order) => {
		const date = new Date(order.orderDate);
		return !Number.isNaN(date.getTime()) && date >= cutoff;
	});
}
