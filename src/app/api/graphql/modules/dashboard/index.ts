import { fetchOrdersConnection } from '../orders';
import { fetchProductsConnection } from '../products';
import { fetchBuyersConnection, fetchSuppliersConnection } from '../contacts';
import { sanitizePagination } from '../common/utils';
import { prisma } from '../common/prisma';
import { calculateOrderTotalAmount } from '@/utils/orderCalculations';
import type { Order } from '@/types/order';
import { decimalToNumber } from '@/services/orders/utils';
import {
  loadPendingOrderPricePreviews,
  type PendingOrderPricePreview,
} from '@/services/orders/resolvePendingOrderItemPricing';

export const dashboardTypeDefs = /* GraphQL */ `
  type DashboardTotals {
    orders: Int!
    products: Int!
    buyers: Int!
    suppliers: Int!
  }

  type DashboardAggregates {
    totalRevenue: Float!
    pendingRevenue: Float!
    totalOrders: Int!
    paidOrders: Int!
    unpaidOrders: Int!
    avgOrderValue: Float!
    totalPiecesSold: Int!
    totalUnitsSold: Int!
    uniqueCustomers: Int!
  }

  type SalesTeamSummary {
    id: String!
    name: String!
    memberCount: Int!
  }

  type SalesSummary {
    teams: [SalesTeamSummary!]!
    totalAgents: Int!
    activeAgents: Int!
  }

  type DashboardSnapshot {
    orders: [Order!]!
    products: [Product!]!
    buyers: [Buyer!]!
    suppliers: [Supplier!]!
    salesSummary: SalesSummary!
    totals: DashboardTotals!
    aggregates: DashboardAggregates!
  }

  extend type Query {
    dashboardSnapshot(
      userId: Int!
      ordersLimit: Int = 10
      productsLimit: Int = 10
      contactsLimit: Int = 10
    ): DashboardSnapshot!
  }
`;

interface SalesTeamSummary {
  id: string;
  name: string;
  memberCount: number;
}

interface SalesSummary {
  teams: SalesTeamSummary[];
  totalAgents: number;
  activeAgents: number;
}

// Type definition for DashboardSnapshot response
interface DashboardSnapshot {
  orders: unknown[];
  products: unknown[];
  buyers: unknown[];
  suppliers: unknown[];
  salesSummary: SalesSummary;
  totals: {
    orders: number;
    products: number;
    buyers: number;
    suppliers: number;
  };
  aggregates: {
    totalRevenue: number;
    pendingRevenue: number;
    totalOrders: number;
    paidOrders: number;
    unpaidOrders: number;
    avgOrderValue: number;
    totalPiecesSold: number;
    totalUnitsSold: number;
    uniqueCustomers: number;
  };
}

/**
 * Calculate accurate aggregates from ALL orders (not just paginated subset)
 */
type PreviewableOrderItem = {
  id: number | null;
  subtotal: number;
  pricePerPackage?: number | null;
  offerApplied?: boolean;
  offerBadgeSnapshot?: string | null;
  offerNameSnapshot?: string | null;
  originalPriceSnapshot?: number | null;
  discountPercentage?: number | null;
  discountAmount?: number | null;
  promotionDetailsSnapshot?: string | null;
};

type PreviewableOrder = {
  orderId: string;
  orderStatus: string;
  subtotal: number;
  discounts: number;
  shippingFee: number;
  totalAmount: number;
  orderItems: PreviewableOrderItem[];
};

/** Overlay the same pending rate preview the orders list uses, then total via calculateOrderTotalAmount. */
function orderVolumeFromPreview(
  order: {
    shippingFee: unknown;
    discounts: unknown;
    orderItemsRel: Array<{ id: number; subtotal: unknown }>;
  },
  preview: PendingOrderPricePreview | undefined,
): number {
  const updateById = new Map((preview?.updates ?? []).map((update) => [update.id, update.subtotal]));
  return calculateOrderTotalAmount({
    shippingFee: decimalToNumber(order.shippingFee),
    discounts: decimalToNumber(order.discounts),
    orderItems: order.orderItemsRel.map((item) => ({
      subtotal: updateById.get(item.id) ?? decimalToNumber(item.subtotal),
    })),
  } as Order);
}

function applyPendingPreview<T extends PreviewableOrder>(
  order: T,
  preview: PendingOrderPricePreview | undefined,
): T {
  if (!preview || order.orderStatus !== 'Pending') return order;
  const updateById = new Map(preview.updates.map((update) => [update.id, update]));
  return {
    ...order,
    subtotal: preview.subtotal,
    totalAmount: preview.totalAmount,
    orderItems: order.orderItems.map((item) => {
      const update = item.id != null ? updateById.get(item.id) : undefined;
      if (!update) return item;
      return {
        ...item,
        subtotal: update.subtotal,
        pricePerPackage: update.pricePerPackage,
        offerApplied: update.offerApplied,
        offerBadgeSnapshot: update.offerBadgeSnapshot,
        offerNameSnapshot: update.offerNameSnapshot,
        originalPriceSnapshot:
          update.originalPriceSnapshot != null ? Number(update.originalPriceSnapshot) : null,
        discountPercentage: update.discountPercentage,
        discountAmount: update.discountAmount,
        promotionDetailsSnapshot: update.promotionDetailsSnapshot,
      };
    }),
  };
}

