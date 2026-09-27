import { prisma } from '@/lib/db';
import { withDashboardAuth } from '../common/auth';
import { dismissCandidate, manualMergeOrder, mergeCandidate, undoAutoMerge } from '@/lib/clientMatching/service';

export const clientMatchingTypeDefs = /* GraphQL */ `
  type ClientMatchSide {
    name: String!
    owner: String
    phone: String
    address: String
    status: String
  }

  type ClientMatchCandidate {
    id: String!
    existingClientId: String!
    incomingOrderId: String!
    provisionalClientId: String
    confidenceScore: Int!
    matchedSignals: [String!]!
    status: String!
    autoMerged: Boolean!
    undoneAt: String
    createdAt: String!
    existing: ClientMatchSide!
    incoming: ClientMatchSide!
  }

  type ClientMatchOrderHit {
    orderId: String!
    storeName: String!
    contactPerson: String!
    contactPhone: String!
    deliveryAddress: String!
    buyerId: String
    orderDate: String!
  }

  extend type Query {
    clientMatchCandidates(userId: Int!, queue: String): [ClientMatchCandidate!]!
    clientMatchPendingCount(userId: Int!): Int!
    searchOrdersForClientMatch(userId: Int!, query: String!): [ClientMatchOrderHit!]!
  }

  extend type Mutation {
    resolveClientMatch(userId: Int!, id: String!, action: String!): Boolean!
    undoClientMatch(userId: Int!, id: String!): Boolean!
    manualMergeClient(userId: Int!, existingClientId: String!, incomingOrderId: String!): Boolean!
  }
`;

function mapCandidate(row: {
  id: string;
  existingClientId: string;
  incomingOrderId: string;
  provisionalClientId: string | null;
  confidenceScore: number;
  matchedSignals: string[];
  status: string;
  autoMerged: boolean;
  undoneAt: Date | null;
  createdAt: Date;
  existingClient: { storeName: string; owner: string; phone: string; address: string; status: string };
  incomingOrder: {
    storeName: string;
    contactPerson: string;
    contactPhone: string;
    deliveryAddress: string;
    orderDate: Date;
  };
}) {
  return {
    id: row.id,
    existingClientId: row.existingClientId,
    incomingOrderId: row.incomingOrderId,
    provisionalClientId: row.provisionalClientId,
    confidenceScore: row.confidenceScore,
    matchedSignals: row.matchedSignals,
    status: row.status,
    autoMerged: row.autoMerged,
    undoneAt: row.undoneAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    existing: {
      name: row.existingClient.storeName,
      owner: row.existingClient.owner,
      phone: row.existingClient.phone,
      address: row.existingClient.address,
      status: row.existingClient.status,
    },
    incoming: {
      name: row.incomingOrder.storeName,
      owner: row.incomingOrder.contactPerson,
      phone: row.incomingOrder.contactPhone,
      address: row.incomingOrder.deliveryAddress,
      status: null,
    },
  };
}

const include = {
  existingClient: { select: { storeName: true, owner: true, phone: true, address: true, status: true } },
  incomingOrder: {
    select: { storeName: true, contactPerson: true, contactPhone: true, deliveryAddress: true, orderDate: true },
  },
} as const;

export const clientMatchingResolvers = {
  Query: {
    clientMatchCandidates: withDashboardAuth(async (args: { userId: number; queue?: string | null }) => {
      const queue = args.queue || 'pending';
      if (queue === 'auto') {
        const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        const rows = await prisma.clientMatchCandidate.findMany({
          where: {
            distributorId: args.userId,
            autoMerged: true,
            status: 'merged',
            undoneAt: null,
            createdAt: { gte: since },
          },
          include,
          orderBy: { createdAt: 'desc' },
        });
        return rows.map(mapCandidate);
      }
      const statuses = queue === 'needs_more_info' ? ['needs_more_info'] : ['pending', 'needs_more_info'];
      const rows = await prisma.clientMatchCandidate.findMany({
        where: { distributorId: args.userId, status: { in: statuses } },
        include,
        orderBy: { createdAt: 'desc' },
      });
      return rows.map(mapCandidate);
    }),
    clientMatchPendingCount: withDashboardAuth(async (args: { userId: number }) =>
      prisma.clientMatchCandidate.count({
        where: { distributorId: args.userId, status: { in: ['pending', 'needs_more_info'] } },
      }),
    ),
    searchOrdersForClientMatch: withDashboardAuth(async (args: { userId: number; query: string }) => {
      const q = args.query.trim();
      if (q.length < 2) return [];
      const orders = await prisma.order.findMany({
        where: {
          userId: args.userId,
          isDeleted: false,
          OR: [
            { storeName: { contains: q, mode: 'insensitive' } },
            { deliveryAddress: { contains: q, mode: 'insensitive' } },
            { contactPerson: { contains: q, mode: 'insensitive' } },
          ],
        },
        select: {
          orderId: true,
          storeName: true,
          contactPerson: true,
          contactPhone: true,
          deliveryAddress: true,
          buyerId: true,
          orderDate: true,
        },
        orderBy: { orderDate: 'desc' },
        take: 20,
      });
      return orders.map((order) => ({
        ...order,
        orderDate: order.orderDate.toISOString(),
      }));
    }),
  },
  Mutation: {
    resolveClientMatch: withDashboardAuth(async (args: { userId: number; id: string; action: string }) => {
      if (args.action === 'merge') await mergeCandidate(args.userId, args.id);
      else if (args.action === 'not_a_match' || args.action === 'needs_more_info') {
        await dismissCandidate(args.userId, args.id, args.action);
      } else throw new Error('Unknown action');
      return true;
    }),
    undoClientMatch: withDashboardAuth(async (args: { userId: number; id: string }) => {
      await undoAutoMerge(args.userId, args.id);
      return true;
    }),
    manualMergeClient: withDashboardAuth(async (args: { userId: number; existingClientId: string; incomingOrderId: string }) => {
      await manualMergeOrder(args.userId, args.existingClientId, args.incomingOrderId);
      return true;
    }),
  },
};
