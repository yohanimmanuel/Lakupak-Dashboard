import type { Prisma } from '@/lib/db';
import { prisma } from '@/lib/db';
import { completeActiveProspectJobs, reopenProspectJobs, withSuppressAutoComplete } from '@/lib/salesJobs/service';
import { classifyClientSignals, phonesMatch, type MatchSignal } from '@/lib/clientMatching/signals';
import { parseMarketplaceUserIdFromBuyerId } from '@/utils/buyerSync';

type Tx = Prisma.TransactionClient;

export type ProvisionalProfile = {
  buyerId: string;
  owner: string;
  email: string;
  phone: string;
  storeName: string;
  businessType: string;
  address: string;
  avatar: string | null;
  status: string;
  userId: number;
};

export type MarketplaceMatchPlan = {
  distributorId: number;
  buyerId: string;
  preserveExistingClient: boolean;
  kind: 'returning' | 'high' | 'medium' | 'new';
  candidate: null | {
    existingClientId: string;
    provisionalClientId: string | null;
    confidenceScore: number;
    matchedSignals: MatchSignal[];
    priorStatus: string;
    provisionalProfile: ProvisionalProfile;
  };
};

function profileFrom(input: {
  intendedBuyerId: string;
  distributorId: number;
  phone: string;
  storeName: string;
  ownerName: string;
  address: string;
  email: string;
  avatar: string | null;
}): ProvisionalProfile {
  return {
    buyerId: input.intendedBuyerId,
    owner: input.ownerName || 'Marketplace buyer',
    email: input.email || '',
    phone: input.phone || '',
    storeName: input.storeName || 'Store',
    businessType: 'Retailer',
    address: input.address || '',
    avatar: input.avatar,
    status: 'Active',
    userId: input.distributorId,
  };
}

const PLACEHOLDERS = new Set(['marketplace buyer', 'mobile user', 'mobile store', 'store', 'unknown', 'unknown store']);

function present(value: string | null | undefined): string | null {
  const trimmed = String(value ?? '').trim();
  if (!trimmed || PLACEHOLDERS.has(trimmed.toLowerCase())) return null;
  return trimmed;
}

function preferIncoming(incoming: string | null | undefined, prospect: string | null | undefined, fallback = ''): string {
  return present(incoming) ?? present(prospect) ?? fallback;
}

function firstPresent(...values: Array<string | null | undefined>): string {
  for (const value of values) {
    const found = present(value);
    if (found) return found;
  }
  return '';
}

type BuyerSnapshot = {
  buyerId: string;
  owner: string;
  email: string;
  phone: string;
  storeName: string;
  businessType: string;
  address: string;
  avatar: string | null;
  status: string;
  customerNumber: string | null;
  logistics: string | null;
  notes: string | null;
};

type MergeUndoSnapshot = {
  priorStatus: string;
  prospect: BuyerSnapshot;
  marketplaceBefore: BuyerSnapshot;
  movedOrderIds: string[];
  movedJobIds: string[];
  /** Prospect jobs this merge moved, with the client they had before the merge. */
  splitProspectJobs?: { id: string; clientId: string }[];
  movedOfferIds: string[];
  /** Orders whose buyerId was null before this merge. Undo clears that link. */
  nullOriginOrderIds?: string[];
};

function snapshotBuyer(buyer: BuyerSnapshot): BuyerSnapshot {
  return {
    buyerId: buyer.buyerId,
    owner: buyer.owner,
    email: buyer.email,
    phone: buyer.phone,
    storeName: buyer.storeName,
    businessType: buyer.businessType,
    address: buyer.address,
    avatar: buyer.avatar,
    status: buyer.status,
    customerNumber: buyer.customerNumber,
    logistics: buyer.logistics,
    notes: buyer.notes,
  };
}

const BUYER_SNAPSHOT_SELECT = {
  buyerId: true,
  owner: true,
  email: true,
  phone: true,
  storeName: true,
  businessType: true,
  address: true,
  avatar: true,
  status: true,
  customerNumber: true,
  logistics: true,
  notes: true,
} as const;

export async function getClientMatchSettings(distributorId: number) {
  const user = await prisma.user.findUnique({
    where: { id: distributorId },
    select: { autoClientMatch: true },
  });
  return { autoMatch: user?.autoClientMatch ?? false };
}

const REVIEW_OPEN_STATUSES = ['pending', 'needs_more_info'] as const;
/** A possible match counts when it is still open, or the score is above this. */
const POSSIBLE_MATCH_SCORE = 50;

export type ReviewBuyerMatch = {
  id: string;
  existingClientId: string;
  incomingOrderId: string;
  provisionalClientId: string | null;
  confidenceScore: number;
  matchedSignals: MatchSignal[];
  status: 'pending';
  autoMerged: false;
  undoneAt: null;
  createdAt: string;
  existing: { name: string; owner: string | null; phone: string | null; address: string | null; status: string };
  incoming: { name: string; owner: string | null; phone: string | null; address: string | null; status: string };
};

function buyerMatchSide(buyer: { storeName: string; owner: string; phone: string; address: string; status: string }) {
  return {
    name: buyer.storeName,
    owner: buyer.owner,
    phone: buyer.phone,
    address: buyer.address,
    status: buyer.status,
  };
}