const loadDashboardOrders = (userId: number) =>
  prisma.order.findMany({
    where: {
      userId,
      isDeleted: false,
      archivedAt: null,
    },
    select: {
      orderId: true,
      orderStatus: true,
      buyerId: true,
      paymentStatus: true,
      shippingFee: true,
      discounts: true,
      orderItemsRel: {
        select: {
          id: true,
          subtotal: true,
          packageQuantity: true,
          piecesPerPackage: true,
        },
      },
    },
  });

const summarizeDashboardAggregates = (
  allOrders: Awaited<ReturnType<typeof loadDashboardOrders>>,
  previews: Map<string, PendingOrderPricePreview>,
) => {
  // Line subtotals + shipping − discounts. Live preview applies only to the
  // bounded snapshot set passed in; older orders keep their stored line totals.
  let totalRevenue = 0;
  let pendingRevenue = 0;
  let paidOrders = 0;
  let unpaidOrders = 0;
  const uniqueBuyers = new Set<string>();

  for (const order of allOrders) {
    const preview = order.orderStatus === 'Pending' ? previews.get(order.orderId) : undefined;
    const amount = orderVolumeFromPreview(order, preview);

    totalRevenue += amount;

    // Count paid vs unpaid orders
    if (order.paymentStatus === 'Paid' || order.paymentStatus === 'Partially Paid') {
      paidOrders++;
    } else if (order.paymentStatus === 'Unpaid') {
      pendingRevenue += amount; // Pending = unpaid orders only
      unpaidOrders++;
    }

    if (order.buyerId) {
      uniqueBuyers.add(order.buyerId);
    }
  }

  const totalOrders = allOrders.length;
  const avgOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;

  // Calculate total pieces and units sold from order items
  let totalPiecesSold = 0;
  let totalUnitsSold = 0;

  for (const order of allOrders) {
    for (const item of order.orderItemsRel) {
      const packages = item.packageQuantity || 0;
      const piecesPerPackage = item.piecesPerPackage || 1;
      totalPiecesSold += packages * piecesPerPackage;
      totalUnitsSold += packages;
    }
  }

  return {
    totalRevenue,
    pendingRevenue,
    totalOrders,
    paidOrders,
    unpaidOrders,
    avgOrderValue,
    totalPiecesSold,
    totalUnitsSold,
    uniqueCustomers: uniqueBuyers.size,
  };
};

const buildDashboardSnapshot = async (args: {
  userId: number;
  ordersLimit: number;
  productsLimit: number;
  contactsLimit: number;
}): Promise<DashboardSnapshot> => {
  const { userId, ordersLimit, productsLimit, contactsLimit } = args;

  // Fetch paginated lists for display AND calculate aggregates from ALL data
  const [
    ordersConnection,
    productsConnection,
    buyersConnection,
    suppliersConnection,
    allOrders,
    teamsRows,
    totalAgentsCount,
    activeAgentsCount,
  ] = await Promise.all([
    fetchOrdersConnection({ userId, page: 1, limit: ordersLimit }),
    fetchProductsConnection({ userId, page: 1, limit: productsLimit }),
    fetchBuyersConnection({ userId, page: 1, limit: contactsLimit }),
    fetchSuppliersConnection({ userId, page: 1, limit: contactsLimit }),
    loadDashboardOrders(userId),
    prisma.salesTeam.findMany({
      where: { userId },
      take: 50,
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        _count: { select: { members: true } },
      },
    }),
    prisma.salesAgent.count({ where: { userId } }),
    prisma.salesAgent.count({ where: { userId, status: 'active' } }),
  ]);

  const salesSummary: SalesSummary = {
    teams: teamsRows.map((t) => ({
      id: t.id,
      name: t.name,
      memberCount: t._count?.members ?? 0,
    })),
    totalAgents: totalAgentsCount ?? 0,
    activeAgents: activeAgentsCount ?? 0,
  };

  const snapshotOrders = ordersConnection.nodes as Array<
    PreviewableOrder & { userId: number | null; buyerId: string | null }
  >;
  const previews = await loadPendingOrderPricePreviews(snapshotOrders);
  const aggregates = summarizeDashboardAggregates(allOrders, previews);
  const orders = snapshotOrders.map((order) =>
    applyPendingPreview(
      order,
      order.orderStatus === 'Pending' ? previews.get(order.orderId) : undefined,
    ),
  );

  const result: DashboardSnapshot = {
    orders,
    products: productsConnection.nodes,
    buyers: buyersConnection.nodes,
    suppliers: suppliersConnection.nodes,
    salesSummary,
    totals: {
      orders: ordersConnection.pagination.totalCount,
      products: productsConnection.pagination.totalCount,
      buyers: buyersConnection.pagination.totalCount,
      suppliers: suppliersConnection.pagination.totalCount,
    },
    aggregates,
  };

  return result;
};

export const dashboardResolvers = {
  Query: {
    dashboardSnapshot: (
      _: unknown,
      args: { userId: number; ordersLimit?: number; productsLimit?: number; contactsLimit?: number },
    ) => {
      return buildDashboardSnapshot({
        userId: args.userId,
        ordersLimit: sanitizePagination(1, args.ordersLimit ?? 10, 200).limit,
        productsLimit: sanitizePagination(1, args.productsLimit ?? 10, 100).limit,
        contactsLimit: sanitizePagination(1, args.contactsLimit ?? 10, 100).limit,
      });
    },
  },
};

