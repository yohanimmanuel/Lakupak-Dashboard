import { GraphQLError } from 'graphql';
import { type Prisma } from '@/lib/db';
import {
  productImagesError,
  productMarketSegmentError,
  productReturnDaysError,
  productTextFieldsError,
} from '@/utils/product-security';
import { parseNumberByCurrency } from '@/config/currencyConfig';
import { normalizeMerchandisingCategorySlug } from '@/constants/merchandisingTaxonomy';
import { broadcastPriceUpdate, broadcastProductUpdate } from '@/utils/websocketBroadcast';
import { calculateSoldCounts, restoreCatalogPricesFromOriginals } from '@/utils/marketplaceMetrics';
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
import { invalidateSearchCache } from '@/utils/searchCache';
import { auditCatalog } from '@/lib/audit';
import { requireDashboardUser, withDashboardAuth } from '@/app/api/graphql/modules/common/auth';
import { computeAssortmentGap, computeAssortmentGapVariants } from '@/lib/products/assortmentGap';
import { normalizeStockLevels, validateStockLevels, type StockLevel } from '@/utils/stockUtils';

function rejectProductInput(message: string): never {
  throw new GraphQLError(message, { extensions: { code: 'BAD_USER_INPUT' } });
}

function assertProductPayload(input: {
  marketSegment?: unknown;
  name?: unknown;
  description?: unknown;
  productType?: unknown;
  brand?: unknown;
  supplier?: unknown;
  images?: unknown;
  returnPolicyDays?: unknown;
  stockLevels?: unknown;
  status?: string | null;
  variantOptions?: Array<{
    sku?: string | null;
    stockQuantity?: number | null;
    purchasePrice?: unknown;
    sellingPrice?: unknown;
  }> | null;
  currency?: string | null;
  textMode: 'required' | 'present';
  publishing: boolean;
}) {
  const textError = productTextFieldsError(
    {
      name: input.name,
      description: input.description,
      productType: input.productType,
      brand: input.brand,
      supplier: input.supplier,
    },
    input.textMode,
  );
  if (textError) rejectProductInput(textError);
  const marketSegmentError = productMarketSegmentError(input.marketSegment);
  if (marketSegmentError) rejectProductInput(marketSegmentError);
  const imageError = productImagesError(input.images);
  if (imageError) rejectProductInput(imageError);
  const daysError = productReturnDaysError(input.returnPolicyDays);
  if (daysError) rejectProductInput(daysError);
  if (input.stockLevels !== undefined) {
    const stockLevelsError = validateStockLevels(input.stockLevels);
    if (stockLevelsError) rejectProductInput(stockLevelsError);
  }
  const options = input.variantOptions ?? [];
  if (options.length === 0) {
    if (input.publishing) rejectProductInput('Variation list is required.');
  } else {
    const pricesReady = options.every((option) => {
      const purchaseMissing =
        option.purchasePrice === undefined ||
        option.purchasePrice === null ||
        String(option.purchasePrice).trim() === '';
      const sellingMissing =
        option.sellingPrice === undefined ||
        option.sellingPrice === null ||
        String(option.sellingPrice).trim() === '';
      // Draft may omit prices; publish (or partially filled rows) must be complete.
      if (purchaseMissing && sellingMissing) return !input.publishing;
      const purchase = persistedVariantPrice(option.purchasePrice, input.currency);
      const selling = persistedVariantPrice(option.sellingPrice, input.currency);
      return purchase > 0 && selling > 0;
    });
    if (!pricesReady) rejectProductInput('Each variant needs a price and package size.');
  }
  if (!input.publishing) return;
  if (options.some((option) => !String(option.sku ?? '').trim())) {
    rejectProductInput('Every product variant must have its own SKU before publishing.');
  }
  const images = Array.isArray(input.images) ? input.images : [];
  if (images.length === 0) rejectProductInput('At least one product image is required.');
  let stock = 0;
  for (const option of options) {
    const parsed = Number(option.stockQuantity);
    if (Number.isFinite(parsed) && parsed < 0) rejectProductInput('Product stock is required.');
    stock += clampVariantInt(option.stockQuantity, 0);
  }
  if (stock <= 0) rejectProductInput('Product stock is required.');
}

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
    moqByStockLevel: JSONObject
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
    marketSegment: String
    name: String!
    description: String!
    productType: String!
    brand: String!
    supplier: String!
    status: String!
    merchandisingCategorySlug: String
    catalogName: String
    stockUnit: String
    stockLevels: [JSONObject!]
    sellingPriceUnit: String
    purchasePriceUnit: String
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
    customOfferClientCount: Int
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
    moqByStockLevel: JSONObject
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

  type AssortmentGapCell {
    segment: String!
    purchased: Int!
    eligible: Int!
    penetration: Float
    kind: String!
  }

  type AssortmentGapRow {
    productId: String!
    name: String!
    sku: String!
    categorySlug: String
    categoryLabel: String
    cells: [AssortmentGapCell!]!
  }

  type AssortmentGapCategory {
    slug: String!
    label: String!
  }

  type AssortmentGapHeatmap {
    segments: [String!]!
    period: String!
    from: String
    rows: [AssortmentGapRow!]!
    categories: [AssortmentGapCategory!]!
    totalProducts: Int!
    page: Int!
    limit: Int!
  }

  type AssortmentGapVariantRow {
    variantOptionId: Int!
    variantName: String!
    sku: String
    cells: [AssortmentGapCell!]!
  }

  type AssortmentGapVariantHeatmap {
    productId: String!
    name: String!
    sku: String!
    segments: [String!]!
    period: String!
    from: String
    rows: [AssortmentGapVariantRow!]!
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

    assortmentGapHeatmap(
      userId: Int!
      category: String
      segment: String
      period: String
      search: String
      page: Int
      limit: Int
    ): AssortmentGapHeatmap!

    assortmentGapVariants(
      userId: Int!
      productId: String!
      segment: String
      period: String
    ): AssortmentGapVariantHeatmap!

    marketplaceProducts(
      page: Int = 1
      limit: Int = 20
      category: String
      search: String
    ): MarketplaceProductConnection!
  }

  input BulkDraftProductInput {
    productId: String
    name: String!
    description: String!
    productType: String!
    brand: String!
    supplier: String!
    catalogName: String
    currency: String
  }

  type BulkProductOperationResult {
    success: Boolean!
    successful: [String!]!
    failed: [String!]!
    message: String!
  }

  extend type Mutation {
    createProduct(
      userId: Int!
      productId: String
      marketSegment: String
      name: String!
      description: String!
      productType: String!
      brand: String!
      supplier: String!
      status: String
    merchandisingCategorySlug: String
    catalogName: String
    stockUnit: String
      stockLevels: [JSONObject!]
      sellingPriceUnit: String
      purchasePriceUnit: String
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
      marketSegment: String
      name: String
      description: String
      productType: String
      brand: String
      supplier: String
      status: String
    merchandisingCategorySlug: String
    catalogName: String
    stockUnit: String
      stockLevels: [JSONObject!]
      sellingPriceUnit: String
      purchasePriceUnit: String
      images: [String!]
      halalCertified: Boolean
      bpomApproved: Boolean
      originalProduct: Boolean
      returnPolicyDays: Int
      currency: String
      variantDefinitions: [VariantDefinitionInput!]
      variantOptions: [VariantOptionInput!]
    ): Product!

    bulkCreateDraftProducts(userId: Int!, products: [BulkDraftProductInput!]!): BulkProductOperationResult!
    bulkDeleteProducts(userId: Int!, productIds: [String!]!): BulkProductOperationResult!

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
  moqByStockLevel: true,
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
  moqByStockLevel: variantOption.moqByStockLevel ?? {},
  stockQuantity: variantOption.stockQuantity ?? 0,
  lowStockThreshold: variantOption.lowStockThreshold ?? 0,
  stockStatus: variantOption.stockStatus ?? 'In Stock',
  isDefault: variantOption.isDefault,
  isActive: variantOption.isActive,
  attributes: variantOption.attributes,
});

