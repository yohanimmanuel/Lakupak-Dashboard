import { prisma } from '@/app/api/graphql/modules/common/prisma';

const SAMPLE = 8;
const MAX_CONTEXT_CHARS = 28_000;

function money(value: unknown): number | null {
  if (value == null) return null;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'object' && value !== null && 'toNumber' in value) {
    try {
      return Number((value as { toNumber: () => number }).toNumber());
    } catch {
      /* fall through */
    }
  }
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function iso(value: Date | string | null | undefined): string | null {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

function truncateContext(payload: unknown): string {
  const json = JSON.stringify(payload, null, 0);
  if (json.length <= MAX_CONTEXT_CHARS) return json;
  return `${json.slice(0, MAX_CONTEXT_CHARS)}\n…[truncated]`;
}

/**
 * Buyer-facing CS snapshot for Laku AI.
 * Safe topics only: published products (incl. MOQ/assurance), orders (status,
 * payment method type, tracking/ETA, prefs), returns/cancels, ops delivery
 * settings, payment term days. No offers, campaigns, bank accounts, analytics.
 */
export async function buildDistributorAgentContext(userId: number): Promise<string> {
  const publishedProductWhere = {
    userId,
    status: 'Published',
    marketplaceStatus: 'Published',
  };

  const [
    user,
    productCount,
    orderCount,
    buyerCount,
    recentProducts,
    recentOrders,
    recentReturns,
    recentCancellations,
  ] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        currency: true,
        region: true,
        language: true,
        company: {
          select: {
            name: true,
            industryType: true,
            businessDescription: true,
            businessAddress: true,
            businessPhone: true,
            businessEmail: true,
            pickupAddress: true,
            shippingPreferences: true,
            deliveryTimeSlots: true,
            preferredDeliveryDays: true,
            defaultDeliveryLeadTimeMinDays: true,
            defaultDeliveryLeadTimeMaxDays: true,
            buyerPaymentTermDays: true,
          },
        },
      },
    }),
    prisma.product.count({ where: publishedProductWhere }),
    prisma.order.count({ where: { userId } }),
    prisma.buyer.count({ where: { userId } }),
    prisma.product.findMany({
      where: publishedProductWhere,
      orderBy: { updatedAt: 'desc' },
      take: SAMPLE,
      select: {
        productId: true,
        name: true,
        sku: true,
        brand: true,
        description: true,
        productType: true,
        productCategory: true,
        merchandisingCategorySlug: true,
        catalogName: true,
        marketplaceStatus: true,
        status: true,
        bpomApproved: true,
        halalCertified: true,
        originalProduct: true,
        returnPolicyDays: true,
        variantOptions: {
          where: { isActive: true },
          take: 6,
          select: {
            variantName: true,
            sku: true,
            moq: true,
            stockQuantity: true,
            stockStatus: true,
            sellingPrice: true,
          },
        },
      },
    }),
    prisma.order.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
      take: SAMPLE,
      select: {
        orderId: true,
        orderStatus: true,
        paymentStatus: true,
        paymentTerms: true,
        storeName: true,
        totalAmount: true,
        shippingFee: true,
        deliveryMethod: true,
        deliveryOption: true,
        preferredDeliveryDate: true,
        preferredDeliveryTime: true,
        preferredPickupDate: true,
        preferredPickupTime: true,
        trackingNumber: true,
        estimatedDeliveryDate: true,
        estimatedDeliveryMinDays: true,
        estimatedDeliveryMaxDays: true,
        returnStatus: true,
        returnReason: true,
        orderDate: true,
        deliveredAt: true,
        receivedAt: true,
        cancelledAt: true,
      },
    }),
    prisma.orderReturnRequest.findMany({
      where: { order: { userId } },
      orderBy: { updatedAt: 'desc' },
      take: SAMPLE,
      select: {
        id: true,
        status: true,
        reason: true,
        reasonDetail: true,
        createdAt: true,
        updatedAt: true,
        order: {
          select: {
            orderId: true,
            storeName: true,
            orderStatus: true,
            returnStatus: true,
          },
        },
      },
    }),
    prisma.orderCancellation.findMany({
      where: { order: { userId } },
      orderBy: { cancelledAt: 'desc' },
      take: SAMPLE,
      select: {
        id: true,
        reason: true,
        reasonDetail: true,
        cancelledAt: true,
        order: {
          select: {
            orderId: true,
            storeName: true,
            orderStatus: true,
          },
        },
      },
    }),
  ]);

  const company = user?.company;
  const context = {
    purpose: 'buyer_facing_customer_service',
    allowedTopics: [
      'published_products_catalog_availability_moq_prices',
      'product_assurance_halal_bpom_original_return_window',
      'order_status_pipeline_and_updates',
      'payment_status_and_payment_method_type',
      'payment_term_days_only',
      'delivery_method_prefs_days_slots_lead_times',
      'order_tracking_and_eta',
      'return_requests_and_status',
      'order_cancellations',
      'distributor_public_ops_and_contact',
    ],
    forbiddenTopics: [
      'offers_and_promotions_internal',
      'campaigns_and_marketing_metrics',
      'bank_account_or_payment_credentials',
      'revenue_analytics',
      'compliance_internal_status',
      'fleet_driver_internal_ops',
      'supplier_or_sales_agent_internal_data',
      'unpublished_or_draft_products',
    ],
    referenceVocab: {
      orderStatuses: [
        'Pending',
        'Confirmed',
        'Packed',
        'Shipped',
        'Delivered',
        'Received',
        'Failed',
        'Cancelled',
        'Returned',
      ],
      paymentStatuses: ['Unpaid', 'Paid'],
      paymentMethodTypes: ['Bank Transfer', 'COD'],
      deliveryMethods: [
        'Self Pickup',
        'Seller/Distributor Delivery',
        'Buyer-arranged Courier',
      ],
      returnRequestStatuses: ['Pending', 'Accepted', 'Rejected'],
      returnReasons: [
        'wrong_item',
        'defective',
        'not_as_described',
        'changed_mind',
        'late_delivery',
        'other',
      ],
      cancelReasons: [
        'changed_mind',
        'found_cheaper',
        'wrong_item',
        'delivery_issues',
        'payment_issues',
        'seller_issues',
        'other',
      ],
      notes: [
        'Returns are typically requested after Delivered or Received.',
        'Payment method type (Bank Transfer / COD) is buyer-safe; never share bank account numbers.',
        'Shipping fee may be agreed offline and is not always auto-charged at checkout.',
        'Delivery days and time slots are distributor-configurable (not always weekdays-only).',
      ],
    },
    account: {
      userId,
      currency: user?.currency ?? null,
      region: user?.region ?? null,
      language: user?.language ?? null,
    },
    distributorPublicOps: company
      ? {
          companyName: company.name,
          industryType: company.industryType,
          businessDescription: company.businessDescription,
          businessAddress: company.businessAddress,
          businessPhone: company.businessPhone,
          businessEmail: company.businessEmail,
          pickupAddress: company.pickupAddress,
          shippingPreferences: company.shippingPreferences,
          deliveryTimeSlots: company.deliveryTimeSlots,
          preferredDeliveryDays: company.preferredDeliveryDays,
          deliveryLeadTimeMinDays: company.defaultDeliveryLeadTimeMinDays,
          deliveryLeadTimeMaxDays: company.defaultDeliveryLeadTimeMaxDays,
          paymentTermDays: company.buyerPaymentTermDays,
        }
      : null,
    totals: {
      buyers: buyerCount,
      publishedProducts: productCount,
      orders: orderCount,
    },
    samples: {
      products: recentProducts.map((p) => ({
        productId: p.productId,
        name: p.name,
        sku: p.sku,
        brand: p.brand,
        description: p.description,
        productType: p.productType,
        productCategory: p.productCategory,
        merchandisingCategorySlug: p.merchandisingCategorySlug,
        catalogName: p.catalogName,
        assurance: {
          bpomApproved: p.bpomApproved ?? false,
          halalCertified: p.halalCertified ?? false,
          originalProduct: p.originalProduct ?? true,
          returnPolicyDays: p.returnPolicyDays ?? null,
        },
        variants: p.variantOptions.map((v) => ({
          variantName: v.variantName,
          sku: v.sku,
          moq: v.moq,
          stockQuantity: v.stockQuantity,
          stockStatus: v.stockStatus,
          available: (v.stockQuantity ?? 0) > 0,
          sellingPrice: String(v.sellingPrice ?? ''),
        })),
      })),
      orders: recentOrders.map((o) => ({
        orderId: o.orderId,
        orderStatus: o.orderStatus,
        paymentStatus: o.paymentStatus,
        paymentMethodType: o.paymentTerms,
        storeName: o.storeName,
        totalAmount: money(o.totalAmount),
        shippingFee: money(o.shippingFee),
        deliveryMethod: o.deliveryMethod,
        deliveryOption: o.deliveryOption,
        preferredDeliveryDate: iso(o.preferredDeliveryDate),
        preferredDeliveryTime: o.preferredDeliveryTime,
        preferredPickupDate: iso(o.preferredPickupDate),
        preferredPickupTime: o.preferredPickupTime,
        trackingNumber: o.trackingNumber,
        estimatedDeliveryDate: iso(o.estimatedDeliveryDate),
        estimatedDeliveryMinDays: o.estimatedDeliveryMinDays,
        estimatedDeliveryMaxDays: o.estimatedDeliveryMaxDays,
        returnStatus: o.returnStatus,
        returnReason: o.returnReason,
        orderDate: iso(o.orderDate),
        deliveredAt: iso(o.deliveredAt),
        receivedAt: iso(o.receivedAt),
        cancelledAt: iso(o.cancelledAt),
      })),
      returns: recentReturns.map((r) => ({
        id: r.id,
        status: r.status,
        reason: r.reason,
        reasonDetail: r.reasonDetail,
        createdAt: iso(r.createdAt),
        updatedAt: iso(r.updatedAt),
        orderId: r.order?.orderId ?? null,
        storeName: r.order?.storeName ?? null,
        orderStatus: r.order?.orderStatus ?? null,
        returnStatus: r.order?.returnStatus ?? null,
      })),
      cancellations: recentCancellations.map((c) => ({
        id: c.id,
        reason: c.reason,
        reasonDetail: c.reasonDetail,
        cancelledAt: iso(c.cancelledAt),
        orderId: c.order?.orderId ?? null,
        storeName: c.order?.storeName ?? null,
        orderStatus: c.order?.orderStatus ?? null,
      })),
    },
  };

  return truncateContext(context);
}
