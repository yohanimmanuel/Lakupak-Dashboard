import { type Prisma } from '@/generated/prisma';
import { broadcastOfferUpdate, broadcastPriceUpdate } from '@/utils/websocketBroadcast';
import { updateProductPricesFromOffers } from '@/utils/marketplaceMetrics';
import { prisma } from '../common/prisma';
import { sanitizePagination, buildPaginationInfo } from '../common/utils';

export const offersTypeDefs = /* GraphQL */ `
  type OfferDiscount {
    id: String!
    discountType: String!
    discountValue: Float!
    minOrderValue: Float
    minQuantity: Int
    isActive: Boolean!
    priority: Int!
  }

  type OfferDateRange {
    id: String!
    name: String!
    description: String
    startDate: String!
    endDate: String!
    isActive: Boolean!
    createdAt: String
    updatedAt: String
  }

  type OfferTimeSlot {
    id: String!
    name: String!
    description: String
    startTime: String!
    endTime: String!
    days: [String!]!
    isActive: Boolean!
    createdAt: String
    updatedAt: String
  }

  type OfferProduct {
    productId: String!
  }

  type Offer {
    id: String!
    offerId: String!
    name: String!
    description: String
    type: [String!]!
    status: String!
    startDate: String!
    endDate: String!
    totalUsage: Int!
    totalDiscountGiven: Float!
    discountTypes: [OfferDiscount!]!
    dateRanges: [OfferDateRange!]!
    timeSlots: [OfferTimeSlot!]!
    products: [OfferProduct!]!
  }

  type OfferConnection {
    nodes: [Offer!]!
    pagination: PaginationInfo!
  }

  input DiscountTypeInput {
    discountType: String!
    discountValue: Float!
    name: String
    description: String
    minOrderValue: Float
    minQuantity: Int
    isActive: Boolean
    priority: Int
  }

  input DateRangeInput {
    name: String!
    description: String
    startDate: String!
    endDate: String!
    isActive: Boolean
  }

  input TimeSlotInput {
    name: String!
    description: String
    startTime: String!
    endTime: String!
    days: [String!]!
    isActive: Boolean
  }

  type DeleteOfferResult {
    success: Boolean!
    deleted: Offer
  }

  extend type Query {
    offers(
      userId: Int!
      page: Int = 1
      limit: Int = 10
      status: String
      type: String
    ): OfferConnection!

    offer(userId: Int!, id: String!): Offer
  }

  extend type Mutation {
    createOffer(
      userId: Int!
      name: String!
      description: String
      type: [String!]!
      status: String
      startDate: String!
      endDate: String!
      discountTypes: [DiscountTypeInput!]!
      productIds: [String!]!
      dateRanges: [DateRangeInput!]
      timeSlots: [TimeSlotInput!]
    ): Offer!

    updateOffer(
      userId: Int!
      id: String!
      name: String
      description: String
      type: [String!]
      status: String
      startDate: String
      endDate: String
      discountTypes: [DiscountTypeInput!]
      productIds: [String!]
      dateRanges: [DateRangeInput!]
      timeSlots: [TimeSlotInput!]
    ): Offer!

    deleteOffer(userId: Int!, id: String!): DeleteOfferResult!
  }
`;

const mapOffer = (
  offer: Prisma.OfferGetPayload<{
    include: {
      offerDiscountTypes: true;
      dateRanges: true;
      timeSlots: true;
      offerProducts: true;
    };
  }>,
) => ({
  id: offer.id,
  offerId: offer.offerId,
  name: offer.name,
  description: offer.description,
  type: offer.type,
  status: offer.status,
  startDate: offer.startDate.toISOString(),
  endDate: offer.endDate.toISOString(),
  totalUsage: offer.totalUsage,
  totalDiscountGiven: offer.totalDiscountGiven,
  discountTypes: offer.offerDiscountTypes.map((discount) => ({
    id: discount.id,
    discountType: discount.discountType,
    discountValue: discount.discountValue,
    minOrderValue: discount.minOrderValue,
    minQuantity: discount.minQuantity,
    isActive: discount.isActive,
    priority: discount.priority,
  })),
  dateRanges: (offer.dateRanges || []).map((dr) => ({
    id: dr.id,
    name: dr.name,
    description: dr.description,
    startDate: dr.startDate.toISOString(),
    endDate: dr.endDate.toISOString(),
    isActive: dr.isActive,
    createdAt: dr.createdAt.toISOString(),
    updatedAt: dr.updatedAt.toISOString(),
  })),
  timeSlots: (offer.timeSlots || []).map((ts) => ({
    id: ts.id,
    name: ts.name,
    description: ts.description,
    startTime: ts.startTime,
    endTime: ts.endTime,
    days: ts.days || [],
    isActive: ts.isActive,
    createdAt: ts.createdAt.toISOString(),
    updatedAt: ts.updatedAt.toISOString(),
  })),
  products: (offer.offerProducts || []).map((op) => ({
    productId: op.productId,
  })),
});