type ActiveOfferPresence = {
  productId: string;
  clientCount: number;
};

export const fetchActiveOffersMap = async (
  productIds: string[],
  userScope?: number | number[],
): Promise<Map<string, ActiveOfferPresence>> => {
  if (!productIds.length) {
    return new Map();
  }

  const { startOfToday, endOfToday } = getTodayBoundaries();
  const offerWhere: Prisma.OfferWhereInput = {
    status: 'active',
    productId: { in: productIds },
    startDate: { lte: endOfToday },
    OR: [{ endDate: null }, { endDate: { gte: startOfToday } }],
  };

  if (typeof userScope === 'number') {
    offerWhere.userId = userScope;
  } else if (Array.isArray(userScope) && userScope.length > 0) {
    offerWhere.userId = { in: userScope };
  }

  const groups = await prisma.offer.groupBy({
    by: ['productId', 'buyerId'],
    where: offerWhere,
  });

  const offerMap = new Map<string, ActiveOfferPresence>();
  for (const row of groups) {
    if (!row.productId) continue;
    const existing = offerMap.get(row.productId);
    if (existing) {
      existing.clientCount += 1;
    } else {
      offerMap.set(row.productId, { productId: row.productId, clientCount: 1 });
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
  offerMap: Map<string, ActiveOfferPresence>,
  soldCountMap?: Map<string, string>,
) => {
  const variantOptionRows = product.variantOptions ?? [];
  const variants = variantOptionRows.map(mapVariantOption);
  const offerPresence = offerMap.get(product.productId);
  const clientCount = offerPresence?.clientCount ?? 0;

  return {
    id: product.id,
    productId: product.productId,
    marketSegment: (product as { marketSegment?: string | null }).marketSegment ?? null,
    name: product.name,
    description: product.description,
    productType: product.productType,
    brand: product.brand,
    supplier: product.supplier,
    status: product.status,
    merchandisingCategorySlug: (product as { merchandisingCategorySlug?: string | null }).merchandisingCategorySlug ?? null,
    catalogName: product.catalogName ?? null,
    stockUnit: (product as { stockUnit?: string | null }).stockUnit ?? 'Pieces',
    // Prisma returns JsonValue here, not the domain StockLevel[] type.
    // Normalize at the boundary so legacy/malformed JSON cannot leak to clients.
    stockLevels: normalizeStockLevels((product as { stockLevels?: unknown }).stockLevels),
    sellingPriceUnit: (product as { sellingPriceUnit?: string | null }).sellingPriceUnit || 'Pieces',
    purchasePriceUnit: (product as { purchasePriceUnit?: string | null }).purchasePriceUnit || 'Pieces',
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
    hasActiveOffer: clientCount > 0,
    offerBadge: null,
    offerId: null,
    offerName: null,
    discountType: null,
    discountValue: null,
    promotionDetails: null,
    // Catalog price is never offer-rewritten; keep originalPrice unset
    originalPrice: null,
    customOfferClientCount: clientCount,
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
      { variantOptions: { some: { sku: { contains: search, mode: 'insensitive' } } } },
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
  /** Closed marketplace: a distributor only reads its own published listings. */
  ownerUserId: number;
}) => {
  const { page = 1, limit = 20, category, search } = args;

  const { page: safePage, limit: safeLimit } = sanitizePagination(page, limit, MAX_MARKETPLACE_LIMIT);

  const whereClause: Prisma.ProductWhereInput = {
    status: 'Published',
    marketplaceStatus: 'Published',
    userId: args.ownerUserId,
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
  const soldCountMap = await calculateSoldCounts(prisma, productIds);
  // Public marketplace must not expose private per-retailer offer presence
  const offerMap = new Map<string, ActiveOfferPresence>();

  const nodes = products
    .filter((product) => (product.variantOptions ?? []).length > 0)
    .map((product) => mapProduct(product, offerMap, soldCountMap));

  const result = {
    nodes,
    pagination: buildPaginationInfo(safePage, safeLimit, totalCount),
  };

  return result;
};

// ============================================================================ //
// MUTATIONS
// ============================================================================ //

const generateUniqueProductId = () => `PROD-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const STOCK_UNITS = new Set(['Pieces', 'Boxes', 'Cartons']);

const normalizeStockUnit = (raw?: string | null): string => {
  const value = String(raw || '').trim();
  return STOCK_UNITS.has(value) ? value : 'Pieces';
};

const normalizePriceAnchorUnit = (raw: string | null | undefined, levels: unknown): string => {
  const requested = String(raw || 'Pieces').trim().toLowerCase();
  const match = normalizeStockLevels(levels).find((level) => level.name.trim().toLowerCase() === requested);
  return match?.name || 'Pieces';
};

const validatePriceAnchorUnit = (raw: string | null | undefined, levels: unknown, label: string) => {
  const requested = String(raw || 'Pieces').trim();
  const available = normalizeStockLevels(levels).some((level) => level.name.trim().toLowerCase() === requested.toLowerCase());
  if (!available) rejectProductInput(`${label} must reference one of the product's configured stock levels.`);
};

/**
 * Prisma's JSON write input is intentionally distinct from its JSON read type.
 * Round-trip the already-normalized domain data through JSON to produce a plain
 * JSON value accepted by Prisma.InputJsonValue without asserting StockLevel[]
 * to be a Prisma JSON object/array.
 */
const toPrismaStockLevelsJson = (levels: unknown): Prisma.InputJsonValue =>
  JSON.parse(JSON.stringify(normalizeStockLevels(levels))) as Prisma.InputJsonValue;

const buildProductData = ({
  productId,
  marketSegment,
  name,
  description,
  productType,
  brand,
  supplier,
  status,
  merchandisingCategorySlug,
  catalogName,
  stockUnit,
  stockLevels,
  sellingPriceUnit,
  purchasePriceUnit,
  images,
  halalCertified,
  bpomApproved,
  originalProduct,
  returnPolicyDays,
  userId,
}: {
  productId: string;
  marketSegment?: string | null;
  name: string;
  description: string;
  productType: string;
  brand: string;
  supplier: string;
  status?: string | null;
  merchandisingCategorySlug?: string | null;
  catalogName?: string | null;
  stockUnit?: string | null;
  stockLevels?: StockLevel[] | null;
  sellingPriceUnit?: string | null;
  purchasePriceUnit?: string | null;
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
    marketSegment: marketSegment?.trim() || null,
    name: name.trim(),
    description: description.trim(),
    productType: productType.trim(),
    brand: brand.trim(),
    supplier: supplier.trim(),
    status: finalStatus,
    marketplaceStatus: finalMarketplaceStatus,
    merchandisingCategorySlug: normalizeMerchandisingCategorySlug(merchandisingCategorySlug),
    catalogName: catalogName?.trim() || '',
    // VariantOption.stockQuantity and lowStockThreshold are always absolute piece counts.
    stockUnit: 'Pieces',
    stockLevels: toPrismaStockLevelsJson(stockLevels),
    sellingPriceUnit: normalizePriceAnchorUnit(sellingPriceUnit, stockLevels),
    purchasePriceUnit: normalizePriceAnchorUnit(purchasePriceUnit, stockLevels),
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

/** Same parse and 2-decimal round createVariantOptionsPayload stores, so 0.0001 cannot pass as a positive price. */
const persistedVariantPrice = (value: unknown, currency?: string | null): number =>
  clampVariantDecimal(parseNumberByCurrency(value == null ? '' : String(value), currency ?? undefined));

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
    moqByStockLevel?: Record<string, number> | null;
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
    
    return {
      variantName: normalizeVariantName(option.variantName),
      attributes: option.attributes as Prisma.InputJsonValue,
      sku: option.sku || null,
      purchasePrice: clampVariantDecimal(purchasePriceNum),
      sellingPrice: clampVariantDecimal(sellingPriceNum),
      // Offers no longer rewrite catalog prices — do not persist originalSellingPrice
      originalSellingPrice: null,
      moq: option.moq == null ? null : clampVariantInt(option.moq, 0),
      moqByStockLevel: Object.fromEntries(Object.entries(option.moqByStockLevel ?? {}).filter(([name, qty]) => name !== 'Pieces' && typeof qty === 'number' && Number.isSafeInteger(qty) && qty >= 0)) as Prisma.InputJsonValue,
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
  marketSegment?: string | null;
  name: string;
  description: string;
  productType: string;
  brand: string;
  supplier: string;
  status?: string | null;
  merchandisingCategorySlug?: string | null;
  catalogName?: string | null;
  stockUnit?: string | null;
  stockLevels?: StockLevel[] | null;
  sellingPriceUnit?: string | null;
  purchasePriceUnit?: string | null;
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
    moqByStockLevel?: Record<string, number> | null;
    stockQuantity: number;
    lowStockThreshold: number;
    stockStatus: string;
    isDefault: boolean;
    isActive: boolean;
  }> | null;
}, options: { deferSideEffects?: boolean } = {}) => {
  const {
    userId,
    productId,
    marketSegment,
    name,
    description,
    productType,
    brand,
    supplier,
    status = 'Draft',
    merchandisingCategorySlug,
    catalogName,
    stockUnit,
    stockLevels,
    sellingPriceUnit = 'Pieces',
    purchasePriceUnit = 'Pieces',
    images = [],
    halalCertified = false,
    bpomApproved = false,
    originalProduct = true,
    returnPolicyDays = 7,
    currency = 'IDR',
    variantDefinitions,
    variantOptions,
  } = args;

  const effectiveStockLevels = stockLevels ?? [{ name: 'Pieces', piecesPerUnit: 1 }];
  validatePriceAnchorUnit(sellingPriceUnit, effectiveStockLevels, 'Selling price unit');
  validatePriceAnchorUnit(purchasePriceUnit, effectiveStockLevels, 'Purchase price unit');

  assertProductPayload({
    marketSegment,
    name,
    description,
    productType,
    brand,
    supplier,
    images,
    returnPolicyDays,
    stockLevels: stockLevels ?? [{ name: 'Pieces', piecesPerUnit: 1 }],
    status,
    variantOptions,
    currency,
    textMode: 'required',
    publishing: (status || 'Draft') === 'Published',
  });

  let finalProductId = productId || generateUniqueProductId();
  const existingProduct = await prisma.product.findFirst({
    where: { productId: finalProductId, userId },
  });

  if (existingProduct) {
    finalProductId = generateUniqueProductId();
  }

  const productData = buildProductData({
    productId: finalProductId,
    marketSegment,
    name,
    description,
    productType,
    brand,
    supplier,
    status,
    merchandisingCategorySlug,
    catalogName,
    stockUnit,
    stockLevels: effectiveStockLevels,
    sellingPriceUnit,
    purchasePriceUnit,
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

  // Batch import defers cache and broadcast side effects until all rows finish.
  if (!options.deferSideEffects) try {
    const { invalidateProductCache, invalidateDashboardCache } = await import('@/lib/queryCache');
    await Promise.all([
      invalidateProductCache(userId),
      invalidateDashboardCache(userId),
    ]);
  } catch {
    // ignore cache invalidation failures
  }

  // Refetch product for response payload
  const updatedProduct = await refetchProductForResponse(product.id);
  if (!updatedProduct) {
    throw new Error('Failed to fetch created product');
  }

  // Check stock levels and trigger inventory notifications for newly created products
  if (!options.deferSideEffects && updatedProduct.variantOptions && updatedProduct.variantOptions.length > 0) {
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

  if (!options.deferSideEffects) await broadcastProductChanges(updatedProduct.productId);

  // Product creation does not create synthetic supplier opening balances.
  // Supplier records are created only by explicit receipt/import workflows.
  
  // Invalidate marketplace search cache (public-facing, needs caching)
  if (!options.deferSideEffects) try {
    await invalidateSearchCache('search-cache:marketplace:*');
  } catch {
    // ignore cache invalidation failures
  }
  
  // Invalidate product cache again after broadcast to ensure fresh data on next query
  if (!options.deferSideEffects) try {
    const { invalidateProductCache } = await import('@/lib/queryCache');
    await invalidateProductCache(userId);
  } catch {
    // ignore cache invalidation failures
  }
  
  return mapProductWithOffers(updatedProduct);
};

type BulkDraftProductInput = {
  productId?: string | null;
  name: string;
  description: string;
  productType: string;
  brand: string;
  supplier: string;
  catalogName?: string | null;
  currency?: string | null;
};

export const bulkCreateDraftProducts = async (args: { userId: number; products: BulkDraftProductInput[] }) => {
  if (args.products.length > 200) throw new Error('Import at most 200 products per batch.');
  const successful: string[] = [];
  const failed: string[] = [];
  for (const [index, product] of args.products.entries()) {
    try {
      // Reuse the canonical product validation, variant creation, and ownership rules.
      const created = await createProduct({
        ...product,
        userId: args.userId,
        status: 'Draft',
        variantOptions: [{
          variantName: 'Default', attributes: {}, sku: null, purchasePrice: '',
          sellingPrice: '', originalSellingPrice: null, moq: null,
          stockQuantity: 0, lowStockThreshold: 0, stockStatus: 'Out of Stock',
          isDefault: true, isActive: true,
        }],
      }, { deferSideEffects: true });
      successful.push(created.productId);
    } catch {
      failed.push(product.productId || `row:${index + 1}`);
    }
  }
  if (successful.length) {
    const { invalidateProductCache, invalidateDashboardCache } = await import('@/lib/queryCache');
    await Promise.allSettled([
      invalidateProductCache(args.userId),
      invalidateDashboardCache(args.userId),
      invalidateSearchCache('search-cache:marketplace:*'),
    ]);
    // The catalog subscription receives one batch completion broadcast.
    await broadcastProductChanges(successful[0]);
  }
  return {
    success: failed.length === 0,
    successful,
    failed,
    message: `${successful.length} products imported, ${failed.length} failed`,
  };
};

export const bulkDeleteProducts = async (args: { userId: number; productIds: string[] }) => {
  const requested = [...new Set(args.productIds)];
  if (requested.length > 200) throw new Error('Delete at most 200 products per batch.');
  const successful: string[] = [];
  const failed: string[] = [];
  for (const id of requested) {
    try {
      // Keep existing product deletion transaction, supplier snapshots, and
      // marketplace cleanup; do not replace with an unsafe deleteMany().
      const result = await deleteProduct({ userId: args.userId, id });
      if (result.success) successful.push(id);
      else failed.push(id);
    } catch {
      failed.push(id);
    }
  }
  return {
    success: failed.length === 0,
    successful,
    failed,
    message: `${successful.length} products deleted, ${failed.length} failed`,
  };
};

export const updateProduct = async (args: {
  userId: number;
  id?: string | null;
  productId?: string | null;
  marketSegment?: string | null;
  name?: string | null;
  description?: string | null;
  productType?: string | null;
  brand?: string | null;
  supplier?: string | null;
  status?: string | null;
  merchandisingCategorySlug?: string | null;
  catalogName?: string | null;
  stockUnit?: string | null;
  stockLevels?: StockLevel[] | null;
  sellingPriceUnit?: string | null;
  purchasePriceUnit?: string | null;
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
    moqByStockLevel?: Record<string, number> | null;
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
    marketSegment,
    name,
    description,
    productType,
    brand,
    supplier,
    status,
    merchandisingCategorySlug,
    catalogName,
    stockUnit,
    stockLevels,
    sellingPriceUnit,
    purchasePriceUnit,
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
          sku: true,
          purchasePrice: true,
          sellingPrice: true,
          stockQuantity: true,
          lowStockThreshold: true,
        },
      },
    },
  });

  if (!productBeforeUpdate) {
    throw new Error('Product not found or you do not have permission to update it');
  }

  const nextStatus = status !== undefined ? String(status) : productBeforeUpdate.status;
  const publishing = nextStatus === 'Published';
  const storedStockLevels = productBeforeUpdate.stockLevels ??
    (normalizeStockUnit(productBeforeUpdate.stockUnit) === 'Pieces'
      ? [{ name: 'Pieces', piecesPerUnit: 1 }]
      : null);
  const effectiveStockLevels = stockLevels !== undefined ? stockLevels : storedStockLevels;
  if (sellingPriceUnit !== undefined) validatePriceAnchorUnit(sellingPriceUnit, effectiveStockLevels, 'Selling price unit');
  if (purchasePriceUnit !== undefined) validatePriceAnchorUnit(purchasePriceUnit, effectiveStockLevels, 'Purchase price unit');
  if (publishing && !stockLevels && !storedStockLevels) {
    rejectProductInput('Convert this product’s legacy stock quantity to Pieces before publishing.');
  }
  // Draft `present` mode skips omitted fields; publishing validates SKU on every variant.
  assertProductPayload({
    marketSegment:
      marketSegment !== undefined
        ? marketSegment
        : publishing
          ? (productBeforeUpdate as { marketSegment?: string | null }).marketSegment
          : undefined,
    name: name !== undefined ? name : productBeforeUpdate.name,
    description: description !== undefined ? description : productBeforeUpdate.description,
    productType: productType !== undefined ? productType : productBeforeUpdate.productType,
    brand: brand !== undefined ? brand : productBeforeUpdate.brand,
    supplier: supplier !== undefined ? supplier : productBeforeUpdate.supplier,
    images: images !== undefined ? images : productBeforeUpdate.images,
    stockLevels: stockLevels !== undefined ? stockLevels : (storedStockLevels ?? undefined),
    returnPolicyDays: returnPolicyDays !== undefined ? returnPolicyDays : productBeforeUpdate.returnPolicyDays,
    status: nextStatus,
    variantOptions:
      variantOptions !== undefined && variantOptions !== null
        ? variantOptions
        : publishing
          ? productBeforeUpdate.variantOptions
          : productBeforeUpdate.variantOptions.map((option) => ({
              stockQuantity: option.stockQuantity,
            })),
    currency,
    textMode: publishing ? 'required' : 'present',
    publishing,
  });

  // Use the actual product ID for the update (to match unique constraint)
  const updateWhere = isNumericId(id || '')
    ? { id: productBeforeUpdate.id }
    : { productId: productBeforeUpdate.productId };

  const cleanUpdateData: Record<string, unknown> = {};

  if (marketSegment !== undefined) {
    const trimmedMarketSegment = String(marketSegment ?? '').trim();
    cleanUpdateData.marketSegment = trimmedMarketSegment || null;
  }
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
  if (merchandisingCategorySlug !== undefined) {
    cleanUpdateData.merchandisingCategorySlug = normalizeMerchandisingCategorySlug(
      String(merchandisingCategorySlug),
    );
  }
  if (catalogName !== undefined) cleanUpdateData.catalogName = String(catalogName);
  if (sellingPriceUnit !== undefined) cleanUpdateData.sellingPriceUnit = normalizePriceAnchorUnit(sellingPriceUnit, effectiveStockLevels);
  else if (stockLevels !== undefined) cleanUpdateData.sellingPriceUnit = normalizePriceAnchorUnit(productBeforeUpdate.sellingPriceUnit, effectiveStockLevels);
  if (purchasePriceUnit !== undefined) cleanUpdateData.purchasePriceUnit = normalizePriceAnchorUnit(purchasePriceUnit, effectiveStockLevels);
  else if (stockLevels !== undefined) cleanUpdateData.purchasePriceUnit = normalizePriceAnchorUnit(productBeforeUpdate.purchasePriceUnit, effectiveStockLevels);
  if (stockLevels !== undefined) {
    const stockLevelsError = validateStockLevels(stockLevels);
    if (stockLevelsError) rejectProductInput(stockLevelsError);
    cleanUpdateData.stockLevels = toPrismaStockLevelsJson(stockLevels);
    // A successful conversion retires the old single-unit interpretation.
    cleanUpdateData.stockUnit = 'Pieces';
  } else if (stockUnit !== undefined && normalizeStockUnit(stockUnit) !== normalizeStockUnit(productBeforeUpdate.stockUnit)) {
    rejectProductInput('Configure stock levels and convert existing quantities before changing the stock unit.');
  }
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

    // Product variant definitions are catalog configuration, not order-owned data.
    // OrderItem keeps immutable text/attribute snapshots and its optional relation is
    // detached by ON DELETE SET NULL when a definition is removed.
    if (variantDefinitions !== undefined && variantDefinitions !== null && Array.isArray(variantDefinitions)) {
      const existingDefinitions = await tx.productVariant.findMany({
        where: { productId: updated.id },
        select: { id: true, variantType: true },
      });
      const existingByType = new Map(existingDefinitions.map((definition) => [definition.variantType, definition]));
      const incomingTypes = new Set(variantDefinitions.map((definition) => definition.variantType));

      // Keep IDs for unchanged definition layers. Renaming/removing a layer deletes
      // only that catalog definition; OrderItem.variantId is nullable and its own
      // order-time snapshots remain untouched by the FK's ON DELETE SET NULL.
      for (const definition of variantDefinitions) {
        const existing = existingByType.get(definition.variantType);
        if (existing) {
          await tx.productVariant.update({
            where: { id: existing.id },
            data: { options: definition.options, position: definition.position },
          });
        } else {
          await tx.productVariant.create({
            data: {
              productId: updated.id,
              variantType: definition.variantType,
              options: definition.options,
              position: definition.position,
            },
          });
        }
      }

      const removedDefinitionIds = existingDefinitions
        .filter((definition) => !incomingTypes.has(definition.variantType))
        .map((definition) => definition.id);
      if (removedDefinitionIds.length > 0) {
        await tx.productVariant.deleteMany({ where: { id: { in: removedDefinitionIds } } });
      }
    }

    // Preserve VariantOption IDs for unchanged/renamed options. Removed options are deleted
    // after their historical OrderItems have been snapshotted and detached by the FK.
    if (variantOptions !== undefined && variantOptions !== null && Array.isArray(variantOptions)) {
      const payload = createVariantOptionsPayload(variantOptions, currency ?? undefined);
      const keepNames = payload.map((p) => p.variantName);

      // Map existing VariantOptions by attributes/name so edits preserve stable IDs.
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

        // Keep the database identity when attributes identify the same variant.
        // A display-name-only change updates the existing row; historical order
        // labels remain isolated in OrderItem snapshots.
        const p = { ...raw, variantName: normalizedName };

        const doUpsert = async () => {
          if (existing) {
            return tx.variantOption.update({
              where: { id: existing.id },
              data: { ...p },
            });
          }
          return tx.variantOption.create({
            data: { ...p, productId: updated.id },
          });
        };

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

      // Prune removed catalog options after snapshotting linked order items.
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

        if (removed.length > 0) {
          // Preserve the order-time catalog values before deleting the live variant.
          // Never overwrite an existing snapshot: historical orders must not change
          // when a distributor renames or removes a current catalog option.
          for (const removedOption of removed) {
            const previous = existingVariantOptions.find((option) => option.id === removedOption.id);
            if (!previous) continue;
            const linkedOrderItems = await tx.orderItem.findMany({
              where: { variantOptionId: previous.id },
              select: {
                id: true,
                productNameSnapshot: true,
                productSkuSnapshot: true,
                variantNameSnapshot: true,
                variantAttributesSnapshot: true,
              },
            });
            for (const orderItem of linkedOrderItems) {
              const snapshotData: Prisma.OrderItemUpdateInput = {};
              if (!String(orderItem.productNameSnapshot || '').trim()) snapshotData.productNameSnapshot = productBeforeUpdate.name;
              if (!String(orderItem.productSkuSnapshot || '').trim()) snapshotData.productSkuSnapshot = previous.sku;
              if (!String(orderItem.variantNameSnapshot || '').trim()) snapshotData.variantNameSnapshot = previous.variantName;
              if (orderItem.variantAttributesSnapshot == null && previous.attributes != null) {
                snapshotData.variantAttributesSnapshot = previous.attributes as Prisma.InputJsonValue;
              }
              if (Object.keys(snapshotData).length > 0) {
                await tx.orderItem.update({ where: { id: orderItem.id }, data: snapshotData });
              }
            }
          }

          // Snapshot the exact supplier receipt identity before the FK is set NULL.
          // This gives future archive/delete and stock-reconciliation flows the
          // original variant ID even if the catalog option is recreated with the same SKU.
          for (const removedOption of removed) {
            await tx.supplyRecord.updateMany({
              where: {
                variantOptionId: removedOption.id,
                historicalVariantOptionId: null,
              },
              data: { historicalVariantOptionId: removedOption.id },
            });
          }

          // OrderItem.variantOptionId is nullable with ON DELETE SET NULL, so
          // removing the catalog option detaches the order while retaining snapshots.
          await tx.variantOption.deleteMany({
            where: { id: { in: removed.map((option) => option.id) } },
          });
        }

        // Preserve supplier history/summary snapshots for removed variants.
        // The helper deliberately performs no deletion; old catalog IDs stay
        // distinct from newly created variants with the same name or SKU. The existing helper runs on this transaction,
        // so the catalog change and supplier cleanup commit or roll back together.
        const remainingVariantOptions = await tx.variantOption.findMany({
          where: { productId: updated.id },
          select: {
            id: true,
            variantName: true,
            sku: true,
            purchasePrice: true,
            stockQuantity: true,
            isActive: true,
          },
        });
        const removedById = new Map<number, { variantOptionId: number; variantName: string; sku?: string | null }>();
        for (const removedOption of removed) {
          const previous = existingVariantOptions.find((option) => option.id === removedOption.id);
          if (previous) {
            removedById.set(previous.id, {
              variantOptionId: previous.id,
              variantName: previous.variantName,
              sku: previous.sku,
            });
          }
        }
        for (const inactiveOption of remainingVariantOptions) {
          if (inactiveOption.isActive === false) {
            removedById.set(inactiveOption.id, {
              variantOptionId: inactiveOption.id,
              variantName: inactiveOption.variantName,
              sku: inactiveOption.sku,
            });
          }
        }
        if (removedById.size > 0) {
          const { removeProductVariantsSuppliesInTransaction } = await import(
            '@/lib/suppliers/syncProductSupplies'
          );
          await removeProductVariantsSuppliesInTransaction(tx, {
            userId,
            productId: productBeforeUpdate.productId,
            name: updated.name,
            removedVariants: Array.from(removedById.values()),
            allVariants: Array.from(new Map(
              [
                ...remainingVariantOptions.map((option) => ({
                  variantOptionId: option.id,
                  variantName: option.variantName,
                  sku: option.sku,
                })),
                ...Array.from(removedById.values()),
              ].map((option) => [option.variantOptionId, option]),
            ).values()),
          });
        }
      }
    }

    // Product edits update only the catalog. Existing supplier receipts are
    // historical transactions and are never regenerated from current stock.

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

  // Invalidate caches — client rates must not rewrite public catalog prices
  try {
    const { invalidateProductCache, invalidateDashboardCache } = await import('@/lib/queryCache');
    await Promise.all([
      invalidateProductCache(userId),
      invalidateDashboardCache(userId),
    ]);
  } catch {
    // ignore cache invalidation failures
  }

  // Refetch product for response payload
  const updatedProduct = await refetchProductForResponse(product.id);
  if (!updatedProduct) {
    throw new Error('Failed to fetch updated product');
  }

  // Check stock levels and trigger inventory notifications if thresholds crossed
  if (productBeforeUpdate && variantOptions && updatedProduct.variantOptions) {
    const previousVariants = productBeforeUpdate.variantOptions || [];
    const newVariants = updatedProduct.variantOptions || [];

    for (const newVariant of newVariants) {
      // Stable IDs identify retained variants across catalog edits.
      const previousVariant = previousVariants.find((pv) => pv.id === newVariant.id);

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

  // Delete the catalog product while preserving supplier accounting snapshots.
  // If either operation fails, neither side is left partially updated.
  await prisma.$transaction(async (tx) => {
    // Snapshot every supplier receipt's original VariantOption ID before product
    // deletion cascades the catalog variants and clears their live foreign keys.
    for (const variant of productToDelete.variantOptions) {
      await tx.supplyRecord.updateMany({
        where: { variantOptionId: variant.id, historicalVariantOptionId: null },
        data: { historicalVariantOptionId: variant.id },
      });
    }

    const { removeProductSuppliesInTransaction } = await import(
      '@/lib/suppliers/syncProductSupplies'
    );
    await removeProductSuppliesInTransaction(tx, {
      userId,
      productId: productToDelete.productId,
      name: productToDelete.name,
      variantOptions: productToDelete.variantOptions,
    });
    await tx.product.delete({
      where: isNumericId(id) ? { id: Number(id) } : { productId: id },
    });
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
    const restored = await restoreCatalogPricesFromOriginals(prisma, userId);
    return {
      success: true,
      message:
        restored > 0
          ? `Restored catalog prices for ${restored} variant options and cleared originalSellingPrice`
          : 'No offer-rewritten catalog prices found',
    };
  } catch {
    throw new Error('Failed to reset original prices');
  }
};

export const applyOffersToAllProducts = async (_userId: number) => {
  // Offers are private per-client rates — they must not rewrite public catalog prices.
  return {
    success: true,
    message: 'Client rates do not modify public product prices',
  };
};

export const forceUpdatePrices = async (userId: number) => {
  try {
    const restored = await restoreCatalogPricesFromOriginals(prisma, userId);
    return {
      success: true,
      message:
        restored > 0
          ? `Restored ${restored} catalog prices from originalSellingPrice`
          : 'Catalog prices already independent of offers',
    };
  } catch {
    throw new Error('Failed to force update prices');
  }
};

export const resetProductPrices = async (userId: number, productId: string) => {
  try {
    const restored = await restoreCatalogPricesFromOriginals(prisma, userId, [productId]);
    return {
      success: true,
      message:
        restored > 0
          ? 'Product catalog prices restored successfully'
          : 'Product catalog prices already independent of offers',
    };
  } catch {
    throw new Error('Failed to reset product prices');
  }
};

type MarketplacePublishCandidate = {
  name: string | null;
  description: string | null;
  productType: string | null;
  brand: string | null;
  supplier: string | null;
  images: string[];
  variantOptions: Array<{
    sku: string | null;
    purchasePrice: Parameters<typeof parseMoney>[0];
    sellingPrice: Parameters<typeof parseMoney>[0];
    stockQuantity: number | null;
  }>;
};

/** Returns null when the product may be published, otherwise the reason it may not. */
const findMarketplacePublishBlocker = (product: MarketplacePublishCandidate): string | null => {
  if (
    !product.name?.trim() ||
    !product.description?.trim() ||
    !product.productType?.trim() ||
    !product.brand?.trim() ||
    !product.supplier?.trim()
  ) {
    return 'Product must have name, description, category, brand, and supplier filled';
  }

  if (!product.images || product.images.length === 0) {
    return 'Product must have at least one image';
  }

  const variantOptions = product.variantOptions ?? [];

  if (!variantOptions.length) {
    return 'Product must have at least one variant option';
  }
  if (variantOptions.some((variant) => !String(variant.sku ?? '').trim())) {
    return 'Every product variant must have its own SKU';
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

type MarketplacePublishNotifyItem = { productId: string; name: string };

/**
 * Notify only products the marketplace listing query actually returns.
 * Uses the persisted name from that listing payload.
 */
const notifyWhenPublishedProductsArePlaced = async (
  userId: number,
  products: MarketplacePublishNotifyItem[],
) => {
  if (products.length === 0) return;

  const { fetchMarketplaceListedProducts } = await import(
    '@/app/api/graphql/modules/marketplace/handlers/products'
  );
  const listed = await fetchMarketplaceListedProducts(products.map((product) => product.productId));
  if (listed.length === 0) return;

  const requested = new Set(products.map((product) => product.productId));
  const placed = listed.filter((row) => requested.has(row.productId));
  if (placed.length === 0) return;

  await NotificationService.createProductsPublishedNotifications(userId, placed);
};

/**
 * After the DB write, ping marketplace clients immediately so the dashboard can return.
 * Meili and cache work run afterward. The published notice waits until the marketplace
 * listing query returns those products — not until a device has them on screen.
 */
const applyMarketplaceStatusSideEffects = async (
  userId: number,
  productIds: string[],
  published: boolean,
  notifyProducts: MarketplacePublishNotifyItem[] = [],
) => {
  if (productIds.length === 0) return;

  const action = published ? 'publish' : 'unpublish';

  try {
    await broadcastProductUpdate(productIds, action, userId);
  } catch {
    // ignore broadcast failures
  }

  void (async () => {
    try {
      const { upsertMarketplaceProductsToMeili, deleteMarketplaceProductsFromMeili } = await import(
        '@/lib/meiliMarketplaceSync'
      );
      if (published) {
        await upsertMarketplaceProductsToMeili(productIds, { waitForIndex: true });
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

    if (published && notifyProducts.length > 0) {
      try {
        await notifyWhenPublishedProductsArePlaced(userId, notifyProducts);
      } catch (notifError) {
        if (process.env.NODE_ENV === 'development') {
          console.warn('[Products] Published notification failed:', notifError);
        }
      }
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
      name: true,
      description: true,
      productType: true,
      brand: true,
      supplier: true,
      images: true,
      variantOptions: {
        select: { sku: true, purchasePrice: true, sellingPrice: true, stockQuantity: true },
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

    await applyMarketplaceStatusSideEffects(
      userId,
      successful,
      isPublish,
      isPublish
        ? successful.map((productId) => ({
            productId,
            name: productsById.get(productId)?.name ?? productId,
          }))
        : [],
    );
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

  const isNowPublished =
    updatedProduct.marketplaceStatus === 'Published' && updatedProduct.status === 'Published';

  await applyMarketplaceStatusSideEffects(
    userId,
    [updatedProduct.productId],
    isNowPublished,
    isNowPublished
      ? [{ productId: updatedProduct.productId, name: updatedProduct.name }]
      : [],
  );

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
    assortmentGapHeatmap: withDashboardAuth(computeAssortmentGap),
    assortmentGapVariants: withDashboardAuth(computeAssortmentGapVariants),
    variantOptionUsage: async (
      _: unknown,
      args: { userId: number; productId: string; variantNames?: string[] | null; variantOptionIds?: number[] | null },
      ctx: unknown,
    ) => {
      requireDashboardUser(ctx, args.userId);
      const variantNames = Array.isArray(args.variantNames) ? args.variantNames.filter(Boolean).map(String) : [];
      const variantOptionIds = Array.isArray(args.variantOptionIds)
        ? args.variantOptionIds.filter((id) => typeof id === 'number' && Number.isFinite(id))
        : [];
      if (variantNames.length === 0 && variantOptionIds.length === 0) return [];

      const product = await prisma.product.findFirst({
        where: { userId: args.userId, productId: String(args.productId) },
        select: { id: true },
      });
      if (!product) throw new Error('Product not found or you do not have permission to view it');

      const options = await prisma.variantOption.findMany({
        where: {
          productId: product.id,
          ...(variantOptionIds.length > 0 ? { id: { in: variantOptionIds } } : {}),
          ...(variantOptionIds.length === 0 && variantNames.length > 0 ? { variantName: { in: variantNames } } : {}),
        },
        select: { id: true, variantName: true },
      });
      if (options.length === 0) return [];

      const orderItems = await prisma.orderItem.findMany({
        where: { variantOptionId: { in: options.map((option) => option.id) } },
        select: { orderId: true, variantOptionId: true },
      });
      const byOptionId = new Map<number, { orderItemCount: number; orderIds: Set<string> }>();
      for (const item of orderItems) {
        if (item.variantOptionId == null) continue;
        const entry = byOptionId.get(item.variantOptionId) ?? { orderItemCount: 0, orderIds: new Set<string>() };
        entry.orderItemCount += 1;
        entry.orderIds.add(item.orderId);
        byOptionId.set(item.variantOptionId, entry);
      }
      return options.map((option) => {
        const entry = byOptionId.get(option.id);
        return {
          variantName: option.variantName,
          orderItemCount: entry?.orderItemCount ?? 0,
          orderIds: entry ? Array.from(entry.orderIds).sort() : [],
        };
      });
    },
    marketplaceProducts: (
      _: unknown,
      args: Omit<Parameters<typeof fetchMarketplaceProductsConnection>[0], 'ownerUserId'>,
      ctx: unknown,
    ) => fetchMarketplaceProductsConnection({ ...args, ownerUserId: requireDashboardUser(ctx) }),
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
    bulkCreateDraftProducts: async (_: unknown, args: Parameters<typeof bulkCreateDraftProducts>[0], ctx: unknown) => {
      requireDashboardUser(ctx, args.userId);
      const result = await bulkCreateDraftProducts(args);
      auditCatalog({ action: 'product.bulk_create', actorId: args.userId, resourceType: 'Product',
        metadata: { requested: args.products.length, succeeded: result.successful.length, failed: result.failed.length } });
      return result;
    },
    bulkDeleteProducts: async (_: unknown, args: Parameters<typeof bulkDeleteProducts>[0], ctx: unknown) => {
      requireDashboardUser(ctx, args.userId);
      const result = await bulkDeleteProducts(args);
      auditCatalog({ action: 'product.bulk_delete', actorId: args.userId, resourceType: 'Product',
        metadata: { requested: args.productIds.length, succeeded: result.successful.length, failed: result.failed.length } });
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

