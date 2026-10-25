import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSecurityHeaders } from '@/utils/auth-security';
import { buildMobileBuyerId, syncOrderToBuyerProfile } from '@/utils/buyerSync';
import { finalizeMarketplaceClientMatch, planMarketplaceClientMatch } from '@/lib/clientMatching/service';
import { NotificationService } from '@/app/api/graphql/modules/notifications';
import {
  validateOfferForProduct,
  trackOfferUsage as trackOfferUsageUtil,
  trackOfferUsageForAllTypes,
  updateOfferStatusesBasedOnLimits,
} from '@/utils/offerValidation';
import type { OfferValidationResult } from '@/utils/offerValidation';
import { calculateOrderItemPromotion } from '@/utils/promotionUtils';
import { getOfferForClientAndProduct } from '@/lib/offers/getOfferForClientAndProduct';
import { validateVariant } from '@/services/variantService';
import { parsePrice } from '@/utils/currencyUtils';
import { broadcastOrderUpdate } from '@/utils/websocketBroadcast';
import { orderCreationRateLimiter, orderQueryRateLimiter } from '@/utils/rateLimiter';
import { computeTotalQtyNeededWithBuyXGetY, selectVariantOption } from '@/domain/marketplace/orderItemRules';
import { enqueueSideEffect } from '@/lib/sideEffectQueue';
import { applyBuyerPriceVisibility } from '@/services/mobileOrders/maskBuyerFacingPrices';
import { getAuthenticatedMarketplaceUserId } from '@/utils/auth-helpers';

export interface OrderItemInput {
  productId: string;
  quantity: number;
  priceAtPurchase: string;
  subtotal: string;
  packageType?: string;
  piecesPerPackage?: number;
  packageQuantity?: number;
  pricePerPackage?: string;
  productName?: string;
  productSku?: string;
  variantId?: number;
  variantName?: string;
  category?: string;
}

function decimalToNumber(value: unknown): number {
  if (value === null || value === undefined) return 0;
  if (typeof value === 'number') return value;
  if (typeof value === 'string') return parseFloat(value) || 0;
  if (typeof value === 'object' && value !== null) {
    if (typeof (value as { toNumber?: () => number }).toNumber === 'function') {
      return (value as { toNumber: () => number }).toNumber();
    }
    if (typeof (value as { toString?: () => string }).toString === 'function') {
      return parseFloat((value as { toString: () => string }).toString()) || 0;
    }
  }
  return Number(value) || 0;
}

function buildOrderItemCreateData(params: {
  orderId: string;
  item: OrderItemInput;
  product: { productId: string; images?: unknown; userId?: number | null };
  variantOption: { id: number; attributes?: unknown; sellingPrice?: unknown; moq?: number | null };
  piecesPerPackage: number;
  packageQuantity: number;
  variantNameSnapshot: string | null;
  currencySnapshot: string;
  offerValidation: OfferValidationResult;
  /** Pre-resolved unit price: offer rate, auto base, or 0 pending. */
  resolvedUnitPrice: number;
  pricingSource: 'offer' | 'base' | 'pending';
}) {
  const {
    orderId,
    item,
    product,
    variantOption,
    piecesPerPackage,
    packageQuantity,
    variantNameSnapshot,
    currencySnapshot,
    offerValidation,
    resolvedUnitPrice,
    pricingSource,
  } = params;

  const unitPrice = Math.max(0, Number(resolvedUnitPrice) || 0);
  const pricePerPackage = pricingSource === 'pending' ? 0 : unitPrice * piecesPerPackage;
  const subtotal = pricingSource === 'pending' ? 0 : pricePerPackage * packageQuantity;

  const baseData = {
    orderId,
    productId: String(item.productId || ''),
    subtotal,
    packageType: String(item.packageType || 'Box'),
    piecesPerPackage,
    packageQuantity,
    pricePerPackage,
    productNameSnapshot: String(item.productName || 'Unknown Product'),
    productSkuSnapshot: String(item.productSku || ''),
    productTypeSnapshot: String(item.category || 'Uncategorized'),
    productImageSnapshot:
      Array.isArray(product.images) && (product.images as unknown[]).length > 0 ? (product.images as string[])[0] : null,
    variantId: null as number | null,
    variantOptionId: variantOption.id || null,
    variantNameSnapshot,
    variantAttributesSnapshot:
      variantOption.attributes && typeof variantOption.attributes === 'object'
        ? (variantOption.attributes as unknown as import('@/lib/prisma-generated').Prisma.InputJsonValue)
        : undefined,
    unitPriceSnapshot: unitPrice,
    currencySnapshot,
    offerApplied: false,
    offerBadgeSnapshot: null as string | null,
    offerNameSnapshot: null as string | null,
    offerIdSnapshot: null as string | null,
    originalPriceSnapshot: null as string | null,
    discountPercentage: null as number | null,
    discountAmount: null as number | null,
    promotionDetailsSnapshot: null as string | null,
    moqSnapshot: variantOption.moq || null,
  };

  if (pricingSource === 'offer' && offerValidation?.isValid && offerValidation?.offerId) {
    return {
      ...baseData,
      offerApplied: true,
      offerBadgeSnapshot: offerValidation.offerBadge || null,
      offerNameSnapshot: offerValidation.offerName || null,
      offerIdSnapshot: offerValidation.offerId || null,
      originalPriceSnapshot: offerValidation.originalPrice?.toString() || null,
      discountPercentage: offerValidation.discountPercentage || null,
      discountAmount: offerValidation.discountAmount || null,
      promotionDetailsSnapshot: offerValidation.promotionDetails
        ? JSON.stringify(offerValidation.promotionDetails)
        : null,
    };
  }

  return baseData;
}

function resolveLinePricing(params: {
  offerValidation: OfferValidationResult;
  baseUnitPrice: number;
}): { unitPrice: number; pricingSource: 'offer' | 'base' | 'pending' } {
  const hasClientRate =
    Boolean(params.offerValidation?.isValid && params.offerValidation.offerId) &&
    params.offerValidation.finalPrice != null &&
    Number.isFinite(Number(params.offerValidation.finalPrice));

  if (hasClientRate) {
    return {
      unitPrice: Math.max(0, Number(params.offerValidation.finalPrice)),
      pricingSource: 'offer',
    };
  }

  // No client rate: always keep the catalog/base price on the order so the distributor
  // sees an amount. Buyer apps see this base price until Send pricing, or right away
  // with any client rate when the distributor shows discounted prices on submit
  // (see applyBuyerPriceVisibility).
  if (Number.isFinite(params.baseUnitPrice) && params.baseUnitPrice > 0) {
    return { unitPrice: params.baseUnitPrice, pricingSource: 'base' };
  }

  return { unitPrice: 0, pricingSource: 'pending' };
}

