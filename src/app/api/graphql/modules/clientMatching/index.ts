import { prisma } from '@/lib/db';
import { withDashboardAuth } from '../common/auth';
import { countBuyerMatchesForReview, dismissCandidate, findPossibleBuyerMatches, getClientMatchSettings, manualMergeOrder, mergeCandidate, reopenUndoneMatches, setClientMatchSettings, undoAutoMerge, undoDismissedMatch } from '@/lib/clientMatching/service';

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

  type ClientMatchSettings {
    autoMatch: Boolean!
  }

  type ClientMatchQueueCounts {
    pending: Int!
    needsMoreInfo: Int!
    notAMatch: Int!
    recentlyMerged: Int!
  }

  extend type Query {
    clientMatchCandidates(userId: Int!, queue: String): [ClientMatchCandidate!]!
    clientMatchPendingCount(userId: Int!): Int!
    clientMatchQueueCounts(userId: Int!): ClientMatchQueueCounts!
    clientMatchSettings(userId: Int!): ClientMatchSettings!
    searchOrdersForClientMatch(userId: Int!, query: String!): [ClientMatchOrderHit!]!
  }

  extend type Mutation {
    resolveClientMatch(userId: Int!, id: String!, action: String!): Boolean!
    undoClientMatch(userId: Int!, id: String!): Boolean!
    manualMergeClient(userId: Int!, existingClientId: String!, incomingOrderId: String!): Boolean!
    updateClientMatchSettings(userId: Int!, autoMatch: Boolean!): ClientMatchSettings!
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
  undoSnapshot?: unknown;
}, keepProspect?: boolean) {
  const savedProspect = keepProspect ? prospectFromSnapshot(row.undoSnapshot) : null;
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
    existing: savedProspect
      ? {
          name: savedProspect.storeName,
          owner: savedProspect.owner,
          phone: savedProspect.phone,
          address: savedProspect.address,
          status: savedProspect.status || 'Prospect',
        }
      : {
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
      status: savedProspect ? row.existingClient.status : null,
    },
  };
}

function prospectFromSnapshot(snapshot: unknown): { storeName: string; owner: string; phone: string; address: string; status: string } | null {
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) return null;
  const prospect = (snapshot as { prospect?: { storeName?: string; owner?: string; phone?: string; address?: string; status?: string } }).prospect;
  if (!prospect) return null;
  const storeName = String(prospect.storeName ?? '').trim();
  const owner = String(prospect.owner ?? '').trim();
  const phone = String(prospect.phone ?? '').trim();
  const address = String(prospect.address ?? '').trim();
  if (!storeName && !owner && !phone && !address) return null;
  return { storeName, owner, phone, address, status: prospect.status || 'Prospect' };
}

function buyerPairKey(existingClientId: string, provisionalClientId: string | null | undefined): string | null {
  const left = existingClientId.trim();
  const right = String(provisionalClientId ?? '').trim();
  if (!left || !right) return null;
  return [left, right].sort().join('|');
}

/** Drops synthetic pairs that a saved candidate already represents. */
function withoutKnownPairs<T extends { existingClientId: string; provisionalClientId: string | null }>(
  rows: { existingClientId: string; provisionalClientId: string | null }[],
  possible: T[],
): T[] {
  const known = new Set<string>();
  for (const row of rows) {
    const key = buyerPairKey(row.existingClientId, row.provisionalClientId);
    if (key) known.add(key);
  }
  if (!known.size) return possible;
  return possible.filter((match) => {
    const key = buyerPairKey(match.existingClientId, match.provisionalClientId);
    return key == null || !known.has(key);
  });
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
      if (queue === 'all') {
        await reopenUndoneMatches(args.userId);
        const rows = await prisma.clientMatchCandidate.findMany({
          where: { distributorId: args.userId },
          include,
          orderBy: { createdAt: 'desc' },
        });
        const possible = await findPossibleBuyerMatches(args.userId);
        return [...rows.map((row) => mapCandidate(row, row.status === 'merged')), ...withoutKnownPairs(rows, possible)];
      }
      if (queue === 'auto') {
        const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        const rows = await prisma.clientMatchCandidate.findMany({
          where: {
            distributorId: args.userId,
            status: 'merged',
            undoneAt: null,
            createdAt: { gte: since },
          },
          include,
          orderBy: { createdAt: 'desc' },
        });
        return rows.map((row) => mapCandidate(row, true));
      }
      if (queue === 'not_a_match') {
        const rows = await prisma.clientMatchCandidate.findMany({
          where: { distributorId: args.userId, status: 'not_a_match' },
          include,
          orderBy: { createdAt: 'desc' },
        });
        return rows.map((row) => mapCandidate(row));
      }
      if (queue === 'pending') await reopenUndoneMatches(args.userId);
      const statuses = queue === 'needs_more_info' ? ['needs_more_info'] : ['pending', 'needs_more_info'];
      const rows = await prisma.clientMatchCandidate.findMany({
        where: { distributorId: args.userId, status: { in: statuses } },
        include,
        orderBy: { createdAt: 'desc' },
      });
      const mapped = rows.map((row) => mapCandidate(row));
      if (queue === 'needs_more_info') return mapped;
      const possible = await findPossibleBuyerMatches(args.userId);
      return [...mapped, ...withoutKnownPairs(rows, possible)];
    }),
    clientMatchPendingCount: withDashboardAuth(async (args: { userId: number }) => {
      await reopenUndoneMatches(args.userId);
      return countBuyerMatchesForReview(args.userId);
    }),
    clientMatchQueueCounts: withDashboardAuth(async (args: { userId: number }) => {
      await reopenUndoneMatches(args.userId);
      const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const where = { distributorId: args.userId };
      const [pending, needsMoreInfo, notAMatch, recentlyMerged] = await Promise.all([
        countBuyerMatchesForReview(args.userId),
        prisma.clientMatchCandidate.count({ where: { ...where, status: 'needs_more_info' } }),
        prisma.clientMatchCandidate.count({ where: { ...where, status: 'not_a_match' } }),
        prisma.clientMatchCandidate.count({
          where: { ...where, status: 'merged', undoneAt: null, createdAt: { gte: since } },
        }),
      ]);
      return { pending, needsMoreInfo, notAMatch, recentlyMerged };
    }),
    clientMatchSettings: withDashboardAuth(async (args: { userId: number }) => getClientMatchSettings(args.userId)),
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
      const row = await prisma.clientMatchCandidate.findFirst({
        where: { id: args.id, distributorId: args.userId },
        select: { status: true },
      });
      if (!row) throw new Error('Match not found');
      if (row.status === 'not_a_match') await undoDismissedMatch(args.userId, args.id);
      else await undoAutoMerge(args.userId, args.id);
      return true;
    }),
    manualMergeClient: withDashboardAuth(async (args: { userId: number; existingClientId: string; incomingOrderId: string }) => {
      await manualMergeOrder(args.userId, args.existingClientId, args.incomingOrderId);
      return true;
    }),
    updateClientMatchSettings: withDashboardAuth(async (args: { userId: number; autoMatch: boolean }) =>
      setClientMatchSettings(args.userId, args.autoMatch),
    ),
  },
};
