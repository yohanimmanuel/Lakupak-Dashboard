import { prisma } from '@/app/api/graphql/modules/common/prisma';

const SAMPLE = 8;
const MAX_CONTEXT_CHARS = 28_000;

function truncateContext(payload: unknown): string {
  const json = JSON.stringify(payload, null, 0);
  if (json.length <= MAX_CONTEXT_CHARS) return json;
  return `${json.slice(0, MAX_CONTEXT_CHARS)}\n…[truncated]`;
}

/**
 * Buyer-facing CS snapshot for Laku AI.
 * Includes published products and public ops. Does NOT include specific order /
 * return / cancellation records (distributor-internal). Order help uses vocab +
 * payment term days only until a buyer identifies their own order at chat time.
 */
export async function buildDistributorAgentContext(userId: number): Promise<string> {
  const publishedProductWhere = {
    userId,
    status: 'Published',
    marketplaceStatus: 'Published',
  };

  const [user, productCount, buyerCount, recentProducts] = await Promise.all([
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
  ]);

  const company = user?.company;
  const context = {
    purpose: 'buyer_facing_customer_service',
    allowedTopics: [
      'published_products_catalog_availability_moq_prices',
      'product_assurance_halal_bpom_original_return_window',
      'order_help_after_buyer_provides_order_id',
      'payment_method_type_and_payment_term_days',
      'delivery_method_prefs_days_slots_lead_times',
      'return_and_cancel_policy_guidance',
      'distributor_public_ops_and_contact',
    ],
    forbiddenTopics: [
      'listing_or_summarizing_account_orders_unsolicited',
      'order_ids_store_names_amounts_without_buyer_request',
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
        'Never list orders, order IDs, store names, or payment status in welcome or unsolicited messages.',
        'Only discuss a specific order after the buyer provides their order ID (and store name if needed).',
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
    },
  };

  return truncateContext(context);
}
