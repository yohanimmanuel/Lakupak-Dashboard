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
import { getMeiliClient, MEILI_PRODUCTS_INDEX } from '@/lib/meili';
// Keep marketplace facets stable on productType.

/** Meili returns `[]` when there are no hits — that is truthy in JS, so never use `if (!ids)` alone. */
function hasMarketplaceSearchHitIds(ids: string[] | null | undefined): ids is string[] {
  return Array.isArray(ids) && ids.length > 0;
}

/** Only set when env is explicit — wrong defaults can 400 older Meilisearch (e.g. `locales`) and force pg_trgm. */
function parseMarketplaceMeiliMatchingStrategy(): 'last' | 'all' | 'frequency' | undefined {
  const raw = process.env.MARKETPLACE_MEILI_MATCHING_STRATEGY?.trim().toLowerCase();
  if (raw === 'last' || raw === 'all' || raw === 'frequency') return raw;
  return undefined;
}

/**
 * Query-time locales (Meili 1.8+). Default **none** — sending `locales` on unsupported servers breaks search silently.
 * Set `MARKETPLACE_MEILI_SEARCH_LOCALES=id,en` when your Meili version supports it.
 */
function parseMarketplaceMeiliSearchLocales(): string[] {
  const raw = process.env.MARKETPLACE_MEILI_SEARCH_LOCALES?.trim();
  if (!raw) return [];
  return raw.split(',').map((s) => s.trim()).filter(Boolean);
}

/** Meili returns `{}` or all-zero facet maps when `estimatedTotalHits` is 0 — still truthy, so pills sorted A–Z. */
function facetDistributionHasHits(m: Record<string, number> | null | undefined): boolean {
  if (!m || typeof m !== 'object') return false;
  return Object.values(m).some((n) => typeof n === 'number' && n > 0);
}

function normSearchTerm(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ');
}

function boundedEditDistance(aRaw: string, bRaw: string, maxDist: number): number {
  const a = normSearchTerm(aRaw);
  const b = normSearchTerm(bRaw);
  if (!a || !b) return maxDist + 1;
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > maxDist) return maxDist + 1;

  const m = a.length;
  const n = b.length;
  const prev = new Array(n + 1);
  const cur = new Array(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    cur[0] = i;
    let rowMin = cur[0];
    const ca = a.charCodeAt(i - 1);
    for (let j = 1; j <= n; j++) {
      const cost = ca === b.charCodeAt(j - 1) ? 0 : 1;
      const v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      cur[j] = v;
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > maxDist) return maxDist + 1;
    for (let j = 0; j <= n; j++) prev[j] = cur[j];
  }
  return prev[n];
}

function pickDidYouMeanCandidate(qNorm: string, candidates: Array<string | null | undefined>): string | null {
  const q = normSearchTerm(qNorm);
  if (!q) return null;
  const maxDist = q.length <= 8 ? 2 : q.length <= 14 ? 3 : 4;

  let best: { text: string; dist: number; len: number } | null = null;
  for (const cRaw of candidates) {
    const c = typeof cRaw === 'string' ? cRaw.trim() : '';
    if (!c) continue;
    const cNorm = normSearchTerm(c);
    if (!cNorm || cNorm === q) continue;
    // Basic typo-likeness: keep first char consistent for short queries
    if (q.length <= 10 && cNorm.charAt(0) !== q.charAt(0)) continue;
    const d = boundedEditDistance(q, cNorm, maxDist);
    if (d > maxDist) continue;
    const item = { text: c, dist: d, len: cNorm.length };
    if (!best) best = item;
    else if (item.dist < best.dist) best = item;
    else if (item.dist === best.dist && item.len > best.len) best = item;
  }
  return best ? best.text : null;
}

async function getMarketplaceSearchExpansions(
  prismaClient: typeof prisma,
  rawQuery: string,
  cap: number,
): Promise<string[]> {
  const q = normSearchTerm(rawQuery);
  if (!q) return [];

  const tokens = q.split(' ').filter(Boolean);
  const candidates = Array.from(new Set([q, ...tokens])).slice(0, 12);

  const rows = await (prismaClient as any).marketplaceSearchTermMap.findMany({
    where: {
      enabled: true,
      fromTerm: { in: candidates },
    },
    select: { toTerm: true },
  });

  const out: string[] = [];
  const seen = new Set<string>();
  for (const r of rows) {
    const t = normSearchTerm(r.toTerm);
    if (!t) continue;
    if (t === q) continue;
    if (seen.has(t)) continue;
    seen.add(t);
    out.push(t);
    if (out.length >= cap) break;
  }
  return out;
}

/**
 * Category pill counts aligned with pg_trgm product matching (no category chip filter — same idea as Meili facet pass).
 */
