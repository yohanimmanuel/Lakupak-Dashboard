import type { Prisma } from '@/lib/db';
import { Prisma as PrismaNamespace } from '@/lib/db';
import { prisma } from '../common/prisma';
import { safeParsePrice } from '@/utils/currencyUtils';
import { calculateSoldCounts, updateProductPricesFromOffers, deactivateExpiredOffers } from '@/utils/marketplaceMetrics';
import { sanitizePagination, buildPaginationInfo, parseMoney } from '../common/utils';
import { getSecurityHeaders } from '@/utils/auth-security';
import { verifyAccessToken } from '@/lib/jwt';
import { validateOfferForProduct, trackOfferUsage as trackOfferUsageUtil, trackOfferUsageForAllTypes, updateOfferStatusesBasedOnLimits } from '@/utils/offerValidation';
import { parseNumberByCurrency } from '@/config/currencyConfig';
import { validateVariant } from '@/services/variantService';
import { syncOrderToBuyerProfile, buildMobileBuyerId } from '@/utils/buyerSync';
import { broadcastOrderUpdate } from '@/utils/websocketBroadcast';
import { getTodayBoundaries, getStartOfDay, getEndOfDay } from '@/lib/dateUtils';
import {
  getCachedMarketplaceSearch,
  setCachedMarketplaceSearch,
  invalidateSearchCache,
} from '@/utils/searchCache';

interface OfferDiscountType {
  id: string;
  discountType: string;
  discountValue: number;
  minQuantity: number | null;
  freeQuantity?: number | null;
  isActive: boolean;
  description: string | null;
}

export const marketplaceTypeDefs = /* GraphQL */ `
  type MarketplaceUserProfile {
    id: Int!
    username: String!
    name: String
    storeName: String
    email: String
    bio: String
    phone: String!
    image: String
    bannerImage: String
    chosenAddress: String
    country: String
    createdAt: String!
    updatedAt: String!
  }

  type MarketplaceAddress {
    id: Int!
    userId: Int!
    fullName: String
    phone: String
    address: String
    label: String
    isDefault: Boolean!
    createdAt: String!
    updatedAt: String!
  }

  type MarketplaceAddressList {
    success: Boolean!
    addresses: [MarketplaceAddress!]!
  }

  type MarketplaceAddressResult {
    success: Boolean!
    message: String
    address: MarketplaceAddress
  }

  type MobileMarketplaceProduct {
    id: String!
    name: String!
    description: String!
    userId: Int
    sellingPrice: Float!
    originalSellingPrice: Float
    price: Float!
    originalPrice: Float!
    offerBadge: String
    hasActiveOffer: Boolean!
    offerId: String
    offerName: String
    discountType: String
    discountValue: Float
    promotionDetails: JSONObject
    rating: Float!
    reviewCount: Int!
    soldCount: String!
    stock: Int!
    stockStatus: String!
    variants: [JSONObject!]!
    variantOptions: [JSONObject!]!
    variantOptionsFormatted: [JSONObject!]!
    images: [String!]!
    category: String!
    productCategory: String!
    brand: String
    unit: String!
    sku: String!
    supplier: String
    publishedAt: String
    lastSyncAt: String
    piecesPerPackage: Int!
    packageType: String!
    seller: MarketplaceSeller!
    shipping: MarketplaceShipping!
    shippingInfo: MarketplaceShippingInfo!
    assurance: MarketplaceAssurance!
    reviews: MarketplaceReviews!
  }

  type MarketplaceSeller {
    name: String!
    avatar: String!
    rating: Float!
    reviewCount: Int!
    isOfficial: Boolean!
    responseTime: String!
    deliverySpeed: String!
    returnPolicy: String!
    company: MarketplaceCompany
  }

  type MarketplaceCompany {
    name: String!
    businessAddress: String
    businessPhone: String
    businessEmail: String
    industryType: String
    pickupAddress: String
    logo: String
    bannerImage: String
  }

  type MarketplaceShipping {
    preferences: [String!]!
    standard: ShippingOption!
    express: ShippingOption!
    sameDay: ShippingOption!
    nextDay: ShippingOption!
    scheduled: ShippingOption!
    pickup: ShippingOption!
  }

  type ShippingOption {
    price: Float!
    free: Boolean!
    available: Boolean!
  }

  type MarketplaceShippingInfo {
    location: String!
  }

  type MarketplaceAssurance {
    halalCertified: Boolean!
    bpomApproved: Boolean!
    returnPolicyDays: Int!
    originalProduct: Boolean!
  }

  type MarketplaceReviews {
    overallRating: Float!
    totalReviews: Int!
    breakdown: JSONObject!
    sampleReview: JSONObject
    hasReviews: Boolean!
  }

  type MobileMarketplaceProductConnection {
    nodes: [MobileMarketplaceProduct!]!
    pagination: PaginationInfo!
    timestamp: String!
  }

  type CartItem {
    id: Int!
    userId: Int!
    productId: String!
    productData: JSONObject!
    activityType: String!
    metadata: JSONObject
    createdAt: String!
    updatedAt: String!
  }

  type CartConnection {
    items: [CartItem!]!
    success: Boolean!
  }

  type CartItemResult {
    success: Boolean!
    cartItem: CartItem
    message: String!
  }


  type UserActivityConnection {
    success: Boolean!
    activities: [UserActivity!]!
  }

  type UserActivityResult {
    success: Boolean!
    activity: UserActivity
    action: String!
  }

  type DeleteActivityResult {
    success: Boolean!
    deletedCount: Int!
  }

  type SearchHistory {
    id: Int!
    userId: Int!
    query: String!
    createdAt: String!
    updatedAt: String!
  }

  type SearchHistoryConnection {
    success: Boolean!
    searches: [SearchHistory!]!
  }

  type SearchHistoryResult {
    success: Boolean!
    message: String!
    search: SearchHistory
  }

  input CreateMarketplaceAddressInput {
    fullName: String!
    phone: String!
    address: String!
    label: String
    isDefault: Boolean
  }

  input UpdateMarketplaceAddressInput {
    fullName: String
    phone: String
    address: String
    label: String
    isDefault: Boolean
  }

  input UpdateMarketplaceUserInput {
    username: String
    name: String
    storeName: String
    email: String
    bio: String
    phone: String
    image: String
    bannerImage: String
    chosenAddress: String
    country: String
  }

  input AddToCartInput {
    userId: Int!
    productId: String!
    productData: JSONObject!
    quantity: Int
    variant: String
  }

  input UpdateCartItemInput {
    cartItemId: Int!
    quantity: Int
    selected: Boolean
  }

  input AddUserActivityInput {
    userId: Int!
    productId: String!
    productData: JSONObject!
    activityType: ActivityType!
    metadata: JSONObject
  }

  extend type Query {
    marketplaceUser(userId: Int!): MarketplaceUserProfile
    
    marketplaceAddresses(userId: Int!): MarketplaceAddressList!

    mobileMarketplaceProducts(
      page: Int = 1
      limit: Int = 20
      category: String
      search: String
      marketplaceUserId: Int
    ): MobileMarketplaceProductConnection!
    
    mobileCart(userId: Int!): CartConnection!
    
    mobileUserActivity(
      userId: Int!
      type: ActivityType!
    ): UserActivityConnection!
    
    mobileOrders(
      userId: Int!
      page: Int = 1
      limit: Int = 10
    ): OrderConnection!
    
    mobileSearchHistory(
      userId: Int!
      limit: Int = 10
    ): SearchHistoryConnection!
  }

  extend type Mutation {
    updateMarketplaceUser(
      userId: Int!
      input: UpdateMarketplaceUserInput!
    ): MarketplaceUserProfile!

    createMarketplaceAddress(
      userId: Int!
      input: CreateMarketplaceAddressInput!
    ): MarketplaceAddressResult!

    updateMarketplaceAddress(
      userId: Int!
      addressId: Int!
      input: UpdateMarketplaceAddressInput!
    ): MarketplaceAddressResult!

    deleteMarketplaceAddress(
      userId: Int!
      addressId: Int!
    ): MarketplaceAddressResult!
    
    addToCart(input: AddToCartInput!): CartItemResult!
    
    updateCartItem(input: UpdateCartItemInput!): CartItemResult!
    
    removeCartItem(cartItemId: Int): CartItemResult!
    clearCart(userId: Int!): CartItemResult!
    
    addUserActivity(input: AddUserActivityInput!): UserActivityResult!
    
    deleteUserActivity(
      userId: Int!
      productId: String!
      type: ActivityType!
    ): DeleteActivityResult!
    
    addSearchHistory(
      userId: Int!
      query: String!
    ): SearchHistoryResult!
    
    removeSearchHistory(
      userId: Int!
      query: String!
    ): SearchHistoryResult!
    
    clearSearchHistory(
      userId: Int!
    ): SearchHistoryResult!
  }
`;

