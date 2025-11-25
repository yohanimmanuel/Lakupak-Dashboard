// ============================================================================
// GRAPHQL API ROUTE - PRODUCTS, ORDERS, OFFERS, BUYERS, SUPPLIERS
// ============================================================================
// This file implements a GraphQL API that consolidates multiple REST endpoints
// into a single, flexible query interface. It uses Apollo Server with Next.js
// integration for handling GraphQL requests.
//
// MAIN SECTIONS:
// 1. Imports and Configuration
// 2. Type Definitions (Scalars, Types, Queries, Mutations)
// 3. Helper Functions (Pagination, Data Mapping, Offer Processing)
// 4. Resolver Functions (Query and Mutation implementations)
// 5. Apollo Server Setup
// ============================================================================

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
import {
  getProductSecurityHeaders,
  validateProductInput,
  sanitizeProductData,
  generateUniqueProductId,
} from '@/utils/product-security';
import { parseNumberByCurrency } from '@/config/currencyConfig';
import { broadcastProductUpdate, broadcastPriceUpdate, broadcastOfferUpdate } from '@/utils/websocketBroadcast';
import { calculateSoldCounts, updateProductPricesFromOffers } from '@/utils/marketplaceMetrics';

// ============================================================================
// DATABASE CLIENT & CONSTANTS
// ============================================================================
const prisma = new PrismaClient();

// Pagination limits to prevent excessive data fetching
const MAX_DEFAULT_LIMIT = 100;        // Default max limit for most queries
const MAX_PRODUCT_LIMIT = 1000;      // Max limit for product queries (larger dataset)
const MAX_MARKETPLACE_LIMIT = 200;   // Max limit for marketplace product queries

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

// Pagination metadata for connection-based queries
type PaginationInfo = {
  page: number;
  limit: number;
  totalCount: number;
  totalPages: number;
};

// Generic connection result structure (used for paginated queries)
type ConnectionResult<T> = {
  nodes: T[];
  pagination: PaginationInfo;
};

// ============================================================================
// JSON SCALAR PARSING
// ============================================================================
// Handles parsing of JSON values from GraphQL literals (for JSONObject scalar)

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

// ============================================================================
// JSON OBJECT SCALAR TYPE
// ============================================================================
// Custom scalar for handling arbitrary JSON objects in GraphQL
// Used for flexible fields like product attributes, promotion details, etc.

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

// ============================================================================
// GRAPHQL SCHEMA DEFINITION
// ============================================================================
// Defines all types, queries, and mutations available in the GraphQL API
// Organized by domain: Products, Orders, Offers, Buyers, Suppliers, etc.

const typeDefs = /* GraphQL */ `
  # Custom scalar for arbitrary JSON objects
  scalar JSONObject

  # Pagination metadata type
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

    # Get a single offer by ID or offerId
    offer(userId: Int!, id: String!): Offer

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

  # ============================================================================
  # PRODUCT MUTATIONS
  # ============================================================================
  # Mutations for creating, updating, and deleting products
  # These replace the REST POST, PUT, and DELETE endpoints

  type Mutation {
    # Create a new product with variants and variant options
    # Returns the created product with all related data
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

    # Update an existing product by ID or productId
    # Supports partial updates - only provided fields will be updated
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

    # Delete a product by ID or productId
    # Returns success status and deleted product data
    deleteProduct(
      userId: Int!
      id: String!
    ): DeleteProductResult!

    # Special action: Reset original prices for all products of a user
    # Sets originalSellingPrice = sellingPrice for all variant options
    resetOriginalPrices(userId: Int!): ActionResult!

    # Special action: Apply active offers to all products
    # Updates product prices based on active offers and discount types
    applyOffersToAllProducts(userId: Int!): ActionResult!

    # Special action: Force update prices from offers
    # Ensures all variant options have originalSellingPrice set, then applies offers
    forceUpdatePrices(userId: Int!): ActionResult!

    # Special action: Reset prices for a specific product
    # Resets variant option prices to their original selling prices
    resetProductPrices(userId: Int!, productId: String!): ActionResult!

    # Publish or unpublish a product in the marketplace
    publishMarketplaceProduct(
      userId: Int!
      productId: String!
      action: String!
    ): MarketplacePublishResult!

    # ============================================================================
    # OFFER MUTATIONS
    # ============================================================================
    # Mutations for creating, updating, and deleting offers/promotions
    # These replace the REST POST, PUT, and DELETE endpoints for offers

    # Create a new offer with discount types, products, date ranges, and time slots
    # Returns the created offer with all related data
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

    # Update an existing offer by ID or offerId
    # Supports partial updates - only provided fields will be updated
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

    # Delete an offer by ID or offerId
    # Returns success status and deleted offer data
    deleteOffer(
      userId: Int!
      id: String!
    ): DeleteOfferResult!
  }

  # ============================================================================
  # OFFER INPUT TYPES
  # ============================================================================
  # Input types for offer mutations

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

  # ============================================================================
  # OFFER RESULT TYPES
  # ============================================================================
  # Result types for offer mutations

  type DeleteOfferResult {
    success: Boolean!
    deleted: Offer
  }

  # Input types for product mutations
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

  # Result types for mutations
  type DeleteProductResult {
    success: Boolean!
    deleted: Product
  }

  type ActionResult {
    success: Boolean!
    message: String!
  }
`;

