"use client";

import { SkeletonHomePage } from '@/components/skeleton/SkeletonHomePage';
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
  Briefcase,
  // Megaphone,
  // Activity,
  // Target,
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
import { getDefaultCurrency, formatCompactCurrency } from '@/utils/currencyUtils';
import { computeOrdersListGrowth } from '@/utils/monthOverMonthGrowth';
import { sumOrderVolume } from '@/utils/orderCalculations';
import type { Order, OrderItem } from '@/types/order';
import type { Product } from '@/types/product';
import type { Buyer, Supplier, SupplyDetail } from '@/types/client';
import MapComponent from '@/components/ordershipment/MapComponent';
import { useMapboxToken } from '@/hooks/useMapboxToken';
import {
  geocodeViaProxy,
  GeocodeResult,
  MapCoordinates,
  getOrderStatusMarkerColor,
} from '@/utils/mapboxUtils';
import { useTranslations } from 'next-intl';
import { salesJobStatusKey } from '@/components/sales/salesJobTypes';
import { useHomeTranslations } from './useHomeTranslations';
import SalesConversionEngineWidget from '@/components/dashboard/SalesConversionEngineWidget';

type WidgetId =
  | 'conversion'
  | 'analytics'
  | 'orders'
  | 'products'
  | 'buyers'
  | 'suppliers'
  | 'salesJobs'
  | 'inventory'
  | 'sales';

interface WidgetDefinition {
  id: WidgetId;
  defaultActive: boolean;
  icon: LucideIcon;
}

const WIDGET_LIBRARY: WidgetDefinition[] = [
  // MVP pause: sales / analytics entry widgets
  // {
  //   id: 'conversion',
  //   defaultActive: true,
  //   icon: Target,
  // },
  // {
  //   id: 'analytics',
  //   defaultActive: true,
  //   icon: Activity,
  // },
  {
    id: 'orders',
    defaultActive: true,
    icon: ShoppingCart,
  },
  {
    id: 'products',
    defaultActive: true,
    icon: Package,
  },
  {
    id: 'inventory',
    defaultActive: true,
    icon: Layers,
  },
  {
    id: 'buyers',
    defaultActive: true,
    icon: Users,
  },
  {
    id: 'suppliers',
    defaultActive: true,
    icon: Building2,
  },
  // {
  //   id: 'salesJobs',
  //   defaultActive: false,
  //   icon: Briefcase,
  // },
  // {
  //   id: 'sales',
  //   defaultActive: false,
  //   icon: Megaphone,
  // },
];

const DEFAULT_WIDGET_ORDER: WidgetId[] = WIDGET_LIBRARY.filter(
  (widget) => widget.defaultActive,
).map((widget) => widget.id);

const WIDGET_ID_SET = new Set<WidgetId>(
  WIDGET_LIBRARY.map((widget) => widget.id),
);

type WidgetLayoutStorage = {
  order: WidgetId[];
  conversionWidgetIntroduced?: boolean;
};

/** Uniform size for all widgets in the 2-column dashboard layout */
const UNIFORM_WIDGET_LAYOUT = 'min-h-[320px]';

const MAX_PIPELINE_ROWS = 3;
const MAX_PRODUCT_PERFORMANCE_ROWS = 3;

const WIDGET_LAYOUT_STORAGE_PREFIX = 'laku-dashboard-widgets';

function getWidgetLayoutStorageKey(userId: number | null | undefined): string | null {
  if (userId == null || typeof userId !== 'number' || Number.isNaN(userId)) {
    return null;
  }
  return `${WIDGET_LAYOUT_STORAGE_PREFIX}-${userId}`;
}

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
        paidAt
        createdAt
        updatedAt
        acceptedBy
        acceptedAt
        estimatedDeliveryDate
        estimatedDeliveryMinDays
        estimatedDeliveryMaxDays
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
    estimatedDeliveryDate: raw.estimatedDeliveryDate ? parseDate(raw.estimatedDeliveryDate) : undefined,
    estimatedDeliveryMinDays: raw.estimatedDeliveryMinDays != null ? Number(raw.estimatedDeliveryMinDays) : undefined,
    estimatedDeliveryMaxDays: raw.estimatedDeliveryMaxDays != null ? Number(raw.estimatedDeliveryMaxDays) : undefined,
    deliveredAt: raw.deliveredAt ? parseDate(raw.deliveredAt) : undefined,
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

/** Sales summary: teams and agents (for Sales widget) */
interface SalesTeamSummary {
  id: string;
  name: string;
  memberCount: number;
}

interface SalesSummary {
  teams: SalesTeamSummary[];
  totalAgents: number;
  activeAgents: number;
}

interface HomeSalesJob {
  id: string;
  assignedTo: string;
  clientId: string;
  agentName: string;
  clientName: string;
  jobType: string;
  status: string;
  createdAt: string;
}

const JOB_STATUS_BADGE: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-800',
  dispatched: 'bg-purple-100 text-purple-800',
  in_progress: 'bg-blue-100 text-blue-800',
  completed: 'bg-green-100 text-green-800',
  skipped: 'bg-gray-100 text-gray-700',
};

const MAX_SALES_JOB_ROWS = 4;

interface WidgetRenderResult {
  content: ReactNode;
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
  Received: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  Failed: 'bg-rose-50 text-rose-700 border-rose-200',
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

  return {
    totalStock: Number(product.stockQuantity ?? 0),
    lowStockThreshold: Number(product.lowStockThreshold ?? 0),
  };
};

