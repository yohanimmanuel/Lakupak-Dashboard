import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { Prisma } from '@/lib/prisma-generated';
import { getOrderSecurityHeaders, validateOrderUpdate, sanitizeOrderData } from '@/utils/order-security';
import { ensureAllPriceConsistency } from '@/utils/orderUtils';
import { parseMarketplaceUserIdFromBuyerId, syncOrderToBuyerProfile } from '@/utils/buyerSync';
import { orderUpdateRateLimiter } from '@/utils/rateLimiter';
import { auditOrder } from '@/lib/audit';
import {
  decimalToNumber,
  restoreStockForOrderItems,
  deductStockForOrderItems,
  InsufficientOrderStockError,
  broadcastProductStockUpdates,
  broadcastSoldCountUpdatesForOrders,
  STOCK_NO_DEDUCT_STATUSES,
  type StockNotificationJob,
} from './utils';
import { getUnitPriceFromVariantOption, selectVariantOption } from '@/domain/marketplace/orderItemRules';
import { normalizeStockLevels } from '@/utils/stockUtils';
import {
  enqueueBroadcastOrderUpdates,
  scheduleOrderCancelPostCommitEffects,
  scheduleOrderUpdatePostCommitEffects,
  scheduleReturnRequestRejectedNotification,
  scheduleReturnItemsReceivedNotification,
} from './enqueueOrderUpdateSideEffects';

function isDeadlockError(error: unknown): boolean {
  if (error && typeof error === 'object' && 'code' in error) {
    const code = String((error as { code?: unknown }).code ?? '');
    if (code === 'P2034' || code === '40P01') return true;
  }
  const message = error instanceof Error ? error.message : String(error ?? '');
  return /deadlock detected|40P01|P2034/i.test(message);
}

class OrderStatusConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OrderStatusConflictError';
  }
}

async function runOrderTransaction<T>(
  run: (tx: Prisma.TransactionClient) => Promise<T>,
  attempts = 5,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await prisma.$transaction(run, {
        maxWait: 10_000,
        timeout: 30_000,
      });
    } catch (error) {
      lastError = error;
      if (attempt >= attempts || !isDeadlockError(error)) throw error;
      await new Promise((resolve) =>
        setTimeout(resolve, 50 * attempt * attempt + Math.floor(Math.random() * 80)),
      );
    }
  }
  throw lastError;
}

const BULK_ORDER_STATUSES = new Set([
  'Pending', 'Confirmed', 'Packed', 'Shipped', 'Delivered', 'Received', 'Failed', 'Cancelled', 'Returned',
]);

