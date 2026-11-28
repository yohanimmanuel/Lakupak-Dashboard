import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSecurityHeaders } from '@/utils/auth-security';
import { parseMarketplaceUserIdFromBuyerId } from '@/utils/buyerSync';
import { broadcastOrderUpdate, broadcastNotification } from '@/utils/websocketBroadcast';
import { getMarketplaceUserPushLanguage, sendExpoPushToMarketplaceUser } from '@/utils/expoPush';
import { translateMarketplaceReturnRequestSubmitted } from '@/utils/marketplacePushTranslations';
import { NotificationService } from '@/app/api/graphql/modules/notifications';
import { marketplaceReturnRequestRateLimiter } from '@/utils/rateLimiter';
import { auditOrder } from '@/lib/audit';
import { roundMoney } from '@/utils/priceAnchorUtils';
import { normalizeStockLevels } from '@/utils/stockUtils';

const decimalToNumber = (value: unknown): number => {
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
};

const VALID_REASONS = [
  'wrong_item',
  'defective',
  'not_as_described',
  'changed_mind',
  'late_delivery',
  'other',
];

function isProbablyHttpUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === 'https:' || u.protocol === 'http:';
  } catch {
    return false;
  }
}

/**
 * POST /api/mobile/orders/return-request
 * Body: {
 *   orderId, reason, reasonDetail?, imageUrls,
 *   items: [{ orderItemId, quantityReturned, packageType?, piecesPerPackage? }]
 * }
 * Buyers may return in any available product stock type (Pieces / Boxes / Cartons…).
 * Quantity is in the chosen unit; credit is proportional to ordered piece price.
 */