const fetchOffersConnection = async (args: {
  userId: number;
  page?: number;
  limit?: number;
  status?: string | null;
  type?: string | null;
}) => {
  const { userId, page = 1, limit = 10, status, type } = args;
  const { page: safePage, limit: safeLimit } = sanitizePagination(page, limit);

  const whereClause: Prisma.OfferWhereInput = { userId };

  if (status && status !== 'All') {
    whereClause.status = status;
  }

  if (type && type !== 'All') {
    whereClause.type = { has: type };
  }

  const [offers, totalCount] = await Promise.all([
    prisma.offer.findMany({
      where: whereClause,
      skip: (safePage - 1) * safeLimit,
      take: safeLimit,
      orderBy: { createdAt: 'desc' },
      include: {
        offerDiscountTypes: true,
        dateRanges: true,
        timeSlots: true,
        offerProducts: true,
      },
    }),
    prisma.offer.count({ where: whereClause }),
  ]);

  return {
    nodes: offers.map(mapOffer),
    pagination: buildPaginationInfo(safePage, safeLimit, totalCount),
  };
};

const fetchSingleOffer = async (args: { userId: number; id: string }) => {
  const { userId, id } = args;

  const offer = await prisma.offer.findFirst({
    where: {
      OR: [{ id }, { offerId: id }],
      userId,
    },
    include: {
      offerDiscountTypes: true,
      dateRanges: true,
      timeSlots: true,
      offerProducts: true,
    },
  });

  if (!offer) {
    return null;
  }

  return mapOffer(offer);
};

