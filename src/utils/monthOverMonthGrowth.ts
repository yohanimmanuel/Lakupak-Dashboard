import { Order } from '@/types/order';
import { calculateOrderTotalAmount } from '@/utils/orderCalculations';
import { isDeliveryStopComplete } from '@/utils/deliveryCompletion';
import {
  AnalyticsTimeRange,
  filterOrdersByPreviousTimeRange,
  filterOrdersByTimeRange,
  getAnalyticsCutoffDate,
} from '@/utils/analyticsTimeRange';

export function toMonthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

export function parseDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Relative period-over-period % change. Null when baseline is 0/invalid. */
export function percentChange(current: number, previous: number): number | null {
  if (!Number.isFinite(current) || !Number.isFinite(previous) || previous === 0) return null;
  const raw = ((current - previous) / Math.abs(previous)) * 100;
  return Number.isFinite(raw) ? raw : null;
}

/** Absolute change for values already in percent (margin, completion). Clamped to ±100. */
export function percentagePointChange(current: number, previous: number): number | null {
  if (!Number.isFinite(current) || !Number.isFinite(previous)) return null;
  const raw = current - previous;
  if (!Number.isFinite(raw)) return null;
  return Math.max(-100, Math.min(100, raw));
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

/**
 * Growth for list KPI cards that show all-time totals.
 * Compares current list size vs how many items existed one month ago
 * (created before the current 1M look-back cutoff).
 */
export function cumulativeCountGrowthDetail<T>(
  items: T[],
  getDate: (item: T) => Date | string | null | undefined,
  from: Date = new Date(),
): { growth: number | null; previous: number | null } {
  if (!Array.isArray(items) || items.length === 0) {
    return { growth: null, previous: null };
  }

  const cutoff = getAnalyticsCutoffDate('1M', from);
  const current = items.length;
  const previous = items.filter((item) => {
    const d = parseDate(getDate(item));
    return d !== null && d < cutoff;
  }).length;

  if (previous === 0) {
    return { growth: null, previous: null };
  }

  return {
    growth: percentChange(current, previous),
    previous,
  };
}

export function cumulativeCountGrowth<T>(
  items: T[],
  getDate: (item: T) => Date | string | null | undefined,
): number | null {
  return cumulativeCountGrowthDetail(items, getDate).growth;
}

export function formatLegacyTrend(
  growth: number | null,
  options?: { previousValue?: string; periodLabel?: string },
): { percent: string; label: string; up: boolean } {
  const periodLabel = options?.periodLabel ?? 'last month';
  const previousValue = options?.previousValue?.trim();
  const periodPart = `(${periodLabel})`;
  const label = previousValue ? `${previousValue} ${periodPart}` : periodPart;

  if (growth === null || Number.isNaN(growth)) {
    return { percent: 'N/A', label: periodPart, up: true };
  }
  if (growth === 0) {
    return { percent: '0.0%', label, up: true };
  }
  const sign = growth >= 0 ? '+' : '-';
  return {
    percent: `${sign}${Math.abs(growth).toFixed(1)}%`,
    label,
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
  ordersPrevious: null as number | null,
  orderVolumeGrowth: null as number | null,
  orderVolumePrevious: null as number | null,
  completionGrowth: null as number | null,
  completionPrevious: null as number | null,
  averageOrderVolumeGrowth: null as number | null,
  averageOrderVolumePrevious: null as number | null,
  piecesGrowth: null as number | null,
  piecesPrevious: null as number | null,
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
  const hasPrevious = prev.orders > 0;
  const ordersGrowth = percentChange(last.orders, prev.orders);
  const orderVolumeGrowth = percentChange(last.orderVolume, prev.orderVolume);

  const completionLast = last.orders > 0 ? (last.completed / last.orders) * 100 : 0;
  const completionPrev = hasPrevious ? (prev.completed / prev.orders) * 100 : 0;
  const completionGrowth = hasPrevious
    ? percentagePointChange(completionLast, completionPrev)
    : last.orders > 0
      ? null
      : 0;

  const avgLast = last.orders > 0 ? last.orderVolume / last.orders : 0;
  const avgPrev = hasPrevious ? prev.orderVolume / prev.orders : 0;
  const averageOrderVolumeGrowth = hasPrevious ? percentChange(avgLast, avgPrev) : null;

  const piecesGrowth = percentChange(last.pieces, prev.pieces);

  return {
    ordersGrowth,
    ordersPrevious: hasPrevious ? prev.orders : null,
    orderVolumeGrowth,
    orderVolumePrevious: hasPrevious ? prev.orderVolume : null,
    completionGrowth,
    completionPrevious: hasPrevious ? completionPrev : null,
    averageOrderVolumeGrowth,
    averageOrderVolumePrevious: hasPrevious ? avgPrev : null,
    piecesGrowth,
    piecesPrevious: hasPrevious ? prev.pieces : null,
  };
}

/** Compare current look-back window totals vs the previous equal-length window. */
export function computeOrderPeriodGrowth(
  orders: Order[],
  timeRange: AnalyticsTimeRange,
  _dateLocale = 'en-US',
) {
  if (!Array.isArray(orders) || orders.length === 0) return EMPTY_ORDER_GROWTH;

  const now = new Date();
  const currentOrders = filterOrdersByTimeRange(orders, timeRange, now);
  const previousOrders = filterOrdersByPreviousTimeRange(orders, timeRange, now);

  const toBucket = (list: Order[]): OrderGrowthBucket => {
    const bucket = emptyOrderGrowthBucket();
    list.forEach((order) => {
      bucket.orders += 1;
      bucket.orderVolume += calculateOrderTotalAmount(order);
      bucket.pieces += orderPieces(order);
      if (isCompletedOrderStatus(order.orderStatus)) {
        bucket.completed += 1;
      }
    });
    return bucket;
  };

  return growthFromBucketPair(toBucket(currentOrders), toBucket(previousOrders));
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

/**
 * Growth for Orders list KPI cards (all-time totals on the page).
 * Compares current list totals vs the same metrics as of one month ago
 * (orders dated before the current 1M look-back cutoff).
 */
export function computeOrdersListGrowth(orders: Order[], from: Date = new Date()) {
  if (!Array.isArray(orders) || orders.length === 0) return EMPTY_ORDER_GROWTH;

  const cutoff = getAnalyticsCutoffDate('1M', from);

  const toBucket = (list: Order[]): OrderGrowthBucket => {
    const bucket = emptyOrderGrowthBucket();
    list.forEach((order) => {
      bucket.orders += 1;
      bucket.orderVolume += calculateOrderTotalAmount(order);
      bucket.pieces += orderPieces(order);
      if (isCompletedOrderStatus(order.orderStatus)) {
        bucket.completed += 1;
      }
    });
    return bucket;
  };

  const current = toBucket(orders);
  const previous = toBucket(
    orders.filter((order) => {
      const d = parseDate(order.orderDate);
      return d !== null && d < cutoff;
    }),
  );

  return growthFromBucketPair(current, previous);
}