// Helper function to cleanup old viewed products
async function cleanupOldViewedProducts(userId: number) {
  const { startOfToday } = getTodayBoundaries();
  
  const deletedCount = await prisma.userActivity.deleteMany({
    where: {
      userId: userId,
      activityType: 'viewed',
      createdAt: {
        lt: startOfToday
      }
    }
  });
  
  return deletedCount.count;
}

const fetchMarketplaceUserProfile = async (userId: number) => {
  const user = await prisma.marketplaceUser.findUnique({
    where: { id: userId },
  });

  if (!user) {
    return null;
  }

  return {
    id: user.id,
    username: user.username,
    name: user.name,
    storeName: user.storeName,
    email: user.email,
    bio: user.bio,
    phone: user.phone,
    image: user.image,
    bannerImage: user.bannerImage,
    chosenAddress: user.chosenAddress,
    country: user.country,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  };
};

const updateMarketplaceUser = async (args: { userId: number; input: {
  username?: string;
  name?: string;
  storeName?: string;
  email?: string;
  bio?: string;
  phone?: string;
  image?: string;
  bannerImage?: string;
  chosenAddress?: string;
  country?: string;
} }) => {
  const { userId, input } = args;
  
  // Check if user exists
  const existingUser = await prisma.marketplaceUser.findUnique({
    where: { id: userId }
  });
  
  if (!existingUser) {
    throw new Error('User not found');
  }
  
  // Check for unique constraints if updating username or email
  if (input.username && input.username !== existingUser.username) {
    const usernameExists = await prisma.marketplaceUser.findUnique({
      where: { username: input.username.trim() }
    });
    if (usernameExists) {
      throw new Error('Username already taken');
    }
  }
  
  if (input.email && input.email !== existingUser.email) {
    const emailExists = await prisma.marketplaceUser.findUnique({
      where: { email: input.email.trim().toLowerCase() }
    });
    if (emailExists) {
      throw new Error('Email already taken');
    }
  }
  
  // Update user
  const updatedUser = await prisma.marketplaceUser.update({
    where: { id: userId },
    data: {
      ...(input.username && { username: input.username.trim() }),
      ...(input.name && { name: input.name.trim() }),
      ...(input.storeName && { storeName: input.storeName.trim() }),
      ...(input.email && { email: input.email.trim().toLowerCase() }),
      ...(input.bio && { bio: input.bio.trim() }),
      ...(input.phone && { phone: input.phone.trim() }),
      ...(input.image && { image: input.image.trim() }),
      ...(input.bannerImage && { bannerImage: input.bannerImage.trim() }),
      ...(input.chosenAddress && { chosenAddress: input.chosenAddress.trim() }),
      ...(input.country && { country: input.country.trim() })
    }
  });
  
  return {
    id: updatedUser.id,
    username: updatedUser.username,
    name: updatedUser.name,
    storeName: updatedUser.storeName,
    email: updatedUser.email,
    bio: updatedUser.bio,
    phone: updatedUser.phone,
    image: updatedUser.image,
    bannerImage: updatedUser.bannerImage,
    chosenAddress: updatedUser.chosenAddress,
    country: updatedUser.country,
    createdAt: updatedUser.createdAt.toISOString(),
    updatedAt: updatedUser.updatedAt.toISOString(),
  };
};

type CreateMarketplaceAddressInput = {
  fullName: string;
  phone: string;
  address: string;
  label?: string | null;
  isDefault?: boolean | null;
};

type UpdateMarketplaceAddressInput = {
  fullName?: string | null;
  phone?: string | null;
  address?: string | null;
  label?: string | null;
  isDefault?: boolean | null;
};

type AddressRecord = NonNullable<Awaited<ReturnType<typeof prisma.address.findUnique>>>;

const mapMarketplaceAddress = (address: AddressRecord) => ({
  id: address.id,
  userId: address.userId,
  fullName: address.fullName,
  phone: address.phone,
  address: address.address,
  label: address.label,
  isDefault: Boolean(address.isDefault),
  createdAt: address.createdAt.toISOString(),
  updatedAt: address.updatedAt.toISOString(),
});

const normalizeLabel = (label?: string | null) => {
  if (!label || typeof label !== 'string') {
    return 'home';
  }
  const trimmed = label.trim();
  return trimmed.length > 0 ? trimmed : 'home';
};

const isDuplicateAddressIdError = (error: unknown): boolean => {
  if (!error || typeof error !== 'object') return false;
  const prismaError = error as { code?: string; meta?: { target?: unknown } };
  return (
    prismaError.code === 'P2002' &&
    Array.isArray(prismaError.meta?.target) &&
    (prismaError.meta?.target as string[]).includes('Address_pkey')
  );
};

const resetAddressIdSequence = async () => {
  if (!process.env.DATABASE_URL?.startsWith('postgres')) {
    return;
  }

  await prisma.$executeRawUnsafe(`
    SELECT setval(
      pg_get_serial_sequence('"Address"', 'id'),
      COALESCE((SELECT MAX("id") FROM "Address"), 0),
      true
    );
  `);
};

const fetchMarketplaceAddresses = async (userId: number) => {
  const addresses = await prisma.address.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
  });

  return addresses.map(mapMarketplaceAddress);
};

