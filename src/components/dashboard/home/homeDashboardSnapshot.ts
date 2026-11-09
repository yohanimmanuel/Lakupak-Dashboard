import type { Order, OrderItem } from '@/types/order';
import type { Product } from '@/types/product';
import type { Buyer, Supplier } from '@/types/client';

export const DASHBOARD_SNAPSHOT_QUERY = `
  query DashboardSnapshot(
    $userId: Int!
    $ordersLimit: Int!
    $productsLimit: Int!
    $contactsLimit: Int!
  ) {
    dashboardSnapshot(
      userId: $userId
      ordersLimit: $ordersLimit
      productsLimit: $productsLimit
      contactsLimit: $contactsLimit
    ) {
      orders {
        id
        orderId
        buyerId
        orderStatus
        paymentStatus
        deliveryMethod
        deliveryOption
        shippingMethodLabel
        shippingMethod
        subtotal
        discounts
        shippingFee
        totalAmount
        paymentTerms
        totalOrders
        contactPerson
        storeName
        contactPhone
        customerEmail
        deliveryAddress
        preferredPickupDate
        preferredPickupTime
        assignedLogistics
        trackingNumber
        deliveryNote
        deliveryConfirmation
        pod
        orderDate
        paidAt
        createdAt
        updatedAt
        acceptedBy
        acceptedAt
        estimatedArrivalDate
        estimatedArrivalMinDays
        estimatedArrivalMaxDays
        deliveredAt
        orderItems {
          productId
          productName
          category
          brand
          description
          images
          productDeleted
          packageQuantity
          packageType
          piecesPerPackage
          pricePerPackage
          subtotal
          variantId
          variantOptionId
          offerApplied
          offerBadgeSnapshot
          offerNameSnapshot
          promotionDetailsSnapshot
          variantNameSnapshot
          productNameSnapshot
          productSkuSnapshot
          productTypeSnapshot
          originalPriceSnapshot
          discountPercentage
          discountAmount
          moqSnapshot
        }
      }
      products {
        id
        productId
        sku
        name
        description
        productType
        brand
        supplier
        status
        productCategory
        catalogName
        images
        halalCertified
        bpomApproved
        originalProduct
        returnPolicyDays
        stockQuantity
        lowStockThreshold
        stockStatus
        variantOptions {
          id
          variantName
          sku
          purchasePrice
          sellingPrice
          originalSellingPrice
          moq
          stockQuantity
          lowStockThreshold
          stockStatus
          isDefault
          isActive
          attributes
        }
        hasActiveOffer
        offerBadge
        offerId
        offerName
        discountType
        discountValue
        promotionDetails
        originalPrice
      }
      buyers {
        id
        buyerId
        avatar
        owner
        storeName
        email
        phone
        businessType
        address
        status
        logistics
        notes
        orderDetails
        avgMonthlySpending
        avgMonthlyOrders
        userId
      }
      suppliers {
        id
        supplierId
        name
        contact
        email
        phone
        businessType
        address
        status
        logistics
        notes
        supplies
        avgMonthlyPurchaseValue
        totalPurchases
        totalSupplies
        onTimeDeliveryRate
        userId
      }
      salesSummary {
        totalAgents
        activeAgents
        teams {
          id
          name
          memberCount
        }
      }
      aggregates {
        totalRevenue
        pendingRevenue
        totalOrders
        paidOrders
        unpaidOrders
        avgOrderValue
        totalPiecesSold
        totalUnitsSold
        uniqueCustomers
      }
    }
  }
`;

const ORDER_STATUS_VALUES: Order['orderStatus'][] = [
  'Pending',
  'Confirmed',
  'Packed',
  'Shipped',
  'Delivered',
  'Received',
  'Failed',
  'Cancelled',
  'Returned',
];

const PAYMENT_STATUS_VALUES: Order['paymentStatus'][] = ['Unpaid', 'Paid'];

const DELIVERY_METHOD_VALUES: Order['deliveryMethod'][] = [
  'Self Pickup',
  'Seller/Distributor Delivery',
  'Buyer-arranged Courier',
];

const OFFER_BADGES: Array<NonNullable<Product['offerBadge']>> = [
  'Discount',
  'Promotion',
  'All Offers',
  'Offer',
];

const DISCOUNT_TYPES: Array<NonNullable<Product['discountType']>> = [
  'percentage',
  'fixed',
  'buy_x_get_y',
];