/** Prospects that look like another buyer and are not already in the open review queue. */
export async function findPossibleBuyerMatches(distributorId: number): Promise<ReviewBuyerMatch[]> {
  const known = await prisma.clientMatchCandidate.findMany({
    where: { distributorId },
    select: { existingClientId: true, provisionalClientId: true, status: true },
  });
  const covered = new Set<string>();
  const knownPairs = new Set<string>();
  for (const row of known) {
    if (REVIEW_OPEN_STATUSES.includes(row.status as (typeof REVIEW_OPEN_STATUSES)[number])) {
      covered.add(row.existingClientId);
      if (row.provisionalClientId) covered.add(row.provisionalClientId);
    }
    if (row.provisionalClientId) knownPairs.add([row.existingClientId, row.provisionalClientId].sort().join('|'));
  }

  const buyers = await prisma.buyer.findMany({
    where: { userId: distributorId, status: { in: ['Prospect', 'Active'] } },
    select: { buyerId: true, owner: true, phone: true, storeName: true, address: true, status: true },
  });
  const prospects = buyers.filter((buyer) => buyer.status === 'Prospect' && !covered.has(buyer.buyerId));
  const matches: ReviewBuyerMatch[] = [];
  const seen = new Set<string>();

  for (const prospect of prospects) {
    let best: { buyer: (typeof buyers)[number]; result: ReturnType<typeof classifyClientSignals> } | null = null;
    for (const other of buyers) {
      if (other.buyerId === prospect.buyerId) continue;
      const result = classifyClientSignals({
        incomingPhone: prospect.phone,
        incomingAddress: prospect.address,
        incomingStoreName: prospect.storeName,
        incomingOwnerName: prospect.owner,
        existingPhone: other.phone,
        existingAddress: other.address,
        existingStoreName: other.storeName,
        existingOwnerName: other.owner,
      });
      if (result.score < POSSIBLE_MATCH_SCORE) continue;
      if (!best || result.score > best.result.score) best = { buyer: other, result };
    }
    if (!best) continue;
    const key = [prospect.buyerId, best.buyer.buyerId].sort().join('|');
    if (seen.has(key) || knownPairs.has(key)) continue;
    seen.add(key);
    matches.push({
      id: `possible:${prospect.buyerId}:${best.buyer.buyerId}`,
      existingClientId: prospect.buyerId,
      incomingOrderId: '',
      provisionalClientId: best.buyer.buyerId,
      confidenceScore: best.result.score,
      matchedSignals: best.result.signals,
      status: 'pending',
      autoMerged: false,
      undoneAt: null,
      createdAt: new Date().toISOString(),
      existing: buyerMatchSide(prospect),
      incoming: buyerMatchSide(best.buyer),
    });
  }
  if (matches.length === 0) return matches;
  const buyerIds = Array.from(
    new Set(matches.flatMap((match) => [match.existingClientId, match.provisionalClientId].filter((id): id is string => Boolean(id)))),
  );
  const orders = await prisma.order.findMany({
    where: { userId: distributorId, isDeleted: false, buyerId: { in: buyerIds } },
    orderBy: { createdAt: 'desc' },
    select: { orderId: true, buyerId: true },
  });
  const orderByBuyer = new Map<string, string>();
  for (const order of orders) {
    if (order.buyerId && !orderByBuyer.has(order.buyerId)) orderByBuyer.set(order.buyerId, order.orderId);
  }
  for (const match of matches) {
    match.incomingOrderId =
      (match.provisionalClientId && orderByBuyer.get(match.provisionalClientId)) || orderByBuyer.get(match.existingClientId) || '';
  }
  return matches;
}

/** Open review rows, plus possible matches still pending or above 50 confidence. */
export async function countBuyerMatchesForReview(distributorId: number): Promise<number> {
  const open = await prisma.clientMatchCandidate.count({
    where: {
      distributorId,
      OR: [
        { status: { in: [...REVIEW_OPEN_STATUSES] } },
        { confidenceScore: { gt: POSSIBLE_MATCH_SCORE }, status: { notIn: ['merged', 'not_a_match'] } },
      ],
    },
  });
  const possible = await findPossibleBuyerMatches(distributorId);
  return open + possible.length;
}

export async function setClientMatchSettings(distributorId: number, autoMatch: boolean) {
  await prisma.user.update({
    where: { id: distributorId },
    data: { autoClientMatch: autoMatch },
  });
  return { autoMatch };
}