const createMarketplaceAddress = async (args: { userId: number; input: CreateMarketplaceAddressInput }) => {
  const { userId, input } = args;

  const executeCreate = async () =>
    prisma.$transaction(async (tx) => {
      const newAddress = await tx.address.create({
        data: {
          userId,
          fullName: input.fullName.trim(),
          phone: input.phone.trim(),
          address: input.address.trim(),
          isDefault: Boolean(input.isDefault),
          label: normalizeLabel(input.label),
        },
      });

      if (newAddress.isDefault) {
        await tx.address.updateMany({
          where: { userId, NOT: { id: newAddress.id } },
          data: { isDefault: false },
        });
        await tx.marketplaceUser.update({
          where: { id: userId },
          data: { chosenAddress: newAddress.address },
        });
      }

      return newAddress;
    });

  try {
    return mapMarketplaceAddress(await executeCreate());
  } catch (error) {
    if (isDuplicateAddressIdError(error)) {
      await resetAddressIdSequence();
      return mapMarketplaceAddress(await executeCreate());
    }
    throw error;
  }
};

const updateMarketplaceAddress = async (args: {
  userId: number;
  addressId: number;
  input: UpdateMarketplaceAddressInput;
}) => {
  const { userId, addressId, input } = args;

  const updated = await prisma.$transaction(async (tx) => {
    const existing = await tx.address.findUnique({ where: { id: addressId } });
    if (!existing || existing.userId !== userId) {
      throw new Error('Address not found');
    }

    const updatedAddress = await tx.address.update({
      where: { id: addressId },
      data: {
        ...(typeof input.fullName === 'string' ? { fullName: input.fullName.trim() } : {}),
        ...(typeof input.phone === 'string' ? { phone: input.phone.trim() } : {}),
        ...(typeof input.address === 'string' ? { address: input.address.trim() } : {}),
        ...(typeof input.label === 'string' ? { label: normalizeLabel(input.label) } : {}),
        ...(typeof input.isDefault === 'boolean' ? { isDefault: input.isDefault } : {}),
      },
    });

    if (input.isDefault === true) {
      await tx.address.updateMany({
        where: { userId, NOT: { id: updatedAddress.id } },
        data: { isDefault: false },
      });
      await tx.marketplaceUser.update({
        where: { id: userId },
        data: { chosenAddress: updatedAddress.address ?? null },
      });
    } else if (input.isDefault === false && existing.isDefault) {
      await tx.marketplaceUser.update({
        where: { id: userId },
        data: { chosenAddress: null },
      });
    }

    return updatedAddress;
  });

  return mapMarketplaceAddress(updated);
};

const deleteMarketplaceAddress = async (args: { userId: number; addressId: number }) => {
  const { userId, addressId } = args;

  const deleted = await prisma.$transaction(async (tx) => {
    const existing = await tx.address.findUnique({ where: { id: addressId } });
    if (!existing || existing.userId !== userId) {
      throw new Error('Address not found');
    }

    await tx.address.delete({ where: { id: addressId } });

    if (existing.isDefault) {
      await tx.marketplaceUser.update({
        where: { id: userId },
        data: { chosenAddress: null },
      });
    }

    return existing;
  });

  return mapMarketplaceAddress(deleted);
};

