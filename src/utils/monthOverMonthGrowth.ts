import { Order } from '@/types/order';
import { calculateOrderTotalAmount } from '@/utils/orderCalculations';
import { isDeliveryStopComplete } from '@/utils/deliveryCompletion';
import {
  AnalyticsTimeRange,
  getAnalyticsBucketKey,
  getAnalyticsPeriodBuckets,
} from '@/utils/analyticsTimeRange';

export function toMonthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

export function parseDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function growthFromMonthBuckets(buckets: Record<string, number>): number | null {
  const keys = Object.keys(buckets).sort();
  if (keys.length < 2) return null;
  const last = buckets[keys[keys.length - 1]] ?? 0;
  const prev = buckets[keys[keys.length - 2]] ?? 0;
  if (prev === 0) return last > 0 ? null : 0;
  return ((last - prev) / prev) * 100;
}

export function growthFromMonthBucketsRatio(
  numeratorBuckets: Record<string, number>,
  denominatorBuckets: Record<string, number>,
): number | null {
  const keys = Object.keys(numeratorBuckets).sort();
  if (keys.length < 2) return null;
  const lastKey = keys[keys.length - 1];
  const prevKey = keys[keys.length - 2];
  const lastNum = numeratorBuckets[lastKey] ?? 0;
  const lastDen = denominatorBuckets[lastKey] ?? 0;
  const prevNum = numeratorBuckets[prevKey] ?? 0;
  const prevDen = denominatorBuckets[prevKey] ?? 0;
  const lastRate = lastDen > 0 ? lastNum / lastDen : 0;
  const prevRate = prevDen > 0 ? prevNum / prevDen : 0;
  if (prevRate === 0) return lastRate > 0 ? null : 0;
  return ((lastRate - prevRate) / Math.abs(prevRate)) * 100;
}

export function countByMonth<T>(
  items: T[],
  getDate: (item: T) => Date | string | null | undefined,
  getValue: (item: T) => number = () => 1,
): Record<string, number> {
  const buckets: Record<string, number> = {};
  for (const item of items) {
    const d = parseDate(getDate(item));
    if (!d) continue;
    const key = toMonthKey(d);
    buckets[key] = (buckets[key] ?? 0) + getValue(item);
  }
  return buckets;
}

export function cumulativeCountGrowth<T>(
  items: T[],
  getDate: (item: T) => Date | string | null | undefined,
): number | null {
  if (!Array.isArray(items) || items.length === 0) return null;

  const dated = items
    .map((item) => ({ date: parseDate(getDate(item)) }))
    .filter((entry): entry is { date: Date } => entry.date !== null);
  if (dated.length === 0) return null;

  const now = new Date();
  const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
  const endOfPrevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 0, 23, 59, 59, 999);

  const countAsOf = (end: Date) => dated.filter(({ date }) => date <= end).length;
  const last = countAsOf(endOfLastMonth);
  const prev = countAsOf(endOfPrevMonth);

  // No records through end of last month — not enough history for MoM
  if (last === 0 && prev === 0) return null;
  if (prev === 0) return null;

  return ((last - prev) / prev) * 100;
}

export function formatLegacyTrend(growth: number | null): { percent: string; label: string; up: boolean } {
  if (growth === null || Number.isNaN(growth)) {
    return { percent: 'N/A', label: 'vs last month', up: true };
  }
  if (growth === 0) {
    return { percent: '0.0%', label: 'vs last month', up: true };
  }
  return {
    percent: `${Math.abs(growth).toFixed(1)}%`,
    label: 'from last month',
    up: growth >= 0,
  };
}

function isCompletedOrderStatus(status: string): boolean {
  return status === 'Shipped' || isDeliveryStopComplete(status);
}

function orderPieces(order: Order): number {
  if (!Array.isArray(order.orderItems)) return 0;
  return order.orderItems.reduce((sum, item) => {
    const packageQuantity = Number(item.packageQuantity) || 0;
    const piecesPerPackage = Number(item.piecesPerPackage) || 0;
    return sum + packageQuantity * piecesPerPackage;
  }, 0);
}

type OrderGrowthBucket = {
  orders: number;
  orderVolume: number;
  completed: number;
  pieces: number;
};