function normalizeLeadTimeDays(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.floor(n);
}

function addCalendarDays(baseDate: Date, days: number): Date {
  const result = new Date(baseDate);
  result.setDate(result.getDate() + days);
  return result;
}

async function resolveEstimatedDeliveryForDistributor(
  distributorUserId: number,
  orderDate: Date,
  clientMinDays: number | null,
  clientMaxDays: number | null,
): Promise<{
  estimatedDeliveryMinDays: number | null;
  estimatedDeliveryMaxDays: number | null;
  estimatedDeliveryDate: Date | null;
}> {
  let minDays = clientMinDays;
  let maxDays = clientMaxDays;

  if (minDays == null || maxDays == null) {
    const company = await prisma.company.findFirst({
      where: { users: { some: { id: distributorUserId } } },
      select: {
        defaultDeliveryLeadTimeMinDays: true,
        defaultDeliveryLeadTimeMaxDays: true,
      },
    });

    if (minDays == null) {
      minDays = normalizeLeadTimeDays(company?.defaultDeliveryLeadTimeMinDays) ?? 3;
    }
    if (maxDays == null) {
      maxDays = normalizeLeadTimeDays(company?.defaultDeliveryLeadTimeMaxDays) ?? 7;
    }
  }

  if (minDays != null && maxDays != null && minDays > maxDays) {
    [minDays, maxDays] = [maxDays, minDays];
  }

  const estimatedDeliveryDate =
    maxDays != null ? addCalendarDays(orderDate, maxDays) : null;

  return {
    estimatedDeliveryMinDays: minDays,
    estimatedDeliveryMaxDays: maxDays,
    estimatedDeliveryDate,
  };
}

export async function getMobileMarketplaceOrders(request: NextRequest, tokenUserId: number) {
  const headers = getSecurityHeaders();

  const { searchParams } = new URL(request.url);
  const userId = searchParams.get('userId');
  const page = parseInt(searchParams.get('page') || '1');
  const limit = parseInt(searchParams.get('limit') || '10');

  if (!userId || isNaN(Number(userId))) {
    return NextResponse.json({ error: 'Valid user ID is required' }, { status: 400, headers });
  }

  const userIdNum = Number(userId);

  if (tokenUserId !== userIdNum) {
    return NextResponse.json({ error: 'Unauthorized access to user data' }, { status: 403, headers });
  }

  const rateLimitResponse = await orderQueryRateLimiter(request, userIdNum);
  if (rateLimitResponse) return rateLimitResponse;

  if (page < 1 || limit < 1 || limit > 100) {
    return NextResponse.json({ error: 'Invalid pagination parameters' }, { status: 400, headers });
  }

  const skip = (page - 1) * limit;

  const marketplaceUser = await prisma.marketplaceUser.findUnique({ where: { id: userIdNum } });
  if (!marketplaceUser) {
    return NextResponse.json({ error: 'User not found' }, { status: 404, headers });
  }

  const session = await getAuthenticatedMarketplaceUserId(request);
  const storefrontBuyerId =
    session.ok && session.distributorId
      ? buildMobileBuyerId(marketplaceUser.id, session.distributorId)
      : null;
  if (!storefrontBuyerId) {
    return NextResponse.json(
      { orders: [], pagination: { page, limit, total: 0, pages: 0 } },
      { headers },
    );
  }

  const orders = await prisma.order.findMany({
    where: { buyerId: storefrontBuyerId },
    skip,
    take: limit,
    orderBy: { orderDate: 'desc' },
    include: {
      user: { include: { company: true } },
      orderItemsRel: {
        include: {
          product: {
            include: {
              user: { include: { company: true } },
            },
          },
        },
      },
    },
  });

  const total = await prisma.order.count({
    where: { buyerId: storefrontBuyerId },
  });

  const ordersWithItems = orders.map((order) => {
    const orderItems = (order.orderItemsRel || []).map((oi) => ({
      productId: oi.productId ?? null,
      subtotal: decimalToNumber(oi.subtotal),
      packageType: oi.packageType,
      piecesPerPackage: oi.piecesPerPackage,
      packageQuantity: oi.packageQuantity,
      pricePerPackage: oi.pricePerPackage ? decimalToNumber(oi.pricePerPackage) : null,
      productName: oi.product?.name || oi.productNameSnapshot || 'Unknown Product',
      category: oi.product?.productType || oi.productTypeSnapshot || 'Uncategorized',
      brand: oi.product?.brand || 'Unknown Brand',
      description: oi.product?.description || '',
      images: oi.product?.images || [],
      productDeleted: !oi.product,
      productNameSnapshot: oi.productNameSnapshot || null,
      productSkuSnapshot: oi.productSkuSnapshot || null,
      productTypeSnapshot: oi.productTypeSnapshot || null,
      variantNameSnapshot: oi.variantNameSnapshot || null,
      offerApplied: oi.offerApplied || false,
      offerBadgeSnapshot: oi.offerBadgeSnapshot || null,
      offerNameSnapshot: oi.offerNameSnapshot || null,
      offerIdSnapshot: oi.offerIdSnapshot || null,
      originalPriceSnapshot: oi.originalPriceSnapshot ? decimalToNumber(oi.originalPriceSnapshot) : null,
      discountPercentage: oi.discountPercentage ? decimalToNumber(oi.discountPercentage) : null,
      discountAmount: oi.discountAmount ? decimalToNumber(oi.discountAmount) : null,
      promotionDetailsSnapshot: oi.promotionDetailsSnapshot || null,
      moqSnapshot: oi.moqSnapshot || null,
    }));

    return {
      ...order,
      subtotal: decimalToNumber((order as { subtotal?: unknown }).subtotal),
      discounts: decimalToNumber((order as { discounts?: unknown }).discounts),
      shippingFee: decimalToNumber((order as { shippingFee?: unknown }).shippingFee),
      totalAmount: decimalToNumber((order as { totalAmount?: unknown }).totalAmount),
      orderItems,
    };
  });

  const buyerVisibleOrders = await applyBuyerPriceVisibility(ordersWithItems);

  return NextResponse.json(
    {
      orders: buyerVisibleOrders,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    },
    { headers },
  );
}

