import { ApolloServer } from '@apollo/server';
import { startServerAndCreateNextHandler } from '@as-integrations/next';
import type { NextRequest } from 'next/server';
import { GraphQLScalarType, Kind, type ValueNode } from 'graphql';
import {
  PrismaClient,
  type Prisma,
  type OfferDiscountType,
  type Buyer as BuyerModel,
  type Supplier as SupplierModel,
} from '@/generated/prisma';
import { buildMobileBuyerId } from '@/utils/buyerSync';

const prisma = new PrismaClient();

const MAX_DEFAULT_LIMIT = 100;
const MAX_PRODUCT_LIMIT = 1000;
const MAX_MARKETPLACE_LIMIT = 200;

type PaginationInfo = {
  page: number;
  limit: number;
  totalCount: number;
  totalPages: number;
};

type ConnectionResult<T> = {
  nodes: T[];
  pagination: PaginationInfo;
};

const parseLiteralJSON = (ast: ValueNode): unknown => {
  switch (ast.kind) {
    case Kind.STRING: {
      try {
        return JSON.parse(ast.value);
      } catch {
        return ast.value;
      }
    }
    case Kind.BOOLEAN:
      return ast.value;
    case Kind.INT:
    case Kind.FLOAT:
      return Number(ast.value);
    case Kind.OBJECT: {
      const value: Record<string, unknown> = {};
      for (const field of ast.fields) {
        value[field.name.value] = parseLiteralJSON(field.value);
      }
      return value;
    }
    case Kind.LIST:
      return ast.values.map((valueNode) => parseLiteralJSON(valueNode));
    case Kind.NULL:
    default:
      return null;
  }
};

const JSONObjectScalar = new GraphQLScalarType({
  name: 'JSONObject',
  description: 'Arbitrary JSON object.',
  serialize(value) {
    return typeof value === 'object' ? value : null;
  },
  parseValue(value) {
    return typeof value === 'object' ? value : null;
  },
  parseLiteral(ast: ValueNode) {
    return parseLiteralJSON(ast);
  },
});

