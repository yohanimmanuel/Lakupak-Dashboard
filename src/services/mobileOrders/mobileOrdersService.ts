import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSecurityHeaders } from '@/utils/auth-security';
import { buildMobileBuyerId, syncOrderToBuyerProfile } from '@/utils/buyerSync';
import { NotificationService } from '@/app/api/graphql/modules/notifications';
import { validateOfferForProduct, trackOfferUsage as trackOfferUsageUtil, trackOfferUsageForAllTypes, updateOfferStatusesBasedOnLimits } from '@/utils/offerValidation';
import { calculateOrderItemPromotion } from '@/utils/promotionUtils';
import { validateVariant } from '@/services/variantService';
import { parsePrice } from '@/utils/currencyUtils';
import { broadcastOrderUpdate } from '@/utils/websocketBroadcast';
import { orderCreationRateLimiter, orderQueryRateLimiter } from '@/utils/rateLimiter';
import { computeTotalQtyNeededWithBuyXGetY, selectVariantOption } from '@/domain/marketplace/orderItemRules';
import { enqueueSideEffect } from '@/lib/sideEffectQueue';

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

  const baseBuyerId = buildMobileBuyerId(marketplaceUser.id);

  const orders = await prisma.order.findMany({
    where: { buyerId: { startsWith: baseBuyerId } },
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
    where: { buyerId: { startsWith: baseBuyerId } },
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

  return NextResponse.json(
    {
      orders: ordersWithItems,
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

  let body: any;
  try {
    body = await request.json();
  } catch (err) {
    console.error('[mobileOrdersService] Invalid JSON body:', err);
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400, headers });
  }
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

    const buyerPerDistributorId = buildMobileBuyerId(marketplaceUser.id, distributorUserIdFromClient);

    await prisma.buyer.upsert({
      where: { buyerId: buyerPerDistributorId },
      update: {
        owner: marketplaceUser.name || 'Mobile User',
        email: marketplaceUser.email || '',
        phone: marketplaceUser.phone || '',
        storeName: marketplaceUser.storeName || 'Mobile Store',
        address: marketplaceUser.chosenAddress || '',
        avatar: marketplaceUser.image || null,
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
    const orderData = {
      orderId: groupOrderId,
      buyerId: buyerPerDistributorId,
      buyerIdSnapshot: buyerPerDistributorId,
      orderDate: new Date(orderDate || new Date()),
      orderDateSnapshot: new Date(orderDate || new Date()),
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
      estimatedDeliveryMinDays: normalizedEstimatedMinDays,
      estimatedDeliveryMaxDays: normalizedEstimatedMaxDays,
      userId: distributorUserIdFromClient,
    };
    const order = await prisma.order.create({ data: orderData });

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

          let orderItemData = {
            orderId: order.orderId,
            productId: String(item.productId || ''),
            subtotal: parseFloat(String(item.subtotal || 0)),
            packageType: String(item.packageType || 'Box'),
            piecesPerPackage,
            packageQuantity,
            pricePerPackage: parseFloat(String(item.pricePerPackage || 0)),
            productNameSnapshot: String(item.productName || 'Unknown Product'),
            productSkuSnapshot: String(item.productSku || ''),
            productTypeSnapshot: String(item.category || 'Uncategorized'),
            variantId: null,
            variantOptionId: variantOption.id || null,
            variantNameSnapshot,
            offerApplied: false,
            offerBadgeSnapshot: null as string | null,
            offerNameSnapshot: null as string | null,
            originalPriceSnapshot: null as string | null,
            discountPercentage: null as number | null,
            discountAmount: null as number | null,
            promotionDetailsSnapshot: null as string | null,
            moqSnapshot: variantOption.moq || null,
          };

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
            orderItemData = {
              ...orderItemData,
              offerApplied: true,
              offerBadgeSnapshot: offerValidation.offerBadge || null,
              offerNameSnapshot: offerValidation.offerName || null,
              originalPriceSnapshot: offerValidation.originalPrice?.toString() || null,
              discountPercentage: offerValidation.discountPercentage || null,
              discountAmount: offerValidation.discountAmount || null,
              promotionDetailsSnapshot: offerValidation.promotionDetails
                ? JSON.stringify(offerValidation.promotionDetails)
                : null,
            };
          }

          return tx.orderItem.create({ data: orderItemData });
        });
        await Promise.all(orderItemPromises);
      });
      if (usedOfferIds.length > 0) {
        await updateOfferStatusesBasedOnLimits(usedOfferIds);
      }
    }

    try {
      await syncOrderToBuyerProfile(buyerPerDistributorId, distributorUserIdFromClient);
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

  // Validate items (variants + promo free qty + stock precheck) BEFORE creating any orders to avoid partial writes.
  // NOTE: Stock is also reserved/decremented atomically during order creation to prevent oversells (TOCTOU).
  if (Array.isArray(orderItems) && orderItems.length > 0) {
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

      const productOffers = await prisma.offer.findMany({
        where: {
          userId: product.userId ?? undefined,
          status: 'active',
          offerProducts: { some: { productId: product.productId } },
        },
        include: {
          offerDiscountTypes: { where: { isActive: true, discountType: 'buy_x_get_y' } },
        },
      });

      if (productOffers.length > 0) {
        const buyXGetYPromo = productOffers[0].offerDiscountTypes.find((dt) => dt.discountType === 'buy_x_get_y');

        if (buyXGetYPromo) {
          const promotionDetails = {
            minQuantity: buyXGetYPromo.minQuantity || 1,
            freeQuantity: buyXGetYPromo.discountValue
              ? parsePrice(
                  buyXGetYPromo.discountValue as
                    | string
                    | number
                    | { toNumber?: () => number; toString?: () => string }
                    | null
                    | undefined,
                )
              : 0,
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

    await prisma.buyer.upsert({
      where: { buyerId: buyerPerDistributorId },
      update: {
        owner: marketplaceUser.name || 'Mobile User',
        email: marketplaceUser.email || '',
        phone: marketplaceUser.phone || '',
        storeName: marketplaceUser.storeName || 'Mobile Store',
        address: marketplaceUser.chosenAddress || '',
        avatar: marketplaceUser.image || null,
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
    const orderData = {
      orderId: groupOrderId,
      buyerId: buyerPerDistributorId,
      buyerIdSnapshot: buyerPerDistributorId,
      orderDate: new Date(orderDate || new Date()),
      orderDateSnapshot: new Date(orderDate || new Date()),
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
      userId: distributorUserId,
    };

    const usedOfferIds: string[] = [];
    let order;
    try {
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

            const productOffers = await tx.offer.findMany({
              where: {
                userId: product.userId ?? undefined,
                status: 'active',
                offerProducts: { some: { productId: product.productId } },
              },
              include: {
                offerDiscountTypes: { where: { isActive: true, discountType: 'buy_x_get_y' } },
              },
            });

            if (productOffers.length > 0) {
              const buyXGetYPromo = productOffers[0].offerDiscountTypes.find(
                (dt) => dt.discountType === 'buy_x_get_y',
              );
              if (buyXGetYPromo) {
                const promotionDetails = {
                  minQuantity: buyXGetYPromo.minQuantity || 1,
                  freeQuantity: buyXGetYPromo.discountValue
                    ? parsePrice(
                        buyXGetYPromo.discountValue as
                          | string
                          | number
                          | { toNumber?: () => number; toString?: () => string }
                          | null
                          | undefined,
                      )
                    : 0,
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
            }

            // Atomically reserve/decrement stock to avoid TOCTOU oversells.
            const stockUpdate = await tx.variantOption.updateMany({
              where: {
                id: variantOption.id,
                stockQuantity: { gte: totalQtyNeeded },
              },
              data: {
                stockQuantity: { decrement: totalQtyNeeded },
              },
            });

            if (stockUpdate.count === 0) {
              const variantName = variantOption.attributes
                ? Object.entries(variantOption.attributes as Record<string, unknown>)
                    .map(([k, v]) => `${k}: ${String(v)}`)
                    .join(', ')
                : 'Default';
              const freeItems = totalQtyNeeded - orderedPieces;
              throw new Error(
                `Insufficient stock for ${product.name} (${variantName}). Required: ${totalQtyNeeded} pieces (${orderedPieces} ordered + ${freeItems} free)`,
              );
            }

            const totalQuantity = orderedPieces;
            const orderTotal = groupTotalAmount;
            const variantForValidation = {
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

            let orderItemData = {
              orderId: createdOrder.orderId,
              productId: String(item.productId || ''),
              subtotal: parseFloat(String(item.subtotal || 0)),
              packageType: String(item.packageType || 'Box'),
              piecesPerPackage,
              packageQuantity,
              pricePerPackage: parseFloat(String(item.pricePerPackage || 0)),
              productNameSnapshot: String(item.productName || 'Unknown Product'),
              productSkuSnapshot: String(item.productSku || ''),
              productTypeSnapshot: String(item.category || 'Uncategorized'),
              variantId: null,
              variantOptionId: variantOption.id || null,
              variantNameSnapshot,
              offerApplied: false,
              offerBadgeSnapshot: null as string | null,
              offerNameSnapshot: null as string | null,
              originalPriceSnapshot: null as string | null,
              discountPercentage: null as number | null,
              discountAmount: null as number | null,
              promotionDetailsSnapshot: null as string | null,
              moqSnapshot: variantOption.moq || null,
            };

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
              orderItemData = {
                ...orderItemData,
                offerApplied: true,
                offerBadgeSnapshot: offerValidation.offerBadge || null,
                offerNameSnapshot: offerValidation.offerName || null,
                originalPriceSnapshot: offerValidation.originalPrice?.toString() || null,
                discountPercentage: offerValidation.discountPercentage || null,
                discountAmount: offerValidation.discountAmount || null,
                promotionDetailsSnapshot: offerValidation.promotionDetails
                  ? JSON.stringify(offerValidation.promotionDetails)
                  : null,
              };
            }

            return tx.orderItem.create({ data: orderItemData });
          });

          await Promise.all(orderItemPromises);
        }

        return createdOrder;
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create order';
      return NextResponse.json({ error: message }, { status: 400, headers });
    }

    createdOrders.push({ orderId: order.orderId });

    if (order.userId) {
      try {
        await NotificationService.createOrderNotification(
          order.userId,
          order.orderId,
          'Pending',
          order.storeName || 'Unknown Store',
          groupTotalAmount,
        );
      } catch (_) {}

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

