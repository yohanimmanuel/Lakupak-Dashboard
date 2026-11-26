import { prisma } from '@/lib/db';
import { classifyClientSignals } from '@/lib/clientMatching/signals';
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
    incomingOrderId: String
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

function sideFromSnapshotPart(
  part: { storeName?: string; owner?: string; phone?: string; address?: string; status?: string } | null | undefined,
  fallbackStatus: string,
): { storeName: string; owner: string; phone: string; address: string; status: string } | null {
  if (!part) return null;
  const storeName = String(part.storeName ?? '').trim();
  const owner = String(part.owner ?? '').trim();
  const phone = String(part.phone ?? '').trim();
  const address = String(part.address ?? '').trim();
  if (!storeName && !owner && !phone && !address) return null;
  return { storeName, owner, phone, address, status: part.status || fallbackStatus };
}

function profileFromSnapshot(snapshot: unknown): {
  storeName: string;
  owner: string;
  phone: string;
  address: string;
  status: string;
} | null {
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) return null;
  const profile = (snapshot as {
    provisionalProfile?: { storeName?: string; owner?: string; phone?: string; address?: string; status?: string };
  }).provisionalProfile;
  return sideFromSnapshotPart(profile, 'Active');
}

function marketplaceFromSnapshot(snapshot: unknown): {
  storeName: string;
  owner: string;
  phone: string;
  address: string;
  status: string;
} | null {
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) return null;
  const before = (snapshot as {
    marketplaceBefore?: { storeName?: string; owner?: string; phone?: string; address?: string; status?: string };
  }).marketplaceBefore;
  return sideFromSnapshotPart(before, 'Active');
}

type BuyerSideSource = {
  storeName?: string | null;
  owner?: string | null;
  phone?: string | null;
  address?: string | null;
  status?: string | null;
  name?: string | null;
  contactPerson?: string | null;
  contactPhone?: string | null;
  deliveryAddress?: string | null;
};

function toSide(
  source: BuyerSideSource | null | undefined,
  fallbackStatus: string | null = null,
): { name: string; owner: string | null; phone: string | null; address: string | null; status: string | null } {
  if (!source) {
    return { name: '', owner: null, phone: null, address: null, status: fallbackStatus };
  }
  const name = String(source.storeName ?? source.name ?? '').trim();
  const owner = String(source.owner ?? source.contactPerson ?? '').trim() || null;
  const phone = String(source.phone ?? source.contactPhone ?? '').trim() || null;
  const address = String(source.address ?? source.deliveryAddress ?? '').trim() || null;
  const status = String(source.status ?? '').trim() || fallbackStatus;
  return { name, owner, phone, address, status };
}

/** First side that still has visible buyer details. */
function firstFilledSide(
  ...sides: Array<ReturnType<typeof toSide> | null | undefined>
): ReturnType<typeof toSide> {
  for (const side of sides) {
    if (!side) continue;
    if (side.name || side.owner || side.phone || side.address) return side;
  }
  return { name: '', owner: null, phone: null, address: null, status: null };
}

function mapCandidate(
  row: {
    id: string;
    existingClientId: string;
    incomingOrderId: string | null;
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
    } | null;
    undoSnapshot?: unknown;
  },
  opts?: {
    keepProspect?: boolean;
    provisionalBuyer?: { storeName: string; owner: string; phone: string; address: string; status: string } | null;
  },
) {
  const keepProspect = Boolean(opts?.keepProspect);
  const savedProspect = prospectFromSnapshot(row.undoSnapshot);
  const fromProfile = profileFromSnapshot(row.undoSnapshot);
  const marketplaceBefore = marketplaceFromSnapshot(row.undoSnapshot);
  const liveExisting = toSide(row.existingClient);
  const liveProvisional = toSide(opts?.provisionalBuyer);
  const orderSide = toSide(row.incomingOrder, liveExisting.status);
  const profileSide = toSide(fromProfile);
  const marketSide = toSide(marketplaceBefore, liveExisting.status);
  const prospectSide = toSide(savedProspect, 'Prospect');

  // Left = CRM/prospect; after a merge we prefer the absorbed prospect snapshot so Undo still shows both.
  const existing = keepProspect
    ? firstFilledSide(prospectSide, liveExisting)
    : firstFilledSide(liveExisting, prospectSide);

  // Right = marketplace / other buyer. Never blank when we still have snapshot or provisional data.
  const incoming = firstFilledSide(
    orderSide,
    liveProvisional,
    marketSide,
    profileSide,
    // Merged row: surviving client is existingClientId after merge.
    keepProspect ? liveExisting : null,
  );

  const scored = classifyClientSignals({
    incomingPhone: incoming.phone,
    incomingAddress: incoming.address,
    incomingStoreName: incoming.name,
    incomingOwnerName: incoming.owner,
    existingPhone: existing.phone,
    existingAddress: existing.address,
    existingStoreName: existing.name,
    existingOwnerName: existing.owner,
  });
  return {
    id: row.id,
    existingClientId: row.existingClientId,
    incomingOrderId: row.incomingOrderId,
    provisionalClientId: row.provisionalClientId,
    confidenceScore: scored.score || row.confidenceScore || 0,
    matchedSignals: scored.signals.length ? scored.signals : row.matchedSignals,
    status: row.status,
    autoMerged: row.autoMerged,
    undoneAt: row.undoneAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    existing,
    incoming,
  };
}

async function mapCandidatesWithProvisional(
  distributorId: number,
  rows: Array<Parameters<typeof mapCandidate>[0]>,
  keepProspect?: boolean | ((row: Parameters<typeof mapCandidate>[0]) => boolean),
) {
  const provisionalIds = Array.from(
    new Set(
      rows
        .map((row) => row.provisionalClientId)
        .filter((id): id is string => Boolean(id && id.trim())),
    ),
  );
  const provisionalBuyers =
    provisionalIds.length > 0
      ? await prisma.buyer.findMany({
          where: { userId: distributorId, buyerId: { in: provisionalIds } },
          select: { buyerId: true, storeName: true, owner: true, phone: true, address: true, status: true },
        })
      : [];
  const byId = new Map(provisionalBuyers.map((buyer) => [buyer.buyerId, buyer]));
  return rows.map((row) =>
    mapCandidate(row, {
      keepProspect: typeof keepProspect === 'function' ? keepProspect(row) : Boolean(keepProspect),
      provisionalBuyer: row.provisionalClientId ? byId.get(row.provisionalClientId) ?? null : null,
    }),
  );
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
        const mapped = await mapCandidatesWithProvisional(
          args.userId,
          rows,
          (row) => row.status === 'merged',
        );
        return [...mapped, ...withoutKnownPairs(rows, possible)];
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
        return mapCandidatesWithProvisional(args.userId, rows, true);
      }
      if (queue === 'not_a_match') {
        const rows = await prisma.clientMatchCandidate.findMany({
          where: { distributorId: args.userId, status: 'not_a_match' },
          include,
          orderBy: { createdAt: 'desc' },
        });
        return mapCandidatesWithProvisional(args.userId, rows);
      }
      if (queue === 'pending') await reopenUndoneMatches(args.userId);
      const statuses = queue === 'needs_more_info' ? ['needs_more_info'] : ['pending', 'needs_more_info'];
      const rows = await prisma.clientMatchCandidate.findMany({
        where: { distributorId: args.userId, status: { in: statuses } },
        include,
        orderBy: { createdAt: 'desc' },
      });
      const mapped = await mapCandidatesWithProvisional(args.userId, rows);
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
