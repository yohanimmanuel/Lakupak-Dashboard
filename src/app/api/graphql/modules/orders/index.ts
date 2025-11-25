import { buildMobileBuyerId } from '@/utils/buyerSync';
import type { Prisma } from '@/generated/prisma';
import { prisma } from '../common/prisma';
import { sanitizePagination, buildPaginationInfo } from '../common/utils';

const orderInclude = {
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
} as const;

export const ordersTypeDefs = /* GraphQL */ `
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

  type BuyerSummary {
    buyerId: String
    storeName: String
    owner: String
    email: String
    phone: String
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

  extend type Query {
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
  }
`;

const mapOrderItems = (
  items: Array<
    Prisma.OrderItemGetPayload<{
      include: { product: true };
    }>
  >,
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
    include: typeof orderInclude;
  }>,
) => ({
  id: order?.id ? String(order.id) : null,
  orderId: order?.orderId ?? '',
  buyerId: order?.buyerId ?? null,
  orderStatus: order?.orderStatus ?? '',
  paymentStatus: order?.paymentStatus ?? '',
  deliveryMethod: order?.deliveryMethod ?? null,
  deliveryOption: order?.deliveryOption ?? null,
  shippingMethodLabel: order?.shippingMethodLabel ?? null,
  shippingMethod: order?.shippingMethod ?? null,
  subtotal: order?.subtotal ?? 0,
  discounts: order?.discounts ?? 0,
  shippingFee: order?.shippingFee ?? 0,
  totalAmount: order?.totalAmount ?? 0,
  paymentTerms: order?.paymentTerms ?? null,
  totalOrders: order?.totalOrders ?? null,
  contactPerson: order?.contactPerson ?? order?.storeName ?? null,
  storeName: order?.storeName ?? null,
  contactPhone: order?.contactPhone ?? null,
  customerEmail: order?.customerEmail ?? null,
  deliveryAddress: order?.deliveryAddress ?? null,
  preferredDeliveryDate: order?.preferredDeliveryDate?.toISOString() ?? null,
  preferredDeliveryTime: order?.preferredDeliveryTime ?? null,
  preferredPickupDate: order?.preferredPickupDate?.toISOString() ?? null,
  preferredPickupTime: order?.preferredPickupTime ?? null,
  assignedLogistics: order?.assignedLogistics ?? null,
  trackingNumber: order?.trackingNumber ?? null,
  deliveryNote: order?.deliveryNote ?? null,
  deliveryConfirmation: order?.deliveryConfirmation ?? null,
  pod: order?.pod ?? null,
  orderDate: order?.orderDate?.toISOString() ?? '',
  createdAt: order?.createdAt?.toISOString() ?? null,
  updatedAt: order?.updatedAt?.toISOString() ?? null,
  acceptedBy: order?.acceptedBy ?? null,
  acceptedAt: order?.acceptedAt?.toISOString() ?? null,
  buyer: order?.buyer
    ? {
        buyerId: order.buyer.buyerId,
        storeName: order.buyer.storeName,
        owner: order.buyer.owner,
        email: order.buyer.email,
        phone: order.buyer.phone,
      }
    : null,
  seller: order?.user
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
  orderItems: mapOrderItems(order?.orderItemsRel ?? []),
});

const fetchOrdersConnection = async (args: {
  userId: number;
  page?: number;
  limit?: number;
  status?: string | null;
  includeArchived?: boolean;
}) => {
  const { userId, page = 1, limit = 20, status, includeArchived = false } = args;
  const { page: safePage, limit: safeLimit } = sanitizePagination(page, limit, 200);

  const whereClause = {
    userId,
    isDeleted: false,
    archivedAt: includeArchived ? undefined : null,
    ...(status && status !== 'All' ? { orderStatus: status } : {}),
  };

  const [orders, totalCount] = await Promise.all([
    prisma.order.findMany({
      where: whereClause,
      skip: (safePage - 1) * safeLimit,
      take: safeLimit,
      orderBy: { createdAt: 'desc' },
      include: orderInclude,
    }),
    prisma.order.count({ where: whereClause }),
  ]);

  return {
    nodes: orders.map((order) => mapOrder(order as never)),
    pagination: buildPaginationInfo(safePage, safeLimit, totalCount),
  };
};

const fetchMarketplaceOrdersConnection = async (args: {
  marketplaceUserId: number;
  page?: number;
  limit?: number;
}) => {
  const { marketplaceUserId, page = 1, limit = 10 } = args;
  const { page: safePage, limit: safeLimit } = sanitizePagination(page, limit, 100);

  const baseBuyerId = buildMobileBuyerId(marketplaceUserId);

  const whereClause = {
    buyerId: { startsWith: baseBuyerId },
  };

  const [orders, totalCount] = await Promise.all([
    prisma.order.findMany({
      where: whereClause,
      skip: (safePage - 1) * safeLimit,
      take: safeLimit,
      orderBy: { orderDate: 'desc' },
      include: orderInclude,
    }),
    prisma.order.count({ where: whereClause }),
  ]);

  return {
    nodes: orders.map((order) => mapOrder(order as never)),
    pagination: buildPaginationInfo(safePage, safeLimit, totalCount),
  };
};

export const ordersResolvers = {
  Query: {
    orders: (_: unknown, args: Parameters<typeof fetchOrdersConnection>[0]) => fetchOrdersConnection(args),
    marketplaceOrders: (_: unknown, args: Parameters<typeof fetchMarketplaceOrdersConnection>[0]) =>
      fetchMarketplaceOrdersConnection(args),
  },
};

export { fetchOrdersConnection, fetchMarketplaceOrdersConnection };