const fetchMarketplaceProducts = async (args: {
  page?: number;
  limit?: number;
  category?: string;
  search?: string;
  marketplaceUserId?: number;
}) => {
  const { page = 1, limit = 20, category, search } = args;
  
  // ONLY use cache for search queries (when search parameter is provided)
  // Regular marketplace listings should always be fresh to show real-time offer/price updates
  let cachedResult = null;
  if (search && search.trim()) {
    cachedResult = await getCachedMarketplaceSearch<{
    nodes: unknown[];
    pagination: ReturnType<typeof buildPaginationInfo>;
    timestamp?: string;
  }>({ search: search || null, category: category || null, page, limit });
  
  if (cachedResult) {
    return {
      ...cachedResult,
      timestamp: new Date().toISOString()
    };
    }
  }
  
  // Build where clause for published products only
  const whereClause: Record<string, unknown> = {
    marketplaceStatus: 'Published',
    status: 'Published'
  };
  
  // Build OR conditions for filtering
  const orConditions: Record<string, unknown>[] = [];
  
  if (category && category !== 'All') {
    orConditions.push({ productType: category });
  }
  
  if (search) {
    orConditions.push(
      { name: { contains: search, mode: 'insensitive' } },
      { description: { contains: search, mode: 'insensitive' } },
      { brand: { contains: search, mode: 'insensitive' } },
      { productType: { contains: search, mode: 'insensitive' } },
    );
  }
  
  if (orConditions.length > 0) {
    whereClause.OR = orConditions;
  }
  
  const { page: safePage, limit: safeLimit } = sanitizePagination(page, limit);
  const skip = (safePage - 1) * safeLimit;
  const take = safeLimit;
  
  // Get published products with user info, ordered by lastSyncAt to get most recent changes
  const products = await prisma.product.findMany({
    where: whereClause,
    include: {
      variants: true,
      variantOptions: true,
      user: {
        select: {
          firstName: true,
          lastName: true,
          company: {
            select: {
              name: true,
              businessAddress: true,
              businessPhone: true,
              businessEmail: true,
              industryType: true,
              shippingPreferences: true,
              baseShippingPrice: true,
              expressShippingPrice: true,
              sameDayShippingPrice: true,
              nextDayShippingPrice: true,
              scheduledDeliveryPrice: true,
              pickupAddress: true,
              logo: true,
              bannerImage: true,
            }
          }
        }
      }
    },
    skip,
    take,
    orderBy: [
      { lastSyncAt: 'desc' },
      { publishedAt: 'desc' }
    ]
  });
  
  // Get active offers for all products
  const productIds = products.map(p => p.productId);
  const userIds = [...new Set(products.map(p => p.userId).filter((id): id is number => id !== null))];
  const soldCountMap = await calculateSoldCounts(prisma, productIds);
  
  // Get only ACTIVE offers to check real-time status
  const { startOfToday, endOfToday } = getTodayBoundaries(); // Uses Asia/Jakarta timezone by default
  const allOffers = await prisma.offer.findMany({
    where: {
      userId: { in: userIds },
      status: 'active',
      offerProducts: {
        some: {
          productId: { in: productIds }
        }
      },
      // Filter by date ranges: offer is active if it has no date ranges (unlimited) OR has at least one active date range that's currently valid
      OR: [
        {
          dateRanges: {
            none: {}, // No date ranges = unlimited offer
          },
        },
        {
          dateRanges: {
            some: {
              isActive: true,
              startDate: { lte: endOfToday }, // Start date is on or before today
              endDate: { gte: startOfToday }, // End date is on or after today (includes entire day)
            },
          },
        },
      ],
    },
    include: {
      offerProducts: true,
      offerDiscountTypes: true,
      dateRanges: true
    }
  });

  // Deactivate expired offers based on date ranges
  // Await to ensure broadcasts complete before returning results
  try {
      const { broadcastOfferUpdate, broadcastPriceUpdate, broadcastProductUpdate } = await import('@/utils/websocketBroadcast');
    
    await Promise.all(
    userIds.map(async (userId) => {
      const result = await deactivateExpiredOffers(prisma, userId);
      
      // Broadcast websocket updates for activated and deactivated offers
        // Do this BEFORE querying so clients get updates immediately
        // Collect all broadcasts to run in parallel
        const broadcastPromises: Promise<void>[] = [];
      
      for (const { offerId, productIds } of result.activatedOffers) {
          // Run all broadcasts in parallel for this offer
          broadcastPromises.push(
            broadcastOfferUpdate(offerId, productIds),
            broadcastPriceUpdate(productIds),
            broadcastProductUpdate(productIds)
          );
      }
      
      // Broadcast for deactivated offers (active → scheduled/inactive)
      for (const { offerId, productIds } of result.deactivatedOffers) {
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
          await invalidateSearchCache('search-cache:marketplace:*');
          // Small delay to ensure WebSocket messages are sent before query returns
          await new Promise(resolve => setTimeout(resolve, 50));
      }
      
      return result;
    })
    );
  } catch (error) {
    console.error('[Marketplace] Background offer deactivation failed:', error);
  }

  // Helper function to check if current time is within any active date range
  const isWithinActiveDateRange = (dateRanges: Array<{ startDate: Date | string; endDate: Date | string; isActive: boolean }>): boolean => {
    if (!dateRanges || dateRanges.length === 0) {
      return true; // No date ranges means offer is always active (within main dates)
    }
    
    const { startOfToday, endOfToday } = getTodayBoundaries();
    
    return dateRanges.some(range => {
      if (!range.isActive) return false;
      
      // Convert to Date objects (they come as strings from database)
      const startDate = new Date(range.startDate);
      const endDate = new Date(range.endDate);
      
      // Normalize to start/end of day in business timezone
      const rangeStart = getStartOfDay(startDate);
      const rangeEnd = getEndOfDay(endDate);
      
      // Check if today intersects with the date range
      return !(rangeEnd < startOfToday || rangeStart > endOfToday);
    });
  };

  // Filter offers - keep offer if at least one discount type is still usable AND date constraints are met
  const validOffers = [];
  
  for (const offer of allOffers) {
    // Check date ranges if they exist
    // Note: Date ranges are used for filtering active offers in marketplace
    // If offer has date ranges, at least one must be active for the offer to be valid
    const hasActiveDateRange = isWithinActiveDateRange(offer.dateRanges || []);
    if (!hasActiveDateRange) {
      continue; // Skip this offer if no active date range matches (for marketplace display only)
    }
    
    // Check if at least one discount type is active
    let hasValidDiscountType = false;
    
    for (const discountType of offer.offerDiscountTypes) {
      if (discountType.isActive === true) {
        hasValidDiscountType = true;
        break;
      }
    }
    
    if (!hasValidDiscountType) {
      // Deactivate in background to not block query
      prisma.offer.update({
        where: { id: offer.id },
        data: { status: 'inactive' }
      }).catch((error) => {
        console.error(`[Marketplace] Failed to deactivate offer ${offer.id}:`, error);
      });
    } else {
      validOffers.push(offer);
    }
  }
  
  // Note: Price updates are handled by offer activation/deactivation mutations
  // We don't update prices here to avoid race conditions and ensure consistency
  
  // Create a map of product offers using only valid offers
  const productOffersMap = new Map();
  validOffers.forEach((offer) => {
    offer.offerProducts.forEach((op) => {
      if (!productOffersMap.has(op.productId)) {
        productOffersMap.set(op.productId, []);
      }
      productOffersMap.get(op.productId).push(offer);
    });
  });
  
  // Transform products for marketplace format
  const marketplaceProducts = await Promise.all(products.map(async (product) => {
    const variantOptions = product.variantOptions || [];
    
    if (variantOptions.length === 0) {
      return null;
    }
    
    const firstVariantOption = variantOptions.find(vo => vo.isDefault) || variantOptions[0];
    const sellingPrice = safeParsePrice(firstVariantOption.sellingPrice);
    const purchasePrice = safeParsePrice(firstVariantOption.purchasePrice);
    const storedOriginalPrice = firstVariantOption.originalSellingPrice 
      ? safeParsePrice(firstVariantOption.originalSellingPrice) 
      : null;
    
    const productOffers = productOffersMap.get(product.productId) || [];
    let offerBadge = undefined;
    let hasActiveOffer = false;
    let offerId = undefined;
    let offerName = undefined;
    let originalSellingPrice = undefined;
    let discountType = undefined;
    let discountValue = undefined;
    let hasPriceDiscounts = false;
    let promotionDetails = undefined;
    
    if (productOffers.length > 0) {
      const primaryOffer = productOffers[0];
      
      const activeDiscountTypes = [];
      for (const dt of primaryOffer.offerDiscountTypes) {
        if (dt.isActive === true) {
          activeDiscountTypes.push(dt);
        }
      }
      
      if (activeDiscountTypes.length === 0) {
        await prisma.offer.update({
          where: { id: primaryOffer.id },
          data: { status: 'inactive' }
        });
      }
      
      if (activeDiscountTypes.length > 0) {
        hasPriceDiscounts = activeDiscountTypes.some((dt: OfferDiscountType) => 
          dt.discountType === 'percentage' || dt.discountType === 'fixed'
        );
        const hasPromotions = activeDiscountTypes.some((dt: OfferDiscountType) => 
          dt.discountType === 'buy_x_get_y'
        );
        
        // Determine badge type based on active discount types
        if (hasPriceDiscounts && hasPromotions) {
          offerBadge = 'All Offers';
        } else if (hasPromotions) {
          offerBadge = 'Promotion';
        } else if (hasPriceDiscounts) {
          offerBadge = 'Discount';
        } else {
          offerBadge = 'Offer';
        }
        
        // Set discount information if there are price discounts
        if (hasPriceDiscounts) {
          const fixedDiscount = activeDiscountTypes.find((dt: OfferDiscountType) => dt.discountType === 'fixed');
          const percentageDiscount = activeDiscountTypes.find((dt: OfferDiscountType) => dt.discountType === 'percentage');
          discountType = fixedDiscount ? 'fixed' : (percentageDiscount ? 'percentage' : undefined);
          // Convert Decimal to number for GraphQL Float type
          const rawDiscountValue = fixedDiscount ? fixedDiscount.discountValue : (percentageDiscount ? percentageDiscount.discountValue : undefined);
          discountValue = rawDiscountValue !== undefined 
            ? safeParsePrice(rawDiscountValue as string | number | { toNumber?: () => number; toString?: () => string } | null | undefined)
            : undefined;
        }
        
        // Set promotion details if there are buy X get Y promotions
        const buyXGetYPromo = activeDiscountTypes.find((dt: OfferDiscountType) => dt.discountType === 'buy_x_get_y');
        if (buyXGetYPromo) {
          // Convert Decimal discountValue to number
          const freeQty = safeParsePrice(buyXGetYPromo.discountValue as string | number | { toNumber?: () => number; toString?: () => string } | null | undefined);
          promotionDetails = {
            minQuantity: buyXGetYPromo.minQuantity,
            freeQuantity: freeQty,
            description: buyXGetYPromo.description || `Buy ${buyXGetYPromo.minQuantity} Get ${freeQty} Free`
          };
        }
      
        hasActiveOffer = true;
        offerId = primaryOffer.id;
        offerName = primaryOffer.name;
      }
    }
    
    // Only show originalSellingPrice (strikethrough) if:
    // 1. There's an active offer with price discounts, AND
    // 2. The stored original price exists and is greater than selling price
    // Otherwise, don't show strikethrough (no offer or no price discount)
    if (hasActiveOffer && hasPriceDiscounts && storedOriginalPrice && storedOriginalPrice > sellingPrice) {
      originalSellingPrice = storedOriginalPrice;
    } else {
      originalSellingPrice = undefined; // No strikethrough when no offer
    }
    
    const totalStock = variantOptions.reduce((sum, vo) => sum + (vo.stockQuantity || 0), 0);
    const totalLowStockThreshold = variantOptions.reduce((max, vo) => Math.max(max, vo.lowStockThreshold || 0), 0);
    
    let stockStatus = 'In Stock';
    if (totalStock === 0) stockStatus = 'Out of Stock';
    else if (totalLowStockThreshold > 0 && totalStock <= totalLowStockThreshold) stockStatus = 'Low Stock';
    
    return {
      id: product.productId,
      name: product.name,
      description: product.description,
      userId: product.userId,
      sellingPrice: sellingPrice,
      originalSellingPrice: originalSellingPrice, // Only set if there's an active offer with price discount
      price: sellingPrice,
      originalPrice: purchasePrice,
      offerBadge,
      hasActiveOffer,
      offerId,
      offerName,
      discountType,
      discountValue,
      promotionDetails,
      rating: 0,
      reviewCount: 0,
      soldCount: soldCountMap.get(product.productId) || '0',
      stock: totalStock,
      stockStatus,
      variants: product.variants || [],
      variantOptions: product.variantOptions || [],
      variantOptionsFormatted: variantOptions.map(vo => ({
        id: vo.id,
        sku: vo.sku,
        purchasePrice: safeParsePrice(vo.purchasePrice),
        sellingPrice: safeParsePrice(vo.sellingPrice),
        originalSellingPrice: safeParsePrice(vo.originalSellingPrice),
        moq: vo.moq,
        stockQuantity: vo.stockQuantity || 0,
        lowStockThreshold: vo.lowStockThreshold || 0,
        stockStatus: vo.stockStatus || 'In Stock',
        attributes: vo.attributes,
        isDefault: vo.isDefault,
        isActive: vo.isActive
      })),
      images: product.images || [],
      category: product.productType || 'Uncategorized',
      productCategory: product.productCategory || 'Uncategorized',
      brand: product.brand,
      unit: 'Piece',
      sku: product.sku,
      supplier: product.supplier,
      publishedAt: product.publishedAt?.toISOString() || null,
      lastSyncAt: product.lastSyncAt?.toISOString() || null,
      piecesPerPackage: 1,
      packageType: 'Piece',
      seller: {
        name: product.user?.company?.name || 'Unknown Company',
        avatar: '/default-avatar.png',
        rating: 0,
        reviewCount: 0,
        isOfficial: true,
        responseTime: 'N/A',
        deliverySpeed: 'N/A',
        returnPolicy: `${product.returnPolicyDays || 7} days return policy`,
        company: product.user?.company ? {
          name: product.user.company.name,
          businessAddress: product.user.company.businessAddress,
          businessPhone: product.user.company.businessPhone,
          businessEmail: product.user.company.businessEmail,
          industryType: product.user.company.industryType,
          pickupAddress: product.user.company.pickupAddress,
          logo: product.user.company.logo || null,
          bannerImage: product.user.company.bannerImage || null,
        } : undefined
      },
      shipping: {
        preferences: product.user?.company?.shippingPreferences ? JSON.parse(product.user.company.shippingPreferences) : [],
        standard: { 
          price: product.user?.company?.baseShippingPrice ? parseMoney(product.user.company.baseShippingPrice) : 0, 
          free: false,
          available: true
        },
        express: { 
          price: product.user?.company?.expressShippingPrice ? parseMoney(product.user.company.expressShippingPrice) : 0, 
          free: false,
          available: product.user?.company?.shippingPreferences ? JSON.parse(product.user.company.shippingPreferences).includes('Express Shipping') : false
        },
        sameDay: { 
          price: product.user?.company?.sameDayShippingPrice ? parseMoney(product.user.company.sameDayShippingPrice) : 0, 
          free: false,
          available: product.user?.company?.shippingPreferences ? JSON.parse(product.user.company.shippingPreferences).includes('Same-day Delivery') : false
        },
        nextDay: { 
          price: product.user?.company?.nextDayShippingPrice ? parseMoney(product.user.company.nextDayShippingPrice) : 0, 
          free: false,
          available: product.user?.company?.shippingPreferences ? JSON.parse(product.user.company.shippingPreferences).includes('Next-day Delivery') : false
        },
        scheduled: {
          price: product.user?.company?.scheduledDeliveryPrice != null 
            ? parseMoney(product.user.company.scheduledDeliveryPrice) 
            : (product.user?.company?.baseShippingPrice != null ? parseMoney(product.user.company.baseShippingPrice) : 0),
          free: false,
          available: product.user?.company?.shippingPreferences ? JSON.parse(product.user.company.shippingPreferences).includes('Scheduled Delivery') : false
        },
        pickup: {
          price: 0,
          free: true,
          available: product.user?.company?.shippingPreferences ? JSON.parse(product.user.company.shippingPreferences).includes('Pickup Available') : false
        }
      },
      shippingInfo: {
        location: 'Indonesia'
      },
      assurance: {
        halalCertified: product.halalCertified || false,
        bpomApproved: product.bpomApproved || false,
        returnPolicyDays: product.returnPolicyDays || 7,
        originalProduct: product.originalProduct !== false
      },
      reviews: {
        overallRating: 0,
        totalReviews: 0,
        breakdown: { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 },
        sampleReview: null,
        hasReviews: false
      }
    };
  }));
  
  const totalCount = await prisma.product.count({ where: whereClause });
  const pagination = buildPaginationInfo(page, limit, totalCount);
  
  const result = {
    nodes: marketplaceProducts.filter(product => product !== null),
    pagination,
    timestamp: new Date().toISOString()
  };
  
  // ONLY cache search queries (when search parameter is provided)
  // Regular marketplace listings should always be fresh to show real-time offer/price updates
  if (search && search.trim()) {
  await setCachedMarketplaceSearch({ search: search || null, category: category || null, page, limit }, result);
  }
  
  return result;
};