// ============================================================================
// PAGINATION HELPERS
// ============================================================================

// Sanitizes pagination parameters to ensure safe values
// Ensures page >= 1, limit is within bounds, and respects max limit
const sanitizePagination = (page = 1, limit = 20, max = MAX_DEFAULT_LIMIT) => {
  const safePage = Number.isFinite(page) && page > 0 ? Math.floor(page) : 1;
  const safeLimit = Number.isFinite(limit) && limit > 0 ? Math.min(Math.floor(limit), max) : Math.min(20, max);
  return { page: safePage, limit: safeLimit };
};

// Builds pagination metadata object for response
const buildPaginationInfo = (page: number, limit: number, totalCount: number): PaginationInfo => ({
  page,
  limit,
  totalCount,
  totalPages: Math.max(1, Math.ceil(totalCount / limit)),
});

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

// Checks if a string ID is numeric (for determining if it's a database ID vs productId)
const isNumericId = (value: string) => /^\d+$/.test(value);

// Parses money values from strings (handles comma separators) or numbers
// Used for converting currency strings to numbers for calculations
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

// Converts Date objects to ISO string format for GraphQL responses
const asISOString = (value?: Date | null) => (value ? value.toISOString() : null);

// ============================================================================
// VARIANT OPTION MAPPING
// ============================================================================
// Defines which fields to select when fetching variant options from Prisma

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

// Maps Prisma VariantOption to GraphQL ProductVariantOption type
// Handles null values and type conversions
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

// ============================================================================
// OFFER PROCESSING
// ============================================================================
// Functions for handling product offers, discounts, and promotions

type ActiveOfferPayload = Prisma.OfferGetPayload<{
  include: {
    offerProducts: true;
    offerDiscountTypes: true;
  };
}>;

// Builds offer metadata (badge, discount type, promotion details) from discount types
// Determines the appropriate badge label based on available discount types
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

// ============================================================================
// SELLER INFORMATION
// ============================================================================
// Includes user and company data for building seller info in marketplace products

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

// Builds seller information object from product's user and company data
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

// Fetches active offers for a list of product IDs and builds a map
// Returns Map<productId, ActiveOfferPayload[]> for efficient lookup
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

// ============================================================================
// PRODUCT MAPPING
// ============================================================================
// Maps Prisma Product to GraphQL Product type
// Handles variant options, legacy variants, and offer metadata

const mapProduct = (
  product: Prisma.ProductGetPayload<{
    include: {
      variantOptions: { select: typeof variantOptionSelect };
      variants: true;
      user: typeof productSellerInclude.include.user;
    };
  }>,
  offerMap: Map<string, ActiveOfferPayload[]>,
  soldCountMap?: Map<string, string>
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

// ============================================================================
// PRODUCT QUERY RESOLVERS
// ============================================================================
// Functions that fetch products with pagination, filtering, and search

// Fetches paginated products with optional search, status, and productType filters
// Returns products with active offer metadata attached
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

// Fetches a single product by ID (numeric) or productId (string)
// Supports both database ID and custom productId lookup
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

  const [offerMap, soldCountMap] = await Promise.all([
    fetchActiveOffersMap([product.productId], userId),
    calculateSoldCounts(prisma, [product.productId]),
  ]);
  return mapProduct(product, offerMap, soldCountMap);
};

// Fetches published marketplace products with pagination
// Only returns products that are published and have variant options
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

// ============================================================================
// OFFER QUERY RESOLVERS
// ============================================================================

