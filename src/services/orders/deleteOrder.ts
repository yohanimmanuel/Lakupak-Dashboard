import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import type { Prisma as PrismaTypes } from '@/lib/prisma-generated';
import { Prisma } from '@/lib/prisma-generated';
import { getOrderSecurityHeaders, validateOrderId } from '@/utils/order-security';
import { orderUpdateRateLimiter } from '@/utils/rateLimiter';
import { broadcastOrderUpdate } from '@/utils/websocketBroadcast';
import { auditOrder } from '@/lib/audit';

type FleetCustomer = { storeName?: string; contactName?: string; orderId?: string };

async function reverseOfferUsageForOrderBatch(
  tx: PrismaTypes.TransactionClient,
  orderIds: string[],
): Promise<void> {
  const orders = await tx.order.findMany({
    where: { orderId: { in: orderIds } },
    select: {
      orderId: true,
      userId: true,
      buyerId: true,
      orderItemsRel: {
        where: { offerApplied: true },
        select: { offerIdSnapshot: true, discountAmount: true },
      },
    },
  });
  const offerKeys = Array.from(new Set(orders.flatMap((order) =>
    order.orderItemsRel.map((item) => item.offerIdSnapshot?.trim()).filter((key): key is string => Boolean(key)),
  )));
  if (offerKeys.length === 0) return;

  const offers = await tx.offer.findMany({
    where: { OR: [{ id: { in: offerKeys } }, { offerId: { in: offerKeys } }] },
    select: { id: true, offerId: true, userId: true, buyerId: true, totalUsage: true },
  });
  const deltas = new Map<string, { usageCount: number; discountAmount: number }>();

  for (const order of orders) {
    for (const item of order.orderItemsRel) {
      const key = item.offerIdSnapshot?.trim();
      if (!key) continue;
      const offer = offers.find((candidate) =>
        (candidate.id === key || candidate.offerId === key) &&
        (order.userId == null || candidate.userId === order.userId) &&
        (!order.buyerId || candidate.buyerId === order.buyerId),
      );
      if (!offer) continue;
      const current = deltas.get(offer.id) ?? { usageCount: 0, discountAmount: 0 };
      current.usageCount += 1;
      current.discountAmount += Number(item.discountAmount ?? 0);
      deltas.set(offer.id, current);
    }
  }

  const updates = offers.flatMap((offer) => {
    const delta = deltas.get(offer.id);
    if (!delta) return [];
    return [{
      id: offer.id,
      usageCount: Math.min(Math.max(0, offer.totalUsage), delta.usageCount),
      discountAmount: Math.round(delta.discountAmount * 100) / 100,
    }];
  }).sort((a, b) => a.id.localeCompare(b.id));
  if (updates.length === 0) return;

  // One set-based reversal replaces per-order/per-line offer lookups and writes.
  await tx.$executeRaw`
    UPDATE "Offer" AS offer
    SET
      "totalUsage" = GREATEST(0, offer."totalUsage" - batch."usageCount"),
      "totalDiscountGiven" = offer."totalDiscountGiven" - batch."discountAmount",
      "updatedAt" = NOW()
    FROM (VALUES ${Prisma.join(updates.map((update) => Prisma.sql`(${update.id}, ${update.usageCount}, ${update.discountAmount}::numeric)`))})
      AS batch("id", "usageCount", "discountAmount")
    WHERE offer."id" = batch."id"
  `;
}

function normalizeOrderIds(body: Record<string, unknown>): string[] {
  const input = Array.isArray(body.orderIds) ? body.orderIds : [body.orderId];
  return Array.from(new Set(input
    .filter((value): value is string => typeof value === 'string')
    .map((value) => value.trim())
    .filter(Boolean)));
}

