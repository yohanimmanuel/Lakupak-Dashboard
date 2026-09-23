import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getOrderSecurityHeaders } from '@/utils/order-security';
import { getAuthenticatedUserId } from '@/utils/auth-helpers';
import { parsePrice } from '@/utils/currencyUtils';
import { broadcastOrderUpdate } from '@/utils/websocketBroadcast';

/**
 * POST /api/orders/set-item-price
 * Manually set a pending marketplace line item price and persist it as a
 * per-client Offer (fixed_price) for future auto-resolution.
 */
export async function POST(request: NextRequest) {
  const headers = getOrderSecurityHeaders();

  try {
    const authUserId = await getAuthenticatedUserId(request);
    if (authUserId == null) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers });
    }

    const body = (await request.json()) as {
      orderId?: string;
      orderItemId?: number;
      productId?: string;
      variantOptionId?: number | null;
      pricePerPackage?: number;
      userId?: number;
    };

    const orderId = String(body.orderId || '').trim();
    const orderItemId = Number(body.orderItemId);
    const pricePerPackage = Number(body.pricePerPackage);
    const userId = Number(body.userId ?? authUserId);

    if (!orderId || !Number.isFinite(orderItemId) || orderItemId < 1) {
      return NextResponse.json(
        { error: 'orderId and orderItemId are required' },
        { status: 400, headers },
      );
    }
    if (!Number.isFinite(pricePerPackage) || pricePerPackage <= 0) {
      return NextResponse.json(
        { error: 'pricePerPackage must be greater than 0' },
        { status: 400, headers },
      );
    }
    if (userId !== authUserId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403, headers });
    }

    const order = await prisma.order.findFirst({
      where: { orderId, userId, isDeleted: false },
      include: { orderItemsRel: true },
    });
    if (!order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404, headers });
    }
    if (order.orderStatus !== 'Pending') {
      return NextResponse.json(
        {
          error:
            'Prices can only be set while the order is Pending. Current status does not allow price changes.',
        },
        { status: 409, headers },
      );
    }

    const item = order.orderItemsRel.find((row) => row.id === orderItemId);
    if (!item || !item.productId) {
      return NextResponse.json({ error: 'Order item not found' }, { status: 404, headers });
    }

    const piecesPerPackage = Math.max(1, Number(item.piecesPerPackage) || 1);
    const packageQuantity = Math.max(1, Number(item.packageQuantity) || 1);
    const unitPrice = pricePerPackage / piecesPerPackage;
    const subtotal = pricePerPackage * packageQuantity;

    const product = await prisma.product.findFirst({
      where: { productId: item.productId, userId },
      include: { variantOptions: true },
    });
    if (!product) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404, headers });
    }

    const variantOption =
      (item.variantOptionId
        ? product.variantOptions.find((vo) => vo.id === item.variantOptionId)
        : null) ||
      product.variantOptions.find((vo) => vo.isDefault) ||
      product.variantOptions[0];

    const baseUnitPrice = variantOption
      ? parsePrice(
          variantOption.sellingPrice as
            | string
            | number
            | { toNumber?: () => number; toString?: () => string }
            | null
            | undefined,
        )
      : unitPrice;
    const discountAmount = Math.max(0, baseUnitPrice - unitPrice);
    const isBelowBase = unitPrice < baseUnitPrice;

    const buyerId = order.buyerId;
    if (!buyerId) {
      return NextResponse.json(
        { error: 'Order has no buyer — cannot save client rate' },
        { status: 400, headers },
      );
    }

    const NOT_PENDING = 'ORDER_NOT_PENDING';

    try {
      await prisma.$transaction(async (tx) => {
        // Serialize with concurrent status changes: lock row, then require Pending.
        await tx.$queryRaw`SELECT "id" FROM "Order" WHERE "id" = ${order.id} FOR UPDATE`;
        const locked = await tx.order.findFirst({
          where: { id: order.id, isDeleted: false },
          select: {
            id: true,
            orderStatus: true,
            shippingFee: true,
            discounts: true,
          },
        });
        if (!locked || locked.orderStatus !== 'Pending') {
          throw new Error(NOT_PENDING);
        }

        const variantOptionId = item.variantOptionId ?? null;
        const existingOffer = await tx.offer.findFirst({
          where: {
            userId,
            buyerId,
            productId: item.productId,
            variantOptionId,
            status: 'active',
          },
          orderBy: { updatedAt: 'desc' },
        });

        let savedOfferId: string;
        if (existingOffer) {
          const updated = await tx.offer.update({
            where: { id: existingOffer.id },
            data: {
              discountType: 'fixed_price',
              discountValue: unitPrice,
              buyQuantity: null,
              freeQuantity: null,
              notes: existingOffer.notes || 'Set from order pending price',
              status: 'active',
            },
            select: { id: true },
          });
          savedOfferId = updated.id;
        } else {
          const offerId = `OFF-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
          const created = await tx.offer.create({
            data: {
              offerId,
              userId,
              buyerId,
              productId: item.productId,
              variantOptionId,
              discountType: 'fixed_price',
              discountValue: unitPrice,
              startDate: new Date(),
              endDate: null,
              status: 'active',
              notes: 'Set from order pending price',
            },
            select: { id: true },
          });
          savedOfferId = created.id;
        }

        await tx.orderItem.update({
          where: { id: item.id },
          data: {
            pricePerPackage,
            subtotal,
            unitPriceSnapshot: unitPrice,
            offerApplied: true,
            offerBadgeSnapshot: isBelowBase ? 'Discount' : null,
            offerNameSnapshot: 'Manual client rate',
            offerIdSnapshot: savedOfferId,
            originalPriceSnapshot: String(baseUnitPrice),
            discountAmount: discountAmount > 0 ? discountAmount : null,
            discountPercentage: null,
            promotionDetailsSnapshot: null,
          },
        });

        const remaining = await tx.orderItem.findMany({
          where: { orderId: order.orderId },
          select: { subtotal: true, pricePerPackage: true, offerApplied: true },
        });
        const resolvedSubtotal = remaining.reduce((sum, row) => sum + Number(row.subtotal || 0), 0);
        const anyPending = remaining.some(
          (row) =>
            !(Number(row.subtotal) > 0) &&
            !(Number(row.pricePerPackage ?? 0) > 0) &&
            !row.offerApplied,
        );
        const shippingFee = Number(locked.shippingFee || 0);
        const discounts = Number(locked.discounts || 0);
        const totalAmount =
          resolvedSubtotal <= 0 && anyPending
            ? 0
            : Math.max(0, resolvedSubtotal + shippingFee - discounts);

        await tx.order.update({
          where: { id: locked.id },
          data: {
            subtotal: resolvedSubtotal,
            totalAmount,
          },
        });
      });
    } catch (txError) {
      if (txError instanceof Error && txError.message === NOT_PENDING) {
        return NextResponse.json(
          {
            error:
              'Prices can only be set while the order is Pending. Current status does not allow price changes.',
          },
          { status: 409, headers },
        );
      }
      throw txError;
    }

    try {
      await broadcastOrderUpdate([order.orderId]);
    } catch {
      // best-effort
    }

    return NextResponse.json({ success: true, orderId: order.orderId }, { status: 200, headers });
  } catch (error) {
    console.error('[set-item-price]', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to set item price' },
      { status: 500, headers },
    );
  }
}
