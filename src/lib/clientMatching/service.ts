import type { Prisma } from '@/lib/db';
import { prisma } from '@/lib/db';
import { classifyClientSignals, type MatchSignal } from '@/lib/clientMatching/signals';
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
  if (!isMarketplaceBuyerId(args.marketplaceBuyerId)) throw new Error('Merge target must be a marketplace buyer');
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
    tx.salesJob.findMany({ where: { clientId: prospect.buyerId, distributorId: args.distributorId }, select: { id: true } }),
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
  if ((snapshot.movedJobIds ?? []).length > 0) {
    await tx.salesJob.updateMany({
      where: { id: { in: snapshot.movedJobIds }, distributorId },
      data: { clientId: prospect.buyerId },
    });
  }
  if ((snapshot.movedOfferIds ?? []).length > 0) {
    await tx.offer.updateMany({
      where: { offerId: { in: snapshot.movedOfferIds }, userId: distributorId },
      data: { buyerId: prospect.buyerId },
    });
  }
  await clearNullOriginOrders(tx, distributorId, snapshot.nullOriginOrderIds);
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

export async function mergeCandidate(distributorId: number, candidateId: string) {
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