const fetchMobileCart = async (userId: number) => {
  // Fetch all cart items from database (keeping unpublished products in DB for history)
  const cartItems = await prisma.userActivity.findMany({
    where: { 
      userId,
      activityType: 'cart'
    },
    orderBy: { createdAt: 'desc' }
  });

  // Get productIds from cart items
  const productIds = cartItems.map(item => item.productId);

  // Check which products are currently published
  const publishedProducts = await prisma.product.findMany({
    where: {
      productId: { in: productIds },
      status: 'Published',
      marketplaceStatus: 'Published'
    },
    select: {
      productId: true
    }
  });

  const publishedProductIds = new Set(publishedProducts.map(p => p.productId));

  // Filter cart items to only show published products
  // Unpublished products stay in DB but are hidden from cart
  const visibleCartItems = cartItems.filter(item => publishedProductIds.has(item.productId));

  return {
    items: visibleCartItems.map(item => ({
      id: item.id,
      userId: item.userId,
      productId: item.productId,
      productData: item.productData as Prisma.InputJsonValue,
      activityType: item.activityType,
      metadata: item.metadata as Prisma.InputJsonValue | null,
      createdAt: item.createdAt.toISOString(),
      updatedAt: item.updatedAt.toISOString(),
    })),
    success: true
  };
};

