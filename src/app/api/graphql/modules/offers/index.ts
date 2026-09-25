import { type Prisma } from '@/lib/db';
import { getTodayBoundaries, getStartOfDay, getEndOfDay } from '@/lib/dateUtils';
import { prisma } from '../common/prisma';
import { sanitizePagination, buildPaginationInfo, parseMoney } from '../common/utils';
import { withDashboardAuth } from '../common/auth';
import { isValidMerchandisingSlug, getMerchandisingLabel } from '@/constants/merchandisingTaxonomy';
import { normalizePromotionApplyMode } from '@/utils/promotionUtils';

const DISCOUNT_TYPES = new Set(['percentage', 'fixed_amount', 'buy_x_get_y']);
/** User-selectable statuses only. Expired is set by the system when endDate passes. */
const STATUSES = new Set(['draft', 'active']);

export const offersTypeDefs = /* GraphQL */ `
  type Offer {
    id: String!
    offerId: String!
    groupId: String
    buyerId: String
    buyerStoreName: String
    buyerOwner: String
    productId: String
    productName: String
    categoryId: String
    categoryLabel: String
    variantOptionId: Int
    variantName: String
    discountType: String!
    discountValue: Float!
    buyQuantity: Int
    freeQuantity: Int
    promotionApplyMode: String
    startDate: String!
    endDate: String
    status: String!
    notes: String
    description: String
    totalUsage: Int!
    totalDiscountGiven: Float!
    createdAt: String!
    updatedAt: String!
  }

  type OfferConnection {
    nodes: [Offer!]!
    pagination: PaginationInfo!
  }

  type DeleteOfferResult {
    success: Boolean!
    deleted: Offer
    deletedCount: Int
  }

  input OfferGroupTargetInput {
    productId: String
    variantOptionId: Int
  }

  type SaveOfferGroupResult {
    groupId: String!
    offers: [Offer!]!
  }

  extend type Query {
    offers(
      userId: Int!
      page: Int = 1
      limit: Int = 10
      status: String
      buyerId: String
      productId: String
    ): OfferConnection!

    offer(userId: Int!, id: String!): Offer

    offersForBuyer(userId: Int!, buyerId: String!): [Offer!]!

    offersInGroup(userId: Int!, id: String!): [Offer!]!

    productCustomOfferClientCount(userId: Int!, productId: String!): Int!
  }

  extend type Mutation {
    createOffer(
      userId: Int!
      buyerId: String
      productId: String
      categoryId: String
      variantOptionId: Int
      discountType: String!
      discountValue: Float!
      buyQuantity: Int
      freeQuantity: Int
      promotionApplyMode: String
      startDate: String!
      endDate: String
      status: String
      notes: String
      description: String
      groupId: String
    ): Offer!

    updateOffer(
      userId: Int!
      id: String!
      buyerId: String
      productId: String
      categoryId: String
      variantOptionId: Int
      discountType: String
      discountValue: Float
      buyQuantity: Int
      freeQuantity: Int
      promotionApplyMode: String
      startDate: String
      endDate: String
      status: String
      notes: String
      description: String
      groupId: String
    ): Offer!

    deleteOffer(userId: Int!, id: String!): DeleteOfferResult!

    """
    Atomically create or sync a multi-product rate group in one Prisma transaction.
    Matching product/variant rows keep their ids and usage aggregates; removed targets
    are deleted; failures leave the prior group unchanged.
    """
    saveOfferGroup(
      userId: Int!
      seedId: String
      groupId: String
      buyerId: String
      discountType: String!
      discountValue: Float!
      buyQuantity: Int
      freeQuantity: Int
      promotionApplyMode: String
      startDate: String!
      endDate: String
      status: String
      notes: String
      description: String
      targets: [OfferGroupTargetInput!]!
    ): SaveOfferGroupResult!
  }
`;

