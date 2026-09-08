import { type Prisma, type OfferDiscountType } from '@/lib/db';
import { parseNumberByCurrency } from '@/config/currencyConfig';
import {
  normalizeMerchandisingCategorySlug,
  normalizeSalesChannel,
} from '@/constants/merchandisingTaxonomy';
import { broadcastPriceUpdate, broadcastProductUpdate } from '@/utils/websocketBroadcast';
import { calculateSoldCounts, updateProductPricesFromOffers } from '@/utils/marketplaceMetrics';
import { NotificationService } from '../notifications';
import { prisma } from '../common/prisma';
import {
  MAX_PRODUCT_LIMIT,
  MAX_MARKETPLACE_LIMIT,
  sanitizePagination,
  buildPaginationInfo,
  isNumericId,
  parseMoney,
} from '../common/utils';
import { getTodayBoundaries } from '@/lib/dateUtils';
import {
  getCachedMarketplaceSearch,
  setCachedMarketplaceSearch,
  invalidateSearchCache,
} from '@/utils/searchCache';
import { buildBuyXGetYPromotionDetails } from '@/utils/promotionUtils';
import { auditCatalog } from '@/lib/audit';
import { requireDashboardUser, withDashboardAuth } from '@/app/api/graphql/modules/common/auth';

/** Best-effort extraction of a product business identifier from a resolver result. */
function extractProductId(result: unknown): string | undefined {
  if (result && typeof result === 'object') {
    const r = result as { productId?: unknown; id?: unknown };
    if (typeof r.productId === 'string') return r.productId;
    if (typeof r.id === 'number' || typeof r.id === 'string') return String(r.id);
  }
  return undefined;
}

// ============================================================================ //
// TYPE DEFS
// ============================================================================ //

export const productsTypeDefs = /* GraphQL */ `
  type SellerInfo {
    name: String
    companyName: String
    companyAddress: String
    companyPhone: String
    companyEmail: String
    shippingPreferences: String
    logo: String
    bannerImage: String
  }

  type ProductVariantOption {
    id: Int!
    variantName: String!
    sku: String
    purchasePrice: Float!
    sellingPrice: Float!
    originalSellingPrice: Float
    moq: Int
    stockQuantity: Int
    lowStockThreshold: Int
    stockStatus: String
    isDefault: Boolean!
    isActive: Boolean!
    attributes: JSONObject
  }

  type Product {
    id: Int!
    productId: String!
    sku: String!
    name: String!
    description: String!
    productType: String!
    brand: String!
    supplier: String!
    status: String!
    productCategory: String!
    merchandisingCategorySlug: String
    catalogName: String
    images: [String!]!
    halalCertified: Boolean
    bpomApproved: Boolean
    originalProduct: Boolean
    returnPolicyDays: Int
    stockQuantity: Int
    lowStockThreshold: Int
    stockStatus: String
    variantOptions: [ProductVariantOption!]!
    variantDefinitions: [JSONObject!]
    createdAt: String
    updatedAt: String
    userId: Int
    hasActiveOffer: Boolean
    offerBadge: String
    offerId: String
    offerName: String
    discountType: String
    discountValue: Float
    promotionDetails: JSONObject
    originalPrice: Float
    seller: SellerInfo
    soldCount: String!
  }

  type ProductConnection {
    nodes: [Product!]!
    pagination: PaginationInfo!
  }

  type MarketplaceProduct {
    id: Int!
    productId: String!
    name: String!
    description: String!
    category: String
    brand: String
    sellingPrice: Float!
    originalSellingPrice: Float!
    stockStatus: String
    images: [String!]!
    hasActiveOffer: Boolean
    offerBadge: String
    offerName: String
    discountType: String
    discountValue: Float
    promotionDetails: JSONObject
    seller: SellerInfo
    variantOptions: [ProductVariantOption!]!
    soldCount: String!
  }

  type MarketplaceProductConnection {
    nodes: [MarketplaceProduct!]!
    pagination: PaginationInfo!
  }

  type MarketplacePublishResult {
    success: Boolean!
    message: String!
    product: Product
  }

  type BulkMarketplacePublishResult {
    success: Boolean!
    message: String!
    successful: [String!]!
    failed: [String!]!
    results: [MarketplacePublishResult!]!
  }

  input VariantDefinitionInput {
    variantType: String!
    options: [String!]!
    position: Int!
  }

  input VariantOptionInput {
    variantName: String!
    attributes: JSONObject!
    sku: String
    purchasePrice: String!
    sellingPrice: String!
    originalSellingPrice: String
    moq: Int
    stockQuantity: Int!
    lowStockThreshold: Int!
    stockStatus: String!
    isDefault: Boolean!
    isActive: Boolean!
  }

  type DeleteProductResult {
    success: Boolean!
    deleted: Product
  }

  type ActionResult {
    success: Boolean!
    message: String!
  }

  type VariantOptionUsage {
    variantName: String!
    orderItemCount: Int!
    orderIds: [String!]!
  }

  extend type Query {
    products(
      userId: Int!
      page: Int = 1
      limit: Int = 50
      search: String
      status: String
      productType: String
    ): ProductConnection!

    product(userId: Int!, id: String!): Product

    variantOptionUsage(
      userId: Int!
      productId: String!
      variantNames: [String!]
      variantOptionIds: [Int!]
    ): [VariantOptionUsage!]!

    marketplaceProducts(
      page: Int = 1
      limit: Int = 20
      category: String
      search: String
    ): MarketplaceProductConnection!
  }

  extend type Mutation {
    createProduct(
      userId: Int!
      productId: String
      sku: String
      name: String!
      description: String!
      productType: String!
      brand: String!
      supplier: String!
      status: String
    productCategory: String!
    merchandisingCategorySlug: String
    catalogName: String
      images: [String!]
      halalCertified: Boolean
      bpomApproved: Boolean
      originalProduct: Boolean
      returnPolicyDays: Int
      currency: String
      variantDefinitions: [VariantDefinitionInput!]
      variantOptions: [VariantOptionInput!]
    ): Product!

    updateProduct(
      userId: Int!
      id: String
      productId: String
      sku: String
      name: String
      description: String
      productType: String
      brand: String
      supplier: String
      status: String
    productCategory: String
    merchandisingCategorySlug: String
    catalogName: String
      images: [String!]
      halalCertified: Boolean
      bpomApproved: Boolean
      originalProduct: Boolean
      returnPolicyDays: Int
      currency: String
      variantDefinitions: [VariantDefinitionInput!]
      variantOptions: [VariantOptionInput!]
    ): Product!

    deleteProduct(userId: Int!, id: String!): DeleteProductResult!

    resetOriginalPrices(userId: Int!): ActionResult!

    applyOffersToAllProducts(userId: Int!): ActionResult!

    forceUpdatePrices(userId: Int!): ActionResult!

    resetProductPrices(userId: Int!, productId: String!): ActionResult!

    publishMarketplaceProduct(userId: Int!, productId: String!, action: String!): MarketplacePublishResult!
    
    bulkPublishMarketplaceProducts(userId: Int!, productIds: [String!]!, action: String!): BulkMarketplacePublishResult!
  }
`;

// ============================================================================ //
// HELPERS
// ============================================================================ //

export const variantOptionSelect = {
  id: true,
  variantName: true,
  sku: true,
  purchasePrice: true,
  sellingPrice: true,
  originalSellingPrice: true,
  moq: true,
  stockQuantity: true,
  lowStockThreshold: true,
  stockStatus: true,
  isDefault: true,
  isActive: true,
  attributes: true,
} satisfies Prisma.VariantOptionSelect;

export const productSellerInclude = {
  include: {
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
            shippingPreferences: true,
            logo: true,
            bannerImage: true,
          },
        },
      },
    },
  },
};

const buildSellerInfo = (product: Prisma.ProductGetPayload<typeof productSellerInclude>) => {
  const user = product.user;
  if (!user) {
    return null;
  }
  return {
    name: [user.firstName, user.lastName].filter(Boolean).join(' ').trim() || null,
    companyName: user.company?.name ?? null,
    companyAddress: user.company?.businessAddress ?? null,
    companyPhone: user.company?.businessPhone ?? null,
    companyEmail: user.company?.businessEmail ?? null,
    shippingPreferences: user.company?.shippingPreferences ?? null,
    logo: user.company?.logo ?? null,
    bannerImage: user.company?.bannerImage ?? null,
  };
};

