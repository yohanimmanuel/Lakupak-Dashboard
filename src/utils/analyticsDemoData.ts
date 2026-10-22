import type { Prisma } from '@/lib/prisma-generated';

export const ANALYTICS_DEMO_ORDER_PREFIX = 'ANALYTICS-DEMO-';
export const ANALYTICS_DEMO_BUYER_PREFIX = 'ANALYTICS-DEMO-BUYER-';

/** Keep analytics seed data out of operational order lists (Orders page, fleet, etc.). */
export function excludeAnalyticsDemoOrdersWhere(): Prisma.OrderWhereInput {
  return {
    NOT: {
      orderId: { startsWith: ANALYTICS_DEMO_ORDER_PREFIX },
    },
  };
}

/** Keep analytics seed buyers out of operational buyer lists. */
export function excludeAnalyticsDemoBuyersWhere(): Prisma.BuyerWhereInput {
  return {
    NOT: {
      buyerId: { startsWith: ANALYTICS_DEMO_BUYER_PREFIX },
    },
  };
}