export async function POST(request: NextRequest) {
  const headers = getSecurityHeaders();

  try {
    const { getAuthenticatedMarketplaceUserId } = await import('@/utils/auth-helpers');
    const auth = await getAuthenticatedMarketplaceUserId(request);
    if (!auth.ok) {
      if (auth.reason === 'suspended') {
        return NextResponse.json({ error: 'Account suspended' }, { status: 403, headers });
      }
      return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401, headers });
    }
    const marketplaceUserId = auth.userId;

    const rateLimitResponse = await marketplaceReturnRequestRateLimiter(request, marketplaceUserId);
    if (rateLimitResponse) return rateLimitResponse;

    const body = await request.json().catch(() => ({}));
    const { orderId, reason, reasonDetail, imageUrls, items: rawItems } = body;

    if (!orderId || typeof orderId !== 'string' || !orderId.trim()) {
      return NextResponse.json({ error: 'Order ID is required' }, { status: 400, headers });
    }
    const safeOrderId = orderId.trim();
    if (safeOrderId.length > 64) {
      return NextResponse.json({ error: 'Order ID is too long' }, { status: 400, headers });
    }

    if (!reason || typeof reason !== 'string' || !VALID_REASONS.includes(reason)) {
      return NextResponse.json({ error: 'Valid reason is required' }, { status: 400, headers });
    }

    const order = await prisma.order.findUnique({
      where: { orderId: safeOrderId },
      include: {
        orderItemsRel: true,
        user: { select: { currency: true } },
      },
    });

    if (!order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404, headers });
    }

    const orderBuyerMarketplaceId = parseMarketplaceUserIdFromBuyerId(order.buyerId);
    if (orderBuyerMarketplaceId === null || orderBuyerMarketplaceId !== marketplaceUserId) {
      return NextResponse.json(
        { error: 'You can only request a return for your own orders' },
        { status: 403, headers },
      );
    }

    if (!['Delivered', 'Received', 'Returned'].includes(order.orderStatus)) {
      return NextResponse.json(
        { error: 'Return/refund is only available for delivered, received, or returned orders' },
        { status: 400, headers },
      );
    }

    const detailText =
      typeof reasonDetail === 'string' && reasonDetail.trim() ? reasonDetail.trim() : null;
    if (detailText && detailText.length > 1000) {
      return NextResponse.json({ error: 'reasonDetail is too long' }, { status: 400, headers });
    }

    let safeImageUrls: string[] = [];
    if (Array.isArray(imageUrls)) {
      safeImageUrls = imageUrls
        .filter((u) => typeof u === 'string')
        .map((u) => u.trim())
        .filter((u) => u.length > 0 && u.length <= 2048 && isProbablyHttpUrl(u))
        .slice(0, 5);
    }
    if (safeImageUrls.length === 0) {
      return NextResponse.json(
        { error: 'At least one evidence photo is required' },
        { status: 400, headers },
      );
    }

    if (!Array.isArray(rawItems) || rawItems.length === 0) {
      return NextResponse.json(
        { error: 'Select at least one product and quantity to return' },
        { status: 400, headers },
      );
    }

    const currency = order.user?.currency || 'IDR';
    const orderItemById = new Map(order.orderItemsRel.map((row) => [row.id, row]));
    const productIds = Array.from(
      new Set(
        order.orderItemsRel
          .map((row) => row.productId)
          .filter((id): id is string => typeof id === 'string' && id.trim().length > 0),
      ),
    );
    const products = productIds.length
      ? await prisma.product.findMany({
          where: { productId: { in: productIds } },
          select: { productId: true, stockLevels: true },
        })
      : [];
    const stockLevelsByProductId = new Map(
      products.map((product) => [product.productId, normalizeStockLevels(product.stockLevels)]),
    );

    const seenItemIds = new Set<number>();
    const lineCreates: Array<{
      orderItemId: number;
      productId: string | null;
      productNameSnapshot: string;
      variantNameSnapshot: string | null;
      productSkuSnapshot: string | null;
      packageType: string | null;
      piecesPerPackage: number;
      quantityReturned: number;
      unitPriceSnapshot: number;
      lineCreditAmount: number;
    }> = [];

    for (const raw of rawItems) {
      if (!raw || typeof raw !== 'object') {
        return NextResponse.json({ error: 'Invalid return item' }, { status: 400, headers });
      }
      const rawRecord = raw as {
        orderItemId?: unknown;
        quantityReturned?: unknown;
        packageType?: unknown;
        piecesPerPackage?: unknown;
      };
      const orderItemId = Number(rawRecord.orderItemId);
      const quantityReturned = Number(rawRecord.quantityReturned);
      if (!Number.isInteger(orderItemId) || orderItemId < 1) {
        return NextResponse.json({ error: 'Each return line needs a valid order item' }, { status: 400, headers });
      }
      if (seenItemIds.has(orderItemId)) {
        return NextResponse.json({ error: 'Duplicate return line for the same product' }, { status: 400, headers });
      }
      seenItemIds.add(orderItemId);
      const line = orderItemById.get(orderItemId);
      if (!line) {
        return NextResponse.json({ error: 'Return item is not part of this order' }, { status: 400, headers });
      }

      const orderedPpp = Math.max(1, Number(line.piecesPerPackage) || 1);
      const orderedQty = Math.max(1, Number(line.packageQuantity) || 1);
      const orderedPieces = orderedQty * orderedPpp;
      const orderedPackageType =
        (typeof line.packageType === 'string' && line.packageType.trim()) ||
        (orderedPpp === 1 ? 'Pieces' : 'Package');

      const configuredLevels = line.productId
        ? stockLevelsByProductId.get(line.productId) ?? normalizeStockLevels(null)
        : normalizeStockLevels(null);
      const allowedLevels = configuredLevels.map((level) => ({
        name: level.name,
        piecesPerUnit: level.piecesPerUnit,
      }));
      if (
        !allowedLevels.some(
          (level) =>
            level.name.toLocaleLowerCase() === orderedPackageType.toLocaleLowerCase() &&
            level.piecesPerUnit === orderedPpp,
        )
      ) {
        allowedLevels.push({ name: orderedPackageType, piecesPerUnit: orderedPpp });
      }

      const requestedType =
        typeof rawRecord.packageType === 'string' && rawRecord.packageType.trim()
          ? rawRecord.packageType.trim()
          : orderedPackageType;
      const requestedPppRaw = Number(rawRecord.piecesPerPackage);
      const hasRequestedPpp =
        Number.isFinite(requestedPppRaw) && Number.isInteger(requestedPppRaw) && requestedPppRaw >= 1;

      let selectedLevel =
        allowedLevels.find(
          (level) =>
            level.name.toLocaleLowerCase() === requestedType.toLocaleLowerCase() &&
            (!hasRequestedPpp || level.piecesPerUnit === requestedPppRaw),
        ) ?? null;
      if (!selectedLevel && !hasRequestedPpp) {
        selectedLevel =
          allowedLevels.find(
            (level) => level.name.toLocaleLowerCase() === requestedType.toLocaleLowerCase(),
          ) ?? null;
      }
      if (!selectedLevel) {
        return NextResponse.json(
          {
            error: `Stock type "${requestedType}" is not available for ${line.productNameSnapshot || 'product'}`,
          },
          { status: 400, headers },
        );
      }

      const returnPpp = selectedLevel.piecesPerUnit;
      const maxQty = Math.floor(orderedPieces / returnPpp);
      if (maxQty < 1) {
        return NextResponse.json(
          {
            error: `Cannot return ${line.productNameSnapshot || 'product'} in ${selectedLevel.name}`,
          },
          { status: 400, headers },
        );
      }
      if (!Number.isInteger(quantityReturned) || quantityReturned < 1 || quantityReturned > maxQty) {
        return NextResponse.json(
          {
            error: `Quantity returned for ${line.productNameSnapshot || 'product'} must be between 1 and ${maxQty} ${selectedLevel.name}`,
          },
          { status: 400, headers },
        );
      }

      const orderedPackagePrice = decimalToNumber(line.pricePerPackage);
      const pricePerPiece = orderedPpp > 0 ? orderedPackagePrice / orderedPpp : orderedPackagePrice;
      const unitPrice = roundMoney(pricePerPiece * returnPpp, currency);
      const lineCreditAmount = roundMoney(unitPrice * quantityReturned, currency);
      lineCreates.push({
        orderItemId: line.id,
        productId: line.productId ?? null,
        productNameSnapshot: line.productNameSnapshot || 'Unknown Product',
        variantNameSnapshot: line.variantNameSnapshot ?? null,
        productSkuSnapshot: line.productSkuSnapshot ?? null,
        packageType: selectedLevel.name,
        piecesPerPackage: returnPpp,
        quantityReturned,
        unitPriceSnapshot: unitPrice,
        lineCreditAmount,
      });
    }

    const creditAmount = roundMoney(
      lineCreates.reduce((sum, row) => sum + row.lineCreditAmount, 0),
      currency,
    );

    const created = await prisma.orderReturnRequest.create({
      data: {
        orderId: order.orderId,
        marketplaceUserId,
        reason,
        reasonDetail: detailText,
        imageUrls: safeImageUrls,
        status: 'Pending',
        creditAmount,
        items: {
          create: lineCreates.map((row) => ({
            orderItemId: row.orderItemId,
            productId: row.productId,
            productNameSnapshot: row.productNameSnapshot,
            variantNameSnapshot: row.variantNameSnapshot,
            productSkuSnapshot: row.productSkuSnapshot,
            packageType: row.packageType,
            piecesPerPackage: row.piecesPerPackage,
            quantityReturned: row.quantityReturned,
            unitPriceSnapshot: row.unitPriceSnapshot,
            lineCreditAmount: row.lineCreditAmount,
          })),
        },
      },
      include: { items: true },
    });

    try {
      await broadcastOrderUpdate([order.orderId]);
    } catch {
      // Ignore broadcast errors
    }

    if (order.userId) {
      try {
        const storeName = order.storeName ?? order.storeNameSnapshot ?? 'Unknown Store';
        await NotificationService.createOrderNotification(
          order.userId,
          order.orderId,
          'ReturnRequested',
          storeName,
          decimalToNumber(order.totalAmount),
        );
      } catch {
        // Don't fail the return request if notification fails
      }
    }

    try {
      const returnTranslations = translateMarketplaceReturnRequestSubmitted({ orderId: order.orderId });
      const payload = { orderId: order.orderId, orderStatus: order.orderStatus, type: 'order' };
      await sendExpoPushToMarketplaceUser(marketplaceUserId, returnTranslations, payload);
      const wsLang = await getMarketplaceUserPushLanguage(marketplaceUserId);
      const wsCopy = returnTranslations[wsLang];
      await broadcastNotification('order', wsCopy.title, wsCopy.body, payload, marketplaceUserId, 'marketplace');
    } catch {
      // Don't fail the return request if notification fails
    }

    auditOrder(request, {
      action: 'return_request',
      resourceId: order.orderId,
      actorId: marketplaceUserId,
      actorType: 'marketplace',
      metadata: { returnRequestId: created.id, reason, itemCount: lineCreates.length, creditAmount },
    });

    return NextResponse.json(
      {
        message: 'Return request submitted. We will process it and contact you if needed.',
        returnRequestId: created.id,
        creditAmount,
      },
      { status: 201, headers },
    );
  } catch (error) {
    console.error('[return-request] POST error', error);
    return NextResponse.json({ error: 'Failed to submit return request' }, { status: 500, headers });
  }
}
