import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import type { Prisma } from '@/lib/db';
import { getOrderSecurityHeaders } from '@/utils/order-security';
import { orderQueryRateLimiter } from '@/utils/rateLimiter';
import { decimalToNumber } from './utils';
import { syncOrderItemPricingFromCatalog } from './resolvePendingOrderItemPricing';

export async function getOrdersHandler(request: NextRequest) {
  const headers = getOrderSecurityHeaders();

  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    const archivedFlag = searchParams.get('archived');
    const userId = searchParams.get('userId');
    const checkExists = searchParams.get('checkExists');
    const orderIds = searchParams.get('orderIds');

    if (userId && !isNaN(Number(userId))) {
      const rateLimitResponse = await orderQueryRateLimiter(request, Number(userId));
      if (rateLimitResponse) return rateLimitResponse;
    }

    if (checkExists === 'true' && orderIds) {
      try {
        const orderIdArray = JSON.parse(orderIds);
        if (!Array.isArray(orderIdArray) || !orderIdArray.every((id) => typeof id === 'string')) {
          return NextResponse.json({ error: 'Invalid orderIds format' }, { status: 400, headers });
        }
        const existingOrders = await prisma.order.findMany({
          where: { orderId: { in: orderIdArray }, isDeleted: false },
          select: { orderId: true },
        });
        const existingOrderIds = existingOrders.map((order: { orderId: string }) => order.orderId);
        return NextResponse.json({ existingOrderIds }, { headers });
      } catch {
        return NextResponse.json({ error: 'Invalid orderIds format' }, { status: 400, headers });
      }
    }

    const userWhere: Prisma.OrderWhereInput =
      userId && !isNaN(Number(userId)) ? { userId: Number(userId) } : {};

    const orderDetailInclude = {
      buyer: true,
      user: { include: { company: true } },
      orderItemsRel: { include: { product: true } },
      orderFailedReasons: {
        orderBy: { createdAt: 'asc' },
        select: { id: true, reason: true, detail: true, imageUrls: true, createdAt: true },
      },
      returnRequests: {
        orderBy: { createdAt: 'asc' },
        select: { id: true, reason: true, reasonDetail: true, status: true, imageUrls: true, createdAt: true },
      },
    } satisfies Prisma.OrderInclude;

    if (id) {
      const includeDeleted = searchParams.get('includeDeleted') === 'true';
      const order = await prisma.order.findFirst({
        where: {
          orderId: id,
          ...userWhere,
          ...(includeDeleted ? {} : { isDeleted: false }),
        },
        include: orderDetailInclude,
      });

      if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404, headers });

      // Re-apply live Offers + catalog prices while PO is still Pending so offer
      // edits (e.g. Rp4.000 → Rp1.000) show on Order Detail. Confirmed+ stays frozen.
      if (order.userId && order.orderStatus === 'Pending') {
        try {
          await syncOrderItemPricingFromCatalog({
            orderId: order.orderId,
            userId: order.userId,
            buyerId: order.buyerId,
          });
        } catch (err) {
          console.error('[getOrders] syncOrderItemPricingFromCatalog failed', err);
        }
      }

      const refreshed = await prisma.order.findFirst({
        where: {
          orderId: id,
          ...userWhere,
          ...(includeDeleted ? {} : { isDeleted: false }),
        },
        include: orderDetailInclude,
      });
      const detailOrder = refreshed ?? order;

      const enrichedOrderItems = (detailOrder.orderItemsRel || []).map((oi) => ({
        id: oi.id,
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
        variantId: oi.variantId || null,
        variantOptionId: oi.variantOptionId || null,
        offerApplied: oi.offerApplied || false,
        offerBadgeSnapshot: oi.offerBadgeSnapshot || null,
        offerNameSnapshot: oi.offerNameSnapshot || null,
        originalPriceSnapshot: oi.originalPriceSnapshot
          ? typeof oi.originalPriceSnapshot === 'number'
            ? oi.originalPriceSnapshot
            : Number(oi.originalPriceSnapshot)
          : null,
        discountPercentage: oi.discountPercentage ? decimalToNumber(oi.discountPercentage) : null,
        discountAmount: oi.discountAmount ? decimalToNumber(oi.discountAmount) : null,
        promotionDetailsSnapshot: oi.promotionDetailsSnapshot || null,
      }));

      const company = detailOrder.user?.company;
      const num = (v: unknown) => (v != null && !Number.isNaN(Number(v)) ? Number(v) : null);
      let shippingOptionMinDays: number | null = null;
      let shippingOptionMaxDays: number | null = null;
      if (company) {
        shippingOptionMinDays = num(company.defaultDeliveryLeadTimeMinDays) ?? 3;
        shippingOptionMaxDays = num(company.defaultDeliveryLeadTimeMaxDays) ?? 7;
      }

      const orderResponse = {
        ...detailOrder,
        sellerUserId: detailOrder.userId,
        distributorUserId: detailOrder.userId,
        subtotal: decimalToNumber(detailOrder.subtotal),
        discounts: decimalToNumber(detailOrder.discounts),
        shippingFee: decimalToNumber(detailOrder.shippingFee),
        totalAmount: decimalToNumber(detailOrder.totalAmount),
        orderItems: enrichedOrderItems,
        shippingOptionMinDays: shippingOptionMinDays ?? null,
        shippingOptionMaxDays: shippingOptionMaxDays ?? null,
      };
      return NextResponse.json(orderResponse, { headers });
    }

    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '10');
    const status = searchParams.get('status');
    const buyerId = searchParams.get('buyerId');

    if (Number.isNaN(page) || Number.isNaN(limit) || page < 1 || limit < 1 || limit > 1000) {
      return NextResponse.json({ error: 'Invalid pagination parameters' }, { status: 400, headers });
    }

    const skip = (page - 1) * limit;
    const where: Prisma.OrderWhereInput = { ...userWhere };
    if (archivedFlag === '1' || archivedFlag === 'true') where.archivedAt = { not: null };
    else where.archivedAt = null;

    const includeDeleted = searchParams.get('includeDeleted') === 'true';
    if (!includeDeleted) where.isDeleted = false;

    if (status && status !== 'All') where.orderStatus = status;
    if (buyerId) where.buyerId = buyerId;

    const orderListInclude = {
      buyer: true,
      user: true,
      orderItemsRel: { include: { product: true } },
    } satisfies Prisma.OrderInclude;

    type OrderListRow = Prisma.OrderGetPayload<{ include: typeof orderListInclude }>;

    const [orders, total] = await Promise.all([
      prisma.order.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: orderListInclude,
      }),
      prisma.order.count({ where }),
    ]);

    const ordersWithParsedItems = orders.map((order: OrderListRow) => {
      const enrichedOrderItems = (order.orderItemsRel || []).map((oi) => ({
        id: oi.id,
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
        variantId: oi.variantId || null,
        variantOptionId: oi.variantOptionId || null,
        offerApplied: oi.offerApplied || false,
        offerBadgeSnapshot: oi.offerBadgeSnapshot || null,
        offerNameSnapshot: oi.offerNameSnapshot || null,
        originalPriceSnapshot: oi.originalPriceSnapshot
          ? typeof oi.originalPriceSnapshot === 'number'
            ? oi.originalPriceSnapshot
            : Number(oi.originalPriceSnapshot)
          : null,
        discountPercentage: oi.discountPercentage ? decimalToNumber(oi.discountPercentage) : null,
        discountAmount: oi.discountAmount ? decimalToNumber(oi.discountAmount) : null,
        promotionDetailsSnapshot: oi.promotionDetailsSnapshot || null,
      }));
      return {
        ...order,
        subtotal: decimalToNumber(order.subtotal),
        discounts: decimalToNumber(order.discounts),
        shippingFee: decimalToNumber(order.shippingFee),
        totalAmount: decimalToNumber(order.totalAmount),
        orderItems: enrichedOrderItems,
      };
    });

    return NextResponse.json(
      {
        orders: ordersWithParsedItems,
        pagination: { page, limit, total, pages: Math.ceil(total / limit) },
      },
      { headers },
    );
  } catch (error) {
    console.error('[getOrdersHandler] Failed to fetch orders:', error);
    return NextResponse.json({ error: 'Failed to fetch orders' }, { status: 500, headers });
  }
}