const EMPTY_ORDER_GROWTH = {
  ordersGrowth: null as number | null,
  orderVolumeGrowth: null as number | null,
  completionGrowth: null as number | null,
  averageOrderVolumeGrowth: null as number | null,
  piecesGrowth: null as number | null,
};

function emptyOrderGrowthBucket(): OrderGrowthBucket {
  return { orders: 0, orderVolume: 0, completed: 0, pieces: 0 };
}

function aggregateOrdersIntoBuckets(
  orders: Order[],
  bucketKeyForDate: (date: Date) => string,
): Record<string, OrderGrowthBucket> {
  const byKey: Record<string, OrderGrowthBucket> = {};

  orders.forEach((order) => {
    const d = parseDate(order.orderDate);
    if (!d) return;
    const key = bucketKeyForDate(d);
    if (!byKey[key]) {
      byKey[key] = emptyOrderGrowthBucket();
    }
    const bucket = byKey[key];
    bucket.orders += 1;
    bucket.orderVolume += calculateOrderTotalAmount(order);
    bucket.pieces += orderPieces(order);
    if (isCompletedOrderStatus(order.orderStatus)) {
      bucket.completed += 1;
    }
  });

  return byKey;
}

function growthFromBucketPair(last: OrderGrowthBucket, prev: OrderGrowthBucket) {
  const ordersGrowth =
    prev.orders > 0 ? ((last.orders - prev.orders) / prev.orders) * 100 : last.orders > 0 ? null : 0;
  const orderVolumeGrowth =
    prev.orderVolume > 0
      ? ((last.orderVolume - prev.orderVolume) / prev.orderVolume) * 100
      : last.orderVolume > 0
        ? null
        : 0;

  const completionLast = last.orders > 0 ? (last.completed / last.orders) * 100 : 0;
  const completionPrev = prev.orders > 0 ? (prev.completed / prev.orders) * 100 : 0;
  const completionGrowth =
    completionPrev !== 0
      ? ((completionLast - completionPrev) / Math.abs(completionPrev)) * 100
      : completionLast > 0
        ? null
        : 0;

  const avgLast = last.orders > 0 ? last.orderVolume / last.orders : 0;
  const avgPrev = prev.orders > 0 ? prev.orderVolume / prev.orders : 0;
  const averageOrderVolumeGrowth =
    avgPrev !== 0 ? ((avgLast - avgPrev) / Math.abs(avgPrev)) * 100 : avgLast > 0 ? null : 0;

  const piecesGrowth =
    prev.pieces > 0 ? ((last.pieces - prev.pieces) / prev.pieces) * 100 : last.pieces > 0 ? null : 0;

  return {
    ordersGrowth,
    orderVolumeGrowth,
    completionGrowth,
    averageOrderVolumeGrowth,
    piecesGrowth,
  };
}

/** Compare the last two analytics period buckets (week or month, per selected range). */
export function computeOrderPeriodGrowth(
  orders: Order[],
  timeRange: AnalyticsTimeRange,
  dateLocale = 'en-US',
) {
  if (!Array.isArray(orders) || orders.length === 0) return EMPTY_ORDER_GROWTH;

  const periodBuckets = getAnalyticsPeriodBuckets(timeRange, { locale: dateLocale });
  if (periodBuckets.length < 2) return EMPTY_ORDER_GROWTH;

  const byKey = aggregateOrdersIntoBuckets(orders, (date) => getAnalyticsBucketKey(date, timeRange));
  const last = byKey[periodBuckets[periodBuckets.length - 1].key] ?? emptyOrderGrowthBucket();
  const prev = byKey[periodBuckets[periodBuckets.length - 2].key] ?? emptyOrderGrowthBucket();

  return growthFromBucketPair(last, prev);
}

export function computeOrderMonthOverMonthGrowth(orders: Order[]) {
  if (!Array.isArray(orders) || orders.length === 0) return EMPTY_ORDER_GROWTH;

  const byMonth = aggregateOrdersIntoBuckets(orders, toMonthKey);
  const keys = Object.keys(byMonth).sort();
  if (keys.length < 2) return EMPTY_ORDER_GROWTH;

  const last = byMonth[keys[keys.length - 1]];
  const prev = byMonth[keys[keys.length - 2]];

  return growthFromBucketPair(last, prev);
}