async function updateOrdersStatusBulk(
  request: NextRequest,
  orderIdsInput: unknown,
  nextStatusInput: unknown,
  ownerScopeUserId: number | null,
  actorId: number | null,
) {
  const headers = getOrderSecurityHeaders();
  const orderIds = Array.isArray(orderIdsInput)
    ? Array.from(new Set(orderIdsInput.filter((value): value is string => typeof value === 'string').map((value) => value.trim()).filter(Boolean)))
    : [];
  const nextStatus = typeof nextStatusInput === 'string' ? nextStatusInput.trim() : '';

  if (orderIds.length === 0 || orderIds.length > 100) {
    return NextResponse.json({ error: 'Select between 1 and 100 orders.', code: 'invalid_bulk_selection' }, { status: 400, headers });
  }
  if (!BULK_ORDER_STATUSES.has(nextStatus)) {
    return NextResponse.json({ error: 'Invalid order status.', code: 'invalid_status' }, { status: 400, headers });
  }

  try {
    const changed = await runOrderTransaction(async (tx) => {
      // Serialize overlapping bulk/single status changes for the same order rows.
      // This prevents two concurrent requests from both observing Pending and
      // deducting the same reservation twice. Stable lock ordering avoids deadlocks.
      for (const orderId of [...orderIds].sort()) {
        await tx.$queryRaw<Array<{ orderId: string }>>`
          SELECT "orderId" FROM "Order" WHERE "orderId" = ${orderId} FOR UPDATE
        `;
      }
      const where = {
        orderId: { in: orderIds },
        isDeleted: false,
        ...(ownerScopeUserId != null ? { userId: ownerScopeUserId } : {}),
      };
      const orders = await tx.order.findMany({
        where,
        orderBy: { orderId: 'asc' },
        include: { orderItemsRel: true },
      });

      // Fail the complete batch on missing/unauthorized IDs. Do not partially
      // mutate a selection whose membership differs from what the user chose.
      if (orders.length !== orderIds.length) {
        throw new Error('One or more selected orders were not found or are not accessible.');
      }

      const updates: Array<{
        order: {
          orderId: string;
          buyerId: string | null;
          userId: number | null;
          storeName: string | null;
          orderStatus: string;
          paymentStatus: string;
          totalAmount: unknown;
        };
        previousOrderStatus: string;
        stockNotificationJobs: StockNotificationJob[];
      }> = [];

      for (const current of orders) {
        const previousStatus = String(current.orderStatus || '');
        const wasNotDeducted = (STOCK_NO_DEDUCT_STATUSES as readonly string[]).includes(previousStatus);
        const willBeNotDeducted = (STOCK_NO_DEDUCT_STATUSES as readonly string[]).includes(nextStatus);
        const jobs: StockNotificationJob[] = [];

        if (wasNotDeducted && !willBeNotDeducted) {
          jobs.push(...(await deductStockForOrderItems(tx, current.orderItemsRel)));
        } else if (!wasNotDeducted && willBeNotDeducted) {
          jobs.push(...(await restoreStockForOrderItems(tx, current.orderItemsRel)));
        }

        const data: Record<string, unknown> = { orderStatus: nextStatus };
        if (nextStatus === 'Confirmed' && !current.acceptedAt) {
          data.acceptedAt = new Date();
          if (!current.acceptedBy) data.acceptedBy = 'Admin';
        }
        if (nextStatus === 'Delivered') data.deliveredAt = new Date();

        const updated = await tx.order.update({
          where: { orderId: current.orderId },
          data,
          select: {
            orderId: true,
            buyerId: true,
            userId: true,
            storeName: true,
            orderStatus: true,
            paymentStatus: true,
            totalAmount: true,
          },
        });
        updates.push({ order: updated, previousOrderStatus: previousStatus, stockNotificationJobs: jobs });
      }
      return updates;
    });

    // Run all notifications/cache broadcasts only after the batch transaction
    // has committed successfully.
    for (const update of changed) {
      if (update.previousOrderStatus === nextStatus) continue;
      scheduleOrderUpdatePostCommitEffects({
        order: update.order,
        sanitizedData: { orderStatus: nextStatus, userId: update.order.userId ?? undefined },
        previousOrderStatus: update.previousOrderStatus,
        previousPaymentStatus: update.order.paymentStatus,
        stockNotificationJobs: update.stockNotificationJobs,
        skipOrderAndStockBroadcasts: true,
      });
      auditOrder(request, {
        action: 'status_change',
        resourceId: update.order.orderId,
        actorId,
        actorType: 'dashboard',
        metadata: { fromStatus: update.previousOrderStatus, toStatus: nextStatus, bulk: true },
      });
    }

    const changedOrderIds = changed
      .filter((update) => update.previousOrderStatus !== nextStatus)
      .map((update) => update.order.orderId);
    if (changedOrderIds.length > 0) {
      enqueueBroadcastOrderUpdates('bulk-order-status', changedOrderIds);
      // Invalidate product-list caches before broadcasting so the product table
      // fetches the committed stock immediately after this bulk request succeeds.
      await broadcastSoldCountUpdatesForOrders(changedOrderIds);
    }

    return NextResponse.json({
      success: true,
      orderStatus: nextStatus,
      successfulOrderIds: changed.map((entry) => entry.order.orderId),
      failedOrderIds: [],
      count: changed.length,
    }, { headers });
  } catch (error) {
    if (error instanceof InsufficientOrderStockError) {
      return NextResponse.json({ error: error.message, code: 'insufficient_stock' }, { status: 409, headers });
    }
    const message = error instanceof Error ? error.message : 'Failed to update selected orders.';
    return NextResponse.json({ error: message, code: 'bulk_update_failed' }, { status: 409, headers });
  }
}