const createOffer = async (args: {
  userId: number;
  name: string;
  description?: string | null;
  type: string[];
  status?: string | null;
  startDate: string;
  endDate: string;
  discountTypes: Array<{
    discountType: string;
    discountValue: number;
    name?: string | null;
    description?: string | null;
    minOrderValue?: number | null;
    minQuantity?: number | null;
    isActive?: boolean | null;
    priority?: number | null;
  }>;
  productIds: string[];
  dateRanges?: Array<{
    name: string;
    description?: string | null;
    startDate: string;
    endDate: string;
    isActive?: boolean | null;
  }> | null;
  timeSlots?: Array<{
    name: string;
    description?: string | null;
    startTime: string;
    endTime: string;
    days: string[];
    isActive?: boolean | null;
  }> | null;
}) => {
  const {
    userId,
    name,
    description,
    type,
    status = 'active',
    startDate,
    endDate,
    discountTypes,
    productIds,
    dateRanges = [],
    timeSlots = [],
  } = args;

  if (!name || !type || !discountTypes?.length || !startDate || !endDate || !productIds?.length) {
    throw new Error('Missing required fields');
  }

  const start = new Date(startDate);
  const end = new Date(endDate);
  if (start >= end) {
    throw new Error('End date must be after start date');
  }

  for (const discountType of discountTypes) {
    if (discountType.discountValue <= 0) {
      throw new Error('Discount value must be greater than 0');
    }
    if (discountType.discountType === 'percentage' && discountType.discountValue > 100) {
      throw new Error('Percentage discount cannot exceed 100%');
    }
  }

  const userProducts = await prisma.product.findMany({
    where: {
      userId,
      productId: { in: productIds },
    },
    select: { productId: true },
  });

  if (userProducts.length !== productIds.length) {
    throw new Error('Some products do not exist or do not belong to you');
  }

  const offerId = `OFF-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  const offer = await prisma.$transaction(async (tx) => {
    const createdOffer = await tx.offer.create({
      data: {
        offerId,
        name,
        description: description || null,
        type,
        status: status || 'active',
        startDate: start,
        endDate: end,
        userId,
      },
    });

    await tx.offerDiscountType.createMany({
      data: discountTypes.map((dt) => ({
        offerId: createdOffer.id,
        discountType: dt.discountType,
        discountValue: dt.discountValue,
        name: dt.name || null,
        description: dt.description || null,
        minOrderValue: dt.minOrderValue || null,
        minQuantity: dt.minQuantity || null,
        isActive: dt.isActive !== false,
        priority: dt.priority || 1,
      })),
    });

    await tx.offerProduct.createMany({
      data: productIds.map((productIdValue: string) => ({
        offerId: createdOffer.id,
        productId: productIdValue,
      })),
    });

    if (dateRanges && dateRanges.length > 0) {
      await tx.dateRange.createMany({
        data: dateRanges.map((dr) => ({
          offerId: createdOffer.id,
          name: dr.name,
          description: dr.description || null,
          startDate: new Date(dr.startDate),
          endDate: new Date(dr.endDate),
          isActive: dr.isActive !== false,
        })),
      });
    }

    if (timeSlots && timeSlots.length > 0) {
      await tx.timeSlot.createMany({
        data: timeSlots.map((ts) => ({
          offerId: createdOffer.id,
          name: ts.name,
          description: ts.description || null,
          startTime: ts.startTime,
          endTime: ts.endTime,
          days: ts.days,
          isActive: ts.isActive !== false,
        })),
      });
    }

    return createdOffer;
  });

  await prisma.$transaction(async (tx) => {
    await updateProductPricesFromOffers(tx, userId);
  });

  const createdOfferWithRelations = await prisma.offer.findUnique({
    where: { id: offer.id },
    include: {
      offerDiscountTypes: true,
      dateRanges: true,
      timeSlots: true,
      offerProducts: true,
    },
  });

  if (!createdOfferWithRelations) {
    throw new Error('Failed to fetch created offer');
  }

  try {
    await broadcastOfferUpdate(createdOfferWithRelations.id, productIds);
    await broadcastPriceUpdate(productIds);
  } catch {
    // ignore broadcast failures
  }

  return mapOffer(createdOfferWithRelations);
};

const updateOffer = async (args: {
  userId: number;
  id: string;
  name?: string | null;
  description?: string | null;
  type?: string[] | null;
  status?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  discountTypes?: Array<{
    discountType: string;
    discountValue: number;
    name?: string | null;
    description?: string | null;
    minOrderValue?: number | null;
    minQuantity?: number | null;
    isActive?: boolean | null;
    priority?: number | null;
  }> | null;
  productIds?: string[] | null;
  dateRanges?: Array<{
    name: string;
    description?: string | null;
    startDate: string;
    endDate: string;
    isActive?: boolean | null;
  }> | null;
  timeSlots?: Array<{
    name: string;
    description?: string | null;
    startTime: string;
    endTime: string;
    days: string[];
    isActive?: boolean | null;
  }> | null;
}) => {
  const {
    userId,
    id,
    name,
    description,
    type,
    status,
    startDate,
    endDate,
    discountTypes,
    productIds,
    dateRanges,
    timeSlots,
  } = args;

  const where = {
    OR: [{ id }, { offerId: id }],
    userId,
  };

  const existingOffer = await prisma.offer.findFirst({
    where,
    include: {
      offerProducts: true,
    },
  });

  if (!existingOffer) {
    throw new Error('Offer not found or you do not have permission to update it');
  }

  const cleanUpdateData: Partial<{
    name: string;
    description: string | null;
    type: string[];
    status: string;
    startDate: Date;
    endDate: Date;
  }> = {};

  if (name !== undefined && name !== null) cleanUpdateData.name = name;
  if (description !== undefined) cleanUpdateData.description = description ?? null;
  if (type !== undefined) cleanUpdateData.type = type ?? [];
  if (status !== undefined && status !== null) cleanUpdateData.status = status;
  if (startDate !== undefined && startDate !== null) cleanUpdateData.startDate = new Date(startDate);
  if (endDate !== undefined && endDate !== null) cleanUpdateData.endDate = new Date(endDate);

  if (startDate && endDate) {
    const start = new Date(startDate);
    const end = new Date(endDate);
    if (start >= end) {
      throw new Error('End date must be after start date');
    }
  }

  const updatedOffer = await prisma.$transaction(async (tx) => {
    const offer = await tx.offer.update({
      where: { id: existingOffer.id },
      data: cleanUpdateData,
    });

    if (discountTypes && discountTypes.length > 0) {
      await tx.offerDiscountType.deleteMany({
        where: { offerId: offer.id },
      });

      await tx.offerDiscountType.createMany({
        data: discountTypes.map((dt) => ({
          offerId: offer.id,
          discountType: dt.discountType,
          discountValue: dt.discountValue,
          name: dt.name || null,
          description: dt.description || null,
          minOrderValue: dt.minOrderValue || null,
          minQuantity: dt.minQuantity || null,
          isActive: dt.isActive !== false,
          priority: dt.priority || 1,
        })),
      });
    }

    if (productIds !== undefined && productIds !== null) {
      await tx.offerProduct.deleteMany({
        where: { offerId: offer.id },
      });

      if (productIds.length > 0) {
        const userProducts = await tx.product.findMany({
          where: {
            userId,
            productId: { in: productIds },
          },
          select: { productId: true },
        });

        if (userProducts.length !== productIds.length) {
          throw new Error('Some products do not exist or do not belong to you');
        }

        await tx.offerProduct.createMany({
          data: productIds.map((productIdValue: string) => ({
            offerId: offer.id,
            productId: productIdValue,
          })),
        });
      }
    }

    if (dateRanges !== undefined) {
      await tx.dateRange.deleteMany({
        where: { offerId: offer.id },
      });

      if (dateRanges && dateRanges.length > 0) {
        await tx.dateRange.createMany({
          data: dateRanges.map((dr) => ({
            offerId: offer.id,
            name: dr.name,
            description: dr.description || null,
            startDate: new Date(dr.startDate),
            endDate: new Date(dr.endDate),
            isActive: dr.isActive !== false,
          })),
        });
      }
    }

    if (timeSlots !== undefined) {
      await tx.timeSlot.deleteMany({
        where: { offerId: offer.id },
      });

      if (timeSlots && timeSlots.length > 0) {
        await tx.timeSlot.createMany({
          data: timeSlots.map((ts) => ({
            offerId: offer.id,
            name: ts.name,
            description: ts.description || null,
            startTime: ts.startTime,
            endTime: ts.endTime,
            days: ts.days,
            isActive: ts.isActive !== false,
          })),
        });
      }
    }

    return offer;
  });

  await prisma.$transaction(async (tx) => {
    await updateProductPricesFromOffers(tx, userId);
  });

  const updatedOfferWithRelations = await prisma.offer.findUnique({
    where: { id: updatedOffer.id },
    include: {
      offerDiscountTypes: true,
      offerProducts: true,
      dateRanges: true,
      timeSlots: true,
    },
  });

  if (!updatedOfferWithRelations) {
    throw new Error('Failed to fetch updated offer');
  }

  const affectedProductIds = updatedOfferWithRelations.offerProducts.map((op) => op.productId);
  try {
    await broadcastOfferUpdate(updatedOfferWithRelations.id, affectedProductIds);
    await broadcastPriceUpdate(affectedProductIds);
  } catch {
    // ignore broadcast failures
  }

  return mapOffer(updatedOfferWithRelations);
};

const deleteOffer = async (args: { userId: number; id: string }) => {
  const { userId, id } = args;

  const where = {
    OR: [{ id }, { offerId: id }],
    userId,
  };

  const offerToDelete = await prisma.offer.findFirst({
    where,
    include: {
      offerDiscountTypes: true,
      offerProducts: true,
      dateRanges: true,
      timeSlots: true,
    },
  });

  if (!offerToDelete) {
    throw new Error('Offer not found or you do not have permission to delete it');
  }

  const affectedProductIds = offerToDelete.offerProducts.map((op) => op.productId);

  await prisma.offer.delete({
    where: { id: offerToDelete.id },
  });

  await prisma.$transaction(async (tx) => {
    await updateProductPricesFromOffers(tx, userId);
  });

  try {
    await broadcastOfferUpdate(offerToDelete.id, affectedProductIds);
    await broadcastPriceUpdate(affectedProductIds);
  } catch {
    // ignore broadcast failures
  }

  return {
    success: true,
    deleted: mapOffer(offerToDelete),
  };
};

export const offersResolvers = {
  Query: {
    offers: (_: unknown, args: Parameters<typeof fetchOffersConnection>[0]) => fetchOffersConnection(args),
    offer: (_: unknown, args: Parameters<typeof fetchSingleOffer>[0]) => fetchSingleOffer(args),
  },
  Mutation: {
    createOffer: (_: unknown, args: Parameters<typeof createOffer>[0]) => createOffer(args),
    updateOffer: (_: unknown, args: Parameters<typeof updateOffer>[0]) => updateOffer(args),
    deleteOffer: (_: unknown, args: Parameters<typeof deleteOffer>[0]) => deleteOffer(args),
  },
};

