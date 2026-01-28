import { fetchOrdersConnection } from '../orders';
import { fetchProductsConnection } from '../products';
import { fetchBuyersConnection, fetchSuppliersConnection } from '../contacts';
import { sanitizePagination } from '../common/utils';
import { prisma } from '../common/prisma';
import { getCachedQuery, setCachedQuery } from '@/lib/queryCache';

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

  type DashboardSnapshot {
    orders: [Order!]!
    products: [Product!]!
    buyers: [Buyer!]!
    suppliers: [Supplier!]!
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

// Type definition for DashboardSnapshot response
interface DashboardSnapshot {
  orders: unknown[];
  products: unknown[];
  buyers: unknown[];
  suppliers: unknown[];
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
const calculateDashboardAggregates = async (userId: number) => {
  // Get ALL orders for accurate aggregates (not paginated)
  const allOrders = await prisma.order.findMany({
    where: {
      userId,
      isDeleted: false,
      archivedAt: null,
    },
    select: {
      totalAmount: true,
      paymentStatus: true,
      buyerId: true,
      orderItemsRel: {
        select: {
          packageQuantity: true,
          piecesPerPackage: true,
        },
      },
    },
  });

  // Calculate aggregates from ALL orders
  // IMPORTANT: totalRevenue = ALL orders (matches FinancialAnalytics behavior)
  // pendingRevenue = Unpaid orders only (what's still owed)
  let totalRevenue = 0;
  let pendingRevenue = 0;
  let paidOrders = 0;
  let unpaidOrders = 0;
  const uniqueBuyers = new Set<string>();

  for (const order of allOrders) {
    const amount = typeof order.totalAmount === 'number'
      ? order.totalAmount
      : (order.totalAmount as any)?.toNumber?.() || parseFloat(String(order.totalAmount)) || 0;

    // Add to total revenue regardless of payment status (matches FinancialAnalytics)
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

  // Check cache first - dashboard data is expensive to compute
  // Cache key includes all parameters to ensure different limits produce distinct cached entries
  const cached = await getCachedQuery<DashboardSnapshot>(
    'dashboard-snapshot',
    { userId, ordersLimit, productsLimit, contactsLimit }
  );
  if (cached) {
    return cached;
  }

  // Fetch paginated lists for display AND calculate aggregates from ALL data
  const [ordersConnection, productsConnection, buyersConnection, suppliersConnection, aggregates] = await Promise.all([
    fetchOrdersConnection({ userId, page: 1, limit: ordersLimit }),
    fetchProductsConnection({ userId, page: 1, limit: productsLimit }),
    fetchBuyersConnection({ userId, page: 1, limit: contactsLimit }),
    fetchSuppliersConnection({ userId, page: 1, limit: contactsLimit }),
    calculateDashboardAggregates(userId),
  ]);

  const result: DashboardSnapshot = {
    orders: ordersConnection.nodes,
    products: productsConnection.nodes,
    buyers: buyersConnection.nodes,
    suppliers: suppliersConnection.nodes,
    totals: {
      orders: ordersConnection.pagination.totalCount,
      products: productsConnection.pagination.totalCount,
      buyers: buyersConnection.pagination.totalCount,
      suppliers: suppliersConnection.pagination.totalCount,
    },
    aggregates,
  };

  // Cache the expensive dashboard query with all parameters in the key
  // Cache for 2 minutes since dashboard data doesn't change frequently
  await setCachedQuery(
    'dashboard-snapshot',
    { userId, ordersLimit, productsLimit, contactsLimit },
    result,
    { ttl: 120 }
  );

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