export async function planMarketplaceClientMatch(input: {
  distributorId: number;
  intendedBuyerId: string;
  phone: string;
  storeName: string;
  ownerName: string;
  address: string;
  email: string;
  avatar: string | null;
}): Promise<MarketplaceMatchPlan> {
  const existingIntended = await prisma.buyer.findUnique({
    where: { buyerId: input.intendedBuyerId },
    select: { buyerId: true },
  });
  if (existingIntended) {
    return {
      distributorId: input.distributorId,
      buyerId: input.intendedBuyerId,
      preserveExistingClient: false,
      kind: 'returning',
      candidate: null,
    };
  }

  const clients = await prisma.buyer.findMany({
    where: {
      userId: input.distributorId,
      status: { in: ['Prospect', 'Active'] },
      buyerId: { not: input.intendedBuyerId },
    },
    select: {
      buyerId: true,
      owner: true,
      phone: true,
      storeName: true,
      address: true,
      status: true,
    },
  });

  let best: { buyerId: string; status: string; result: ReturnType<typeof classifyClientSignals> } | null = null;
  for (const client of clients) {
    const result = classifyClientSignals({
      incomingPhone: input.phone,
      incomingAddress: input.address,
      incomingStoreName: input.storeName,
      incomingOwnerName: input.ownerName,
      existingPhone: client.phone,
      existingAddress: client.address,
      existingStoreName: client.storeName,
      existingOwnerName: client.owner,
    });
    if (isMarketplaceBuyerId(client.buyerId)) continue;
    if (result.level === 'none') continue;
    if (!best || phoneMatchOutranks(result, best.result)) {
      best = { buyerId: client.buyerId, status: client.status, result };
    }
  }

  const provisionalProfile = profileFrom(input);
  if (!best) {
    return {
      distributorId: input.distributorId,
      buyerId: input.intendedBuyerId,
      preserveExistingClient: false,
      kind: 'new',
      candidate: null,
    };
  }

  const autoMatch = best.result.level === 'high' ? (await getClientMatchSettings(input.distributorId)).autoMatch : false;
  if (best.result.level === 'high' && autoMatch) {
    return {
      distributorId: input.distributorId,
      buyerId: input.intendedBuyerId,
      preserveExistingClient: false,
      kind: 'high',
      candidate: {
        existingClientId: best.buyerId,
        provisionalClientId: input.intendedBuyerId,
        confidenceScore: best.result.score,
        matchedSignals: best.result.signals,
        priorStatus: best.status,
        provisionalProfile,
      },
    };
  }

  return {
    distributorId: input.distributorId,
    buyerId: input.intendedBuyerId,
    preserveExistingClient: false,
    kind: 'medium',
    candidate: {
      existingClientId: best.buyerId,
      provisionalClientId: input.intendedBuyerId,
      confidenceScore: best.result.score,
      matchedSignals: best.result.signals,
      priorStatus: best.status,
      provisionalProfile,
    },
  };
}

function isMarketplaceBuyerId(buyerId: string): boolean {
  return /^LKB-\d+-\d+$/.test(buyerId) || buyerId.startsWith('mobile_user_');
}

function phoneMatchOutranks(
  next: ReturnType<typeof classifyClientSignals>,
  current: ReturnType<typeof classifyClientSignals>,
): boolean {
  const nextPhone = next.signals.includes('phone_match');
  const currentPhone = current.signals.includes('phone_match');
  if (nextPhone !== currentPhone) return nextPhone;
  return next.score > current.score;
}

type IncomingProfile = {
  owner?: string | null;
  email?: string | null;
  phone?: string | null;
  storeName?: string | null;
  businessType?: string | null;
  address?: string | null;
  avatar?: string | null;
};

async function mergeProspectIntoMarketplace(
  tx: Tx,
  args: {
    distributorId: number;
    prospectId: string;
    marketplaceBuyerId: string;
    incoming: IncomingProfile;
    incomingOrderId: string;
    keepCandidateId?: string;
  },
): Promise<MergeUndoSnapshot | null> {
  if (args.prospectId === args.marketplaceBuyerId) return null;
  if (isMarketplaceBuyerId(args.prospectId)) throw new Error('Marketplace buyer cannot be merged as a prospect');
  const prospect = await tx.buyer.findFirst({
    where: { buyerId: args.prospectId, userId: args.distributorId },
    select: BUYER_SNAPSHOT_SELECT,
  });
  const market = await tx.buyer.findFirst({
    where: { buyerId: args.marketplaceBuyerId, userId: args.distributorId },
    select: BUYER_SNAPSHOT_SELECT,
  });
  if (!prospect || !market) throw new Error('Client not found');

  const marketplaceUserId = parseMarketplaceUserIdFromBuyerId(market.buyerId);
  const [marketplaceUser, incomingOrder, orders, jobs, offers] = await Promise.all([
    marketplaceUserId
      ? tx.marketplaceUser.findUnique({
          where: { id: marketplaceUserId },
          select: { name: true, email: true, phone: true, storeName: true, chosenAddress: true, image: true },
        })
      : Promise.resolve(null),
    tx.order.findFirst({
      where: { orderId: args.incomingOrderId, userId: args.distributorId },
      select: { storeName: true, contactPerson: true, contactPhone: true, deliveryAddress: true, customerEmail: true },
    }),
    tx.order.findMany({ where: { buyerId: prospect.buyerId, userId: args.distributorId }, select: { orderId: true } }),
    tx.salesJob.findMany({
      where: { clientId: prospect.buyerId, distributorId: args.distributorId },
      select: { id: true, jobType: true, clientId: true },
    }),
    tx.offer.findMany({ where: { buyerId: prospect.buyerId, userId: args.distributorId }, select: { offerId: true } }),
  ]);

  const customerNumber = market.customerNumber || prospect.customerNumber;
  if (prospect.customerNumber && prospect.customerNumber !== market.customerNumber) {
    await tx.buyer.update({ where: { buyerId: prospect.buyerId }, data: { customerNumber: null } });
  }

  await tx.buyer.update({
    where: { buyerId: market.buyerId },
    data: {
      owner: firstPresent(marketplaceUser?.name, incomingOrder?.contactPerson, args.incoming.owner, market.owner, prospect.owner),
      email: firstPresent(marketplaceUser?.email, incomingOrder?.customerEmail, args.incoming.email, market.email, prospect.email),
      phone: firstPresent(marketplaceUser?.phone, incomingOrder?.contactPhone, args.incoming.phone, market.phone, prospect.phone),
      storeName: firstPresent(marketplaceUser?.storeName, incomingOrder?.storeName, args.incoming.storeName, market.storeName, prospect.storeName),
      businessType: firstPresent(market.businessType, args.incoming.businessType, prospect.businessType) || 'Retailer',
      address: firstPresent(marketplaceUser?.chosenAddress, incomingOrder?.deliveryAddress, args.incoming.address, market.address, prospect.address),
      avatar: marketplaceUser?.image || market.avatar || args.incoming.avatar || prospect.avatar,
      customerNumber,
      logistics: present(market.logistics) ?? prospect.logistics,
      notes: present(market.notes) ?? prospect.notes,
      status: 'Active',
    },
  });

  if (orders.length > 0) {
    await tx.order.updateMany({
      where: { orderId: { in: orders.map((order) => order.orderId) }, userId: args.distributorId },
      data: { buyerId: market.buyerId },
    });
  }
  if (jobs.length > 0) {
    await tx.salesJob.updateMany({
      where: { id: { in: jobs.map((job) => job.id) }, distributorId: args.distributorId },
      data: { clientId: market.buyerId },
    });
  }
  if (offers.length > 0) {
    await tx.offer.updateMany({
      where: { offerId: { in: offers.map((offer) => offer.offerId) }, userId: args.distributorId },
      data: { buyerId: market.buyerId },
    });
  }
  await tx.clientMatchCandidate.updateMany({
    where: {
      distributorId: args.distributorId,
      existingClientId: prospect.buyerId,
      status: { notIn: ['pending', 'needs_more_info'] },
    },
    data: { existingClientId: market.buyerId },
  });
  if (args.keepCandidateId) {
    await tx.clientMatchCandidate.updateMany({
      where: { id: args.keepCandidateId, distributorId: args.distributorId, existingClientId: prospect.buyerId },
      data: { existingClientId: market.buyerId },
    });
  }
  await tx.clientMatchCandidate.updateMany({
    where: {
      distributorId: args.distributorId,
      existingClientId: prospect.buyerId,
      status: { in: ['pending', 'needs_more_info'] },
      incomingOrderId: { not: args.incomingOrderId },
    },
    data: { existingClientId: market.buyerId },
  });
  await tx.clientMatchCandidate.deleteMany({
    where: {
      distributorId: args.distributorId,
      existingClientId: prospect.buyerId,
      status: { in: ['pending', 'needs_more_info'] },
      incomingOrderId: args.incomingOrderId,
    },
  });
  await tx.buyer.delete({ where: { buyerId: prospect.buyerId } });

  return {
    priorStatus: prospect.status,
    prospect: snapshotBuyer(prospect),
    marketplaceBefore: snapshotBuyer(market),
    movedOrderIds: orders.map((order) => order.orderId),
    movedJobIds: jobs.map((job) => job.id),
    splitProspectJobs: jobs
      .filter((job) => job.jobType === 'prospect_new_outlet' && job.clientId)
      .map((job) => ({ id: job.id, clientId: job.clientId as string })),
    movedOfferIds: offers.map((offer) => offer.offerId),
  };
}

