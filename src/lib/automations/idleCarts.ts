import { prisma } from '@/lib/db';
import { buildMobileBuyerId } from '@/utils/buyerSync';

export type IdleCart = {
  marketplaceUserId: number;
  buyerId: string;
  lastActivityAt: Date;
  productIds: string[];
  productNames: string[];
  email: string;
  phone: string;
  owner: string;
  storeName: string;
};

export const MAX_CART_IDLE_SENDS_PER_TICK = 25;

function productNameFromData(productData: unknown, fallbackId: string): string {
  if (!productData || typeof productData !== 'object' || Array.isArray(productData)) {
    return fallbackId;
  }
  const name = String((productData as Record<string, unknown>).name ?? '').trim();
  return name || fallbackId;
}

function pickedBuyerIdSet(config: Record<string, unknown> | null | undefined): Set<string> | null {
  const list = config?.selectedBuyers;
  const ids: string[] = [];
  if (Array.isArray(list)) {
    for (const item of list) {
      if (!item || typeof item !== 'object') continue;
      const id = String((item as Record<string, unknown>).buyerId ?? '').trim();
      if (id) ids.push(id);
    }
  }
  const single = String(config?.buyerId ?? '').trim();
  if (single) ids.push(single);
  if (ids.length === 0) return null;
  return new Set(ids);
}

function candidateBuyerIds(marketplaceUserId: number, distributorUserId: number): string[] {
  return [
    buildMobileBuyerId(marketplaceUserId, distributorUserId),
    buildMobileBuyerId(marketplaceUserId),
    `mobile_user_${marketplaceUserId}`,
  ];
}

/**
 * Marketplace carts that still hold this distributor's products and have not
 * been touched for `idleHours`. Optional buyer picker acts as an include filter.
 */
export async function findIdleCartsForDistributor(args: {
  distributorUserId: number;
  idleHours: number;
  now?: Date;
  actionConfig?: Record<string, unknown> | null;
}): Promise<IdleCart[]> {
  const idleMs = args.idleHours * 60 * 60 * 1000;
  if (!Number.isFinite(idleMs) || idleMs <= 0) return [];

  const now = args.now ?? new Date();
  const cutoff = new Date(now.getTime() - idleMs);
  const buyerFilter = pickedBuyerIdSet(args.actionConfig ?? null);

  const products = await prisma.product.findMany({
    where: { userId: args.distributorUserId },
    select: { productId: true, name: true },
  });
  if (products.length === 0) return [];

  const productIds = products.map((p) => p.productId);
  const nameByProductId = new Map(products.map((p) => [p.productId, p.name]));

  const cartLines = await prisma.userActivity.findMany({
    where: {
      activityType: 'cart',
      productId: { in: productIds },
    },
    select: {
      userId: true,
      productId: true,
      productData: true,
      updatedAt: true,
    },
  });
  if (cartLines.length === 0) return [];

  type Acc = {
    lastActivityAt: Date;
    productIds: string[];
    productNames: string[];
  };
  const byUser = new Map<number, Acc>();
  for (const line of cartLines) {
    const prev = byUser.get(line.userId);
    const productName =
      nameByProductId.get(line.productId) ||
      productNameFromData(line.productData, line.productId);
    if (!prev) {
      byUser.set(line.userId, {
        lastActivityAt: line.updatedAt,
        productIds: [line.productId],
        productNames: [productName],
      });
      continue;
    }
    if (line.updatedAt.getTime() > prev.lastActivityAt.getTime()) {
      prev.lastActivityAt = line.updatedAt;
    }
    if (!prev.productIds.includes(line.productId)) {
      prev.productIds.push(line.productId);
      prev.productNames.push(productName);
    }
  }

  const idleEntries = [...byUser.entries()].filter(
    ([, acc]) => acc.lastActivityAt.getTime() <= cutoff.getTime(),
  );
  if (idleEntries.length === 0) return [];

  const marketplaceUserIds = idleEntries.map(([id]) => id);
  const marketplaceUsers = await prisma.marketplaceUser.findMany({
    where: { id: { in: marketplaceUserIds }, isSuspended: false },
    select: {
      id: true,
      email: true,
      phone: true,
      name: true,
      storeName: true,
      username: true,
    },
  });
  const marketplaceById = new Map(marketplaceUsers.map((u) => [u.id, u]));

  const allCandidateIds = marketplaceUserIds.flatMap((id) =>
    candidateBuyerIds(id, args.distributorUserId),
  );
  const buyers = await prisma.buyer.findMany({
    where: {
      userId: args.distributorUserId,
      buyerId: { in: allCandidateIds },
    },
    select: {
      buyerId: true,
      email: true,
      phone: true,
      owner: true,
      storeName: true,
    },
  });

  const out: IdleCart[] = [];
  for (const [marketplaceUserId, acc] of idleEntries) {
    const market = marketplaceById.get(marketplaceUserId);
    if (!market) continue;

    const candidates = candidateBuyerIds(marketplaceUserId, args.distributorUserId);
    const buyer =
      buyers.find((b) => b.buyerId === candidates[0]) ??
      buyers.find((b) => candidates.includes(b.buyerId)) ??
      null;
    const buyerId = buyer?.buyerId ?? candidates[0];
    if (buyerFilter && !buyerFilter.has(buyerId) && !candidates.some((id) => buyerFilter.has(id))) {
      continue;
    }

    out.push({
      marketplaceUserId,
      buyerId,
      lastActivityAt: acc.lastActivityAt,
      productIds: acc.productIds,
      productNames: acc.productNames,
      email: String(buyer?.email || market.email || '').trim(),
      phone: String(buyer?.phone || market.phone || '').trim(),
      owner: String(buyer?.owner || market.name || market.username || '').trim(),
      storeName: String(buyer?.storeName || market.storeName || '').trim(),
    });
  }

  out.sort((a, b) => a.lastActivityAt.getTime() - b.lastActivityAt.getTime());
  return out;
}

export function cartIdleRunKey(
  workflowId: string,
  marketplaceUserId: number,
  lastActivityAt: Date,
): string {
  return `cart_idle:${workflowId}:${marketplaceUserId}:${lastActivityAt.getTime()}`;
}