export async function createMobileMarketplaceOrders(
  request: NextRequest,
  tokenUserId: number,
): Promise<NextResponse> {
  const headers = getSecurityHeaders();

  let bodyUnknown: unknown;
  try {
    bodyUnknown = await request.json();
  } catch (err) {
    console.error('[mobileOrdersService] Invalid JSON body:', err);
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400, headers });
  }

  if (!bodyUnknown || typeof bodyUnknown !== 'object' || Array.isArray(bodyUnknown)) {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400, headers });
  }

  const body = bodyUnknown as Record<string, unknown>;
  const {
    orderId,
    orderDate,
    distributorUserId: distributorUserIdFromClient,
    orderItems,
    discounts,
    shippingFee,
    contactPerson,
    storeName,
    contactPhone,
    customerEmail,
    deliveryAddress,
    deliveryMethod,
    deliveryOption,
    orderStatus,
    paymentStatus,
    paymentTerms,
    preferredDeliveryDate,
    preferredDeliveryTime,
    preferredPickupDate,
    preferredPickupTime,
    shippingMethodLabel,
    shippingMethod,
    estimatedDeliveryMinDays,
    estimatedDeliveryMaxDays,
    userId,
  } = body;

  if (!orderId || !userId) {
    return NextResponse.json({ error: 'Order ID and User ID are required' }, { status: 400, headers });
  }

  const userIdNum = Number(userId);
  if (isNaN(userIdNum)) {
    return NextResponse.json({ error: 'Invalid user ID format' }, { status: 400, headers });
  }

  if (tokenUserId !== userIdNum) {
    return NextResponse.json({ error: 'Unauthorized access to user data' }, { status: 403, headers });
  }

  const rateLimitResponse = await orderCreationRateLimiter(request, userIdNum);
  if (rateLimitResponse) return rateLimitResponse;

  const marketplaceUser = await prisma.marketplaceUser.findUnique({ where: { id: userIdNum } });
  if (!marketplaceUser) {
    return NextResponse.json({ error: 'User not found' }, { status: 404, headers });
  }

  const session = await getAuthenticatedMarketplaceUserId(request);
  const storefrontId = session.ok ? session.distributorId : null;
  if (!storefrontId) {
    return NextResponse.json(
      { error: 'Sign in with your distributor referral code to open their storefront', code: 'REFERRAL_CODE_REQUIRED' },
      { status: 403, headers },
    );
  }

  const normalizeDeliveryOption = (value: unknown) => {
    if (!value) return null;
    const trimmed = String(value).trim().toLowerCase();
    return trimmed.length > 0 ? trimmed : null;
  };

  const parseOptionalDate = (value: unknown) => {
    if (!value) return null;
    const parsed = new Date(String(value));
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  };

  const normalizeTimeValue = (value: unknown) => {
    if (!value) return null;
    const trimmed = String(value).trim();
    return trimmed.length > 0 ? trimmed : null;
  };

  const normalizedDeliveryOption = normalizeDeliveryOption(deliveryOption);
  const normalizedShippingLabel =
    typeof shippingMethodLabel === 'string' && shippingMethodLabel.trim().length > 0
      ? shippingMethodLabel.trim()
      : null;
  const normalizedShippingMethod =
    typeof shippingMethod === 'string' && shippingMethod.trim().length > 0
      ? shippingMethod.trim()
      : normalizedShippingLabel;
  const normalizedPreferredDeliveryDate = parseOptionalDate(preferredDeliveryDate);
  const normalizedPreferredPickupDate = parseOptionalDate(preferredPickupDate);
  const normalizedPreferredDeliveryTime = normalizeTimeValue(preferredDeliveryTime);
  const normalizedPreferredPickupTime = normalizeTimeValue(preferredPickupTime);

  const normalizeDuration = (value: unknown) => {
    if (value === null || value === undefined || value === '') return null;
    const n = Number(value);
    if (!Number.isFinite(n) || n < 0) return null;
    return Math.floor(n);
  };

  let normalizedEstimatedMinDays = normalizeDuration(estimatedDeliveryMinDays);
  let normalizedEstimatedMaxDays = normalizeDuration(estimatedDeliveryMaxDays);

  if (
    normalizedEstimatedMinDays != null &&
    normalizedEstimatedMaxDays != null &&
    normalizedEstimatedMinDays > normalizedEstimatedMaxDays
  ) {
    const tmp = normalizedEstimatedMinDays;
    normalizedEstimatedMinDays = normalizedEstimatedMaxDays;
    normalizedEstimatedMaxDays = tmp;
  }

  if (typeof distributorUserIdFromClient === 'number') {
    const productIds = Array.isArray(orderItems) ? orderItems.map((i: OrderItemInput) => String(i.productId)) : [];
    if (productIds.length === 0) {
      return NextResponse.json({ error: 'Order items required' }, { status: 400, headers });
    }
    const products = await prisma.product.findMany({
      where: { productId: { in: productIds } },
      select: { productId: true, userId: true },
    });
    const mismatched = products.find((p) => p.userId !== distributorUserIdFromClient);
    if (mismatched) {
      return NextResponse.json(
        { error: `Product ${mismatched.productId} does not belong to distributor ${distributorUserIdFromClient}` },
        { status: 400, headers },
      );
    }
    if (distributorUserIdFromClient !== storefrontId) {
      return NextResponse.json(
        { error: 'You can only order from the distributor storefront you signed into', code: 'NOT_A_MEMBER' },
        { status: 403, headers },
      );
    }

    const buyerPerDistributorId = buildMobileBuyerId(marketplaceUser.id, distributorUserIdFromClient);
    const matchPlan = await planMarketplaceClientMatch({
      distributorId: distributorUserIdFromClient,
      intendedBuyerId: buyerPerDistributorId,
      phone: String(contactPhone || marketplaceUser.phone || ''),
      storeName: String(storeName || marketplaceUser.storeName || ''),
      ownerName: String(contactPerson || marketplaceUser.name || ''),
      address: String(deliveryAddress || marketplaceUser.chosenAddress || ''),
      email: customerEmail ? String(customerEmail) : marketplaceUser.email || '',
      avatar: marketplaceUser.image || null,
    });

    if (!matchPlan.preserveExistingClient) {
    await prisma.buyer.upsert({
      where: { buyerId: buyerPerDistributorId },
      update: {
        ...(marketplaceUser.name ? { owner: marketplaceUser.name } : {}),
        ...(marketplaceUser.email ? { email: marketplaceUser.email } : {}),
        ...(marketplaceUser.phone ? { phone: marketplaceUser.phone } : {}),
        ...(marketplaceUser.storeName ? { storeName: marketplaceUser.storeName } : {}),
        ...(marketplaceUser.chosenAddress ? { address: marketplaceUser.chosenAddress } : {}),
        ...(marketplaceUser.image ? { avatar: marketplaceUser.image } : {}),
        userId: distributorUserIdFromClient,
      },
      create: {
        buyerId: buyerPerDistributorId,
        owner: marketplaceUser.name || 'Mobile User',
        email: marketplaceUser.email || '',
        phone: marketplaceUser.phone || '',
        storeName: marketplaceUser.storeName || 'Mobile Store',
        businessType: 'Retailer',
        address: marketplaceUser.chosenAddress || '',
        avatar: marketplaceUser.image || null,
        status: 'Active',
        userId: distributorUserIdFromClient,
      },
    });
    }

    const groupSubtotal = Array.isArray(orderItems)
      ? orderItems.reduce((sum: number, it: OrderItemInput) => sum + parseFloat(String(it.subtotal || 0)), 0)
      : 0;
    const groupTotalOrders = Array.isArray(orderItems)
      ? orderItems.reduce((sum: number, it: OrderItemInput) => sum + parseInt(String(it.packageQuantity || 1)), 0)
      : 0;
    const groupShipping = parseFloat(String(shippingFee || 0));
    const groupDiscounts = parseFloat(String(discounts || 0));
    const groupTotalAmount = groupSubtotal + groupShipping - groupDiscounts;

    const groupOrderId = String(orderId);
    const orderDateValue = parseOptionalDate(orderDate) ?? new Date();
    const estimatedDelivery = await resolveEstimatedDeliveryForDistributor(
      distributorUserIdFromClient,
      orderDateValue,
      normalizedEstimatedMinDays,
      normalizedEstimatedMaxDays,
    );
    const orderData = {
      orderId: groupOrderId,
      buyerId: matchPlan.buyerId,
      buyerIdSnapshot: matchPlan.buyerId,
      orderDate: orderDateValue,
      orderDateSnapshot: orderDateValue,
      orderStatus: String(orderStatus || 'Pending'),
      paymentStatus: String(paymentStatus || 'Unpaid'),
      deliveryMethod: String(deliveryMethod || 'Seller/Distributor Delivery'),
      deliveryOption: normalizedDeliveryOption,
      subtotal: groupSubtotal,
      discounts: groupDiscounts,
      shippingFee: groupShipping,
      totalAmount: groupTotalAmount,
      paymentTerms: String(paymentTerms || 'Cash on Delivery'),
      totalOrders: groupTotalOrders,
      contactPerson: String(contactPerson || marketplaceUser.name || ''),
      contactPersonSnapshot: String(contactPerson || marketplaceUser.name || ''),
      storeName: String(storeName || marketplaceUser.storeName || ''),
      storeNameSnapshot: String(storeName || marketplaceUser.storeName || ''),
      contactPhone: String(contactPhone || marketplaceUser.phone || ''),
      contactPhoneSnapshot: String(contactPhone || marketplaceUser.phone || ''),
      customerEmail: customerEmail ? String(customerEmail) : marketplaceUser.email || '',
      customerEmailSnapshot: customerEmail ? String(customerEmail) : marketplaceUser.email || '',
      deliveryAddress: String(deliveryAddress || marketplaceUser.chosenAddress || ''),
      deliveryAddressSnapshot: String(deliveryAddress || marketplaceUser.chosenAddress || ''),
      preferredDeliveryDate: normalizedPreferredDeliveryDate,
      preferredDeliveryTime: normalizedPreferredDeliveryTime,
      preferredPickupDate: normalizedPreferredPickupDate,
      preferredPickupTime: normalizedPreferredPickupTime,
      shippingMethodLabel: normalizedShippingLabel,
      shippingMethod: normalizedShippingMethod,
      estimatedDeliveryMinDays: estimatedDelivery.estimatedDeliveryMinDays,
      estimatedDeliveryMaxDays: estimatedDelivery.estimatedDeliveryMaxDays,
      estimatedDeliveryDate: estimatedDelivery.estimatedDeliveryDate,
      userId: distributorUserIdFromClient,
    };
    const order = await prisma.order.create({ data: orderData });
    try {
      await finalizeMarketplaceClientMatch(matchPlan, order.orderId);
    } catch (error) {
      console.warn('[Mobile Orders] Client match finalize failed:', error);
    }

    if (order.userId) {
      try {
        await NotificationService.createOrderNotification(
          order.userId,
          order.orderId,
          'Pending',
          order.storeName || 'Unknown Store',
          groupTotalAmount,
        );
      } catch (err) {
        console.error('Failed to create order notification:', err);
      }

      if (order.buyerId) {
        try {
          await prisma.$transaction(async (tx) => {
            await tx.buyer.upsert({
              where: { buyerId: order.buyerId as string },
              update: {},
              create: {
                buyerId: order.buyerId as string,
                storeName: order.storeName || 'Unknown Store',
                userId: order.userId || undefined,
                owner: order.contactPerson || 'Unknown',
                email: order.customerEmail || '',
                phone: order.contactPhone || '',
                businessType: 'Retailer',
                address: order.deliveryAddress || '',
                status: 'Active',
              },
              select: { id: true, buyerId: true },
            });

            const orderCount = await tx.order.count({
              where: {
                userId: order.userId,
                buyerId: order.buyerId as string,
                isDeleted: false,
              },
            });

            if (orderCount === 1 && order.userId) {
              await NotificationService.createNewBuyerNotification(
                order.userId,
                order.buyerId as string,
                order.storeName || 'Unknown Store',
                true,
              );
            }
          });
        } catch (error) {
          console.warn('[Mobile Orders] Failed to check/notify first order for buyer:', {
            buyerId: order.buyerId,
            orderId: order.orderId,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

      try {
        const { invalidateDashboardCache } = await import('@/lib/queryCache');
        await invalidateDashboardCache(order.userId);
      } catch (error) {
        console.warn('[Mobile Orders] Failed to invalidate dashboard cache:', {
          userId: order.userId,
          orderId: order.orderId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    if (Array.isArray(orderItems) && orderItems.length > 0) {
      const usedOfferIds: string[] = [];
      const distributorCurrencySnapshot =
        (await prisma.user.findUnique({
          where: { id: distributorUserIdFromClient },
          select: { currency: true },
        }))?.currency ?? 'IDR';
      await prisma.$transaction(async (tx) => {
        const orderItemPromises = orderItems.map(async (item: OrderItemInput) => {
          const product = await tx.product.findFirst({
            where: { productId: String(item.productId || '') },
            include: { variants: true, variantOptions: true },
          });
          if (!product) throw new Error(`Product not found: ${item.productId}`);

          let variantOption = null;
          if (item.variantId) {
            variantOption = product.variantOptions?.find((vo) => vo.id === item.variantId);
            if (!variantOption) {
              throw new Error(`Variant option with ID ${item.variantId} not found for product: ${item.productId}`);
            }
          } else {
            variantOption = product.variantOptions?.find((vo) => vo.isDefault) || product.variantOptions?.[0];
          }

          if (!variantOption) throw new Error(`No variant options found for product: ${item.productId}.`);
          const packageQuantity = parseInt(String(item.packageQuantity || 1));
          const piecesPerPackage = parseInt(String(item.piecesPerPackage || 1));
          const totalQuantity = packageQuantity * piecesPerPackage;
          const orderTotal = groupTotalAmount;
          const variantForValidation = {
            id: variantOption.id ?? null,
            sellingPrice: parsePrice(
              variantOption.sellingPrice as
                | string
                | number
                | { toNumber?: () => number; toString?: () => string }
                | null
                | undefined,
            ),
            originalSellingPrice: variantOption.originalSellingPrice
              ? parsePrice(
                  variantOption.originalSellingPrice as
                    | string
                    | number
                    | { toNumber?: () => number; toString?: () => string }
                    | null
                    | undefined,
                )
              : null,
            moq: variantOption.moq || null,
          };
          const offerValidation = await validateOfferForProduct(
            product.productId,
            userIdNum,
            orderTotal,
            totalQuantity,
            tx,
            packageQuantity,
            variantForValidation,
            matchPlan.buyerId,
          );

          let variantNameSnapshot: string | null = null;
          if (variantOption.attributes) {
            const attributes = variantOption.attributes as Record<string, string>;
            variantNameSnapshot = Object.entries(attributes)
              .map(([key, value]) => `${key}: ${value}`)
              .join(', ');
          } else {
            variantNameSnapshot = item.variantName || 'Default';
          }

          if (offerValidation.isValid && offerValidation.offerId) {
            if (!usedOfferIds.includes(offerValidation.offerId)) usedOfferIds.push(offerValidation.offerId);
            if (offerValidation.applicableDiscountTypes && offerValidation.applicableDiscountTypes.length > 0) {
              await trackOfferUsageForAllTypes(
                offerValidation.offerId,
                offerValidation.applicableDiscountTypes,
                userIdNum,
                tx,
              );
            } else if (offerValidation.discountTypeId) {
              await trackOfferUsageUtil(
                offerValidation.offerId,
                offerValidation.discountTypeId,
                userIdNum,
                offerValidation.discountAmount || 0,
                tx,
              );
            }
          }

          const linePricing = resolveLinePricing({
              offerValidation,
              baseUnitPrice: parsePrice(
                variantOption.sellingPrice as
                  | string
                  | number
                  | { toNumber?: () => number; toString?: () => string }
                  | null
                  | undefined,
              ),
            });
          const orderItemData = buildOrderItemCreateData({
            orderId: order.orderId,
            item,
            product,
            variantOption,
            piecesPerPackage,
            packageQuantity,
            variantNameSnapshot,
            currencySnapshot: distributorCurrencySnapshot,
            offerValidation,
            resolvedUnitPrice: linePricing.unitPrice,
            pricingSource: linePricing.pricingSource,
          });

          return tx.orderItem.create({ data: orderItemData });
        });
        const createdItems = await Promise.all(orderItemPromises);
        const resolvedSubtotal = createdItems.reduce(
          (sum, row) => sum + Number(row.subtotal || 0),
          0,
        );
        const anyPending = createdItems.some((row) => !(Number(row.subtotal) > 0));
        const resolvedTotal = anyPending
          ? 0
          : Math.max(
              0,
              resolvedSubtotal + Number(order.shippingFee || 0) - Number(order.discounts || 0),
            );
        if (resolvedSubtotal !== Number(order.subtotal || 0) || resolvedTotal !== Number(order.totalAmount || 0)) {
          await tx.order.update({
            where: { id: order.id },
            data: {
              subtotal: resolvedSubtotal,
              totalAmount: resolvedTotal,
            },
          });
        }
      });
      if (usedOfferIds.length > 0) {
        await updateOfferStatusesBasedOnLimits(usedOfferIds);
      }
    }

    try {
      await syncOrderToBuyerProfile(matchPlan.buyerId, distributorUserIdFromClient);
    } catch (err) {
      console.error('[mobileOrdersService] Failed to sync order to buyer profile:', err);
    }

    const createdOrdersFull = await prisma.order.findMany({
      where: { orderId: { in: [order.orderId] } },
      include: { orderItemsRel: { include: { product: true } } },
    });
    enqueueSideEffect('broadcastOrderUpdate(mobileOrders.single)', async () => broadcastOrderUpdate([order.orderId]), {
      retries: 2,
    });

    return NextResponse.json(
      { success: true, orders: createdOrdersFull, order: createdOrdersFull[0] },
      {
        status: 201,
        headers: { ...headers, 'Cache-Control': 'no-store, no-cache, must-revalidate, private' },
      },
    );
  }

  const distributorToItems: Map<number, OrderItemInput[]> = new Map();
  if (Array.isArray(orderItems) && orderItems.length > 0) {
    const productIds = orderItems.map((item: OrderItemInput) => String(item.productId));
    const products = await prisma.product.findMany({
      where: { productId: { in: productIds } },
      select: { productId: true, userId: true },
    });
    const productIdToUserId = new Map<string, number>();
    products.forEach((p) => {
      if (p.userId) productIdToUserId.set(p.productId, p.userId);
    });

    for (const item of orderItems) {
      const ownerId = productIdToUserId.get(String(item.productId));
      if (!ownerId) {
        return NextResponse.json(
          { error: `Unable to resolve distributor for product ${String(item.productId)}. Please retry.` },
          { status: 400, headers },
        );
      }
      if (!distributorToItems.has(ownerId)) distributorToItems.set(ownerId, []);
      distributorToItems.get(ownerId)!.push(item as OrderItemInput);
    }
  }

  if (distributorToItems.size === 0) {
    return NextResponse.json({ error: 'Unable to determine distributors for products' }, { status: 400, headers });
  }

  if (distributorToItems.size !== 1 || !distributorToItems.has(storefrontId)) {
    return NextResponse.json(
      { error: 'You can only order from the distributor storefront you signed into', code: 'NOT_A_MEMBER' },
      { status: 403, headers },
    );
  }

  // Validate items (variants + promo free qty + stock precheck) BEFORE creating any orders to avoid partial writes.
  // Stock precheck here is advisory only — no reservation or decrement; inventory is deducted on dashboard confirm.
  if (Array.isArray(orderItems) && orderItems.length > 0) {
    const plannedBuyerByDistributor = new Map<number, string>();
    for (const item of orderItems) {
      const product = await prisma.product.findFirst({
        where: { productId: String(item.productId || '') },
        include: { variants: true, variantOptions: true },
      });

      if (!product) {
        return NextResponse.json({ error: `Product not found: ${item.productId}` }, { status: 404, headers });
      }

      let variantOption = null;
      if (item.variantId) {
        variantOption = product.variantOptions?.find((vo) => vo.id === item.variantId);
        if (!variantOption) {
          return NextResponse.json(
            { error: `Variant option with ID ${item.variantId} not found for product: ${item.productId}` },
            { status: 404, headers },
          );
        }
      } else {
        variantOption = product.variantOptions?.find((vo) => vo.isDefault) || product.variantOptions?.[0];
      }

      if (!variantOption) {
        return NextResponse.json(
          { error: `No variant options found for product: ${item.productId}` },
          { status: 404, headers },
        );
      }
      const packageQuantity = item.packageQuantity || 1;
      const piecesPerPackage = item.piecesPerPackage || 1;
      const totalPieces = packageQuantity * piecesPerPackage;

      const variantValidation = await validateVariant(
        String(item.productId || ''),
        item.variantId,
        totalPieces,
        packageQuantity,
      );
      if (!variantValidation.isValid) {
        return NextResponse.json({ error: variantValidation.error }, { status: 404, headers });
      }

      const orderedQty = parseInt(String(item.packageQuantity || 1));
      const qtyForPrecheck = computeTotalQtyNeededWithBuyXGetY({
        packageQuantity: orderedQty,
        piecesPerPackage,
        moqPieces: variantOption.moq,
        promotionDetails: null,
      });
      let orderedPieces = qtyForPrecheck.orderedPieces;
      let totalQtyNeeded = qtyForPrecheck.totalQtyNeeded;

      let precheckBuyerId = '';
      if (product.userId) {
        const cachedBuyerId = plannedBuyerByDistributor.get(product.userId);
        if (cachedBuyerId) {
          precheckBuyerId = cachedBuyerId;
        } else {
          const precheckPlan = await planMarketplaceClientMatch({
            distributorId: product.userId,
            intendedBuyerId: buildMobileBuyerId(marketplaceUser.id, product.userId),
            phone: String(contactPhone || marketplaceUser.phone || ''),
            storeName: String(storeName || marketplaceUser.storeName || ''),
            ownerName: String(contactPerson || marketplaceUser.name || ''),
            address: String(deliveryAddress || marketplaceUser.chosenAddress || ''),
            email: customerEmail ? String(customerEmail) : marketplaceUser.email || '',
            avatar: marketplaceUser.image || null,
          });
          precheckBuyerId = precheckPlan.buyerId;
          plannedBuyerByDistributor.set(product.userId, precheckPlan.buyerId);
        }
      }
      const productOffer = precheckBuyerId
        ? await getOfferForClientAndProduct(precheckBuyerId, product.productId, {
            userId: product.userId ?? undefined,
            variantOptionId: variantOption.id ?? null,
          })
        : null;

      const freeQty =
        productOffer?.freeQuantity != null && productOffer.freeQuantity > 0
          ? productOffer.freeQuantity
          : productOffer?.discountType === 'buy_x_get_y'
            ? Math.round(productOffer.discountValue)
            : null;
      const buyQty =
        productOffer?.buyQuantity != null && productOffer.buyQuantity > 0
          ? productOffer.buyQuantity
          : null;
      const hasBxgyPromo =
        productOffer != null &&
        buyQty != null &&
        freeQty != null &&
        freeQty > 0 &&
        (productOffer.discountType === 'buy_x_get_y' ||
          productOffer.discountType === 'percentage' ||
          productOffer.discountType === 'fixed_amount' ||
          productOffer.discountType === 'fixed_amount');

      if (hasBxgyPromo) {
        const promotionDetails = {
          minQuantity: buyQty,
          freeQuantity: freeQty,
          applyMode: productOffer?.promotionApplyMode ?? 'after_moq',
          moq: variantOption.moq ?? null,
        };

        const promoQty = computeTotalQtyNeededWithBuyXGetY({
          packageQuantity: orderedQty,
          piecesPerPackage,
          moqPieces: variantOption.moq,
          promotionDetails,
        });
        orderedPieces = promoQty.orderedPieces;
        totalQtyNeeded = promoQty.totalQtyNeeded;
      }

      const availableStock = Number(variantOption.stockQuantity) || 0;
      if (availableStock < totalQtyNeeded) {
        const variantName = variantOption.attributes
          ? Object.entries(variantOption.attributes)
              .map(([k, v]) => `${k}: ${v}`)
              .join(', ')
          : 'Default';

        const freeItems = totalQtyNeeded - orderedPieces;
        return NextResponse.json(
          {
            error: `Insufficient stock for ${product.name} (${variantName}). Available: ${availableStock}, Required: ${totalQtyNeeded} pieces (${orderedPieces} ordered + ${freeItems} free)`,
          },
          { status: 400, headers },
        );
      }
    }
  }

  const createdOrders: Array<{ orderId: string }> = [];
  let groupIndex = 0;
  for (const [distributorUserId, itemsForDistributor] of distributorToItems.entries()) {
    groupIndex += 1;
    const buyerPerDistributorId = buildMobileBuyerId(marketplaceUser.id, distributorUserId);
    const matchPlan = await planMarketplaceClientMatch({
      distributorId: distributorUserId,
      intendedBuyerId: buyerPerDistributorId,
      phone: String(contactPhone || marketplaceUser.phone || ''),
      storeName: String(storeName || marketplaceUser.storeName || ''),
      ownerName: String(contactPerson || marketplaceUser.name || ''),
      address: String(deliveryAddress || marketplaceUser.chosenAddress || ''),
      email: customerEmail ? String(customerEmail) : marketplaceUser.email || '',
      avatar: marketplaceUser.image || null,
    });

    if (!matchPlan.preserveExistingClient) {
    await prisma.buyer.upsert({
      where: { buyerId: buyerPerDistributorId },
      update: {
        ...(marketplaceUser.name ? { owner: marketplaceUser.name } : {}),
        ...(marketplaceUser.email ? { email: marketplaceUser.email } : {}),
        ...(marketplaceUser.phone ? { phone: marketplaceUser.phone } : {}),
        ...(marketplaceUser.storeName ? { storeName: marketplaceUser.storeName } : {}),
        ...(marketplaceUser.chosenAddress ? { address: marketplaceUser.chosenAddress } : {}),
        ...(marketplaceUser.image ? { avatar: marketplaceUser.image } : {}),
        userId: distributorUserId,
      },
      create: {
        buyerId: buyerPerDistributorId,
        owner: marketplaceUser.name || 'Mobile User',
        email: marketplaceUser.email || '',
        phone: marketplaceUser.phone || '',
        storeName: marketplaceUser.storeName || 'Mobile Store',
        businessType: 'Retailer',
        address: marketplaceUser.chosenAddress || '',
        avatar: marketplaceUser.image || null,
        status: 'Active',
        userId: distributorUserId,
      },
    });
    }

    const groupSubtotal = itemsForDistributor.reduce(
      (sum: number, it: OrderItemInput) => sum + parseFloat(String(it.subtotal || 0)),
      0,
    );
    const groupTotalOrders = itemsForDistributor.reduce(
      (sum: number, it: OrderItemInput) => sum + parseInt(String(it.packageQuantity || 1)),
      0,
    );
    const groupsCount = distributorToItems.size;
    const groupIndex0 = groupIndex - 1;

    const totalShippingCents = Math.round(parseFloat(String(shippingFee || 0)) * 100);
    const totalDiscountsCents = Math.round(parseFloat(String(discounts || 0)) * 100);

    const baseShippingCents = Math.floor(totalShippingCents / groupsCount);
    const shippingRemainder = totalShippingCents % groupsCount;
    const groupShippingCents = baseShippingCents + (groupIndex0 < shippingRemainder ? 1 : 0);

    const baseDiscountsCents = Math.floor(totalDiscountsCents / groupsCount);
    const discountsRemainder = totalDiscountsCents % groupsCount;
    const groupDiscountsCents = baseDiscountsCents + (groupIndex0 < discountsRemainder ? 1 : 0);

    const groupShipping = groupShippingCents / 100;
    const groupDiscounts = groupDiscountsCents / 100;
    const groupTotalAmount = groupSubtotal + groupShipping - groupDiscounts;

    const groupOrderId = distributorToItems.size > 1 ? `${String(orderId)}-${groupIndex}` : String(orderId);
    const orderDateValue = parseOptionalDate(orderDate) ?? new Date();
    const estimatedDelivery = await resolveEstimatedDeliveryForDistributor(
      distributorUserId,
      orderDateValue,
      normalizedEstimatedMinDays,
      normalizedEstimatedMaxDays,
    );
    const orderData = {
      orderId: groupOrderId,
      buyerId: matchPlan.buyerId,
      buyerIdSnapshot: matchPlan.buyerId,
      orderDate: orderDateValue,
      orderDateSnapshot: orderDateValue,
      orderStatus: String(orderStatus || 'Pending'),
      paymentStatus: String(paymentStatus || 'Unpaid'),
      deliveryMethod: String(deliveryMethod || 'Seller/Distributor Delivery'),
      deliveryOption: normalizedDeliveryOption,
      subtotal: groupSubtotal,
      discounts: groupDiscounts,
      shippingFee: groupShipping,
      totalAmount: groupTotalAmount,
      paymentTerms: String(paymentTerms || 'Cash on Delivery'),
      totalOrders: groupTotalOrders,
      contactPerson: String(contactPerson || marketplaceUser.name || ''),
      contactPersonSnapshot: String(contactPerson || marketplaceUser.name || ''),
      storeName: String(storeName || marketplaceUser.storeName || ''),
      storeNameSnapshot: String(storeName || marketplaceUser.storeName || ''),
      contactPhone: String(contactPhone || marketplaceUser.phone || ''),
      contactPhoneSnapshot: String(contactPhone || marketplaceUser.phone || ''),
      customerEmail: customerEmail ? String(customerEmail) : marketplaceUser.email || '',
      customerEmailSnapshot: customerEmail ? String(customerEmail) : marketplaceUser.email || '',
      deliveryAddress: String(deliveryAddress || marketplaceUser.chosenAddress || ''),
      deliveryAddressSnapshot: String(deliveryAddress || marketplaceUser.chosenAddress || ''),
      preferredDeliveryDate: normalizedPreferredDeliveryDate,
      preferredDeliveryTime: normalizedPreferredDeliveryTime,
      preferredPickupDate: normalizedPreferredPickupDate,
      preferredPickupTime: normalizedPreferredPickupTime,
      shippingMethodLabel: normalizedShippingLabel,
      shippingMethod: normalizedShippingMethod,
      estimatedDeliveryMinDays: estimatedDelivery.estimatedDeliveryMinDays,
      estimatedDeliveryMaxDays: estimatedDelivery.estimatedDeliveryMaxDays,
      estimatedDeliveryDate: estimatedDelivery.estimatedDeliveryDate,
      userId: distributorUserId,
    };

    const usedOfferIds: string[] = [];
    let order;
    try {
      const distributorCurrencySnapshot =
        (await prisma.user.findUnique({
          where: { id: distributorUserId },
          select: { currency: true },
        }))?.currency ?? 'IDR';
      order = await prisma.$transaction(async (tx) => {
        const createdOrder = await tx.order.create({ data: orderData });

        if (itemsForDistributor.length > 0) {
          const orderItemPromises = itemsForDistributor.map(async (item: OrderItemInput) => {
            const product = await tx.product.findFirst({
              where: { productId: String(item.productId || '') },
              include: { variants: true, variantOptions: true },
            });
            if (!product) throw new Error(`Product not found: ${item.productId}`);

            const variantOption = selectVariantOption(product, { variantId: item.variantId ?? null });
            if (!variantOption) throw new Error(`No variant options found for product: ${item.productId}.`);

            // Compute total quantity needed INCLUDING buy_x_get_y free items inside the transaction.
            const packageQuantity = parseInt(String(item.packageQuantity || 1));
            const piecesPerPackage = parseInt(String(item.piecesPerPackage || 1));
            let orderedPieces = packageQuantity * piecesPerPackage;
            let totalQtyNeeded = orderedPieces;

            const productOffer = await getOfferForClientAndProduct(
              buyerPerDistributorId,
              product.productId,
              {
                userId: product.userId ?? undefined,
                db: tx,
                variantOptionId: variantOption.id ?? null,
              },
            );

            const freeQty =
              productOffer?.freeQuantity != null && productOffer.freeQuantity > 0
                ? productOffer.freeQuantity
                : productOffer?.discountType === 'buy_x_get_y'
                  ? Math.round(productOffer.discountValue)
                  : null;
            const buyQty =
              productOffer?.buyQuantity != null && productOffer.buyQuantity > 0
                ? productOffer.buyQuantity
                : null;
            const hasBxgyPromo =
              productOffer != null &&
              buyQty != null &&
              freeQty != null &&
              freeQty > 0 &&
              (productOffer.discountType === 'buy_x_get_y' ||
                productOffer.discountType === 'percentage' ||
                productOffer.discountType === 'fixed_amount' ||
                productOffer.discountType === 'fixed_amount');

            if (hasBxgyPromo) {
              const promotionDetails = {
                minQuantity: buyQty,
                freeQuantity: freeQty,
                applyMode: productOffer?.promotionApplyMode ?? 'after_moq',
                moq: variantOption.moq ?? null,
              };
              const qty = computeTotalQtyNeededWithBuyXGetY({
                packageQuantity,
                piecesPerPackage,
                moqPieces: variantOption.moq,
                promotionDetails,
              });
              orderedPieces = qty.orderedPieces;
              totalQtyNeeded = qty.totalQtyNeeded;
            }

            // No stock decrement here. Checkout pre-check (above) is advisory only; deduction runs when the
            // dashboard confirms the order (Pending → Confirmed via updateOrder). Concurrent oversells are
            // possible until that confirmation.
            const totalQuantity = orderedPieces;
            const orderTotal = groupTotalAmount;
            const variantForValidation = {
              id: variantOption.id ?? null,
              sellingPrice: parsePrice(
                variantOption.sellingPrice as
                  | string
                  | number
                  | { toNumber?: () => number; toString?: () => string }
                  | null
                  | undefined,
              ),
              originalSellingPrice: variantOption.originalSellingPrice
                ? parsePrice(
                    variantOption.originalSellingPrice as
                      | string
                      | number
                      | { toNumber?: () => number; toString?: () => string }
                      | null
                      | undefined,
                  )
                : null,
              moq: variantOption.moq || null,
            };
            const offerValidation = await validateOfferForProduct(
              product.productId,
              userIdNum,
              orderTotal,
              totalQuantity,
              tx,
              packageQuantity,
              variantForValidation,
              matchPlan.buyerId,
            );

            let variantNameSnapshot: string | null = null;
            if (variantOption.attributes) {
              const attributes = variantOption.attributes as Record<string, string>;
              variantNameSnapshot = Object.entries(attributes)
                .map(([key, value]) => `${key}: ${value}`)
                .join(', ');
            } else {
              variantNameSnapshot = item.variantName || 'Default';
            }

            if (offerValidation.isValid && offerValidation.offerId) {
              if (!usedOfferIds.includes(offerValidation.offerId)) usedOfferIds.push(offerValidation.offerId);
              if (offerValidation.applicableDiscountTypes && offerValidation.applicableDiscountTypes.length > 0) {
                await trackOfferUsageForAllTypes(
                  offerValidation.offerId,
                  offerValidation.applicableDiscountTypes,
                  userIdNum,
                  tx,
                );
              } else if (offerValidation.discountTypeId) {
                await trackOfferUsageUtil(
                  offerValidation.offerId,
                  offerValidation.discountTypeId,
                  userIdNum,
                  offerValidation.discountAmount || 0,
                  tx,
                );
              }
            }

            const linePricing = resolveLinePricing({
                offerValidation,
                baseUnitPrice: parsePrice(
                  variantOption.sellingPrice as
                    | string
                    | number
                    | { toNumber?: () => number; toString?: () => string }
                    | null
                    | undefined,
                ),
              });
            const orderItemData = buildOrderItemCreateData({
              orderId: createdOrder.orderId,
              item,
              product,
              variantOption,
              piecesPerPackage,
              packageQuantity,
              variantNameSnapshot,
              currencySnapshot: distributorCurrencySnapshot,
              offerValidation,
              resolvedUnitPrice: linePricing.unitPrice,
              pricingSource: linePricing.pricingSource,
            });

            return tx.orderItem.create({ data: orderItemData });
          });

          const createdItems = await Promise.all(orderItemPromises);
          const resolvedSubtotal = createdItems.reduce(
            (sum, row) => sum + Number(row.subtotal || 0),
            0,
          );
          const anyPending = createdItems.some((row) => !(Number(row.subtotal) > 0));
          const resolvedTotal = anyPending
            ? 0
            : Math.max(0, resolvedSubtotal + groupShipping - groupDiscounts);
          if (
            resolvedSubtotal !== Number(createdOrder.subtotal || 0) ||
            resolvedTotal !== Number(createdOrder.totalAmount || 0)
          ) {
            return tx.order.update({
              where: { id: createdOrder.id },
              data: {
                subtotal: resolvedSubtotal,
                totalAmount: resolvedTotal,
              },
            });
          }
        }

        return createdOrder;
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create order';
      return NextResponse.json({ error: message }, { status: 400, headers });
    }

    createdOrders.push({ orderId: order.orderId });
    try {
      await finalizeMarketplaceClientMatch(matchPlan, order.orderId);
    } catch (error) {
      console.warn('[Mobile Orders] Client match finalize failed:', error);
    }

    if (order.userId) {
      try {
        await NotificationService.createOrderNotification(
          order.userId,
          order.orderId,
          'Pending',
          order.storeName || 'Unknown Store',
          Number(order.totalAmount) || 0,
        );
      } catch (err) {
        console.warn('[Mobile Orders] Failed to create order notification:', {
          userId: order.userId,
          orderId: order.orderId,
          error: err instanceof Error ? err.message : String(err),
        });
      }

      if (order.buyerId) {
        try {
          await prisma.$transaction(async (tx) => {
            await tx.buyer.upsert({
              where: { buyerId: order.buyerId as string },
              update: {},
              create: {
                buyerId: order.buyerId as string,
                storeName: order.storeName || 'Unknown Store',
                userId: order.userId || undefined,
                owner: order.contactPerson || 'Unknown',
                email: order.customerEmail || '',
                phone: order.contactPhone || '',
                businessType: 'Retailer',
                address: order.deliveryAddress || '',
                status: 'Active',
              },
              select: { id: true, buyerId: true },
            });

            const orderCount = await tx.order.count({
              where: {
                userId: order.userId,
                buyerId: order.buyerId as string,
                isDeleted: false,
              },
            });

            if (orderCount === 1 && order.userId) {
              await NotificationService.createNewBuyerNotification(
                order.userId,
                order.buyerId as string,
                order.storeName || 'Unknown Store',
                true,
              );
            }
          });
        } catch (error) {
          console.warn('[Mobile Orders] Failed to check/notify first order for buyer (second path):', {
            buyerId: order.buyerId,
            orderId: order.orderId,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

      try {
        const { invalidateDashboardCache } = await import('@/lib/queryCache');
        await invalidateDashboardCache(order.userId);
      } catch (error) {
        console.warn('[Mobile Orders] Failed to invalidate dashboard cache (second path):', {
          userId: order.userId,
          orderId: order.orderId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    if (usedOfferIds.length > 0) {
      await updateOfferStatusesBasedOnLimits(usedOfferIds);
    }

    try {
      await syncOrderToBuyerProfile((await prisma.order.findUnique({ where: { orderId: order.orderId } }))!.buyerId!, distributorUserId);
    } catch (err) {
      console.error('[mobileOrdersService] Failed to sync order to buyer profile:', err);
    }
  }

  const createdOrdersFull = await prisma.order.findMany({
    where: { orderId: { in: createdOrders.map((o) => o.orderId) } },
    include: { orderItemsRel: { include: { product: true } } },
  });
  if (createdOrders.length > 0) {
    enqueueSideEffect(
      'broadcastOrderUpdate(mobileOrders.multi)',
      async () => broadcastOrderUpdate(createdOrders.map((o) => o.orderId)),
      { retries: 2 },
    );
  }
  return NextResponse.json(
    { success: true, orders: createdOrdersFull, order: createdOrdersFull[0] },
    {
      status: 201,
      headers: { ...headers, 'Cache-Control': 'no-store, no-cache, must-revalidate, private' },
    },
  );
}