async function fillBuyerFromIncoming(tx: Tx, buyerId: string, incoming: IncomingProfile): Promise<BuyerSnapshot> {
  const buyer = await tx.buyer.findUnique({ where: { buyerId }, select: BUYER_SNAPSHOT_SELECT });
  if (!buyer) throw new Error('Client not found');
  const before = snapshotBuyer(buyer);
  await tx.buyer.update({
    where: { buyerId },
    data: {
      owner: preferIncoming(incoming.owner, buyer.owner, buyer.owner),
      email: preferIncoming(incoming.email, buyer.email, buyer.email),
      phone: preferIncoming(incoming.phone, buyer.phone, buyer.phone),
      storeName: preferIncoming(incoming.storeName, buyer.storeName, buyer.storeName),
      businessType: preferIncoming(incoming.businessType, buyer.businessType, buyer.businessType),
      address: preferIncoming(incoming.address, buyer.address, buyer.address),
      avatar: incoming.avatar || buyer.avatar,
      status: buyer.status === 'Prospect' ? 'Active' : buyer.status,
    },
  });
  return before;
}

function inPlaceUndo(before: BuyerSnapshot): MergeUndoSnapshot {
  return {
    priorStatus: before.status,
    prospect: before,
    marketplaceBefore: before,
    movedOrderIds: [],
    movedJobIds: [],
    movedOfferIds: [],
  };
}

async function applyBuyerSnapshot(tx: Tx, distributorId: number, buyer: BuyerSnapshot, createIfMissing: boolean) {
  if (buyer.customerNumber) {
    await tx.buyer.updateMany({
      where: {
        userId: distributorId,
        customerNumber: buyer.customerNumber,
        buyerId: { not: buyer.buyerId },
      },
      data: { customerNumber: null },
    });
  }
  const data = {
    owner: buyer.owner,
    email: buyer.email,
    phone: buyer.phone,
    storeName: buyer.storeName,
    businessType: buyer.businessType || 'Retailer',
    address: buyer.address,
    avatar: buyer.avatar,
    status: buyer.status || 'Prospect',
    customerNumber: buyer.customerNumber,
    logistics: buyer.logistics,
    notes: buyer.notes,
  };
  const existing = await tx.buyer.findUnique({
    where: { buyerId: buyer.buyerId },
    select: { buyerId: true, userId: true },
  });
  if (existing) {
    if (existing.userId !== distributorId) throw new Error('Client not found');
    await tx.buyer.update({ where: { buyerId: buyer.buyerId }, data });
    return;
  }
  if (!createIfMissing) return;
  await tx.buyer.create({
    data: {
      buyerId: buyer.buyerId,
      userId: distributorId,
      ...data,
    },
  });
}