export function parseNumber(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    let cleaned = value.replace(/[^\d.,-]/g, '').replace(/\s+/g, '');
    if (!cleaned) {
      return 0;
    }

    let sign = '';
    if (cleaned.startsWith('-')) {
      sign = '-';
      cleaned = cleaned.slice(1);
    }

    const lastComma = cleaned.lastIndexOf(',');
    const lastDot = cleaned.lastIndexOf('.');
    let decimalSeparator: ',' | '.' | null = null;

    if (lastComma !== -1 && lastDot !== -1) {
      decimalSeparator = lastComma > lastDot ? ',' : '.';
    } else if (lastComma !== -1) {
      const digitsAfter = cleaned.length - lastComma - 1;
      if (digitsAfter > 0 && digitsAfter <= 2) {
        decimalSeparator = ',';
      }
    } else if (lastDot !== -1) {
      const digitsAfter = cleaned.length - lastDot - 1;
      if (digitsAfter > 0 && digitsAfter <= 2) {
        decimalSeparator = '.';
      }
    }

    let normalized = '';

    if (decimalSeparator) {
      const separatorIndex =
        decimalSeparator === ','
          ? cleaned.lastIndexOf(',')
          : cleaned.lastIndexOf('.');
      const integerPart = cleaned
        .slice(0, separatorIndex)
        .replace(/[.,]/g, '');
      const decimalPart = cleaned
        .slice(separatorIndex + 1)
        .replace(/[^\d]/g, '');
      normalized = `${sign}${integerPart}.${decimalPart}`;
    } else {
      normalized = `${sign}${cleaned.replace(/[^\d]/g, '')}`;
    }

    if (!normalized || normalized === '-' || normalized === '.')
      return 0;

    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function parseInteger(value: unknown): number | undefined {
  const parsed = parseNumber(value);
  if (!Number.isFinite(parsed)) {
    return undefined;
  }
  const rounded = Math.round(parsed);
  return Number.isNaN(rounded) ? undefined : rounded;
}

export function parseString(value: unknown, fallback = ''): string {
  if (typeof value === 'string' && value.trim().length > 0) {
    return value;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return fallback;
}

function parseOptionalString(value: unknown): string | undefined {
  const parsed = parseString(value);
  return parsed.length > 0 ? parsed : undefined;
}

function parseOptionalNumber(value: unknown): number | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value === 'number') return value;
  const numValue = Number(value);
  return isNaN(numValue) ? undefined : numValue;
}

function parseDate(value: unknown): Date {
  const candidate = value instanceof Date ? value : new Date(parseString(value, ''));
  if (!Number.isNaN(candidate.getTime())) {
    return candidate;
  }
  return new Date();
}

function parseOptionalDateValue(value: unknown): string | Date | undefined {
  if (value instanceof Date) {
    return value;
  }
  if (typeof value === 'string' && value.trim().length > 0) {
    return value;
  }
  return undefined;
}

function isOrderStatus(value: unknown): value is Order['orderStatus'] {
  return ORDER_STATUS_VALUES.includes(value as Order['orderStatus']);
}

function isPaymentStatus(value: unknown): value is Order['paymentStatus'] {
  return PAYMENT_STATUS_VALUES.includes(value as Order['paymentStatus']);
}

function isDeliveryMethod(value: unknown): value is Order['deliveryMethod'] {
  return DELIVERY_METHOD_VALUES.includes(value as Order['deliveryMethod']);
}

function isOfferBadge(
  value: unknown,
): OrderItem['offerBadgeSnapshot'] {
  const allowed: NonNullable<OrderItem['offerBadgeSnapshot']>[] = [
    'Discount',
    'Promotion',
    'All Offers',
    'Offer',
  ];
  return allowed.includes(value as NonNullable<OrderItem['offerBadgeSnapshot']>)
    ? (value as OrderItem['offerBadgeSnapshot'])
    : undefined;
}