const mapVariantOption = (variantOption: Prisma.VariantOptionGetPayload<{ select: typeof variantOptionSelect }>) => ({
  id: variantOption.id,
  variantName: variantOption.variantName,
  sku: variantOption.sku ?? null,
  purchasePrice: parseMoney(variantOption.purchasePrice),
  sellingPrice: parseMoney(variantOption.sellingPrice),
  originalSellingPrice: variantOption.originalSellingPrice ? parseMoney(variantOption.originalSellingPrice) : null,
  moq: variantOption.moq ?? null,
  stockQuantity: variantOption.stockQuantity ?? 0,
  lowStockThreshold: variantOption.lowStockThreshold ?? 0,
  stockStatus: variantOption.stockStatus ?? 'In Stock',
  isDefault: variantOption.isDefault,
  isActive: variantOption.isActive,
  attributes: variantOption.attributes,
});

type ActiveOfferPayload = Prisma.OfferGetPayload<{
  include: {
    offerProducts: true;
    offerDiscountTypes: true;
  };
}>;

const buildOfferMetadata = (discountTypes: OfferDiscountType[]): {
  offerBadge: string;
  discountType?: string;
  discountValue?: number;
  promotionDetails?: Record<string, unknown> | null;
} => {
  if (!discountTypes.length) {
    return { offerBadge: 'Offer', promotionDetails: null };
  }

  const hasDiscount = discountTypes.some((dt) => dt.discountType === 'percentage' || dt.discountType === 'fixed');
  const hasPromotion = discountTypes.some((dt) => dt.discountType === 'buy_x_get_y');

  let offerBadge = 'Offer';
  if (hasDiscount && hasPromotion) {
    offerBadge = 'All Offers';
  } else if (hasPromotion) {
    offerBadge = 'Promotion';
  } else if (hasDiscount) {
    offerBadge = 'Discount';
  }

  const fixedDiscount = discountTypes.find((dt) => dt.discountType === 'fixed');
  const percentageDiscount = discountTypes.find((dt) => dt.discountType === 'percentage');
  const discountType = fixedDiscount ? 'fixed' : percentageDiscount ? 'percentage' : undefined;
  const discountValue = fixedDiscount
    ? fixedDiscount.discountValue
    : percentageDiscount
      ? percentageDiscount.discountValue
      : undefined;

  const discountValueNum = discountValue !== undefined
    ? parseMoney(discountValue as string | number | { toNumber?: () => number; toString?: () => string } | null | undefined)
    : undefined;

  const buyXGetY = discountTypes.find((dt) => dt.discountType === 'buy_x_get_y');

  const promotionDetails = buyXGetY
    ? (buildBuyXGetYPromotionDetails(buyXGetY) as unknown as Record<string, unknown>)
    : null;

  return {
    offerBadge,
    discountType,
    discountValue: discountValueNum,
    promotionDetails,
  };
};

export const fetchActiveOffersMap = async (
  productIds: string[],
  userScope?: number | number[],
): Promise<Map<string, ActiveOfferPayload[]>> => {
  if (!productIds.length) {
    return new Map();
  }

  const { startOfToday, endOfToday } = getTodayBoundaries(); // Uses Asia/Jakarta timezone by default
  const offerWhere: Prisma.OfferWhereInput = {
    status: 'active',
    offerProducts: {
      some: {
        productId: { in: productIds },
      },
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
  };

  if (typeof userScope === 'number') {
    offerWhere.userId = userScope;
  } else if (Array.isArray(userScope) && userScope.length > 0) {
    offerWhere.userId = { in: userScope };
  }

  const offers = await prisma.offer.findMany({
    where: offerWhere,
    include: {
      offerProducts: true,
      offerDiscountTypes: true,
    },
    orderBy: {
      createdAt: 'desc',
    },
  });

  const offerMap = new Map<string, ActiveOfferPayload[]>();

  for (const offer of offers) {
    const activeDiscountTypes = offer.offerDiscountTypes.filter((dt) => dt.isActive);
    if (!activeDiscountTypes.length) continue;

    for (const product of offer.offerProducts) {
      if (!offerMap.has(product.productId)) {
        offerMap.set(product.productId, []);
      }
      offerMap.get(product.productId)!.push({
        ...offer,
        offerDiscountTypes: activeDiscountTypes,
      });
    }
  }

  return offerMap;
};

export const mapProduct = (
  product: Prisma.ProductGetPayload<{
    include: {
      variantOptions: { select: typeof variantOptionSelect };
      variants: true;
      user: typeof productSellerInclude.include.user;
    };
  }>,
  offerMap: Map<string, ActiveOfferPayload[]>,
  soldCountMap?: Map<string, string>,
) => {
  const variantOptionRows = product.variantOptions ?? [];
  const variants = variantOptionRows.map(mapVariantOption);
  const offerCandidates = offerMap.get(product.productId) ?? [];
  const selectedOffer = offerCandidates[0];

  let offerMetadata: ReturnType<typeof buildOfferMetadata> | null = null;
  if (selectedOffer) {
    offerMetadata = buildOfferMetadata(selectedOffer.offerDiscountTypes);
  }

  return {
    id: product.id,
    productId: product.productId,
    sku: product.sku,
    name: product.name,
    description: product.description,
    productType: product.productType,
    brand: product.brand,
    supplier: product.supplier,
    status: product.status,
    productCategory: product.productCategory,
    merchandisingCategorySlug: (product as { merchandisingCategorySlug?: string | null }).merchandisingCategorySlug ?? null,
    catalogName: product.catalogName ?? null,
    images: product.images ?? [],
    halalCertified: product.halalCertified ?? null,
    bpomApproved: product.bpomApproved ?? null,
    originalProduct: product.originalProduct ?? null,
    returnPolicyDays: product.returnPolicyDays ?? null,
    stockQuantity: (product as { stockQuantity?: number }).stockQuantity ?? null,
    lowStockThreshold: (product as { lowStockThreshold?: number }).lowStockThreshold ?? null,
    stockStatus: (product as { stockStatus?: string }).stockStatus ?? null,
    variantOptions: variants,
    variantDefinitions: (product.variants as unknown[]) ?? [],
    createdAt: product.createdAt?.toISOString() ?? null,
    updatedAt: product.updatedAt?.toISOString() ?? null,
    userId: product.userId ?? null,
    hasActiveOffer: Boolean(selectedOffer),
    offerBadge: offerMetadata?.offerBadge ?? null,
    offerId: selectedOffer?.id ?? null,
    offerName: selectedOffer?.name ?? null,
    discountType: offerMetadata?.discountType ?? null,
    discountValue: offerMetadata?.discountValue ?? null,
    promotionDetails: offerMetadata?.promotionDetails ?? null,
    originalPrice: variantOptionRows[0]?.originalSellingPrice 
      ? parseMoney(variantOptionRows[0].originalSellingPrice) 
      : null, // Convert Decimal to number
    seller: buildSellerInfo(product as Prisma.ProductGetPayload<typeof productSellerInclude>) ?? null,
    soldCount: soldCountMap?.get(product.productId) ?? '0',
  };
};

// ============================================================================ //
// UTILITY FUNCTIONS
// ============================================================================ //

/**
 * Retry a function with exponential backoff
 * @param fn Function to retry
 * @param maxAttempts Maximum number of attempts (default: 3)
 * @param baseDelayMs Base delay in milliseconds for exponential backoff (default: 100)
 * @returns Result of the function
 * @throws Last error if all attempts fail
 */
async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxAttempts: number = 3,
  baseDelayMs: number = 100
): Promise<T> {
  let lastError: Error | unknown;
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      
      if (attempt === maxAttempts) {
        // Last attempt failed, throw the error
        throw error;
      }
      
      // Exponential backoff: 100ms, 200ms, 400ms, etc.
      const delay = baseDelayMs * Math.pow(2, attempt - 1);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  // TypeScript doesn't know we'll always throw, but this satisfies the type checker
  throw lastError;
}

// ============================================================================ //
// QUERIES
// ============================================================================ //

