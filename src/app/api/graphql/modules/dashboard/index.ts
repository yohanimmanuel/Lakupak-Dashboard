import { fetchOrdersConnection } from '../orders';
import { fetchProductsConnection } from '../products';
import { fetchBuyersConnection, fetchSuppliersConnection } from '../contacts';
import { sanitizePagination } from '../common/utils';

export const dashboardTypeDefs = /* GraphQL */ `
  type DashboardTotals {
    orders: Int!
    products: Int!
    buyers: Int!
    suppliers: Int!
  }

  type DashboardSnapshot {
    orders: [Order!]!
    products: [Product!]!
    buyers: [Buyer!]!
    suppliers: [Supplier!]!
    totals: DashboardTotals!
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

const buildDashboardSnapshot = async (args: {
  userId: number;
  ordersLimit: number;
  productsLimit: number;
  contactsLimit: number;
}) => {
  const { userId, ordersLimit, productsLimit, contactsLimit } = args;

  const [ordersConnection, productsConnection, buyersConnection, suppliersConnection] = await Promise.all([
    fetchOrdersConnection({ userId, page: 1, limit: ordersLimit }),
    fetchProductsConnection({ userId, page: 1, limit: productsLimit }),
    fetchBuyersConnection({ userId, page: 1, limit: contactsLimit }),
    fetchSuppliersConnection({ userId, page: 1, limit: contactsLimit }),
  ]);

  return {
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
  };
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