async function restoreMovedJobs(
  tx: Tx,
  distributorId: number,
  prospectBuyerId: string,
  movedJobIds: string[],
  splitProspectJobs: { id: string; clientId: string }[] = [],
) {
  if (!movedJobIds.length) return;
  const originalClient = new Map(splitProspectJobs.map((row) => [row.id, row.clientId]));
  const moved = await tx.salesJob.findMany({
    where: { id: { in: movedJobIds }, distributorId },
    select: { id: true, assignedTo: true, clientId: true, jobType: true, completionData: true },
  });
  const clientIds = Array.from(new Set(moved.map((job) => job.clientId).filter((id): id is string => Boolean(id))));
  const siblings = clientIds.length
    ? await tx.salesJob.findMany({
        where: { distributorId, clientId: { in: clientIds } },
        select: { id: true, assignedTo: true, clientId: true },
      })
    : [];
  const movedSet = new Set(moved.map((job) => job.id));
  const stay = [];
  const moveIds: string[] = [];
  for (const job of moved) {
    const group = siblings.filter((row) => row.clientId === job.clientId && row.assignedTo === job.assignedTo);
    const anchored = group.some((row) => !movedSet.has(row.id));
    if (job.jobType === 'prospect_new_outlet' && anchored) stay.push(job);
    else moveIds.push(job.id);
  }
  for (const id of moveIds) {
    await tx.salesJob.update({
      where: { id },
      data: { clientId: originalClient.get(id) || prospectBuyerId },
    });
  }
  for (const job of stay) {
    await tx.salesJob.update({
      where: { id: job.id },
      data: {
        status: 'pending',
        completedAt: null,
        completionData: withSuppressAutoComplete(job.completionData),
      },
    });
  }
}

async function restoreProspectSnapshot(tx: Tx, distributorId: number, snapshot: MergeUndoSnapshot) {
  const prospect = snapshot.prospect;
  const before = snapshot.marketplaceBefore;
  if (before?.buyerId && before.buyerId !== prospect.buyerId) {
    await applyBuyerSnapshot(tx, distributorId, before, false);
  }
  await applyBuyerSnapshot(tx, distributorId, prospect, true);
  if ((snapshot.movedOrderIds ?? []).length > 0) {
    await tx.order.updateMany({
      where: { orderId: { in: snapshot.movedOrderIds }, userId: distributorId },
      data: { buyerId: prospect.buyerId },
    });
  }
  await restoreMovedJobs(
    tx,
    distributorId,
    prospect.buyerId,
    snapshot.movedJobIds ?? [],
    snapshot.splitProspectJobs ?? [],
  );
  if ((snapshot.movedOfferIds ?? []).length > 0) {
    await tx.offer.updateMany({
      where: { offerId: { in: snapshot.movedOfferIds }, userId: distributorId },
      data: { buyerId: prospect.buyerId },
    });
  }
  await clearNullOriginOrders(tx, distributorId, snapshot.nullOriginOrderIds);
  if ((prospect.status || 'Prospect') !== 'Active') {
    await reopenProspectJobs(distributorId, [prospect.buyerId], tx);
  }
}

async function claimNullBuyerOrder(tx: Tx, distributorId: number, orderId: string, buyerId: string): Promise<string[]> {
  const order = await tx.order.findFirst({
    where: { orderId, userId: distributorId, isDeleted: false },
    select: { buyerId: true },
  });
  if (!order || order.buyerId) return [];
  await tx.order.updateMany({
    where: { orderId, userId: distributorId, buyerId: order.buyerId },
    data: { buyerId },
  });
  return [orderId];
}

async function clearNullOriginOrders(tx: Tx, distributorId: number, orderIds: string[] | undefined) {
  if (!orderIds?.length) return;
  await tx.order.updateMany({
    where: { orderId: { in: orderIds }, userId: distributorId },
    data: { buyerId: null },
  });
}

export async function finalizeMarketplaceClientMatch(plan: MarketplaceMatchPlan, incomingOrderId: string) {
  if (!plan.candidate) return;
  if (plan.kind === 'high') {
    await prisma.$transaction(async (tx) => {
      const undo = await mergeProspectIntoMarketplace(tx, {
        distributorId: plan.distributorId,
        prospectId: plan.candidate!.existingClientId,
        marketplaceBuyerId: plan.buyerId,
        incoming: plan.candidate!.provisionalProfile,
        incomingOrderId,
      });
      await completeActiveProspectJobs(plan.distributorId, tx, true, [plan.buyerId]);
      await tx.clientMatchCandidate.create({
        data: {
          distributorId: plan.distributorId,
          existingClientId: plan.buyerId,
          incomingOrderId,
          provisionalClientId: plan.candidate!.existingClientId,
          confidenceScore: plan.candidate!.confidenceScore,
          matchedSignals: plan.candidate!.matchedSignals,
          status: 'merged',
          autoMerged: true,
          undoSnapshot: (undo ?? {
            priorStatus: plan.candidate!.priorStatus,
            provisionalProfile: plan.candidate!.provisionalProfile,
          }) as Prisma.InputJsonValue,
        },
      });
    });
    return;
  }

  if (plan.kind === 'medium') {
    await prisma.clientMatchCandidate.create({
      data: {
        distributorId: plan.distributorId,
        existingClientId: plan.candidate.existingClientId,
        incomingOrderId,
        provisionalClientId: plan.candidate.provisionalClientId,
        confidenceScore: plan.candidate.confidenceScore,
        matchedSignals: plan.candidate.matchedSignals,
        status: 'pending',
        autoMerged: false,
        undoSnapshot: {
          priorStatus: plan.candidate.priorStatus,
          provisionalProfile: plan.candidate.provisionalProfile,
        },
      },
    });
  }
}