// Move-only extraction of PUT handler from `ordersRouteService.ts`.
export async function updateOrderHandler(request: NextRequest) {
  const headers = getOrderSecurityHeaders();
  
  try {
    const body = await request.json();

    // Authenticate the caller (dashboard NextAuth session or JWT). Platform admins
    // are resolved separately so they may act across tenants.
    const { getAuthenticatedUserId, getAuthenticatedMarketplaceUserId } = await import('@/utils/auth-helpers');
    const authenticatedUserId = await getAuthenticatedUserId(request);
    let marketplaceUserId: number | null = null;
    if (body.cancel === true) {
      const marketplaceAuth = await getAuthenticatedMarketplaceUserId(request);
      if (marketplaceAuth.ok) marketplaceUserId = marketplaceAuth.userId;
    }
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

    if (!authenticatedUserId && !isPlatformAdmin && !(body.cancel === true && marketplaceUserId)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers });
    }

    // Never trust a client-supplied userId for ownership scoping. Non-admins are
    // always constrained to their own account; platform admins may act cross-tenant.
    if (!isPlatformAdmin && authenticatedUserId) {
      body.userId = authenticatedUserId;
    }
    // Owner id every operation must be scoped to (null = unrestricted platform admin).
    const ownerScopeUserId: number | null = isPlatformAdmin ? null : (authenticatedUserId ?? null);
    // Accepting a return moves the order to Returned, but inventory is restored
    // only when the distributor confirms physical receipt of the returned items.
    let skipFullStockRestoreForReturnAccept = false;

    if (body.bulkOrderStatus === true) {
      return updateOrdersStatusBulk(
        request,
        body.orderIds,
        body.orderStatus,
        ownerScopeUserId,
        userIdForRateLimit,
      );
    }

    if (body.distributorEdit === true) {
      if (!authenticatedUserId) {
        return NextResponse.json({ error: 'Unauthorized', code: 'unauthorized' }, { status: 401, headers });
      }
      const { updateDistributorOrderHandler } = await import('./createDistributorOrder');
      const distributorResponse = await updateDistributorOrderHandler(authenticatedUserId, body);
      if (distributorResponse.status >= 200 && distributorResponse.status < 300) {
        try {
          const payload = (await distributorResponse.clone().json()) as { orderId?: unknown };
          const orderId = typeof payload.orderId === 'string' ? payload.orderId : '';
          if (orderId) {
            auditOrder(request, {
              action: 'update',
              resourceId: orderId,
              actorId: authenticatedUserId,
              actorType: 'dashboard',
            });
            enqueueBroadcastOrderUpdates('order-update', [orderId]);
          }
        } catch {
          // Keep the handler response available for the caller.
        }
      }
      return distributorResponse;
    }

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
          include: { order: true, items: true },
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

        const creditFromItems = existingReturnRequest.items.reduce(
          (sum, item) => sum + decimalToNumber(item.lineCreditAmount),
          0,
        );
        const creditAmount =
          existingReturnRequest.creditAmount != null
            ? decimalToNumber(existingReturnRequest.creditAmount)
            : creditFromItems;

        const rr = await prisma.orderReturnRequest.update({
          where: { id },
          data: {
            status,
            ...(status === 'Accepted' && creditAmount > 0 ? { creditAmount } : {}),
          },
          include: { items: true },
        });

        if (status === 'Accepted' && creditAmount > 0) {
          await prisma.order.update({
            where: { orderId: rr.orderId },
            data: { returnCreditAmount: creditAmount },
          });
        }

        // CRM return history is written on Accept (not on confirm-received).
        // Physical receipt and inventory restock are separate later steps.
        if (status === 'Accepted' && rr.items.length > 0) {
          try {
            const {
              resolveBuyerRefIdForOrder,
              syncBuyerReturnRecordsFromRequest,
            } = await import('@/lib/clients/buyerReturnRecords');
            const buyerRefId = await resolveBuyerRefIdForOrder(prisma, {
              buyerId: existingReturnRequest.order.buyerId,
              userId: existingReturnRequest.order.userId,
            });
            if (buyerRefId != null) {
              await syncBuyerReturnRecordsFromRequest(prisma, {
                buyerRefId,
                orderNo: rr.orderId,
                returnRequestId: rr.id,
                reason: rr.reason ?? null,
                returnedAt: new Date(),
                items: rr.items.map((item) => ({
                  returnRequestItemId: item.id,
                  productNameSnapshot: item.productNameSnapshot,
                  productId: item.productId,
                  productSkuSnapshot: item.productSkuSnapshot,
                  variantNameSnapshot: item.variantNameSnapshot,
                  packageType: item.packageType,
                  piecesPerPackage: item.piecesPerPackage,
                  quantityReturned: item.quantityReturned,
                  lineCreditAmount: decimalToNumber(item.lineCreditAmount),
                })),
              });
            } else {
              console.error(
                '[buyerReturnRecords] skip sync on accept: buyer profile not found',
                rr.orderId,
              );
            }
          } catch (err) {
            console.error('[buyerReturnRecords] sync on accept failed', err);
          }
        }

        auditOrder(request, {
          action: 'return_decision',
          resourceId: rr.orderId,
          actorId: body.userId && !isNaN(Number(body.userId)) ? Number(body.userId) : null,
          actorType: 'dashboard',
          metadata: { returnRequestId: id, decision: status, creditAmount },
        });

        // Delegate order state change to the unified orderStatus flow below
        body.orderId = rr.orderId;
        body.returnStatus = status;
        if (status === 'Accepted') {
          body.orderStatus = 'Returned';
          body.returnedAt = new Date().toISOString();
          body.returnReason = rr.reason ?? null;
          body.returnReasonDetail = rr.reasonDetail ?? null;
          // Accept never marks physical receipt or restores inventory.
          delete body.returnItemsReceivedAt;
          delete body.confirmReturnItemsReceived;
          skipFullStockRestoreForReturnAccept = true;
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
          include: {
            returnRequests: { select: { status: true } },
          },
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

        const acceptedRequests = (existing.returnRequests ?? []).filter((rr) => rr.status === 'Accepted');
        const hasAcceptedReturn =
          existing.returnStatus === 'Accepted' || acceptedRequests.length > 0;
        if (!hasAcceptedReturn) {
          return NextResponse.json({ error: 'No accepted return request for this order' }, { status: 400, headers: localHeaders });
        }

        if (existing.fleetId && !existing.returnCollectedAt) {
          return NextResponse.json(
            { error: 'Driver has not collected return items yet' },
            { status: 400, headers: localHeaders },
          );
        }
        if (existing.returnItemsReceivedAt) {
          return NextResponse.json(
            { error: 'Return items already confirmed received' },
            { status: 400, headers: localHeaders },
          );
        }

        // Confirm receipt only — inventory restock is decided later in BuyerModal.
        const confirmedAt = new Date();
        let updated;
        try {
          updated = await runOrderTransaction(async (tx) => {
            const result = await tx.order.updateMany({
              where: {
                orderId,
                returnItemsReceivedAt: null,
                orderStatus: 'Returned',
                ...(existing.fleetId ? { returnCollectedAt: { not: null } } : {}),
              },
              data: { returnItemsReceivedAt: confirmedAt },
            });
            if (result.count === 0) {
              throw new OrderStatusConflictError('Return items already confirmed received');
            }
            return tx.order.findUniqueOrThrow({ where: { orderId } });
          });
        } catch (error) {
          if (error instanceof OrderStatusConflictError) {
            return NextResponse.json(
              { error: error.message },
              { status: 400, headers: localHeaders },
            );
          }
          throw error;
        }

        const marketplaceUserId = parseMarketplaceUserIdFromBuyerId(updated.buyerId);
        if (marketplaceUserId != null) {
          scheduleReturnItemsReceivedNotification({
            marketplaceUserId,
            orderId: updated.orderId,
            orderStatus: String(updated.orderStatus),
          });
        }

        if (existing.userId != null && updated.buyerId) {
          const { dispatchReturnAcceptedAutomations } = await import('@/lib/automations/engine');
          void dispatchReturnAcceptedAutomations({
            userId: existing.userId,
            orderId: updated.orderId,
            buyerId: updated.buyerId,
          }).catch((err) => {
            console.error('[automations] return_accepted dispatch failed', err);
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

      if (!isPlatformAdmin) {
        const orderBuyerMarketplaceId = parseMarketplaceUserIdFromBuyerId(existingOrder.buyerId);
        const authorizedAsBuyer =
          marketplaceUserId != null &&
          orderBuyerMarketplaceId != null &&
          orderBuyerMarketplaceId === marketplaceUserId;
        const authorizedAsOwner =
          ownerScopeUserId != null && existingOrder.userId === ownerScopeUserId;

        // Marketplace JWT and dashboard session can coexist (Bearer buyer + NextAuth owner).
        // Allow cancel when either identity is authorized for this order.
        if (!authorizedAsBuyer && !authorizedAsOwner) {
          return NextResponse.json({ error: 'Forbidden' }, { status: 403, headers });
        }
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
        const { updatedOrder, stockNotificationJobs } = await runOrderTransaction(
          async (tx: Prisma.TransactionClient) => {
            await tx.$queryRaw<Array<{ orderId: string }>>`
              SELECT "orderId" FROM "Order" WHERE "orderId" = ${existingOrder.orderId} FOR UPDATE
            `;
            const lockedOrder = await tx.order.findUnique({
              where: { orderId: existingOrder.orderId },
              select: { orderStatus: true },
            });
            if (!lockedOrder || !['Pending', 'Confirmed'].includes(String(lockedOrder.orderStatus))) {
              throw new OrderStatusConflictError(
                `Order cannot be cancelled. Current status: ${lockedOrder?.orderStatus ?? 'Not found'}`,
              );
            }

            const stockJobs: StockNotificationJob[] = [];
            const shouldRestoreStock = !(STOCK_NO_DEDUCT_STATUSES as readonly string[]).includes(
              String(lockedOrder.orderStatus),
            );

            if (shouldRestoreStock) {
              const itemsForStockRestore = await tx.orderItem.findMany({
                where: { orderId: existingOrder.orderId },
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
              stockJobs.push(...(await restoreStockForOrderItems(tx, itemsForStockRestore)));
            }

            const updated = await tx.order.update({
              where: whereClause,
              data: updateData,
            });

            return { updatedOrder: updated, stockNotificationJobs: stockJobs };
          },
        );

        // Persist structured cancel data (marketplace buyer id from order's buyerId)
        const orderBuyerMarketplaceId = parseMarketplaceUserIdFromBuyerId(updatedOrder.buyerId);
        if (
          orderBuyerMarketplaceId != null &&
          Number.isInteger(orderBuyerMarketplaceId) &&
          orderBuyerMarketplaceId > 0
        ) {
          try {
            await prisma.orderCancellation.create({
              data: {
                orderId: updatedOrder.orderId,
                marketplaceUserId: orderBuyerMarketplaceId,
                reason: reasonCode,
                reasonDetail,
                cancelledAt
              }
            });
          } catch (createErr) {
            // Don't fail the cancel if cancellation record fails (e.g. schema not migrated yet)
          }
        }
        
        scheduleOrderCancelPostCommitEffects(
          updatedOrder,
          marketplaceUserId ?? ownerScopeUserId ?? updatedOrder.userId ?? undefined,
          stockNotificationJobs,
        );

        auditOrder(request, {
          action: 'cancel',
          resourceId: updatedOrder.orderId,
          actorId:
            marketplaceUserId ??
            ownerScopeUserId ??
            (body.userId && !isNaN(Number(body.userId)) ? Number(body.userId) : null),
          actorType: marketplaceUserId != null ? 'marketplace' : 'dashboard',
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
        if (e instanceof OrderStatusConflictError) {
          return NextResponse.json({ error: e.message, code: 'order_status_conflict' }, { status: 409, headers });
        }
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

    const stockAffectedProductIds = new Set<string>();
    const stockNotificationJobs: Array<{
      userId: number;
      productId: string;
      productName: string;
      previousStock: number;
      newStock: number;
      lowStockThreshold: number;
      variantName?: string;
      variantOptionId?: number;
    }> = [];

    let previousPaymentStatus: string | null = null;
    let previousOrderStatus: string | null = null;
    const totalsChanged =
      sanitizedData.subtotal !== undefined ||
      sanitizedData.shippingFee !== undefined ||
      sanitizedData.discounts !== undefined ||
      Array.isArray(parsedOrderItems);
    // Snapshot before retries: the transaction callback mutates these in place.
    const updateDataBase = { ...updateData };
    const originalSanitizedPaymentStatus = sanitizedData.paymentStatus;

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
    const order = await runOrderTransaction(async (tx: Prisma.TransactionClient) => {
      // Serialize all stock-affecting updates to a given order. A repeated status
      // request must re-read the status after acquiring this lock before changing stock.
      if (typeof sanitizedData.orderId === 'string') {
        await tx.$queryRaw<Array<{ orderId: string }>>`
          SELECT "orderId" FROM "Order" WHERE "orderId" = ${String(sanitizedData.orderId)} FOR UPDATE
        `;
      }
      // Deadlock retries re-enter this callback; clear attempt-local side effects first.
      stockNotificationJobs.length = 0;
      stockAffectedProductIds.clear();
      previousPaymentStatus = null;
      previousOrderStatus = null;
      for (const key of Object.keys(updateData)) {
        if (!(key in updateDataBase)) delete updateData[key];
      }
      Object.assign(updateData, updateDataBase);
      sanitizedData.paymentStatus = originalSanitizedPaymentStatus;

      // Capture previous payment status for dedicated buyer notifications on payment transitions,
      // even when orderStatus isn't being updated in this request.
      let paymentBaseTotal = 0;
      let recordedAmountPaid: number | null = null;
      if (
        typeof sanitizedData.orderId === 'string' &&
        (sanitizedData.orderStatus !== undefined ||
          sanitizedData.paymentStatus !== undefined ||
          sanitizedData.amountPaid !== undefined ||
          totalsChanged)
      ) {
        const existingForPayment = await tx.order.findUnique({
          where: { orderId: String(sanitizedData.orderId) },
          select: {
            paymentStatus: true,
            orderStatus: true,
            subtotal: true,
            shippingFee: true,
            discounts: true,
            amountPaid: true,
          },
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
          const nextSubtotal = updateData.subtotal !== undefined ? Number(updateData.subtotal) : decimalToNumber(existingForPayment.subtotal);
          const nextShipping = updateData.shippingFee !== undefined ? Number(updateData.shippingFee) : decimalToNumber(existingForPayment.shippingFee);
          const nextDiscounts = updateData.discounts !== undefined ? Number(updateData.discounts) : decimalToNumber(existingForPayment.discounts);
          paymentBaseTotal = Math.max(0, nextSubtotal + nextShipping - nextDiscounts);
          if (totalsChanged) {
            updateData.totalAmount = paymentBaseTotal;
          }
          recordedAmountPaid = existingForPayment.amountPaid == null ? null : decimalToNumber(existingForPayment.amountPaid);
        }
      }

      if (typeof sanitizedData.amountPaid === 'number') {
        const paid = Math.round(Math.min(paymentBaseTotal, Math.max(0, sanitizedData.amountPaid)) * 100) / 100;
        const fullyPaid = paymentBaseTotal > 0 && paid >= paymentBaseTotal - 0.001;
        const nextPaymentStatus = fullyPaid ? 'Paid' : 'Unpaid';
        updateData.amountPaid = paid;
        updateData.paymentStatus = nextPaymentStatus;
        sanitizedData.paymentStatus = nextPaymentStatus;
      } else if (sanitizedData.paymentStatus === 'Paid' && previousPaymentStatus !== 'Paid') {
        updateData.amountPaid = Math.round(paymentBaseTotal * 100) / 100;
      } else if (sanitizedData.paymentStatus === 'Unpaid' && previousPaymentStatus === 'Paid') {
        updateData.amountPaid = 0;
      } else if (
        totalsChanged &&
        (sanitizedData.paymentStatus === undefined || sanitizedData.paymentStatus === previousPaymentStatus) &&
        sanitizedData.amountPaid === undefined &&
        recordedAmountPaid != null
      ) {
        const paid = Math.round(Math.min(paymentBaseTotal, Math.max(0, recordedAmountPaid)) * 100) / 100;
        const fullyPaid = paymentBaseTotal > 0 && paid >= paymentBaseTotal - 0.001;
        const nextPaymentStatus = fullyPaid ? 'Paid' : 'Unpaid';
        if (paid !== Math.round(recordedAmountPaid * 100) / 100) {
          updateData.amountPaid = paid;
        }
        if (nextPaymentStatus !== previousPaymentStatus) {
          updateData.paymentStatus = nextPaymentStatus;
          sanitizedData.paymentStatus = nextPaymentStatus;
        }
      }

      if (sanitizedData.paymentStatus !== undefined) {
        const nextPaymentStatus = String(updateData.paymentStatus ?? sanitizedData.paymentStatus);
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
        packageType: string | null;
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
            packageType: true,
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

            const stockItem = item as {
              packageType?: string | null;
              piecesPerPackage?: number | null;
              variantOptionId?: number | null;
              variantId?: number | null;
            };
            const requestedPackageType = String(stockItem.packageType || 'Pieces');
            const requestedPiecesPerPackage = Math.max(1, Number(stockItem.piecesPerPackage) || 1);
            const configuredLevel = normalizeStockLevels(product.stockLevels).find(
              (level) => level.name === requestedPackageType && level.piecesPerUnit === requestedPiecesPerPackage,
            );
            const unchangedHistoricalLevel = (orderItemsBeforeReplacement ?? []).some((oldItem) =>
              oldItem.productId === item.productId &&
              (oldItem.variantOptionId ?? oldItem.variantId) === (stockItem.variantOptionId ?? stockItem.variantId ?? null) &&
              oldItem.packageType === requestedPackageType &&
              (oldItem.piecesPerPackage ?? 1) === requestedPiecesPerPackage,
            );
            if (!configuredLevel && !unchangedHistoricalLevel) {
              throw new Error(`Stock type "${requestedPackageType}" is no longer configured for ${product.name}. Select an available stock type.`);
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
                productSkuSnapshot: selectedVariant.sku ?? null,
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

      // Status transitions and line-item edits share one inventory reconciliation path.
      // A deducted order that changes its lines must return the old reservation and
      // deduct the new reservation atomically, even when its status remains Confirmed.
      if (typeof sanitizedData.orderId === 'string') {
        const existing = await tx.order.findUnique({
          where: { orderId: String(sanitizedData.orderId) },
          select: { orderStatus: true, acceptedAt: true, acceptedBy: true },
        });
        if (existing) {
          const nextStatus = sanitizedData.orderStatus !== undefined
            ? String(sanitizedData.orderStatus)
            : String(existing.orderStatus || '');
          const previousStatus = String(existing.orderStatus || '');
          const wasNotDeducted = (STOCK_NO_DEDUCT_STATUSES as readonly string[]).includes(previousStatus);
          const willBeNotDeducted = (STOCK_NO_DEDUCT_STATUSES as readonly string[]).includes(nextStatus);
          const itemsWereReplaced = Array.isArray(parsedOrderItems);

          if (!sanitizedData.acceptedAt && nextStatus === 'Confirmed' && !existing.acceptedAt) {
            updateData.acceptedAt = new Date();
            if (!sanitizedData.acceptedBy && !existing.acceptedBy) updateData.acceptedBy = 'Admin';
          }
          if (sanitizedData.orderStatus && nextStatus === 'Delivered') {
            updateData.deliveredAt = new Date();
          }

          if (sanitizedData.orderStatus || itemsWereReplaced) {
            const orderWithItems = await tx.order.findUnique({
              where: { orderId: String(sanitizedData.orderId) },
              include: { orderItemsRel: true },
            });
            if (orderWithItems) {
              const previousItems = orderItemsBeforeReplacement ?? orderWithItems.orderItemsRel;
              const currentItems = orderWithItems.orderItemsRel;

              // Restore the old reservation when leaving a deducted state OR when
              // replacing lines on an order that already has deducted inventory.
              // Return accept → Returned defers restore until confirm-received.
              const deferReturnRestock =
                skipFullStockRestoreForReturnAccept &&
                nextStatus === 'Returned' &&
                !itemsWereReplaced;
              if (!wasNotDeducted && (willBeNotDeducted || itemsWereReplaced) && !deferReturnRestock) {
                for (const item of previousItems) if (item.productId) stockAffectedProductIds.add(item.productId);
                stockNotificationJobs.push(...(await restoreStockForOrderItems(tx, previousItems)));
              }

              // Deduct only when entering a deducted state OR when the new lines
              // replace an existing deducted reservation. Never double-deduct a
              // status-only update between two deducted states.
              if (!willBeNotDeducted && (wasNotDeducted || itemsWereReplaced)) {
                for (const item of currentItems) if (item.productId) stockAffectedProductIds.add(item.productId);
                stockNotificationJobs.push(...(await deductStockForOrderItems(tx, currentItems)));
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
    const previousWasNoDeduct = (STOCK_NO_DEDUCT_STATUSES as readonly string[]).includes(previousOrderStatus ?? '');
    const nextIsNoDeduct = (STOCK_NO_DEDUCT_STATUSES as readonly string[]).includes(String(order.orderStatus || ''));
    const inventoryChanged = previousWasNoDeduct !== nextIsNoDeduct ||
      (Array.isArray(parsedOrderItems) && !nextIsNoDeduct);

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
      skipSoldCountBroadcast: inventoryChanged,
    });

    if (inventoryChanged) {
      // Cache invalidation must finish before the product_updated event; this avoids
      // the Product Table briefly showing the pre-deduction quantity.
      await broadcastProductStockUpdates([...stockAffectedProductIds]);
    }

    // Refresh the buyer's financial summary after the Order transaction commits.
    // This keeps Buyer Profile outstanding aligned with Order.amountPaid / totalAmount
    // instead of waiting for an asynchronous cache-side effect or a later page reload.
    const buyerFinancialFieldsChanged =
      sanitizedData.paymentStatus !== undefined ||
      sanitizedData.amountPaid !== undefined ||
      totalsChanged;
    if (buyerFinancialFieldsChanged && order.buyerId && order.userId != null) {
      try {
        await syncOrderToBuyerProfile(order.buyerId, order.userId);
      } catch (buyerSyncError) {
        console.error('[orders] Buyer outstanding refresh failed after order update:', buyerSyncError);
      }
    }

    // Build items from relational rows for response
    const enrichedOrderItemsUpdate = ((order as { orderItemsRel?: Array<{ productId: string | null; subtotal: number | { toNumber?: () => number; toString?: () => string } | unknown; packageQuantity?: number; packageType?: string; piecesPerPackage?: number; pricePerPackage?: number | { toNumber?: () => number; toString?: () => string } | null | unknown; product?: { name: string; productType: string; brand: string; description: string; images: string[] } | null; productImageSnapshot?: string | null; productNameSnapshot?: string; productSkuSnapshot?: string; productTypeSnapshot?: string }> }).orderItemsRel || []).map((oi) => ({
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
      images: oi.product?.images?.length
        ? oi.product.images
        : oi.productImageSnapshot
          ? [oi.productImageSnapshot]
          : [],
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
      amountPaid: (order as { amountPaid?: unknown }).amountPaid == null
        ? null
        : decimalToNumber((order as { amountPaid?: unknown }).amountPaid),
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
    if (error instanceof InsufficientOrderStockError) {
      return NextResponse.json(
        { error: error.message, code: 'insufficient_stock' },
        { status: 409, headers },
      );
    }
    const message = String(error instanceof Error ? error.message : error);
    const invalidStockType = message.startsWith('Stock type "');
    return NextResponse.json(
      { error: message || 'Failed to update order', code: invalidStockType ? 'invalid_stock_level' : 'order_update_failed' },
      { status: invalidStockType ? 400 : 500, headers },
    );
  }
}