const addToCart = async (args: {
  userId: number;
  productId: string;
  productData: Record<string, unknown>;
  quantity?: number;
  variant?: string;
}) => {
  const { userId, productId, productData, quantity = 1, variant = 'Default' } = args;

  const existingItem = await prisma.userActivity.findFirst({
    where: {
      userId,
      productId,
      activityType: 'cart',
      metadata: {
        path: ['variant'],
        equals: variant
      }
    }
  });

  if (existingItem) {
    const metadata = (existingItem.metadata as { quantity?: number; variant?: string; selected?: boolean }) || {};
    const currentQuantity = metadata.quantity || 1;
    const updatedItem = await prisma.userActivity.update({
      where: { id: existingItem.id },
      data: {
        productData: productData as Prisma.InputJsonValue,
        metadata: {
          quantity: currentQuantity + quantity,
          variant: variant,
          selected: true
        },
        updatedAt: new Date()
      }
    });

    // Record a permanent "add to cart" event for analytics (never deleted on remove)
    await prisma.userActivity.create({
      data: {
        userId,
        productId,
        productData: productData as Prisma.InputJsonValue,
        activityType: 'cart_added',
        metadata: { quantity, variant } as Prisma.InputJsonValue
      }
    });

    return {
      success: true,
      cartItem: {
        id: updatedItem.id,
        userId: updatedItem.userId,
        productId: updatedItem.productId,
        productData: updatedItem.productData as Prisma.InputJsonValue,
        activityType: updatedItem.activityType,
        metadata: updatedItem.metadata as Prisma.InputJsonValue | null,
        createdAt: updatedItem.createdAt.toISOString(),
        updatedAt: updatedItem.updatedAt.toISOString(),
      },
      message: 'Cart item quantity updated'
    };
  } else {
    const newItem = await prisma.userActivity.create({
      data: {
        userId,
        productId,
        productData: productData as Prisma.InputJsonValue,
        activityType: 'cart',
        metadata: {
          quantity,
          variant,
          selected: true
        } as Prisma.InputJsonValue
      }
    });

    // Record a permanent "add to cart" event for analytics (never deleted on remove)
    await prisma.userActivity.create({
      data: {
        userId,
        productId,
        productData: productData as Prisma.InputJsonValue,
        activityType: 'cart_added',
        metadata: { quantity, variant } as Prisma.InputJsonValue
      }
    });

    return {
      success: true,
      cartItem: {
        id: newItem.id,
        userId: newItem.userId,
        productId: newItem.productId,
        productData: newItem.productData as Prisma.InputJsonValue,
        activityType: newItem.activityType,
        metadata: newItem.metadata as Prisma.InputJsonValue | null,
        createdAt: newItem.createdAt.toISOString(),
        updatedAt: newItem.updatedAt.toISOString(),
      },
      message: 'Item added to cart'
    };
  }
};

const updateCartItem = async (args: {
  cartItemId: number;
  quantity?: number;
  selected?: boolean;
}) => {
  const { cartItemId, quantity, selected } = args;

  const updateData: Record<string, unknown> = {
    updatedAt: new Date()
  };

  if (quantity !== undefined) {
    updateData.quantity = quantity;
  }

  if (selected !== undefined) {
    updateData.selected = selected;
  }

  const existingItem = await prisma.userActivity.findUnique({
    where: { id: cartItemId }
  });

  if (!existingItem) {
    throw new Error('Cart item not found');
  }

  const metadata = (existingItem.metadata as Record<string, unknown>) || {};
  const updatedMetadata = { ...metadata };
  if (quantity !== undefined) updatedMetadata.quantity = quantity;
  if (selected !== undefined) updatedMetadata.selected = selected;

  const updatedItem = await prisma.userActivity.update({
    where: { id: cartItemId },
    data: {
      metadata: updatedMetadata as Prisma.InputJsonValue,
      updatedAt: new Date()
    }
  });

  return {
    success: true,
    cartItem: {
      id: updatedItem.id,
      userId: updatedItem.userId,
      productId: updatedItem.productId,
      productData: updatedItem.productData as Record<string, unknown>,
      activityType: updatedItem.activityType,
      metadata: updatedItem.metadata as Record<string, unknown> | null,
      createdAt: updatedItem.createdAt.toISOString(),
      updatedAt: updatedItem.updatedAt.toISOString(),
    },
    message: 'Cart item updated'
  };
};

const removeCartItem = async (cartItemId: number) => {
  const item = await prisma.userActivity.findUnique({
    where: { id: cartItemId }
  });

  if (item && item.activityType === 'cart') {
    // Record abandonment only when user actually removes from cart (not when they purchase)
    await prisma.userActivity.create({
      data: {
        userId: item.userId,
        productId: item.productId,
        productData: item.productData as Prisma.InputJsonValue,
        activityType: 'cart_abandoned',
        metadata: item.metadata as Prisma.InputJsonValue
      }
    });
  }

  await prisma.userActivity.delete({
    where: { id: cartItemId }
  });

  return {
    success: true,
    cartItem: null,
    message: 'Cart item removed'
  };
};

const clearCart = async (userId: number) => {
  const cartItems = await prisma.userActivity.findMany({
    where: {
      userId,
      activityType: 'cart'
    }
  });

  // Record one cart_abandoned per item removed (abandonment = removed without purchasing)
  for (const item of cartItems) {
    await prisma.userActivity.create({
      data: {
        userId: item.userId,
        productId: item.productId,
        productData: item.productData as Prisma.InputJsonValue,
        activityType: 'cart_abandoned',
        metadata: item.metadata as Prisma.InputJsonValue
      }
    });
  }

  await prisma.userActivity.deleteMany({
    where: {
      userId,
      activityType: 'cart'
    }
  });

  return {
    success: true,
    cartItem: null,
    message: 'Cart cleared'
  };
};