export default function HomePage() {
  const {
    t,
    tCommon,
    formatOrderDate,
    widgetName,
    widgetDescription,
    widgetText,
    translateRecordStatus,
    translateOrderStatus,
  } = useHomeTranslations();
  const tJobs = useTranslations('dashboard.sales.salesJobs');
  const { user, isHydrated } = useUserStore();
  const [orders, setOrders] = useState<Order[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [buyers, setBuyers] = useState<Buyer[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [salesSummary, setSalesSummary] = useState<SalesSummary | null>(null);
  const [salesJobs, setSalesJobs] = useState<HomeSalesJob[]>([]);
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
  const [hasHydratedLayout, setHasHydratedLayout] = useState(false);

  const userCurrency = user?.currency || getDefaultCurrency();
  const hasData = orders.length > 0;
  const logisticsGeocodedAddressesRef = useRef<Set<string>>(new Set());
  const [logisticsGeocodeResults, setLogisticsGeocodeResults] = useState<Map<string, GeocodeResult>>(new Map());
  const [isLogisticsGeocoding, setIsLogisticsGeocoding] = useState(false);
  const { token: mapboxToken } = useMapboxToken();
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
    const storageKey = getWidgetLayoutStorageKey(user?.id);
    if (!storageKey) {
      setHasHydratedLayout(true);
      return;
    }
    const stored = window.localStorage.getItem(storageKey);
    if (!stored) {
      setHasHydratedLayout(true);
      return;
    }
    try {
      const parsed = JSON.parse(stored) as WidgetLayoutStorage | WidgetId[];
      const rawOrder: unknown[] = Array.isArray(parsed)
        ? parsed
        : Array.isArray(parsed?.order)
          ? parsed.order
          : [];
      const normalized = rawOrder.map((id) => {
        if (id === 'marketing') return 'sales';
        if (id === 'logistics') return 'salesJobs';
        return id;
      });
      const sanitized = normalized.filter((id): id is WidgetId =>
        WIDGET_ID_SET.has(id as WidgetId),
      );
      const deduped = Array.from(new Set<WidgetId>(sanitized));
      const storedRecord = Array.isArray(parsed) ? null : parsed;
      const conversionIntroduced = storedRecord?.conversionWidgetIntroduced === true;
      if (!deduped.includes('conversion') && !conversionIntroduced) {
        deduped.unshift('conversion');
      }
      setWidgetOrder(deduped.length > 0 ? deduped : DEFAULT_WIDGET_ORDER);
    } catch {
      setWidgetOrder(DEFAULT_WIDGET_ORDER);
    }
    setHasHydratedLayout(true);
  }, [user?.id]);

  useEffect(() => {
    if (typeof window === 'undefined' || !hasHydratedLayout) {
      return;
    }
    const storageKey = getWidgetLayoutStorageKey(user?.id);
    if (!storageKey) {
      return;
    }
    const payload: WidgetLayoutStorage = {
      order: widgetOrder,
      conversionWidgetIntroduced: true,
    };
    window.localStorage.setItem(storageKey, JSON.stringify(payload));
  }, [widgetOrder, hasHydratedLayout, user?.id]);

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
        const newResults = await geocodeViaProxy(addressesToGeocode);
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
    // Guard OUTSIDE the try/finally so that the finally block never runs when
    // the store hasn't hydrated yet. A guard inside try() still triggers finally,
    // which calls setLoading(false) and kills the skeleton prematurely.
    if (!isHydrated) {
      return;
    }

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
          setSalesSummary(null);
          setSalesJobs([]);
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
          throw new Error(t('loadErrorFallback'));
        }

        const responseText = await response.text();
        if (!responseText || responseText.trim().length === 0) {
          throw new Error(t('loadErrorFallback'));
        }

        let payload;
        try {
          payload = JSON.parse(responseText);
        } catch (parseError) {
          throw new Error(t('loadErrorFallback'));
        }

        if (payload.errors && payload.errors.length > 0) {
          throw new Error(payload.errors[0]?.message || t('loadErrorFallback'));
        }

        const snapshot = payload.data?.dashboardSnapshot;
        if (!snapshot) {
          throw new Error(t('loadErrorFallback'));
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

          const rawSummary = (snapshot as { salesSummary?: Record<string, unknown> }).salesSummary;
          if (rawSummary && typeof rawSummary === 'object') {
            const teamsRaw = Array.isArray(rawSummary.teams) ? rawSummary.teams : [];
            const teams: SalesTeamSummary[] = teamsRaw
              .filter((t): t is Record<string, unknown> => t != null && typeof t === 'object')
              .map((t) => ({
                id: parseString(t.id, ''),
                name: parseString(t.name, 'Unnamed'),
                memberCount: typeof t.memberCount === 'number' ? t.memberCount : parseNumber(t.memberCount),
              }))
              .filter((t) => t.id);
            setSalesSummary({
              teams,
              totalAgents: typeof rawSummary.totalAgents === 'number' ? rawSummary.totalAgents : parseNumber(rawSummary.totalAgents),
              activeAgents: typeof rawSummary.activeAgents === 'number' ? rawSummary.activeAgents : parseNumber(rawSummary.activeAgents),
            });
          } else {
            setSalesSummary({ teams: [], totalAgents: 0, activeAgents: 0 });
          }

          try {
            const jobsResponse = await fetch('/api/graphql', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              signal: controller.signal,
              body: JSON.stringify({
                query: `query HomeSalesJobs($userId: Int!) {
                  salesJobs(userId: $userId) {
                    id assignedTo clientId agentName clientName jobType status createdAt
                  }
                }`,
                variables: { userId: user!.id },
              }),
            });
            if (controller.signal.aborted) return;
            if (!jobsResponse.ok) {
              setSalesJobs([]);
            } else {
              const jobsPayload = await jobsResponse.json();
              const rows = Array.isArray(jobsPayload?.data?.salesJobs) ? jobsPayload.data.salesJobs : [];
              setSalesJobs(
                rows
                  .filter((row: unknown): row is Record<string, unknown> => row != null && typeof row === 'object')
                  .map((row: Record<string, unknown>) => ({
                    id: parseString(row.id, ''),
                    assignedTo: parseString(row.assignedTo, ''),
                    clientId: parseString(row.clientId, ''),
                    agentName: parseString(row.agentName, ''),
                    clientName: parseString(row.clientName, ''),
                    jobType: parseString(row.jobType, ''),
                    status: parseString(row.status, 'pending'),
                    createdAt: parseString(row.createdAt, ''),
                  }))
                  .filter((row: HomeSalesJob) => row.id),
              );
            }
          } catch {
            if (!controller.signal.aborted) setSalesJobs([]);
          }
      } catch (fetchError) {
        if (
          !(fetchError instanceof DOMException && fetchError.name === 'AbortError')
        ) {
          setError(
            fetchError instanceof Error
              ? fetchError.message
              : t('loadErrorFallback'),
          );
          setOrders([]);
          setProducts([]);
          setBuyers([]);
          setSuppliers([]);
          setSalesSummary(null);
          setSalesJobs([]);
        }
      } finally {
        // Only clear loading if THIS run wasn't aborted. When the effect re-runs
        // (Strict Mode double-invoke, user?.id changing null->X after hydration,
        // or AuthSync updating the user), the cleanup aborts the stale fetch. Its
        // finally must NOT flip loading=false, otherwise the skeleton disappears
        // and zero values flash while the newer fetch is still in flight.
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    };

    fetchData();
    return () => controller.abort();
  }, [user?.id, isHydrated]);

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

  return {
    totalBuyers,
    activeBuyers,
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

  const maxTopProductOrderVolume = useMemo(() => {
    return topProductsWithDetails.reduce(
      (max, product) => (product.orderVolume > max ? product.orderVolume : max),
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

  const salesJobCounts = useMemo(() => {
    const counts = { pending: 0, dispatched: 0, in_progress: 0, completed: 0 };
    for (const job of salesJobs) {
      const key = salesJobStatusKey(job.status);
      if (key === 'pending' || key === 'dispatched' || key === 'in_progress' || key === 'completed') {
        counts[key] += 1;
      }
    }
    return counts;
  }, [salesJobs]);

  const recentSalesJobs = useMemo(
    () => [...salesJobs].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, MAX_SALES_JOB_ROWS),
    [salesJobs],
  );

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

  const orderGrowth = useMemo(() => computeOrdersListGrowth(orders), [orders]);
  const listedOrderVolume = useMemo(() => sumOrderVolume(orders), [orders]);

  const statCards = useMemo(() => {
    // Don't calculate if still loading to avoid showing 0 values
    if (loading) {
      return [];
    }
    const totalOrderCount = aggregates?.totalOrders ?? orders.length;
    const listCoversEveryOrder =
      aggregates != null && orders.length === aggregates.totalOrders;
    const orderVolume = listCoversEveryOrder
      ? listedOrderVolume
      : (aggregates?.totalRevenue ?? listedOrderVolume);
    const averageOrderVolume = totalOrderCount > 0 ? orderVolume / totalOrderCount : 0;
    return [
      {
        id: 'orderVolume',
        title: t('stats.orderVolume'),
        value: formatCurrency(orderVolume, userCurrency),
        change: orderGrowth.orderVolumeGrowth,
        previousValue:
          orderGrowth.orderVolumePrevious != null
            ? formatCompactCurrency(orderGrowth.orderVolumePrevious, userCurrency)
            : undefined,
        icon: <DollarSign className="w-6 h-6 text-[#0a61d7]" />,
        color: 'bg-[#f7faff]',
      },
      {
        id: 'totalOrders',
        title: t('stats.totalOrders'),
        value: totalOrderCount.toLocaleString(),
        change: orderGrowth.ordersGrowth,
        previousValue:
          orderGrowth.ordersPrevious != null
            ? orderGrowth.ordersPrevious.toLocaleString()
            : undefined,
        icon: <ShoppingCart className="w-6 h-6 text-[#0a61d7]" />,
        color: 'bg-[#f7faff]',
      },
      {
        id: 'piecesSold',
        title: t('stats.piecesSold'),
        value: safeSalesMetrics.totalUnitsSold.toLocaleString(),
        change: orderGrowth.piecesGrowth,
        previousValue:
          orderGrowth.piecesPrevious != null
            ? orderGrowth.piecesPrevious.toLocaleString()
            : undefined,
        icon: <Package className="w-6 h-6 text-[#0a61d7]" />,
        color: 'bg-[#f7faff]',
      },
      {
        id: 'averageOrderVolume',
        title: t('stats.averageOrderVolume'),
        value: formatCurrency(averageOrderVolume, userCurrency),
        change: orderGrowth.averageOrderVolumeGrowth,
        previousValue:
          orderGrowth.averageOrderVolumePrevious != null
            ? formatCompactCurrency(orderGrowth.averageOrderVolumePrevious, userCurrency)
            : undefined,
        icon: <DollarSign className="w-6 h-6 text-[#0a61d7]" />,
        color: 'bg-[#f7faff]',
      },
    ];
  }, [
    loading,
    aggregates,
    safeSalesMetrics.totalUnitsSold,
    listedOrderVolume,
    userCurrency,
    orders.length,
    orderGrowth,
    t,
  ]);

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
    event.stopPropagation();
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
        if (fromIndex === -1 || toIndex === -1 || fromIndex === toIndex) {
          return prev;
        }
        next.splice(fromIndex, 1);
        // Place widget exactly where user dropped it. After removal: moving right and adjacent → insert at toIndex; moving right and not adjacent → insert at toIndex-1; moving left → insert at toIndex.
        const movingRight = fromIndex < toIndex;
        const insertAt = movingRight
          ? (toIndex === fromIndex + 1 ? toIndex : toIndex - 1)
          : toIndex;
        next.splice(insertAt, 0, sourceId);
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
      case 'conversion':
        return {
          action: (
            <Link
              href="/sales"
              className="inline-flex items-center gap-1 text-xs font-semibold text-[#0a61d7] hover:text-[#084ba6]"
            >
              {widgetText('conversion', 'action')}
              <ArrowRight className="w-4 h-4" />
            </Link>
          ),
          content: (
            <SalesConversionEngineWidget
              orders={orders}
              buyers={buyers}
              salesJobs={salesJobs}
              currency={userCurrency}
              embedded
            />
          ),
        };
      case 'analytics':
        return {
          action: (
            <Link
              href="/analytics"
              className="inline-flex items-center gap-1 text-xs font-semibold text-[#0a61d7] hover:text-[#084ba6]"
            >
              {widgetText('analytics', 'action')}
              <ArrowRight className="w-4 h-4" />
            </Link>
          ),
          content: (
            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs text-gray-500">
                <span className="font-semibold uppercase tracking-wide text-gray-600">
                  {widgetText('analytics', 'thisYear')}
                </span>
                <span>
                  {widgetText('analytics', 'totalOrderVolume')}{' '}
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
          action: (
            <Link
              href="/orders"
              className="inline-flex items-center gap-1 text-xs font-semibold text-[#0a61d7] hover:text-[#084ba6]"
            >
              {widgetText('orders', 'action')}
              <ArrowRight className="w-4 h-4" />
            </Link>
          ),
          content: (
            <div className="space-y-4">
              <div className="rounded-lg border border-[#e6e6e6] bg-white p-4">
                <div className="mb-3 flex items-center justify-between">
                  <p className="text-sm font-semibold text-black">{widgetText('orders', 'activeShipmentsMap')}</p>
                  <span className="text-xs text-gray-500">
                    {logisticsMapMarkers.length.toLocaleString()}{' '}
                    {logisticsMapMarkers.length === 1
                      ? widgetText('orders', 'location')
                      : widgetText('orders', 'locations')}
                  </span>
                </div>
                {isLogisticsGeocoding && logisticsMapMarkers.length === 0 ? (
                  <div className="flex h-72 flex-col items-center justify-center rounded-lg bg-gray-100">
                    <Loader2 className="mb-3 h-8 w-8 animate-spin text-gray-400" />
                    <p className="text-sm font-semibold text-gray-600">{widgetText('orders', 'loadingLocations')}</p>
                    <p className="text-xs text-gray-500">{widgetText('orders', 'geocoding')}</p>
                  </div>
                ) : logisticsMapMarkers.length > 0 ? (
                  <MapComponent
                    accessToken={mapboxToken}
                    markers={logisticsMapMarkers}
                    center={logisticsMapCenter}
                    height="250px"
                    showControls
                    onMarkerClick={handleLogisticsMarkerClick}
                  />
                ) : (
                  <div className="flex h-72 flex-col items-center justify-center rounded-lg bg-gray-100">
                    <MapPin className="mb-3 h-10 w-10 text-gray-400" />
                    <p className="text-sm font-semibold text-gray-600">{widgetText('orders', 'noActiveShipments')}</p>
                    <p className="text-xs text-gray-500">{widgetText('orders', 'noActiveShipmentsHint')}</p>
                  </div>
                )}
              </div>
              {recentOrders.length === 0 ? (
                <div className="flex flex-col items-center justify-center rounded-lg py-6">
                  <ShoppingCart className="mb-2 h-8 w-8 text-gray-300" />
                  <p className="text-sm font-semibold text-gray-600">{widgetText('orders', 'emptyTitle')}</p>
                  <p className="mt-1 text-xs text-gray-500">{widgetText('orders', 'emptyHint')}</p>
                </div>
              ) : (
                <div className="overflow-x-auto rounded-lg border border-[#e6e6e6]">
                  <table className="min-w-full text-xs">
                    <thead>
                      <tr className="bg-gray-100 text-gray-500 whitespace-nowrap">
                        <th className="px-3 py-2 text-left font-medium uppercase">{widgetText('orders', 'store')}</th>
                        <th className="px-3 py-2 text-left font-medium uppercase">{widgetText('orders', 'contact')}</th>
                        <th className="px-3 py-2 text-left font-medium uppercase">{widgetText('orders', 'date')}</th>
                        <th className="px-3 py-2 text-left font-medium uppercase">{widgetText('orders', 'amount')}</th>
                        <th className="px-3 py-2 text-left font-medium uppercase">{widgetText('orders', 'status')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recentOrders.map((order) => {
                        const statusClass = statusStyles[order.orderStatus] ?? 'bg-gray-100 text-gray-600 border-gray-200';
                        return (
                          <tr key={order.id} className="border-b border-[#e6e6e6] last:border-b-0">
                            <td className="px-3 py-2 font-semibold text-black whitespace-nowrap">
                              <Link href={`/orders/details/${order.orderId}`} className="hover:text-[#0a61d7]">
                                {order.storeName}
                              </Link>
                            </td>
                            <td className="px-3 py-2 text-gray-700 whitespace-nowrap">{order.contactPerson}</td>
                            <td className="px-3 py-2 text-gray-700 whitespace-nowrap">{formatOrderDate(order.orderDate)}</td>
                            <td className="px-3 py-2 font-semibold text-black whitespace-nowrap">
                              {formatCurrency(order.totalAmount, userCurrency)}
                            </td>
                            <td className="px-3 py-2 whitespace-nowrap">
                              <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold ${statusClass}`}>
                                {translateOrderStatus(order.orderStatus)}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ),
        };
      case 'products':
        return {
          action: (
            <Link
              href="/products/list"
              className="inline-flex items-center gap-1 text-xs font-semibold text-[#0a61d7] hover:text-[#084ba6]"
            >
              {widgetText('products', 'action')}
              <ArrowRight className="w-4 h-4" />
            </Link>
          ),
          content: (
            <div className="space-y-4">
              {topProductsWithDetails.length === 0 ? (
                <div className="flex h-60 flex-col items-center justify-center rounded-lg">
                  <Package className="mb-3 h-10 w-10 text-gray-300" />
                  <p className="text-sm font-semibold text-gray-600">
                    {widgetText('products', 'emptyTitle')}
                  </p>
                  <p className="mt-1 text-xs text-gray-500">
                    {widgetText('products', 'emptyHint')}
                  </p>
                </div>
              ) : (
                <ul className="space-y-3">
                  {topProductsWithDetails.map((product) => {
                    const progress =
                      maxTopProductOrderVolume > 0
                        ? Math.round((product.orderVolume / maxTopProductOrderVolume) * 100)
                        : 0;
                    return (
                      <li
                        key={product.productId}
                        className="flex flex-col gap-3 rounded-lg border border-[#e6e6e6] bg-white p-4"
                      >
                        <div className="flex min-w-0 flex-wrap items-center gap-3">
                          <div className="w-6 shrink-0 text-xs font-semibold text-gray-500">
                            {product.rank}.
                          </div>
                          <div className="flex min-w-0 items-center gap-3">
                            {product.image ? (
                              <Image
                                src={product.image}
                                alt={product.productName}
                                width={48}
                                height={48}
                                className="h-12 w-12 shrink-0 rounded-lg border border-[#e6e6e6] object-cover"
                              />
                            ) : (
                              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border border-[#e6e6e6] bg-[#f7faff]">
                                <Package className="h-5 w-5 text-[#0a61d7]" />
                              </div>
                            )}
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold text-black">
                                {product.productName}
                              </p>
                              <p className="text-xs text-gray-500">
                                {product.productCategory}
                              </p>
                            </div>
                          </div>
                          <div className="ml-auto flex flex-wrap items-center gap-4 text-sm @sm:gap-6">
                            <div className="text-right">
                              <p className="text-xs text-gray-500">{widgetText('products', 'orderVolume')}</p>
                              <p className="text-sm font-semibold text-black">
                                {formatCurrency(product.orderVolume, userCurrency)}
                              </p>
                            </div>
                            <div className="text-right">
                              <p className="text-xs text-gray-500">{tCommon('pieces')}</p>
                              <p className="text-sm font-semibold text-black">
                                {product.unitsSold.toLocaleString()}
                              </p>
                            </div>
                            <div className="text-right">
                              <p className="text-xs text-gray-500">{widgetText('products', 'margin')}</p>
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
          action: (
            <Link
              href="/clients/buyers"
              className="inline-flex items-center gap-1 text-xs font-semibold text-[#0a61d7] hover:text-[#084ba6]"
            >
              {widgetText('buyers', 'action')}
              <ArrowRight className="w-4 h-4" />
            </Link>
          ),
          content: (
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-3 @sm:grid-cols-2 @lg:grid-cols-3">
                <div className="rounded-lg border border-[#e6e6e6] bg-white p-4">
                  <p className="text-xs text-gray-500">{widgetText('buyers', 'totalBuyers')}</p>
                  <p className="mt-1 text-xl font-semibold text-black">
                    {buyerInsights.totalBuyers.toLocaleString()}
                  </p>
                  <p className="mt-1 text-[11px] uppercase tracking-wide text-gray-500">
                    {tCommon('active')}:{' '}
                    <span className="font-semibold text-black">
                      {buyerInsights.activeBuyers.toLocaleString()}
                    </span>
                  </p>
                </div>
                <div className="rounded-lg border border-[#e6e6e6] bg-white p-4">
                  <p className="text-xs text-gray-500">{widgetText('buyers', 'avgOrderValue')}</p>
                  <p className="mt-1 text-xl font-semibold text-black">
                    {formatCurrency(safeSalesMetrics.avgOrderValue, userCurrency)}
                  </p>
                  <p className="mt-1 text-[11px] uppercase tracking-wide text-gray-500">
                    {t('widgets.buyers.acrossOrders', {
                      count: safeSalesMetrics.totalOrders.toLocaleString(),
                    })}
                  </p>
                </div>
                <div className="rounded-lg border border-[#e6e6e6] bg-white p-4">
                  <p className="text-xs text-gray-500">{widgetText('buyers', 'piecesSold')}</p>
                  <p className="mt-1 text-xl font-semibold text-black">
                    {safeSalesMetrics.totalPiecesSold.toLocaleString()}
                  </p>
                  <p className="mt-1 text-[11px] uppercase tracking-wide text-gray-500">
                    {tCommon('units')} {safeSalesMetrics.totalUnitsSold.toLocaleString()}
                  </p>
                </div>
              </div>
              {buyerInsights.topBuyers.length === 0 ? (
                <div className="flex h-40 flex-col items-center justify-center rounded-lg">
                  <Users className="mb-3 h-8 w-8 text-gray-300" />
                  <p className="text-sm font-semibold text-gray-600">
                    {widgetText('buyers', 'emptyTitle')}
                  </p>
                  <p className="mt-1 text-xs text-gray-500">
                    {widgetText('buyers', 'emptyHint')}
                  </p>
                </div>
              ) : (
                <div>
                  <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500">
                    {widgetText('buyers', 'topBuyers')}
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
                              {translateRecordStatus(buyer.status)}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-6 text-sm">
                          <div className="text-right">
                            <p className="text-xs text-gray-500">{tCommon('orders')}</p>
                            <p className="font-semibold text-black">
                              {buyer.orders.toLocaleString()}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="text-xs text-gray-500">{tCommon('revenue')}</p>
                            <p className="font-semibold text-black">
                              {formatCurrency(buyer.revenue, userCurrency)}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="text-xs text-gray-500">{tCommon('pieces')}</p>
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
          action: (
            <Link
              href="/clients/suppliers"
              className="inline-flex items-center gap-1 text-xs font-semibold text-[#0a61d7] hover:text-[#084ba6]"
            >
              {widgetText('suppliers', 'action')}
              <ArrowRight className="w-4 h-4" />
            </Link>
          ),
          content: (
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-3 @sm:grid-cols-2 @lg:grid-cols-3">
                <div className="rounded-lg border border-[#e6e6e6] bg-white p-4">
                  <p className="text-xs text-gray-500">{widgetText('suppliers', 'totalSuppliers')}</p>
                  <p className="mt-1 text-xl font-semibold text-black">
                    {supplierInsights.totalSuppliers.toLocaleString()}
                  </p>
                  <p className="mt-1 text-[11px] uppercase tracking-wide text-gray-500">
                    {tCommon('active')}:{' '}
                    <span className="font-semibold text-black">
                      {supplierInsights.activeSuppliers.toLocaleString()}
                    </span>
                  </p>
                </div>
                <div className="rounded-lg border border-[#e6e6e6] bg-white p-4">
                  <p className="text-xs text-gray-500">{widgetText('suppliers', 'onTimeDelivery')}</p>
                  <p className="mt-1 text-xl font-semibold text-black">
                    {supplierInsights.onTimeRate}%
                  </p>
                  <p className="mt-1 text-[11px] uppercase tracking-wide text-emerald-600">
                    {widgetText('suppliers', 'goal')}
                  </p>
                </div>
                <div className="rounded-lg border border-[#e6e6e6] bg-white p-4">
                  <p className="text-xs text-gray-500">{widgetText('suppliers', 'topSupplierValue')}</p>
                  <p className="mt-1 text-xl font-semibold text-black">
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
                    {widgetText('suppliers', 'emptyTitle')}
                  </p>
                  <p className="mt-1 text-xs text-gray-500">
                    {widgetText('suppliers', 'emptyHint')}
                  </p>
                </div>
              ) : (
                <div>
                  <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500">
                    {widgetText('suppliers', 'prioritySuppliers')}
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
                              {translateRecordStatus(supplier.status)}
                            </p>
                          </div>
                        </div>
                        <div className="text-right text-sm">
                          <p className="text-xs text-gray-500">{widgetText('suppliers', 'fulfillmentValue')}</p>
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
      case 'salesJobs': {
        const jobTypeLabel = (jobType: string) =>
          tJobs.has(`types.${jobType}`) ? tJobs(`types.${jobType}` as 'types.take_order') : jobType;
        const jobStatusLabel = (status: string) => {
          const key = salesJobStatusKey(status);
          return tJobs.has(`status.${key}`) ? tJobs(`status.${key}` as 'status.pending') : key;
        };
        const countCards = [
          { key: 'pending', label: widgetText('salesJobs', 'pending'), hint: widgetText('salesJobs', 'pendingHint'), value: salesJobCounts.pending, valueClass: 'text-yellow-700' },
          { key: 'dispatched', label: widgetText('salesJobs', 'dispatched'), hint: widgetText('salesJobs', 'dispatchedHint'), value: salesJobCounts.dispatched, valueClass: 'text-purple-700' },
          { key: 'in_progress', label: widgetText('salesJobs', 'inProgress'), hint: widgetText('salesJobs', 'inProgressHint'), value: salesJobCounts.in_progress, valueClass: 'text-[#0a61d7]' },
          { key: 'completed', label: widgetText('salesJobs', 'completed'), hint: widgetText('salesJobs', 'completedHint'), value: salesJobCounts.completed, valueClass: 'text-emerald-600' },
        ] as const;
        return {
          action: (
            <Link
              href="/sales/jobs"
              className="inline-flex items-center gap-1 text-xs font-semibold text-[#0a61d7] hover:text-[#084ba6]"
            >
              {widgetText('salesJobs', 'action')}
              <ArrowRight className="w-4 h-4" />
            </Link>
          ),
          content: (
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-3 @sm:grid-cols-2 @xl:grid-cols-4">
                {countCards.map((card) => (
                  <div key={card.key} className="rounded-lg border border-[#e6e6e6] bg-white p-4">
                    <p className="text-xs text-gray-500">{card.label}</p>
                    <p className={`mt-1 text-2xl font-semibold ${card.valueClass}`}>{card.value.toLocaleString()}</p>
                    <p className="mt-1 text-[11px] uppercase tracking-wide text-gray-500">{card.hint}</p>
                  </div>
                ))}
              </div>
              {recentSalesJobs.length === 0 ? (
                <div className="flex h-40 flex-col items-center justify-center rounded-lg">
                  <Briefcase className="mb-3 h-8 w-8 text-gray-300" />
                  <p className="text-sm font-semibold text-gray-600">{widgetText('salesJobs', 'emptyTitle')}</p>
                  <p className="mt-1 text-xs text-gray-500">{widgetText('salesJobs', 'emptyHint')}</p>
                </div>
              ) : (
                <div>
                  <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500">
                    {widgetText('salesJobs', 'recentJobs')}
                  </h3>
                  <ul className="space-y-3">
                    {recentSalesJobs.map((job) => {
                      const statusKey = salesJobStatusKey(job.status);
                      return (
                        <li key={job.id} className="flex items-center justify-between gap-3 rounded-lg border border-[#e6e6e6] bg-white px-4 py-3">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-black">{job.clientName || job.agentName}</p>
                            <p className="truncate text-xs text-gray-500">
                              {jobTypeLabel(job.jobType)}
                              {job.agentName ? ` · ${job.agentName}` : ''}
                            </p>
                          </div>
                          <span className={`inline-flex shrink-0 rounded-full px-2 py-1 text-xs font-semibold ${JOB_STATUS_BADGE[statusKey] || JOB_STATUS_BADGE.skipped}`}>
                            {jobStatusLabel(job.status)}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
            </div>
          ),
        };
      }
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
          action: (
            <Link
              href="/products/list"
              className="inline-flex items-center gap-1 text-xs font-semibold text-[#0a61d7] hover:text-[#084ba6]"
            >
              {widgetText('inventory', 'manageProducts')}
              <ArrowRight className="w-4 h-4" />
            </Link>
          ),
          content: (
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-3 @sm:grid-cols-2 @lg:grid-cols-3">
                <div className="rounded-lg border border-[#e6e6e6] bg-white p-4">
                  <p className="text-xs text-gray-500">{widgetText('inventory', 'totalProducts')}</p>
                  <p className="mt-1 text-2xl font-semibold text-black">
                    {totalProducts.toLocaleString()}
                  </p>
                  <p className="mt-1 text-[11px] uppercase tracking-wide text-gray-500">
                    {t('widgets.inventory.activePieces', {
                      active: activeProductCount.toLocaleString(),
                      pieces: totalPieces.toLocaleString(),
                    })}
                  </p>
                </div>
                <div className="rounded-lg border border-[#e6e6e6] bg-white p-4">
                  <p className="text-xs text-gray-500">{widgetText('inventory', 'lowStock')}</p>
                  <p className="mt-1 text-2xl font-semibold text-black">
                    {lowStockItems.length.toLocaleString()}
                  </p>
                  <p className="mt-1 text-[11px] uppercase tracking-wide text-red-600">
                    {widgetText('inventory', 'critical')}: {criticalLowStockItems.length.toLocaleString()}
                  </p>
                </div>
                <div className="rounded-lg border border-[#e6e6e6] bg-white p-4">
                  <p className="text-xs text-gray-500">{widgetText('inventory', 'avgStockLevel')}</p>
                  <p className="mt-1 text-2xl font-semibold text-black">
                    {Math.round(averageStock).toLocaleString()}
                  </p>
                  <p className="mt-1 text-[11px] uppercase tracking-wide text-gray-500">
                    {widgetText('inventory', 'acrossAllProducts')}
                  </p>
                </div>
              </div>
              {lowStockPreview.length === 0 ? (
                <div className="flex h-40 flex-col items-center justify-center rounded-lg">
                  <Layers className="mb-3 h-8 w-8 text-gray-300" />
                  <p className="text-sm font-semibold text-gray-500">{widgetText('inventory', 'noLowStockTitle')}</p>
                  <p className="mt-1 text-xs text-gray-400">{widgetText('inventory', 'noLowStockHint')}</p>
                </div>
              ) : (
                <div className="space-y-3">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                    {widgetText('inventory', 'topLowStock')}
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
                            href={`/products/list/catalog/${lowStockProduct.productId}`}
                            className="text-xs font-semibold text-[#0a61d7] hover:text-[#084ba6]"
                          >
                            {widgetText('inventory', 'viewProduct')}
                          </Link>
                        </div>
                        <div className="flex flex-wrap gap-3 text-xs text-gray-500">
                          <span>
                            {widgetText('inventory', 'stock')}:{' '}
                            <span className="font-semibold text-black">{totalStock.toLocaleString()}</span>
                          </span>
                          <span>
                            {widgetText('inventory', 'threshold')}:{' '}
                            <span className="font-semibold text-black">{(lowStockThreshold || 0).toLocaleString()}</span>
                          </span>
                          <span>
                            {widgetText('inventory', 'statusLabel')}:{' '}
                            <span className="font-semibold text-red-600">{widgetText('inventory', 'lowStockLabel')}</span>
                          </span>
                        </div>
                      </li>
                    ))}
                  </ul>
                  {lowStockItems.length > lowStockPreview.length ? (
                    <p className="text-xs text-gray-500">
                      {t('widgets.inventory.moreBelowThreshold', {
                        count: lowStockItems.length - lowStockPreview.length,
                      })}
                    </p>
                  ) : null}
                </div>
              )}
            </div>
          ),
        };
      }
      case 'sales': {
        const summary = salesSummary ?? { teams: [], totalAgents: 0, activeAgents: 0 };
        const hasTeams = summary.teams.length > 0 || summary.totalAgents > 0;
        return {
          action: (
            <Link
              href="/sales"
              className="inline-flex items-center gap-1 text-xs font-semibold text-[#0a61d7] hover:text-[#084ba6]"
            >
              {widgetText('sales', 'action')}
              <ArrowRight className="w-4 h-4" />
            </Link>
          ),
          content: (
            <div className="rounded-lg border border-[#e6e6e6] bg-white p-4">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-black">{widgetText('sales', 'teamsAndPeople')}</h3>
                <Users className="h-4 w-4 text-gray-400" />
              </div>
              {hasTeams ? (
                <>
                  <div className="grid grid-cols-1 gap-2 @xs:grid-cols-3">
                    <div className="rounded bg-gray-50 p-2 text-center">
                      <p className="text-lg font-semibold text-black">{summary.teams.length}</p>
                      <p className="text-[10px] uppercase text-gray-500">{widgetText('sales', 'teams')}</p>
                    </div>
                    <div className="rounded bg-gray-50 p-2 text-center">
                      <p className="text-lg font-semibold text-black">{summary.totalAgents}</p>
                      <p className="text-[10px] uppercase text-gray-500">{widgetText('sales', 'agents')}</p>
                    </div>
                    <div className="rounded bg-emerald-50 p-2 text-center">
                      <p className="text-lg font-semibold text-emerald-700">{summary.activeAgents}</p>
                      <p className="text-[10px] uppercase text-emerald-600">{tCommon('active')}</p>
                    </div>
                  </div>
                  {summary.teams.length > 0 && (
                    <div className="mt-3 border-t border-gray-100 pt-3">
                      <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-gray-500">
                        {widgetText('sales', 'byTeam')}
                      </p>
                      <ul className="space-y-1.5">
                        {summary.teams.slice(0, 4).map((team) => (
                          <li
                            key={team.id}
                            className="flex items-center justify-between text-sm"
                          >
                            <span className="truncate text-gray-800">{team.name}</span>
                            <span className="ml-2 shrink-0 rounded bg-[#f0f7ff] px-2 py-0.5 text-xs font-medium text-[#0a61d7]">
                              {team.memberCount}{' '}
                              {team.memberCount === 1
                                ? widgetText('sales', 'member')
                                : widgetText('sales', 'members')}
                            </span>
                          </li>
                        ))}
                        {summary.teams.length > 4 && (
                          <li className="text-xs text-gray-500">
                            {summary.teams.length - 4 === 1
                              ? t('widgets.sales.moreTeams', { count: summary.teams.length - 4 })
                              : t('widgets.sales.moreTeamsPlural', { count: summary.teams.length - 4 })}
                          </li>
                        )}
                      </ul>
                    </div>
                  )}
                </>
              ) : (
                <div className="flex flex-col items-center justify-center py-6 text-center">
                  <Users className="mb-2 h-8 w-8 text-gray-300" />
                  <p className="text-sm font-medium text-gray-600">{widgetText('sales', 'noTeamsTitle')}</p>
                  <p className="mt-1 text-xs text-gray-500">{widgetText('sales', 'noTeamsHint')}</p>
                </div>
              )}
            </div>
          ),
        };
      }
      default:
        return {
          content: (
            <div className="flex h-48 flex-col items-center justify-center rounded-lg">
              <Settings2 className="mb-3 h-10 w-10 text-gray-300" />
              <p className="text-sm font-semibold text-gray-600">
                {t('widgetNotFound')}
              </p>
              <p className="mt-1 text-xs text-gray-500">
                {t('widgetNotFoundHint')}
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
          <div className="col-span-1 @4xl/main:col-span-2 flex min-h-[320px] flex-col items-center justify-center rounded-lg bg-white text-center">
            <Settings2 className="mb-3 h-8 w-8 text-[#0a61d7]" />
            <p className="text-sm font-semibold text-black">
              {t('noWidgetsSelected')}
            </p>
            <p className="text-xs text-gray-500">
              {t('noWidgetsSelectedHint')}
            </p>
          </div>
        )
      : activeWidgets.map((id) => {
          const meta = getWidgetMeta(id);
          if (!meta) {
            return null;
          }
          const { content, action } = renderWidget(id);
          const Icon = meta.icon;
          return (
            <div
              key={id}
              data-widget-id={id}
              draggable
              onDragStart={(event) => handleDragStart(event, id)}
              onDragEnter={() => handleDragEnter(id)}
              onDragLeave={() => handleDragLeave(id)}
              onDragEnd={handleDragEnd}
              onDrop={(event) => handleDrop(event, id)}
              onDragOver={(event) => event.preventDefault()}
              aria-grabbed={draggingWidget === id}
              className={`${UNIFORM_WIDGET_LAYOUT} min-w-0 rounded-lg transition-all ${
                id === 'conversion' ? '@4xl/main:col-span-2 min-h-[420px]' : ''
              } ${
                hoverWidget === id ? 'ring-2 ring-[#0a61d7]/60' : ''
              } ${draggingWidget === id ? 'opacity-75' : 'opacity-100'}`}
            >
              <article className="@container flex h-full min-w-0 flex-col overflow-hidden rounded-lg border border-[#e6e6e6] bg-white">
                <div className="flex min-w-0 items-start justify-between gap-3 border-b border-[#e6e6e6] px-4 py-4">
                  <div className="flex min-w-0 items-start gap-3">
                    <button
                      type="button"
                      className="mt-0.5 shrink-0 text-gray-400 hover:text-[#0a61d7] focus:outline-none"
                      aria-label={tCommon('dragToReorder')}
                    >
                      <GripVertical className="h-4 w-4" />
                    </button>
                    <div className="flex min-w-0 items-start gap-2">
                      <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-[#f7faff] text-[#0a61d7]">
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="min-w-0">
                        <h2 className="text-sm font-semibold text-black">
                          {widgetName(id)}
                        </h2>
                      </div>
                    </div>
                  </div>
                  {action ? <div className="shrink-0">{action}</div> : null}
                </div>
                <div className="min-w-0 overflow-hidden p-4">{content}</div>
              </article>
            </div>
          );
        });

  if (loading || !hasHydratedLayout) {
    return <SkeletonHomePage />;
  }

  if (error) {
    return (
      <div className="flex min-h-full w-full min-w-0 flex-col bg-gradient-to-b from-gray-50 to-white p-6">
        <div className="mx-auto max-w-3xl">
          <div className="rounded-lg border border-rose-200 bg-rose-50 p-6">
            <h2 className="text-lg font-semibold text-rose-700">
              {t('loadErrorTitle')}
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
                setSalesSummary(null);
                setSalesJobs([]);
              }}
            >
              {tCommon('retry')}
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
          className="bg-white"
        >
          <div className="flex items-start justify-between p-4 -mb-2">
            <div>
              <h3 className="text-md font-semibold text-black">{t('widgetLibrary')}</h3>
            </div>
            <button
              type="button"
              onClick={() => setIsWidgetManagerOpen(false)}
              className="rounded-full border border-gray-200 p-1 text-gray-500 transition hover:border-gray-300 hover:text-black"
              aria-label={tCommon('closeWidgetLibrary')}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="overflow-x-auto p-4">
            <div className="flex min-w-full items-stretch gap-3">
              {WIDGET_LIBRARY.map((widget) => {
                const Icon = widget.icon;
                const isActive = widgetOrder.includes(widget.id);
                return (
                  <div
                    key={widget.id}
                    draggable
                    onDragStart={(event) => handleLibraryDragStart(event, widget.id)}
                    onDragEnd={handleDragEnd}
                    className={`group flex min-w-[22rem] max-w-[22rem] cursor-grab flex-col justify-between rounded-lg border border-[#e6e6e6] bg-white p-4 transition hover:border-[#0a61d7] active:cursor-grabbing ${
                      isActive ? 'opacity-95' : ''
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#f7faff] text-[#0a61d7]">
                        <Icon className="h-5 w-5" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-black">
                          {widgetName(widget.id)}
                        </p>
                        <p className="text-xs text-gray-500">
                          {widgetDescription(widget.id)}
                        </p>
                      </div>
                    </div>
                    <div className="mt-4 flex items-center justify-between">
                      <span className="text-[11px] uppercase tracking-wide text-gray-400">
                        {isActive ? t('dragToReorder') : t('dragToAdd')}
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
                        {isActive ? tCommon('remove') : tCommon('add')}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      <div className="flex min-h-full w-full min-w-0 flex-col bg-gradient-to-b from-gray-50 to-white p-4">
        <div className="flex min-w-0 w-full flex-col gap-3">
          <header className="flex flex-wrap items-center justify-between gap-4 mb-2">
            <div>
              <h1 className="text-2xl font-bold text-black mb-1">{t('title')}</h1>
              <p className="text-sm text-gray-600">{t('subtitle')}</p>
            </div>
            <button
              type="button"
              onClick={() => setIsWidgetManagerOpen((prev) => !prev)}
              className="inline-flex items-center gap-2 rounded-lg border border-[#e6e6e6] bg-white px-3 py-2 text-xs font-semibold text-black transition hover:border-[#0a61d7]"
            >
              <Settings2 className="h-4 w-4 text-[#0a61d7]" />
              {t('dragWidgets')}
            </button>
          </header>

          {statCards.length > 0 && (
            <section className="grid grid-cols-1 gap-3 @3xl/main:grid-cols-2 @5xl/main:grid-cols-4">
              {statCards.map((card) => (
                <AnalyticsMetricCard
                  key={card.id}
                  title={card.title}
                  value={card.value}
                  change={card.change}
                  previousValue={card.previousValue}
                  icon={card.icon}
                  color={card.color}
                  comparisonLabel={tCommon('vsLastMonth')}
                  naLabel={tCommon('notAvailable')}
                />
              ))}
            </section>
          )}

          <section
            className="grid grid-cols-1 gap-3 @4xl/main:grid-cols-2"
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