function parsePossibleMatchId(candidateId: string): { prospectId: string; otherId: string } | null {
  if (!candidateId.startsWith('possible:')) return null;
  const rest = candidateId.slice('possible:'.length);
  const splitAt = rest.indexOf(':');
  if (splitAt <= 0 || splitAt === rest.length - 1) return null;
  return { prospectId: rest.slice(0, splitAt), otherId: rest.slice(splitAt + 1) };
}

async function materializePossibleMatch(distributorId: number, candidateId: string): Promise<string> {
  const parsed = parsePossibleMatchId(candidateId);
  if (!parsed) throw new Error('Match not found');
  const open = await prisma.clientMatchCandidate.findFirst({
    where: {
      distributorId,
      status: { in: [...REVIEW_OPEN_STATUSES] },
      OR: [
        { existingClientId: parsed.prospectId, provisionalClientId: parsed.otherId },
        { existingClientId: parsed.otherId, provisionalClientId: parsed.prospectId },
      ],
    },
    select: { id: true },
  });
  if (open) return open.id;

  const [prospect, other, order] = await Promise.all([
    prisma.buyer.findFirst({
      where: { buyerId: parsed.prospectId, userId: distributorId },
      select: BUYER_SNAPSHOT_SELECT,
    }),
    prisma.buyer.findFirst({
      where: { buyerId: parsed.otherId, userId: distributorId },
      select: { owner: true, phone: true, storeName: true, address: true },
    }),
    prisma.order.findFirst({
      where: { userId: distributorId, isDeleted: false, buyerId: { in: [parsed.prospectId, parsed.otherId] } },
      orderBy: { createdAt: 'desc' },
      select: {
        orderId: true,
        buyerId: true,
        contactPerson: true,
        contactPhone: true,
        customerEmail: true,
        storeName: true,
        deliveryAddress: true,
      },
    }),
  ]);
  if (!prospect || !other) throw new Error('Client not found');
  if (!order) throw new Error('This match needs an order');
  const signals = classifyClientSignals({
    incomingPhone: prospect.phone,
    incomingAddress: prospect.address,
    incomingStoreName: prospect.storeName,
    incomingOwnerName: prospect.owner,
    existingPhone: other.phone,
    existingAddress: other.address,
    existingStoreName: other.storeName,
    existingOwnerName: other.owner,
  });
  const created = await prisma.clientMatchCandidate.create({
    data: {
      distributorId,
      existingClientId: parsed.prospectId,
      provisionalClientId: parsed.otherId,
      incomingOrderId: order.orderId,
      confidenceScore: signals.score,
      matchedSignals: signals.signals,
      status: 'pending',
      autoMerged: false,
      undoSnapshot: {
        priorStatus: prospect.status,
        provisionalProfile: {
          buyerId: parsed.otherId,
          owner: order.contactPerson || '',
          email: order.customerEmail || '',
          phone: order.contactPhone || '',
          storeName: order.storeName || '',
          businessType: 'Retailer',
          address: order.deliveryAddress || '',
          avatar: null,
          status: 'Active',
          userId: distributorId,
        },
      },
    },
    select: { id: true },
  });
  return created.id;
}

export async function recordManualOrderClientMatch(input: {
  distributorId: number;
  existingClientId: string;
  activeBuyerId: string;
  orderId: string;
  phone: string;
  storeName: string;
  ownerName: string;
  address: string;
  email: string;
}) {
  if (!input.existingClientId || input.existingClientId === input.activeBuyerId) return;
  const existing = await prisma.buyer.findFirst({
    where: { buyerId: input.existingClientId, userId: input.distributorId },
    select: { buyerId: true, owner: true, phone: true, storeName: true, address: true, status: true },
  });
  if (!existing) return;
  const preserveSelected = isMarketplaceBuyerId(existing.buyerId);
  const preservedClientId = preserveSelected ? input.existingClientId : input.activeBuyerId;
  const absorbedClientId = preserveSelected ? input.activeBuyerId : input.existingClientId;
  const already = await prisma.clientMatchCandidate.findFirst({
    where: {
      distributorId: input.distributorId,
      existingClientId: absorbedClientId,
      incomingOrderId: input.orderId,
      status: { in: [...REVIEW_OPEN_STATUSES] },
    },
    select: { id: true },
  });
  if (already) return;
  const result = classifyClientSignals({
    incomingPhone: input.phone,
    incomingAddress: input.address,
    incomingStoreName: input.storeName,
    incomingOwnerName: input.ownerName,
    existingPhone: existing.phone,
    existingAddress: existing.address,
    existingStoreName: existing.storeName,
    existingOwnerName: existing.owner,
  });
  await prisma.clientMatchCandidate.create({
    data: {
      distributorId: input.distributorId,
      existingClientId: absorbedClientId,
      provisionalClientId: preservedClientId,
      incomingOrderId: input.orderId,
      confidenceScore: result.score,
      matchedSignals: result.signals,
      status: 'pending',
      autoMerged: false,
      undoSnapshot: {
        priorStatus: preserveSelected ? 'Active' : existing.status,
        provisionalProfile: {
          buyerId: preservedClientId,
          owner: input.ownerName || '',
          email: input.email || '',
          phone: input.phone || '',
          storeName: input.storeName || '',
          businessType: 'Retailer',
          address: input.address || '',
          avatar: null,
          status: 'Active',
          userId: input.distributorId,
        },
      },
    },
  });
}