export function normalizeOrderItem(raw: Record<string, unknown>): OrderItem {
  const packageQuantity = parseInteger(raw.packageQuantity) ?? 0;
  const piecesPerPackage = parseInteger(raw.piecesPerPackage) ?? 1;

  return {
    productId:
      typeof raw.productId === 'string'
        ? raw.productId
        : raw.productId != null
          ? String(raw.productId)
          : null,
    productName: parseString(
      raw.productName,
      parseString(raw.productNameSnapshot, 'Product'),
    ),
    category: parseString(
      raw.category,
      parseString(raw.productTypeSnapshot, 'Uncategorized'),
    ),
    subtotal: parseNumber(raw.subtotal),
    packageType: parseOptionalString(raw.packageType),
    piecesPerPackage,
    packageQuantity,
    pricePerPackage: parseNumber(raw.pricePerPackage),
    variantId: parseInteger(raw.variantId) ?? undefined,
    variantOptionId: parseInteger(raw.variantOptionId) ?? undefined,
    productDeleted: raw.productDeleted === true,
    productNameSnapshot: parseOptionalString(raw.productNameSnapshot),
    productSkuSnapshot: parseOptionalString(raw.productSkuSnapshot),
    productTypeSnapshot: parseOptionalString(raw.productTypeSnapshot),
    variantNameSnapshot: parseOptionalString(raw.variantNameSnapshot),
    images: Array.isArray(raw.images)
      ? raw.images.filter((img): img is string => typeof img === 'string')
      : undefined,
    brand: parseOptionalString(raw.brand),
    description: parseOptionalString(raw.description),
    offerApplied: raw.offerApplied === true,
    offerBadgeSnapshot: isOfferBadge(raw.offerBadgeSnapshot),
    offerNameSnapshot: parseOptionalString(raw.offerNameSnapshot),
    originalPriceSnapshot: parseOptionalNumber(raw.originalPriceSnapshot), // Decimal type, not string
    discountPercentage:
      typeof raw.discountPercentage === 'number'
        ? raw.discountPercentage
        : undefined,
    discountAmount:
      typeof raw.discountAmount === 'number' ? raw.discountAmount : null,
    promotionDetailsSnapshot: parseOptionalString(raw.promotionDetailsSnapshot),
    moqSnapshot: typeof raw.moqSnapshot === 'number' ? raw.moqSnapshot : null,
  };
}

export function normalizeOrder(raw: Record<string, unknown>): Order | null {
  const orderItemsRaw = Array.isArray(raw.orderItems) ? raw.orderItems : [];
  const normalizedItems = orderItemsRaw.map((item) =>
    normalizeOrderItem(item as Record<string, unknown>),
  );

  const subtotal = parseNumber(raw.subtotal);
  const shippingFee = parseNumber(raw.shippingFee);
  const discounts = parseNumber(raw.discounts);
  const totalFromPayload = parseNumber(raw.totalAmount);
  const totalAmount =
    totalFromPayload > 0 ? totalFromPayload : subtotal + shippingFee - discounts;

  const baseId = parseString(raw.id, parseString(raw.orderId, ''));
  if (!baseId) {
    return null;
  }

  const orderStatus = isOrderStatus(raw.orderStatus)
    ? raw.orderStatus
    : 'Pending';
  const paymentStatus = isPaymentStatus(raw.paymentStatus)
    ? raw.paymentStatus
    : 'Unpaid';
  const deliveryMethod = isDeliveryMethod(raw.deliveryMethod)
    ? raw.deliveryMethod
    : 'Seller/Distributor Delivery';

  const totalsFromItems = normalizedItems.reduce((sum, item) => {
    const packages = item.packageQuantity ?? 0;
    const pieces = item.piecesPerPackage ?? 1;
    return sum + packages * pieces;
  }, 0);

  return {
    id: baseId,
    orderId: parseString(raw.orderId, baseId),
    buyerId: parseString(raw.buyerId, 'unknown-buyer'),
    orderDate: parseDate(raw.orderDate),
    paidAt: raw.paidAt ? parseDate(raw.paidAt) : null,
    orderStatus,
    paymentStatus,
    deliveryMethod,
    deliveryOption: parseOptionalString(raw.deliveryOption),
    shippingMethodLabel: parseOptionalString(raw.shippingMethodLabel),
    shippingMethod: parseOptionalString(raw.shippingMethod),
    subtotal,
    discounts,
    shippingFee,
    totalAmount,
    paymentTerms: parseString(raw.paymentTerms, 'Net 30'),
    orderItems: normalizedItems,
    totalOrders:
      typeof raw.totalOrders === 'number' ? raw.totalOrders : totalsFromItems,
    contactPerson: parseString(
      raw.contactPerson,
      parseString(raw.storeName, 'Unknown Contact'),
    ),
    storeName: parseString(raw.storeName, parseString(raw.contactPerson, '—')),
    contactPhone: parseString(raw.contactPhone, '—'),
    customerEmail: parseOptionalString(raw.customerEmail),
    deliveryAddress: parseString(raw.deliveryAddress, '—'),
    preferredPickupDate: parseOptionalDateValue(raw.preferredPickupDate),
    preferredPickupTime: parseOptionalString(raw.preferredPickupTime),
    assignedLogistics: parseOptionalString(raw.assignedLogistics),
    trackingNumber: parseOptionalString(raw.trackingNumber),
    deliveryNote: parseOptionalString(raw.deliveryNote),
    deliveryConfirmation: parseOptionalString(raw.deliveryConfirmation),
    pod: parseOptionalString(raw.pod),
    createdAt: parseDate(raw.createdAt ?? raw.orderDate),
    updatedAt: parseDate(raw.updatedAt ?? raw.orderDate),
    acceptedBy: parseOptionalString(raw.acceptedBy),
    acceptedAt: raw.acceptedAt ? parseDate(raw.acceptedAt) : undefined,
    estimatedArrivalDate: raw.estimatedArrivalDate ? parseDate(raw.estimatedArrivalDate) : undefined,
    estimatedArrivalMinDays: raw.estimatedArrivalMinDays != null ? Number(raw.estimatedArrivalMinDays) : undefined,
    estimatedArrivalMaxDays: raw.estimatedArrivalMaxDays != null ? Number(raw.estimatedArrivalMaxDays) : undefined,
    deliveredAt: raw.deliveredAt ? parseDate(raw.deliveredAt) : undefined,
  };
}