const fetchMobileUserActivity = async (args: {
  userId: number;
  type: string;
}) => {
  const { userId, type } = args;

  let whereClause: Record<string, unknown> = { 
    userId,
    activityType: type
  };

  if (type === 'viewed') {
    const { startOfToday, endOfToday } = getTodayBoundaries();
    
    whereClause.createdAt = {
      gte: startOfToday,
      lte: endOfToday
    };
  }

  if (type === 'viewed') {
    await cleanupOldViewedProducts(userId);
  }

  const activities = await prisma.userActivity.findMany({
    where: whereClause,
    orderBy: { createdAt: 'desc' },
    take: type === 'viewed' ? 20 : undefined
  });

  return {
    success: true,
    activities: activities.map(activity => ({
      id: activity.id,
      userId: activity.userId,
      productId: activity.productId,
      productData: activity.productData as Prisma.InputJsonValue,
      activityType: activity.activityType as 'favorite' | 'viewed' | 'purchased' | 'cart',
      metadata: activity.metadata as Prisma.InputJsonValue | null,
      createdAt: activity.createdAt.toISOString(),
      updatedAt: activity.updatedAt.toISOString(),
    }))
  };
};

const addUserActivity = async (args: {
  userId: number;
  productId: string;
  productData: Record<string, unknown>;
  activityType: string;
  metadata?: Record<string, unknown>;
}) => {
  const { userId, productId, productData, activityType, metadata } = args;

  const existingActivity = await prisma.userActivity.findFirst({
    where: {
      userId,
      productId,
      activityType
    }
  });

  if (existingActivity) {
    const updatedActivity = await prisma.userActivity.update({
      where: { id: existingActivity.id },
      data: {
        productData: productData as Prisma.InputJsonValue,
        metadata: (metadata || existingActivity.metadata) as Prisma.InputJsonValue,
        updatedAt: new Date()
      }
    });

    if (activityType === 'viewed') {
      await cleanupOldViewedProducts(userId);
    }

    return {
      success: true,
      activity: {
        id: updatedActivity.id,
        userId: updatedActivity.userId,
        productId: updatedActivity.productId,
        productData: updatedActivity.productData as Prisma.InputJsonValue,
        activityType: updatedActivity.activityType as 'favorite' | 'viewed' | 'purchased' | 'cart',
        metadata: updatedActivity.metadata as Prisma.InputJsonValue | null,
        createdAt: updatedActivity.createdAt.toISOString(),
        updatedAt: updatedActivity.updatedAt.toISOString(),
      },
      action: 'updated'
    };
  } else {
    const newActivity = await prisma.userActivity.create({
      data: {
        userId,
        productId,
        productData: productData as Prisma.InputJsonValue,
        activityType,
        metadata: (metadata || {}) as Prisma.InputJsonValue
      }
    });

    if (activityType === 'viewed') {
      await cleanupOldViewedProducts(userId);
    }

    return {
      success: true,
      activity: {
        id: newActivity.id,
        userId: newActivity.userId,
        productId: newActivity.productId,
        productData: newActivity.productData as Prisma.InputJsonValue,
        activityType: newActivity.activityType as 'favorite' | 'viewed' | 'purchased' | 'cart',
        metadata: newActivity.metadata as Prisma.InputJsonValue | null,
        createdAt: newActivity.createdAt.toISOString(),
        updatedAt: newActivity.updatedAt.toISOString(),
      },
      action: 'created'
    };
  }
};

const deleteUserActivity = async (args: {
  userId: number;
  productId: string;
  type: string;
}) => {
  const { userId, productId, type } = args;

  const deletedActivity = await prisma.userActivity.deleteMany({
    where: {
      userId,
      productId,
      activityType: type
    }
  });

  return {
    success: true,
    deletedCount: deletedActivity.count
  };
};

const fetchMobileSearchHistory = async (args: {
  userId: number;
  limit?: number;
}) => {
  const { userId, limit = 10 } = args;

  const searches = await prisma.searchHistory.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });

  return {
    success: true,
    searches: searches.map((search: { id: number; userId: number; query: string; createdAt: Date; updatedAt: Date }) => ({
      id: search.id,
      userId: search.userId,
      query: search.query,
      createdAt: search.createdAt.toISOString(),
      updatedAt: search.updatedAt.toISOString(),
    }))
  };
};

function isRetryableTransactionError(e: unknown): boolean {
  const msg = String(e instanceof Error ? e.message : e);
  const code = (e as { code?: string })?.code;
  return (
    code === 'P2034' ||
    /write conflict|deadlock|could not serialize access/i.test(msg)
  );
}

const addSearchHistory = async (args: {
  userId: number;
  query: string;
}) => {
  const { userId, query } = args;

  if (!query.trim()) {
    throw new Error('Search query cannot be empty');
  }

  const trimmedQuery = query.trim();
  const maxRetries = 3;

  const runTransaction = () =>
    prisma.$transaction(async (tx) => {
      const allSearches = await tx.searchHistory.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' }
      });

      const existingIndex = allSearches.findIndex(
        (s: { query: string }) => s.query.toLowerCase() === trimmedQuery.toLowerCase()
      );
      const existing = existingIndex !== -1 ? allSearches[existingIndex] : null;

      if (existing) {
        await tx.searchHistory.delete({ where: { id: existing.id } });
      }

      const countAfterDeletion = existing ? allSearches.length - 1 : allSearches.length;

      if (countAfterDeletion >= 10) {
        const searchesToCheck = existing
          ? allSearches.filter((s: { id: number }) => s.id !== existing.id)
          : allSearches;
        const sortedByOldest = [...searchesToCheck].sort(
          (a: { createdAt: Date }, b: { createdAt: Date }) =>
            a.createdAt.getTime() - b.createdAt.getTime()
        );
        if (sortedByOldest.length > 0) {
          await tx.searchHistory.delete({ where: { id: sortedByOldest[0].id } });
        }
      }

      return tx.searchHistory.create({
        data: { userId, query: trimmedQuery },
      });
    }, { isolationLevel: 'ReadCommitted' });

  let lastError: unknown;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const result = await runTransaction();
      return {
        success: true,
        message: 'Search history added',
        search: {
          id: result.id,
          userId: result.userId,
          query: result.query,
          createdAt: result.createdAt.toISOString(),
          updatedAt: result.updatedAt.toISOString(),
        }
      };
    } catch (e) {
      lastError = e;
      if (attempt < maxRetries && isRetryableTransactionError(e)) {
        await new Promise(r => setTimeout(r, 50 * attempt));
        continue;
      }
      throw e;
    }
  }
  throw lastError; // only if loop exits without return/throw
};

const removeSearchHistory = async (args: {
  userId: number;
  query: string;
}) => {
  const { userId, query } = args;
  const trimmedQuery = query.trim();

  // Find the search (case-insensitive)
  const allSearches = await prisma.searchHistory.findMany({
    where: { userId }
  });
  const searchToDelete = allSearches.find((s: { query: string }) => s.query.toLowerCase() === trimmedQuery.toLowerCase());

  if (searchToDelete) {
    await prisma.searchHistory.delete({
      where: { id: searchToDelete.id }
    });
    return {
      success: true,
      message: 'Search history removed',
      search: null
    };
  }

  return {
    success: true,
    message: 'Search history not found',
    search: null
  };
};

const clearSearchHistory = async (args: {
  userId: number;
}) => {
  const { userId } = args;

  await prisma.searchHistory.deleteMany({
    where: { userId }
  });

  return {
    success: true,
    message: 'Search history cleared',
    search: null
  };
};