export async function mergeCandidate(distributorId: number, candidateId: string) {
  if (candidateId.startsWith('possible:')) candidateId = await materializePossibleMatch(distributorId, candidateId);
  const candidate = await prisma.clientMatchCandidate.findFirst({
    where: { id: candidateId, distributorId },
  });
  if (!candidate) throw new Error('Match not found');
  if (candidate.status === 'merged' && !candidate.undoneAt) throw new Error('This match is already merged');
  if (candidate.status === 'not_a_match') throw new Error('This match was dismissed');

  const existing = await prisma.buyer.findFirst({
    where: { buyerId: candidate.existingClientId, userId: distributorId },
  });
  if (!existing) throw new Error('Existing client not found');

  const stored = candidate.undoSnapshot as { provisionalProfile?: ProvisionalProfile } | null;
  const incoming = stored?.provisionalProfile;
  const marketplaceBuyerId =
    candidate.provisionalClientId && candidate.provisionalClientId !== existing.buyerId
      ? candidate.provisionalClientId
      : null;

  await prisma.$transaction(async (tx) => {
    let undo: MergeUndoSnapshot | null = null;
    let survivingId = existing.buyerId;
    if (marketplaceBuyerId) {
      undo = await mergeProspectIntoMarketplace(tx, {
        distributorId,
        prospectId: existing.buyerId,
        marketplaceBuyerId,
        incoming: incoming ?? {},
        incomingOrderId: candidate.incomingOrderId,
        keepCandidateId: candidate.id,
      });
      survivingId = marketplaceBuyerId;
    } else if (incoming) {
      undo = inPlaceUndo(await fillBuyerFromIncoming(tx, existing.buyerId, incoming));
    } else if (existing.status === 'Prospect') {
      await tx.buyer.update({ where: { buyerId: existing.buyerId }, data: { status: 'Active' } });
    }
    if (!marketplaceBuyerId) {
      const nullOriginOrderIds = await claimNullBuyerOrder(tx, distributorId, candidate.incomingOrderId, existing.buyerId);
      if (nullOriginOrderIds.length > 0) {
        undo = {
          ...((undo ?? candidate.undoSnapshot ?? { priorStatus: existing.status }) as MergeUndoSnapshot),
          nullOriginOrderIds,
        };
      }
    }
    await completeActiveProspectJobs(distributorId, tx, true, [survivingId]);
    await tx.clientMatchCandidate.update({
      where: { id: candidate.id },
      data: {
        status: 'merged',
        autoMerged: false,
        undoneAt: null,
        existingClientId: survivingId,
        undoSnapshot: (undo ?? candidate.undoSnapshot ?? { priorStatus: existing.status }) as Prisma.InputJsonValue,
      },
    });
  });
}

export async function dismissCandidate(distributorId: number, candidateId: string, status: 'not_a_match' | 'needs_more_info') {
  if (candidateId.startsWith('possible:')) candidateId = await materializePossibleMatch(distributorId, candidateId);
  const updated = await prisma.clientMatchCandidate.updateMany({
    where: { id: candidateId, distributorId, status: { in: ['pending', 'needs_more_info'] } },
    data: { status },
  });
  if (updated.count === 0) throw new Error('Match not found');
}

export async function undoDismissedMatch(distributorId: number, candidateId: string) {
  const updated = await prisma.clientMatchCandidate.updateMany({
    where: { id: candidateId, distributorId, status: 'not_a_match' },
    data: { status: 'pending', undoneAt: null },
  });
  if (updated.count === 0) throw new Error('Match not found');
}

