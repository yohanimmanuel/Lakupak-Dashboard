import type { Buyer } from '@/types/client';
import type { Order } from '@/types/order';

export type SalesConversionOpportunityKind =
  | 'reorder'
  | 'quotation'
  | 'buyer_interest'
  | 'sales_task';

export type SalesConversionJobInput = {
  id: string;
  clientId: string;
  clientName: string;
  agentName: string;
  jobType: string;
  status: string;
  createdAt: string;
};

export type SalesConversionOpportunity = {
  id: string;
  kind: SalesConversionOpportunityKind;
  buyerId: string | null;
  orderId: string | null;
  jobId: string | null;
  title: string;
  productName: string | null;
  agentName: string | null;
  jobType: string | null;
  jobStatus: string | null;
  days: number;
  value: number;
  score: number;
};

export type SalesConversionInsights = {
  openOpportunities: number;
  overdueBuyers: number;
  quotesAwaitingAction: number;
  ordersAttributed: number;
  opportunities: SalesConversionOpportunity[];
};

const DAY_MS = 24 * 60 * 60 * 1000;
const EXCLUDED_ORDER_STATUSES = new Set(['Cancelled', 'Returned', 'Failed']);

function toTime(value: Date | string | null | undefined): number {
  if (!value) return 0;
  const time = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isFinite(time) ? time : 0;
}

function orderTime(order: Order): number {
  return toTime(order.orderDate) || toTime(order.createdAt);
}

function wholeDays(from: number, to: number): number {
  if (!from || !to) return 0;
  return Math.max(0, Math.floor((to - from) / DAY_MS));
}