const typeDefs = /* GraphQL */ `
  scalar JSONObject

  type PaginationInfo {
    page: Int!
    limit: Int!
    totalCount: Int!
    totalPages: Int!
  }

  type DashboardTotals {
    orders: Int!
    products: Int!
    buyers: Int!
    suppliers: Int!
  }

  type DashboardSnapshot {
    orders: [Order!]!
    products: [Product!]!
    buyers: [Buyer!]!
    suppliers: [Supplier!]!
    totals: DashboardTotals!
  }

  type BuyerSummary {
    buyerId: String
    storeName: String
    owner: String
    email: String
    phone: String
  }

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

  type OrderItem {
    productId: String
    productName: String
    category: String
    brand: String
    description: String
    images: [String!]
    productDeleted: Boolean
    packageQuantity: Int
    packageType: String
    piecesPerPackage: Int
    pricePerPackage: Float
    subtotal: Float!
    variantId: Int
    variantOptionId: Int
    offerApplied: Boolean
    offerBadgeSnapshot: String
    offerNameSnapshot: String
    promotionDetailsSnapshot: String
    variantNameSnapshot: String
    productNameSnapshot: String
    productSkuSnapshot: String
    productTypeSnapshot: String
    originalPriceSnapshot: String
    discountPercentage: Float
    discountAmount: Float
    moqSnapshot: Int
  }

  type Order {
    id: String
    orderId: String!
    buyerId: String
    orderStatus: String!
    paymentStatus: String!
    deliveryMethod: String
    deliveryOption: String
    shippingMethodLabel: String
    shippingMethod: String
    subtotal: Float!
    discounts: Float!
    shippingFee: Float!
    totalAmount: Float!
    paymentTerms: String
    totalOrders: Int
    contactPerson: String
    storeName: String
    contactPhone: String
    customerEmail: String
    deliveryAddress: String
    preferredDeliveryDate: String
    preferredDeliveryTime: String
    preferredPickupDate: String
    preferredPickupTime: String
    assignedLogistics: String
    trackingNumber: String
    deliveryNote: String
    deliveryConfirmation: String
    pod: String
    orderDate: String!
    createdAt: String
    updatedAt: String
    acceptedBy: String
    acceptedAt: String
    buyer: BuyerSummary
    seller: SellerInfo
    orderItems: [OrderItem!]!
  }

  type OrderConnection {
    nodes: [Order!]!
    pagination: PaginationInfo!
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
  }

  type MarketplaceProductConnection {
    nodes: [MarketplaceProduct!]!
    pagination: PaginationInfo!
  }

  type OfferDiscount {
    id: String!
    discountType: String!
    discountValue: Float!
    minOrderValue: Float
    minQuantity: Int
    isActive: Boolean!
    priority: Int!
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
  }

  type OfferConnection {
    nodes: [Offer!]!
    pagination: PaginationInfo!
  }

  type Buyer {
    id: Int!
    buyerId: String!
    avatar: String
    owner: String!
    storeName: String!
    email: String!
    phone: String!
    businessType: String!
    address: String!
    status: String!
    logistics: String
    notes: String
    orderDetails: String
    avgMonthlySpending: Float
    avgMonthlyOrders: Float
    userId: Int
    createdAt: String!
    updatedAt: String!
  }

  type BuyerConnection {
    nodes: [Buyer!]!
    pagination: PaginationInfo!
  }

  type Supplier {
    id: Int!
    supplierId: String!
    name: String!
    contact: String!
    email: String!
    phone: String!
    businessType: String!
    address: String!
    status: String!
    logistics: String
    notes: String
    supplies: String
    avgMonthlyPurchaseValue: Float
    totalPurchases: Float
    totalSupplies: Float
    onTimeDeliveryRate: Float
    userId: Int
    createdAt: String!
    updatedAt: String!
  }

  type SupplierConnection {
    nodes: [Supplier!]!
    pagination: PaginationInfo!
  }

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

  enum ActivityType {
    favorite
    viewed
    purchased
    cart
  }

  type UserActivity {
    id: Int!
    userId: Int!
    productId: String!
    productData: JSONObject!
    activityType: ActivityType!
    metadata: JSONObject
    createdAt: String!
    updatedAt: String!
  }

  type Query {
    dashboardSnapshot(
      userId: Int!
      ordersLimit: Int = 10
      productsLimit: Int = 10
      contactsLimit: Int = 10
    ): DashboardSnapshot!

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

    offers(
      userId: Int!
      page: Int = 1
      limit: Int = 10
      status: String
      type: String
    ): OfferConnection!

    buyers(
      userId: Int!
      page: Int = 1
      limit: Int = 50
      search: String
      status: String
      businessType: String
    ): BuyerConnection!

    suppliers(
      userId: Int!
      page: Int = 1
      limit: Int = 50
      search: String
      status: String
      businessType: String
    ): SupplierConnection!

    orders(
      userId: Int!
      page: Int = 1
      limit: Int = 20
      status: String
      includeArchived: Boolean = false
    ): OrderConnection!

    marketplaceOrders(
      marketplaceUserId: Int!
      page: Int = 1
      limit: Int = 10
    ): OrderConnection!

    marketplaceUser(userId: Int!): MarketplaceUserProfile

    userActivities(
      userId: Int!
      activityType: ActivityType!
      limit: Int = 20
    ): [UserActivity!]!
  }
`;

const sanitizePagination = (page = 1, limit = 20, max = MAX_DEFAULT_LIMIT) => {
  const safePage = Number.isFinite(page) && page > 0 ? Math.floor(page) : 1;
  const safeLimit = Number.isFinite(limit) && limit > 0 ? Math.min(Math.floor(limit), max) : Math.min(20, max);
  return { page: safePage, limit: safeLimit };
};

