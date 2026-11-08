import { Order } from '@/types/order';
import { calculateOrderTotalAmount, orderAmountPaid } from '@/utils/orderCalculations';
import { isDeliveryStopComplete } from '@/utils/deliveryCompletion';
import {
  AnalyticsTimeRange,
  filterOrdersByPreviousTimeRange,
  filterOrdersByTimeRange,
} from '@/utils/analyticsTimeRange';

export function toMonthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

/** Current calendar month and the previous calendar month (YYYY-MM). */
export function getCalendarMonthPair(from: Date = new Date()): {
  currentKey: string;
  previousKey: string;
} {
  const currentKey = toMonthKey(from);
  const previous = new Date(from.getFullYear(), from.getMonth() - 1, 15);
  return { currentKey, previousKey: toMonthKey(previous) };
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
 * Count of items dated in this calendar month vs the previous calendar month.
 */
export function calendarMonthCountGrowthDetail<T>(
  items: T[],
  getDate: (item: T) => Date | string | null | undefined,
  from: Date = new Date(),
): { growth: number | null; previous: number | null; current: number } {
  if (!Array.isArray(items) || items.length === 0) {
    return { growth: null, previous: null, current: 0 };
  }

  const { currentKey, previousKey } = getCalendarMonthPair(from);
  let current = 0;
  let previous = 0;

  for (const item of items) {
    const d = parseDate(getDate(item));
    if (!d) continue;
    const key = toMonthKey(d);
    if (key === currentKey) current += 1;
    else if (key === previousKey) previous += 1;
  }

  if (previous === 0) {
    return { growth: null, previous: 0, current };
  }

  return {
    growth: percentChange(current, previous),
    previous,
    current,
  };
}

/** @deprecated Prefer calendarMonthCountGrowthDetail — kept as an alias for older call sites. */
export function cumulativeCountGrowthDetail<T>(
  items: T[],
  getDate: (item: T) => Date | string | null | undefined,
  from: Date = new Date(),
): { growth: number | null; previous: number | null } {
  const result = calendarMonthCountGrowthDetail(items, getDate, from);
  return { growth: result.growth, previous: result.previous };
}

export function cumulativeCountGrowth<T>(
  items: T[],
  getDate: (item: T) => Date | string | null | undefined,
): number | null {
  return calendarMonthCountGrowthDetail(items, getDate).growth;
}

/**
 * Compare two numeric calendar-month totals (this month vs last month).
 */
export function calendarMonthValueGrowth(
  current: number,
  previous: number,
): { growth: number | null; previous: number | null; current: number } {
  if (!Number.isFinite(current) || !Number.isFinite(previous)) {
    return { growth: null, previous: null, current: Number.isFinite(current) ? current : 0 };
  }
  if (previous === 0) {
    return { growth: null, previous: 0, current };
  }
  return {
    growth: percentChange(current, previous),
    previous,
    current,
  };
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
  paid: number;
  unpaid: number;
};

const EMPTY_ORDER_GROWTH = {
  ordersGrowth: null as number | null,
  ordersCurrent: 0,
  ordersPrevious: 0,
  orderVolumeGrowth: null as number | null,
  orderVolumeCurrent: 0,
  orderVolumePrevious: 0,
  completionGrowth: null as number | null,
  completionCurrent: 0,
  completionPrevious: 0,
  averageOrderVolumeGrowth: null as number | null,
  averageOrderVolumeCurrent: 0,
  averageOrderVolumePrevious: 0,
  piecesGrowth: null as number | null,
  piecesCurrent: 0,
  piecesPrevious: 0,
  paidGrowth: null as number | null,
  paidCurrent: 0,
  paidPrevious: 0,
  unpaidGrowth: null as number | null,
  unpaidCurrent: 0,
  unpaidPrevious: 0,
};

function addPaymentAmounts(bucket: OrderGrowthBucket, order: Order, amount: number) {
  const paid = orderAmountPaid(order);
  bucket.paid += paid;
  bucket.unpaid += Math.max(0, amount - paid);
}

function emptyOrderGrowthBucket(): OrderGrowthBucket {
  return { orders: 0, orderVolume: 0, completed: 0, pieces: 0, paid: 0, unpaid: 0 };
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
    const amount = calculateOrderTotalAmount(order);
    bucket.orders += 1;
    bucket.orderVolume += amount;
    bucket.pieces += orderPieces(order);
    if (isCompletedOrderStatus(order.orderStatus)) {
      bucket.completed += 1;
    }
    addPaymentAmounts(bucket, order, amount);
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
  const paidGrowth = percentChange(last.paid, prev.paid);
  const unpaidGrowth = percentChange(last.unpaid, prev.unpaid);

  return {
    ordersGrowth,
    ordersCurrent: last.orders,
    ordersPrevious: prev.orders,
    orderVolumeGrowth,
    orderVolumeCurrent: last.orderVolume,
    orderVolumePrevious: prev.orderVolume,
    completionGrowth,
    completionCurrent: completionLast,
    completionPrevious: completionPrev,
    averageOrderVolumeGrowth,
    averageOrderVolumeCurrent: avgLast,
    averageOrderVolumePrevious: avgPrev,
    piecesGrowth,
    piecesCurrent: last.pieces,
    piecesPrevious: prev.pieces,
    paidGrowth,
    paidCurrent: last.paid,
    paidPrevious: prev.paid,
    unpaidGrowth,
    unpaidCurrent: last.unpaid,
    unpaidPrevious: prev.unpaid,
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
      const amount = calculateOrderTotalAmount(order);
      bucket.orders += 1;
      bucket.orderVolume += amount;
      bucket.pieces += orderPieces(order);
      if (isCompletedOrderStatus(order.orderStatus)) {
        bucket.completed += 1;
      }
      addPaymentAmounts(bucket, order, amount);
    });
    return bucket;
  };

  return growthFromBucketPair(toBucket(currentOrders), toBucket(previousOrders));
}

export function computeOrderMonthOverMonthGrowth(orders: Order[], from: Date = new Date()) {
  if (!Array.isArray(orders) || orders.length === 0) return EMPTY_ORDER_GROWTH;

  const { currentKey, previousKey } = getCalendarMonthPair(from);
  const byMonth = aggregateOrdersIntoBuckets(orders, toMonthKey);
  const last = byMonth[currentKey] ?? emptyOrderGrowthBucket();
  const prev = byMonth[previousKey] ?? emptyOrderGrowthBucket();

  return growthFromBucketPair(last, prev);
}

/**
 * Growth for Orders / Home KPI cards.
 * Compares this calendar month vs the previous calendar month
 * (by orderDate), not cumulative all-time totals.
 */
export function computeOrdersListGrowth(orders: Order[], from: Date = new Date()) {
  return computeOrderMonthOverMonthGrowth(orders, from);
}