type OfferRow = Prisma.OfferGetPayload<{
    include: {
    buyer: { select: { storeName: true; owner: true; buyerId: true } };
    product: { select: { name: true; productId: true } };
    variantOption: { select: { id: true; variantName: true } };
  };
}>;

const offerInclude = {
  buyer: { select: { storeName: true, owner: true, buyerId: true } },
  product: { select: { name: true, productId: true } },
  variantOption: { select: { id: true, variantName: true } },
} as const;

function mapOffer(offer: OfferRow) {
  return {
    id: offer.id,
    offerId: offer.offerId,
    groupId: offer.groupId ?? null,
    buyerId: offer.buyerId,
    buyerStoreName: offer.buyer?.storeName ?? null,
    buyerOwner: offer.buyer?.owner ?? null,
    productId: offer.productId,
    productName: offer.product?.name ?? null,
    categoryId: offer.categoryId,
    categoryLabel: offer.categoryId ? getMerchandisingLabel(offer.categoryId) : null,
    variantOptionId: offer.variantOptionId ?? null,
    variantName: offer.variantOption?.variantName ?? null,
    discountType: offer.discountType,
    discountValue: parseMoney(offer.discountValue),
    buyQuantity: offer.buyQuantity,
    freeQuantity: offer.freeQuantity ?? null,
    promotionApplyMode: normalizePromotionApplyMode(offer.promotionApplyMode),
    startDate: offer.startDate.toISOString(),
    endDate: offer.endDate ? offer.endDate.toISOString() : null,
    status: offer.status,
    notes: offer.notes,
    description: offer.description,
    totalUsage: offer.totalUsage,
    totalDiscountGiven: parseMoney(offer.totalDiscountGiven),
    createdAt: offer.createdAt.toISOString(),
    updatedAt: offer.updatedAt.toISOString(),
  };
}

/** Mark active offers past endDate as expired. */
export async function deactivateExpiredOffers(userId?: number): Promise<{ expiredCount: number }> {
  const { startOfToday } = getTodayBoundaries();
  const where: Prisma.OfferWhereInput = {
    status: 'active',
    endDate: { not: null, lt: startOfToday },
    ...(userId != null ? { userId } : {}),
  };
  const result = await prisma.offer.updateMany({
    where,
    data: { status: 'expired' },
  });
  return { expiredCount: result.count };
}

function resolveBxgyQuantities(input: {
  discountType: string;
  discountValue: number;
  buyQuantity?: number | null;
  freeQuantity?: number | null;
}): { buyQuantity: number | null; freeQuantity: number | null } {
  const buy =
    input.buyQuantity != null && Number.isFinite(Number(input.buyQuantity))
      ? Math.floor(Number(input.buyQuantity))
      : null;
  let free =
    input.freeQuantity != null && Number.isFinite(Number(input.freeQuantity))
      ? Math.floor(Number(input.freeQuantity))
      : null;

  // Legacy BXGY: free Y lived in discountValue
  if (input.discountType === 'buy_x_get_y' && (free == null || free < 1)) {
    const fromValue = Math.round(Number(input.discountValue));
    if (Number.isFinite(fromValue) && fromValue > 0) free = fromValue;
  }

  const isPriceType =
    input.discountType === 'percentage' ||
    input.discountType === 'fixed_amount';

  if (input.discountType === 'buy_x_get_y') {
    return { buyQuantity: buy, freeQuantity: free };
  }

  // Combo: keep buy/free when both provided on a price discount type
  if (isPriceType && buy != null && buy >= 1 && free != null && free >= 1) {
    return { buyQuantity: buy, freeQuantity: free };
  }

  return { buyQuantity: null, freeQuantity: null };
}