const buildPaginationInfo = (page: number, limit: number, totalCount: number): PaginationInfo => ({
  page,
  limit,
  totalCount,
  totalPages: Math.max(1, Math.ceil(totalCount / limit)),
});

const isNumericId = (value: string) => /^\d+$/.test(value);

const parseMoney = (value: string | number | null | undefined): number => {
  if (typeof value === 'number') {
    return value;
  }
  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value.replace(/,/g, ''));
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
};

const asISOString = (value?: Date | null) => (value ? value.toISOString() : null);

const variantOptionSelect = {
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
          buyXGetY.description ??
          `Buy ${buyXGetY.minQuantity ?? 0} Get ${buyXGetY.discountValue} Free`,
      }
    : null;

  return {
    offerBadge,
    discountType,
    discountValue,
    promotionDetails,
  };
};

const productSellerInclude = {
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

const fetchActiveOffersMap = async (
  productIds: string[],
  userScope?: number | number[]
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
    if (!activeDiscountTypes.length) {
      continue;
    }

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

const mapProduct = (
  product: Prisma.ProductGetPayload<{
    include: {
      variantOptions: { select: typeof variantOptionSelect };
      variants: true;
      user: typeof productSellerInclude.include.user;
    };
  }>,
  offerMap: Map<string, ActiveOfferPayload[]>
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
  };
};

const fetchProductsConnection = async (args: {
  userId: number;
  page?: number;
  limit?: number;
  search?: string | null;
  status?: string | null;
  productType?: string | null;
}): Promise<ConnectionResult<ReturnType<typeof mapProduct>>> => {
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

  const offerMap = await fetchActiveOffersMap(
    products.map((product) => product.productId),
    userId
  );

  const nodes = products.map((product) => mapProduct(product, offerMap));

  return {
    nodes,
    pagination: buildPaginationInfo(safePage, safeLimit, totalCount),
  };
};

const fetchSingleProduct = async (args: { userId: number; id: string }) => {
  const { userId, id } = args;
  const where: Prisma.ProductWhereInput = isNumericId(id)
    ? { id: Number(id), userId }
    : { productId: id, userId };

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

  const offerMap = await fetchActiveOffersMap([product.productId], userId);
  return mapProduct(product, offerMap);
};

const fetchMarketplaceProductsConnection = async (args: {
  page?: number;
  limit?: number;
  category?: string | null;
  search?: string | null;
}): Promise<ConnectionResult<ReturnType<typeof mapProduct>>> => {
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
  const userIds = products
    .map((product) => product.userId)
    .filter((id): id is number => typeof id === 'number');

  const offerMap = await fetchActiveOffersMap(productIds, userIds);

  const nodes = products
    .filter((product) => (product.variantOptions ?? []).length > 0)
    .map((product) => mapProduct(product, offerMap));

  return {
    nodes,
    pagination: buildPaginationInfo(safePage, safeLimit, totalCount),
  };
};

const mapOffer = (
  offer: Prisma.OfferGetPayload<{
    include: {
      offerDiscountTypes: true;
    };
  }>
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
});

const fetchOffersConnection = async (args: {
  userId: number;
  page?: number;
  limit?: number;
  status?: string | null;
  type?: string | null;
}): Promise<ConnectionResult<ReturnType<typeof mapOffer>>> => {
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
      },
    }),
    prisma.offer.count({ where: whereClause }),
  ]);

  return {
    nodes: offers.map(mapOffer),
    pagination: buildPaginationInfo(safePage, safeLimit, totalCount),
  };
};

const mapBuyer = (buyer: BuyerModel) => ({
  id: buyer.id,
  buyerId: buyer.buyerId,
  avatar: buyer.avatar ?? null,
  owner: buyer.owner,
  storeName: buyer.storeName,
  email: buyer.email,
  phone: buyer.phone,
  businessType: buyer.businessType,
  address: buyer.address,
  status: buyer.status,
  logistics: buyer.logistics ?? null,
  notes: buyer.notes ?? null,
  orderDetails: buyer.orderDetails ?? null,
  avgMonthlySpending: (buyer as { avgMonthlySpending?: number }).avgMonthlySpending ?? null,
  avgMonthlyOrders: (buyer as { avgMonthlyOrders?: number }).avgMonthlyOrders ?? null,
  userId: buyer.userId ?? null,
  createdAt: buyer.createdAt.toISOString(),
  updatedAt: buyer.updatedAt.toISOString(),
});

