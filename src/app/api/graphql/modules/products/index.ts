import { type Prisma, type OfferDiscountType } from '@/generated/prisma';
import { parseNumberByCurrency } from '@/config/currencyConfig';
import { broadcastPriceUpdate, broadcastProductUpdate } from '@/utils/websocketBroadcast';
import { calculateSoldCounts, updateProductPricesFromOffers } from '@/utils/marketplaceMetrics';
import { prisma } from '../common/prisma';
import {
  MAX_PRODUCT_LIMIT,
  MAX_MARKETPLACE_LIMIT,
  sanitizePagination,
  buildPaginationInfo,
  isNumericId,
  parseMoney,
} from '../common/utils';

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
    legacyVariants: [JSONObject!]
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
    originalPrice: String
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

  input LegacyVariantInput {
    variantName: String!
    variantType: String
    sku: String
    purchasePrice: String!
    sellingPrice: String!
    originalSellingPrice: String
    moq: Int
    stockQuantity: Int!
    lowStockThreshold: Int!
    stockStatus: String!
    attributes: JSONObject
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
      catalogName: String
      images: [String!]
      halalCertified: Boolean
      bpomApproved: Boolean
      originalProduct: Boolean
      returnPolicyDays: Int
      currency: String
      variantDefinitions: [VariantDefinitionInput!]
      variantOptions: [VariantOptionInput!]
      variants: [LegacyVariantInput!]
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
      catalogName: String
      images: [String!]
      halalCertified: Boolean
      bpomApproved: Boolean
      originalProduct: Boolean
      returnPolicyDays: Int
      currency: String
      variantDefinitions: [VariantDefinitionInput!]
      variantOptions: [VariantOptionInput!]
      variants: [LegacyVariantInput!]
    ): Product!

    deleteProduct(userId: Int!, id: String!): DeleteProductResult!

    resetOriginalPrices(userId: Int!): ActionResult!

    applyOffersToAllProducts(userId: Int!): ActionResult!

    forceUpdatePrices(userId: Int!): ActionResult!

    resetProductPrices(userId: Int!, productId: String!): ActionResult!

    publishMarketplaceProduct(userId: Int!, productId: String!, action: String!): MarketplacePublishResult!
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

  const buyXGetY = discountTypes.find((dt) => dt.discountType === 'buy_x_get_y');
  const promotionDetails = buyXGetY
    ? {
        minQuantity: buyXGetY.minQuantity ?? 0,
        freeQuantity: buyXGetY.discountValue,
        description:
          buyXGetY.description ?? `Buy ${buyXGetY.minQuantity ?? 0} Get ${buyXGetY.discountValue} Free`,
      }
    : null;

  return {
    offerBadge,
    discountType,
    discountValue,
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

  const now = new Date();
  const offerWhere: Prisma.OfferWhereInput = {
    status: 'active',
    startDate: { lte: now },
    endDate: { gte: now },
    offerProducts: {
      some: {
        productId: { in: productIds },
      },
    },
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
    legacyVariants: (product as { legacyVariants?: unknown[] }).legacyVariants ?? [],
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
    originalPrice: variantOptionRows[0]?.originalSellingPrice ?? null,
    seller: buildSellerInfo(product as Prisma.ProductGetPayload<typeof productSellerInclude>) ?? null,
    soldCount: soldCountMap?.get(product.productId) ?? '0',
  };
};

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

  return {
    nodes,
    pagination: buildPaginationInfo(safePage, safeLimit, totalCount),
  };
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

  return {
    nodes,
    pagination: buildPaginationInfo(safePage, safeLimit, totalCount),
  };
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
  productCategory: string;
  catalogName?: string | null;
  images?: string[] | null;
  halalCertified?: boolean | null;
  bpomApproved?: boolean | null;
  originalProduct?: boolean | null;
  returnPolicyDays?: number | null;
  userId: number;
}) => {
  const finalStatus = status || 'Draft';
  const finalMarketplaceStatus = finalStatus === 'Published' ? 'Published' : 'Not Published';

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
    productCategory: productCategory.trim(),
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
  variantOptions.map((option) => ({
    variantName: option.variantName,
    attributes: option.attributes as Prisma.InputJsonValue,
    sku: option.sku || null,
    purchasePrice: String(parseNumberByCurrency(option.purchasePrice || '', currency ?? undefined)),
    sellingPrice: String(parseNumberByCurrency(option.sellingPrice || '', currency ?? undefined)),
    originalSellingPrice:
      option.originalSellingPrice && typeof option.originalSellingPrice === 'string'
        ? String(parseNumberByCurrency(option.originalSellingPrice, currency ?? undefined))
        : null,
    moq: option.moq,
    stockQuantity: option.stockQuantity || 0,
    lowStockThreshold: option.lowStockThreshold || 0,
    stockStatus: option.stockStatus || 'In Stock',
    isDefault: option.isDefault || false,
    isActive: option.isActive !== false,
  }));

const createLegacyVariantPayload = (
  variants: Array<{
    variantName: string;
    variantType?: string | null;
    sku?: string | null;
    purchasePrice: string;
    sellingPrice: string;
    originalSellingPrice?: string | null;
    moq?: number | null;
    stockQuantity: number;
    lowStockThreshold: number;
    stockStatus: string;
    attributes?: Record<string, unknown> | null;
    isDefault: boolean;
    isActive: boolean;
  }>,
  currency?: string | null,
) =>
  variants.map((variant) => ({
    variantName: variant.variantName || 'Default Variant',
    attributes: (variant.attributes || {}) as Prisma.InputJsonValue,
    sku: variant.sku || null,
    purchasePrice: String(parseNumberByCurrency(variant.purchasePrice || '', currency ?? undefined)),
    sellingPrice: String(parseNumberByCurrency(variant.sellingPrice || '', currency ?? undefined)),
    originalSellingPrice:
      variant.originalSellingPrice && typeof variant.originalSellingPrice === 'string'
        ? String(parseNumberByCurrency(variant.originalSellingPrice, currency ?? undefined))
        : null,
    moq: variant.moq || null,
    stockQuantity: variant.stockQuantity || 0,
    lowStockThreshold: variant.lowStockThreshold || 0,
    stockStatus: variant.stockStatus || 'In Stock',
    isDefault: variant.isDefault || false,
    isActive: variant.isActive !== false,
  }));

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
  variants?: Array<{
    variantName: string;
    variantType?: string | null;
    sku?: string | null;
    purchasePrice: string;
    sellingPrice: string;
    originalSellingPrice?: string | null;
    moq?: number | null;
    stockQuantity: number;
    lowStockThreshold: number;
    stockStatus: string;
    attributes?: Record<string, unknown> | null;
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
    catalogName,
    images = [],
    halalCertified = false,
    bpomApproved = false,
    originalProduct = true,
    returnPolicyDays = 7,
    currency = 'IDR',
    variantDefinitions,
    variantOptions,
    variants,
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
        : variants && !variantOptions && !variantDefinitions
          ? {
              create: createLegacyVariantPayload(variants, currency ?? undefined),
            }
          : undefined,
    },
    include: {
      variantOptions: { select: variantOptionSelect },
      variants: true,
      user: productSellerInclude.include.user,
    },
  });

  await updateProductPricesFromOffers(prisma, userId);

  const updatedProduct = await refetchProductForResponse(product.id);
  if (!updatedProduct) {
    throw new Error('Failed to fetch created product');
  }

  await broadcastProductChanges(updatedProduct.productId);
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
  variants?: Array<{
    variantName: string;
    variantType?: string | null;
    sku?: string | null;
    purchasePrice: string;
    sellingPrice: string;
    originalSellingPrice?: string | null;
    moq?: number | null;
    stockQuantity: number;
    lowStockThreshold: number;
    stockStatus: string;
    attributes?: Record<string, unknown> | null;
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
    catalogName,
    images,
    halalCertified,
    bpomApproved,
    originalProduct,
    returnPolicyDays,
    currency = 'IDR',
    variantDefinitions,
    variantOptions,
    variants,
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
    cleanUpdateData.marketplaceStatus = newStatus === 'Published' ? 'Published' : 'Not Published';
    if (newStatus === 'Published') {
      cleanUpdateData.publishedAt = new Date();
    }
  }
  if (productCategory !== undefined) cleanUpdateData.productCategory = String(productCategory);
  if (catalogName !== undefined) cleanUpdateData.catalogName = String(catalogName);
  if (images !== undefined) cleanUpdateData.images = Array.isArray(images) ? images : [];
  if (halalCertified !== undefined) cleanUpdateData.halalCertified = Boolean(halalCertified);
  if (bpomApproved !== undefined) cleanUpdateData.bpomApproved = Boolean(bpomApproved);
  if (originalProduct !== undefined) cleanUpdateData.originalProduct = Boolean(originalProduct);
  if (returnPolicyDays !== undefined) cleanUpdateData.returnPolicyDays = Number(returnPolicyDays);

  const product = await prisma.product.update({
    where,
    data: {
      ...cleanUpdateData,
      ...(variantDefinitions &&
        Array.isArray(variantDefinitions) &&
        variantDefinitions.length > 0 && {
          variants: {
            deleteMany: {},
            create: variantDefinitions.map((def) => ({
              variantType: def.variantType,
              options: def.options,
              position: def.position,
            })),
          },
        }),
      ...(variantOptions &&
        Array.isArray(variantOptions) &&
        variantOptions.length > 0 && {
          variantOptions: {
            deleteMany: {},
            create: createVariantOptionsPayload(variantOptions, currency ?? undefined),
          },
        }),
      ...(variants &&
        !variantOptions &&
        !variantDefinitions && {
          variantOptions: {
            deleteMany: {},
            create: createLegacyVariantPayload(variants, currency ?? undefined),
          },
        }),
    },
    include: {
      variantOptions: { select: variantOptionSelect },
      variants: true,
      user: productSellerInclude.include.user,
    },
  });

  await updateProductPricesFromOffers(prisma, userId);

  const updatedProduct = await refetchProductForResponse(product.id);
  if (!updatedProduct) {
    throw new Error('Failed to fetch updated product');
  }

  await broadcastProductChanges(updatedProduct.productId);
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
    throw new Error('Product not found');
  }

  const [offerMap, soldCountMap] = await Promise.all([
    fetchActiveOffersMap([productToDelete.productId], userId),
    calculateSoldCounts(prisma, [productToDelete.productId]),
  ]);
  const mappedProduct = mapProduct(productToDelete, offerMap, soldCountMap);

  await prisma.product.delete({
    where: isNumericId(id) ? { id: Number(id) } : { productId: id },
  });

  await broadcastProductChanges(productToDelete.productId);

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

    await Promise.all(variantOptionUpdatePromises);

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

      for (const product of productsWithVariants) {
        if (product.variantOptions && product.variantOptions.length > 0) {
          for (const variantOption of product.variantOptions) {
            if (!variantOption.originalSellingPrice) {
              await tx.variantOption.update({
                where: { id: variantOption.id },
                data: { originalSellingPrice: variantOption.sellingPrice },
              });
            }
          }
        }
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
    if (!product.name || !product.description) {
      throw new Error('Product must have name and description');
    }

    if (!product.images || product.images.length === 0) {
      throw new Error('Product must have at least one image');
    }

    const variantOptions = product.variantOptions ?? [];

    if (!variantOptions.length) {
      throw new Error('Product must have at least one variant option');
    }

    const hasCompleteVariant = variantOptions.some(
      (variant) =>
        Boolean(variant.purchasePrice && variant.purchasePrice.trim() !== '') &&
        Boolean(variant.sellingPrice && variant.sellingPrice.trim() !== '') &&
        variant.isActive,
    );

    if (!hasCompleteVariant) {
      throw new Error('Product must have at least one complete variant with pricing');
    }

    const totalStock = variantOptions.reduce((sum, variant) => sum + (variant.stockQuantity || 0), 0);
    if (totalStock <= 0) {
      throw new Error('Product must have stock quantity greater than 0');
    }

    const hasVariantStock = variantOptions.some(
      (variant) => variant.stockQuantity !== undefined && variant.stockQuantity !== null,
    );
    if (!hasVariantStock) {
      throw new Error('Product variants must have stock quantity set');
    }
  }

  const updateData: Prisma.ProductUpdateInput = {
    marketplaceStatus: normalizedAction === 'publish' ? 'Published' : 'Unpublished',
    lastSyncAt: new Date(),
  };

  if (normalizedAction === 'publish') {
    updateData.publishedAt = new Date();
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

  await broadcastProductChanges(updatedProduct.productId);

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
    products: (_: unknown, args: Parameters<typeof fetchProductsConnection>[0]) =>
      fetchProductsConnection(args),
    product: (_: unknown, args: Parameters<typeof fetchSingleProduct>[0]) => fetchSingleProduct(args),
    marketplaceProducts: (_: unknown, args: Parameters<typeof fetchMarketplaceProductsConnection>[0]) =>
      fetchMarketplaceProductsConnection(args),
  },
  Mutation: {
    createProduct: (_: unknown, args: Parameters<typeof createProduct>[0]) => createProduct(args),
    updateProduct: (_: unknown, args: Parameters<typeof updateProduct>[0]) => updateProduct(args),
    deleteProduct: (_: unknown, args: Parameters<typeof deleteProduct>[0]) => deleteProduct(args),
    resetOriginalPrices: (_: unknown, args: { userId: number }) => resetOriginalPrices(args.userId),
    applyOffersToAllProducts: (_: unknown, args: { userId: number }) => applyOffersToAllProducts(args.userId),
    forceUpdatePrices: (_: unknown, args: { userId: number }) => forceUpdatePrices(args.userId),
    resetProductPrices: (_: unknown, args: { userId: number; productId: string }) =>
      resetProductPrices(args.userId, args.productId),
    publishMarketplaceProduct: (_: unknown, args: Parameters<typeof publishMarketplaceProduct>[0]) =>
      publishMarketplaceProduct(args),
  },
};