export async function undoAutoMerge(distributorId: number, candidateId: string) {
  const candidate = await prisma.clientMatchCandidate.findFirst({
    where: { id: candidateId, distributorId, status: 'merged', undoneAt: null },
  });
  if (!candidate) throw new Error('Merge not found');
  const snapshot = candidate.undoSnapshot as (MergeUndoSnapshot & { provisionalProfile?: ProvisionalProfile }) | null;
  if (snapshot?.prospect?.buyerId) {
    await prisma.$transaction(async (tx) => {
      await restoreProspectSnapshot(tx, distributorId, snapshot);
      const before = snapshot.marketplaceBefore;
      const separateMarketplace = Boolean(before?.buyerId && before.buyerId !== snapshot.prospect.buyerId);
      await tx.clientMatchCandidate.update({
        where: { id: candidate.id },
        data: {
          status: 'pending',
          undoneAt: null,
          existingClientId: snapshot.prospect.buyerId,
          provisionalClientId: separateMarketplace ? before?.buyerId ?? null : candidate.provisionalClientId,
        },
      });
    });
    return;
  }

  const profile = snapshot?.provisionalProfile;
  if (!profile?.buyerId) {
    if (!snapshot?.nullOriginOrderIds?.length) throw new Error('This merge cannot be undone');
    await prisma.$transaction(async (tx) => {
      await clearNullOriginOrders(tx, distributorId, snapshot.nullOriginOrderIds);
      await tx.clientMatchCandidate.update({
        where: { id: candidate.id },
        data: { status: 'pending', undoneAt: null },
      });
    });
    return;
  }

  await prisma.$transaction(async (tx) => {
    const prior = await tx.buyer.findUnique({ where: { buyerId: profile.buyerId }, select: { buyerId: true } });
    if (!prior) {
      await tx.buyer.create({
        data: {
          buyerId: profile.buyerId,
          owner: profile.owner,
          email: profile.email,
          phone: profile.phone,
          storeName: profile.storeName,
          businessType: profile.businessType || 'Retailer',
          address: profile.address,
          avatar: profile.avatar,
          status: 'Active',
          userId: distributorId,
        },
      });
    }
    await tx.order.updateMany({
      where: { orderId: candidate.incomingOrderId, userId: distributorId },
      data: { buyerId: profile.buyerId },
    });
    await clearNullOriginOrders(tx, distributorId, snapshot?.nullOriginOrderIds);
    if (snapshot?.priorStatus && candidate.existingClientId !== profile.buyerId) {
      const remainingOrders = await tx.order.count({
        where: { buyerId: candidate.existingClientId, userId: distributorId, isDeleted: false },
      });
      if (remainingOrders === 0) {
        await tx.buyer.update({
          where: { buyerId: candidate.existingClientId },
          data: { status: snapshot.priorStatus },
        });
        if (snapshot.priorStatus !== 'Active') {
          await reopenProspectJobs(distributorId, [candidate.existingClientId], tx);
        }
      }
    }
    await tx.clientMatchCandidate.update({
      where: { id: candidate.id },
      data: {
        status: 'pending',
        undoneAt: null,
        existingClientId: candidate.existingClientId,
        provisionalClientId: profile.buyerId,
      },
    });
  });
}

export async function reopenUndoneMatches(distributorId: number) {
  const rows = await prisma.clientMatchCandidate.findMany({
    where: { distributorId, status: 'merged', undoneAt: { not: null } },
  });
  for (const candidate of rows) {
    const snapshot = candidate.undoSnapshot as MergeUndoSnapshot | null;
    if (!snapshot?.prospect?.buyerId) continue;
    try {
      await prisma.$transaction(async (tx) => {
        await restoreProspectSnapshot(tx, distributorId, snapshot);
        const before = snapshot.marketplaceBefore;
        const separateMarketplace = Boolean(before?.buyerId && before.buyerId !== snapshot.prospect.buyerId);
        await tx.clientMatchCandidate.update({
          where: { id: candidate.id },
          data: {
            status: 'pending',
            undoneAt: null,
            existingClientId: snapshot.prospect.buyerId,
            provisionalClientId: separateMarketplace ? before?.buyerId ?? null : candidate.provisionalClientId,
          },
        });
      });
    } catch (error) {
      console.error('Failed to reopen undone client match', candidate.id, error);
    }
  }
}

export async function manualMergeOrder(distributorId: number, existingClientId: string, incomingOrderId: string) {
  const existing = await prisma.buyer.findFirst({
    where: { buyerId: existingClientId, userId: distributorId },
  });
  if (!existing) throw new Error('Client not found');
  if (isMarketplaceBuyerId(existing.buyerId)) throw new Error('Select a prospect, not a marketplace buyer');
  const order = await prisma.order.findFirst({
    where: { orderId: incomingOrderId, userId: distributorId, isDeleted: false },
  });
  if (!order) throw new Error('Order not found');
  if (order.buyerId === existingClientId) throw new Error('This order is already on that client');

  const open = await prisma.clientMatchCandidate.findFirst({
    where: {
      distributorId,
      existingClientId,
      incomingOrderId,
      status: { in: ['pending', 'needs_more_info'] },
    },
  });
  if (open) {
    await mergeCandidate(distributorId, open.id);
    return;
  }

  const marketplaceBuyerId = order.buyerId && order.buyerId !== existing.buyerId ? order.buyerId : null;
  await prisma.$transaction(async (tx) => {
    let undo: MergeUndoSnapshot | null = null;
    let survivingId = existing.buyerId;
    if (marketplaceBuyerId) {
      undo = await mergeProspectIntoMarketplace(tx, {
        distributorId,
        prospectId: existing.buyerId,
        marketplaceBuyerId,
        incoming: {
          owner: order.contactPerson,
          email: order.customerEmail,
          phone: order.contactPhone,
          storeName: order.storeName,
          address: order.deliveryAddress,
        },
        incomingOrderId,
      });
      survivingId = marketplaceBuyerId;
    } else {
      undo = inPlaceUndo(
        await fillBuyerFromIncoming(tx, existing.buyerId, {
          owner: order.contactPerson,
          email: order.customerEmail,
          phone: order.contactPhone,
          storeName: order.storeName,
          address: order.deliveryAddress,
        }),
      );
      const nullOriginOrderIds = await claimNullBuyerOrder(tx, distributorId, order.orderId, existing.buyerId);
      if (nullOriginOrderIds.length > 0) undo = { ...undo, nullOriginOrderIds };
    }
    await completeActiveProspectJobs(distributorId, tx, true, [survivingId]);
    await tx.clientMatchCandidate.create({
      data: {
        distributorId,
        existingClientId: survivingId,
        incomingOrderId,
        provisionalClientId: marketplaceBuyerId,
        confidenceScore: 0,
        matchedSignals: [],
        status: 'merged',
        autoMerged: false,
        undoSnapshot: (undo ?? { priorStatus: existing.status }) as Prisma.InputJsonValue,
      },
    });
  });
}