const fetchBuyersConnection = async (args: {
  userId: number;
  page?: number;
  limit?: number;
  search?: string | null;
  status?: string | null;
  businessType?: string | null;
}): Promise<ConnectionResult<ReturnType<typeof mapBuyer>>> => {
  const { userId, page = 1, limit = 50, search, status, businessType } = args;
  const { page: safePage, limit: safeLimit } = sanitizePagination(page, limit);

  const whereClause: Prisma.BuyerWhereInput = { userId };

  if (search) {
    whereClause.OR = [
      { storeName: { contains: search, mode: 'insensitive' } },
      { owner: { contains: search, mode: 'insensitive' } },
      { email: { contains: search, mode: 'insensitive' } },
      { address: { contains: search, mode: 'insensitive' } },
    ];
  }

  if (status && status !== 'All') {
    whereClause.status = status;
  }

  if (businessType && businessType !== 'All Types') {
    whereClause.businessType = businessType;
  }

  const [buyers, totalCount] = await Promise.all([
    prisma.buyer.findMany({
      where: whereClause,
      skip: (safePage - 1) * safeLimit,
      take: safeLimit,
      orderBy: { createdAt: 'desc' },
    }),
    prisma.buyer.count({ where: whereClause }),
  ]);

  return {
    nodes: buyers.map(mapBuyer),
    pagination: buildPaginationInfo(safePage, safeLimit, totalCount),
  };
};

const mapSupplier = (supplier: SupplierModel) => ({
  id: supplier.id,
  supplierId: supplier.supplierId,
  name: supplier.name,
  contact: supplier.contact,
  email: supplier.email,
  phone: supplier.phone,
  businessType: supplier.businessType,
  address: supplier.address,
  status: supplier.status,
  logistics: supplier.logistics ?? null,
  notes: supplier.notes ?? null,
  supplies: supplier.supplies ?? null,
  avgMonthlyPurchaseValue: (supplier as { avgMonthlyPurchaseValue?: number }).avgMonthlyPurchaseValue ?? null,
  totalPurchases: (supplier as { totalPurchases?: number }).totalPurchases ?? null,
  totalSupplies: (supplier as { totalSupplies?: number }).totalSupplies ?? null,
  onTimeDeliveryRate: (supplier as { onTimeDeliveryRate?: number }).onTimeDeliveryRate ?? null,
  userId: supplier.userId ?? null,
  createdAt: supplier.createdAt.toISOString(),
  updatedAt: supplier.updatedAt.toISOString(),
});

const fetchSuppliersConnection = async (args: {
  userId: number;
  page?: number;
  limit?: number;
  search?: string | null;
  status?: string | null;
  businessType?: string | null;
}): Promise<ConnectionResult<ReturnType<typeof mapSupplier>>> => {
  const { userId, page = 1, limit = 50, search, status, businessType } = args;
  const { page: safePage, limit: safeLimit } = sanitizePagination(page, limit);

  const whereClause: Prisma.SupplierWhereInput = { userId };

  if (search) {
    whereClause.OR = [
      { name: { contains: search, mode: 'insensitive' } },
      { contact: { contains: search, mode: 'insensitive' } },
      { email: { contains: search, mode: 'insensitive' } },
      { phone: { contains: search, mode: 'insensitive' } },
      { address: { contains: search, mode: 'insensitive' } },
    ];
  }

  if (status && status !== 'All') {
    whereClause.status = status;
  }

  if (businessType && businessType !== 'All Types') {
    whereClause.businessType = businessType;
  }

  const [suppliers, totalCount] = await Promise.all([
    prisma.supplier.findMany({
      where: whereClause,
      skip: (safePage - 1) * safeLimit,
      take: safeLimit,
      orderBy: { createdAt: 'desc' },
    }),
    prisma.supplier.count({ where: whereClause }),
  ]);

  return {
    nodes: suppliers.map(mapSupplier),
    pagination: buildPaginationInfo(safePage, safeLimit, totalCount),
  };
};