// Maps Prisma Offer to GraphQL Offer type
// Includes discount types, date ranges, time slots, and products
const mapOffer = (
  offer: Prisma.OfferGetPayload<{
    include: {
      offerDiscountTypes: true;
      dateRanges: true;
      timeSlots: true;
      offerProducts: true;
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

// Fetches paginated offers with optional status and type filters
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

// Fetches a single offer by ID (string) or offerId (string)
// Supports both database ID and custom offerId lookup
const fetchSingleOffer = async (args: {
  userId: number;
  id: string;
}): Promise<ReturnType<typeof mapOffer> | null> => {
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

// ============================================================================
// BUYER QUERY RESOLVERS
// ============================================================================

// Maps Prisma Buyer to GraphQL Buyer type
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

// Fetches paginated buyers with optional search, status, and businessType filters
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

// ============================================================================
// SUPPLIER QUERY RESOLVERS
// ============================================================================

// Maps Prisma Supplier to GraphQL Supplier type
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

// Fetches paginated suppliers with optional search, status, and businessType filters
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

// ============================================================================
// ORDER QUERY RESOLVERS
// ============================================================================

// Maps Prisma OrderItem to GraphQL OrderItem type
// Handles both live product data and snapshot data from deleted products
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

// Maps Prisma Order to GraphQL Order type
// Includes buyer, seller, and order items with full details
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

// Fetches paginated orders with optional status filter
// Excludes deleted orders and optionally excludes archived orders
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

// Fetches paginated marketplace orders for a mobile user
// Uses buyerId prefix matching to find orders for marketplace users
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

// ============================================================================
// MARKETPLACE USER QUERY RESOLVERS
// ============================================================================

// Fetches marketplace user profile by ID
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

// ============================================================================
// USER ACTIVITY QUERY RESOLVERS
// ============================================================================

// Fetches user activities (favorites, viewed, purchased, cart) by type
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

// ============================================================================
// DASHBOARD QUERY RESOLVERS
// ============================================================================

// Builds dashboard snapshot with orders, products, buyers, and suppliers
// Used for the main dashboard home page
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

// ============================================================================
// PRODUCT MUTATION RESOLVERS
// ============================================================================

// Creates a new product with variants and variant options
// Handles both new variantOptions structure and legacy variants structure
async function createProduct(args: {
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
}): Promise<ReturnType<typeof mapProduct>> {
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

  // Generate unique productId if not provided
  let finalProductId = productId || generateUniqueProductId();

  // Check for unique productId
  const existingProduct = await prisma.product.findFirst({
    where: { productId: finalProductId, userId },
  });

  if (existingProduct) {
    finalProductId = generateUniqueProductId();
  }

  // Determine final status and marketplaceStatus
  const finalStatus = status || 'Draft';
  const finalMarketplaceStatus = finalStatus === 'Published' ? 'Published' : 'Not Published';

  // Sanitize and prepare product data
  const productData = {
    productId: finalProductId,
    sku: sku || '',
    name: name.trim(),
    description: description.trim(),
    productType: productType.trim(),
    brand: brand.trim(),
    supplier: supplier.trim(),
    status: finalStatus,
    marketplaceStatus: finalMarketplaceStatus, // Set marketplaceStatus based on status
    productCategory: productCategory.trim(),
    catalogName: catalogName?.trim() || '',
    images: Array.isArray(images) ? images : [],
    halalCertified: halalCertified === true,
    bpomApproved: bpomApproved === true,
    originalProduct: originalProduct !== false,
    returnPolicyDays: returnPolicyDays !== undefined ? Number(returnPolicyDays) : 7,
    userId,
    // Set publishedAt timestamp when publishing
    ...(finalStatus === 'Published' && { publishedAt: new Date() }),
  };

  // Create product with variants
  const product = await prisma.product.create({
    data: {
      ...productData,
      // New variant structure: definitions and options
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
            create: variantOptions.map((option) => ({
              variantName: option.variantName,
              attributes: option.attributes as Prisma.InputJsonValue,
              sku: option.sku || null,
              purchasePrice: String(
                parseNumberByCurrency(option.purchasePrice || '', currency || undefined),
              ),
              sellingPrice: String(
                parseNumberByCurrency(option.sellingPrice || '', currency || undefined),
              ),
              originalSellingPrice: option.originalSellingPrice && typeof option.originalSellingPrice === 'string'
                ? String(parseNumberByCurrency(option.originalSellingPrice, currency || undefined))
                : null,
              moq: option.moq,
              stockQuantity: option.stockQuantity || 0,
              lowStockThreshold: option.lowStockThreshold || 0,
              stockStatus: option.stockStatus || 'In Stock',
              isDefault: option.isDefault || false,
              isActive: option.isActive !== false,
            })),
          }
        : undefined,
      // Legacy variants: convert to variantOptions if provided
      // Note: Legacy variants are now stored as variantOptions for consistency
      ...(variants && !variantOptions && !variantDefinitions
        ? {
            variantOptions: {
              create: variants.map((variant) => ({
                variantName: variant.variantName,
                attributes: (variant.attributes || {}) as Prisma.InputJsonValue,
                sku: variant.sku || null,
                purchasePrice: String(
                  parseNumberByCurrency(variant.purchasePrice || '', currency || undefined),
                ),
                sellingPrice: String(
                  parseNumberByCurrency(variant.sellingPrice || '', currency || undefined),
                ),
                originalSellingPrice: variant.originalSellingPrice && typeof variant.originalSellingPrice === 'string'
                  ? String(parseNumberByCurrency(variant.originalSellingPrice, currency || undefined))
                  : null,
                moq: variant.moq || null,
                stockQuantity: variant.stockQuantity || 0,
                lowStockThreshold: variant.lowStockThreshold || 0,
                stockStatus: variant.stockStatus || 'In Stock',
                isDefault: variant.isDefault || false,
                isActive: variant.isActive !== false,
              })),
            },
          }
        : {}),
    },
    include: {
      variantOptions: { select: variantOptionSelect },
      variants: true,
      user: productSellerInclude.include.user,
    },
  });

  // Update product prices based on active offers after creation
  await updateProductPricesFromOffers(prisma, userId);

  // Fetch the updated product with new prices
  const updatedProduct = await prisma.product.findUnique({
    where: { id: product.id },
    include: {
      variantOptions: { select: variantOptionSelect },
      variants: true,
      user: productSellerInclude.include.user,
    },
  });

  if (!updatedProduct) {
    throw new Error('Failed to fetch created product');
  }

  // ============================================================================
  // WEBSOCKET BROADCAST FOR REAL-TIME MARKETPLACE UPDATES
  // ============================================================================
  // Broadcast product updates to all connected WebSocket clients (marketplace)
  // This ensures products appear in real-time when created/published
  // The marketplace listens for 'product_updated' and 'prices_updated' messages
  // and refreshes the product list automatically
  if (updatedProduct.productId) {
    try {
      // Always broadcast product update (marketplace will filter by status)
      await broadcastProductUpdate([updatedProduct.productId]);
      // Always broadcast price update (for real-time price changes)
      await broadcastPriceUpdate([updatedProduct.productId]);
    } catch (error) {
      // Silently fail if WebSocket server is not running or broadcast fails
      // This should not block the mutation from completing
    }
  }

  // Map and return the product
  const [offerMap, soldCountMap] = await Promise.all([
    fetchActiveOffersMap([updatedProduct.productId], userId),
    calculateSoldCounts(prisma, [updatedProduct.productId]),
  ]);
  return mapProduct(updatedProduct, offerMap, soldCountMap);
}

// Updates an existing product by ID or productId
// Supports partial updates - only provided fields will be updated
async function updateProduct(args: {
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
}): Promise<ReturnType<typeof mapProduct>> {
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

  // Build where clause - support both numeric ID and productId
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

  // Build update data (only include provided fields)
  const cleanUpdateData: Partial<{
    sku: string;
    name: string;
    description: string;
    productType: string;
    brand: string;
    supplier: string;
    status: string;
    productCategory: string;
    catalogName: string;
    images: string[];
    halalCertified: boolean;
    bpomApproved: boolean;
    originalProduct: boolean;
    returnPolicyDays: number;
  }> = {};

  if (sku !== undefined) cleanUpdateData.sku = String(sku);
  if (name !== undefined) cleanUpdateData.name = String(name);
  if (description !== undefined) cleanUpdateData.description = String(description);
  if (productType !== undefined) cleanUpdateData.productType = String(productType);
  if (brand !== undefined) cleanUpdateData.brand = String(brand);
  if (supplier !== undefined) cleanUpdateData.supplier = String(supplier);
  if (status !== undefined) {
    const newStatus = String(status);
    cleanUpdateData.status = newStatus;
    // Sync marketplaceStatus with status: Published -> Published, otherwise -> Not Published
    (cleanUpdateData as Record<string, unknown>).marketplaceStatus = 
      newStatus === 'Published' ? 'Published' : 'Not Published';
    // Set publishedAt timestamp when status changes to Published
    if (newStatus === 'Published') {
      (cleanUpdateData as Record<string, unknown>).publishedAt = new Date();
    }
  }
  if (productCategory !== undefined) cleanUpdateData.productCategory = String(productCategory);
  if (catalogName !== undefined) cleanUpdateData.catalogName = String(catalogName);
  if (images !== undefined) cleanUpdateData.images = Array.isArray(images) ? images : [];
  if (halalCertified !== undefined) cleanUpdateData.halalCertified = Boolean(halalCertified);
  if (bpomApproved !== undefined) cleanUpdateData.bpomApproved = Boolean(bpomApproved);
  if (originalProduct !== undefined) cleanUpdateData.originalProduct = Boolean(originalProduct);
  if (returnPolicyDays !== undefined)
    cleanUpdateData.returnPolicyDays = Number(returnPolicyDays);

  // Update product
  const product = await prisma.product.update({
    where,
    data: {
      ...cleanUpdateData,
      // New variant structure: definitions and options
      // Only update variants if variantDefinitions is provided and not empty
      ...(variantDefinitions && Array.isArray(variantDefinitions) && variantDefinitions.length > 0 && {
        variants: {
          deleteMany: {}, // Delete all existing variant definitions
          create: variantDefinitions.map((def) => ({
            variantType: def.variantType,
            options: def.options,
            position: def.position,
          })),
        },
      }),
      // Only update variant options if variantOptions is provided and not empty
      ...(variantOptions && Array.isArray(variantOptions) && variantOptions.length > 0 && {
        variantOptions: {
          deleteMany: {}, // Delete all existing variant options
          create: variantOptions.map((option) => ({
            variantName: option.variantName,
            attributes: option.attributes as Prisma.InputJsonValue,
            sku: option.sku || null,
            purchasePrice: String(
              parseNumberByCurrency(option.purchasePrice || '', currency || undefined),
            ),
            sellingPrice: String(
              parseNumberByCurrency(option.sellingPrice || '', currency || undefined),
            ),
            originalSellingPrice: option.originalSellingPrice && typeof option.originalSellingPrice === 'string'
              ? String(parseNumberByCurrency(option.originalSellingPrice, currency || undefined))
              : null,
            moq: option.moq,
            stockQuantity: option.stockQuantity || 0,
            lowStockThreshold: option.lowStockThreshold || 0,
            stockStatus: option.stockStatus || 'In Stock',
            isDefault: option.isDefault || false,
            isActive: option.isActive !== false,
          })),
        },
      }),
      // Legacy variants: convert to variantOptions if provided
      // Note: Legacy variants are now stored as variantOptions for consistency
      ...(variants && !variantOptions && !variantDefinitions && {
        variantOptions: {
          deleteMany: {}, // Delete all existing variant options
          create: variants.map((variant) => ({
            variantName: variant.variantName || 'Default Variant',
            attributes: (variant.attributes || {}) as Prisma.InputJsonValue,
            sku: variant.sku || null,
            purchasePrice: String(
              parseNumberByCurrency(variant.purchasePrice || '', currency || undefined),
            ),
            sellingPrice: String(
              parseNumberByCurrency(variant.sellingPrice || '', currency || undefined),
            ),
            originalSellingPrice: variant.originalSellingPrice && typeof variant.originalSellingPrice === 'string'
              ? String(parseNumberByCurrency(variant.originalSellingPrice, currency || undefined))
              : null,
            moq: variant.moq || null,
            stockQuantity: variant.stockQuantity || 0,
            lowStockThreshold: variant.lowStockThreshold || 0,
            stockStatus: variant.stockStatus || 'In Stock',
            isDefault: variant.isDefault || false,
            isActive: variant.isActive !== false,
          })),
        },
      }),
    },
    include: {
      variantOptions: { select: variantOptionSelect },
      variants: true,
      user: productSellerInclude.include.user,
    },
  });

  // Update product prices based on active offers after update
  await updateProductPricesFromOffers(prisma, userId);

  // Fetch the updated product with new prices
  const updatedProduct = await prisma.product.findUnique({
    where: { id: product.id },
    include: {
      variantOptions: { select: variantOptionSelect },
      variants: true,
      user: productSellerInclude.include.user,
    },
  });

  if (!updatedProduct) {
    throw new Error('Failed to fetch updated product');
  }

  // ============================================================================
  // WEBSOCKET BROADCAST FOR REAL-TIME MARKETPLACE UPDATES
  // ============================================================================
  // Broadcast product updates to all connected WebSocket clients (marketplace)
  // This ensures products appear in real-time when saved/published
  // The marketplace listens for 'product_updated' and 'prices_updated' messages
  // and refreshes the product list automatically
  if (updatedProduct.productId) {
    try {
      // Always broadcast product update (marketplace will filter by status)
      await broadcastProductUpdate([updatedProduct.productId]);
      // Always broadcast price update (for real-time price changes)
      await broadcastPriceUpdate([updatedProduct.productId]);
    } catch (error) {
      // Silently fail if WebSocket server is not running or broadcast fails
      // This should not block the mutation from completing
    }
  }

  // Map and return the product
  const [offerMap, soldCountMap] = await Promise.all([
    fetchActiveOffersMap([updatedProduct.productId], userId),
    calculateSoldCounts(prisma, [updatedProduct.productId]),
  ]);
  return mapProduct(updatedProduct, offerMap, soldCountMap);
}

// Deletes a product by ID or productId
async function deleteProduct(args: {
  userId: number;
  id: string;
}): Promise<{ success: boolean; deleted: ReturnType<typeof mapProduct> | null }> {
  const { userId, id } = args;

  // Build where clause - support both numeric ID and productId
  const where = isNumericId(id)
    ? { id: Number(id), userId }
    : { productId: id, userId };

  // Find product before deletion
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

  // Map product for response
  const [offerMap, soldCountMap] = await Promise.all([
    fetchActiveOffersMap([productToDelete.productId], userId),
    calculateSoldCounts(prisma, [productToDelete.productId]),
  ]);
  const mappedProduct = mapProduct(productToDelete, offerMap, soldCountMap);

  // Delete product
  await prisma.product.delete({
    where: isNumericId(id) ? { id: Number(id) } : { productId: id },
  });

  // Broadcast product deletion via WebSocket
  try {
    await broadcastProductUpdate([productToDelete.productId]);
    await broadcastPriceUpdate([productToDelete.productId]);
  } catch (error) {
    // Ignore broadcast errors
  }

  return {
    success: true,
    deleted: mappedProduct,
  };
}

// Publishes or unpublishes a product in the marketplace
async function publishMarketplaceProduct(args: {
  userId: number;
  productId: string;
  action: string;
}): Promise<{ success: boolean; message: string; product: ReturnType<typeof mapProduct> | null }> {
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

  try {
    await broadcastProductUpdate([updatedProduct.productId]);
    await broadcastPriceUpdate([updatedProduct.productId]);
  } catch (error) {
    // Ignore broadcast errors to avoid blocking mutation completion
  }

  return {
    success: true,
    message:
      normalizedAction === 'publish'
        ? 'Product published to marketplace successfully'
        : 'Product unpublished from marketplace successfully',
    product: mappedProduct,
  };
}

// Resets originalSellingPrice for all variant options of a user's products
async function resetOriginalPrices(userId: number): Promise<{ success: boolean; message: string }> {
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
  } catch (error) {
    throw new Error('Failed to reset original prices');
  }
}

// Applies active offers to all products of a user
async function applyOffersToAllProducts(
  userId: number,
): Promise<{ success: boolean; message: string }> {
  try {
    await updateProductPricesFromOffers(prisma, userId);
    return {
      success: true,
      message: 'Applied offers to all products successfully',
    };
  } catch (error) {
    throw new Error('Failed to apply offers to all products');
  }
}

// Force updates prices: ensures all variant options have originalSellingPrice, then applies offers
async function forceUpdatePrices(userId: number): Promise<{ success: boolean; message: string }> {
  try {
    await prisma.$transaction(async (tx) => {
      // First, ensure all product variants have originalSellingPrice set
      const productsWithVariants = await tx.product.findMany({
        where: { userId },
        include: {
          variants: true,
          variantOptions: true,
        },
      });

      for (const product of productsWithVariants) {
        // Update variant options (new structure)
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

      // Then apply current active offers
      await updateProductPricesFromOffers(tx, userId);
    });

    return {
      success: true,
      message: 'Product prices force updated successfully',
    };
  } catch (error) {
    throw new Error('Failed to force update prices');
  }
}

// Resets prices for a specific product to their original selling prices
async function resetProductPrices(
  userId: number,
  productId: string,
): Promise<{ success: boolean; message: string }> {
  try {
    await prisma.$transaction(async (tx) => {
      // Get the product with its variants
      const product = await tx.product.findFirst({
        where: { productId, userId },
        include: {
          variants: true,
          variantOptions: true,
        },
      });

      if (product) {
        // Reset variant options (new structure)
        if (product.variantOptions && product.variantOptions.length > 0) {
          for (const variantOption of product.variantOptions) {
            if (variantOption.originalSellingPrice) {
              // Reset to original price and clear originalSellingPrice
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
      }
    });

    return {
      success: true,
      message: 'Product prices reset to original successfully',
    };
  } catch (error) {
    throw new Error('Failed to reset product prices');
  }
}

// ============================================================================
// OFFER MUTATION HELPERS
// ============================================================================
// Helper functions for offer mutations (create, update, delete)
// These mirror the logic from the REST API endpoints

// Creates a new offer with discount types, products, date ranges, and time slots
// Returns the created offer with all related data
async function createOffer(args: {
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
}): Promise<ReturnType<typeof mapOffer>> {
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

  // Validate required fields
  if (!name || !type || !discountTypes?.length || !startDate || !endDate || !productIds?.length) {
    throw new Error('Missing required fields');
  }

  // Validate date range
  const start = new Date(startDate);
  const end = new Date(endDate);
  if (start >= end) {
    throw new Error('End date must be after start date');
  }

  // Validate discount types
  for (const discountType of discountTypes) {
    if (discountType.discountValue <= 0) {
      throw new Error('Discount value must be greater than 0');
    }
    if (discountType.discountType === 'percentage' && discountType.discountValue > 100) {
      throw new Error('Percentage discount cannot exceed 100%');
    }
  }

  // Check if products exist and belong to user
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

  // Generate unique offer ID
  const offerId = `OFF-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  // Create offer with all related data in a transaction
  const offer = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    // Create the offer
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

    // Create discount types
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

    // Create offer-product relationships
    await tx.offerProduct.createMany({
      data: productIds.map((productId: string) => ({
        offerId: createdOffer.id,
        productId,
      })),
    });

    // Create date ranges
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

    // Create time slots
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

  // Update product prices based on all active offers for this user
  await prisma.$transaction(async (tx) => {
    // First, ensure all product variant options have originalSellingPrice set
    const productsWithVariantOptions = await tx.product.findMany({
      where: { userId },
      include: { variantOptions: true },
    });

    for (const product of productsWithVariantOptions) {
      for (const vo of product.variantOptions) {
        if (!vo.originalSellingPrice || vo.originalSellingPrice === '') {
          await tx.variantOption.update({
            where: { id: vo.id },
            data: { originalSellingPrice: vo.sellingPrice },
          });
        }
      }
    }

    // Apply current active offers
    await updateProductPricesFromOffers(tx, userId);
  });

  // Fetch the created offer with discount types, date ranges, time slots, and products
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

  // ============================================================================
  // WEBSOCKET BROADCAST FOR REAL-TIME MARKETPLACE UPDATES
  // ============================================================================
  // Broadcast offer update to all connected WebSocket clients (marketplace)
  // This ensures offers appear in real-time when created/updated
  // The marketplace listens for 'offer_updated' and 'prices_updated' messages
  // and refreshes the product list automatically
  try {
    await broadcastOfferUpdate(createdOfferWithRelations.id, productIds);
    await broadcastPriceUpdate(productIds);
  } catch (error) {
    // Silently fail if WebSocket server is not running or broadcast fails
    // This should not block the mutation from completing
  }

  return mapOffer(createdOfferWithRelations);
}

// Updates an existing offer by ID or offerId
// Supports partial updates - only provided fields will be updated
async function updateOffer(args: {
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
}): Promise<ReturnType<typeof mapOffer>> {
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

  // Build where clause - support both database ID and offerId
  const where = {
    OR: [{ id }, { offerId: id }],
    userId,
  };

  // Find the offer first
  const existingOffer = await prisma.offer.findFirst({
    where,
    include: {
      offerProducts: true,
    },
  });

  if (!existingOffer) {
    throw new Error('Offer not found or you do not have permission to update it');
  }

  // Build update data (only include provided fields)
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

  // Validate date range if both dates are provided
  if (startDate && endDate) {
    const start = new Date(startDate);
    const end = new Date(endDate);
    if (start >= end) {
      throw new Error('End date must be after start date');
    }
  }

  // Update offer with related data in a transaction
  const updatedOffer = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    // Update the offer
    const offer = await tx.offer.update({
      where: { id: existingOffer.id },
      data: cleanUpdateData,
    });

    // Update discount types if provided
    if (discountTypes && discountTypes.length > 0) {
      // Delete existing discount types
      await tx.offerDiscountType.deleteMany({
        where: { offerId: offer.id },
      });

      // Create new discount types
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

    // Update products if provided (including empty array to remove all products)
    if (productIds !== undefined && productIds !== null) {
      // Delete existing offer-product relationships first
      await tx.offerProduct.deleteMany({
        where: { offerId: offer.id },
      });

      // If productIds array has items, validate and create new relationships
      if (productIds.length > 0) {
        // Validate products belong to user
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

        // Create new offer-product relationships
        await tx.offerProduct.createMany({
          data: productIds.map((productId: string) => ({
            offerId: offer.id,
            productId,
          })),
        });
      }
      // If productIds is empty array, we've already deleted all relationships above
    }

    // Update date ranges if provided
    if (dateRanges !== undefined) {
      // Delete existing date ranges
      await tx.dateRange.deleteMany({
        where: { offerId: offer.id },
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

    // Update time slots if provided
    if (timeSlots !== undefined) {
      // Delete existing time slots
      await tx.timeSlot.deleteMany({
        where: { offerId: offer.id },
      });

      // Create new time slots if provided
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

  // Update product prices based on all active offers for this user
  await prisma.$transaction(async (tx) => {
    await updateProductPricesFromOffers(tx, userId);
  });

  // Fetch the updated offer with discount types, date ranges, and time slots
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

  // ============================================================================
  // WEBSOCKET BROADCAST FOR REAL-TIME MARKETPLACE UPDATES
  // ============================================================================
  // Broadcast offer update to all connected WebSocket clients (marketplace)
  const affectedProductIds = updatedOfferWithRelations.offerProducts.map((op) => op.productId);
  try {
    await broadcastOfferUpdate(updatedOfferWithRelations.id, affectedProductIds);
    await broadcastPriceUpdate(affectedProductIds);
  } catch (error) {
    // Silently fail if WebSocket server is not running or broadcast fails
  }

  return mapOffer(updatedOfferWithRelations);
}

// Deletes an offer by ID or offerId
// Returns success status and deleted offer data
async function deleteOffer(args: {
  userId: number;
  id: string;
}): Promise<{ success: boolean; deleted: ReturnType<typeof mapOffer> | null }> {
  const { userId, id } = args;

  // Build where clause - support both database ID and offerId
  const where = {
    OR: [{ id }, { offerId: id }],
    userId,
  };

  // Find offer before deletion
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

  // Delete the offer (cascade will handle related records)
  await prisma.offer.delete({
    where: { id: offerToDelete.id },
  });

  // Update product prices after offer deletion
  await prisma.$transaction(async (tx) => {
    await updateProductPricesFromOffers(tx, userId);
  });

  // ============================================================================
  // WEBSOCKET BROADCAST FOR REAL-TIME MARKETPLACE UPDATES
  // ============================================================================
  // Broadcast offer deletion to all connected WebSocket clients (marketplace)
  try {
    await broadcastOfferUpdate(offerToDelete.id, affectedProductIds);
    await broadcastPriceUpdate(affectedProductIds);
  } catch (error) {
    // Silently fail if WebSocket server is not running or broadcast fails
  }

  return {
    success: true,
    deleted: mapOffer(offerToDelete),
  };
}

// ============================================================================
// GRAPHQL RESOLVERS
// ============================================================================
// Maps GraphQL queries and mutations to their resolver functions
// Organized by Query (read operations) and Mutation (write operations)

const resolvers = {
  // Custom scalar resolver
  JSONObject: JSONObjectScalar,

  // Query resolvers (read operations)
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
    offer: (_: unknown, args: Parameters<typeof fetchSingleOffer>[0]) =>
      fetchSingleOffer(args),
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

  // Mutation resolvers (write operations)
  Mutation: {
    createProduct: (_: unknown, args: Parameters<typeof createProduct>[0]) => createProduct(args),
    updateProduct: (_: unknown, args: Parameters<typeof updateProduct>[0]) => updateProduct(args),
    deleteProduct: (_: unknown, args: Parameters<typeof deleteProduct>[0]) => deleteProduct(args),
    resetOriginalPrices: (_: unknown, args: { userId: number }) => resetOriginalPrices(args.userId),
    applyOffersToAllProducts: (_: unknown, args: { userId: number }) =>
      applyOffersToAllProducts(args.userId),
    forceUpdatePrices: (_: unknown, args: { userId: number }) => forceUpdatePrices(args.userId),
    resetProductPrices: (_: unknown, args: { userId: number; productId: string }) =>
      resetProductPrices(args.userId, args.productId),
    publishMarketplaceProduct: (
      _: unknown,
      args: Parameters<typeof publishMarketplaceProduct>[0]
    ) => publishMarketplaceProduct(args),
    createOffer: (_: unknown, args: Parameters<typeof createOffer>[0]) => createOffer(args),
    updateOffer: (_: unknown, args: Parameters<typeof updateOffer>[0]) => updateOffer(args),
    deleteOffer: (_: unknown, args: Parameters<typeof deleteOffer>[0]) => deleteOffer(args),
  },
};

// ============================================================================
// APOLLO SERVER SETUP
// ============================================================================
// Initializes Apollo Server with schema and resolvers
// Exports GET and POST handlers for Next.js API route

const server = new ApolloServer({
  typeDefs,
  resolvers,
});

const handler = startServerAndCreateNextHandler<NextRequest>(server);

export { handler as GET, handler as POST };

