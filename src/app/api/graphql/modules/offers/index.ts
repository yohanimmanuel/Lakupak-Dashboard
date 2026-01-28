import { type Prisma } from '@/lib/db';
import { broadcastOfferUpdate, broadcastPriceUpdate, broadcastProductUpdate } from '@/utils/websocketBroadcast';
import { updateProductPricesFromOffers, deactivateExpiredOffers } from '@/utils/marketplaceMetrics';
import { prisma } from '../common/prisma';
import { sanitizePagination, buildPaginationInfo, parseMoney } from '../common/utils';
import { getTodayBoundaries, getStartOfDay, getEndOfDay } from '@/lib/dateUtils';

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
    totalUsage: Int!
    totalDiscountGiven: Float!
    discountTypes: [OfferDiscount!]!
    dateRanges: [OfferDateRange!]!
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
      discountTypes: [DiscountTypeInput!]!
      productIds: [String!]!
      dateRanges: [DateRangeInput!]
    ): Offer!

    updateOffer(
      userId: Int!
      id: String!
      name: String
      description: String
      type: [String!]
      status: String
      discountTypes: [DiscountTypeInput!]
      productIds: [String!]
      dateRanges: [DateRangeInput!]
    ): Offer!

    deleteOffer(userId: Int!, id: String!): DeleteOfferResult!
  }
