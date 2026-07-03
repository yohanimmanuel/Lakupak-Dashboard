import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { Prisma } from '@/lib/prisma-generated';
import { getOrderSecurityHeaders, validateOrderUpdate, sanitizeOrderData } from '@/utils/order-security';
import { ensureAllPriceConsistency } from '@/utils/orderUtils';
import { parsePrice } from '@/utils/currencyUtils';
import { parseMarketplaceUserIdFromBuyerId } from '@/utils/buyerSync';
import { orderUpdateRateLimiter } from '@/utils/rateLimiter';
import { auditOrder } from '@/lib/audit';
import { decimalToNumber, calculateTotalQuantityWithPromotions } from './utils';
import { getUnitPriceFromVariantOption, selectVariantOption } from '@/domain/marketplace/orderItemRules';
import {
  enqueueBroadcastOrderUpdates,
  scheduleOrderCancelPostCommitEffects,
  scheduleOrderUpdatePostCommitEffects,
  scheduleReturnRequestRejectedNotification,
  scheduleReturnItemsReceivedNotification,
} from './enqueueOrderUpdateSideEffects';

// Move-only extraction of PUT handler from `ordersRouteService.ts`.
export async function updateOrderHandler(request: NextRequest) {
  const headers = getOrderSecurityHeaders();
  
  try {
    const body = await request.json();

    // Authenticate the caller (dashboard NextAuth session or JWT). Platform admins
    // are resolved separately so they may act across tenants.
    const { getAuthenticatedUserId } = await import('@/utils/auth-helpers');
    const authenticatedUserId = await getAuthenticatedUserId(request);
    let isPlatformAdmin = false;
    try {
      const { requirePlatformAdminId } = await import('@/utils/platform-admin-auth');
      requirePlatformAdminId(request);
      isPlatformAdmin = true;
    } catch {
      // Not a platform admin; fall back to user-scoped authorization.
    }

    // Apply rate limiting for order updates on the authenticated identity.
    const userIdForRateLimit = authenticatedUserId ?? null;
    const rateLimitResponse = await orderUpdateRateLimiter(request, userIdForRateLimit);
    if (rateLimitResponse) {
      return rateLimitResponse;
    }

    if (!authenticatedUserId && !isPlatformAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers });
    }

    // Never trust a client-supplied userId for ownership scoping. Non-admins are
    // always constrained to their own account; platform admins may act cross-tenant.
    if (!isPlatformAdmin && authenticatedUserId) {
      body.userId = authenticatedUserId;
    }
    // Owner id every operation must be scoped to (null = unrestricted platform admin).
    const ownerScopeUserId: number | null = isPlatformAdmin ? null : (authenticatedUserId ?? null);

    // Bulk archive support
    if (Array.isArray(body.archiveOrderIds) && body.archiveOrderIds.length > 0) {
      const baseWhere: Record<string, unknown> = {};
      if (body.userId && !isNaN(Number(body.userId))) baseWhere.userId = Number(body.userId);
      const updated = await prisma.order.updateMany({
        where: { ...baseWhere, orderId: { in: body.archiveOrderIds.map((v: unknown) => String(v)) } },
        data: { archivedAt: new Date() }
      });
      enqueueBroadcastOrderUpdates('archive-bulk', body.archiveOrderIds.map((v: unknown) => String(v)));
      auditOrder(request, {
        action: 'archive',
        actorId: userIdForRateLimit,
        actorType: 'dashboard',
        metadata: { bulk: true, count: updated.count },
      });
      return NextResponse.json({ success: true, count: updated.count }, { headers });
    }

    if (body.archive === true && (body.orderId || body.id)) {
      const where: Record<string, unknown> = {};
      if (body.userId && !isNaN(Number(body.userId))) where.userId = Number(body.userId);
      if (body.orderId) where.orderId = String(body.orderId);
      else if (body.id) where.id = Number(body.id);

      const archiveBroadcastIds: string[] = [];
      if (body.orderId) {
        archiveBroadcastIds.push(String(body.orderId));
      } else if (body.id) {
        const existing = await prisma.order.findUnique({
          where: { id: Number(body.id) },
          select: { orderId: true }
        });
        if (existing?.orderId) {
          archiveBroadcastIds.push(existing.orderId);
        }
      }

      const result = await prisma.order.updateMany({
        where,
        data: { archivedAt: new Date() }
      });
      if (result.count === 0) {
        return NextResponse.json({ error: 'Order not found' }, { status: 404, headers });
      }
      if (archiveBroadcastIds.length > 0) {
        enqueueBroadcastOrderUpdates('archive', archiveBroadcastIds);
      }
      auditOrder(request, {
        action: 'archive',
        resourceId: archiveBroadcastIds[0],
        actorId: userIdForRateLimit,
        actorType: 'dashboard',
      });
      return NextResponse.json({ success: true }, { headers });
    }

    if ((body.unarchive === true || body.archive === false) && (body.orderId || body.id)) {
      const where: Record<string, unknown> = {};
      if (body.userId && !isNaN(Number(body.userId))) where.userId = Number(body.userId);
      if (body.orderId) where.orderId = String(body.orderId);
      else if (body.id) where.id = Number(body.id);

      const unarchiveBroadcastIds: string[] = [];
      if (body.orderId) {
        unarchiveBroadcastIds.push(String(body.orderId));
      } else if (body.id) {
        const existing = await prisma.order.findUnique({
          where: { id: Number(body.id) },
          select: { orderId: true }
        });
        if (existing?.orderId) {
          unarchiveBroadcastIds.push(existing.orderId);
        }
      }

      const result = await prisma.order.updateMany({
        where,
        data: { archivedAt: null }
      });
      if (result.count === 0) {
        return NextResponse.json({ error: 'Order not found' }, { status: 404, headers });
      }
      if (unarchiveBroadcastIds.length > 0) {
        enqueueBroadcastOrderUpdates('unarchive', unarchiveBroadcastIds);
      }
      auditOrder(request, {
        action: 'unarchive',
        resourceId: unarchiveBroadcastIds[0],
        actorId: userIdForRateLimit,
        actorType: 'dashboard',
      });
      return NextResponse.json({ success: true }, { headers });
    }

    // Accept / Reject return request from dashboard
    if (body.returnRequestId && body.returnRequestStatus) {
      const localHeaders = getOrderSecurityHeaders();
      const id = Number(body.returnRequestId);
      const status = String(body.returnRequestStatus);
      if (!Number.isInteger(id) || id < 1) {
        return NextResponse.json({ error: 'Invalid returnRequestId' }, { status: 400, headers: localHeaders });
      }
      if (!['Accepted', 'Rejected'].includes(status)) {
        return NextResponse.json({ error: 'Invalid returnRequestStatus' }, { status: 400, headers: localHeaders });
      }

      try {
        // Verify ownership: the caller must own the order linked to this return request
        const existingReturnRequest = await prisma.orderReturnRequest.findUnique({
          where: { id },
          include: { order: true },
        });

        if (!existingReturnRequest) {
          return NextResponse.json({ error: 'Return request not found' }, { status: 404, headers: localHeaders });
        }

        if (
          body.userId &&
          existingReturnRequest.order.userId &&
          existingReturnRequest.order.userId !== Number(body.userId)
        ) {
          return NextResponse.json({ error: 'Forbidden: you do not own this order' }, { status: 403, headers: localHeaders });
        }

        const rr = await prisma.orderReturnRequest.update({
          where: { id },
          data: { status },
        });

        auditOrder(request, {
          action: 'return_decision',
          resourceId: rr.orderId,
          actorId: body.userId && !isNaN(Number(body.userId)) ? Number(body.userId) : null,
          actorType: 'dashboard',
          metadata: { returnRequestId: id, decision: status },
        });

        // Delegate order state change to the unified orderStatus flow below
        body.orderId = rr.orderId;
        body.returnStatus = status;
        if (status === 'Accepted') {
          body.orderStatus = 'Returned';
          body.returnedAt = new Date().toISOString();
          body.returnReason = rr.reason ?? null;
          body.returnReasonDetail = rr.reasonDetail ?? null;
        }

        // Rejection does not change Order.orderStatus, so the buyer push block below never runs.
        // Notify the marketplace buyer explicitly (Expo + WebSocket), same pattern as POST /return-request.
        if (status === 'Rejected') {
          const marketplaceUserId = existingReturnRequest.marketplaceUserId;
          if (marketplaceUserId != null) {
            scheduleReturnRequestRejectedNotification({
              marketplaceUserId,
              orderId: existingReturnRequest.order.orderId,
              orderStatus: existingReturnRequest.order.orderStatus,
            });
          }
        }
      } catch (e) {
        return NextResponse.json({ error: 'Failed to update return request status' }, { status: 500, headers: localHeaders });
      }
    }

    // Distributor confirms physical receipt of returned items
    if (body.confirmReturnItemsReceived === true) {
      const localHeaders = getOrderSecurityHeaders();
      const orderId = typeof body.orderId === 'string' ? body.orderId.trim() : '';
      if (!orderId) {
        return NextResponse.json({ error: 'Missing orderId' }, { status: 400, headers: localHeaders });
      }

      try {
        const existing = await prisma.order.findUnique({
          where: { orderId },
          include: { returnRequests: true },
        });

        if (!existing) {
          return NextResponse.json({ error: 'Order not found' }, { status: 404, headers: localHeaders });
        }

        if (
          body.userId &&
          existing.userId &&
          existing.userId !== Number(body.userId)
        ) {
          return NextResponse.json({ error: 'Forbidden: you do not own this order' }, { status: 403, headers: localHeaders });
        }

        if (existing.orderStatus !== 'Returned') {
          return NextResponse.json({ error: 'Order is not in Returned status' }, { status: 400, headers: localHeaders });
        }

        const hasAcceptedReturn =
          existing.returnStatus === 'Accepted' ||
          (existing.returnRequests ?? []).some((rr) => rr.status === 'Accepted');
        if (!hasAcceptedReturn) {
          return NextResponse.json({ error: 'No accepted return request for this order' }, { status: 400, headers: localHeaders });
        }

        const confirmedAt = new Date();
        const result = await prisma.order.updateMany({
          where: {
            orderId,
            returnItemsReceivedAt: null,
            orderStatus: 'Returned',
            ...(existing.fleetId ? { returnCollectedAt: { not: null } } : {}),
          },
          data: { returnItemsReceivedAt: confirmedAt },
        });
        if (result.count === 0) {
          const current = await prisma.order.findUnique({
            where: { orderId },
            select: {
              orderStatus: true,
              returnItemsReceivedAt: true,
              fleetId: true,
              returnCollectedAt: true,
            },
          });
          if (!current || current.orderStatus !== 'Returned') {
            return NextResponse.json(
              { error: 'Order is not in Returned status' },
              { status: 400, headers: localHeaders },
            );
          }
          if (current.fleetId && !current.returnCollectedAt) {
            return NextResponse.json(
              { error: 'Driver has not collected return items yet' },
              { status: 400, headers: localHeaders },
            );
          }
          return NextResponse.json(
            { error: 'Return items already confirmed received' },
            { status: 400, headers: localHeaders },
          );
        }
        const updated = await prisma.order.findUniqueOrThrow({
          where: { orderId },
        });

        const marketplaceUserId = parseMarketplaceUserIdFromBuyerId(updated.buyerId);
        if (marketplaceUserId != null) {
          scheduleReturnItemsReceivedNotification({
            marketplaceUserId,
            orderId: updated.orderId,
            orderStatus: String(updated.orderStatus),
          });
        }

        enqueueBroadcastOrderUpdates('order-update', [updated.orderId]);

        auditOrder(request, {
          action: 'return_items_received',
          resourceId: updated.orderId,
          actorId: userIdForRateLimit,
          actorType: 'dashboard',
          metadata: existing.userId != null ? { targetUserId: existing.userId } : undefined,
        });

        return NextResponse.json(
          {
            success: true,
            order: {
              orderId: updated.orderId,
              returnItemsReceivedAt: updated.returnItemsReceivedAt?.toISOString() ?? null,
            },
          },
          { headers: localHeaders },
        );
      } catch {
        return NextResponse.json({ error: 'Failed to confirm return items received' }, { status: 500, headers: localHeaders });
      }
    }

    // Cancel order functionality
    if (body.cancel === true && (body.orderId || body.id)) {
      // Find the order first
      let whereClause: { orderId: string } | { id: number };
      if (body.orderId) {
        whereClause = { orderId: String(body.orderId).trim() };
      } else if (body.id) {
        whereClause = { id: Number(body.id) };
      } else {
        return NextResponse.json({ error: 'No orderId or id provided' }, { status: 400, headers });
      }

      // Check if order exists and is cancellable
      const existingOrder = await prisma.order.findFirst({
        where: whereClause
      });

      if (!existingOrder) {
        return NextResponse.json({ error: 'Order not found' }, { status: 404, headers });
      }

      if (ownerScopeUserId != null && existingOrder.userId !== ownerScopeUserId) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403, headers });
      }

      // Check if order can be cancelled (only Pending or Confirmed orders)
      const cancellableStatuses = ['Pending', 'Confirmed'];
      if (!cancellableStatuses.includes(existingOrder.orderStatus)) {
        return NextResponse.json({ 
          error: `Order cannot be cancelled. Current status: ${existingOrder.orderStatus}` 
        }, { status: 400, headers });
      }

      const cancelledAt = new Date();
      const cancellationReasonText = body.reason || body.cancellationReason || 'User requested cancellation';
      const updateData = {
        orderStatus: 'Cancelled',
        cancelledAt,
        cancelledBy: body.cancelledBy || body.userId?.toString() || 'User',
        cancellationReason: cancellationReasonText
      };

      const validCancellationReasonCodes = [
        'changed_mind', 'found_cheaper', 'wrong_item', 'delivery_issues',
        'payment_issues', 'seller_issues', 'other'
      ];
      const reasonCode = typeof body.reasonCode === 'string' && validCancellationReasonCodes.includes(body.reasonCode)
        ? body.reasonCode
        : 'other';
      const reasonDetail = typeof body.reasonDetail === 'string' && body.reasonDetail.trim()
        ? body.reasonDetail.trim()
        : null;

      try {
        const updatedOrder = await prisma.order.update({
          where: whereClause,
          data: updateData
        });

        // Persist structured cancel data (marketplace buyer id from order's buyerId)
        const marketplaceUserId = parseMarketplaceUserIdFromBuyerId(updatedOrder.buyerId);
        if (marketplaceUserId != null && Number.isInteger(marketplaceUserId) && marketplaceUserId > 0) {
          try {
            await prisma.orderCancellation.create({
              data: {
                orderId: updatedOrder.orderId,
                marketplaceUserId,
                reason: reasonCode,
                reasonDetail,
                cancelledAt
              }
            });
          } catch (createErr) {
            // Don't fail the cancel if cancellation record fails (e.g. schema not migrated yet)
          }
        }
        
        scheduleOrderCancelPostCommitEffects(updatedOrder, body.userId ? Number(body.userId) : undefined);

        auditOrder(request, {
          action: 'cancel',
          resourceId: updatedOrder.orderId,
          actorId: body.userId && !isNaN(Number(body.userId)) ? Number(body.userId) : null,
          actorType: 'dashboard',
          metadata: { reasonCode, cancelledBy: updateData.cancelledBy },
        });

        return NextResponse.json({ 
          success: true, 
          message: 'Order cancelled successfully',
          order: {
            orderId: updatedOrder.orderId,
            orderStatus: updatedOrder.orderStatus,
            cancelledAt: updatedOrder.cancelledAt
          }
        }, { headers });
      } catch (e) {
        return NextResponse.json({ error: 'Failed to cancel order' }, { status: 500, headers });
      }
    }

    // Skip orderId requirement for archive/unarchive/cancel operations
    if (!body.orderId && !body.archive && !body.unarchive && !body.cancel && !Array.isArray(body.archiveOrderIds)) {
      return NextResponse.json(
        { error: 'Missing orderId' },
        { status: 400, headers }
      );
    }
    
    // Skip validation for archive/unarchive/cancel operations  
    if (!body.archive && !body.unarchive && !body.cancel && !Array.isArray(body.archiveOrderIds)) {
      // Validate update data
      const validation = validateOrderUpdate(body);
      if (!validation.valid) {
        return NextResponse.json(
          { error: validation.error },
          { status: 400, headers }
        );
      }
    }
    
    // Sanitize update data
    const sanitizedData = sanitizeOrderData(body);
    
    // Recalculate entire order if orderItems are provided
    let recalculatedData = { ...sanitizedData };
    const parsedOrderItems: unknown =
      typeof (sanitizedData as { orderItems?: unknown }).orderItems === 'string'
        ? (() => {
            try {
              return JSON.parse(String((sanitizedData as { orderItems: string }).orderItems));
            } catch {
              return null;
            }
          })()
        : (sanitizedData as { orderItems?: unknown }).orderItems;

    if (Array.isArray(parsedOrderItems)) {
      const orderItems = parsedOrderItems;
      const consistentOrderItems = await ensureAllPriceConsistency(orderItems);
      const subtotalCalc = consistentOrderItems.reduce((sum, it) => sum + Number(it.subtotal || 0), 0);
      const totalQtyCalc = consistentOrderItems.reduce((sum, it) => {
        const piecesPerPackage = it.piecesPerPackage || 1;
        const packageQuantity = it.packageQuantity || 1;
        return sum + (packageQuantity * piecesPerPackage);
      }, 0);
      recalculatedData = {
        ...sanitizedData,
        subtotal: subtotalCalc,
        totalAmount: subtotalCalc + Number(sanitizedData.shippingFee || 0) - Number(sanitizedData.discounts || 0),
        totalOrders: totalQtyCalc,
      };
    }
    
    const updateData: Record<string, unknown> = recalculatedData;
    // Some Prisma client builds (and older generated artifacts) don't allow writing relation scalar FKs
    // directly (e.g. `userId`). Prefer relation updates for compatibility.
    if (typeof (sanitizedData as { userId?: unknown }).userId === 'number') {
      updateData.user = { connect: { id: (sanitizedData as { userId: number }).userId } };
    }
    if ('userId' in updateData) {
      delete (updateData as { userId?: unknown }).userId;
    }
    // `Order` doesn't have an `orderItems` scalar field in the current Prisma schema.
    // Order items are stored in `OrderItem` rows (`orderItemsRel`) and updated below.
    if ('orderItems' in updateData) {
      delete (updateData as { orderItems?: unknown }).orderItems;
    }
    if (sanitizedData.orderDate) {
      updateData.orderDate = new Date(String(sanitizedData.orderDate));
    }
    if (sanitizedData.acceptedAt) {
      updateData.acceptedAt = new Date(String(sanitizedData.acceptedAt));
    }

    const stockNotificationJobs: Array<{
      userId: number;
      productId: string;
      productName: string;
      previousStock: number;
      newStock: number;
      lowStockThreshold: number;
      variantName?: string;
    }> = [];

    let previousPaymentStatus: string | null = null;
    let previousOrderStatus: string | null = null;

    // Enforce ownership before mutating: non-admins may only update their own orders.
    if (ownerScopeUserId != null && typeof sanitizedData.orderId === 'string') {
      const ownershipRow = await prisma.order.findUnique({
        where: { orderId: String(sanitizedData.orderId) },
        select: { userId: true },
      });
      if (!ownershipRow) {
        return NextResponse.json({ error: 'Order not found' }, { status: 404, headers });
      }
      if (ownershipRow.userId !== ownerScopeUserId) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403, headers });
      }
    }

    // Make status changes, stock adjustments, item replacement, and final update atomic.
    const order = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      // Capture previous payment status for dedicated buyer notifications on payment transitions,
      // even when orderStatus isn't being updated in this request.
      if (
        typeof sanitizedData.orderId === 'string' &&
        (sanitizedData.orderStatus !== undefined || sanitizedData.paymentStatus !== undefined)
      ) {
        const existingForPayment = await tx.order.findUnique({
          where: { orderId: String(sanitizedData.orderId) },
          select: { paymentStatus: true, orderStatus: true },
        });
        if (existingForPayment) {
          previousPaymentStatus =
            typeof existingForPayment.paymentStatus === 'string'
              ? existingForPayment.paymentStatus
              : String(existingForPayment.paymentStatus || '');
          previousOrderStatus =
            typeof existingForPayment.orderStatus === 'string'
              ? existingForPayment.orderStatus
              : String(existingForPayment.orderStatus || '');
        }
      }

      if (sanitizedData.paymentStatus !== undefined) {
        const nextPaymentStatus = String(sanitizedData.paymentStatus);
        if (nextPaymentStatus === 'Paid' && previousPaymentStatus !== 'Paid') {
          updateData.paidAt = new Date();
        } else if (nextPaymentStatus === 'Unpaid' && previousPaymentStatus === 'Paid') {
          updateData.paidAt = null;
        }
      }

      // Replace line items before status/stock logic; deduct uses the final SKU set, restore uses a pre-replacement snapshot.
      let orderItemsBeforeReplacement: Array<{
        productId: string | null;
        variantOptionId: number | null;
        variantId: number | null;
        packageQuantity: number | null;
        piecesPerPackage: number | null;
        promotionDetailsSnapshot: string | null;
        moqSnapshot: number | null;
      }> | null = null;

      if (Array.isArray(parsedOrderItems) && typeof sanitizedData.orderId === 'string') {
        orderItemsBeforeReplacement = await tx.orderItem.findMany({
          where: { orderId: sanitizedData.orderId as string },
          select: {
            productId: true,
            variantOptionId: true,
            variantId: true,
            packageQuantity: true,
            piecesPerPackage: true,
            promotionDetailsSnapshot: true,
            moqSnapshot: true,
          },
        });

        await tx.orderItem.deleteMany({
          where: { orderId: sanitizedData.orderId as string },
        });

        const orderItemPromises = (parsedOrderItems as Array<{ productId: string; quantity: number }>).map(
          async (item: { productId: string; quantity: number }) => {
            const product = await tx.product.findFirst({
              where: { productId: item.productId },
              include: { variantOptions: true, variants: true },
            });

            if (!product) {
              throw new Error(`Product not found: ${item.productId}`);
            }

            const itemWithVariant = item as { variantOptionId?: number | null; variantId?: number | null };
            const selectedVariant = selectVariantOption(product, itemWithVariant);
            const consistentUnitPrice = selectedVariant ? getUnitPriceFromVariantOption(selectedVariant) : 0;
            if (!selectedVariant || consistentUnitPrice <= 0) {
              throw new Error(`No variants with pricing found for product: ${item.productId}`);
            }

            const consistentSubtotal = consistentUnitPrice * Number(item.quantity || 0);

            return tx.orderItem.create({
              data: {
                orderId: sanitizedData.orderId as string,
                productId: item.productId as string,
                variantOptionId: selectedVariant.id,
                variantId: itemWithVariant.variantId ?? null,
                subtotal: consistentSubtotal,
                productNameSnapshot: product.name,
                productSkuSnapshot: product.sku,
                productTypeSnapshot: product.productType,
                productImageSnapshot: Array.isArray((product as { images?: string[] }).images)
                  ? ((product as { images?: string[] }).images ?? [])[0] ?? null
                  : null,
                variantNameSnapshot: (selectedVariant as { variantName?: string }).variantName ?? null,
                variantAttributesSnapshot: (selectedVariant as { attributes?: unknown }).attributes ?? undefined,
                packageQuantity: (item as { packageQuantity?: number }).packageQuantity || 1,
                packageType: (item as { packageType?: string }).packageType,
                piecesPerPackage: (item as { piecesPerPackage?: number }).piecesPerPackage || 1,
                pricePerPackage: (item as { pricePerPackage?: number }).pricePerPackage || consistentUnitPrice,
                unitPriceSnapshot: consistentUnitPrice,
                moqSnapshot: (selectedVariant as { moq?: number | null }).moq ?? null,
              },
            });
          },
        );

        await Promise.all(orderItemPromises);
      }

      // Status-driven timestamps and stock adjustments (independent of whether acceptedAt was sent).
      if (typeof sanitizedData.orderId === 'string' && sanitizedData.orderStatus) {
        const existing = await tx.order.findUnique({ where: { orderId: String(sanitizedData.orderId) } });
        if (existing) {
          const nextStatus = String(sanitizedData.orderStatus);
          const prevStatus = String(existing.orderStatus || '');

          // Auto-set acceptedAt on status transition to Confirmed when not provided
          if (!sanitizedData.acceptedAt) {
            if (nextStatus === 'Confirmed' && !existing.acceptedAt) {
              updateData.acceptedAt = new Date();
              if (!sanitizedData.acceptedBy && !existing.acceptedBy) {
                updateData.acceptedBy = 'Admin';
              }
            }
          }

          // Update deliveredAt whenever status is set to Delivered (including after revert to Pending and back)
          if (nextStatus === 'Delivered') {
            updateData.deliveredAt = new Date();
          }

          // STOCK MANAGEMENT: Simple logic based on status
          const orderWithItems = await tx.order.findUnique({
            where: { orderId: String(sanitizedData.orderId) },
            include: {
              orderItemsRel: true,
            },
          });

          const noDeductStatuses = ['Pending', 'Cancelled', 'Returned', 'Failed'];
          const prevStatusNoDeduct = noDeductStatuses.includes(prevStatus);
          const nextStatusNoDeduct = noDeductStatuses.includes(nextStatus);

          // RESTORE STOCK: Moving TO Pending, Cancelled, or Returned from any other status
          if (!prevStatusNoDeduct && nextStatusNoDeduct && orderWithItems) {
            const itemsForStockRestore =
              orderItemsBeforeReplacement ?? orderWithItems.orderItemsRel;
            for (const orderItem of itemsForStockRestore) {
            if (!orderItem.productId) continue;
            
            // Calculate total quantity to restore (including free items from promotion)
            const totalQtyToRestore = calculateTotalQuantityWithPromotions(orderItem);
            
            // Get the product and variant for stock restoration
            const productForRestore = await tx.product.findFirst({
              where: { productId: orderItem.productId || '' },
              include: { variantOptions: true, variants: true }
            });
            
            if (!productForRestore) {
              continue; // Skip if product not found
            }
            
            // Find the specific variant to restore stock to
            let variantToRestore = null;
            
            // First try variantOptionId (most accurate)
            if (orderItem.variantOptionId) {
              variantToRestore = productForRestore.variantOptions.find(
                (v: { id: number }) => v.id === orderItem.variantOptionId
              ) || null;
            }
            
            // If not found, try variantId
            if (!variantToRestore && orderItem.variantId) {
              variantToRestore = productForRestore.variantOptions.find(
                (v: { id: number }) => v.id === orderItem.variantId
              ) || null;
            }
            
            // Do not fall back to "first variant" because it can update the wrong SKU.
            if (!variantToRestore) {
              console.warn(
                '[Orders] Stock restore skipped: variant not found',
                JSON.stringify({
                  productId: orderItem.productId,
                  variantOptionId: orderItem.variantOptionId ?? null,
                  variantId: orderItem.variantId ?? null,
                }),
              );
              continue;
            }
            
            // Restore stock at variant level (piece-based system)
            const previousStock = (variantToRestore as { stockQuantity?: number }).stockQuantity || 0;
            const restored = await tx.variantOption.update({
              where: { id: (variantToRestore as { id: number }).id },
              data: {
                stockQuantity: { increment: totalQtyToRestore },
              },
              select: { stockQuantity: true, lowStockThreshold: true, stockStatus: true, variantName: true },
            });
            const newStock = restored.stockQuantity ?? previousStock + totalQtyToRestore;
            const lowStockThreshold = restored.lowStockThreshold || 0;
            let newStockStatus = 'In Stock';
            if (newStock <= 0) {
              newStockStatus = 'Out of Stock';
            } else if (lowStockThreshold > 0 && newStock <= lowStockThreshold) {
              newStockStatus = 'Low Stock';
            }
            if (newStockStatus !== restored.stockStatus) {
              await tx.variantOption.update({
                where: { id: (variantToRestore as { id: number }).id },
                data: { stockStatus: newStockStatus },
              });
            }

            // Check and notify if stock level crossed a threshold
            if (productForRestore && productForRestore.userId) {
              const variantName = (variantToRestore as { variantName?: string }).variantName || undefined;
              stockNotificationJobs.push({
                userId: productForRestore.userId,
                productId: productForRestore.productId,
                productName: productForRestore.name,
                previousStock,
                newStock,
                lowStockThreshold,
                variantName,
              });
            }
          }
        }
        
        // DEDUCT STOCK: Moving FROM Pending, Cancelled, or Returned TO any other status
        if (prevStatusNoDeduct && !nextStatusNoDeduct && orderWithItems) {
          for (const orderItem of orderWithItems.orderItemsRel) {
            if (!orderItem.productId) continue;
            
            // Calculate total quantity to deduct (including free items from promotion)
            const totalQtyToDeduct = calculateTotalQuantityWithPromotions(orderItem);
            
            // Get the product and variant for stock deduction
            const productForDeduct = await tx.product.findFirst({
              where: { productId: orderItem.productId || '' },
              include: { variantOptions: true, variants: true }
            });
            
            if (!productForDeduct) {
              continue; // Skip if product not found
            }
            
            // Find the specific variant to deduct stock from
            let variantToDeduct = null;
            
            // First try variantOptionId (most accurate)
            if (orderItem.variantOptionId) {
              variantToDeduct = productForDeduct.variantOptions.find(
                (v: { id: number }) => v.id === orderItem.variantOptionId
              ) || null;
            }
            
            // If not found, try variantId
            if (!variantToDeduct && orderItem.variantId) {
              variantToDeduct = productForDeduct.variantOptions.find(
                (v: { id: number }) => v.id === orderItem.variantId
              ) || null;
            }
            
            // Do not fall back to "first variant" because it can update the wrong SKU.
            if (!variantToDeduct) {
              console.warn(
                '[Orders] Stock deduct skipped: variant not found',
                JSON.stringify({
                  productId: orderItem.productId,
                  variantOptionId: orderItem.variantOptionId ?? null,
                  variantId: orderItem.variantId ?? null,
                }),
              );
              continue;
            }
            
            const previousStock = (variantToDeduct as { stockQuantity?: number }).stockQuantity || 0;
            const lowStockThreshold = (variantToDeduct as { lowStockThreshold?: number }).lowStockThreshold || 0;
            // Deduct only when enough stock remains (conditional updateMany is the atomic guard).
            const deductResult = await tx.variantOption.updateMany({
              where: {
                id: (variantToDeduct as { id: number }).id,
                stockQuantity: { gte: totalQtyToDeduct },
              },
              data: {
                stockQuantity: { decrement: totalQtyToDeduct },
              },
            });

            if (deductResult.count === 0) {
              throw new Error(
                `Insufficient stock for product ${orderItem.productId}. Required: ${totalQtyToDeduct} pieces.`,
              );
            }

            const afterDeduct = await tx.variantOption.findUnique({
              where: { id: (variantToDeduct as { id: number }).id },
              select: { stockQuantity: true, stockStatus: true },
            });
            const newStock = afterDeduct?.stockQuantity ?? Math.max(0, previousStock - totalQtyToDeduct);
            let newStockStatus = 'In Stock';
            if (newStock <= 0) {
              newStockStatus = 'Out of Stock';
            } else if (lowStockThreshold > 0 && newStock <= lowStockThreshold) {
              newStockStatus = 'Low Stock';
            }
            if (afterDeduct && newStockStatus !== afterDeduct.stockStatus) {
              await tx.variantOption.update({
                where: { id: (variantToDeduct as { id: number }).id },
                data: { stockStatus: newStockStatus },
              });
            }

            // Check and notify if stock level crossed a threshold
            if (productForDeduct && productForDeduct.userId) {
              const variantName = (variantToDeduct as { variantName?: string }).variantName || undefined;
              stockNotificationJobs.push({
                userId: productForDeduct.userId,
                productId: productForDeduct.productId,
                productName: productForDeduct.name,
                previousStock,
                newStock: Math.max(0, newStock),
                lowStockThreshold,
                variantName,
              });
            }
          }
        }
      }
    }
      // For backward compatibility, don't require userId for updates
      const updatedOrder = await tx.order.update({
        where: { orderId: String(sanitizedData.orderId) },
        data: updateData,
        include: {
          buyer: true,
          user: true,
          orderItemsRel: {
            include: { product: true },
          },
        },
      });

      return updatedOrder;
    });

    // Run stock notifications and other side effects best-effort after DB commit.
    scheduleOrderUpdatePostCommitEffects({
      order: {
        orderId: order.orderId,
        buyerId: order.buyerId,
        userId: order.userId,
        storeName: order.storeName,
        orderStatus: order.orderStatus,
        paymentStatus: order.paymentStatus,
        totalAmount: (order as { totalAmount?: unknown }).totalAmount,
      },
      sanitizedData,
      previousOrderStatus,
      previousPaymentStatus,
      stockNotificationJobs,
    });

    // Build items from relational rows for response
    const enrichedOrderItemsUpdate = ((order as { orderItemsRel?: Array<{ productId: string | null; subtotal: number | { toNumber?: () => number; toString?: () => string } | unknown; packageQuantity?: number; packageType?: string; piecesPerPackage?: number; pricePerPackage?: number | { toNumber?: () => number; toString?: () => string } | null | unknown; product?: { name: string; productType: string; brand: string; description: string; images: string[] } | null; productNameSnapshot?: string; productSkuSnapshot?: string; productTypeSnapshot?: string }> }).orderItemsRel || []).map((oi) => ({
      productId: oi.productId ?? null,
      subtotal: decimalToNumber(oi.subtotal), // Convert Decimal to number
      packageType: oi.packageType,
      piecesPerPackage: oi.piecesPerPackage,
      packageQuantity: oi.packageQuantity,
      pricePerPackage: oi.pricePerPackage ? decimalToNumber(oi.pricePerPackage) : null, // Convert Decimal to number
      productName: oi.product?.name || oi.productNameSnapshot || 'Unknown Product',
      category: oi.product?.productType || oi.productTypeSnapshot || 'Uncategorized',
      brand: oi.product?.brand || 'Unknown Brand',
      description: oi.product?.description || '',
      images: oi.product?.images || [],
      productDeleted: !oi.product,
      productNameSnapshot: oi.productNameSnapshot || null,
      productSkuSnapshot: oi.productSkuSnapshot || null,
      productTypeSnapshot: oi.productTypeSnapshot || null
    }));

    const orderResponse = {
      ...order,
      subtotal: decimalToNumber((order as { subtotal?: unknown }).subtotal),
      discounts: decimalToNumber((order as { discounts?: unknown }).discounts),
      shippingFee: decimalToNumber((order as { shippingFee?: unknown }).shippingFee),
      totalAmount: decimalToNumber((order as { totalAmount?: unknown }).totalAmount),
      orderItems: enrichedOrderItemsUpdate
    };
    
    const orderStatusChanged =
      previousOrderStatus !== null && previousOrderStatus !== order.orderStatus;
    const paymentStatusChanged =
      previousPaymentStatus !== null && previousPaymentStatus !== order.paymentStatus;
    auditOrder(request, {
      action: orderStatusChanged || paymentStatusChanged ? 'status_change' : 'update',
      resourceId: order.orderId,
      actorId:
        typeof (sanitizedData as { userId?: unknown }).userId === 'number'
          ? ((sanitizedData as { userId: number }).userId)
          : userIdForRateLimit,
      actorType: 'dashboard',
      metadata: {
        ...(orderStatusChanged
          ? { fromStatus: previousOrderStatus, toStatus: order.orderStatus }
          : {}),
        ...(paymentStatusChanged
          ? { fromPayment: previousPaymentStatus, toPayment: order.paymentStatus }
          : {}),
      },
    });

    return NextResponse.json(orderResponse, { headers });
  } catch (error: unknown) {
    return NextResponse.json(
      { error: 'Failed to update order', detail: String(error instanceof Error ? error.message : error) }, 
      { status: 500, headers }
    );
  }
}