async function trgmFacetCountsByProductType(
  prismaClient: typeof prisma,
  q: string,
  extraTerms: string[],
  minScore: number,
): Promise<Record<string, number>> {
  try {
    const terms = [normSearchTerm(q), ...extraTerms.map(normSearchTerm)].filter(Boolean).slice(0, 6);
    if (terms.length === 0) return {};
    const rows = await prismaClient.$queryRaw<Array<{ productType: string; cnt: bigint }>>`
      SELECT
        trim(p."productType") AS "productType",
        COUNT(DISTINCT p."productId")::bigint AS "cnt"
      FROM "public"."Product" p
      CROSS JOIN LATERAL unnest(${terms}::text[]) AS t("term")
      WHERE p."marketplaceStatus" = 'Published'
        AND p."status" = 'Published'
        AND trim(COALESCE(p."productType", '')) <> ''
        AND GREATEST(
          similarity(lower(p."name"), t."term"),
          similarity(lower(COALESCE(p."brand", '')), t."term"),
          similarity(lower(COALESCE(p."productType", '')), t."term"),
          similarity(lower(COALESCE(p."description", '')), t."term")
        ) >= ${minScore}
      GROUP BY trim(p."productType")
    `;
    const m: Record<string, number> = {};
    for (const r of rows) {
      const k = r.productType != null ? String(r.productType).trim() : '';
      if (!k) continue;
      m[k] = typeof r.cnt === 'bigint' ? Number(r.cnt) : Number(r.cnt);
    }
    return m;
  } catch {
    return {};
  }
}

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
    salesChannel: String!
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
    selfPickup: ShippingOption!
    sellerDelivery: ShippingOption!
    buyerCourier: ShippingOption!
    leadTimeMinDays: Int
    leadTimeMaxDays: Int
  }

  type ShippingOption {
    available: Boolean!
    minDays: Int
    maxDays: Int
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
    facets: MarketplaceSearchFacets!
    didYouMean: String
    timestamp: String!
  }

  type MarketplaceFacetValue {
    value: String!
    count: Int!
  }

  type MarketplaceSearchFacets {
    productTypes: [MarketplaceFacetValue!]!
    productCategories: [MarketplaceFacetValue!]!
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
  let engineUsed: 'meili' | 'pg_trgm' | 'js_score' | 'prisma' | 'cache' = 'prisma';
  const meiliTimeoutMs = (() => {
    const raw = process.env.MEILI_SEARCH_TIMEOUT_MS;
    const n = raw ? Number(raw) : NaN;
    return Number.isFinite(n) && n > 0 ? n : 800;
  })();
  const fallbackTrigramMinScore = (() => {
    const raw = process.env.MARKETPLACE_SEARCH_FALLBACK_TRIGRAM_MIN_SCORE;
    const n = raw ? Number(raw) : NaN;
    // Trigram similarity is in [0,1]. 0.2 is a reasonable "typo-ish" threshold for short queries.
    return Number.isFinite(n) && n > 0 ? n : 0.2;
  })();
  
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
    if (search && search.trim()) engineUsed = 'cache';
    return {
      ...cachedResult,
      timestamp: new Date().toISOString()
    };
    }
  }
  
  // Try Meilisearch first for search queries (better relevance + typos + facets).
  // Fall back to Prisma when MEILI_HOST isn't set or Meili is unreachable.
  let meiliHitIds: string[] | null = null;
  let meiliTotalCount: number | null = null;
  let meiliFacetProductTypeCounts: Record<string, number> | null = null;
  let meiliTopHitName: string | null = null;
  let meiliTopHitBrand: string | null = null;
  let meiliTopHitSellerName: string | null = null;
  let meiliTopHitProductType: string | null = null;
  /** When pg_trgm serves results, pills use these counts so ordering matches the fuzzy match set (not empty Meili facets). */
  let trgmFacetProductTypeCounts: Record<string, number> | null = null;
  const queryExpansions =
    search && search.trim() ? await getMarketplaceSearchExpansions(prisma, search, 4).catch(() => []) : [];
  const searchTerms = search && search.trim() ? [search.trim(), ...queryExpansions] : [];
  if (search && search.trim()) {
    const client = getMeiliClient();
    if (client) {
      try {
        const index = client.index(MEILI_PRODUCTS_INDEX);
        const filterParts: string[] = [];
        if (category && category !== 'All') {
          filterParts.push(`productType = "${String(category).replace(/"/g, '\\"')}"`);
        }
        const filter = filterParts.length ? filterParts.join(' AND ') : undefined;
        const primaryQ = search.trim();
        const meiliMatchingStrategy = parseMarketplaceMeiliMatchingStrategy();
        const meiliLocales = parseMarketplaceMeiliSearchLocales();
        const meiliOptionalParams = {
          ...(meiliMatchingStrategy ? { matchingStrategy: meiliMatchingStrategy } : {}),
          ...(meiliLocales.length ? { locales: meiliLocales } : {}),
        };
        const meiliRace = <T>(p: Promise<T>) =>
          Promise.race([
            p,
            new Promise<never>((_, reject) =>
              setTimeout(() => reject(new Error(`Meili search timeout after ${meiliTimeoutMs}ms`)), meiliTimeoutMs),
            ),
          ]);
        const meiliSearchBase = {
          limit,
          offset: (page - 1) * limit,
          filter,
          facets: ['productType'],
        };
        // If optional params 400 on older Meilisearch, retry without them so Meili is used instead of silent pg fallback.
        const runMeili = async (q: string) => {
          try {
            return await meiliRace(index.search(q, { ...meiliSearchBase, ...meiliOptionalParams }));
          } catch (err) {
            const isBadRequest =
              err instanceof Error && (err.message.includes('400') || err.message.includes('Bad Request'));
            if (isBadRequest && Object.keys(meiliOptionalParams).length > 0) {
              return await meiliRace(index.search(q, meiliSearchBase));
            }
            throw err;
          }
        };

        const meiliResPrimary = await runMeili(primaryQ);
        const topHit = (meiliResPrimary.hits as any[])?.[0];
        meiliTopHitName = (() => {
          const nm = typeof topHit?.name === 'string' ? topHit.name.trim() : '';
          return nm ? nm : null;
        })();
        meiliTopHitBrand = (() => {
          const nm = typeof topHit?.brand === 'string' ? topHit.brand.trim() : '';
          return nm ? nm : null;
        })();
        meiliTopHitSellerName = (() => {
          const nm = typeof topHit?.companyName === 'string' ? topHit.companyName.trim() : '';
          return nm ? nm : null;
        })();
        meiliTopHitProductType = (() => {
          const nm = typeof topHit?.productType === 'string' ? topHit.productType.trim() : '';
          return nm ? nm : null;
        })();
        const extraQs = queryExpansions.slice(0, 2);
        const extraRes = await Promise.all(
          extraQs.map(async (q2) => {
            try {
              return await runMeili(q2);
            } catch {
              return null;
            }
          }),
        );

        const mergedIds: string[] = [];
        const seen = new Set<string>();
        const pushHits = (res: any) => {
          const ids = (res?.hits as Array<{ id?: string }> | undefined)?.map((h) => h.id).filter(Boolean) as
            | string[]
            | undefined;
          if (!ids) return;
          for (const id of ids) {
            if (seen.has(id)) continue;
            seen.add(id);
            mergedIds.push(id);
          }
        };
        pushHits(meiliResPrimary);
        for (const r of extraRes) pushHits(r);

        meiliHitIds = mergedIds;
        engineUsed = 'meili';
        meiliTotalCount =
          typeof meiliResPrimary.estimatedTotalHits === 'number' ? meiliResPrimary.estimatedTotalHits : meiliHitIds.length;

        // If a category filter is applied, `facetDistribution` will only reflect that filtered scope.
        // For Shopee-style "show all categories but rank relevant ones on top", fetch facets without the category filter.
        const meiliFacetBase = { limit: 0, offset: 0, facets: ['productType'] };
        let meiliResFacets = meiliResPrimary;
        if (category && category !== 'All') {
          try {
            try {
              meiliResFacets = await meiliRace(
                index.search(primaryQ, { ...meiliFacetBase, ...meiliOptionalParams }),
              );
            } catch {
              if (Object.keys(meiliOptionalParams).length > 0) {
                meiliResFacets = await meiliRace(index.search(primaryQ, meiliFacetBase));
              }
              // Keep meiliResHits-derived facets if facet-only query still fails — do not drop main Meili results.
            }
          } catch {
            meiliResFacets = meiliResPrimary;
          }
        }

        const facetDist = (meiliResFacets.facetDistribution ?? {}) as Record<string, Record<string, number> | undefined>;
        meiliFacetProductTypeCounts = facetDist.productType ?? {};
      } catch {
        // ignore and fall back
        meiliHitIds = null;
        meiliTotalCount = null;
        meiliFacetProductTypeCounts = null;
        engineUsed = 'prisma';
      }
    }
  }

  // Build where clause for published products only
  const whereClause: Record<string, unknown> = {
    marketplaceStatus: 'Published',
    status: 'Published'
  };

  // Search term = OR across searchable fields (Meili/pg_trgm handle relevance; Prisma path is substring match).
  if (search && search.trim()) {
    const ors: Record<string, unknown>[] = [];
    for (const t of (searchTerms.length ? searchTerms : [search.trim()]).slice(0, 5)) {
      ors.push({ name: { contains: t, mode: 'insensitive' } });
      ors.push({ description: { contains: t, mode: 'insensitive' } });
      ors.push({ brand: { contains: t, mode: 'insensitive' } });
      ors.push({ productType: { contains: t, mode: 'insensitive' } });
    }
    whereClause.OR = ors;
  }

  // For category pills during search, we want "all categories" ranked by relevance for this query,
  // so we compute facet counts from a where clause that does NOT include the selected category filter.
  const facetWhereClause: Record<string, unknown> = { ...whereClause };

  // Category filter = productType only (sales channel is a separate filter on client)
  if (category && category !== 'All') {
    whereClause.AND = [
      ...(Array.isArray(whereClause.AND) ? (whereClause.AND as Record<string, unknown>[]) : []),
      {
        OR: [
          { productType: category },
        ],
      },
    ];
  }
  
  const { page: safePage, limit: safeLimit } = sanitizePagination(page, limit);
  const skip = (safePage - 1) * safeLimit;
  const take = safeLimit;

  // If Meili is unavailable, errors, or returns **zero** hits, fall back to pg_trgm (then JS scorer).
  // Important: Meili uses `[]` for no hits — `[]` is truthy, so we must use length checks, not `if (!ids)`.
  if (!hasMarketplaceSearchHitIds(meiliHitIds) && search && search.trim()) {
    // 1) Try typo-ish fallback using Postgres pg_trgm similarity (if available).
    // Supabase typically supports enabling pg_trgm, but we must not hard-require it at runtime.
    // If the extension/functions aren't available, we fall back to the lightweight JS scorer below.
    try {
      const q = search.trim().toLowerCase();
      const terms = [normSearchTerm(q), ...queryExpansions.map(normSearchTerm)].filter(Boolean).slice(0, 6);
      const cat = category && category !== 'All' ? String(category) : null;

      const rows = await prisma.$queryRaw<Array<{ productId: string; score: number }>>`
        SELECT
          p."productId" as "productId",
          MAX(
            GREATEST(
              similarity(lower(p."name"), t."term"),
              similarity(lower(COALESCE(p."brand", '')), t."term"),
              similarity(lower(COALESCE(p."productType", '')), t."term"),
              similarity(lower(COALESCE(p."description", '')), t."term")
            )
          ) as "score"
        FROM "public"."Product" p
        CROSS JOIN LATERAL unnest(${terms}::text[]) AS t("term")
        WHERE p."marketplaceStatus" = 'Published'
          AND p."status" = 'Published'
          AND (${cat}::text IS NULL OR p."productType" = ${cat})
        GROUP BY p."productId", p."lastSyncAt", p."publishedAt"
        HAVING MAX(
          GREATEST(
            similarity(lower(p."name"), t."term"),
            similarity(lower(COALESCE(p."brand", '')), t."term"),
            similarity(lower(COALESCE(p."productType", '')), t."term"),
            similarity(lower(COALESCE(p."description", '')), t."term")
          )
        ) >= ${fallbackTrigramMinScore}
        ORDER BY "score" DESC, p."lastSyncAt" DESC NULLS LAST, p."publishedAt" DESC NULLS LAST
        LIMIT ${take} OFFSET ${skip}
      `;

      const countRows = await prisma.$queryRaw<Array<{ total: bigint }>>`
        SELECT COUNT(DISTINCT p."productId")::bigint as "total"
        FROM "public"."Product" p
        CROSS JOIN LATERAL unnest(${terms}::text[]) AS t("term")
        WHERE p."marketplaceStatus" = 'Published'
          AND p."status" = 'Published'
          AND (${cat}::text IS NULL OR p."productType" = ${cat})
          AND GREATEST(
            similarity(lower(p."name"), t."term"),
            similarity(lower(COALESCE(p."brand", '')), t."term"),
            similarity(lower(COALESCE(p."productType", '')), t."term"),
            similarity(lower(COALESCE(p."description", '')), t."term")
          ) >= ${fallbackTrigramMinScore}
      `;

      const ids = rows.map((r) => r.productId).filter(Boolean);
      if (ids.length > 0) {
        meiliHitIds = ids;
        engineUsed = 'pg_trgm';
        const total = countRows?.[0]?.total;
        meiliTotalCount = typeof total === 'bigint' ? Number(total) : Number(total ?? ids.length);
        trgmFacetProductTypeCounts = await trgmFacetCountsByProductType(prisma, q, queryExpansions, fallbackTrigramMinScore);
      }
    } catch {
      // ignore; extension might not be enabled
    }

    if (hasMarketplaceSearchHitIds(meiliHitIds)) {
      // Skip JS scorer if trigram fallback succeeded.
    } else {
    const q = search.trim().toLowerCase();
    const tokens = q.split(/\s+/g).filter(Boolean).slice(0, 8);
    const maxCandidates = Math.min(500, Math.max(80, safePage * safeLimit * 10));

    const candidates = await prisma.product.findMany({
      where: whereClause as any,
      select: {
        productId: true,
        name: true,
        description: true,
        brand: true,
        productType: true,
        lastSyncAt: true,
        publishedAt: true,
        user: { select: { company: { select: { name: true } } } },
      },
      take: maxCandidates,
      orderBy: [{ lastSyncAt: 'desc' }, { publishedAt: 'desc' }],
    });

    const scoreText = (haystack: string, w: number) => {
      let s = 0;
      if (!haystack) return 0;
      if (haystack.includes(q)) s += 10 * w;
      for (const t of tokens) {
        if (t.length >= 2 && haystack.includes(t)) s += 2 * w;
      }
      if (haystack.startsWith(q)) s += 6 * w;
      return s;
    };

    const scored = candidates
      .map((p) => {
        const name = String(p.name ?? '').toLowerCase();
        const brand = String(p.brand ?? '').toLowerCase();
        const type = String(p.productType ?? '').toLowerCase();
        const desc = String(p.description ?? '').toLowerCase();
        const seller = String(p.user?.company?.name ?? '').toLowerCase();
        const score =
          scoreText(name, 6) +
          scoreText(brand, 3) +
          scoreText(type, 3) +
          scoreText(seller, 2) +
          scoreText(desc, 1);
        return { id: p.productId, score };
      })
      .sort((a, b) => b.score - a.score)
      .filter((x) => x.score > 0);

    const orderedIds = scored.map((s) => s.id);
    meiliTotalCount = orderedIds.length;
    const pageIds = orderedIds.slice(skip, skip + take);
    meiliHitIds = pageIds.length ? pageIds : null;
    if (meiliHitIds) engineUsed = 'js_score';
    }
  }

  // Facets for "category pills"
  // - When searching: show ALL categories, rank relevant ones on top (Shopee-style).
  // - When not searching: keep it lightweight (top categories only).
  const facetProductTypes: Array<{ value: string; count: number }> = await (async () => {
    const isSearching = !!(search && search.trim());

    if (!isSearching) {
      return prisma.product
        .groupBy({
          by: ['productType'],
          where: whereClause,
          _count: { productType: true },
          orderBy: { _count: { productType: 'desc' } },
          take: 12,
        })
        .then((rows) =>
          rows
            .filter((r) => !!r.productType && String(r.productType).trim().length > 0)
            .map((r) => ({ value: String(r.productType), count: r._count.productType })),
        )
        .catch(() => []);
    }

    const allTypes = await prisma.product
      .findMany({
        where: { marketplaceStatus: 'Published', status: 'Published' },
        distinct: ['productType'],
        select: { productType: true },
      })
      .then((rows) =>
        rows
          .map((r) => (r.productType != null ? String(r.productType).trim() : ''))
          .filter((v) => v.length > 0),
      )
      .then((vals) => Array.from(new Set(vals)).sort((a, b) => a.localeCompare(b)))
      .catch(() => []);

    const counts =
      (facetDistributionHasHits(trgmFacetProductTypeCounts) ? trgmFacetProductTypeCounts : null) ??
      (facetDistributionHasHits(meiliFacetProductTypeCounts) ? meiliFacetProductTypeCounts : null) ??
      (await prisma.product
        .groupBy({
          by: ['productType'],
          where: facetWhereClause,
          _count: { productType: true },
        })
        .then((rows) => {
          const m: Record<string, number> = {};
          for (const r of rows) {
            const k = r.productType != null ? String(r.productType).trim() : '';
            if (k) m[k] = r._count.productType;
          }
          return m;
        })
        .catch(() => ({} as Record<string, number>)));

    return allTypes
      .map((value) => ({ value, count: counts[value] ?? 0 }))
      .sort((a, b) => (b.count - a.count) || a.value.localeCompare(b.value));
  })();
  
  // Get published products with user info, ordered by lastSyncAt to get most recent changes
  const productInclude = {
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
            pickupAddress: true,
            logo: true,
            bannerImage: true,
            defaultDeliveryLeadTimeMinDays: true,
            defaultDeliveryLeadTimeMaxDays: true,
          },
        },
      },
    },
  } as const;

  const products = hasMarketplaceSearchHitIds(meiliHitIds)
    ? (() => {
        return prisma.product
          .findMany({
            where: {
              productId: { in: meiliHitIds },
              marketplaceStatus: 'Published',
              status: 'Published',
            },
            include: productInclude,
          })
          .then((rows) => {
            const byId = new Map(rows.map((p) => [p.productId, p]));
            return meiliHitIds.map((id) => byId.get(id)).filter(Boolean) as typeof rows;
          });
      })()
    : prisma.product.findMany({
        where: whereClause,
        include: productInclude,
        skip,
        take,
        orderBy: [{ lastSyncAt: 'desc' }, { publishedAt: 'desc' }],
      });

  const resolvedProducts = await products;
  
  // Get active offers for all products
  const productIds = resolvedProducts.map((p) => p.productId);
  const userIds = [
    ...new Set(resolvedProducts.map((p) => p.userId).filter((id): id is number => id !== null)),
  ];
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
  const marketplaceProducts = await Promise.all(resolvedProducts.map(async (product) => {
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
    
    const totalStock = variantOptions.reduce((sum: number, vo) => sum + (vo.stockQuantity || 0), 0);
    const totalLowStockThreshold = variantOptions.reduce((max: number, vo) => Math.max(max, vo.lowStockThreshold || 0), 0);
    
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
      variantOptionsFormatted: variantOptions.map((vo) => ({
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
      // Keep "category" pills stable by using productType; don't inject merchandising labels here.
      productCategory: product.productType || 'Uncategorized',
      // Sales channel lives in the DB `productCategory` field (Retail / Wholesale / Both).
      salesChannel: product.productCategory || 'Retail',
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
      shipping: (() => {
        const c = product.user?.company;
        let prefs: string[] = [];
        if (c?.shippingPreferences) {
          try {
            prefs = JSON.parse(c.shippingPreferences) as string[];
          } catch {
            prefs = [];
          }
        }
        const num = (v: number | null | undefined) => (v != null && !Number.isNaN(Number(v)) ? Number(v) : null);
        return {
          preferences: prefs,
          selfPickup: {
            available: prefs.includes('Self Pickup'),
            minDays: null,
            maxDays: null,
          },
          sellerDelivery: {
            available: prefs.includes('Seller/Distributor Delivery'),
            minDays: num(c?.defaultDeliveryLeadTimeMinDays),
            maxDays: num(c?.defaultDeliveryLeadTimeMaxDays),
          },
          buyerCourier: {
            available: prefs.includes('Buyer-arranged Courier'),
            minDays: null,
            maxDays: null,
          },
          leadTimeMinDays: num(c?.defaultDeliveryLeadTimeMinDays),
          leadTimeMaxDays: num(c?.defaultDeliveryLeadTimeMaxDays),
        };
      })(),
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
  
  const totalCount = meiliTotalCount ?? (await prisma.product.count({ where: whereClause }));
  const pagination = buildPaginationInfo(page, limit, totalCount);

  let didYouMean: string | null = null;
  if (search && search.trim()) {
    const nodesCount = Array.isArray(marketplaceProducts) ? marketplaceProducts.length : 0;
    const qNorm = normSearchTerm(search);
    const allowNonZero =
      (() => {
        const raw = process.env.MARKETPLACE_DID_YOU_MEAN_MAX_RESULTS?.trim();
        const n = raw ? Number(raw) : NaN;
        // Default allows suggestions even when some results exist (typo tolerance can still return matches).
        return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 20;
      })();

    // If we can strongly infer a typo correction from the top hit, allow it even without query logs
    // and even when many results exist (Meili typo tolerance may still return a lot of hits).
    if (!didYouMean && qNorm.length >= 3 && nodesCount > 0) {
      // Company/distributor names are often longer/multi-word, so allow a slightly looser typo threshold.
      // We only use the single top hit to avoid noisy suggestions.
      if (meiliTopHitSellerName) {
        const maxDist = qNorm.length <= 10 ? 2 : 3;
        if (boundedEditDistance(qNorm, meiliTopHitSellerName, maxDist) <= maxDist) {
          didYouMean = meiliTopHitSellerName;
        }
      }

      // If top hit isn't from the intended distributor (common when query matches product fields),
      // try suggesting a distributor/company name directly from the DB (pg_trgm over Company.name).
      // This catches cases like "tanjung peson jaay" -> "cv. tanjung pesona jaya".
      if (!didYouMean) {
        try {
          const rows = await prisma.$queryRaw<Array<{ name: string; score: number }>>`
            SELECT
              c."name" AS "name",
              GREATEST(
                similarity(lower(c."name"), ${qNorm}),
                word_similarity(lower(c."name"), ${qNorm})
              ) AS "score"
            FROM "public"."Company" c
            WHERE EXISTS (
              SELECT 1
              FROM "public"."User" u
              JOIN "public"."Product" p ON p."userId" = u."id"
              WHERE u."companyId" = c."id"
                AND p."marketplaceStatus" = 'Published'
                AND p."status" = 'Published'
            )
              AND length(trim(c."name")) >= 3
            ORDER BY "score" DESC, c."updatedAt" DESC
            LIMIT 25
          `;
          const best = rows.find((r) => {
            const cand = normSearchTerm(r.name);
            if (!cand || cand === qNorm) return false;
            const score = Number(r.score);
            if (!Number.isFinite(score) || score < 0.55 || score > 0.92) return false;
            // Suppress plain completions.
            if (cand.startsWith(qNorm) && cand.length > qNorm.length) return false;
            if (qNorm.length <= 10 && cand.charAt(0) !== qNorm.charAt(0)) return false;
            return true;
          });
          if (best?.name) {
            didYouMean = best.name.trim();
          }
        } catch {
          // ignore
        }
      }

      if (!didYouMean) {
        const topCand = pickDidYouMeanCandidate(qNorm, [
          meiliTopHitName,
          meiliTopHitBrand,
          meiliTopHitProductType,
        ]);
        if (topCand) {
          const maxDist = qNorm.length <= 8 ? 1 : 2;
          if (boundedEditDistance(qNorm, topCand, maxDist) <= maxDist) {
            didYouMean = topCand;
          }
        }
      }
    }

    if (!didYouMean && qNorm.length >= 3 && nodesCount <= allowNonZero) {
      // Noise control:
      // - When results are non-zero, show only "typo-like" corrections (query-log similarity),
      //   NOT synonym/translation expansions (those would appear too often).
      // - When results are zero, allow term-map expansions first.
      if (nodesCount === 0 && queryExpansions.length > 0) {
        didYouMean = queryExpansions[0];
      } else {
        // 0) If we already have results, prefer suggesting the top hit name (works even without pg_trgm).
        if (!didYouMean && nodesCount > 0) {
          didYouMean = pickDidYouMeanCandidate(qNorm, [
            meiliTopHitName,
            meiliTopHitBrand,
            meiliTopHitSellerName,
            meiliTopHitProductType,
          ]);
        }

        // 1) Prefer suggesting actual product names (ground truth) via pg_trgm.
        try {
          const rows = await prisma.$queryRaw<Array<{ name: string; score: number }>>`
            SELECT
              p."name" AS "name",
              GREATEST(
                similarity(lower(p."name"), ${qNorm}),
                word_similarity(lower(p."name"), ${qNorm})
              ) AS "score"
            FROM "public"."Product" p
            WHERE p."marketplaceStatus" = 'Published'
              AND p."status" = 'Published'
              AND length(trim(p."name")) >= 3
            ORDER BY "score" DESC, p."lastSyncAt" DESC NULLS LAST, p."publishedAt" DESC NULLS LAST
            LIMIT 25
          `;
          const best = rows.find((r) => {
            const cand = normSearchTerm(r.name);
            if (!cand || cand === qNorm) return false;
            const score = Number(r.score);
            if (!Number.isFinite(score) || score < 0.42 || score > 0.92) return false;
            // Suppress plain completions: "shoe" -> "shoes"
            if (cand.startsWith(qNorm) && cand.length > qNorm.length) return false;
            if (nodesCount > 0) {
              // For non-zero results, only show very typo-like suggestions.
              if (score < 0.65) return false;
              if (cand.charAt(0) !== qNorm.charAt(0)) return false;
            }
            return true;
          });
          if (best?.name) {
            didYouMean = best.name.trim();
          }
        } catch {
          // ignore
        }

        // 2) Try pg_trgm suggestion from past search logs (best-effort; may not exist on some DBs).
        if (!didYouMean) try {
          const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
          const rows = await prisma.$queryRaw<
            Array<{ query: string; score: number; searches: bigint; zero: bigint; avgResults: number }>
          >`
            WITH agg AS (
              SELECT
                lower(trim("query")) AS "query",
                COUNT(*)::bigint AS "searches",
                SUM(CASE WHEN "resultCount" = 0 THEN 1 ELSE 0 END)::bigint AS "zero",
                AVG("resultCount")::float8 AS "avgResults",
                MAX("createdAt") AS "lastSeenAt"
              FROM "public"."MarketplaceSearchQueryLog"
              WHERE "createdAt" >= ${since}
              GROUP BY lower(trim("query"))
            )
            SELECT
              a."query" AS "query",
              GREATEST(
                similarity(a."query", ${qNorm}),
                word_similarity(a."query", ${qNorm})
              ) AS "score",
              a."searches" AS "searches",
              a."zero" AS "zero",
              a."avgResults" AS "avgResults"
            FROM agg a
            ORDER BY "score" DESC, a."lastSeenAt" DESC
            LIMIT 25
          `;
          const cur = rows.find((r) => normSearchTerm(r.query) === qNorm);
          const curSearches = Number(cur?.searches ?? 0);
          const curZero = Number(cur?.zero ?? 0);
          const curZeroRate = curSearches > 0 ? curZero / curSearches : 1;
          const curAvg = Number(cur?.avgResults ?? 0);
          const best = rows.find((r) => {
            const cand = normSearchTerm(r.query);
            if (!cand || cand === qNorm) return false;
            const score = Number(r.score);
            // Show only when it looks like a typo correction (not too weak, not near-identical).
            if (!Number.isFinite(score) || score < 0.42 || score > 0.92) return false;
            // Suppress plain completions: "shoe" -> "shoes"
            if (cand.startsWith(qNorm) && cand.length > qNorm.length) return false;
            // Prevent "reverse suggestions": if we already have results, don't suggest queries that historically return none.
            if (nodesCount > 0) {
              // If the current query already behaves well historically, don't suggest anything.
              if (Number.isFinite(curAvg) && curAvg >= 1 && curZeroRate <= 0.3) return false;
              // For non-zero results, only show very typo-like suggestions.
              if (score < 0.65) return false;
              if (cand.charAt(0) !== qNorm.charAt(0)) return false;

              const avg = Number(r.avgResults ?? 0);
              if (!Number.isFinite(avg) || avg < 1) return false;
              const searches = Number(r.searches ?? 0);
              const zero = Number(r.zero ?? 0);
              const zeroRate = searches > 0 ? zero / searches : 1;
              if (zeroRate > 0.6) return false;
            }
            return true;
          });
          if (best?.query) didYouMean = normSearchTerm(best.query);
        } catch {
          // ignore
        }
      }
    }
  }

  const result = {
    nodes: marketplaceProducts.filter(product => product !== null),
    pagination,
    facets: {
      productTypes: facetProductTypes,
      // Back-compat: mirror productTypes so the app never sees empty.
      productCategories: facetProductTypes,
    },
    didYouMean,
    timestamp: new Date().toISOString()
  };

  // Fire-and-forget search telemetry for building real synonyms from real user queries.
  if (search && search.trim()) {
    prisma.marketplaceSearchQueryLog
      .create({
        data: {
          marketplaceUserId: args.marketplaceUserId ?? null,
          query: search.trim(),
          category: category && category !== 'All' ? String(category) : null,
          page,
          limit,
          resultCount: Array.isArray(result.nodes) ? result.nodes.length : 0,
          engine: engineUsed,
        },
      })
      .catch(() => {});
  }
  
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

  const whereClause: Record<string, unknown> = { 
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
      // Use the DB unique constraint (userId, query) to make this concurrency-safe.
      // Instead of delete+create (which can race), upsert and "touch" updatedAt.
      const saved = await tx.searchHistory.upsert({
        where: { userId_query: { userId, query: trimmedQuery } },
        create: { userId, query: trimmedQuery },
        // Ensure re-searching bumps recency for ordering + cleanup.
        update: { updatedAt: new Date() },
      });

      // Enforce "max 10" per user. We keep the 10 most-recently updated rows.
      // (Updated rows float to the top when a query is re-used.)
      const overflow = await tx.searchHistory.findMany({
        where: { userId },
        orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
        skip: 10,
        select: { id: true },
      });
      if (overflow.length > 0) {
        await tx.searchHistory.deleteMany({
          where: { id: { in: overflow.map((r) => r.id) } },
        });
      }

      return saved;
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
    // Idempotent: avoids P2025 if the row was deleted concurrently.
    await prisma.searchHistory.deleteMany({
      where: { id: searchToDelete.id },
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
      },
      returnRequests: true
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
      orderItems: orderItems,
      returnRequests: (order.returnRequests ?? []).map((rr: { id: number; orderId: string; marketplaceUserId: number; reason: string; reasonDetail: string | null; imageUrls: string[]; status: string; createdAt: Date; updatedAt: Date }) => ({
        id: rr.id,
        orderId: rr.orderId,
        marketplaceUserId: rr.marketplaceUserId,
        reason: rr.reason,
        reasonDetail: rr.reasonDetail,
        imageUrls: rr.imageUrls ?? [],
        status: rr.status,
        createdAt: rr.createdAt?.toISOString() ?? null,
        updatedAt: rr.updatedAt?.toISOString() ?? null,
      })),
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