export const fetchProductsConnection = async (args: {
  userId: number;
  page?: number;
  limit?: number;
  search?: string | null;
  status?: string | null;
  productType?: string | null;
}) => {
  const { userId, page = 1, limit = 50, search, status, productType } = args;

  const { page: safePage, limit: safeLimit } = sanitizePagination(page, limit, MAX_PRODUCT_LIMIT);

  // Check cache first (only for first page without search to avoid stale data)
  if (safePage === 1 && !search) {
    const { getCachedProductList } = await import('@/lib/queryCache');
    const cached = await getCachedProductList<{
      nodes: unknown[];
      pagination: ReturnType<typeof buildPaginationInfo>;
    }>(userId, safePage, safeLimit, { status, productType });
    
    if (cached) {
      return cached;
    }
  }

  const whereClause: Prisma.ProductWhereInput = { userId };
  if (search) {
    whereClause.OR = [
      { name: { contains: search, mode: 'insensitive' } },
      { sku: { contains: search, mode: 'insensitive' } },
      { brand: { contains: search, mode: 'insensitive' } },
      { productType: { contains: search, mode: 'insensitive' } },
      { supplier: { contains: search, mode: 'insensitive' } },
    ];
  }

  if (status && status !== 'All') {
    whereClause.status = status;
  }

  if (productType && productType !== 'All Categories') {
    whereClause.productType = productType;
  }

  const [products, totalCount] = await Promise.all([
    prisma.product.findMany({
      where: whereClause,
      skip: (safePage - 1) * safeLimit,
      take: safeLimit,
      orderBy: { createdAt: 'desc' },
      include: {
        variantOptions: { select: variantOptionSelect },
        variants: true,
        user: productSellerInclude.include.user,
      },
    }),
    prisma.product.count({ where: whereClause }),
  ]);

  const productIds = products.map((product) => product.productId);
  const [offerMap, soldCountMap] = await Promise.all([
    fetchActiveOffersMap(productIds, userId),
    calculateSoldCounts(prisma, productIds),
  ]);

  const nodes = products.map((product) => mapProduct(product, offerMap, soldCountMap));

  const result = {
    nodes,
    pagination: buildPaginationInfo(safePage, safeLimit, totalCount),
  };

  // Cache the result (only first page without search)
  if (safePage === 1 && !search) {
    const { setCachedProductList } = await import('@/lib/queryCache');
    await setCachedProductList(userId, safePage, safeLimit, { status, productType }, result);
  }

  return result;
};

export const fetchSingleProduct = async (args: { userId: number; id: string }) => {
  const { userId, id } = args;
  const where: Prisma.ProductWhereInput = isNumericId(id) ? { id: Number(id), userId } : { productId: id, userId };

  const product = await prisma.product.findFirst({
    where,
    include: {
      variantOptions: { select: variantOptionSelect },
      variants: true,
      user: productSellerInclude.include.user,
    },
  });

  if (!product) {
    return null;
  }

  const [offerMap, soldCountMap] = await Promise.all([
    fetchActiveOffersMap([product.productId], userId),
    calculateSoldCounts(prisma, [product.productId]),
  ]);
  return mapProduct(product, offerMap, soldCountMap);
};

export const fetchMarketplaceProductsConnection = async (args: {
  page?: number;
  limit?: number;
  category?: string | null;
  search?: string | null;
}) => {
  const { page = 1, limit = 20, category, search } = args;
  
  // Check cache first
  const cachedResult = await getCachedMarketplaceSearch<{
    nodes: unknown[];
    pagination: ReturnType<typeof buildPaginationInfo>;
  }>({ search, category, page, limit });
  
  if (cachedResult) {
    return cachedResult;
  }

  const { page: safePage, limit: safeLimit } = sanitizePagination(page, limit, MAX_MARKETPLACE_LIMIT);

  const whereClause: Prisma.ProductWhereInput = {
    status: 'Published',
    marketplaceStatus: 'Published',
  };

  if (category && category !== 'All') {
    whereClause.productType = category;
  }

  if (search) {
    whereClause.OR = [
      { name: { contains: search, mode: 'insensitive' } },
      { description: { contains: search, mode: 'insensitive' } },
      { brand: { contains: search, mode: 'insensitive' } },
      { productType: { contains: search, mode: 'insensitive' } },
    ];
  }

  const [products, totalCount] = await Promise.all([
    prisma.product.findMany({
      where: whereClause,
      skip: (safePage - 1) * safeLimit,
      take: safeLimit,
      orderBy: [{ lastSyncAt: 'desc' }, { publishedAt: 'desc' }],
      include: {
        variantOptions: { select: variantOptionSelect },
        variants: true,
        user: productSellerInclude.include.user,
      },
    }),
    prisma.product.count({ where: whereClause }),
  ]);

  const productIds = products.map((product) => product.productId);
  const userIds = products.map((product) => product.userId).filter((id): id is number => typeof id === 'number');

  const [offerMap, soldCountMap] = await Promise.all([
    fetchActiveOffersMap(productIds, userIds),
    calculateSoldCounts(prisma, productIds),
  ]);

  const nodes = products
    .filter((product) => (product.variantOptions ?? []).length > 0)
    .map((product) => mapProduct(product, offerMap, soldCountMap));

  const result = {
    nodes,
    pagination: buildPaginationInfo(safePage, safeLimit, totalCount),
  };

  // Cache the result
  await setCachedMarketplaceSearch({ search, category, page, limit }, result);

  return result;
};

// ============================================================================ //
// MUTATIONS
// ============================================================================ //