export function normalizeProduct(raw: Record<string, unknown>): Product | null {
  const productId = parseString(raw.productId);
  if (!productId) {
    return null;
  }

  const rawStatus = parseString(raw.status);
  const normalizedStatus: Product['status'] =
    rawStatus === 'Draft' ? 'Draft' : 'Published';

  const offerBadgeCandidate = parseOptionalString(raw.offerBadge);
  const normalizedOfferBadge: Product['offerBadge'] =
    offerBadgeCandidate &&
    OFFER_BADGES.includes(
      offerBadgeCandidate as NonNullable<Product['offerBadge']>,
    )
      ? (offerBadgeCandidate as Product['offerBadge'])
      : undefined;

  const discountTypeCandidate = parseOptionalString(raw.discountType);
  const normalizedDiscountType: Product['discountType'] =
    discountTypeCandidate &&
    DISCOUNT_TYPES.includes(
      discountTypeCandidate as NonNullable<Product['discountType']>,
    )
      ? (discountTypeCandidate as Product['discountType'])
      : undefined;

  return {
    id: typeof raw.id === 'number' ? raw.id : undefined,
    productId,
    sku: parseString(raw.sku, productId),
    name: parseString(raw.name, 'Unnamed Product'),
    description: parseString(raw.description, ''),
    productType: parseString(raw.productType, 'Uncategorized'),
    brand: parseString(raw.brand, '—'),
    supplier: parseString(raw.supplier, '—'),
    status: normalizedStatus,
    productCategory: parseString(raw.productCategory, 'General'),
    catalogName: parseString(raw.catalogName, 'Default'),
    images: Array.isArray(raw.images)
      ? raw.images.filter((img): img is string => typeof img === 'string')
      : [],
    halalCertified: raw.halalCertified === true,
    bpomApproved: raw.bpomApproved === true,
    originalProduct: raw.originalProduct === true,
    returnPolicyDays:
      typeof raw.returnPolicyDays === 'number' ? raw.returnPolicyDays : undefined,
    stockQuantity:
      typeof raw.stockQuantity === 'number' ? raw.stockQuantity : undefined,
    lowStockThreshold:
      typeof raw.lowStockThreshold === 'number'
        ? raw.lowStockThreshold
        : undefined,
    stockStatus: parseOptionalString(raw.stockStatus) as Product['stockStatus'],
    variantDefinitions: Array.isArray(raw.variantDefinitions)
      ? (raw.variantDefinitions as Product['variantDefinitions'])
      : undefined,
    variantOptions: Array.isArray(raw.variantOptions)
      ? (raw.variantOptions as Array<Record<string, unknown>>).map((vo) => {
          const base = vo as {
            id: number;
            variantName: string;
            sku?: string | null;
            purchasePrice: unknown;
            sellingPrice: unknown;
            originalSellingPrice?: unknown;
            moq?: number | null;
            stockQuantity: number;
            lowStockThreshold: number;
            stockStatus: string;
            isDefault: boolean;
            isActive: boolean;
            attributes?: Record<string, unknown> | null;
          };
          return {
            ...base,
            purchasePrice: String(parseNumber(vo.purchasePrice)), // Convert to string to match VariantOption type
            sellingPrice: String(parseNumber(vo.sellingPrice)), // Convert to string to match VariantOption type
            originalSellingPrice: vo.originalSellingPrice ? String(parseNumber(vo.originalSellingPrice)) : base.originalSellingPrice ? String(parseNumber(base.originalSellingPrice)) : undefined,
          };
        }) as Product['variantOptions']
      : undefined,
    variants: Array.isArray(raw.variants)
      ? (raw.variants as Product['variants'])
      : undefined,
    createdAt: raw.createdAt ? parseDate(raw.createdAt) : undefined,
    updatedAt: raw.updatedAt ? parseDate(raw.updatedAt) : undefined,
    userId: typeof raw.userId === 'number' ? raw.userId : undefined,
    offerBadge: normalizedOfferBadge,
    originalPrice: parseOptionalString(raw.originalPrice),
    hasActiveOffer: raw.hasActiveOffer === true,
    offerId: parseOptionalString(raw.offerId),
    offerName: parseOptionalString(raw.offerName),
    discountType: normalizedDiscountType,
    discountValue:
      typeof raw.discountValue === 'number' ? raw.discountValue : undefined,
    promotionDetails:
      typeof raw.promotionDetails === 'object' && raw.promotionDetails !== null
        ? (raw.promotionDetails as Product['promotionDetails'])
        : undefined,
  };
}