`;

// Helper function to check if date ranges are expired
const hasExpiredDateRanges = (dateRanges: Array<{ startDate: Date; endDate: Date; isActive: boolean }>): boolean => {
  if (!dateRanges || dateRanges.length === 0) {
    return false; // No date ranges means not expired
  }

  const { startOfToday } = getTodayBoundaries();

  // Check if ALL active date ranges are expired
  const activeDateRanges = dateRanges.filter(dr => dr.isActive);
  if (activeDateRanges.length === 0) {
    return true; // No active date ranges means expired
  }

  // If all active date ranges are expired, return true
  const allExpired = activeDateRanges.every(range => {
    const rangeStart = getStartOfDay(new Date(range.startDate));
    const rangeEnd = getEndOfDay(new Date(range.endDate));
    
    // Check if current date is AFTER the range (expired)
    return startOfToday > rangeEnd;
  });

  return allExpired;
};

const mapOffer = (
  offer: Prisma.OfferGetPayload<{
    include: {
      offerDiscountTypes: true;
      dateRanges: true;
      offerProducts: true;
    };
  }>,
) => {
  // Don't auto-inactivate expired offers - allow users to manually control status
  // Status is now flexible and can be reactivated by changing date ranges
  return {
    id: offer.id,
    offerId: offer.offerId,
    name: offer.name,
    description: offer.description,
    type: offer.type,
    status: offer.status,
    totalUsage: offer.totalUsage,
    totalDiscountGiven: parseMoney(offer.totalDiscountGiven), // Convert Decimal to number
    discountTypes: offer.offerDiscountTypes.map((discount) => ({
      id: discount.id,
      discountType: discount.discountType,
      discountValue: parseMoney(discount.discountValue), // Convert Decimal to number
      minOrderValue: discount.minOrderValue ? parseMoney(discount.minOrderValue) : null, // Convert Decimal to number
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
    products: (offer.offerProducts || []).map((op) => ({
      productId: op.productId,
    })),
  };
};

const fetchOffersConnection = async (args: {
  userId: number;
  page?: number;
  limit?: number;
  status?: string | null;
  type?: string | null;
}) => {
  const { userId, page = 1, limit = 10, status, type } = args;
  const { page: safePage, limit: safeLimit } = sanitizePagination(page, limit);

  // Check cache first (only for first page to avoid stale data on pagination)
  if (safePage === 1) {
    const { getCachedOfferList } = await import('@/lib/queryCache');
    const cached = await getCachedOfferList<{
      nodes: unknown[];
      pagination: ReturnType<typeof buildPaginationInfo>;
    }>(userId, safePage, safeLimit, { status, type });
    
    if (cached) {
      return cached;
    }
  }

  // Only deactivate expired offers and update prices on first page load (page 1)
  // This significantly improves performance for pagination and filtering
  if (safePage === 1) {
    // Await deactivation and broadcast to ensure real-time updates
    try {
      const result = await deactivateExpiredOffers(prisma, userId);
      
      // Broadcast websocket updates for activated and deactivated offers
      // Do this BEFORE querying so clients get updates immediately
      // Collect all affected product IDs for batch broadcast
      const allAffectedProductIds = new Set<string>();
      
      // Collect all broadcasts to run in parallel
      const broadcastPromises: Promise<void>[] = [];
      
      for (const { offerId, productIds } of result.activatedOffers) {
        productIds.forEach(id => allAffectedProductIds.add(id));
        // Run all broadcasts in parallel for this offer
        broadcastPromises.push(
          broadcastOfferUpdate(offerId, productIds),
          broadcastPriceUpdate(productIds),
          broadcastProductUpdate(productIds)
        );
      }
      
      for (const { offerId, productIds } of result.deactivatedOffers) {
        productIds.forEach(id => allAffectedProductIds.add(id));
        // Run all broadcasts in parallel for this offer
        broadcastPromises.push(
          broadcastOfferUpdate(offerId, productIds),
          broadcastPriceUpdate(productIds),
          broadcastProductUpdate(productIds)
        );
      }
      
      // Wait for all broadcasts to complete
      if (broadcastPromises.length > 0) {
        await Promise.allSettled(broadcastPromises);
        // Invalidate search cache when offers change (only search queries use cache)
        const { invalidateSearchCache } = await import('@/utils/searchCache');
        await invalidateSearchCache('search-cache:marketplace:*');
        // Small delay to ensure WebSocket messages are sent before query returns
        await new Promise(resolve => setTimeout(resolve, 50));
        
        // Update product prices in background (non-blocking, fire-and-forget)
        // Only needed when offers are actually activated/deactivated
        // Extract unique product IDs that need price updates
        const productIdsToUpdate = Array.from(allAffectedProductIds);
        if (productIdsToUpdate.length > 0) {
          // Fire-and-forget: don't await, don't block the UI
          Promise.resolve().then(async () => {
            await updateProductPricesFromOffers(prisma, userId, productIdsToUpdate);
            // Invalidate caches after offer changes
            const { invalidateOfferCache, invalidateProductCache } = await import('@/lib/queryCache');
            await Promise.all([
              invalidateOfferCache(userId),
              invalidateProductCache(userId),
            ]);
          }).catch(error => {
            console.error('[Offers] Background price update failed:', error);
          });
        }
      }
    } catch (error) {
      console.error('[Offers] Background maintenance failed for userId:', userId, error);
    }
  }
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
        offerProducts: true,
      },
    }),
    prisma.offer.count({ where: whereClause }),
  ]);

  const result = {
    nodes: offers.map(mapOffer),
    pagination: buildPaginationInfo(safePage, safeLimit, totalCount),
  };

  // Cache the result (only first page)
  // IMPORTANT: Invalidate caches BEFORE setting new cache to prevent race conditions
  // This ensures any background price update tasks don't invalidate caches we just wrote
  if (safePage === 1) {
    const { setCachedOfferList, invalidateOfferCache, invalidateProductCache } = await import('@/lib/queryCache');
    // Invalidate caches synchronously before writing new cache entries
    // This prevents race conditions with background price update tasks
    await Promise.all([
      invalidateOfferCache(userId),
      invalidateProductCache(userId),
    ]);
    // Now set the new cache after invalidation is complete
    await setCachedOfferList(userId, safePage, safeLimit, { status, type }, result);
  }

  return result;
};

const fetchSingleOffer = async (args: { userId: number; id: string }) => {
  const { userId, id } = args;

  // Deactivate expired offers and update product prices before fetching
  // This ensures the offer status is current when viewing details
  try {
    const result = await deactivateExpiredOffers(prisma, userId);
    
    // Broadcast websocket updates for activated and deactivated offers
    // Do this BEFORE querying so clients get updates immediately
    // Collect all affected product IDs for batch broadcast
    const allAffectedProductIds = new Set<string>();
    
    // Collect all broadcasts to run in parallel
    const broadcastPromises: Promise<void>[] = [];
    
    for (const { offerId, productIds } of result.activatedOffers) {
      productIds.forEach(pid => allAffectedProductIds.add(pid));
      // Run all broadcasts in parallel for this offer
      broadcastPromises.push(
        broadcastOfferUpdate(offerId, productIds),
        broadcastPriceUpdate(productIds),
        broadcastProductUpdate(productIds)
      );
    }
    
    for (const { offerId, productIds } of result.deactivatedOffers) {
      productIds.forEach(id => allAffectedProductIds.add(id));
      // Run all broadcasts in parallel for this offer
      broadcastPromises.push(
        broadcastOfferUpdate(offerId, productIds),
        broadcastPriceUpdate(productIds),
        broadcastProductUpdate(productIds)
      );
    }
    
    // Wait for all broadcasts to complete
    if (broadcastPromises.length > 0) {
      await Promise.allSettled(broadcastPromises);
      // Invalidate search cache when offers change (only search queries use cache)
      const { invalidateSearchCache } = await import('@/utils/searchCache');
      await invalidateSearchCache('search-cache:marketplace:*');
      // Small delay to ensure WebSocket messages are sent before query returns
      await new Promise(resolve => setTimeout(resolve, 50));
      
      // Update product prices in background (non-blocking, fire-and-forget)
      // Only needed when offers are actually activated/deactivated
      const productIdsToUpdate = Array.from(allAffectedProductIds);
      if (productIdsToUpdate.length > 0) {
        // Fire-and-forget: don't await, don't block the UI
        Promise.resolve().then(async () => {
          await updateProductPricesFromOffers(prisma, userId, productIdsToUpdate);
          // Invalidate caches after offer changes
          const { invalidateOfferCache, invalidateProductCache } = await import('@/lib/queryCache');
          await Promise.all([
            invalidateOfferCache(userId),
            invalidateProductCache(userId),
          ]);
        }).catch(error => {
          console.error('[Offer] Background price update failed:', error);
        });
      }
    }
  } catch (error) {
    console.error('[Offer] Background maintenance failed for userId:', userId, error);
  }

  const offer = await prisma.offer.findFirst({
    where: {
      OR: [{ id }, { offerId: id }],
      userId,
    },
    include: {
        offerDiscountTypes: true,
        dateRanges: true,
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
}) => {
  const {
    userId,
    name,
    description,
    type,
    status = 'active',
    discountTypes,
    productIds,
    dateRanges = [],
  } = args;

  // Date ranges are now optional - offers can exist without date restrictions
  if (!name || !type || !discountTypes?.length || !productIds?.length) {
    throw new Error('Missing required fields');
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

  // Determine initial status based on date ranges
  // If all date ranges start in the future, set status to 'scheduled' for auto-activation
  let initialStatus = status || 'active';
  
  if (!status && dateRanges && dateRanges.length > 0) {
    const { DateTime } = require('luxon');
    const now = DateTime.now().setZone('Asia/Jakarta');
    
    // Check if ALL date ranges are in the future
    const allFuture = dateRanges.every(dr => {
      const start = DateTime.fromISO(dr.startDate, { zone: 'Asia/Jakarta' }).startOf('day');
      return now < start;
    });
    
    // If all date ranges are future, set to 'scheduled' (will auto-activate when date arrives)
    if (allFuture) {
      initialStatus = 'scheduled';
    }
  }

  const offerId = `OFF-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  const offer = await prisma.$transaction(async (tx) => {
    const createdOffer = await tx.offer.create({
      data: {
        offerId,
        name,
        description: description || null,
        type,
        status: initialStatus,
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

    // Update product prices within the same transaction to ensure atomicity
    // Only update the specific products in this new offer
    await updateProductPricesFromOffers(tx, userId, productIds);

    return createdOffer;
  });

  const createdOfferWithRelations = await prisma.offer.findUnique({
    where: { id: offer.id },
      include: {
        offerDiscountTypes: true,
        dateRanges: true,
        offerProducts: true,
      },
    });

    if (!createdOfferWithRelations) {
      throw new Error('Failed to fetch created offer');
    }

  try {
    await broadcastOfferUpdate(createdOfferWithRelations.id, productIds);
    // Invalidate search cache when offers change (only search queries use cache)
    const { invalidateSearchCache } = await import('@/utils/searchCache');
    await invalidateSearchCache('search-cache:marketplace:*');
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
}) => {
  const {
    userId,
    id,
    name,
    description,
    type,
    status,
    discountTypes,
    productIds,
    dateRanges,
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

  // Collect affected product IDs BEFORE the update for targeted price recalculation
  // This includes both old and new product IDs in case products are being reassigned
  const affectedProductIds = new Set<string>(existingOffer.offerProducts.map(op => op.productId));
  if (productIds) {
    productIds.forEach(pid => affectedProductIds.add(pid));
  }
  const affectedProductIdArray = Array.from(affectedProductIds);

  const cleanUpdateData: Partial<{
    name: string;
    description: string | null;
    type: string[];
    status: string;
  }> = {};

  if (name !== undefined && name !== null) cleanUpdateData.name = name;
  if (description !== undefined) cleanUpdateData.description = description ?? null;
  if (type !== undefined) cleanUpdateData.type = type ?? [];
  if (status !== undefined && status !== null) cleanUpdateData.status = status;

  // Update offer AND prices in ONE transaction to prevent race conditions
  // Pass affected product IDs to only update those specific products (not all products with offers)
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
      // Hard delete: remove all existing date ranges for this offer
      await tx.dateRange.deleteMany({
        where: { 
          offerId: offer.id,
        },
      });

      // Create new date ranges if provided
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

    // Update prices for affected products within the same transaction
    // This prevents race conditions and ensures atomicity
    // Only updates the specific products in this offer, not all products with offers
    await updateProductPricesFromOffers(tx, userId, affectedProductIdArray);

    return offer;
  }, {
    timeout: 30000, // 30 second timeout for large updates
    isolationLevel: 'ReadCommitted', // Ensure reads see committed data
  });

  const updatedOfferWithRelations = await prisma.offer.findUnique({
    where: { id: updatedOffer.id },
    include: {
      offerDiscountTypes: true,
      offerProducts: true,
      dateRanges: true,
    },
  });

  if (!updatedOfferWithRelations) {
    throw new Error('Failed to fetch updated offer');
  }
  
  // Broadcast WebSocket updates AFTER prices are committed
  // This ensures marketplace queries see the updated prices
  try {
    await broadcastOfferUpdate(updatedOfferWithRelations.id, affectedProductIdArray);
    await broadcastPriceUpdate(affectedProductIdArray);
    // Invalidate search cache when offers change (only search queries use cache)
    const { invalidateSearchCache } = await import('@/utils/searchCache');
    await invalidateSearchCache('search-cache:marketplace:*');
  } catch {
    // ignore broadcast failures - non-critical
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
    },
  });

    if (!offerToDelete) {
      throw new Error('Offer not found or you do not have permission to delete it');
    }

  const affectedProductIds = offerToDelete.offerProducts.map((op) => op.productId);

  await prisma.$transaction(async (tx) => {
    await tx.offer.delete({
      where: { id: offerToDelete.id },
    });
    // Only update the specific products that were in the deleted offer
    await updateProductPricesFromOffers(tx, userId, affectedProductIds);
  });

  try {
    await broadcastOfferUpdate(offerToDelete.id, affectedProductIds);
    await broadcastPriceUpdate(affectedProductIds);
    // Invalidate search cache when offers change (only search queries use cache)
    const { invalidateSearchCache } = await import('@/utils/searchCache');
    await invalidateSearchCache('search-cache:marketplace:*');
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