function validateDiscountFields(input: {
  discountType: string;
  discountValue: number;
  buyQuantity?: number | null;
  freeQuantity?: number | null;
  productId?: string | null;
  categoryId?: string | null;
  variantOptionId?: number | null;
  startDate: Date;
  endDate: Date | null;
  /** Drafts may omit client/product until the user finishes the wizard. */
  allowIncomplete?: boolean;
}) {
  if (!DISCOUNT_TYPES.has(input.discountType)) {
    throw new Error('Invalid discount type. Use percentage, fixed_amount, or buy_x_get_y');
  }
  if (!(input.discountValue > 0)) {
    throw new Error('Discount value must be greater than 0');
  }
  if (input.discountType === 'percentage' && input.discountValue > 100) {
    throw new Error('Percentage discount cannot exceed 100%');
  }

  const resolved = resolveBxgyQuantities(input);

  if (input.discountType === 'buy_x_get_y') {
    if (!resolved.buyQuantity || resolved.buyQuantity < 1) {
      throw new Error('buyQuantity is required for buy_x_get_y');
    }
    if (!resolved.freeQuantity || resolved.freeQuantity < 1) {
      throw new Error('freeQuantity is required for buy_x_get_y');
    }
  }

  // Combo on price types: if either buy or free is set, both must be valid
  const isPriceType =
    input.discountType === 'percentage' ||
    input.discountType === 'fixed_amount';
  if (isPriceType) {
    const hasBuy = input.buyQuantity != null && Number(input.buyQuantity) > 0;
    const hasFree = input.freeQuantity != null && Number(input.freeQuantity) > 0;
    if (hasBuy !== hasFree) {
      throw new Error('buyQuantity and freeQuantity must both be set for combination discounts');
    }
    if (hasBuy && hasFree) {
      if (!resolved.buyQuantity || resolved.buyQuantity < 1) {
        throw new Error('buyQuantity must be at least 1 for combination discounts');
      }
      if (!resolved.freeQuantity || resolved.freeQuantity < 1) {
        throw new Error('freeQuantity must be at least 1 for combination discounts');
      }
    }
  }

  const hasProduct = Boolean(input.productId?.trim());
  const hasCategory = Boolean(input.categoryId?.trim());
  if (input.allowIncomplete) {
    if (hasProduct && hasCategory) {
      throw new Error('Provide productId or categoryId, not both');
    }
  } else if (hasProduct === hasCategory) {
    throw new Error('Exactly one of productId or categoryId is required');
  }
  if (hasCategory && input.categoryId && !isValidMerchandisingSlug(input.categoryId)) {
    throw new Error('Invalid categoryId');
  }
  if (input.variantOptionId != null && !hasProduct) {
    throw new Error('productId is required when variantOptionId is set');
  }
  if (input.endDate && getEndOfDay(input.endDate) < getStartOfDay(input.startDate)) {
    throw new Error('endDate must be on or after startDate');
  }
}

async function assertBuyerBelongsToUser(userId: number, buyerId: string) {
  const buyer = await prisma.buyer.findFirst({
    where: { userId, buyerId },
    select: { buyerId: true },
  });
  if (!buyer) throw new Error('Buyer not found or does not belong to you');
}

async function assertProductBelongsToUser(userId: number, productId: string) {
  const product = await prisma.product.findFirst({
    where: { userId, productId },
    select: { productId: true, id: true },
  });
  if (!product) throw new Error('Product not found or does not belong to you');
  return product;
}

async function assertVariantBelongsToProduct(
  userId: number,
  productId: string,
  variantOptionId: number,
) {
  const product = await assertProductBelongsToUser(userId, productId);
  const variant = await prisma.variantOption.findFirst({
    where: { id: variantOptionId, productId: product.id },
    select: { id: true },
  });
  if (!variant) {
    throw new Error('Variant does not belong to the selected product');
  }
}

