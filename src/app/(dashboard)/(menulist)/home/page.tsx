"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import Image from 'next/image';
import Link from 'next/link';
import {
  GripVertical,
  DollarSign,
  ShoppingCart,
  Package,
  Clock,
  CheckCircle,
  ArrowRight,
  ChevronDown,
  Users,
  Building2,
  Settings2,
  X,
  Layers,
  Globe2,
  Megaphone,
  Activity,
  Loader2,
  MapPin,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useUserStore } from '@/store/userStore';
import {
  AnalyticsMetricCard,
  AnalyticsRevenueTrendChart,
  calculateRevenueData,
  calculateTopProducts,
  calculateTotalRevenue,
  formatCurrency,
} from '@/components/analyticsperformance/FinancialAnalytics';
import { calculateSalesMetrics } from '@/components/analyticsperformance/CustomerSalesAnalytics';
import { getProductTotalStock } from '@/utils/stockUtils';
import { getDefaultCurrency } from '@/utils/currencyUtils';
import type { Order, OrderItem } from '@/types/order';
import type { Product } from '@/types/product';
import type { Buyer, Supplier, SupplyDetail } from '@/types/client';
import MapComponent from '@/components/ordershipment/MapComponent';
import {
  geocodeMultipleAddresses,
  GeocodeResult,
  MapCoordinates,
  getOrderStatusMarkerColor,
} from '@/utils/mapboxUtils';

type WidgetId =
  | 'analytics'
  | 'orders'
  | 'products'
  | 'buyers'
  | 'suppliers'
  | 'logistics'
  | 'inventory'
  | 'marketing';

interface WidgetDefinition {
  id: WidgetId;
  name: string;
  description: string;
  defaultActive: boolean;
  icon: LucideIcon;
}

const WIDGET_LIBRARY: WidgetDefinition[] = [
  {
    id: 'analytics',
    name: 'Analytics Overview',
    description: 'Monitor revenue growth and sales momentum at a glance.',
    defaultActive: true,
    icon: Activity,
  },
  {
    id: 'orders',
    name: 'Orders Pipeline',
    description: 'Track latest orders, statuses, and order value trends.',
    defaultActive: true,
    icon: ShoppingCart,
  },
  {
    id: 'products',
    name: 'Product Performance',
    description: 'See which catalog items generate the most revenue.',
    defaultActive: true,
    icon: Package,
  },
  {
    id: 'inventory',
    name: 'Inventory Alerts',
    description: 'Highlight stock risks and replenishment priorities.',
    defaultActive: true,
    icon: Layers,
  },
  {
    id: 'buyers',
    name: 'Buyer Engagement',
    description: 'Understand buyer activity, retention, and top spenders.',
    defaultActive: true,
    icon: Users,
  },
  {
    id: 'suppliers',
    name: 'Supplier Network',
    description: 'Stay aligned with supplier capacity and reliability.',
    defaultActive: true,
    icon: Building2,
  },
  {
    id: 'logistics',
    name: 'Logistics Tracking',
    description: 'Visualize shipment routes and delivery milestones.',
    defaultActive: false,
    icon: Globe2,
  },
  {
    id: 'marketing',
    name: 'Campaign Performance',
    description: 'Review promo conversions and channel impact.',
    defaultActive: false,
    icon: Megaphone,
  },
];

const DEFAULT_WIDGET_ORDER: WidgetId[] = WIDGET_LIBRARY.filter(
  (widget) => widget.defaultActive,
).map((widget) => widget.id);

const WIDGET_ID_SET = new Set<WidgetId>(
  WIDGET_LIBRARY.map((widget) => widget.id),
);

type WidgetLayoutStorage = {
  order: WidgetId[];
};

const WIDGET_LAYOUT: Record<WidgetId, string> = {
  analytics: 'col-span-12 xl:col-span-7',
  orders: 'col-span-12 xl:col-span-5',
  products: 'col-span-12 xl:col-span-5',
  buyers: 'col-span-12',
  suppliers: 'col-span-12',
  logistics: 'col-span-12 xl:col-span-6',
  inventory: 'col-span-12 xl:col-span-7',
  marketing: 'col-span-12 xl:col-span-6',
};

const DEFAULT_WIDGET_LAYOUT = 'col-span-12 xl:col-span-6';

const MAX_PIPELINE_ROWS = 4;
const MAX_PRODUCT_PERFORMANCE_ROWS = 3;

const STORAGE_KEY = 'laku-dashboard-widgets';