const mapOrderItems = (
  items: Prisma.OrderItemGetPayload<{
    include: { product: true };
  }>[]
) =>
  items.map((item) => ({
    productId: item.productId ?? null,
    productName: item.product?.name ?? item.productNameSnapshot ?? 'Unknown Product',
    category: item.product?.productType ?? item.productTypeSnapshot ?? 'Uncategorized',
    brand: item.product?.brand ?? 'Unknown Brand',
    description: item.product?.description ?? '',
    images: item.product?.images ?? [],
    productDeleted: !item.product,
    packageQuantity: item.packageQuantity ?? 1,
    packageType: item.packageType,
    piecesPerPackage: item.piecesPerPackage ?? 1,
    pricePerPackage: item.pricePerPackage ?? null,
    subtotal: item.subtotal,
    variantId: item.variantId ?? null,
    variantOptionId: item.variantOptionId ?? null,
    offerApplied: item.offerApplied ?? false,
    offerBadgeSnapshot: item.offerBadgeSnapshot,
    offerNameSnapshot: item.offerNameSnapshot,
    promotionDetailsSnapshot: item.promotionDetailsSnapshot,
    variantNameSnapshot: item.variantNameSnapshot,
    productNameSnapshot: item.productNameSnapshot ?? null,
    productSkuSnapshot: item.productSkuSnapshot ?? null,
    productTypeSnapshot: item.productTypeSnapshot ?? null,
    originalPriceSnapshot: item.originalPriceSnapshot ?? null,
    discountPercentage: item.discountPercentage ?? null,
    discountAmount: item.discountAmount ?? null,
    moqSnapshot: item.moqSnapshot ?? null,
  }));

const mapOrder = (
  order: Prisma.OrderGetPayload<{
    include: {
      buyer: true;
      user: {
        include: {
          company: true;
        };
      };
      orderItemsRel: {
        include: {
          product: true;
        };
      };
    };
  }>
) => ({
  id: order.id ? String(order.id) : null,
  orderId: order.orderId,
  buyerId: order.buyerId ?? null,
  orderStatus: order.orderStatus,
  paymentStatus: order.paymentStatus,
  deliveryMethod: order.deliveryMethod,
  deliveryOption: order.deliveryOption ?? null,
  shippingMethodLabel: order.shippingMethodLabel ?? null,
  shippingMethod: order.shippingMethod ?? null,
  subtotal: order.subtotal,
  discounts: order.discounts,
  shippingFee: order.shippingFee,
  totalAmount: order.totalAmount,
  paymentTerms: order.paymentTerms ?? null,
  totalOrders: order.totalOrders ?? null,
  contactPerson: order.contactPerson ?? order.storeName ?? null,
  storeName: order.storeName ?? null,
  contactPhone: order.contactPhone ?? null,
  customerEmail: order.customerEmail ?? null,
  deliveryAddress: order.deliveryAddress ?? null,
  preferredDeliveryDate: order.preferredDeliveryDate?.toISOString() ?? null,
  preferredDeliveryTime: order.preferredDeliveryTime ?? null,
  preferredPickupDate: order.preferredPickupDate?.toISOString() ?? null,
  preferredPickupTime: order.preferredPickupTime ?? null,
  assignedLogistics: order.assignedLogistics ?? null,
  trackingNumber: order.trackingNumber ?? null,
  deliveryNote: order.deliveryNote ?? null,
  deliveryConfirmation: order.deliveryConfirmation ?? null,
  pod: order.pod ?? null,
  orderDate: order.orderDate.toISOString(),
  createdAt: order.createdAt?.toISOString() ?? null,
  updatedAt: order.updatedAt?.toISOString() ?? null,
  acceptedBy: order.acceptedBy ?? null,
  acceptedAt: order.acceptedAt?.toISOString() ?? null,
  buyer: order.buyer
    ? {
        buyerId: order.buyer.buyerId,
        storeName: order.buyer.storeName,
        owner: order.buyer.owner,
        email: order.buyer.email,
        phone: order.buyer.phone,
      }
    : null,
  seller: order.user
    ? {
        name: [order.user.firstName, order.user.lastName].filter(Boolean).join(' ').trim() || null,
        companyName: order.user.company?.name ?? null,
        companyAddress: order.user.company?.businessAddress ?? null,
        companyPhone: order.user.company?.businessPhone ?? null,
        companyEmail: order.user.company?.businessEmail ?? null,
        shippingPreferences: order.user.company?.shippingPreferences ?? null,
        logo: order.user.company?.logo ?? null,
        bannerImage: order.user.company?.bannerImage ?? null,
      }
    : null,
  orderItems: mapOrderItems(order.orderItemsRel ?? []),
});

