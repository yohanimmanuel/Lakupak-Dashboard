import { prisma } from '@/lib/db';

type BuyerPriceLine = {
  offerApplied?: boolean | null;
  subtotal?: unknown;
  pricePerPackage?: unknown;
  originalPriceSnapshot?: unknown;
  discountPercentage?: unknown;
  discountAmount?: unknown;
};

type BuyerPriceOrder = {
  orderId: string;
  buyerId?: string | null;
  userId?: number | null;
  pricingSentAt?: Date | string | null;
  subtotal?: unknown;
  totalAmount?: unknown;
  user?: {
    company?: { autoApplyBasePriceForFirstBuyers?: boolean | null } | null;
  } | null;
  orderItems: BuyerPriceLine[];
};

/**
 * Distributor rows always keep catalog/offer amounts.
 * Buyers only receive money when:
 * - the distributor has sent pricing, or
 * - auto-apply base price is on and this is the buyer's first order with that distributor.
 * Offer activate/deactivate stays on the distributor order until Send pricing.
 * Any hidden line zeros the order total so list cards stay "Pending price".
 */
export async function applyBuyerPriceVisibility<T extends BuyerPriceOrder>(
  orders: T[],
): Promise<T[]> {
  if (orders.length === 0) return orders;

  const pairs = new Map<string, { buyerId: string; userId: number }>();
  for (const order of orders) {
    if (order.userId == null || !order.buyerId) continue;
    const key = `${order.buyerId}::${order.userId}`;
    if (!pairs.has(key)) {
      pairs.set(key, { buyerId: order.buyerId, userId: order.userId });
    }
  }

  const firstOrderIdByPair = new Map<string, string>();
  const pairList = [...pairs.values()];
  if (pairList.length > 0) {
    const rows = await prisma.order.findMany({
      where: {
        isDeleted: false,
        OR: pairList.map((pair) => ({ buyerId: pair.buyerId, userId: pair.userId })),
      },
      select: {
        id: true,
        orderId: true,
        buyerId: true,
        userId: true,
      },
      distinct: ['buyerId', 'userId'],
      orderBy: [{ orderDate: 'asc' }, { id: 'asc' }],
    });

    for (const row of rows) {
      if (row.userId == null || !row.buyerId) continue;
      const key = `${row.buyerId}::${row.userId}`;
      if (!pairs.has(key) || firstOrderIdByPair.has(key)) continue;
      firstOrderIdByPair.set(key, row.orderId);
    }
  }

  return orders.map((order) => {
    const released = order.pricingSentAt != null;
    const autoApply = Boolean(order.user?.company?.autoApplyBasePriceForFirstBuyers);
    const pairKey =
      order.userId != null && order.buyerId ? `${order.buyerId}::${order.userId}` : '';
    const isFirstOrder = pairKey !== '' && firstOrderIdByPair.get(pairKey) === order.orderId;
    const showBase = autoApply && isFirstOrder;

    let anyHidden = false;
    const orderItems = order.orderItems.map((item) => {
      if (released || showBase) return item;
      anyHidden = true;
      return {
        ...item,
        subtotal: 0,
        pricePerPackage: 0,
        originalPriceSnapshot: null,
        discountPercentage: null,
        discountAmount: null,
      };
    });

    if (!anyHidden) {
      return { ...order, orderItems };
    }

    return {
      ...order,
      orderItems,
      subtotal: 0,
      totalAmount: 0,
    };
  });
}