const DASHBOARD_SNAPSHOT_QUERY = `
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
        preferredDeliveryDate
        preferredDeliveryTime
        preferredPickupDate
        preferredPickupTime
        assignedLogistics
        trackingNumber
        deliveryNote
        deliveryConfirmation
        pod
        orderDate
        createdAt
        updatedAt
        acceptedBy
        acceptedAt
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
        legacyVariants
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
  'Cancelled',
  'Returned',
];

const PAYMENT_STATUS_VALUES: Order['paymentStatus'][] = ['Unpaid', 'Paid'];

const DELIVERY_METHOD_VALUES: Order['deliveryMethod'][] = [
  'Distributor Fleet',
  '3rd-Party Courier',
  'Pickup',
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

function parseNumber(value: unknown): number {
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

function parseString(value: unknown, fallback = ''): string {
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

function normalizeOrderItem(raw: Record<string, unknown>): OrderItem {
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
    variantId: typeof raw.variantId === 'number' ? raw.variantId : undefined,
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

function normalizeOrder(raw: Record<string, unknown>): Order | null {
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
    : 'Distributor Fleet';

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
    preferredDeliveryDate: parseOptionalDateValue(raw.preferredDeliveryDate),
    preferredDeliveryTime: parseOptionalString(raw.preferredDeliveryTime),
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
  };
}

function normalizeProduct(raw: Record<string, unknown>): Product | null {
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
    legacyVariants: Array.isArray(raw.legacyVariants)
      ? (raw.legacyVariants as Product['legacyVariants'])
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

function normalizeBuyer(raw: Record<string, unknown>): Buyer | null {
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

function normalizeSupplier(raw: Record<string, unknown>): Supplier | null {
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

interface WidgetRenderResult {
  content: ReactNode;
  subtitle?: string;
  action?: ReactNode;
}

interface LogisticsMapMarker {
  id: string;
  coordinates: MapCoordinates;
  label: string;
  color: string;
}

const statusStyles: Record<Order['orderStatus'], string> = {
  Pending: 'bg-yellow-50 text-yellow-700 border-yellow-200',
  Confirmed: 'bg-blue-50 text-blue-700 border-blue-200',
  Packed: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  Shipped: 'bg-sky-50 text-sky-700 border-sky-200',
  Delivered: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  Cancelled: 'bg-rose-50 text-rose-700 border-rose-200',
  Returned: 'bg-gray-100 text-gray-600 border-gray-200',
};

function safeParseJSON<T>(value: string | undefined, fallback: T): T {
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

const resolveProductStock = (product: Product) => {
  if (product.variantOptions && product.variantOptions.length > 0) {
    const variantStocks = product.variantOptions.map((variant) => ({
      stockQuantity: Number(variant.stockQuantity ?? 0),
      lowStockThreshold: Number(variant.lowStockThreshold ?? 0),
    }));
    const { totalStock, lowStockThreshold } = getProductTotalStock(variantStocks);
    return {
      totalStock,
      lowStockThreshold: lowStockThreshold || Number(product.lowStockThreshold ?? 0),
    };
  }

  if (product.legacyVariants && product.legacyVariants.length > 0) {
    const variantStocks = product.legacyVariants.map((variant) => ({
      stockQuantity: Number(variant.stockQuantity ?? 0),
      lowStockThreshold: Number(variant.lowStockThreshold ?? 0),
    }));
    const { totalStock, lowStockThreshold } = getProductTotalStock(variantStocks);
    return {
      totalStock,
      lowStockThreshold: lowStockThreshold || Number(product.lowStockThreshold ?? 0),
    };
  }

  return {
    totalStock: Number(product.stockQuantity ?? 0),
    lowStockThreshold: Number(product.lowStockThreshold ?? 0),
  };
};

export default function HomePage() {
  const { user } = useUserStore();
  const [orders, setOrders] = useState<Order[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [buyers, setBuyers] = useState<Buyer[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [aggregates, setAggregates] = useState<{
    totalRevenue: number;
    pendingRevenue: number;
    totalOrders: number;
    paidOrders: number;
    unpaidOrders: number;
    avgOrderValue: number;
    totalPiecesSold: number;
    totalUnitsSold: number;
    uniqueCustomers: number;
  } | null>(null);
  const [widgetOrder, setWidgetOrder] =
    useState<WidgetId[]>(DEFAULT_WIDGET_ORDER);
  const [draggingWidget, setDraggingWidget] = useState<WidgetId | null>(null);
  const [hoverWidget, setHoverWidget] = useState<WidgetId | null>(null);
  const [draggingSource, setDraggingSource] = useState<'layout' | 'library' | null>(null);
  const [isWidgetManagerOpen, setIsWidgetManagerOpen] = useState(false);
  const widgetManagerRef = useRef<HTMLDivElement | null>(null);

  const userCurrency = user?.currency || getDefaultCurrency();
  const hasData = orders.length > 0;
  const logisticsGeocodedAddressesRef = useRef<Set<string>>(new Set());
  const [logisticsGeocodeResults, setLogisticsGeocodeResults] = useState<Map<string, GeocodeResult>>(new Map());
  const [isLogisticsGeocoding, setIsLogisticsGeocoding] = useState(false);
  const logisticsActiveOrders = useMemo(() => {
    return orders.filter((order) => {
      const address = order.deliveryAddress?.trim();
      if (!address || address.length === 0 || address === '—') {
        return false;
      }
      return ['Shipped', 'Packed', 'Pending', 'Confirmed'].includes(order.orderStatus);
    });
  }, [orders]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (!stored) {
      return;
    }
    try {
      const parsed = JSON.parse(stored) as WidgetLayoutStorage | WidgetId[];
      const rawOrder: unknown[] = Array.isArray(parsed)
        ? parsed
        : Array.isArray(parsed?.order)
          ? parsed.order
          : [];
      const sanitized = rawOrder.filter((id): id is WidgetId =>
        WIDGET_ID_SET.has(id as WidgetId),
      );
      const deduped = Array.from(new Set<WidgetId>(sanitized));
      setWidgetOrder(deduped.length > 0 ? deduped : DEFAULT_WIDGET_ORDER);
    } catch {
      setWidgetOrder(DEFAULT_WIDGET_ORDER);
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    const payload: WidgetLayoutStorage = { order: widgetOrder };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  }, [widgetOrder]);

  useEffect(() => {
    if (!isWidgetManagerOpen) {
      return;
    }
    const handleClickOutside = (event: MouseEvent) => {
      if (
        widgetManagerRef.current &&
        !widgetManagerRef.current.contains(event.target as Node)
      ) {
        setIsWidgetManagerOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isWidgetManagerOpen]);

  useEffect(() => {
    const geocodeLogisticsAddresses = async () => {
      if (logisticsActiveOrders.length === 0) {
        return;
      }

      const addresses = logisticsActiveOrders
        .map((order) => order.deliveryAddress?.trim() ?? '')
        .filter((address): address is string => address.length > 0 && address !== '—');

      if (addresses.length === 0) {
        return;
      }

      const uniqueAddresses = addresses.filter((address, index, self) => self.indexOf(address) === index);
      const addressesToGeocode = uniqueAddresses.filter(
        (address) => !logisticsGeocodedAddressesRef.current.has(address),
      );

      if (addressesToGeocode.length === 0) {
        return;
      }

      addressesToGeocode.forEach((address) => logisticsGeocodedAddressesRef.current.add(address));

      setIsLogisticsGeocoding(true);
      try {
        const newResults = await geocodeMultipleAddresses(addressesToGeocode);
        setLogisticsGeocodeResults((prev) => {
          const updated = new Map(prev);
          newResults.forEach((result, address) => {
            updated.set(address, result);
          });
          return updated;
        });
      } catch (error) {
        // Handle geocoding errors gracefully - remove failed addresses from tracking
        addressesToGeocode.forEach((address) => {
          logisticsGeocodedAddressesRef.current.delete(address);
        });
        // Log error for debugging but don't show to user (non-critical feature)
        if (process.env.NODE_ENV === 'development') {
          console.error('Failed to geocode addresses:', error);
        }
      } finally {
        setIsLogisticsGeocoding(false);
      }
    };

    geocodeLogisticsAddresses();
  }, [logisticsActiveOrders]);

  useEffect(() => {
    const controller = new AbortController();
    const fetchData = async () => {
      try {
        setLoading(true);
        setError(null);

        const hasUserId = typeof user?.id === 'number' && !Number.isNaN(user.id);
        if (!hasUserId) {
          setOrders([]);
          setProducts([]);
          setBuyers([]);
          setSuppliers([]);
          setLoading(false);
          return;
        }

        const response = await fetch('/api/graphql', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({
            query: DASHBOARD_SNAPSHOT_QUERY,
            variables: {
              userId: user!.id,
              ordersLimit: 50, // Reduced from 1000 to prevent slow queries and timeouts
              productsLimit: 50, // Reduced from 1000 to prevent slow queries and timeouts
              contactsLimit: 50, // Reduced from 100 for consistency
            },
          }),
        });

        if (controller.signal.aborted) {
          return;
        }

        if (!response.ok) {
          throw new Error('Unable to load dashboard data');
        }

        const responseText = await response.text();
        if (!responseText || responseText.trim().length === 0) {
          throw new Error('Empty response from server');
        }

        let payload;
        try {
          payload = JSON.parse(responseText);
        } catch (parseError) {
          throw new Error('Invalid response format from server');
        }

        if (payload.errors && payload.errors.length > 0) {
          throw new Error(payload.errors[0]?.message || 'Failed to load dashboard data');
        }

        const snapshot = payload.data?.dashboardSnapshot;
        if (!snapshot) {
          throw new Error('Dashboard data unavailable');
        }

        // Extract aggregates from server response (calculated from ALL orders, not just paginated subset)
        if (snapshot.aggregates) {
          setAggregates({
            totalRevenue: snapshot.aggregates.totalRevenue || 0,
            pendingRevenue: snapshot.aggregates.pendingRevenue || 0,
            totalOrders: snapshot.aggregates.totalOrders || 0,
            paidOrders: snapshot.aggregates.paidOrders || 0,
            unpaidOrders: snapshot.aggregates.unpaidOrders || 0,
            avgOrderValue: snapshot.aggregates.avgOrderValue || 0,
            totalPiecesSold: snapshot.aggregates.totalPiecesSold || 0,
            totalUnitsSold: snapshot.aggregates.totalUnitsSold || 0,
            uniqueCustomers: snapshot.aggregates.uniqueCustomers || 0,
          });
        }

        const normalizedOrders: Order[] = [];
        (Array.isArray(snapshot.orders) ? snapshot.orders : []).forEach((item: unknown) => {
          if (item && typeof item === 'object') {
            const normalized = normalizeOrder(item as Record<string, unknown>);
            if (normalized) {
              normalizedOrders.push(normalized);
            }
          }
        });
        setOrders(normalizedOrders);

          const normalizedProducts: Product[] = [];
        (Array.isArray(snapshot.products) ? snapshot.products : []).forEach((item: unknown) => {
            if (item && typeof item === 'object') {
              const normalized = normalizeProduct(item as Record<string, unknown>);
              if (normalized) {
                normalizedProducts.push(normalized);
              }
            }
          });
          setProducts(normalizedProducts);

          const normalizedBuyers: Buyer[] = [];
        (Array.isArray(snapshot.buyers) ? snapshot.buyers : []).forEach((item: unknown) => {
            if (item && typeof item === 'object') {
              const normalized = normalizeBuyer(item as Record<string, unknown>);
              if (normalized) {
                normalizedBuyers.push(normalized);
              }
            }
          });
          setBuyers(normalizedBuyers);

          const normalizedSuppliers: Supplier[] = [];
        (Array.isArray(snapshot.suppliers) ? snapshot.suppliers : []).forEach((item: unknown) => {
            if (item && typeof item === 'object') {
              const normalized = normalizeSupplier(item as Record<string, unknown>);
              if (normalized) {
                normalizedSuppliers.push(normalized);
              }
            }
          });
          setSuppliers(normalizedSuppliers);
      } catch (fetchError) {
        if (
          !(fetchError instanceof DOMException && fetchError.name === 'AbortError')
        ) {
          setError(
            fetchError instanceof Error
              ? fetchError.message
              : 'Failed to load dashboard data',
          );
          setOrders([]);
          setProducts([]);
          setBuyers([]);
          setSuppliers([]);
        }
      } finally {
        setLoading(false);
      }
    };

    fetchData();
    return () => controller.abort();
  }, [user?.id]);

  // Use server-side aggregates (calculated from ALL orders) instead of client-side calculations
  // This ensures accuracy - aggregates are computed from the full dataset, not just the paginated subset
  const totalRevenue = useMemo(
    () => aggregates?.totalRevenue ?? 0,
    [aggregates],
  );

  const pendingRevenue = useMemo(
    () => aggregates?.pendingRevenue ?? 0,
    [aggregates],
  );

  // Calculate sales metrics from aggregates and limited order list for display
  // Note: Some metrics like repeatCustomerRate still need the order list for analysis
  const salesMetrics = useMemo(
    () => {
      if (!aggregates) {
        return calculateSalesMetrics(orders, products, hasData);
      }
      
      // Use aggregates for totals, but still calculate some metrics from order list
      const baseMetrics = calculateSalesMetrics(orders, products, hasData);
      return {
        ...baseMetrics,
        // Override with accurate aggregates from server
        totalOrders: aggregates.totalOrders,
        avgOrderValue: aggregates.avgOrderValue,
        totalPiecesSold: aggregates.totalPiecesSold,
        totalUnitsSold: aggregates.totalUnitsSold,
        uniqueCustomers: aggregates.uniqueCustomers,
        // Calculate derived metrics from aggregates
        avgPiecesPerOrder: aggregates.totalOrders > 0 
          ? aggregates.totalPiecesSold / aggregates.totalOrders 
          : 0,
        avgUnitsPerOrder: aggregates.totalOrders > 0
          ? aggregates.totalUnitsSold / aggregates.totalOrders
          : 0,
      };
    },
    [orders, products, hasData, aggregates],
  );

  const safeSalesMetrics = {
    uniqueCustomers: salesMetrics.uniqueCustomers ?? 0,
    repeatCustomerRate: salesMetrics.repeatCustomerRate ?? 0,
    avgOrderValue: salesMetrics.avgOrderValue ?? 0,
    totalOrders: salesMetrics.totalOrders ?? 0,
    avgPiecesPerOrder: salesMetrics.avgPiecesPerOrder ?? 0,
    totalPiecesSold: salesMetrics.totalPiecesSold ?? 0,
    avgUnitsPerOrder: salesMetrics.avgUnitsPerOrder ?? 0,
    totalUnitsSold: salesMetrics.totalUnitsSold ?? 0,
  };

const buyerInsights = useMemo(() => {
  const totalBuyers = buyers.length;
  const activeBuyers = buyers.filter(
    (buyer) => buyer.status?.toLowerCase() === 'active',
  ).length;

  const ordersByBuyer = new Map<
    string,
    { orders: number; revenue: number; pieces: number }
  >();

  orders.forEach((order) => {
    const key = order.buyerId;
    const current = ordersByBuyer.get(key) ?? {
      orders: 0,
      revenue: 0,
      pieces: 0,
    };
    current.orders += 1;
    current.revenue += order.totalAmount || 0;
    current.pieces += typeof order.totalOrders === 'number' ? order.totalOrders : 0;
    ordersByBuyer.set(key, current);
  });

  const topBuyers = Array.from(ordersByBuyer.entries())
    .map(([buyerId, stats]) => {
      const buyerRecord = buyers.find((buyer) => buyer.buyerId === buyerId);
      const displayName =
        buyerRecord?.storeName?.trim().length
          ? buyerRecord.storeName
          : buyerRecord?.owner?.trim().length
            ? buyerRecord.owner
            : buyerId;
      return {
        buyerId,
        name: displayName,
        orders: stats.orders,
        revenue: stats.revenue,
        pieces: stats.pieces,
        status: buyerRecord?.status ?? 'Unknown',
      };
    })
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 3);

  const averageOrdersPerBuyer =
    totalBuyers > 0 ? (aggregates?.totalOrders ?? orders.length) / totalBuyers : 0;

  return {
    totalBuyers,
    activeBuyers,
    averageOrdersPerBuyer,
    topBuyers,
  };
}, [buyers, orders]);

const supplierInsights = useMemo(() => {
  const totalSuppliers = suppliers.length;
  const activeSuppliers = suppliers.filter(
    (supplier) => supplier.status?.toLowerCase() === 'active',
  ).length;

  const valueBySupplier = new Map<string, number>();
  let onTimeSum = 0;
  let onTimeSamples = 0;

  suppliers.forEach((supplier) => {
    let supplierValue = 0;
    if (supplier.supplies) {
      const suppliesList = safeParseJSON(
        supplier.supplies,
        [],
      ) as SupplyDetail[];
      suppliesList.forEach((supply) => {
        supplierValue += parseNumber(supply.totalValue);
      });
    }
    const totalPurchases = parseNumber(supplier.totalPurchases);
    const totalSupplies = parseNumber(supplier.totalSupplies);
    const directOnTime = parseNumber(supplier.onTimeDeliveryRate);

    let effectiveValue = supplierValue;
    if (effectiveValue <= 0 && totalPurchases > 0) {
      effectiveValue = totalPurchases;
    }
    if (effectiveValue <= 0 && totalSupplies > 0) {
      effectiveValue = totalSupplies;
    }
    valueBySupplier.set(supplier.supplierId, effectiveValue);

    if (directOnTime > 0) {
      onTimeSum += directOnTime;
      onTimeSamples += 1;
    } else {
      let recordedFromLogistics = false;
      if (supplier.logistics) {
        const logisticsData = safeParseJSON(
          supplier.logistics,
          {} as Record<string, unknown>,
        );
        if (
          logisticsData &&
          typeof logisticsData === 'object' &&
          'deliverySuccess' in logisticsData
        ) {
          const logisticsRate = parseNumber(
            (logisticsData as { deliverySuccess?: unknown }).deliverySuccess,
          );
          if (logisticsRate > 0) {
            onTimeSum += logisticsRate;
            onTimeSamples += 1;
            recordedFromLogistics = true;
          }
        }
      }

      if (!recordedFromLogistics && supplier.supplies) {
        const suppliesList = safeParseJSON(
          supplier.supplies,
          [],
        ) as SupplyDetail[];
        if (Array.isArray(suppliesList)) {
          suppliesList.forEach((supply) => {
            const successRate = parseNumber(supply.deliverySuccess);
            if (successRate > 0) {
              onTimeSum += successRate;
              onTimeSamples += 1;
            }
          });
        }
      }
    }
  });

  const topSuppliers = Array.from(valueBySupplier.entries())
    .map(([supplierId, value]) => {
      const supplierRecord = suppliers.find(
        (supplier) => supplier.supplierId === supplierId,
      );
      return {
        supplierId,
        name: supplierRecord?.name ?? supplierId,
        value,
        status: supplierRecord?.status ?? 'Unknown',
      };
    })
    .filter((supplier) => supplier.value > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, 3);

  const onTimeRate =
    onTimeSamples > 0 ? Math.round(onTimeSum / onTimeSamples) : 0;
  return {
    totalSuppliers,
    activeSuppliers,
    onTimeRate,
    topSuppliers,
  };
}, [suppliers]);

  const revenueTrendData = useMemo(
    () => calculateRevenueData(orders, products, hasData),
    [orders, products, hasData],
  );

  const topProducts = useMemo(
    () => calculateTopProducts(orders, products, hasData, MAX_PRODUCT_PERFORMANCE_ROWS),
    [orders, products, hasData],
  );

  const topProductsWithDetails = useMemo(() => {
    return topProducts.map((item, index) => {
      const product = products.find(
        (current) => current.productId === item.productId,
      );
      return {
        ...item,
        rank: index + 1,
        image: product?.images?.[0] ?? null,
        productName: product?.name ?? item.name,
        productCategory: product?.productCategory ?? item.productCategory,
      };
    });
  }, [topProducts, products]);

  const maxTopProductRevenue = useMemo(() => {
    return topProductsWithDetails.reduce(
      (max, product) => (product.revenue > max ? product.revenue : max),
      0,
    );
  }, [topProductsWithDetails]);

  const recentOrders = useMemo(() => {
    if (!hasData) {
      return [];
    }
    const sorted = [...orders].sort(
      (a, b) => b.orderDate.getTime() - a.orderDate.getTime(),
    );
  return sorted.slice(0, MAX_PIPELINE_ROWS);
  }, [orders, hasData]);

  const logisticsMapMarkers: LogisticsMapMarker[] = useMemo(() => {
    return logisticsActiveOrders
      .map((order) => {
        const addressKey = order.deliveryAddress?.trim() ?? '';
        if (!addressKey) {
          return null;
        }
        const geocodeResult = logisticsGeocodeResults.get(addressKey);
        if (!geocodeResult?.coordinates) {
          return null;
        }
        return {
          id: order.id,
          coordinates: geocodeResult.coordinates,
          label: `${order.orderId} • ${order.orderStatus}`,
          color: getOrderStatusMarkerColor(order.orderStatus),
        };
      })
      .filter((marker): marker is LogisticsMapMarker => marker !== null);
  }, [logisticsActiveOrders, logisticsGeocodeResults]);

  const logisticsMapCenter: MapCoordinates | undefined = useMemo(() => {
    if (logisticsMapMarkers.length === 0) {
      return undefined;
    }

    const averageLongitude =
      logisticsMapMarkers.reduce((sum, marker) => sum + marker.coordinates.longitude, 0) / logisticsMapMarkers.length;
    const averageLatitude =
      logisticsMapMarkers.reduce((sum, marker) => sum + marker.coordinates.latitude, 0) / logisticsMapMarkers.length;

    return {
      longitude: averageLongitude,
      latitude: averageLatitude,
    };
  }, [logisticsMapMarkers]);

  const handleLogisticsMarkerClick = (markerId: string) => {
    const order = orders.find((entry) => entry.id === markerId);
    if (order) {
      window.location.href = `/orders/details/${order.orderId}`;
    }
  };

  const statCards = useMemo(() => {
    // Don't calculate if still loading to avoid showing 0 values
    if (loading) {
      return [];
    }
    return [
      {
        id: 'totalRevenue',
        title: 'Total Sales',
        value: formatCurrency(totalRevenue, userCurrency),
        change: 8.6,
        icon: <DollarSign className="w-6 h-6 text-[#0a61d7]" />,
        color: 'bg-[#f7faff]',
      },
      {
        id: 'revenueCollected',
        title: 'Revenue Collected',
        value: formatCurrency(totalRevenue - pendingRevenue, userCurrency),
        change: 3.1,
        icon: <CheckCircle className="w-6 h-6 text-green-500" />,
        color: 'bg-[#e6f7ec]',
      },
      {
        id: 'totalOrders',
        title: 'Total Orders',
        value: (aggregates?.totalOrders ?? orders.length).toLocaleString(),
        change: 5.4,
        icon: <ShoppingCart className="w-6 h-6 text-emerald-600" />,
        color: 'bg-white',
      },
      {
        id: 'piecesSold',
        title: 'Pieces Sold',
        value: safeSalesMetrics.totalUnitsSold.toLocaleString(),
        change: 4.2,
        icon: <Package className="w-6 h-6 text-purple-600" />,
        color: 'bg-white',
      },
    ];
  }, [loading, aggregates?.totalOrders, pendingRevenue, safeSalesMetrics.totalUnitsSold, totalRevenue, userCurrency]);

  const handleDragStart = (
    event: React.DragEvent<HTMLDivElement>,
    id: WidgetId,
  ) => {
    setDraggingWidget(id);
    setDraggingSource('layout');
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', id);
    event.dataTransfer.setData('application/widget-source', 'layout');
  };

  const handleDragEnter = (id: WidgetId) => {
    if (draggingWidget && draggingWidget !== id) {
      setHoverWidget(id);
    }
  };

  const handleDragLeave = (id: WidgetId) => {
    if (hoverWidget === id) {
      setHoverWidget(null);
    }
  };

  const handleLibraryDragStart = (
    event: React.DragEvent<HTMLDivElement>,
    id: WidgetId,
  ) => {
    setDraggingWidget(id);
    setDraggingSource('library');
    event.dataTransfer.effectAllowed = 'copy';
    event.dataTransfer.setData('text/plain', id);
    event.dataTransfer.setData('application/widget-source', 'library');
  };

  const getDragContext = (
    event: React.DragEvent,
  ): { sourceId: WidgetId | null; sourceType: 'layout' | 'library' } => {
    const rawId = draggingWidget ?? (event.dataTransfer.getData('text/plain') as WidgetId);
    if (!rawId) {
      return { sourceId: null, sourceType: 'layout' };
    }

    const rawSource =
      draggingSource ??
      (event.dataTransfer.getData('application/widget-source') as 'layout' | 'library');

    const normalizedSource = rawSource === 'library' ? 'library' : 'layout';

    if (normalizedSource === 'library' && widgetOrder.includes(rawId)) {
      return { sourceId: rawId, sourceType: 'layout' };
    }

    return { sourceId: rawId, sourceType: normalizedSource };
  };

  const handleDrop = (
    event: React.DragEvent<HTMLDivElement>,
    targetId: WidgetId,
  ) => {
    event.preventDefault();
    const { sourceId, sourceType } = getDragContext(event);
    if (!sourceId) {
      handleDragEnd();
      return;
    }

    if (sourceType === 'layout') {
      if (sourceId === targetId) {
        handleDragEnd();
        return;
      }
      if (!widgetOrder.includes(sourceId) || !widgetOrder.includes(targetId)) {
        handleDragEnd();
        return;
      }
      setWidgetOrder((prev) => {
        const next = [...prev];
        const fromIndex = next.indexOf(sourceId);
        const toIndex = next.indexOf(targetId);
        if (fromIndex === -1 || toIndex === -1) {
          return prev;
        }
        next.splice(fromIndex, 1);
        next.splice(toIndex, 0, sourceId);
        return next;
      });
    } else {
      setWidgetOrder((prev) => {
        if (prev.includes(sourceId)) {
          return prev;
        }
        const next = [...prev];
        const insertAt = next.indexOf(targetId);
        if (insertAt === -1) {
          next.push(sourceId);
        } else {
          next.splice(insertAt, 0, sourceId);
        }
        return next;
      });
    }

    handleDragEnd();
  };

  const handleDragEnd = () => {
    setDraggingWidget(null);
    setHoverWidget(null);
    setDraggingSource(null);
  };

  const handleDropToEnd = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const { sourceId, sourceType } = getDragContext(event);
    if (!sourceId) {
      handleDragEnd();
      return;
    }

    if (sourceType === 'layout') {
      if (!widgetOrder.includes(sourceId)) {
        handleDragEnd();
        return;
      }
      setWidgetOrder((prev) => {
        const next = prev.filter((id) => id !== sourceId);
        next.push(sourceId);
        return next;
      });
    } else {
      setWidgetOrder((prev) => (prev.includes(sourceId) ? prev : [...prev, sourceId]));
    }

    handleDragEnd();
  };

  const handleWidgetToggle = (id: WidgetId) => {
    setWidgetOrder((prev) => {
      if (prev.includes(id)) {
        return prev.filter((widgetId) => widgetId !== id);
      }
      return [...prev, id];
    });
  };

  const renderWidget = (id: WidgetId): WidgetRenderResult => {
    switch (id) {
      case 'analytics':
        return {
          subtitle: 'Revenue performance over time',
          action: (
            <Link
              href="/analytics"
              className="inline-flex items-center gap-1 text-xs font-semibold text-[#0a61d7] hover:text-[#084ba6]"
            >
              Open analytics hub
              <ArrowRight className="w-4 h-4" />
            </Link>
          ),
          content: (
            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs text-gray-500">
                <span className="font-semibold uppercase tracking-wide text-gray-600">
                  This year
                </span>
                <span>
                  Total revenue:{' '}
                  <span className="font-semibold text-black">
                    {formatCurrency(totalRevenue, userCurrency)}
                  </span>
                </span>
              </div>
              <AnalyticsRevenueTrendChart
                revenueData={revenueTrendData}
                userCurrency={userCurrency}
                hasData={hasData}
              />
            </div>
          ),
        };
      case 'orders':
        return {
          subtitle: 'Latest customer activity and order status',
          action: (
            <Link
              href="/orders"
              className="inline-flex items-center gap-1 text-xs font-semibold text-[#0a61d7] hover:text-[#084ba6]"
            >
              View all orders
              <ArrowRight className="w-4 h-4" />
            </Link>
          ),
          content: recentOrders.length === 0 ? (
            <div className="flex h-90 flex-col items-center justify-center rounded-lg">
              <ShoppingCart className="mb-3 h-10 w-10 text-gray-300" />
              <p className="text-sm font-semibold text-gray-600">
                No orders recorded yet
              </p>
              <p className="mt-1 text-xs text-gray-500">
                Create your first order to start tracking activity here.
              </p>
            </div>
          ) : (
            <ul className="space-y-3">
              {recentOrders.map((order) => {
                const orderDate = new Intl.DateTimeFormat('en-US', {
                  day: '2-digit',
                  month: 'short',
                  year: 'numeric',
                }).format(order.orderDate);
                const statusClass = statusStyles[order.orderStatus] ?? 'bg-gray-100 text-gray-600 border-gray-200';
                return (
                  <li
                    key={order.id}
                    className="flex flex-col gap-4 rounded-lg border border-[#e6e6e6] bg-white px-4 py-3"
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="text-sm font-semibold text-black">
                          {order.storeName}
                        </p>
                        <p className="text-xs text-gray-500">
                          {order.contactPerson} · {orderDate}
                        </p>
                     </div>
                      <span
                        className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${statusClass}`}
                      >
                        {order.orderStatus}
                      </span>
                    </div>
                    <div className="flex items-end justify-between">
                      <span className="text-sm font-semibold text-black">
                        {formatCurrency(order.totalAmount, userCurrency)}
                      </span>
                      <Link
                        href={`/orders/details/${order.orderId}`}
                        className="inline-flex items-center gap-1 text-xs font-semibold text-[#0a61d7] hover:text-[#084ba6]"
                      >
                        Details
                        <ArrowRight className="w-4 h-4" />
                      </Link>
                    </div>
                  </li>
                );
              })}
            </ul>
          ),
        };
      case 'products':
        return {
          subtitle: 'Products ranked by revenue contribution',
          action: (
            <Link
              href="/products"
              className="inline-flex items-center gap-1 text-xs font-semibold text-[#0a61d7] hover:text-[#084ba6]"
            >
              Manage catalog
              <ArrowRight className="w-4 h-4" />
            </Link>
          ),
          content: (
            <div className="space-y-4">
              {topProductsWithDetails.length === 0 ? (
                <div className="flex h-60 flex-col items-center justify-center rounded-lg">
                  <Package className="mb-3 h-10 w-10 text-gray-300" />
                  <p className="text-sm font-semibold text-gray-600">
                    No product performance yet
                  </p>
                  <p className="mt-1 text-xs text-gray-500">
                    Add products and record orders to see insights here.
                  </p>
                </div>
              ) : (
                <ul className="space-y-3">
                  {topProductsWithDetails.map((product) => {
                    const progress =
                      maxTopProductRevenue > 0
                        ? Math.round((product.revenue / maxTopProductRevenue) * 100)
                        : 0;
                    return (
                      <li
                        key={product.productId}
                        className="flex flex-col gap-3 rounded-lg border border-[#e6e6e6] bg-white p-4"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-6 text-xs font-semibold text-gray-500">
                            {product.rank}.
                          </div>
                          <div className="flex items-center gap-3">
                            {product.image ? (
                              <Image
                                src={product.image}
                                alt={product.productName}
                                width={48}
                                height={48}
                                className="h-12 w-12 rounded-lg border border-[#e6e6e6] object-cover"
                              />
                            ) : (
                              <div className="flex h-12 w-12 items-center justify-center rounded-lg border border-[#e6e6e6] bg-[#f7faff]">
                                <Package className="h-5 w-5 text-[#0a61d7]" />
                              </div>
                            )}
                            <div>
                              <p className="text-sm font-semibold text-black">
                                {product.productName}
                              </p>
                              <p className="text-xs text-gray-500">
                                {product.productCategory}
                              </p>
                            </div>
                          </div>
                          <div className="ml-auto flex items-center gap-6 text-sm">
                            <div className="text-right">
                              <p className="text-xs text-gray-500">Revenue</p>
                              <p className="text-sm font-semibold text-black">
                                {formatCurrency(product.revenue, userCurrency)}
                              </p>
                            </div>
                            <div className="text-right">
                              <p className="text-xs text-gray-500">Pieces</p>
                              <p className="text-sm font-semibold text-black">
                                {product.unitsSold.toLocaleString()}
                              </p>
                            </div>
                            <div className="text-right">
                              <p className="text-xs text-gray-500">Margin</p>
                              <p
                                className={`text-sm font-semibold ${
                                  product.margin >= 0 ? 'text-emerald-600' : 'text-rose-600'
                                }`}
                              >
                                {product.margin.toFixed(1)}%
                              </p>
                            </div>
                          </div>
                        </div>
                        <div className="h-1.5 w-full rounded-full bg-gray-100">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-[#0a61d7] to-[#5b8df7]"
                            style={{ width: `${progress}%` }}
                          />
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          ),
        };
      case 'buyers':
        return {
          subtitle: 'Monitor buyer growth and engagement',
          action: (
            <Link
              href="/clients/buyers"
              className="inline-flex items-center gap-1 text-xs font-semibold text-[#0a61d7] hover:text-[#084ba6]"
            >
              Manage buyers
              <ArrowRight className="w-4 h-4" />
            </Link>
          ),
          content: (
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-lg border border-[#e6e6e6] bg-white p-4">
                  <p className="text-xs text-gray-500">Total buyers</p>
                  <p className="mt-1 text-2xl font-semibold text-black">
                    {buyerInsights.totalBuyers.toLocaleString()}
                  </p>
                  <p className="mt-1 text-[11px] uppercase tracking-wide text-gray-500">
                    Active:{' '}
                    <span className="font-semibold text-black">
                      {buyerInsights.activeBuyers.toLocaleString()}
                    </span>
                  </p>
                </div>
                <div className="rounded-lg border border-[#e6e6e6] bg-white p-4">
                  <p className="text-xs text-gray-500">Orders per buyer</p>
                  <p className="mt-1 text-2xl font-semibold text-black">
                    {buyerInsights.averageOrdersPerBuyer.toFixed(1)}
                  </p>
                  <p className="mt-1 text-[11px] uppercase tracking-wide text-gray-500">
                    Repeat rate{' '}
                    <span className="font-semibold text-black">
                      {safeSalesMetrics.repeatCustomerRate.toFixed(1)}%
                    </span>
                  </p>
                </div>
                <div className="rounded-lg border border-[#e6e6e6] bg-white p-4">
                  <p className="text-xs text-gray-500">Avg. order value</p>
                  <p className="mt-1 text-2xl font-semibold text-black">
                    {formatCurrency(safeSalesMetrics.avgOrderValue, userCurrency)}
                  </p>
                  <p className="mt-1 text-[11px] uppercase tracking-wide text-gray-500">
                    Across {safeSalesMetrics.totalOrders.toLocaleString()} orders
                  </p>
                </div>
                <div className="rounded-lg border border-[#e6e6e6] bg-white p-4">
                  <p className="text-xs text-gray-500">Pieces sold</p>
                  <p className="mt-1 text-2xl font-semibold text-black">
                    {safeSalesMetrics.totalPiecesSold.toLocaleString()}
                  </p>
                  <p className="mt-1 text-[11px] uppercase tracking-wide text-gray-500">
                    Units {safeSalesMetrics.totalUnitsSold.toLocaleString()}
                  </p>
                </div>
              </div>
              {buyerInsights.topBuyers.length === 0 ? (
                <div className="flex h-40 flex-col items-center justify-center rounded-lg">
                  <Users className="mb-3 h-8 w-8 text-gray-300" />
                  <p className="text-sm font-semibold text-gray-600">
                    No buyer activity yet
                  </p>
                  <p className="mt-1 text-xs text-gray-500">
                    Invite buyers or record orders to populate this list.
                  </p>
                </div>
              ) : (
                <div>
                  <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Top buyers by revenue
                  </h3>
                  <ul className="space-y-3">
                    {buyerInsights.topBuyers.map((buyer, index) => (
                      <li
                        key={buyer.buyerId}
                        className="flex items-center justify-between rounded-lg border border-[#e6e6e6] bg-white px-4 py-3"
                      >
                        <div className="flex items-center gap-3">
                          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#f7faff] text-xs font-semibold text-[#0a61d7]">
                            {index + 1}
                          </span>
                          <div>
                            <p className="text-sm font-semibold text-black">
                              {buyer.name}
                            </p>
                            <p className="text-xs text-gray-500">
                              {buyer.status}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-6 text-sm">
                          <div className="text-right">
                            <p className="text-xs text-gray-500">Orders</p>
                            <p className="font-semibold text-black">
                              {buyer.orders.toLocaleString()}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="text-xs text-gray-500">Revenue</p>
                            <p className="font-semibold text-black">
                              {formatCurrency(buyer.revenue, userCurrency)}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="text-xs text-gray-500">Pieces</p>
                            <p className="font-semibold text-black">
                              {buyer.pieces.toLocaleString()}
                            </p>
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ),
        };
      case 'suppliers':
        return {
          subtitle: 'Supplier reliability and fulfillment performance',
          action: (
            <Link
              href="/clients/suppliers"
              className="inline-flex items-center gap-1 text-xs font-semibold text-[#0a61d7] hover:text-[#084ba6]"
            >
              Manage suppliers
              <ArrowRight className="w-4 h-4" />
            </Link>
          ),
          content: (
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <div className="rounded-lg border border-[#e6e6e6] bg-white p-4">
                  <p className="text-xs text-gray-500">Total suppliers</p>
                  <p className="mt-1 text-2xl font-semibold text-black">
                    {supplierInsights.totalSuppliers.toLocaleString()}
                  </p>
                  <p className="mt-1 text-[11px] uppercase tracking-wide text-gray-500">
                    Active:{' '}
                    <span className="font-semibold text-black">
                      {supplierInsights.activeSuppliers.toLocaleString()}
                    </span>
                  </p>
                </div>
                <div className="rounded-lg border border-[#e6e6e6] bg-white p-4">
                  <p className="text-xs text-gray-500">On-time delivery</p>
                  <p className="mt-1 text-2xl font-semibold text-black">
                    {supplierInsights.onTimeRate}%
                  </p>
                  <p className="mt-1 text-[11px] uppercase tracking-wide text-emerald-600">
                    Goal ≥ 90%
                  </p>
                </div>
                <div className="rounded-lg border border-[#e6e6e6] bg-white p-4">
                  <p className="text-xs text-gray-500">Top supplier value</p>
                  <p className="mt-1 text-2xl font-semibold text-black">
                    {formatCurrency(
                      supplierInsights.topSuppliers[0]?.value ?? 0,
                      userCurrency,
                    )}
                  </p>
                  <p className="mt-1 text-[11px] uppercase tracking-wide text-gray-500">
                    {supplierInsights.topSuppliers[0]?.name ?? '—'}
                  </p>
                </div>
              </div>
                    {supplierInsights.topSuppliers.length === 0 ? (
                <div className="flex h-40 flex-col items-center justify-center rounded-lg">
                  <Building2 className="mb-3 h-8 w-8 text-gray-300" />
                  <p className="text-sm font-semibold text-gray-600">
                    Supplier data not yet available
                  </p>
                  <p className="mt-1 text-xs text-gray-500">
                    Add suppliers or sync purchase orders to populate this view.
                  </p>
                </div>
              ) : (
                <div>
                  <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Priority suppliers
                  </h3>
                  <ul className="space-y-3">
                        {supplierInsights.topSuppliers.map((supplier, index) => (
                      <li
                        key={supplier.supplierId}
                        className="flex items-center justify-between rounded-lg border border-[#e6e6e6] bg-white px-4 py-3"
                      >
                        <div className="flex items-center gap-3">
                          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#f7faff] text-xs font-semibold text-[#0a61d7]">
                            {index + 1}
                          </span>
                          <div>
                            <p className="text-sm font-semibold text-black">
                              {supplier.name}
                            </p>
                            <p className="text-xs text-gray-500">
                              {supplier.status}
                            </p>
                          </div>
                        </div>
                        <div className="text-right text-sm">
                          <p className="text-xs text-gray-500">Fulfillment value</p>
                          <p className="font-semibold text-black">
                            {formatCurrency(supplier.value, userCurrency)}
                          </p>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ),
        };
      case 'logistics':
        return {
          subtitle: 'Logistics tracking and delivery milestones',
          action: (
            <Link
              href="/orders"
              className="inline-flex items-center gap-1 text-xs font-semibold text-[#0a61d7] hover:text-[#084ba6]"
            >
              View logistics
              <ArrowRight className="w-4 h-4" />
            </Link>
          ),
          content: (
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <div className="rounded-lg border border-[#e6e6e6] bg-white p-4">
                  <p className="text-xs text-gray-500">Total shipments</p>
                  <p className="mt-1 text-2xl font-semibold text-black">
                    {orders.filter(order => order.deliveryMethod === 'Distributor Fleet').length.toLocaleString()}
                  </p>
                  <p className="mt-1 text-[11px] uppercase tracking-wide text-gray-500">
                    Distributor Fleet
                  </p>
                </div>
                <div className="rounded-lg border border-[#e6e6e6] bg-white p-4">
                  <p className="text-xs text-gray-500">On-time delivery</p>
                  <p className="mt-1 text-2xl font-semibold text-black">
                    {supplierInsights.onTimeRate}%
                  </p>
                  <p className="mt-1 text-[11px] uppercase tracking-wide text-emerald-600">
                    Goal ≥ 90%
                  </p>
                </div>
                <div className="rounded-lg border border-[#e6e6e6] bg-white p-4">
                  <p className="text-xs text-gray-500">Avg. delivery time</p>
                  <p className="mt-1 text-2xl font-semibold text-black">
                    {/* This data is not directly available in the current data,
                        so we'll just show a placeholder or a generic value. */}
                    3 days
                  </p>
                  <p className="mt-1 text-[11px] uppercase tracking-wide text-gray-500">
                    Across all shipments
                  </p>
                </div>
              </div>
              <div className="rounded-lg border border-[#e6e6e6] bg-white p-4">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-sm font-semibold text-black">Active shipments map</p>
                  <span className="text-xs text-gray-500">
                    {logisticsMapMarkers.length.toLocaleString()} location
                    {logisticsMapMarkers.length === 1 ? '' : 's'}
                  </span>
                </div>
                {isLogisticsGeocoding && logisticsMapMarkers.length === 0 ? (
                  <div className="flex h-72 flex-col items-center justify-center rounded-lg bg-gray-100">
                    <Loader2 className="mb-3 h-8 w-8 text-gray-400 animate-spin" />
                    <p className="text-sm font-semibold text-gray-600">Loading shipment locations</p>
                    <p className="text-xs text-gray-500">Geocoding delivery addresses</p>
                  </div>
                ) : logisticsMapMarkers.length > 0 ? (
                  <MapComponent
                    markers={logisticsMapMarkers}
                    center={logisticsMapCenter}
                    height="320px"
                    showControls
                    onMarkerClick={handleLogisticsMarkerClick}
                  />
                ) : (
                  <div className="flex h-72 flex-col items-center justify-center rounded-lg bg-gray-100">
                    <MapPin className="mb-3 h-10 w-10 text-gray-400" />
                    <p className="text-sm font-semibold text-gray-600">No active shipments to display</p>
                    <p className="text-xs text-gray-500">Orders with delivery addresses will appear here</p>
                  </div>
                )}
              </div>
            </div>
          ),
        };
      case 'inventory': {
        const totalProducts = products.length;
        const activeProductCount = products.filter((p) => p.status === 'Published').length;
        const productsWithStock = products.map((product) => {
          const { totalStock, lowStockThreshold } = resolveProductStock(product);
          return {
            product,
            totalStock,
            lowStockThreshold,
          };
        });
        const totalPieces = productsWithStock.reduce((sum, item) => sum + item.totalStock, 0);
        const lowStockItems = productsWithStock
          .filter(({ totalStock, lowStockThreshold }) => {
            if (lowStockThreshold > 0) {
              return totalStock <= lowStockThreshold;
            }
            return totalStock === 0;
          })
          .sort((a, b) => a.totalStock - b.totalStock);
        const criticalLowStockItems = lowStockItems.filter(({ totalStock, lowStockThreshold }) => {
          if (lowStockThreshold > 0) {
            return totalStock < lowStockThreshold * 0.5;
          }
          return totalStock === 0;
        });
        const averageStock = totalProducts > 0 ? totalPieces / totalProducts : 0;
        const lowStockPreview = lowStockItems.slice(0, 3);
 
        return {
          subtitle: 'Inventory management and stock alerts',
          action: (
            <Link
              href="/products"
              className="inline-flex items-center gap-1 text-xs font-semibold text-[#0a61d7] hover:text-[#084ba6]"
            >
              Manage products
              <ArrowRight className="w-4 h-4" />
            </Link>
          ),
          content: (
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <div className="rounded-lg border border-[#e6e6e6] bg-white p-4">
                  <p className="text-xs text-gray-500">Total products</p>
                  <p className="mt-1 text-2xl font-semibold text-black">
                    {totalProducts.toLocaleString()}
                  </p>
                  <p className="mt-1 text-[11px] uppercase tracking-wide text-gray-500">
                    Active: {activeProductCount.toLocaleString()} | Pieces: {totalPieces.toLocaleString()}
                  </p>
                </div>
                <div className="rounded-lg border border-[#e6e6e6] bg-white p-4">
                  <p className="text-xs text-gray-500">Low stock</p>
                  <p className="mt-1 text-2xl font-semibold text-black">
                    {lowStockItems.length.toLocaleString()}
                  </p>
                  <p className="mt-1 text-[11px] uppercase tracking-wide text-red-600">
                    Critical: {criticalLowStockItems.length.toLocaleString()}
                  </p>
                </div>
                <div className="rounded-lg border border-[#e6e6e6] bg-white p-4">
                  <p className="text-xs text-gray-500">Avg. stock level</p>
                  <p className="mt-1 text-2xl font-semibold text-black">
                    {Math.round(averageStock).toLocaleString()}
                  </p>
                  <p className="mt-1 text-[11px] uppercase tracking-wide text-gray-500">
                    Across all products
                  </p>
                </div>
              </div>
              {lowStockPreview.length === 0 ? (
                <div className="flex h-40 flex-col items-center justify-center rounded-lg">
                  <Layers className="mb-3 h-8 w-8 text-gray-300" />
                  <p className="text-sm font-semibold text-gray-500">No low-stock products.</p>
                  <p className="mt-1 text-xs text-gray-400">Low stocks will appear here if there are any.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Top low stock products
                  </h3>
                  <ul className="space-y-2">
                    {lowStockPreview.map(({ product: lowStockProduct, totalStock, lowStockThreshold }) => (
                      <li
                        key={lowStockProduct.productId}
                        className="flex flex-col gap-2 rounded-lg border border-[#e6e6e6] bg-white p-3"
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-semibold text-black">
                            {lowStockProduct.name}
                          </span>
                          <Link
                            href={`/products/catalog/${lowStockProduct.productId}`}
                            className="text-xs font-semibold text-[#0a61d7] hover:text-[#084ba6]"
                          >
                            View product
                          </Link>
                        </div>
                        <div className="flex flex-wrap gap-3 text-xs text-gray-500">
                          <span>
                            Stock:{' '}
                            <span className="font-semibold text-black">{totalStock.toLocaleString()}</span>
                          </span>
                          <span>
                            Threshold:{' '}
                            <span className="font-semibold text-black">{(lowStockThreshold || 0).toLocaleString()}</span>
                          </span>
                          <span>
                            Status:{' '}
                            <span className="font-semibold text-red-600">Low stock</span>
                          </span>
                        </div>
                      </li>
                    ))}
                  </ul>
                  {lowStockItems.length > lowStockPreview.length ? (
                    <p className="text-xs text-gray-500">
                      {lowStockItems.length - lowStockPreview.length} more product(s) are below threshold.
                    </p>
                  ) : null}
                </div>
              )}
            </div>
          ),
        };
      }
      case 'marketing':
        return {
          subtitle: 'Campaign performance and channel impact',
          action: (
            <Link
              href="/marketing"
              className="inline-flex items-center gap-1 text-xs font-semibold text-[#0a61d7] hover:text-[#084ba6]"
            >
              View marketing
              <ArrowRight className="w-4 h-4" />
            </Link>
          ),
          content: (
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-lg border border-[#e6e6e6] bg-white p-4">
                  <p className="text-xs text-gray-500">Total campaigns</p>
                  <p className="mt-1 text-2xl font-semibold text-black">
                    {/* This data is not directly available in the current data,
                        so we'll just show a placeholder or a generic value. */}
                    0
                  </p>
                  <p className="mt-1 text-[11px] uppercase tracking-wide text-gray-500">
                    Planned: 0
                  </p>
                </div>
                <div className="rounded-lg border border-[#e6e6e6] bg-white p-4">
                  <p className="text-xs text-gray-500">Conversion rate</p>
                  <p className="mt-1 text-2xl font-semibold text-black">
                    {/* This data is not directly available in the current data,
                        so we'll just show a placeholder or a generic value. */}
                    0%
                  </p>
                  <p className="mt-1 text-[11px] uppercase tracking-wide text-gray-500">
                    Across all campaigns
                  </p>
                </div>
                <div className="rounded-lg border border-[#e6e6e6] bg-white p-4">
                  <p className="text-xs text-gray-500">Avg. ROI</p>
                  <p className="mt-1 text-2xl font-semibold text-black">
                    {/* This data is not directly available in the current data,
                        so we'll just show a placeholder or a generic value. */}
                    0%
                  </p>
                  <p className="mt-1 text-[11px] uppercase tracking-wide text-gray-500">
                    Across all campaigns
                  </p>
                </div>
                <div className="rounded-lg border border-[#e6e6e6] bg-white p-4">
                  <p className="text-xs text-gray-500">Top performing channel</p>
                  <p className="mt-1 text-2xl font-semibold text-black">
                    {/* This data is not directly available in the current data,
                        so we'll just show a placeholder or a generic value. */}
                    Direct
                  </p>
                  <p className="mt-1 text-[11px] uppercase tracking-wide text-gray-500">
                    {/* This data is not directly available in the current data,
                        so we'll just show a placeholder or a generic value. */}
                    Across all campaigns
                  </p>
                </div>
              </div>
              {/* Placeholder for marketing performance content */}
              <div className="flex h-40 flex-col items-center justify-center rounded-lg">
                <Megaphone className="mb-3 h-8 w-8 text-gray-300" />
                <p className="text-sm font-semibold text-gray-600">
                  Marketing performance feature coming soon
                </p>
                <p className="mt-1 text-xs text-gray-500">
                  We are working on integrating marketing performance metrics.
                </p>
              </div>
            </div>
          ),
        };
      default:
        return {
          content: (
            <div className="flex h-48 flex-col items-center justify-center rounded-lg">
              <Settings2 className="mb-3 h-10 w-10 text-gray-300" />
              <p className="text-sm font-semibold text-gray-600">
                Widget not found
              </p>
              <p className="mt-1 text-xs text-gray-500">
                This widget is not defined in the library.
              </p>
            </div>
          ),
        };
    }
  };

  const getWidgetMeta = (widgetId: WidgetId) =>
    WIDGET_LIBRARY.find((widget) => widget.id === widgetId);

  const activeWidgets: WidgetId[] = widgetOrder;

  const renderedWidgets: React.ReactNode =
    activeWidgets.length === 0
      ? (
          <div className="col-span-12 flex h-60 flex-col items-center justify-center rounded-lg bg-white text-center">
            <Settings2 className="mb-3 h-8 w-8 text-[#0a61d7]" />
            <p className="text-sm font-semibold text-black">
              No widgets selected
            </p>
            <p className="text-xs text-gray-500">
              Use "Drag widgets to rearrange" to add modules to this dashboard.
            </p>
          </div>
        )
      : activeWidgets.map((id) => {
          const meta = getWidgetMeta(id);
          if (!meta) {
            return null;
          }
          const { content, subtitle, action } = renderWidget(id);
          const Icon = meta.icon;
          const layoutClass = WIDGET_LAYOUT[id] ?? DEFAULT_WIDGET_LAYOUT;
          return (
            <div
              key={id}
              draggable
              onDragStart={(event) => handleDragStart(event, id)}
              onDragEnter={() => handleDragEnter(id)}
              onDragLeave={() => handleDragLeave(id)}
              onDragEnd={handleDragEnd}
              onDrop={(event) => handleDrop(event, id)}
              onDragOver={(event) => event.preventDefault()}
              aria-grabbed={draggingWidget === id}
              className={`${layoutClass} rounded-lg transition-all ${
                hoverWidget === id ? 'ring-2 ring-[#0a61d7]/60' : ''
              } ${draggingWidget === id ? 'opacity-75' : 'opacity-100'}`}
            >
              <article className="flex h-full flex-col rounded-lg border border-[#e6e6e6] bg-white">
                <div className="flex items-start justify-between gap-3 border-b border-[#e6e6e6] px-4 py-4">
                  <div className="flex items-start gap-3">
                    <button
                      type="button"
                      className="mt-0.5 text-gray-400 hover:text-[#0a61d7] focus:outline-none"
                      aria-label="Drag to reorder widget"
                    >
                      <GripVertical className="h-4 w-4" />
                    </button>
                    <div className="flex items-start gap-2">
                      <div className="mt-0.5 flex h-7 w-7 items-center justify-center rounded-md bg-[#f7faff] text-[#0a61d7]">
                        <Icon className="h-4 w-4" />
                      </div>
                      <div>
                        <h2 className="text-sm font-semibold text-black">
                          {meta.name}
                        </h2>
                        {subtitle ? (
                          <p className="mt-1 text-xs text-gray-500">{subtitle}</p>
                        ) : null}
                      </div>
                    </div>
                  </div>
                  {action ? <div>{action}</div> : null}
                </div>
                <div className="p-4">{content}</div>
              </article>
            </div>
          );
        });

  if (loading) {
    return (
      <div className="w-full mx-auto p-4 bg-gray-50 min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-[#0a61d7] border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white p-6">
        <div className="mx-auto max-w-3xl">
          <div className="rounded-lg border border-rose-200 bg-rose-50 p-6">
            <h2 className="text-lg font-semibold text-rose-700">
              We could not load your dashboard
            </h2>
            <p className="mt-2 text-sm text-rose-600">{error}</p>
            <button
              type="button"
              className="mt-4 inline-flex items-center gap-2 rounded-lg bg-[#0a61d7] px-4 py-2 text-sm font-semibold text-white hover:bg-[#084ba6]"
              onClick={() => {
                setError(null);
                setLoading(true);
                setOrders([]);
                setProducts([]);
                setBuyers([]);
                setSuppliers([]);
              }}
            >
              Retry
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      {isWidgetManagerOpen && (
        <div
          ref={widgetManagerRef}
          className="border border-[#e6e6e6] bg-white"
        >
          <div className="flex items-start justify-between border-b border-[#e6e6e6] px-5 py-4">
            <div>
              <h3 className="text-sm font-semibold text-black">Widget Library</h3>
              <p className="text-xs text-gray-500">
                Drag widgets above to rearrange or add new modules.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setIsWidgetManagerOpen(false)}
              className="rounded-full border border-gray-200 p-1 text-gray-500 transition hover:border-gray-300 hover:text-black"
              aria-label="Close widget library"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="overflow-x-auto px-5 py-5">
            <div className="flex min-w-full items-stretch gap-4">
              {WIDGET_LIBRARY.map((widget) => {
                const Icon = widget.icon;
                const isActive = widgetOrder.includes(widget.id);
                return (
                  <div
                    key={widget.id}
                    draggable
                    onDragStart={(event) => handleLibraryDragStart(event, widget.id)}
                    onDragEnd={handleDragEnd}
                    className={`group flex min-w-[22rem] max-w-[22rem] cursor-grab flex-col justify-between rounded-lg border border-[#e6e6e6] bg-white p-5 transition hover:border-[#0a61d7] active:cursor-grabbing ${
                      isActive ? 'opacity-95' : ''
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#f7faff] text-[#0a61d7]">
                        <Icon className="h-5 w-5" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-black">
                          {widget.name}
                        </p>
                        <p className="text-xs text-gray-500">
                          {widget.description}
                        </p>
                      </div>
                    </div>
                    <div className="mt-4 flex items-center justify-between">
                      <span className="text-[11px] uppercase tracking-wide text-gray-400">
                        Drag to {isActive ? 'reorder' : 'add'}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleWidgetToggle(widget.id)}
                        className={`rounded-lg px-3 py-1 text-xs font-semibold transition ${
                          isActive
                            ? 'border border-gray-200 text-gray-600 hover:border-rose-300 hover:text-rose-500'
                            : 'bg-[#0a61d7] text-white hover:bg-[#084ba6]'
                        }`}
                      >
                        {isActive ? 'Remove' : 'Add'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white p-4">
        <div className="mx-auto flex flex-col gap-4">
          <header className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-semibold text-black">Dashboard Overview</h1>
              <p className="text-sm text-gray-600">
                Customize the widgets you need most for faster decision making.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setIsWidgetManagerOpen((prev) => !prev)}
              className="inline-flex items-center gap-2 rounded-lg border border-[#e6e6e6] bg-white px-3 py-2 text-xs font-semibold text-black transition hover:border-[#0a61d7]"
            >
              <Settings2 className="h-4 w-4 text-[#0a61d7]" />
              Drag widgets to rearrange
            </button>
          </header>

          {statCards.length > 0 && (
            <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {statCards.map((card) => (
                <AnalyticsMetricCard
                  key={card.id}
                  title={card.title}
                  value={card.value}
                  change={card.change}
                  icon={card.icon}
                  color={card.color}
                />
              ))}
            </section>
          )}

          <section
            className="grid grid-cols-1 gap-4 xl:grid-cols-12"
            onDragOver={(event) => event.preventDefault()}
            onDrop={handleDropToEnd}
          >
            {renderedWidgets}
          </section>
        </div>
      </div>
    </>
  );
}
