import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { Prisma } from '@/lib/prisma-generated';
import { OrderItem } from '@/types/order';
import {
  getOrderSecurityHeaders,
  validateOrderInput,
  sanitizeOrderData,
  generateSecureOrderId,
} from '@/utils/order-security';
import { ensureAllPriceConsistency } from '@/utils/orderUtils';
import { validateOfferForProduct, trackOfferUsage as trackOfferUsageUtil, trackOfferUsageForAllTypes, updateOfferStatusesBasedOnLimits } from '@/utils/offerValidation';
import { parsePrice } from '@/utils/currencyUtils';
import { syncOrderToBuyerProfile } from '@/utils/buyerSync';
import { broadcastOrderUpdate } from '@/utils/websocketBroadcast';
import { orderCreationRateLimiter } from '@/utils/rateLimiter';
import { NotificationService } from '@/app/api/graphql/modules/notifications';
import { decimalToNumber } from './utils';

export async function createOrderHandler(request: NextRequest) {
  const headers = getOrderSecurityHeaders();

  try {
    const body = await request.json();

    if (body.userId && !isNaN(Number(body.userId))) {
      const rateLimitResponse = await orderCreationRateLimiter(request, Number(body.userId));
      if (rateLimitResponse) {
        return rateLimitResponse;
      }
    }

    const validation = validateOrderInput(body);
    if (!validation.valid) {
      return NextResponse.json({ error: validation.error }, { status: 400, headers });
    }

    const sanitizedData = sanitizeOrderData(body);

    if (!sanitizedData.orderId) {
      sanitizedData.orderId = generateSecureOrderId();
    }

    let orderItems: Array<{
      productId: string;
      quantity: number;
      subtotal: number;
      packageType?: string;
      piecesPerPackage?: number;
      packageQuantity?: number;
      pricePerPackage?: number;
    }> = [];

    if (sanitizedData.orderItems) {
      if (typeof sanitizedData.orderItems === 'string') {
        try {
          orderItems = JSON.parse(sanitizedData.orderItems);
        } catch {
          orderItems = [];
        }
      } else if (Array.isArray(sanitizedData.orderItems)) {
        orderItems = sanitizedData.orderItems;
      }
    }

    const consistentOrderItems = await ensureAllPriceConsistency(orderItems as unknown as OrderItem[]);
    const subtotalCalc = consistentOrderItems.reduce((sum, it) => sum + Number(it.subtotal || 0), 0);
    const totalQtyCalc = consistentOrderItems.reduce((sum, it) => {
      const piecesPerPackage = it.piecesPerPackage || 1;
      const packageQuantity = it.packageQuantity || 1;
      return sum + packageQuantity * piecesPerPackage;
    }, 0);

    const parseCurrencyValue = (value: unknown): number => {
      if (typeof value === 'number') return value;
      if (typeof value === 'string') return parseFloat(value) || 0;
      return 0;
    };

    const shippingFee = parseCurrencyValue(sanitizedData.shippingFee);
    const discounts = parseCurrencyValue(sanitizedData.discounts);
    const totalAmountCalc = Math.max(0, subtotalCalc + shippingFee - discounts);

    if (discounts > subtotalCalc + shippingFee) {
      return NextResponse.json({ error: 'Discount cannot exceed order total' }, { status: 400, headers });
    }

    let distributorUserId: number | null = null;
    if (Array.isArray(consistentOrderItems) && consistentOrderItems.length > 0) {
      try {
        let firstProduct = await prisma.product.findFirst({
          where: { productId: String(consistentOrderItems[0].productId) },
        });

        if (!firstProduct && !isNaN(Number(consistentOrderItems[0].productId))) {
          firstProduct = await prisma.product.findFirst({
            where: { id: Number(consistentOrderItems[0].productId) },
          });
        }

        if (firstProduct && firstProduct.userId) {
          distributorUserId = firstProduct.userId;
        } else {
          throw new Error(`Product not found: ${consistentOrderItems[0].productId}. Cannot determine distributor userId.`);
        }
      } catch (productError) {
        throw new Error(
          `Failed to determine distributor userId: ${productError instanceof Error ? productError.message : String(productError)}`,
        );
      }
    } else {
      throw new Error('No order items provided - cannot determine distributor userId');
    }

    if (!distributorUserId) {
      throw new Error('Failed to determine distributor userId - this should not happen');
    }

    let isFirstOrder = false;
    if (sanitizedData.buyerId) {
      try {
        const existingOrderCount = await prisma.order.count({
          where: {
            userId: distributorUserId,
            buyerId: String(sanitizedData.buyerId),
            isDeleted: false,
          },
        });
        isFirstOrder = existingOrderCount === 0;
      } catch (err) {
        console.warn('Failed to upsert buyer:', err);
      }
    }

    if (sanitizedData.buyerId) {
      try {
        await prisma.buyer.upsert({
          where: { buyerId: String(sanitizedData.buyerId) },
          update: {
            owner: String(sanitizedData.contactPerson || 'Unknown'),
            email: String(sanitizedData.customerEmail || 'unknown@laku.com'),
            phone: String(sanitizedData.contactPhone || '0000000000'),
            storeName: String(sanitizedData.storeName || 'Unknown Store'),
            address: String(sanitizedData.deliveryAddress || 'Unknown Address'),
            userId: distributorUserId,
          },
          create: {
            buyerId: String(sanitizedData.buyerId || ''),
            owner: String(sanitizedData.contactPerson || 'Unknown'),
            email: String(sanitizedData.customerEmail || 'unknown@laku.com'),
            phone: String(sanitizedData.contactPhone || '0000000000'),
            storeName: String(sanitizedData.storeName || 'Unknown Store'),
            businessType: 'Retail',
            address: String(sanitizedData.deliveryAddress || 'Unknown Address'),
            status: 'Active',
            userId: distributorUserId,
          },
        });
      } catch {
        // Continue
      }
    }

    const parsedOrderDate = sanitizedData.orderDate ? new Date(String(sanitizedData.orderDate)) : new Date();
    if (Number.isNaN(parsedOrderDate.getTime())) {
      return NextResponse.json({ error: 'Invalid orderDate' }, { status: 400, headers });
    }

    const orderData = {
      orderId: String(sanitizedData.orderId),
      buyerId: String(sanitizedData.buyerId || ''),
      buyerIdSnapshot: String(sanitizedData.buyerId || ''),
      orderDate: parsedOrderDate,
      orderDateSnapshot: parsedOrderDate,
      orderStatus: String(sanitizedData.orderStatus || 'Pending'),
      paymentStatus: String(sanitizedData.paymentStatus || 'Unpaid'),
      deliveryMethod: String(sanitizedData.deliveryMethod || 'Seller/Distributor Delivery'),
      deliveryOption: sanitizedData.deliveryOption ? String(sanitizedData.deliveryOption) : null,
      subtotal: subtotalCalc,
      discounts,
      shippingFee,
      totalAmount: totalAmountCalc,
      paymentTerms: String(sanitizedData.paymentTerms || ''),
      totalOrders: totalQtyCalc,
      contactPerson: String(sanitizedData.contactPerson || ''),
      contactPersonSnapshot: String(sanitizedData.contactPerson || ''),
      storeName: String(sanitizedData.storeName || ''),
      storeNameSnapshot: String(sanitizedData.storeName || ''),
      contactPhone: String(sanitizedData.contactPhone || ''),
      contactPhoneSnapshot: String(sanitizedData.contactPhone || ''),
      customerEmail: sanitizedData.customerEmail ? String(sanitizedData.customerEmail) : null,
      customerEmailSnapshot: sanitizedData.customerEmail ? String(sanitizedData.customerEmail) : null,
      deliveryAddress: String(sanitizedData.deliveryAddress || ''),
      deliveryAddressSnapshot: String(sanitizedData.deliveryAddress || ''),
      preferredDeliveryDate: sanitizedData.preferredDeliveryDate ? new Date(String(sanitizedData.preferredDeliveryDate)) : null,
      preferredDeliveryTime: sanitizedData.preferredDeliveryTime ? String(sanitizedData.preferredDeliveryTime) : null,
      preferredPickupDate: sanitizedData.preferredPickupDate ? new Date(String(sanitizedData.preferredPickupDate)) : null,
      preferredPickupTime: sanitizedData.preferredPickupTime ? String(sanitizedData.preferredPickupTime) : null,
      assignedLogistics: sanitizedData.assignedLogistics ? String(sanitizedData.assignedLogistics) : null,
      trackingNumber: sanitizedData.trackingNumber ? String(sanitizedData.trackingNumber) : null,
      deliveryNote: sanitizedData.deliveryNote ? String(sanitizedData.deliveryNote) : null,
      deliveryConfirmation: sanitizedData.deliveryConfirmation ? String(sanitizedData.deliveryConfirmation) : 'pending',
      pod: sanitizedData.pod ? String(sanitizedData.pod) : null,
      acceptedBy: sanitizedData.acceptedBy
        ? String(sanitizedData.acceptedBy)
        : String(sanitizedData.orderStatus || 'Pending') === 'Confirmed'
          ? 'Admin'
          : null,
      acceptedAt: sanitizedData.acceptedAt
        ? new Date(String(sanitizedData.acceptedAt))
        : String(sanitizedData.orderStatus || 'Pending') === 'Confirmed'
          ? new Date()
          : null,
      userId: distributorUserId || (typeof sanitizedData.userId === 'number' ? sanitizedData.userId : null),
    };

    const createdOrderInclude = {
      buyer: true,
      user: true,
      orderItemsRel: { include: { product: true } },
    } satisfies Prisma.OrderInclude;

    type CreatedOrder = Prisma.OrderGetPayload<{ include: typeof createdOrderInclude }>;

    const order: CreatedOrder = await prisma.order.create({
      data: orderData,
      include: createdOrderInclude,
    });

    if (Array.isArray(consistentOrderItems) && consistentOrderItems.length > 0) {
      try {
        const usedOfferIds: string[] = [];

        await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
          const sellerCurrency =
            distributorUserId && !Number.isNaN(Number(distributorUserId))
              ? (
                  await tx.user.findUnique({
                    where: { id: Number(distributorUserId) },
                    select: { currency: true },
                  })
                )?.currency ?? 'IDR'
              : 'IDR';

          const orderItemPromises = consistentOrderItems.map(async (item: OrderItem) => {
            const product = await tx.product.findFirst({
              where: { productId: String(item.productId) },
              include: { variantOptions: true, variants: true },
            });

            if (!product) {
              throw new Error(`Product not found: ${item.productId}`);
            }

            let selectedVariant = item.variantId
              ? product.variantOptions.find((v: { id: number }) => v.id === item.variantId) || null
              : null;
            if (!selectedVariant) {
              selectedVariant = product.variantOptions[0] || null;
            }
            if (!selectedVariant) {
              throw new Error(`No variants found for product: ${item.productId}`);
            }

            const packageQuantity = item.packageQuantity || 1;
            const piecesPerPackageForMOQ = item.piecesPerPackage || 1;
            const totalPieces = packageQuantity * piecesPerPackageForMOQ;

            const variantSellingPrice = (selectedVariant as { sellingPrice?: number | string | unknown }).sellingPrice;
            if (variantSellingPrice === null || variantSellingPrice === undefined) {
              throw new Error(`No variants with pricing found for product: ${item.productId}`);
            }

            const variantMOQ = (selectedVariant as { moq?: number }).moq;
            if (variantMOQ && totalPieces < variantMOQ) {
              throw new Error(`Minimum order quantity is ${variantMOQ} pieces. You ordered ${totalPieces} pieces.`);
            }

            const consistentUnitPrice =
              typeof variantSellingPrice === 'number' ? variantSellingPrice : parsePrice(String(variantSellingPrice));

            const piecesPerPackage = item.piecesPerPackage || 1;
            const packageType = item.packageType || 'Piece';
            const pricePerPackage = consistentUnitPrice * piecesPerPackage;
            const consistentSubtotal = packageQuantity * pricePerPackage;

            const offerValidation = await validateOfferForProduct(
              product.productId,
              null,
              totalAmountCalc,
              packageQuantity * piecesPerPackage,
              tx,
              packageQuantity,
              {
                sellingPrice: decimalToNumber((selectedVariant as { sellingPrice?: unknown }).sellingPrice),
                moq: (selectedVariant as { moq?: number }).moq,
              },
            );

            let variantNameSnapshot: string | null = null;
            if ((selectedVariant as { attributes?: unknown }).attributes) {
              const attributes = (selectedVariant as { attributes: Record<string, string> }).attributes;
              variantNameSnapshot = Object.entries(attributes)
                .map(([key, value]) => `${key}: ${value}`)
                .join(', ');
            }

            let orderItemData: Prisma.OrderItemUncheckedCreateInput = {
              orderId: sanitizedData.orderId as string,
              productId: item.productId as string,
              subtotal: consistentSubtotal,
              packageType,
              piecesPerPackage,
              packageQuantity: item.packageQuantity || 1,
              pricePerPackage: item.pricePerPackage || pricePerPackage,
              productNameSnapshot: product.name,
              productSkuSnapshot: product.sku,
              productTypeSnapshot: product.productType,
              productImageSnapshot: Array.isArray(product.images) && product.images.length > 0 ? product.images[0] : null,
              variantId: item.variantId || null,
              variantOptionId: (selectedVariant as { id?: number }).id || null,
              variantNameSnapshot,
              variantAttributesSnapshot:
                (selectedVariant as { attributes?: unknown }).attributes &&
                typeof (selectedVariant as { attributes?: unknown }).attributes === 'object'
                  ? ((selectedVariant as { attributes?: unknown }).attributes as Prisma.InputJsonValue)
                  : undefined,
              unitPriceSnapshot: consistentUnitPrice,
              currencySnapshot: sellerCurrency,
              offerApplied: false,
              offerBadgeSnapshot: null,
              offerNameSnapshot: null,
              originalPriceSnapshot: null,
              discountPercentage: null,
              discountAmount: null,
              promotionDetailsSnapshot: null,
            };

            if (offerValidation.isValid && offerValidation.offerId) {
              if (!usedOfferIds.includes(offerValidation.offerId)) {
                usedOfferIds.push(offerValidation.offerId);
              }

              if (offerValidation.applicableDiscountTypes && offerValidation.applicableDiscountTypes.length > 0) {
                await trackOfferUsageForAllTypes(offerValidation.offerId, offerValidation.applicableDiscountTypes, null, tx);
              } else if (offerValidation.discountTypeId) {
                await trackOfferUsageUtil(
                  offerValidation.offerId,
                  offerValidation.discountTypeId,
                  null,
                  offerValidation.discountAmount || 0,
                  tx,
                );
              }

              orderItemData = {
                ...orderItemData,
                offerApplied: true,
                offerBadgeSnapshot: offerValidation.offerBadge || null,
                offerNameSnapshot: offerValidation.offerName || null,
                originalPriceSnapshot: offerValidation.originalPrice ? Number(offerValidation.originalPrice) : null,
                discountPercentage: offerValidation.discountPercentage || null,
                discountAmount: offerValidation.discountAmount || null,
                promotionDetailsSnapshot: offerValidation.promotionDetails ? JSON.stringify(offerValidation.promotionDetails) : null,
              };
            }

            return tx.orderItem.create({ data: orderItemData });
          });

          await Promise.all(orderItemPromises);
        });

        if (usedOfferIds.length > 0) {
          await updateOfferStatusesBasedOnLimits(usedOfferIds);
        }
      } catch (err) {
        try {
          await prisma.order.delete({ where: { id: order.id } });
        } catch {
          // ignore rollback errors
        }
        throw err;
      }
    }

    const enrichedOrderItems = (order.orderItemsRel || []).map((oi) => ({
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
      offerApplied: oi.offerApplied || false,
      offerBadgeSnapshot: oi.offerBadgeSnapshot || null,
      offerNameSnapshot: oi.offerNameSnapshot || null,
      originalPriceSnapshot: oi.originalPriceSnapshot || null,
      discountPercentage: oi.discountPercentage || null,
      promotionDetailsSnapshot: oi.promotionDetailsSnapshot || null,
    }));

    if (order.buyerId) {
      try {
        await syncOrderToBuyerProfile(order.buyerId, sanitizedData.userId as number);
      } catch {
        // ignore
      }
    }

    try {
      await broadcastOrderUpdate([order.orderId]);
    } catch {
      // ignore
    }

    if (order.userId) {
      try {
        await NotificationService.createOrderNotification(
          order.userId,
          order.orderId,
          'Pending',
          order.storeName || 'Unknown Store',
          decimalToNumber(order.totalAmount),
        );
      } catch {
        // ignore
      }

      if (order.buyerId && isFirstOrder) {
        try {
          await NotificationService.createNewBuyerNotification(
            order.userId,
            order.buyerId,
            order.storeName || 'Unknown Store',
            true,
          );
        } catch {
          // ignore
        }
      }
    }

    const orderResponse = {
      ...order,
      subtotal: decimalToNumber(order.subtotal),
      discounts: decimalToNumber(order.discounts),
      shippingFee: decimalToNumber(order.shippingFee),
      totalAmount: decimalToNumber(order.totalAmount),
      orderItems: enrichedOrderItems,
    };

    if (order.userId) {
      try {
        const { invalidateDashboardCache } = await import('@/lib/queryCache');
        await invalidateDashboardCache(order.userId);
      } catch {
        // ignore
      }
    }

    return NextResponse.json(orderResponse, { status: 201, headers });
  } catch (err) {
    console.error('Order creation failed:', err);
    return NextResponse.json({ error: 'Failed to create order' }, { status: 500, headers });
  }
}