export function normalizeBuyer(raw: Record<string, unknown>): Buyer | null {
  const buyerId = parseString(raw.buyerId);
  if (!buyerId) {
    return null;
  }

  return {
    id: typeof raw.id === 'number' ? raw.id : undefined,
    buyerId,
    avatar: parseOptionalString(raw.avatar),
    owner: parseString(raw.owner, '—'),
    email: parseString(raw.email, ''),
    phone: parseString(raw.phone, ''),
    storeName: parseString(raw.storeName, '—'),
    businessType: parseString(raw.businessType, '—'),
    address: parseString(raw.address, '—'),
    status: parseString(raw.status, 'Inactive'),
    logistics: parseOptionalString(raw.logistics),
    notes: parseOptionalString(raw.notes),
    orderDetails: parseOptionalString(raw.orderDetails),
    avgMonthlySpending:
      raw.avgMonthlySpending !== undefined
        ? parseNumber(raw.avgMonthlySpending)
        : undefined,
    avgMonthlyOrders:
      raw.avgMonthlyOrders !== undefined
        ? parseNumber(raw.avgMonthlyOrders)
        : undefined,
    createdAt: raw.createdAt ? parseDate(raw.createdAt) : undefined,
    updatedAt: raw.updatedAt ? parseDate(raw.updatedAt) : undefined,
    userId: typeof raw.userId === 'number' ? raw.userId : undefined,
  };
}

export function normalizeSupplier(raw: Record<string, unknown>): Supplier | null {
  const supplierId = parseString(raw.supplierId);
  if (!supplierId) {
    return null;
  }

  return {
    id: typeof raw.id === 'number' ? raw.id : undefined,
    supplierId,
    name: parseString(raw.name, 'Unnamed Supplier'),
    contact: parseString(raw.contact, '—'),
    email: parseString(raw.email, ''),
    phone: parseString(raw.phone, ''),
    businessType: parseString(raw.businessType, '—'),
    address: parseString(raw.address, '—'),
    status: parseString(raw.status, 'Inactive'),
    logistics: parseOptionalString(raw.logistics),
    notes: parseOptionalString(raw.notes),
    supplies: parseOptionalString(raw.supplies),
    avgMonthlyPurchaseValue:
      raw.avgMonthlyPurchaseValue !== undefined
        ? parseNumber(raw.avgMonthlyPurchaseValue)
        : undefined,
    totalPurchases:
      raw.totalPurchases !== undefined
        ? parseNumber(raw.totalPurchases)
        : undefined,
    totalSupplies:
      raw.totalSupplies !== undefined
        ? parseNumber(raw.totalSupplies)
        : undefined,
    onTimeDeliveryRate:
      raw.onTimeDeliveryRate !== undefined
        ? parseNumber(raw.onTimeDeliveryRate)
        : undefined,
    createdAt: raw.createdAt ? parseDate(raw.createdAt) : undefined,
    updatedAt: raw.updatedAt ? parseDate(raw.updatedAt) : undefined,
    userId: typeof raw.userId === 'number' ? raw.userId : undefined,
  };
}

export function safeParseJSON<T>(value: string | undefined, fallback: T): T {
  if (!value || value.length === 0) {
    return fallback;
  }
  try {
    const parsed = JSON.parse(value) as T;
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