function median(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

function topProductName(orders: Order[]): string | null {
  const stats = new Map<string, { count: number; value: number }>();
  for (const order of orders) {
    for (const item of order.orderItems ?? []) {
      const name = (item.productName || item.productNameSnapshot || '').trim();
      if (!name) continue;
      const current = stats.get(name) ?? { count: 0, value: 0 };
      current.count += 1;
      current.value += Number(item.subtotal ?? 0);
      stats.set(name, current);
    }
  }

  return (
    [...stats.entries()].sort((a, b) => b[1].count - a[1].count || b[1].value - a[1].value)[0]?.[0] ??
    null
  );
}

function buyerDisplayName(buyer: Buyer | undefined, fallback: string): string {
  return buyer?.storeName?.trim() || buyer?.owner?.trim() || fallback;
}

export function buildSalesConversionInsights(input: {
  orders: Order[];
  buyers: Buyer[];
  salesJobs: SalesConversionJobInput[];
  now?: Date;
}): SalesConversionInsights {
  const now = input.now ?? new Date();
  const nowTime = now.getTime();
  const validOrders = input.orders.filter((order) => !EXCLUDED_ORDER_STATUSES.has(order.orderStatus));
  const buyersById = new Map(input.buyers.map((buyer) => [buyer.buyerId, buyer]));
  const ordersByBuyer = new Map<string, Order[]>();

  for (const order of validOrders) {
    if (!order.buyerId) continue;
    const rows = ordersByBuyer.get(order.buyerId) ?? [];
    rows.push(order);
    ordersByBuyer.set(order.buyerId, rows);
  }

  const opportunities: SalesConversionOpportunity[] = [];

  for (const [buyerId, buyerOrders] of ordersByBuyer.entries()) {
    const sorted = [...buyerOrders].sort((a, b) => orderTime(a) - orderTime(b));
    if (sorted.length < 2) continue;

    const intervals: number[] = [];
    for (let index = 1; index < sorted.length; index += 1) {
      const days = wholeDays(orderTime(sorted[index - 1]), orderTime(sorted[index]));
      if (days >= 1 && days <= 180) intervals.push(days);
    }
    if (!intervals.length) continue;

    const cadenceDays = Math.max(1, Math.round(median(intervals)));
    const lastOrder = sorted[sorted.length - 1];
    const daysSinceLastOrder = wholeDays(orderTime(lastOrder), nowTime);
    const overdueDays = daysSinceLastOrder - cadenceDays;
    if (overdueDays < 1) continue;

    const averageValue =
      sorted.reduce((sum, order) => sum + (Number(order.totalAmount) || 0), 0) / sorted.length;
    const buyer = buyersById.get(buyerId);

    opportunities.push({
      id: `reorder:${buyerId}`,
      kind: 'reorder',
      buyerId,
      orderId: lastOrder.orderId || null,
      jobId: null,
      title: buyerDisplayName(buyer, lastOrder.storeName || lastOrder.contactPerson || buyerId),
      productName: topProductName(sorted),
      agentName: null,
      jobType: null,
      jobStatus: null,
      days: overdueDays,
      value: averageValue,
      score: 70 + Math.min(25, overdueDays) + Math.min(10, averageValue / 100000),
    });
  }

  for (const order of validOrders) {
    const ageDays = wholeDays(orderTime(order), nowTime);
    const needsFollowUp =
      order.paymentStatus === 'Unpaid' &&
      (order.orderStatus === 'Pending' || order.orderStatus === 'Confirmed') &&
      ageDays >= 2;
    if (!needsFollowUp) continue;

    const buyer = buyersById.get(order.buyerId);
    opportunities.push({
      id: `quotation:${order.orderId}`,
      kind: 'quotation',
      buyerId: order.buyerId || null,
      orderId: order.orderId || null,
      jobId: null,
      title: buyerDisplayName(buyer, order.storeName || order.contactPerson || order.buyerId),
      productName: topProductName([order]),
      agentName: null,
      jobType: null,
      jobStatus: null,
      days: ageDays,
      value: Number(order.totalAmount) || 0,
      score: 55 + Math.min(25, ageDays) + Math.min(10, (Number(order.totalAmount) || 0) / 100000),
    });
  }

  for (const buyer of input.buyers) {
    if (buyer.status?.toLowerCase() !== 'active') continue;
    if (ordersByBuyer.has(buyer.buyerId)) continue;

    opportunities.push({
      id: `buyer_interest:${buyer.buyerId}`,
      kind: 'buyer_interest',
      buyerId: buyer.buyerId,
      orderId: null,
      jobId: null,
      title: buyerDisplayName(buyer, buyer.buyerId),
      productName: null,
      agentName: null,
      jobType: null,
      jobStatus: null,
      days: 0,
      value: Number(buyer.avgMonthlySpending) || 0,
      score: 30 + Math.min(15, (Number(buyer.avgMonthlySpending) || 0) / 100000),
    });
  }

  for (const job of input.salesJobs) {
    const status = job.status?.toLowerCase();
    if (!status || status === 'completed' || status === 'skipped') continue;
    const ageDays = wholeDays(toTime(job.createdAt), nowTime);
    const statusScore = status === 'pending' ? 48 : status === 'dispatched' ? 42 : 36;

    opportunities.push({
      id: `sales_task:${job.id}`,
      kind: 'sales_task',
      buyerId: job.clientId || null,
      orderId: null,
      jobId: job.id,
      title: job.clientName?.trim() || '',
      productName: null,
      agentName: job.agentName?.trim() || null,
      jobType: job.jobType || null,
      jobStatus: job.status || null,
      days: ageDays,
      value: 0,
      score: statusScore + Math.min(15, ageDays),
    });
  }

  opportunities.sort((a, b) => b.score - a.score || b.value - a.value || b.days - a.days);

  const ordersAttributed = validOrders.filter((order) =>
    (order.orderItems ?? []).some((item) => item.offerApplied),
  ).length;

  return {
    openOpportunities: opportunities.length,
    overdueBuyers: opportunities.filter((item) => item.kind === 'reorder').length,
    quotesAwaitingAction: opportunities.filter((item) => item.kind === 'quotation').length,
    ordersAttributed,
    opportunities,
  };
}