const fetchOrdersConnection = async (args: {
  userId: number;
  page?: number;
  limit?: number;
  status?: string | null;
  includeArchived?: boolean;
}): Promise<ConnectionResult<ReturnType<typeof mapOrder>>> => {
  const { userId, page = 1, limit = 20, status, includeArchived = false } = args;
  const { page: safePage, limit: safeLimit } = sanitizePagination(page, limit, 200);

  const whereClause: Prisma.OrderWhereInput = {
    userId,
    isDeleted: false,
    archivedAt: includeArchived ? undefined : null,
  };

  if (status && status !== 'All') {
    whereClause.orderStatus = status;
  }

  const [orders, totalCount] = await Promise.all([
    prisma.order.findMany({
      where: whereClause,
      skip: (safePage - 1) * safeLimit,
      take: safeLimit,
      orderBy: { createdAt: 'desc' },
      include: {
        buyer: true,
        user: {
          include: {
            company: true,
          },
        },
        orderItemsRel: {
          include: {
            product: true,
          },
        },
      },
    }),
    prisma.order.count({ where: whereClause }),
  ]);

  return {
    nodes: orders.map(mapOrder),
    pagination: buildPaginationInfo(safePage, safeLimit, totalCount),
  };
};

const fetchMarketplaceOrdersConnection = async (args: {
  marketplaceUserId: number;
  page?: number;
  limit?: number;
}): Promise<ConnectionResult<ReturnType<typeof mapOrder>>> => {
  const { marketplaceUserId, page = 1, limit = 10 } = args;
  const { page: safePage, limit: safeLimit } = sanitizePagination(page, limit, 100);

  const baseBuyerId = buildMobileBuyerId(marketplaceUserId);

  const whereClause: Prisma.OrderWhereInput = {
    buyerId: { startsWith: baseBuyerId },
  };

  const [orders, totalCount] = await Promise.all([
    prisma.order.findMany({
      where: whereClause,
      skip: (safePage - 1) * safeLimit,
      take: safeLimit,
      orderBy: { orderDate: 'desc' },
      include: {
        buyer: true,
        user: {
          include: {
            company: true,
          },
        },
        orderItemsRel: {
          include: {
            product: {
              include: {
                user: {
                  include: {
                    company: true,
                  },
                },
              },
            },
          },
        },
      },
    }),
    prisma.order.count({ where: whereClause }),
  ]);

  return {
    nodes: orders.map(mapOrder),
    pagination: buildPaginationInfo(safePage, safeLimit, totalCount),
  };
};

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

