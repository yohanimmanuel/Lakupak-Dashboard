import { prisma } from '@/app/api/graphql/modules/common/prisma';
import { toWhatsAppCloudRecipient } from '@/lib/whatsapp/cloudApi';

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
  const marketplaceUrl = (
    process.env.NEXT_PUBLIC_MARKETPLACE_URL ||
    process.env.MARKETPLACE_PUBLIC_URL ||
    'https://laku.id'
  ).replace(/\/$/, '');
  const context = {
    purpose: 'buyer_facing_customer_service',
    marketplace: {
      name: 'Lakupak',
      url: marketplaceUrl,
      checkoutRule:
        'All buying, checkout, payment, and order placement must happen on the marketplace URL. WhatsApp is CS only.',
    },
    allowedTopics: [
      'published_products_catalog_availability_moq_prices',
      'product_assurance_halal_bpom_original_return_window',
      'redirect_buyers_to_lakupak_marketplace_for_all_purchases',
      'order_help_after_buyer_provides_order_id',
      'payment_method_type_and_payment_term_days',
      'delivery_method_prefs_days_slots_lead_times',
      'return_and_cancel_policy_guidance',
      'distributor_public_ops_and_contact',
    ],
    forbiddenTopics: [
      'taking_orders_or_payment_on_whatsapp',
      'offline_or_direct_purchase_outside_marketplace',
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
        'All purchases and checkout must go through the Lakupak marketplace, not WhatsApp.',
        'Never list orders, order IDs, store names, or payment status in welcome or unsolicited messages.',
        'Only discuss a specific order after the buyer provides their order ID (and store name if needed).',
        'When the buyer asks about their order, you may state the products bought, quantities, and prices from the order line items.',
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

const BUYER_ORDER_ID_RE = /\b(?:LKO|LK|ORD)[-_]?\d{6,}\b/gi;

function moneyString(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value === 'object' && value !== null && 'toString' in value) {
    const s = String((value as { toString: () => string }).toString()).trim();
    return s || null;
  }
  const s = String(value).trim();
  return s || null;
}

function extractBuyerOrderIds(...texts: Array<string | null | undefined>): string[] {
  const found = new Set<string>();
  for (const text of texts) {
    if (!text) continue;
    for (const match of text.matchAll(BUYER_ORDER_ID_RE)) {
      const id = String(match[0] ?? '').trim().toUpperCase();
      if (id) found.add(id);
    }
  }
  return [...found].slice(0, 3);
}

function conversationPhoneDigits(phone: string): string {
  return toWhatsAppCloudRecipient(phone.trim());
}

function phoneDigitsMatch(
  stored: string | null | undefined,
  conversationDigits: string,
): boolean {
  const storedDigits = toWhatsAppCloudRecipient(String(stored ?? ''));
  if (!storedDigits || !conversationDigits) return false;
  return (
    storedDigits === conversationDigits ||
    storedDigits.endsWith(conversationDigits) ||
    conversationDigits.endsWith(storedDigits)
  );
}

async function resolveBuyerIdsForConversationPhone(args: {
  userId: number;
  conversationBuyerPhone: string;
}): Promise<string[]> {
  const conversationDigits = conversationPhoneDigits(args.conversationBuyerPhone);
  if (!conversationDigits) return [];

  const buyers = await prisma.buyer.findMany({
    where: { userId: args.userId },
    select: { buyerId: true, phone: true },
  });

  return buyers
    .filter((buyer) => phoneDigitsMatch(buyer.phone, conversationDigits))
    .map((buyer) => buyer.buyerId);
}

function orderMatchesConversationBuyer(args: {
  order: {
    buyerId: string | null;
    contactPhone: string;
    contactPhoneSnapshot: string | null;
  };
  conversationDigits: string;
  buyerIds: string[];
}): boolean {
  if (args.buyerIds.length > 0 && args.order.buyerId && args.buyerIds.includes(args.order.buyerId)) {
    return true;
  }
  return (
    phoneDigitsMatch(args.order.contactPhone, args.conversationDigits) ||
    phoneDigitsMatch(args.order.contactPhoneSnapshot, args.conversationDigits)
  );
}

/**
 * Buyer-requested order snapshot for CS: line items (product, qty, price) plus
 * high-level status. Scoped to this distributor and the verified WhatsApp buyer.
 */
export async function buildBuyerOrderLookupContext(args: {
  userId: number;
  /** E.164 phone from the authenticated WhatsApp conversation (webhook `from`). */
  conversationBuyerPhone: string;
  buyerMessage: string;
  history?: Array<{ role: string; content: string }>;
}): Promise<string | null> {
  const conversationDigits = conversationPhoneDigits(args.conversationBuyerPhone);
  if (!conversationDigits) return null;

  const historyText = (args.history ?? [])
    .slice(-8)
    .map((t) => t.content)
    .join('\n');
  const orderIds = extractBuyerOrderIds(args.buyerMessage, historyText);
  if (orderIds.length === 0) return null;

  const buyerIds = await resolveBuyerIdsForConversationPhone({
    userId: args.userId,
    conversationBuyerPhone: args.conversationBuyerPhone,
  });

  const candidateOrders = await prisma.order.findMany({
    where: {
      userId: args.userId,
      isDeleted: false,
      OR: orderIds.map((id) => ({
        orderId: { equals: id, mode: 'insensitive' as const },
      })),
    },
    take: 6,
    select: {
      orderId: true,
      buyerId: true,
      contactPhone: true,
      contactPhoneSnapshot: true,
      orderStatus: true,
      paymentStatus: true,
      deliveryMethod: true,
      storeName: true,
      totalAmount: true,
      orderItemsRel: {
        take: 30,
        select: {
          productNameSnapshot: true,
          variantNameSnapshot: true,
          packageQuantity: true,
          packageType: true,
          piecesPerPackage: true,
          pricePerPackage: true,
          unitPriceSnapshot: true,
          currencySnapshot: true,
          subtotal: true,
        },
      },
    },
  });

  const orders = candidateOrders
    .filter((order) =>
      orderMatchesConversationBuyer({ order, conversationDigits, buyerIds }),
    )
    .slice(0, 3);

  if (orders.length === 0) {
    return truncateContext({
      buyerOrderLookup: {
        requestedOrderIds: orderIds,
        found: false,
        note:
          'No matching order for this buyer on this chat. Ask them to confirm the order ID belongs to the phone number they are messaging from.',
      },
    });
  }

  return truncateContext({
    buyerOrderLookup: {
      requestedOrderIds: orderIds,
      found: true,
      note:
        'Buyer identified these orders on this WhatsApp chat. You MAY state product name, variant, quantity, unit/package price, and line subtotal. Do not dump other customers’ orders.',
      orders: orders.map((order) => ({
        orderId: order.orderId,
        orderStatus: order.orderStatus,
        paymentStatus: order.paymentStatus,
        deliveryMethod: order.deliveryMethod,
        storeName: order.storeName,
        totalAmount: moneyString(order.totalAmount),
        items: order.orderItemsRel.map((item) => ({
          productName: item.productNameSnapshot,
          variantName: item.variantNameSnapshot,
          quantity: item.packageQuantity ?? 1,
          packageType: item.packageType,
          piecesPerPackage: item.piecesPerPackage,
          pricePerPackage: moneyString(item.pricePerPackage),
          unitPrice: moneyString(item.unitPriceSnapshot),
          lineSubtotal: moneyString(item.subtotal),
          currency: item.currencySnapshot,
        })),
      })),
    },
  });
}