export async function deleteOrderHandler(request: NextRequest) {
  const headers = getOrderSecurityHeaders();

  try {
    const body = await request.json() as Record<string, unknown>;
    const rawOrderIds = Array.isArray(body.orderIds) ? body.orderIds : [body.orderId];
    if (rawOrderIds.some((value) => typeof value !== 'string' || !value.trim())) {
      return NextResponse.json({ error: 'Every selected order must have a valid order ID.', code: 'invalid_bulk_selection' }, { status: 400, headers });
    }
    const orderIds = normalizeOrderIds(body);
    if (orderIds.length === 0 || orderIds.length > 100) {
      return NextResponse.json(
        { error: 'Select between 1 and 100 orders.', code: 'invalid_bulk_selection' },
        { status: 400, headers },
      );
    }
    const invalidId = orderIds.find((orderId) => !validateOrderId(orderId));
    if (invalidId) {
      return NextResponse.json({ error: `Invalid order ID format: ${invalidId}`, code: 'invalid_order_id' }, { status: 400, headers });
    }

    const { getAuthenticatedUserId } = await import('@/utils/auth-helpers');
    const authenticatedUserId = await getAuthenticatedUserId(request);
    const rateLimitResponse = await orderUpdateRateLimiter(request, authenticatedUserId ?? null);
    if (rateLimitResponse) return rateLimitResponse;
    if (!authenticatedUserId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers });
    }

    let isPlatformAdmin = false;
    try {
      const { requirePlatformAdminId } = await import('@/utils/platform-admin-auth');
      requirePlatformAdminId(request);
      isPlatformAdmin = true;
    } catch {
      // Normal dashboard users remain constrained to their own orders.
    }

    const ownerWhere = isPlatformAdmin ? {} : { userId: authenticatedUserId };
    const existingOrders = await prisma.order.findMany({
      where: { orderId: { in: orderIds }, ...ownerWhere },
      select: { orderId: true, userId: true },
    });
    if (existingOrders.length !== orderIds.length) {
      return NextResponse.json(
        { error: 'One or more selected orders were not found or are not accessible.', code: 'order_not_found_or_forbidden' },
        { status: 404, headers },
      );
    }

    const deletedOrderIds = await prisma.$transaction(async (tx: PrismaTypes.TransactionClient) => {
      // Lock the full batch before reversing offer usage or deleting related records.
      await tx.$queryRaw<Array<{ orderId: string }>>`
        SELECT "orderId" FROM "Order"
        WHERE "orderId" IN (${Prisma.join([...orderIds].sort())})
        ORDER BY "orderId" FOR UPDATE
      `;

      const lockedOrders = await tx.order.findMany({
        where: { orderId: { in: orderIds }, ...ownerWhere },
        select: { orderId: true },
      });
      if (lockedOrders.length !== orderIds.length) {
        throw new Error('One or more selected orders changed or are no longer accessible.');
      }

      // Reverse offer counters for the complete selected set with batched reads
      // and one set-based write, still inside the delete transaction.
      await reverseOfferUsageForOrderBatch(tx, orderIds);

      await tx.orderItem.deleteMany({ where: { orderId: { in: orderIds } } });

      const orderIdSet = new Set(orderIds);
      const fleets = await tx.fleet.findMany({
        where: {
          OR: orderIds.flatMap((orderId) => [
            { assignedOrderIds: { array_contains: [orderId] } },
            { completedOrderIds: { array_contains: [orderId] } },
          ]),
        },
        orderBy: { id: 'asc' },
        select: { id: true, assignedOrderIds: true, completedOrderIds: true, customers: true },
      });

      const fleetUpdates: Array<{
        id: number;
        assignedOrderIds: string[];
        completedOrderIds: string[];
        customers: FleetCustomer[];
      }> = [];
      for (const fleet of fleets) {
        const assigned = Array.isArray(fleet.assignedOrderIds) ? fleet.assignedOrderIds as string[] : [];
        const completed = Array.isArray(fleet.completedOrderIds) ? fleet.completedOrderIds as string[] : [];
        const customers = Array.isArray(fleet.customers) ? fleet.customers as FleetCustomer[] : [];
        const nextAssigned = assigned.filter((id) => !orderIdSet.has(id));
        const nextCompleted = completed.filter((id) => !orderIdSet.has(id));
        const usedCustomerIndexes = new Set<number>();
        const nextCustomers: FleetCustomer[] = [];

        // Keep customer/order associations stable when fleet arrays contain legacy
        // customer objects without an explicit orderId.
        for (const remainingId of nextAssigned) {
          const exactIndex = customers.findIndex((customer, index) =>
            !usedCustomerIndexes.has(index) && customer.orderId === remainingId,
          );
          if (exactIndex >= 0) {
            nextCustomers.push(customers[exactIndex]);
            usedCustomerIndexes.add(exactIndex);
            continue;
          }
          const fallbackIndex = customers.findIndex((customer, index) =>
            !usedCustomerIndexes.has(index) &&
            (!customer.orderId || (nextAssigned.includes(customer.orderId) && !orderIdSet.has(customer.orderId))),
          );
          if (fallbackIndex >= 0) {
            nextCustomers.push(customers[fallbackIndex]);
            usedCustomerIndexes.add(fallbackIndex);
          }
        }

        const changed = nextAssigned.length !== assigned.length ||
          nextCompleted.length !== completed.length || nextCustomers.length !== customers.length;
        if (changed) {
          fleetUpdates.push({
            id: fleet.id,
            assignedOrderIds: nextAssigned,
            completedOrderIds: nextCompleted,
            customers: nextCustomers,
          });
        }
      }

      if (fleetUpdates.length > 0) {
        await tx.$executeRaw`
          UPDATE "Fleet" AS fleet
          SET
            "assignedOrderIds" = batch."assignedOrderIds",
            "completedOrderIds" = batch."completedOrderIds",
            "customers" = batch."customers",
            "updatedAt" = NOW()
          FROM (VALUES ${Prisma.join(fleetUpdates.map((update) => Prisma.sql`(
            ${update.id},
            ${JSON.stringify(update.assignedOrderIds)}::jsonb,
            ${JSON.stringify(update.completedOrderIds)}::jsonb,
            ${JSON.stringify(update.customers)}::jsonb
          )`))}) AS batch("id", "assignedOrderIds", "completedOrderIds", "customers")
          WHERE fleet."id" = batch."id"
        `;
      }

      const deletion = await tx.order.deleteMany({
        where: { orderId: { in: orderIds }, ...ownerWhere },
      });
      if (deletion.count !== orderIds.length) {
        throw new Error('The selected orders could not all be deleted.');
      }
      return orderIds;
    }, { maxWait: 10_000, timeout: 30_000 });

    try {
      await broadcastOrderUpdate(deletedOrderIds);
    } catch (error) {
      console.warn('[Orders] Post-delete batch broadcast/cache failed:', {
        count: deletedOrderIds.length,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    const ownerIds = Array.from(new Set(existingOrders.map((order) => order.userId).filter((id): id is number => id != null)));
    try {
      const { invalidateDashboardCache } = await import('@/lib/queryCache');
      await Promise.all(ownerIds.map((userId) => invalidateDashboardCache(userId)));
    } catch (error) {
      console.warn('[Orders] Post-delete batch cache invalidation failed:', error);
    }

    auditOrder(request, {
      action: 'delete',
      actorId: authenticatedUserId,
      actorType: 'dashboard',
      metadata: { bulk: deletedOrderIds.length > 1, count: deletedOrderIds.length, orderIds: deletedOrderIds },
    });

    return NextResponse.json({
      success: true,
      message: deletedOrderIds.length === 1 ? 'Order deleted successfully' : 'Orders deleted successfully',
      deletedOrderIds,
      count: deletedOrderIds.length,
    }, { headers });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to delete selected orders.';
    return NextResponse.json({ error: message, code: 'bulk_delete_failed' }, { status: 500, headers });
  }
}