const fetchUserActivities = async (args: {
  userId: number;
  activityType: string;
  limit?: number;
}) => {
  const { userId, activityType, limit = 20 } = args;
  const { limit: safeLimit } = sanitizePagination(1, limit, 100);

  const activities = await prisma.userActivity.findMany({
    where: { userId, activityType },
    orderBy: { createdAt: 'desc' },
    take: safeLimit,
  });

  return activities.map((activity) => ({
    id: activity.id,
    userId: activity.userId,
    productId: activity.productId,
    productData: activity.productData,
    activityType: activity.activityType as
      | 'favorite'
      | 'viewed'
      | 'purchased'
      | 'cart',
    metadata: activity.metadata,
    createdAt: activity.createdAt.toISOString(),
    updatedAt: activity.updatedAt.toISOString(),
  }));
};

const buildDashboardSnapshot = async (args: {
  userId: number;
  ordersLimit: number;
  productsLimit: number;
  contactsLimit: number;
}) => {
  const { userId, ordersLimit, productsLimit, contactsLimit } = args;

  const [ordersConnection, productsConnection, buyersConnection, suppliersConnection] =
    await Promise.all([
      fetchOrdersConnection({ userId, page: 1, limit: ordersLimit }),
      fetchProductsConnection({ userId, page: 1, limit: productsLimit }),
      fetchBuyersConnection({ userId, page: 1, limit: contactsLimit }),
      fetchSuppliersConnection({ userId, page: 1, limit: contactsLimit }),
    ]);

  return {
    orders: ordersConnection.nodes,
    products: productsConnection.nodes,
    buyers: buyersConnection.nodes,
    suppliers: suppliersConnection.nodes,
    totals: {
      orders: ordersConnection.pagination.totalCount,
      products: productsConnection.pagination.totalCount,
      buyers: buyersConnection.pagination.totalCount,
      suppliers: suppliersConnection.pagination.totalCount,
    },
  };
};

const resolvers = {
  JSONObject: JSONObjectScalar,
  Query: {
    dashboardSnapshot: async (
      _: unknown,
      args: { userId: number; ordersLimit?: number; productsLimit?: number; contactsLimit?: number }
    ) => {
      return buildDashboardSnapshot({
        userId: args.userId,
        ordersLimit: sanitizePagination(1, args.ordersLimit ?? 10, 200).limit,
        productsLimit: sanitizePagination(1, args.productsLimit ?? 10, 100).limit,
        contactsLimit: sanitizePagination(1, args.contactsLimit ?? 10, 100).limit,
      });
    },
    products: (_: unknown, args: Parameters<typeof fetchProductsConnection>[0]) =>
      fetchProductsConnection(args),
    product: (_: unknown, args: Parameters<typeof fetchSingleProduct>[0]) =>
      fetchSingleProduct(args),
    marketplaceProducts: (_: unknown, args: Parameters<typeof fetchMarketplaceProductsConnection>[0]) =>
      fetchMarketplaceProductsConnection(args),
    offers: (_: unknown, args: Parameters<typeof fetchOffersConnection>[0]) =>
      fetchOffersConnection(args),
    buyers: (_: unknown, args: Parameters<typeof fetchBuyersConnection>[0]) =>
      fetchBuyersConnection(args),
    suppliers: (_: unknown, args: Parameters<typeof fetchSuppliersConnection>[0]) =>
      fetchSuppliersConnection(args),
    orders: (_: unknown, args: Parameters<typeof fetchOrdersConnection>[0]) =>
      fetchOrdersConnection(args),
    marketplaceOrders: (
      _: unknown,
      args: { marketplaceUserId: number; page?: number; limit?: number }
    ) => fetchMarketplaceOrdersConnection(args),
    marketplaceUser: (_: unknown, args: { userId: number }) =>
      fetchMarketplaceUserProfile(args.userId),
    userActivities: (
      _: unknown,
      args: { userId: number; activityType: string; limit?: number }
    ) => fetchUserActivities(args),
  },
};

const server = new ApolloServer({
  typeDefs,
  resolvers,
});

const handler = startServerAndCreateNextHandler<NextRequest>(server);

export { handler as GET, handler as POST };

