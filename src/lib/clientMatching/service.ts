import type { Prisma } from '@/lib/db';
import { prisma } from '@/lib/db';
import { classifyClientSignals, type MatchSignal } from '@/lib/clientMatching/signals';

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
    if (result.level === 'none') continue;
    if (!best || result.score > best.result.score) {
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

  if (best.result.level === 'high') {
    return {
      distributorId: input.distributorId,
      buyerId: best.buyerId,
      preserveExistingClient: true,
      kind: 'high',
      candidate: {
        existingClientId: best.buyerId,
        provisionalClientId: null,
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

export async function finalizeMarketplaceClientMatch(plan: MarketplaceMatchPlan, incomingOrderId: string) {
  if (!plan.candidate) return;
  if (plan.kind === 'high') {
    if (plan.candidate.priorStatus === 'Prospect') {
      await prisma.buyer.update({
        where: { buyerId: plan.candidate.existingClientId },
        data: { status: 'Active' },
      });
    }
    await prisma.clientMatchCandidate.create({
      data: {
        distributorId: plan.distributorId,
        existingClientId: plan.candidate.existingClientId,
        incomingOrderId,
        provisionalClientId: null,
        confidenceScore: plan.candidate.confidenceScore,
        matchedSignals: plan.candidate.matchedSignals,
        status: 'merged',
        autoMerged: true,
        undoSnapshot: {
          priorStatus: plan.candidate.priorStatus,
          provisionalProfile: plan.candidate.provisionalProfile,
        },
      },
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

async function moveOrdersToClient(tx: Tx, fromBuyerId: string, toBuyerId: string, distributorId: number, onlyOrderId?: string) {
  await tx.order.updateMany({
    where: {
      userId: distributorId,
      buyerId: fromBuyerId,
      ...(onlyOrderId ? { orderId: onlyOrderId } : {}),
    },
    data: { buyerId: toBuyerId },
  });
  await tx.salesJob.updateMany({
    where: onlyOrderId
      ? {
          distributorId,
          clientId: fromBuyerId,
          OR: [{ orderId: onlyOrderId }, { orderIds: { has: onlyOrderId } }],
        }
      : { distributorId, clientId: fromBuyerId },
    data: { clientId: toBuyerId },
  });
}

async function deleteBuyerIfUnused(tx: Tx, buyerId: string) {
  const orders = await tx.order.count({ where: { buyerId } });
  if (orders > 0) return;
  const jobs = await tx.salesJob.count({ where: { clientId: buyerId } });
  if (jobs > 0) return;
  await tx.buyer.delete({ where: { buyerId } }).catch(() => undefined);
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

  await prisma.$transaction(async (tx) => {
    if (candidate.provisionalClientId && candidate.provisionalClientId !== existing.buyerId) {
      await moveOrdersToClient(tx, candidate.provisionalClientId, existing.buyerId, distributorId);
      await deleteBuyerIfUnused(tx, candidate.provisionalClientId);
    } else {
      await tx.order.updateMany({
        where: { orderId: candidate.incomingOrderId, userId: distributorId },
        data: { buyerId: existing.buyerId },
      });
    }
    if (existing.status === 'Prospect') {
      await tx.buyer.update({
        where: { buyerId: existing.buyerId },
        data: { status: 'Active' },
      });
    }
    await tx.clientMatchCandidate.update({
      where: { id: candidate.id },
      data: {
        status: 'merged',
        autoMerged: false,
        undoneAt: null,
        undoSnapshot: candidate.undoSnapshot ?? { priorStatus: existing.status },
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

export async function undoAutoMerge(distributorId: number, candidateId: string) {
  const candidate = await prisma.clientMatchCandidate.findFirst({
    where: { id: candidateId, distributorId, autoMerged: true, status: 'merged', undoneAt: null },
  });
  if (!candidate) throw new Error('Auto-merge not found');
  const snapshot = candidate.undoSnapshot as { priorStatus?: string; provisionalProfile?: ProvisionalProfile } | null;
  const profile = snapshot?.provisionalProfile;
  if (!profile?.buyerId) throw new Error('This auto-merge cannot be undone');

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
    if (snapshot?.priorStatus) {
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
      data: { undoneAt: new Date(), provisionalClientId: profile.buyerId },
    });
  });
}

export async function manualMergeOrder(distributorId: number, existingClientId: string, incomingOrderId: string) {
  const existing = await prisma.buyer.findFirst({
    where: { buyerId: existingClientId, userId: distributorId },
  });
  if (!existing) throw new Error('Client not found');
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

  await prisma.$transaction(async (tx) => {
    const provisionalId = order.buyerId;
    if (provisionalId && provisionalId !== existing.buyerId) {
      await moveOrdersToClient(tx, provisionalId, existing.buyerId, distributorId, incomingOrderId);
      await deleteBuyerIfUnused(tx, provisionalId);
    } else {
      await tx.order.update({
        where: { orderId: incomingOrderId },
        data: { buyerId: existing.buyerId },
      });
    }
    if (existing.status === 'Prospect') {
      await tx.buyer.update({ where: { buyerId: existing.buyerId }, data: { status: 'Active' } });
    }
    await tx.clientMatchCandidate.create({
      data: {
        distributorId,
        existingClientId,
        incomingOrderId,
        provisionalClientId: provisionalId && provisionalId !== existing.buyerId ? provisionalId : null,
        confidenceScore: 0,
        matchedSignals: [],
        status: 'merged',
        autoMerged: false,
        undoSnapshot: { priorStatus: existing.status },
      },
    });
  });
}