// Mobile orders - reuse the existing orders module logic
// This will be handled by the orders module, but we need to add a query here
const fetchMobileOrders = async (args: {
  userId: number;
  page?: number;
  limit?: number;
}) => {
  // This will be implemented by calling the orders module
  // For now, return empty result - will be implemented in next step
  const { page = 1, limit = 10 } = args;
  
  const marketplaceUser = await prisma.marketplaceUser.findUnique({
    where: { id: args.userId }
  });
  
  if (!marketplaceUser) {
    throw new Error('User not found');
  }
  
  const baseBuyerId = buildMobileBuyerId(marketplaceUser.id);
  const { page: safePage, limit: safeLimit } = sanitizePagination(page, limit);
  const skip = (safePage - 1) * safeLimit;
  const take = safeLimit;
  
  const orders = await prisma.order.findMany({
    where: {
      buyerId: {
        startsWith: baseBuyerId
      }
    },
    skip,
    take,
    orderBy: { orderDate: 'desc' },
    include: {
      user: {
        include: {
          company: true
        }
      },
      orderItemsRel: {
        include: {
          product: {
            include: {
              user: {
                include: {
                  company: true
                }
              }
            }
          }
        }
      }
    }
  });
  
  const total = await prisma.order.count({
    where: {
      buyerId: {
        startsWith: baseBuyerId
      }
    }
  });
  
  const ordersWithItems = orders.map(order => {
    const orderItems = (order.orderItemsRel || []).map((oi) => ({
      productId: oi.productId ?? null,
      subtotal: oi.subtotal,
      packageType: oi.packageType,
      piecesPerPackage: oi.piecesPerPackage,
      packageQuantity: oi.packageQuantity,
      pricePerPackage: oi.pricePerPackage,
      productName: oi.product?.name || oi.productNameSnapshot || 'Unknown Product',
      category: oi.product?.productType || oi.productTypeSnapshot || 'Uncategorized',
      brand: oi.product?.brand || 'Unknown Brand',
      description: oi.product?.description || '',
      images: oi.product?.images || [],
      productDeleted: !oi.product,
      productNameSnapshot: oi.productNameSnapshot || null,
      productSkuSnapshot: oi.productSkuSnapshot || null,
      productTypeSnapshot: oi.productTypeSnapshot || null,
      variantNameSnapshot: oi.variantNameSnapshot || null,
      offerApplied: oi.offerApplied || false,
      offerBadgeSnapshot: oi.offerBadgeSnapshot || null,
      offerNameSnapshot: oi.offerNameSnapshot || null,
      originalPriceSnapshot: oi.originalPriceSnapshot ? parseMoney(oi.originalPriceSnapshot) : null, // Convert Decimal to number
      discountPercentage: oi.discountPercentage ? parseMoney(oi.discountPercentage) : null, // Convert Decimal to number
      discountAmount: oi.discountAmount ? parseMoney(oi.discountAmount) : null, // Convert Decimal to number
      promotionDetailsSnapshot: oi.promotionDetailsSnapshot || null,
      moqSnapshot: oi.moqSnapshot || null,
      product: oi.product ? {
        userId: oi.product.userId ?? null,
        name: oi.product.name ?? null,
      } : null
    }));
    
    return {
      ...order,
      orderDate: order.orderDate?.toISOString() ?? '',
      createdAt: order.createdAt?.toISOString() ?? null,
      updatedAt: order.updatedAt?.toISOString() ?? null,
      preferredDeliveryDate: order.preferredDeliveryDate?.toISOString() ?? null,
      preferredPickupDate: order.preferredPickupDate?.toISOString() ?? null,
      acceptedAt: order.acceptedAt?.toISOString() ?? null,
      orderItems: orderItems
    };
  });
  
  const pagination = buildPaginationInfo(page, limit, total);
  
  return {
    nodes: ordersWithItems,
    pagination
  };
};

// Removed: createMobileOrder - Order creation should use REST endpoint /api/mobile/orders POST
// This function has been removed to align with architecture: GraphQL for queries, REST for mutations

export const marketplaceResolvers = {
  Query: {
    marketplaceUser: (_: unknown, args: { userId: number }) => fetchMarketplaceUserProfile(args.userId),
    marketplaceAddresses: async (_: unknown, args: { userId: number }) => ({
      success: true,
      addresses: await fetchMarketplaceAddresses(args.userId),
    }),
    mobileMarketplaceProducts: (_: unknown, args: Parameters<typeof fetchMarketplaceProducts>[0]) => fetchMarketplaceProducts(args),
    mobileCart: (_: unknown, args: { userId: number }) => fetchMobileCart(args.userId),
    mobileUserActivity: (_: unknown, args: Parameters<typeof fetchMobileUserActivity>[0]) => fetchMobileUserActivity(args),
    mobileOrders: (_: unknown, args: Parameters<typeof fetchMobileOrders>[0]) => fetchMobileOrders(args),
    mobileSearchHistory: (_: unknown, args: Parameters<typeof fetchMobileSearchHistory>[0]) => fetchMobileSearchHistory(args),
  },
  Mutation: {
    updateMarketplaceUser: (_: unknown, args: Parameters<typeof updateMarketplaceUser>[0]) => updateMarketplaceUser(args),
    createMarketplaceAddress: async (_: unknown, args: Parameters<typeof createMarketplaceAddress>[0]) => ({
      success: true,
      message: 'Address created',
      address: await createMarketplaceAddress(args),
    }),
    updateMarketplaceAddress: async (_: unknown, args: Parameters<typeof updateMarketplaceAddress>[0]) => ({
      success: true,
      message: 'Address updated',
      address: await updateMarketplaceAddress(args),
    }),
    deleteMarketplaceAddress: async (_: unknown, args: Parameters<typeof deleteMarketplaceAddress>[0]) => ({
      success: true,
      message: 'Address deleted',
      address: await deleteMarketplaceAddress(args),
    }),
    addToCart: (_: unknown, args: { input: Parameters<typeof addToCart>[0] }) => addToCart(args.input),
    updateCartItem: (_: unknown, args: { input: Parameters<typeof updateCartItem>[0] }) => updateCartItem(args.input),
    removeCartItem: (_: unknown, args: { cartItemId: number }) => removeCartItem(args.cartItemId),
    clearCart: (_: unknown, args: { userId: number }) => clearCart(args.userId),
    addUserActivity: (_: unknown, args: { input: Parameters<typeof addUserActivity>[0] }) => addUserActivity(args.input),
    deleteUserActivity: (_: unknown, args: Parameters<typeof deleteUserActivity>[0]) => deleteUserActivity(args),
    addSearchHistory: (_: unknown, args: Parameters<typeof addSearchHistory>[0]) => addSearchHistory(args),
    removeSearchHistory: (_: unknown, args: Parameters<typeof removeSearchHistory>[0]) => removeSearchHistory(args),
    clearSearchHistory: (_: unknown, args: Parameters<typeof clearSearchHistory>[0]) => clearSearchHistory(args),
  },
};