const generateUniqueProductId = () => `PROD-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const buildProductData = ({
  productId,
  sku,
  name,
  description,
  productType,
  brand,
  supplier,
  status,
  productCategory,
  merchandisingCategorySlug,
  catalogName,
  images,
  halalCertified,
  bpomApproved,
  originalProduct,
  returnPolicyDays,
  userId,
}: {
  productId: string;
  sku?: string | null;
  name: string;
  description: string;
  productType: string;
  brand: string;
  supplier: string;
  status?: string | null;
  /** Sales channel: Retail / Wholesale / Both (stored in Product.productCategory). */
  productCategory: string;
  merchandisingCategorySlug?: string | null;
  catalogName?: string | null;
  images?: string[] | null;
  halalCertified?: boolean | null;
  bpomApproved?: boolean | null;
  originalProduct?: boolean | null;
  returnPolicyDays?: number | null;
  userId: number;
}) => {
  const finalStatus = status || 'Draft';
  const finalMarketplaceStatus = finalStatus === 'Published' ? 'Published' : 'Unpublished';

  return {
    productId,
    sku: sku || '',
    name: name.trim(),
    description: description.trim(),
    productType: productType.trim(),
    brand: brand.trim(),
    supplier: supplier.trim(),
    status: finalStatus,
    marketplaceStatus: finalMarketplaceStatus,
    productCategory: normalizeSalesChannel(productCategory),
    merchandisingCategorySlug: normalizeMerchandisingCategorySlug(merchandisingCategorySlug),
    catalogName: catalogName?.trim() || '',
    images: Array.isArray(images) ? images : [],
    halalCertified: halalCertified === true,
    bpomApproved: bpomApproved === true,
    originalProduct: originalProduct !== false,
    returnPolicyDays: returnPolicyDays !== undefined ? Number(returnPolicyDays) : 7,
    userId,
    ...(finalStatus === 'Published' && { publishedAt: new Date() }),
  };
};

// Shared variant identity helpers (single source of truth).
// A variant option's identity is its `attributes`; the display name is normalized so that
// whitespace differences in UI payloads never spawn duplicate rows.
const normalizeVariantName = (v: string): string => String(v ?? '').replace(/\s+/g, ' ').trim();

/** Expected VariantOption row count from variant type definitions (cartesian product of options). */
const expectedVariantOptionCount = (
  variantDefinitions: Array<{ options: string[] }> | null | undefined,
): number | null => {
  if (!variantDefinitions?.length) return null;

  let count = 1;
  for (const def of variantDefinitions) {
    const opts = Array.isArray(def.options)
      ? def.options.map((o) => String(o).trim()).filter(Boolean)
      : [];
    if (opts.length === 0) return null;
    count *= opts.length;
  }

  return count;
};

const stableStringifyAttributes = (v: unknown): string => {
  if (v === null || v === undefined) return '';
  if (typeof v !== 'object') return String(v);
  const obj = v as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return JSON.stringify(
    keys.reduce<Record<string, unknown>>((acc, k) => {
      acc[k] = obj[k];
      return acc;
    }, {}),
  );
};

const VARIANT_DECIMAL_MAX = 9_999_999_999.99;
const VARIANT_INT_MAX = 2_147_483_647;

const clampVariantDecimal = (value: number): number => {
  if (!Number.isFinite(value)) return 0;
  const rounded = Math.round(value * 100) / 100;
  return Math.min(Math.max(rounded, 0), VARIANT_DECIMAL_MAX);
};

const clampVariantInt = (value: number | null | undefined, fallback = 0): number => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(Math.trunc(parsed), 0), VARIANT_INT_MAX);
};

const createVariantOptionsPayload = (
  variantOptions: Array<{
    variantName: string;
    attributes: Record<string, string>;
    sku?: string | null;
    purchasePrice: string;
    sellingPrice: string;
    originalSellingPrice?: string | null;
    moq?: number | null;
    stockQuantity: number;
    lowStockThreshold: number;
    stockStatus: string;
    isDefault: boolean;
    isActive: boolean;
  }>,
  currency?: string | null,
) =>
  variantOptions.map((option) => {
    // Parse prices as numbers and round to 2 decimal places for Decimal precision
    const purchasePriceNum = parseNumberByCurrency(option.purchasePrice || '', currency ?? undefined);
    const sellingPriceNum = parseNumberByCurrency(option.sellingPrice || '', currency ?? undefined);
    const originalSellingPriceNum = option.originalSellingPrice && typeof option.originalSellingPrice === 'string'
      ? parseNumberByCurrency(option.originalSellingPrice, currency ?? undefined)
      : null;
    
    return {
      variantName: normalizeVariantName(option.variantName),
      attributes: option.attributes as Prisma.InputJsonValue,
      sku: option.sku || null,
      purchasePrice: clampVariantDecimal(purchasePriceNum),
      sellingPrice: clampVariantDecimal(sellingPriceNum),
      originalSellingPrice:
        originalSellingPriceNum !== null ? clampVariantDecimal(originalSellingPriceNum) : null,
      moq: option.moq == null ? null : clampVariantInt(option.moq, 0),
      stockQuantity: clampVariantInt(option.stockQuantity, 0),
      lowStockThreshold: clampVariantInt(option.lowStockThreshold, 0),
      stockStatus: option.stockStatus || 'In Stock',
      isDefault: option.isDefault || false,
      isActive: option.isActive !== false,
    };
  });

const broadcastProductChanges = async (productId?: string | null) => {
  if (!productId) return;
  try {
    await broadcastProductUpdate([productId]);
    await broadcastPriceUpdate([productId]);
  } catch {
    // ignore broadcast failures
  }
};

const refetchProductForResponse = async (productId: number) =>
  prisma.product.findUnique({
    where: { id: productId },
    include: {
      variantOptions: { select: variantOptionSelect },
      variants: true,
      user: productSellerInclude.include.user,
    },
  });

const mapProductWithOffers = async (product: Prisma.ProductGetPayload<{ include: typeof productSellerInclude.include }>) => {
  const [offerMap, soldCountMap] = await Promise.all([
    fetchActiveOffersMap([product.productId], product.userId ?? undefined),
    calculateSoldCounts(prisma, [product.productId]),
  ]);
  return mapProduct(product as never, offerMap, soldCountMap);
};

export const createProduct = async (args: {
  userId: number;
  productId?: string | null;
  sku?: string | null;
  name: string;
  description: string;
  productType: string;
  brand: string;
  supplier: string;
  status?: string | null;
  productCategory: string;
  merchandisingCategorySlug?: string | null;
  catalogName?: string | null;
  images?: string[] | null;
  halalCertified?: boolean | null;
  bpomApproved?: boolean | null;
  originalProduct?: boolean | null;
  returnPolicyDays?: number | null;
  currency?: string | null;
  variantDefinitions?: Array<{
    variantType: string;
    options: string[];
    position: number;
  }> | null;
  variantOptions?: Array<{
    variantName: string;
    attributes: Record<string, string>;
    sku?: string | null;
    purchasePrice: string;
    sellingPrice: string;
    originalSellingPrice?: string | null;
    moq?: number | null;
    stockQuantity: number;
    lowStockThreshold: number;
    stockStatus: string;
    isDefault: boolean;
    isActive: boolean;
  }> | null;
}) => {
  const {
    userId,
    productId,
    sku,
    name,
    description,
    productType,
    brand,
    supplier,
    status = 'Draft',
    productCategory,
    merchandisingCategorySlug,
    catalogName,
    images = [],
    halalCertified = false,
    bpomApproved = false,
    originalProduct = true,
    returnPolicyDays = 7,
    currency = 'IDR',
    variantDefinitions,
    variantOptions,
  } = args;

  let finalProductId = productId || generateUniqueProductId();
  const existingProduct = await prisma.product.findFirst({
    where: { productId: finalProductId, userId },
  });

  if (existingProduct) {
    finalProductId = generateUniqueProductId();
  }

  const productData = buildProductData({
    productId: finalProductId,
    sku,
    name,
    description,
    productType,
    brand,
    supplier,
    status,
    productCategory,
    merchandisingCategorySlug,
    catalogName,
    images,
    halalCertified,
    bpomApproved,
    originalProduct,
    returnPolicyDays,
    userId,
  });

  const product = await prisma.product.create({
    data: {
      ...productData,
      variants: variantDefinitions
        ? {
            create: variantDefinitions.map((def) => ({
              variantType: def.variantType,
              options: def.options,
              position: def.position,
            })),
          }
        : undefined,
      variantOptions: variantOptions
        ? {
            create: createVariantOptionsPayload(variantOptions, currency ?? undefined),
          }
        : undefined,
    },
    include: {
      variantOptions: { select: variantOptionSelect },
      variants: true,
      user: productSellerInclude.include.user,
    },
  });

  // Update prices for THIS product only - await to ensure fresh prices in response
  // This ensures the returned product includes offer-derived prices
  // Use retry logic to handle transient failures
  try {
    await retryWithBackoff(
      () => updateProductPricesFromOffers(prisma, userId, [product.productId]),
      3, // 3 attempts
      100 // 100ms base delay (100ms, 200ms, 400ms)
    );
    
    // Invalidate caches after successful price update (before refetch)
    const { invalidateProductCache, invalidateDashboardCache } = await import('@/lib/queryCache');
    await Promise.all([
      invalidateProductCache(userId),
      invalidateDashboardCache(userId),
    ]);
  } catch (error) {
    // Log detailed error information for monitoring/debugging
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;
    console.error('[Product] Price update failed after retries:', {
      userId,
      productId: product.productId,
      error: errorMessage,
      stack: errorStack,
      timestamp: new Date().toISOString(),
    });
    // Continue even if price update fails - product was still created
    // The product will be returned with original prices (no offer discounts applied)
  }

  // Refetch product after price update to get fresh data with offer-derived prices
  const updatedProduct = await refetchProductForResponse(product.id);
  if (!updatedProduct) {
    throw new Error('Failed to fetch created product');
  }

  // Check stock levels and trigger inventory notifications for newly created products
  if (updatedProduct.variantOptions && updatedProduct.variantOptions.length > 0) {
    for (const variant of updatedProduct.variantOptions) {
      const stockQuantity = variant.stockQuantity || 0;
      const lowStockThreshold = variant.lowStockThreshold || 0;
      
      // Notify if product is created with low/critical/out of stock
      if (stockQuantity === 0 || (lowStockThreshold > 0 && stockQuantity <= lowStockThreshold)) {
        try {
          await NotificationService.createInventoryNotification(
            userId,
            updatedProduct.productId,
            updatedProduct.name,
            stockQuantity,
            lowStockThreshold,
            variant.variantName || undefined
          );
        } catch (notifError) {
          // Don't fail product creation if notification fails
          if (process.env.NODE_ENV === 'development') {
            console.warn('[Products] Stock notification failed on create:', notifError);
          }
        }
      }
    }
  }

  await broadcastProductChanges(updatedProduct.productId);
  
  // Invalidate marketplace search cache (public-facing, needs caching)
  try {
    await invalidateSearchCache('search-cache:marketplace:*');
  } catch {
    // ignore cache invalidation failures
  }
  
  // Invalidate product cache again after broadcast to ensure fresh data on next query
  try {
    const { invalidateProductCache } = await import('@/lib/queryCache');
    await invalidateProductCache(userId);
  } catch {
    // ignore cache invalidation failures
  }
  
  return mapProductWithOffers(updatedProduct);
};

export const updateProduct = async (args: {
  userId: number;
  id?: string | null;
  productId?: string | null;
  sku?: string | null;
  name?: string | null;
  description?: string | null;
  productType?: string | null;
  brand?: string | null;
  supplier?: string | null;
  status?: string | null;
  productCategory?: string | null;
  merchandisingCategorySlug?: string | null;
  catalogName?: string | null;
  images?: string[] | null;
  halalCertified?: boolean | null;
  bpomApproved?: boolean | null;
  originalProduct?: boolean | null;
  returnPolicyDays?: number | null;
  currency?: string | null;
  variantDefinitions?: Array<{
    variantType: string;
    options: string[];
    position: number;
  }> | null;
  variantOptions?: Array<{
    variantName: string;
    attributes: Record<string, string>;
    sku?: string | null;
    purchasePrice: string;
    sellingPrice: string;
    originalSellingPrice?: string | null;
    moq?: number | null;
    stockQuantity: number;
    lowStockThreshold: number;
    stockStatus: string;
    isDefault: boolean;
    isActive: boolean;
  }> | null;
}) => {
  const {
    userId,
    id,
    productId,
    sku,
    name,
    description,
    productType,
    brand,
    supplier,
    status,
    productCategory,
    merchandisingCategorySlug,
    catalogName,
    images,
    halalCertified,
    bpomApproved,
    originalProduct,
    returnPolicyDays,
    currency = 'IDR',
    variantDefinitions,
    variantOptions,
  } = args;

  const where = id
    ? isNumericId(id)
      ? { id: Number(id), userId }
      : { productId: id, userId }
    : productId
      ? { productId, userId }
      : null;

  if (!where) {
    throw new Error('Missing id or productId parameter');
  }

  // Fetch product with variants before update to track previous stock levels
  const productBeforeUpdate = await prisma.product.findFirst({
    where,
    include: {
      variantOptions: {
        select: {
          id: true,
          variantName: true,
          stockQuantity: true,
          lowStockThreshold: true,
        },
      },
    },
  });

  if (!productBeforeUpdate) {
    throw new Error('Product not found or you do not have permission to update it');
  }

  // Use the actual product ID for the update (to match unique constraint)
  const updateWhere = isNumericId(id || '')
    ? { id: productBeforeUpdate.id }
    : { productId: productBeforeUpdate.productId };

  const cleanUpdateData: Record<string, unknown> = {};

  if (sku !== undefined) cleanUpdateData.sku = String(sku);
  if (name !== undefined) cleanUpdateData.name = String(name);
  if (description !== undefined) cleanUpdateData.description = String(description);
  if (productType !== undefined) cleanUpdateData.productType = String(productType);
  if (brand !== undefined) cleanUpdateData.brand = String(brand);
  if (supplier !== undefined) cleanUpdateData.supplier = String(supplier);
  if (status !== undefined) {
    const newStatus = String(status);
    cleanUpdateData.status = newStatus;
    // Update marketplaceStatus based on status change
    if (newStatus === 'Published') {
      cleanUpdateData.marketplaceStatus = 'Published';
      cleanUpdateData.publishedAt = new Date();
      cleanUpdateData.lastSyncAt = new Date(); // Update sync time for marketplace visibility
    } else {
      // For any non-Published status (Draft, Inactive, etc.), set marketplaceStatus to Unpublished
      cleanUpdateData.marketplaceStatus = 'Unpublished';
      cleanUpdateData.lastSyncAt = new Date(); // Update sync time when status changes
    }
  }
  if (productCategory !== undefined) {
    cleanUpdateData.productCategory = normalizeSalesChannel(String(productCategory));
  }
  if (merchandisingCategorySlug !== undefined) {
    cleanUpdateData.merchandisingCategorySlug = normalizeMerchandisingCategorySlug(
      String(merchandisingCategorySlug),
    );
  }
  if (catalogName !== undefined) cleanUpdateData.catalogName = String(catalogName);
  if (images !== undefined) cleanUpdateData.images = Array.isArray(images) ? images : [];
  if (halalCertified !== undefined) cleanUpdateData.halalCertified = Boolean(halalCertified);
  if (bpomApproved !== undefined) cleanUpdateData.bpomApproved = Boolean(bpomApproved);
  if (originalProduct !== undefined) cleanUpdateData.originalProduct = Boolean(originalProduct);
  if (returnPolicyDays !== undefined) cleanUpdateData.returnPolicyDays = Number(returnPolicyDays);

  const product = await prisma.$transaction(async (tx) => {
    const updated = await tx.product.update({
      where: updateWhere,
      data: {
        ...cleanUpdateData,
      },
      include: {
        variants: true,
        user: productSellerInclude.include.user,
      },
    });

    // Single source of truth for "what is locked by past orders" — reused by every guardrail below
    // (variant-type immutability, variant-option immutability, and delete-vs-deactivate).
    // `hasAnyOrderHistory` is product-level (covers legacy orders without a variantOptionId);
    // `orderedOptionIds` pinpoints exactly which VariantOptions are immutable.
    const [orderItemCount, orderedOptions] = await Promise.all([
      tx.orderItem.count({ where: { productId: productBeforeUpdate.productId } }),
      tx.variantOption.findMany({
        where: { productId: updated.id, orderItems: { some: {} } },
        select: { id: true, attributes: true },
      }),
    ]);
    const orderedOptionIds = new Set(orderedOptions.map((o) => o.id));
    const hasAnyOrderHistory = orderItemCount > 0;

    // Business rule (orders tied): variant TYPES cannot be deleted, but their option lists stay editable.
    // - No order history  -> full replace (free editing), including clearing when payload is [].
    // - Has order history -> never delete a type; option values follow the incoming payload, while any
    //   value locked by a past order is force-kept. Distributors may rename/add/remove non-ordered options.
    if (variantDefinitions !== undefined && variantDefinitions !== null && Array.isArray(variantDefinitions)) {
      if (hasAnyOrderHistory && variantDefinitions.length === 0) {
        throw new Error(
          'Cannot clear variant definitions for a product with order history.',
        );
      }

      if (!hasAnyOrderHistory) {
        await tx.productVariant.deleteMany({ where: { productId: updated.id } });
        if (variantDefinitions.length > 0) {
          await tx.productVariant.createMany({
            data: variantDefinitions.map((def) => ({
              productId: updated.id,
              variantType: def.variantType,
              options: def.options,
              position: def.position,
            })),
          });
        }
      } else if (variantDefinitions.length > 0) {
        const existingDefs = await tx.productVariant.findMany({
          where: { productId: updated.id },
          select: { id: true, variantType: true, options: true, position: true },
        });
        const existingByType = new Map(existingDefs.map((d) => [d.variantType, d]));

        // Compute the option values that are "locked" by order history per variant type.
        // Only values tied to an ordered VariantOption must survive; everything else follows
        // the incoming payload so removed options (e.g. a deleted color) disappear from the marketplace.
        const lockedValuesByType = new Map<string, Set<string>>();
        for (const vo of orderedOptions) {
          const attrs =
            vo.attributes && typeof vo.attributes === 'object'
              ? (vo.attributes as Record<string, unknown>)
              : {};
          for (const [type, val] of Object.entries(attrs)) {
            if (val === null || val === undefined) continue;
            if (!lockedValuesByType.has(type)) lockedValuesByType.set(type, new Set());
            lockedValuesByType.get(type)!.add(String(val));
          }
        }

        // Only upsert by variantType; never delete existing variant types when order history exists.
        for (const def of variantDefinitions) {
          const existing = existingByType.get(def.variantType);
          // Options follow the incoming payload, plus any value locked by an existing order.
          const nextOpts = Array.isArray(def.options) ? def.options.map((o) => String(o)) : [];
          const lockedForType = lockedValuesByType.get(def.variantType) ?? new Set<string>();
          const merged = Array.from(new Set([...nextOpts, ...lockedForType]));

          if (!existing) {
            await tx.productVariant.create({
              data: {
                productId: updated.id,
                variantType: def.variantType,
                options: merged,
                position: def.position,
              },
            });
            continue;
          }

          await tx.productVariant.update({
            where: { id: existing.id },
            data: {
              options: merged,
              position: def.position,
            },
          });
        }
      }
    }

    // IMPORTANT: preserve VariantOption ids so pending OrderItems keep their `variantOptionId`.
    // We upsert by the DB-unique key (productId, variantName) and delete only removed options.
    // Empty array is intentional: clear/deactivate all options not locked by orders.
    if (variantOptions !== undefined && variantOptions !== null && Array.isArray(variantOptions)) {
      const payload = createVariantOptionsPayload(variantOptions, currency ?? undefined);
      const keepNames = payload.map((p) => p.variantName);

      // Map existing VariantOptions by variantName so we can apply guardrails.
      const existingVariantOptions = await tx.variantOption.findMany({
        where: { productId: updated.id },
        select: {
          id: true,
          variantName: true,
          attributes: true,
          sku: true,
        },
      });

      const existingByName = new Map(
        existingVariantOptions.map((vo) => [normalizeVariantName(vo.variantName), vo]),
      );
      const existingByAttrs = new Map(
        existingVariantOptions.map((vo) => [stableStringifyAttributes(vo.attributes), vo]),
      );

      // Upsert sequentially so we can recover from rare DB sequence drift safely.
      for (const raw of payload) {
        const normalizedName = normalizeVariantName(raw.variantName);
        const attrsKey = stableStringifyAttributes(raw.attributes);
        const matchedByAttrs = attrsKey ? existingByAttrs.get(attrsKey) ?? null : null;
        const existing = matchedByAttrs || existingByName.get(normalizedName) || null;

        // If we matched an existing option by attributes, keep its original name to prevent duplicates.
        const p = existing ? { ...raw, variantName: normalizeVariantName(existing.variantName) } : { ...raw, variantName: normalizedName };

        // If this VariantOption has ever been ordered, block any identity mutation to preserve integrity.
        const hasOrderHistory = existing ? orderedOptionIds.has(existing.id) : false;

        if (hasOrderHistory && existing) {
          const nextAttrs = p.attributes ?? null;
          const prevAttrs = existing.attributes ?? null;
          const attrsChanged = JSON.stringify(prevAttrs) !== JSON.stringify(nextAttrs);
          if (attrsChanged) {
            throw new Error(`This variant is used in past orders. Create a new variant to continue selling.`);
          }
        }

        const doUpsert = async () =>
          tx.variantOption.upsert({
            where: {
              productId_variantName: {
                productId: updated.id,
                variantName: p.variantName,
              },
            },
            update: { ...p },
            create: { ...p, productId: updated.id },
          });

        try {
          await doUpsert();
        } catch (err) {
          // If the VariantOption id sequence drifts behind max(id), Postgres can throw a unique violation on (id).
          // Repair the sequence and retry once.
          const msg = err instanceof Error ? err.message : String(err);
          const isIdUniqueViolation =
            msg.includes('Unique constraint failed') && (msg.includes('(`id`)') || msg.includes('fields: (`id`)'));
          if (!isIdUniqueViolation) throw err;

          await tx.$executeRaw`
            SELECT setval(
              pg_get_serial_sequence('"VariantOption"', 'id'),
              COALESCE((SELECT MAX(id) FROM "VariantOption"), 1)
            )
          `;
          await doUpsert();
        }
      }

      // Guardrail: do not delete VariantOptions referenced by orders. Deactivate instead.
      // Also skip pruning when the payload does not cover the full variant matrix — an incomplete
      // list (e.g. user edited variant types but did not refresh the variation table) must not wipe DB rows.
      // Exception: empty payload with empty/cleared definitions is an intentional clear.
      const expectedOptionCount = expectedVariantOptionCount(variantDefinitions);
      const intentionalClear =
        payload.length === 0 &&
        (variantDefinitions === undefined ||
          variantDefinitions === null ||
          (Array.isArray(variantDefinitions) && variantDefinitions.length === 0));
      const payloadCoversVariantMatrix =
        intentionalClear ||
        (expectedOptionCount != null && payload.length >= expectedOptionCount);

      if (payloadCoversVariantMatrix) {
        const removed = await tx.variantOption.findMany({
          where:
            keepNames.length > 0
              ? { productId: updated.id, variantName: { notIn: keepNames } }
              : { productId: updated.id },
          select: { id: true, variantName: true },
        });

        const deactivateIds = removed.filter((vo) => orderedOptionIds.has(vo.id)).map((vo) => vo.id);
        const removableIds = removed.filter((vo) => !orderedOptionIds.has(vo.id)).map((vo) => vo.id);

        // Options tied to past orders are deactivated (kept for history); the rest are deleted.
        if (deactivateIds.length > 0) {
          await tx.variantOption.updateMany({
            where: { id: { in: deactivateIds } },
            data: { isActive: false },
          });
        }

        if (removableIds.length > 0) {
          await tx.variantOption.deleteMany({
            where: {
              id: { in: removableIds },
            },
          });
        }
      }
    }

    return updated;
  });

  // Keep Meilisearch 1:1 with DB for marketplace-published products.
  // If Meili is unavailable, the marketplace resolver will fall back to DB search.
  try {
    const { upsertMarketplaceProductToMeili, deleteMarketplaceProductFromMeili } = await import(
      '@/lib/meiliMarketplaceSync'
    );
    if (product.marketplaceStatus === 'Published' && product.status === 'Published') {
      await upsertMarketplaceProductToMeili(product.productId);
    } else {
      await deleteMarketplaceProductFromMeili(product.productId);
    }
  } catch (e) {
    console.warn('[Products] Meili sync failed on updateProduct:', e);
  }

  // Update prices for THIS product only - await to ensure fresh prices in response
  // This ensures the returned product includes offer-derived prices
  // Use retry logic to handle transient failures
  try {
    await retryWithBackoff(
      () => updateProductPricesFromOffers(prisma, userId, [product.productId]),
      3, // 3 attempts
      100 // 100ms base delay (100ms, 200ms, 400ms)
    );
    
    // Invalidate caches after successful price update (before refetch)
    const { invalidateProductCache, invalidateDashboardCache } = await import('@/lib/queryCache');
    await Promise.all([
      invalidateProductCache(userId),
      invalidateDashboardCache(userId),
    ]);
  } catch (error) {
    // Log detailed error information for monitoring/debugging
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;
    console.error('[Product] Price update failed after retries:', {
      userId,
      productId: product.productId,
      error: errorMessage,
      stack: errorStack,
      timestamp: new Date().toISOString(),
    });
    // Continue even if price update fails - product was still updated
    // The product will be returned with original prices (no offer discounts applied)
  }

  // Refetch product after price update to get fresh data with offer-derived prices
  const updatedProduct = await refetchProductForResponse(product.id);
  if (!updatedProduct) {
    throw new Error('Failed to fetch updated product');
  }

  // Check stock levels and trigger inventory notifications if thresholds crossed
  if (productBeforeUpdate && variantOptions && updatedProduct.variantOptions) {
    const previousVariants = productBeforeUpdate.variantOptions || [];
    const newVariants = updatedProduct.variantOptions || [];

    for (const newVariant of newVariants) {
      // Find matching previous variant by variantName (since IDs change on deleteMany/create)
      const previousVariant = previousVariants.find(
        (pv) => pv.variantName === newVariant.variantName
      );

      const newStock = newVariant.stockQuantity || 0;
      const lowStockThreshold = newVariant.lowStockThreshold || 0;

      if (previousVariant) {
        const previousStock = previousVariant.stockQuantity || 0;

        // Check if stock changed and crossed a threshold
        if (previousStock !== newStock) {
          try {
            await NotificationService.checkAndNotifyStockLevel(
              userId,
              updatedProduct.productId,
              updatedProduct.name,
              previousStock,
              newStock,
              lowStockThreshold,
              newVariant.variantName || undefined,
              newVariant.id,
            );
          } catch (notifError) {
            // Don't fail product update if notification fails
            if (process.env.NODE_ENV === 'development') {
              console.warn('[Products] Stock notification failed:', notifError);
            }
          }
        }
        // If stock didn't change, don't send notification (prevents duplicates)
      } else {
        // New variant - check if it starts at low/critical/out of stock
        if (newStock === 0 || (lowStockThreshold > 0 && newStock <= lowStockThreshold)) {
          try {
            await NotificationService.createInventoryNotification(
              userId,
              updatedProduct.productId,
              updatedProduct.name,
              newStock,
              lowStockThreshold,
              newVariant.variantName || undefined
            );
          } catch (notifError) {
            // Don't fail product update if notification fails
            if (process.env.NODE_ENV === 'development') {
              console.warn('[Products] Stock notification failed:', notifError);
            }
          }
        }
      }
    }
  }

  await broadcastProductChanges(updatedProduct.productId);
  
  // Invalidate marketplace search cache (public-facing, needs caching)
  await invalidateSearchCache('search-cache:marketplace:*');
  
  // Invalidate product cache again after broadcast to ensure fresh data on next query
  try {
    const { invalidateProductCache } = await import('@/lib/queryCache');
    await invalidateProductCache(userId);
  } catch {
    // ignore cache invalidation failures
  }
  
  return mapProductWithOffers(updatedProduct);
};

export const deleteProduct = async (args: { userId: number; id: string }) => {
  const { userId, id } = args;

  const where = isNumericId(id) ? { id: Number(id), userId } : { productId: id, userId };

  const productToDelete = await prisma.product.findFirst({
    where,
    include: {
      variantOptions: { select: variantOptionSelect },
      variants: true,
      user: productSellerInclude.include.user,
    },
  });

  if (!productToDelete) {
    throw new Error('Product not found or you do not have permission to delete it');
  }

  const [offerMap, soldCountMap] = await Promise.all([
    fetchActiveOffersMap([productToDelete.productId], userId),
    calculateSoldCounts(prisma, [productToDelete.productId]),
  ]);
  const mappedProduct = mapProduct(productToDelete, offerMap, soldCountMap);

  await prisma.product.delete({
    where: isNumericId(id) ? { id: Number(id) } : { productId: id },
  });

  // Broadcast changes for marketplace (products affect public marketplace)
  try {
    await broadcastProductChanges(productToDelete.productId);
  } catch {
    // ignore broadcast failures
  }

  // Invalidate product cache to ensure fresh data on next query
  try {
    const { invalidateProductCache } = await import('@/lib/queryCache');
    await invalidateProductCache(userId);
  } catch {
    // ignore cache invalidation failures
  }

  return {
    success: true,
    deleted: mappedProduct,
  };
};

export const resetOriginalPrices = async (userId: number) => {
  try {
    const variantOptionsWithNullOriginalPrice = await prisma.variantOption.findMany({
      where: {
        originalSellingPrice: null,
        product: {
          userId,
        },
      },
    });

    const variantOptionUpdatePromises = variantOptionsWithNullOriginalPrice.map((variantOption) =>
      prisma.variantOption.update({
        where: { id: variantOption.id },
        data: {
          originalSellingPrice: variantOption.sellingPrice,
        },
      }),
    );

    // Execute updates in chunks to avoid connection pool exhaustion
    const CONCURRENT_LIMIT = 20; // Increased from 15 with larger pool (30 connections)
    for (let i = 0; i < variantOptionUpdatePromises.length; i += CONCURRENT_LIMIT) {
      const chunk = variantOptionUpdatePromises.slice(i, i + CONCURRENT_LIMIT);
      await Promise.all(chunk);
    }

    return {
      success: true,
      message: `Reset originalSellingPrice for ${variantOptionsWithNullOriginalPrice.length} variant options`,
    };
  } catch {
    throw new Error('Failed to reset original prices');
  }
};

export const applyOffersToAllProducts = async (userId: number) => {
  try {
    await updateProductPricesFromOffers(prisma, userId);
    return {
      success: true,
      message: 'Applied offers to all products successfully',
    };
  } catch {
    throw new Error('Failed to apply offers to all products');
  }
};

export const forceUpdatePrices = async (userId: number) => {
  try {
    await prisma.$transaction(async (tx) => {
      const productsWithVariants = await tx.product.findMany({
        where: { userId },
        include: {
          variants: true,
          variantOptions: true,
        },
      });

      // Collect all variant options that need updates (sellingPrice: Prisma Decimal or number)
      const variantOptionsToUpdate: { id: number; sellingPrice: number | Prisma.Decimal }[] = [];
      for (const product of productsWithVariants) {
        if (product.variantOptions && product.variantOptions.length > 0) {
          for (const variantOption of product.variantOptions) {
            if (!variantOption.originalSellingPrice) {
              variantOptionsToUpdate.push({
                id: variantOption.id,
                sellingPrice: variantOption.sellingPrice,
              });
            }
          }
        }
      }

      // Execute updates in chunks to avoid connection pool exhaustion
      const CONCURRENT_LIMIT = 20; // Increased from 15 with larger pool (30 connections)
      for (let i = 0; i < variantOptionsToUpdate.length; i += CONCURRENT_LIMIT) {
        const chunk = variantOptionsToUpdate.slice(i, i + CONCURRENT_LIMIT);
        await Promise.all(
          chunk.map((item) =>
            tx.variantOption.update({
              where: { id: item.id },
              data: { originalSellingPrice: item.sellingPrice },
            })
          )
        );
      }

      await updateProductPricesFromOffers(tx, userId);
    });

    return {
      success: true,
      message: 'Product prices force updated successfully',
    };
  } catch {
    throw new Error('Failed to force update prices');
  }
};

export const resetProductPrices = async (userId: number, productId: string) => {
  try {
    await prisma.$transaction(async (tx) => {
      const product = await tx.product.findFirst({
        where: { productId, userId },
        include: {
          variants: true,
          variantOptions: true,
        },
      });

      if (product && product.variantOptions && product.variantOptions.length > 0) {
        for (const variantOption of product.variantOptions) {
          if (variantOption.originalSellingPrice) {
            await tx.variantOption.update({
              where: { id: variantOption.id },
              data: {
                sellingPrice: variantOption.originalSellingPrice,
                originalSellingPrice: null,
              },
            });
          }
        }
      }
    });

    return {
      success: true,
      message: 'Product prices reset to original successfully',
    };
  } catch {
    throw new Error('Failed to reset product prices');
  }
};

type MarketplacePublishCandidate = {
  sku: string | null;
  name: string | null;
  description: string | null;
  productType: string | null;
  brand: string | null;
  supplier: string | null;
  images: string[];
  variantOptions: Array<{
    purchasePrice: Parameters<typeof parseMoney>[0];
    sellingPrice: Parameters<typeof parseMoney>[0];
    stockQuantity: number | null;
  }>;
};

/** Returns null when the product may be published, otherwise the reason it may not. */
const findMarketplacePublishBlocker = (product: MarketplacePublishCandidate): string | null => {
  if (
    !product.sku?.trim() ||
    !product.name?.trim() ||
    !product.description?.trim() ||
    !product.productType?.trim() ||
    !product.brand?.trim() ||
    !product.supplier?.trim()
  ) {
    return 'Product must have SKU, name, description, category, brand, and supplier filled';
  }

  if (!product.images || product.images.length === 0) {
    return 'Product must have at least one image';
  }

  const variantOptions = product.variantOptions ?? [];

  if (!variantOptions.length) {
    return 'Product must have at least one variant option';
  }

  const allVariantsComplete = variantOptions.every(
    (variant) => parseMoney(variant.purchasePrice) > 0 && parseMoney(variant.sellingPrice) > 0,
  );
  if (!allVariantsComplete) {
    return 'All product variants must have complete pricing (purchase price and selling price)';
  }

  const totalStock = variantOptions.reduce((sum, variant) => sum + (variant.stockQuantity || 0), 0);
  if (totalStock <= 0) {
    return 'Product must have stock quantity greater than 0';
  }

  const hasVariantStock = variantOptions.every(
    (variant) => variant.stockQuantity !== undefined && variant.stockQuantity !== null,
  );
  if (!hasVariantStock) {
    return 'Product variants must have stock quantity set';
  }

  return null;
};

/**
 * After the DB write, ping marketplace clients immediately so the dashboard can return.
 * Meili and cache work run afterward: listings read Postgres, not the search index.
 */
const applyMarketplaceStatusSideEffects = async (
  userId: number,
  productIds: string[],
  published: boolean,
) => {
  if (productIds.length === 0) return;

  const action = published ? 'publish' : 'unpublish';

  try {
    await broadcastProductUpdate(productIds, action);
  } catch {
    // ignore broadcast failures
  }

  void (async () => {
    try {
      const { upsertMarketplaceProductsToMeili, deleteMarketplaceProductsFromMeili } = await import(
        '@/lib/meiliMarketplaceSync'
      );
      if (published) {
        await upsertMarketplaceProductsToMeili(productIds);
      } else {
        await deleteMarketplaceProductsFromMeili(productIds);
      }
    } catch (e) {
      console.warn('[Products] Meili sync failed on marketplace status change:', e);
    }

    try {
      await Promise.all([
        invalidateSearchCache('search-cache:marketplace:*'),
        import('@/lib/queryCache').then(({ invalidateProductCache }) => invalidateProductCache(userId)),
      ]);
    } catch (e) {
      console.warn('[Products] Cache invalidation failed after marketplace status change:', e);
    }
  })();
};

export const bulkPublishMarketplaceProducts = async (args: {
  userId: number;
  productIds: string[];
  action: string;
}) => {
  const { userId, action } = args;
  const normalizedAction = (action || '').toLowerCase();

  if (normalizedAction !== 'publish' && normalizedAction !== 'unpublish') {
    throw new Error('Invalid action. Use "publish" or "unpublish".');
  }

  const isPublish = normalizedAction === 'publish';
  const requestedIds = Array.from(new Set(args.productIds));

  const successful: string[] = [];
  const failed: string[] = [];
  const results: Array<{ success: boolean; message: string; product?: unknown }> = [];

  if (requestedIds.length === 0) {
    return {
      success: true,
      message: `No products to ${normalizedAction}`,
      successful,
      failed,
      results,
    };
  }

  // Read the whole batch once; the eligibility checks below are in-memory, so adding
  // products to a bulk operation costs no extra database round trips.
  const products = await prisma.product.findMany({
    where: { productId: { in: requestedIds }, userId },
    select: {
      productId: true,
      sku: true,
      name: true,
      description: true,
      productType: true,
      brand: true,
      supplier: true,
      images: true,
      variantOptions: {
        select: { purchasePrice: true, sellingPrice: true, stockQuantity: true },
      },
    },
  });

  const productsById = new Map(products.map((product) => [product.productId, product]));

  for (const productId of requestedIds) {
    const product = productsById.get(productId);
    if (!product) {
      failed.push(productId);
      results.push({ success: false, message: 'Product not found' });
      continue;
    }

    const blocker = isPublish ? findMarketplacePublishBlocker(product) : null;
    if (blocker) {
      failed.push(productId);
      results.push({ success: false, message: blocker });
      continue;
    }

    successful.push(productId);
    results.push({
      success: true,
      message: isPublish
        ? 'Product published to marketplace successfully'
        : 'Product unpublished from marketplace successfully',
    });
  }

  if (successful.length > 0) {
    const now = new Date();
    await prisma.product.updateMany({
      where: { userId, productId: { in: successful } },
      data: {
        marketplaceStatus: isPublish ? 'Published' : 'Unpublished',
        status: isPublish ? 'Published' : 'Draft', // Sync status field
        lastSyncAt: now,
        publishedAt: isPublish ? now : null,
      },
    });

    await applyMarketplaceStatusSideEffects(userId, successful, isPublish);

    if (isPublish) {
      void NotificationService.createProductsPublishedNotifications(
        userId,
        successful.map((productId) => ({
          productId,
          name: productsById.get(productId)?.name ?? productId,
        })),
      ).catch((notifError) => {
        if (process.env.NODE_ENV === 'development') {
          console.warn('[Products] Bulk published notifications failed:', notifError);
        }
      });
    }
  }

  return {
    success: failed.length === 0,
    message:
      failed.length === 0
        ? `All ${requestedIds.length} products ${normalizedAction}ed successfully`
        : `${successful.length} products ${normalizedAction}ed, ${failed.length} failed`,
    successful,
    failed,
    results,
  };
};

export const publishMarketplaceProduct = async (args: {
  userId: number;
  productId: string;
  action: string;
}) => {
  const { userId, productId, action } = args;
  const normalizedAction = (action || '').toLowerCase();

  if (normalizedAction !== 'publish' && normalizedAction !== 'unpublish') {
    throw new Error('Invalid action. Use "publish" or "unpublish".');
  }

  const product = await prisma.product.findFirst({
    where: {
      productId,
      userId,
    },
    include: {
      variantOptions: { select: variantOptionSelect },
      variants: true,
      user: productSellerInclude.include.user,
    },
  });

  if (!product) {
    throw new Error('Product not found');
  }

  if (normalizedAction === 'publish') {
    const blocker = findMarketplacePublishBlocker(product);
    if (blocker) {
      throw new Error(blocker);
    }
  }

  // Update both status and marketplaceStatus to keep them aligned
  const updateData: Prisma.ProductUpdateInput = {
    marketplaceStatus: normalizedAction === 'publish' ? 'Published' : 'Unpublished',
    status: normalizedAction === 'publish' ? 'Published' : 'Draft', // Sync status field
    lastSyncAt: new Date(),
  };

  if (normalizedAction === 'publish') {
    updateData.publishedAt = new Date();
  } else {
    // Clear publishedAt when unpublishing to clean up data structure
    updateData.publishedAt = null;
  }

  const updatedProduct = await prisma.product.update({
    where: { id: product.id },
    data: updateData,
    include: {
      variantOptions: { select: variantOptionSelect },
      variants: true,
      user: productSellerInclude.include.user,
    },
  });

  const [offerMap, soldCountMap] = await Promise.all([
    fetchActiveOffersMap([updatedProduct.productId], userId),
    calculateSoldCounts(prisma, [updatedProduct.productId]),
  ]);
  const mappedProduct = mapProduct(updatedProduct, offerMap, soldCountMap);

  await applyMarketplaceStatusSideEffects(
    userId,
    [updatedProduct.productId],
    updatedProduct.marketplaceStatus === 'Published' && updatedProduct.status === 'Published',
  );

  // Send notification when product is published asynchronously
  if (normalizedAction === 'publish') {
    void NotificationService.createProductPublishedNotification(
      userId,
      updatedProduct.productId,
      updatedProduct.name
    ).catch((notifError) => {
      if (process.env.NODE_ENV === 'development') {
        console.warn('[Products] Published notification failed:', notifError);
      }
    });
  }

  return {
    success: true,
    message:
      normalizedAction === 'publish'
        ? 'Product published to marketplace successfully'
        : 'Product unpublished from marketplace successfully',
    product: mappedProduct,
  };
};

// ============================================================================ //
// RESOLVERS
// ============================================================================ //

export const productsResolvers = {
  Query: {
    products: withDashboardAuth(fetchProductsConnection),
    product: withDashboardAuth(fetchSingleProduct),
    variantOptionUsage: async (
      _: unknown,
      args: { userId: number; productId: string; variantNames?: string[] | null; variantOptionIds?: number[] | null },
      ctx: unknown,
    ) => {
      requireDashboardUser(ctx, args.userId);
      const { userId, productId } = args;
      const variantNames = Array.isArray(args.variantNames) ? args.variantNames.filter(Boolean).map(String) : [];
      const variantOptionIds = Array.isArray(args.variantOptionIds)
        ? args.variantOptionIds.filter((n) => typeof n === 'number' && Number.isFinite(n))
        : [];

      if (variantNames.length === 0 && variantOptionIds.length === 0) return [];

      const product = await prisma.product.findFirst({
        where: { userId, productId: String(productId) },
        select: { id: true },
      });
      if (!product) {
        throw new Error('Product not found or you do not have permission to view it');
      }

      const options = await prisma.variantOption.findMany({
        where: {
          productId: product.id,
          ...(variantOptionIds.length > 0 ? { id: { in: variantOptionIds } } : {}),
          ...(variantOptionIds.length === 0 && variantNames.length > 0 ? { variantName: { in: variantNames } } : {}),
        },
        select: { id: true, variantName: true },
      });

      if (options.length === 0) return [];

      const optionIdToName = new Map(options.map((o) => [o.id, o.variantName]));
      const orderItems = await prisma.orderItem.findMany({
        where: { variantOptionId: { in: options.map((o) => o.id) } },
        select: { orderId: true, variantOptionId: true },
      });

      const byOptionId = new Map<number, { orderItemCount: number; orderIds: Set<string> }>();
      for (const oi of orderItems) {
        if (!oi.variantOptionId) continue;
        const entry = byOptionId.get(oi.variantOptionId) ?? { orderItemCount: 0, orderIds: new Set<string>() };
        entry.orderItemCount += 1;
        entry.orderIds.add(oi.orderId);
        byOptionId.set(oi.variantOptionId, entry);
      }

      return options.map((opt) => {
        const entry = byOptionId.get(opt.id);
        return {
          variantName: optionIdToName.get(opt.id) ?? opt.variantName,
          orderItemCount: entry?.orderItemCount ?? 0,
          orderIds: entry ? Array.from(entry.orderIds).sort() : [],
        };
      });
    },
    marketplaceProducts: (
      _: unknown,
      args: Parameters<typeof fetchMarketplaceProductsConnection>[0],
    ) => fetchMarketplaceProductsConnection(args),
  },
  Mutation: {
    createProduct: async (_: unknown, args: Parameters<typeof createProduct>[0], ctx: unknown) => {
      requireDashboardUser(ctx, args.userId);
      const result = await createProduct(args);
      auditCatalog({
        action: 'product.create',
        actorId: args.userId,
        resourceType: 'Product',
        resourceId: extractProductId(result) ?? args.productId ?? undefined,
        metadata: { name: args.name, status: args.status ?? undefined },
      });
      return result;
    },
    updateProduct: async (_: unknown, args: Parameters<typeof updateProduct>[0], ctx: unknown) => {
      requireDashboardUser(ctx, args.userId);
      const result = await updateProduct(args);
      auditCatalog({
        action: 'product.update',
        actorId: args.userId,
        resourceType: 'Product',
        resourceId: extractProductId(result) ?? args.id ?? undefined,
      });
      return result;
    },
    deleteProduct: async (_: unknown, args: Parameters<typeof deleteProduct>[0], ctx: unknown) => {
      requireDashboardUser(ctx, args.userId);
      const result = await deleteProduct(args);
      auditCatalog({
        action: 'product.delete',
        actorId: args.userId,
        resourceType: 'Product',
        resourceId: args.id,
      });
      return result;
    },
    resetOriginalPrices: (_: unknown, args: { userId: number }, ctx: unknown) => {
      requireDashboardUser(ctx, args.userId);
      return resetOriginalPrices(args.userId);
    },
    applyOffersToAllProducts: (_: unknown, args: { userId: number }, ctx: unknown) => {
      requireDashboardUser(ctx, args.userId);
      return applyOffersToAllProducts(args.userId);
    },
    forceUpdatePrices: (_: unknown, args: { userId: number }, ctx: unknown) => {
      requireDashboardUser(ctx, args.userId);
      return forceUpdatePrices(args.userId);
    },
    resetProductPrices: (_: unknown, args: { userId: number; productId: string }, ctx: unknown) => {
      requireDashboardUser(ctx, args.userId);
      return resetProductPrices(args.userId, args.productId);
    },
    publishMarketplaceProduct: async (_: unknown, args: Parameters<typeof publishMarketplaceProduct>[0], ctx: unknown) => {
      requireDashboardUser(ctx, args.userId);
      const result = await publishMarketplaceProduct(args);
      auditCatalog({
        action: 'product.publish',
        actorId: args.userId,
        resourceType: 'Product',
        resourceId: args.productId,
        metadata: { marketplaceAction: args.action },
      });
      return result;
    },
    bulkPublishMarketplaceProducts: async (_: unknown, args: Parameters<typeof bulkPublishMarketplaceProducts>[0], ctx: unknown) => {
      requireDashboardUser(ctx, args.userId);
      const result = await bulkPublishMarketplaceProducts(args);
      auditCatalog({
        action: 'product.bulk_publish',
        actorId: args.userId,
        resourceType: 'Product',
        metadata: {
          marketplaceAction: args.action,
          requested: Array.isArray(args.productIds) ? args.productIds.length : 0,
          succeeded: result?.successful?.length ?? 0,
          failed: result?.failed?.length ?? 0,
        },
      });
      return result;
    },
  },
};

