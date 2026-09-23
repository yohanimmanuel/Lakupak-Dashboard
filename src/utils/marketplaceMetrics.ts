import type { Prisma, PrismaClient } from '@/lib/db';
import { getTodayBoundaries } from '@/lib/dateUtils';

export const SOLD_COUNT_EXCLUDED_STATUSES = ['Pending', 'Cancelled', 'Returned', 'Failed'] as const;

export async function calculateSoldCounts(
  prisma: PrismaClient,
  productIds: string[],
  excludedStatuses: readonly string[] = SOLD_COUNT_EXCLUDED_STATUSES,
): Promise<Map<string, string>> {
  if (!productIds.length) {
    return new Map();
  }

  const orderItems = await prisma.orderItem.findMany({
    where: {
      productId: { in: productIds },
      order: {
        orderStatus: { notIn: excludedStatuses as string[] },
      },
    },
    select: {
      productId: true,
      packageQuantity: true,
      piecesPerPackage: true,
    },
  });

  const soldCounts = new Map<string, number>();

  for (const item of orderItems) {
    if (!item.productId) {
      continue;
    }

    const packageQuantity = Number(item.packageQuantity ?? 0);
    const piecesPerPackage = Number(item.piecesPerPackage ?? 0);

    let piecesSold = 0;
    if (packageQuantity > 0 && piecesPerPackage > 0) {
      piecesSold = packageQuantity * piecesPerPackage;
    } else if (packageQuantity > 0) {
      piecesSold = packageQuantity;
    } else {
      piecesSold = 1;
    }

    soldCounts.set(item.productId, (soldCounts.get(item.productId) ?? 0) + piecesSold);
  }

  const result = new Map<string, string>();
  soldCounts.forEach((value, key) => {
    result.set(key, String(value));
  });

  return result;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

export type ProductReviewStats = {
  overallRating: number;
  totalReviews: number;
  breakdown: Record<1 | 2 | 3 | 4 | 5, number>;
};

/** Batch product-review aggregates for marketplace list cards (avoids N+1). */
export async function calculateProductReviewStats(
  prisma: PrismaClient,
  productIds: string[],
): Promise<Map<string, ProductReviewStats>> {
  const emptyBreakdown = (): Record<1 | 2 | 3 | 4 | 5, number> => ({
    1: 0,
    2: 0,
    3: 0,
    4: 0,
    5: 0,
  });

  if (!productIds.length) return new Map();

  const [averages, byRating] = await prisma.$transaction(
    async (tx) =>
      Promise.all([
        tx.productReview.groupBy({
          by: ['productId'],
          where: { productId: { in: productIds } },
          _avg: { rating: true },
          _count: { id: true },
        }),
        tx.productReview.groupBy({
          by: ['productId', 'rating'],
          where: { productId: { in: productIds } },
          _count: { id: true },
        }),
      ]),
    { isolationLevel: 'RepeatableRead' },
  );

  const map = new Map<string, ProductReviewStats>();
  for (const row of averages) {
    map.set(row.productId, {
      overallRating: round1(row._avg.rating ?? 0),
      totalReviews: row._count.id,
      breakdown: emptyBreakdown(),
    });
  }

  for (const row of byRating) {
    let stats = map.get(row.productId);
    if (!stats) {
      stats = {
        overallRating: 0,
        totalReviews: 0,
        breakdown: emptyBreakdown(),
      };
      map.set(row.productId, stats);
    }
    const rating = row.rating as 1 | 2 | 3 | 4 | 5;
    if (rating >= 1 && rating <= 5) {
      stats.breakdown[rating] = row._count.id;
    }
  }

  for (const stats of map.values()) {
    if (stats.totalReviews > 0) continue;
    let sum = 0;
    let count = 0;
    ([1, 2, 3, 4, 5] as const).forEach((star) => {
      const n = stats.breakdown[star];
      sum += star * n;
      count += n;
    });
    if (count > 0) {
      stats.totalReviews = count;
      stats.overallRating = round1(sum / count);
    }
  }

  return map;
}

export type DistributorReviewStats = {
  overallRating: number;
  totalReviews: number;
};

/** Batch distributor-review aggregates for seller badges on product cards. */
export async function calculateDistributorReviewStats(
  prisma: PrismaClient,
  distributorIds: number[],
): Promise<Map<number, DistributorReviewStats>> {
  if (!distributorIds.length) return new Map();

  const averages = await prisma.distributorReview.groupBy({
    by: ['distributorId'],
    where: { distributorId: { in: distributorIds } },
    _avg: { overallRating: true },
    _count: { id: true },
  });

  const map = new Map<number, DistributorReviewStats>();
  for (const row of averages) {
    map.set(row.distributorId, {
      overallRating: round1(row._avg.overallRating ?? 0),
      totalReviews: row._count.id,
    });
  }
  return map;
}

/**
 * Mark active offers past endDate as expired.
 * Per-retailer pricing: no scheduled activation or product price rewriting.
 */
export async function deactivateExpiredOffers(
  tx: Prisma.TransactionClient | PrismaClient,
  userId?: number,
): Promise<{
  deactivatedCount: number;
  activatedCount: number;
  affectedUserIds: number[];
  activatedOffers: Array<{ offerId: string; productIds: string[] }>;
  deactivatedOffers: Array<{ offerId: string; productIds: string[] }>;
}> {
  const { startOfToday } = getTodayBoundaries();
  const where: Prisma.OfferWhereInput = {
    status: 'active',
    endDate: { not: null, lt: startOfToday },
    ...(userId != null ? { userId } : {}),
  };

  const expired = await tx.offer.findMany({
    where,
    select: { id: true, offerId: true, userId: true, productId: true },
  });

  if (expired.length > 0) {
    await tx.offer.updateMany({
      where: { id: { in: expired.map((o) => o.id) } },
      data: { status: 'expired' },
    });
  }

  const affectedUserIds = Array.from(
    new Set(expired.map((o) => o.userId).filter((id): id is number => id != null)),
  );

  return {
    deactivatedCount: expired.length,
    activatedCount: 0,
    affectedUserIds,
    activatedOffers: [],
    deactivatedOffers: expired.map((o) => ({
      offerId: o.offerId,
      productIds: o.productId ? [o.productId] : [],
    })),
  };
}

/**
 * No-op: offers are per-client private rates and must NEVER rewrite public variant sellingPrice.
 * Kept for call-site compatibility; catalog price is independent of client rates.
 */
export async function updateProductPricesFromOffers(
  _tx: Prisma.TransactionClient | PrismaClient,
  _userId: number,
  _targetProductIds?: string[],
): Promise<void> {
  // Intentionally empty — base catalog price stays public.
}

/**
 * Restore public catalog prices if they were previously rewritten by the old offer system.
 * Sets sellingPrice back from originalSellingPrice and clears originalSellingPrice.
 */
export async function restoreCatalogPricesFromOriginals(
  tx: Prisma.TransactionClient | PrismaClient,
  userId: number,
  targetProductIds?: string[],
): Promise<number> {
  const where: Prisma.VariantOptionWhereInput = {
    originalSellingPrice: { not: null },
    product: {
      userId,
      ...(targetProductIds?.length ? { productId: { in: targetProductIds } } : {}),
    },
  };

  const rows = await tx.variantOption.findMany({
    where,
    select: { id: true, originalSellingPrice: true },
  });

  if (rows.length === 0) return 0;

  const CONCURRENT_LIMIT = 20;
  for (let i = 0; i < rows.length; i += CONCURRENT_LIMIT) {
    const chunk = rows.slice(i, i + CONCURRENT_LIMIT);
    await Promise.all(
      chunk.map((row) =>
        tx.variantOption.update({
          where: { id: row.id },
          data: {
            sellingPrice: row.originalSellingPrice!,
            originalSellingPrice: null,
          },
        }),
      ),
    );
  }

  return rows.length;
}