const fetchOffersConnection = async (args: {
  userId: number;
  page?: number;
  limit?: number;
  status?: string | null;
  buyerId?: string | null;
  productId?: string | null;
}) => {
  const { userId, status, buyerId, productId } = args;
  const { page, limit } = sanitizePagination(args.page, args.limit);

  await deactivateExpiredOffers(userId);

  const where: Prisma.OfferWhereInput = {
    userId,
    ...(status ? { status } : {}),
    ...(buyerId ? { buyerId } : {}),
    ...(productId ? { productId } : {}),
  };

  const [totalCount, nodes] = await Promise.all([
    prisma.offer.count({ where }),
    prisma.offer.findMany({
      where,
      include: offerInclude,
      orderBy: { updatedAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
  ]);

  return {
    nodes: nodes.map(mapOffer),
    pagination: buildPaginationInfo(page, limit, totalCount),
  };
};

const fetchSingleOffer = async (args: { userId: number; id: string }) => {
  const { userId, id } = args;
  await deactivateExpiredOffers(userId);
  const offer = await prisma.offer.findFirst({
    where: { userId, OR: [{ id }, { offerId: id }] },
    include: offerInclude,
  });
  return offer ? mapOffer(offer) : null;
};

const fetchOffersForBuyer = async (args: { userId: number; buyerId: string }) => {
  const { userId, buyerId } = args;
  await deactivateExpiredOffers(userId);
  const offers = await prisma.offer.findMany({
    where: { userId, buyerId },
    include: offerInclude,
    orderBy: { updatedAt: 'desc' },
  });
  return offers.map(mapOffer);
};

const productCustomOfferClientCount = async (args: { userId: number; productId: string }) => {
  const { userId, productId } = args;
  await deactivateExpiredOffers(userId);

  const { startOfToday, endOfToday } = getTodayBoundaries();
  const groups = await prisma.offer.groupBy({
    by: ['buyerId'],
    where: {
      userId,
      productId,
      buyerId: { not: null },
      status: 'active',
      startDate: { lte: endOfToday },
      OR: [{ endDate: null }, { endDate: { gte: startOfToday } }],
    },
  });
  return groups.length;
};

const createOffer = async (args: {
  userId: number;
  buyerId?: string | null;
  productId?: string | null;
  categoryId?: string | null;
  variantOptionId?: number | null;
    discountType: string;
    discountValue: number;
  buyQuantity?: number | null;
  freeQuantity?: number | null;
    promotionApplyMode?: string | null;
    startDate: string;
  endDate?: string | null;
  status?: string | null;
  notes?: string | null;
  description?: string | null;
  groupId?: string | null;
}) => {
  const {
    userId,
    productId,
    categoryId,
    discountType,
    discountValue,
    buyQuantity,
    freeQuantity,
    notes,
    description,
  } = args;

  const buyerId = args.buyerId?.trim() || null;
  const groupId = args.groupId?.trim() || null;
  const startDate = new Date(args.startDate);
  const endDate = args.endDate ? new Date(args.endDate) : null;
  if (Number.isNaN(startDate.getTime())) throw new Error('Invalid startDate');
  if (endDate && Number.isNaN(endDate.getTime())) throw new Error('Invalid endDate');

  const variantOptionId =
    args.variantOptionId != null && Number.isFinite(Number(args.variantOptionId))
      ? Number(args.variantOptionId)
      : null;

  // Category targeting cannot carry a variant scope
  const resolvedVariantOptionId = categoryId?.trim() ? null : variantOptionId;

  const status = args.status && STATUSES.has(args.status) ? args.status : 'draft';
  const allowIncomplete = status === 'draft';

  if (!allowIncomplete && !buyerId) {
    throw new Error('Client is required for active rates');
  }

  validateDiscountFields({
    discountType,
    discountValue,
    buyQuantity,
    freeQuantity,
    productId,
    categoryId,
    variantOptionId: resolvedVariantOptionId,
    startDate,
    endDate,
    allowIncomplete,
  });

  const resolvedQty = resolveBxgyQuantities({
    discountType,
    discountValue,
    buyQuantity,
    freeQuantity,
  });

  if (buyerId) {
    await assertBuyerBelongsToUser(userId, buyerId);
  }
  if (productId?.trim()) {
    await assertProductBelongsToUser(userId, productId.trim());
    if (resolvedVariantOptionId != null) {
      await assertVariantBelongsToProduct(userId, productId.trim(), resolvedVariantOptionId);
    }
  }

  const offerId = `OFF-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;

  const created = await prisma.offer.create({
      data: {
        offerId,
      groupId,
        userId,
      buyerId,
      productId: productId?.trim() || null,
      categoryId: categoryId?.trim() || null,
      variantOptionId: resolvedVariantOptionId,
      discountType,
      discountValue,
      buyQuantity: resolvedQty.buyQuantity,
      freeQuantity: resolvedQty.freeQuantity,
      promotionApplyMode: normalizePromotionApplyMode(args.promotionApplyMode),
      startDate,
      endDate,
      status,
      notes: notes?.trim() || null,
      description: description?.trim() || null,
    },
    include: offerInclude,
  });

  return mapOffer(created);
};

const updateOffer = async (args: {
  userId: number;
  id: string;
  buyerId?: string | null;
  productId?: string | null;
  categoryId?: string | null;
  variantOptionId?: number | null;
  discountType?: string | null;
  discountValue?: number | null;
  buyQuantity?: number | null;
  freeQuantity?: number | null;
  promotionApplyMode?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  status?: string | null;
  notes?: string | null;
    description?: string | null;
}) => {
  const { userId, id } = args;

  const existing = await prisma.offer.findFirst({
    where: { userId, OR: [{ id }, { offerId: id }] },
  });
  if (!existing) throw new Error('Offer not found');

  const buyerId =
    args.buyerId === undefined
      ? existing.buyerId
      : args.buyerId?.trim() || null;
  const discountType = args.discountType ?? existing.discountType;
  const discountValue =
    args.discountValue != null ? args.discountValue : parseMoney(existing.discountValue);
  const buyQuantity =
    args.buyQuantity !== undefined ? args.buyQuantity : existing.buyQuantity;
  const freeQuantity =
    args.freeQuantity !== undefined ? args.freeQuantity : existing.freeQuantity;
  const startDate = args.startDate ? new Date(args.startDate) : existing.startDate;
  // Distinguish omitted endDate (keep) vs explicit null (clear standing)
  const endDate =
    args.endDate === undefined
      ? existing.endDate
      : args.endDate === null || args.endDate === ''
        ? null
        : new Date(args.endDate);

  let productId =
    args.productId !== undefined ? (args.productId?.trim() || null) : existing.productId;
  let categoryId =
    args.categoryId !== undefined ? (args.categoryId?.trim() || null) : existing.categoryId;

  // If switching target type, clear the other
  if (args.productId !== undefined && args.productId?.trim()) {
    categoryId = null;
  }
  if (args.categoryId !== undefined && args.categoryId?.trim()) {
    productId = null;
  }

  let variantOptionId =
    args.variantOptionId !== undefined
      ? args.variantOptionId != null && Number.isFinite(Number(args.variantOptionId))
        ? Number(args.variantOptionId)
        : null
      : existing.variantOptionId;

  if (categoryId) {
    variantOptionId = null;
  }

  if (Number.isNaN(startDate.getTime())) throw new Error('Invalid startDate');
  if (endDate && Number.isNaN(endDate.getTime())) throw new Error('Invalid endDate');

  if (args.status != null && !STATUSES.has(args.status)) {
    throw new Error('Invalid status');
  }

  const nextStatus = args.status ?? existing.status;
  const allowIncomplete = nextStatus === 'draft';

  if (!allowIncomplete && !buyerId) {
    throw new Error('Client is required for active rates');
  }

  validateDiscountFields({
    discountType,
    discountValue,
    buyQuantity,
    freeQuantity,
    productId,
    categoryId,
    variantOptionId,
    startDate,
    endDate,
    allowIncomplete,
  });

  const resolvedQty = resolveBxgyQuantities({
    discountType,
    discountValue,
    buyQuantity,
    freeQuantity,
  });

  if (buyerId) {
    await assertBuyerBelongsToUser(userId, buyerId);
  }
  if (productId) {
    await assertProductBelongsToUser(userId, productId);
    if (variantOptionId != null) {
      await assertVariantBelongsToProduct(userId, productId, variantOptionId);
    }
  }

  const updated = await prisma.offer.update({
    where: { id: existing.id },
    data: {
      buyerId,
      productId,
      categoryId,
      variantOptionId,
      discountType,
      discountValue,
      buyQuantity: resolvedQty.buyQuantity,
      freeQuantity: resolvedQty.freeQuantity,
      ...(args.promotionApplyMode != null
        ? { promotionApplyMode: normalizePromotionApplyMode(args.promotionApplyMode) }
        : {}),
      startDate,
      endDate,
      ...(args.status != null ? { status: args.status } : {}),
      ...(args.notes !== undefined ? { notes: args.notes?.trim() || null } : {}),
      ...(args.description !== undefined
        ? { description: args.description?.trim() || null }
        : {}),
    },
    include: offerInclude,
  });

  return mapOffer(updated);
};

const deleteOffer = async (args: { userId: number; id: string }) => {
  const { userId, id } = args;
  const existing = await prisma.offer.findFirst({
    where: { userId, OR: [{ id }, { offerId: id }] },
    include: offerInclude,
  });
  if (!existing) throw new Error('Offer not found');

  // Delete the whole offer group when rows share a groupId
  if (existing.groupId) {
    const result = await prisma.offer.deleteMany({
      where: { userId, groupId: existing.groupId },
    });
    return {
      success: true,
      deleted: mapOffer(existing),
      deletedCount: result.count,
    };
  }

  // Null groupId = individual offer
  await prisma.offer.delete({ where: { id: existing.id } });
  return {
    success: true,
    deleted: mapOffer(existing),
    deletedCount: 1,
  };
};

/** Load all rows in the same offer group as the given offer id. */
const fetchOffersInGroup = async (args: { userId: number; id: string }) => {
  const { userId, id } = args;
  await deactivateExpiredOffers(userId);
  const seed = await prisma.offer.findFirst({
    where: { userId, OR: [{ id }, { offerId: id }] },
    include: offerInclude,
  });
  if (!seed) return [];

  if (seed.groupId) {
    const rows = await prisma.offer.findMany({
      where: { userId, groupId: seed.groupId },
      include: offerInclude,
      orderBy: { createdAt: 'asc' },
    });
    return rows.length > 0 ? rows.map(mapOffer) : [mapOffer(seed)];
  }

  // Null groupId = individual offer
  return [mapOffer(seed)];
};

function offerTargetKey(
  productId: string | null | undefined,
  variantOptionId: number | null | undefined,
): string {
  const pid = productId?.trim() || '';
  const vid =
    variantOptionId != null && Number.isFinite(Number(variantOptionId))
      ? String(Number(variantOptionId))
      : 'null';
  return `${pid}|${vid}`;
}

/** Resolve sibling rows for a seed offer (by groupId only). */
async function loadGroupMembersForSeed(
  userId: number,
  seedId: string,
): Promise<{ seed: OfferRow; members: OfferRow[]; groupId: string | null }> {
  const seed = await prisma.offer.findFirst({
    where: { userId, OR: [{ id: seedId }, { offerId: seedId }] },
    include: offerInclude,
  });
  if (!seed) throw new Error('Offer not found');

  if (seed.groupId) {
    const members = await prisma.offer.findMany({
      where: { userId, groupId: seed.groupId },
      include: offerInclude,
      orderBy: { createdAt: 'asc' },
    });
    return {
      seed,
      members: members.length > 0 ? members : [seed],
      groupId: seed.groupId,
    };
  }

  // Null groupId = individual offer
  return { seed, members: [seed], groupId: null };
}

/**
 * Create or sync an offer group in one transaction.
 * Existing product/variant targets keep ids + usage aggregates; membership is reconciled.
 */
const saveOfferGroup = async (args: {
  userId: number;
  seedId?: string | null;
  groupId?: string | null;
  buyerId?: string | null;
  discountType: string;
  discountValue: number;
  buyQuantity?: number | null;
  freeQuantity?: number | null;
  promotionApplyMode?: string | null;
  startDate: string;
  endDate?: string | null;
  status?: string | null;
  notes?: string | null;
  description?: string | null;
  targets: Array<{ productId?: string | null; variantOptionId?: number | null }>;
}) => {
  const { userId } = args;
  const buyerId = args.buyerId?.trim() || null;
  const startDate = new Date(args.startDate);
  const endDate = args.endDate ? new Date(args.endDate) : null;
  if (Number.isNaN(startDate.getTime())) throw new Error('Invalid startDate');
  if (endDate && Number.isNaN(endDate.getTime())) throw new Error('Invalid endDate');

  const status = args.status && STATUSES.has(args.status) ? args.status : 'draft';
  const allowIncomplete = status === 'draft';

  if (!allowIncomplete && !buyerId) {
    throw new Error('Client is required for active rates');
  }

  if (!Array.isArray(args.targets) || args.targets.length === 0) {
    throw new Error('At least one target is required');
  }

  // Dedupe by product/variant so retries cannot inflate membership
  const desiredTargets: Array<{
    productId: string | null;
    variantOptionId: number | null;
  }> = [];
  const seenKeys = new Set<string>();
  for (const raw of args.targets) {
    const productId = raw.productId?.trim() || null;
    const variantOptionId =
      raw.variantOptionId != null && Number.isFinite(Number(raw.variantOptionId))
        ? Number(raw.variantOptionId)
        : null;
    const key = offerTargetKey(productId, variantOptionId);
    if (seenKeys.has(key)) continue;
    seenKeys.add(key);
    desiredTargets.push({ productId, variantOptionId });
  }

  if (desiredTargets.length === 0) {
    throw new Error('At least one target is required');
  }

  const resolvedQty = resolveBxgyQuantities({
    discountType: args.discountType,
    discountValue: args.discountValue,
    buyQuantity: args.buyQuantity,
    freeQuantity: args.freeQuantity,
  });

  // Validate shared discount once, then each target's product/variant pairing
  for (const target of desiredTargets) {
    validateDiscountFields({
      discountType: args.discountType,
      discountValue: args.discountValue,
      buyQuantity: args.buyQuantity,
      freeQuantity: args.freeQuantity,
      productId: target.productId,
      categoryId: null,
      variantOptionId: target.variantOptionId,
      startDate,
      endDate,
      allowIncomplete,
    });
  }

  if (buyerId) {
    await assertBuyerBelongsToUser(userId, buyerId);
  }
  for (const target of desiredTargets) {
    if (target.productId) {
      await assertProductBelongsToUser(userId, target.productId);
      if (target.variantOptionId != null) {
        await assertVariantBelongsToProduct(
          userId,
          target.productId,
          target.variantOptionId,
        );
      }
    }
  }

  const seedId = args.seedId?.trim() || null;
  const preferredGroupId = args.groupId?.trim() || null;
  let existingMembers: OfferRow[] = [];
  let resolvedGroupId =
    preferredGroupId ||
    (typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `grp-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`);

  if (seedId) {
    const loaded = await loadGroupMembersForSeed(userId, seedId);
    existingMembers = loaded.members;
    resolvedGroupId = loaded.groupId || resolvedGroupId;
  } else if (preferredGroupId) {
    // Retry-safe: same client groupId resumes sync instead of inserting duplicates
    existingMembers = await prisma.offer.findMany({
      where: { userId, groupId: preferredGroupId },
      include: offerInclude,
      orderBy: { createdAt: 'asc' },
    });
  }

  const sharedData = {
    groupId: resolvedGroupId,
    buyerId,
    categoryId: null as string | null,
    discountType: args.discountType,
    discountValue: args.discountValue,
    buyQuantity: resolvedQty.buyQuantity,
    freeQuantity: resolvedQty.freeQuantity,
    promotionApplyMode: normalizePromotionApplyMode(args.promotionApplyMode),
    startDate,
    endDate,
    status,
    notes: args.notes?.trim() || null,
    description: args.description?.trim() || null,
  };

  const saved = await prisma.$transaction(async (tx) => {
    // Re-read members inside the transaction for a consistent snapshot
    let members: OfferRow[] = [];
    if (seedId) {
      const seed = await tx.offer.findFirst({
        where: { userId, OR: [{ id: seedId }, { offerId: seedId }] },
        include: offerInclude,
      });
      if (!seed) throw new Error('Offer not found');
      if (seed.groupId) {
        members = await tx.offer.findMany({
          where: { userId, groupId: seed.groupId },
          include: offerInclude,
          orderBy: { createdAt: 'asc' },
        });
        if (members.length === 0) members = [seed];
      } else {
        const ids = existingMembers.map((m) => m.id);
        members =
          ids.length === 0
            ? [seed]
            : await tx.offer.findMany({
                where: { userId, id: { in: ids } },
                include: offerInclude,
                orderBy: { createdAt: 'asc' },
              });
      }
    } else if (resolvedGroupId) {
      members = await tx.offer.findMany({
        where: { userId, groupId: resolvedGroupId },
        include: offerInclude,
        orderBy: { createdAt: 'asc' },
      });
    }

    const byKey = new Map<string, OfferRow>();
    for (const row of members) {
      const key = offerTargetKey(row.productId, row.variantOptionId);
      // Keep earliest row if duplicates somehow exist
      if (!byKey.has(key)) byKey.set(key, row);
    }

    const keepIds = new Set<string>();
    const results: OfferRow[] = [];

    for (const target of desiredTargets) {
      const key = offerTargetKey(target.productId, target.variantOptionId);
      const existing = byKey.get(key);
      if (existing) {
        const updated = await tx.offer.update({
          where: { id: existing.id },
          data: {
            ...sharedData,
            productId: target.productId,
            variantOptionId: target.variantOptionId,
          },
          include: offerInclude,
        });
        keepIds.add(existing.id);
        results.push(updated);
      } else {
        const offerId = `OFF-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
        const created = await tx.offer.create({
          data: {
            offerId,
            userId,
            ...sharedData,
            productId: target.productId,
            variantOptionId: target.variantOptionId,
          },
          include: offerInclude,
        });
        keepIds.add(created.id);
        results.push(created);
      }
    }

    const toDelete = members.filter((m) => !keepIds.has(m.id));
    if (toDelete.length > 0) {
      await tx.offer.deleteMany({
        where: { userId, id: { in: toDelete.map((m) => m.id) } },
      });
    }

    return results;
  });

    return {
    groupId: resolvedGroupId,
    offers: saved.map(mapOffer),
    };
};

export const offersResolvers = {
  Query: {
    offers: withDashboardAuth(fetchOffersConnection),
    offer: withDashboardAuth(fetchSingleOffer),
    offersForBuyer: withDashboardAuth(fetchOffersForBuyer),
    offersInGroup: withDashboardAuth(fetchOffersInGroup),
    productCustomOfferClientCount: withDashboardAuth(productCustomOfferClientCount),
  },
  Mutation: {
    createOffer: withDashboardAuth(createOffer),
    updateOffer: withDashboardAuth(updateOffer),
    deleteOffer: withDashboardAuth(deleteOffer),
    saveOfferGroup: withDashboardAuth(saveOfferGroup),
  },
};
