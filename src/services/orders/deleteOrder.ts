import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import type { Prisma as PrismaTypes } from '@/lib/prisma-generated';
import { Prisma } from '@/lib/prisma-generated';
import { getOrderSecurityHeaders } from '@/utils/order-security';
import { orderUpdateRateLimiter } from '@/utils/rateLimiter';
import { reverseOfferUsage } from '@/utils/offerValidation';
import { broadcastOrderUpdate } from '@/utils/websocketBroadcast';
import { auditOrder } from '@/lib/audit';

export async function deleteOrderHandler(request: NextRequest) {
  const headers = getOrderSecurityHeaders();
  
  try {
    const body = await request.json();

    if (!body.orderId) {
      return NextResponse.json(
        { error: 'Missing orderId' },
        { status: 400, headers }
      );
    }
    
    // Validate order ID format
    const { validateOrderId } = await import('@/utils/order-security');
    if (!validateOrderId(String(body.orderId))) {
      return NextResponse.json(
        { error: 'Invalid order ID format' },
        { status: 400, headers }
      );
    }

    const { getAuthenticatedUserId } = await import('@/utils/auth-helpers');
    const authenticatedUserId = await getAuthenticatedUserId(request);
    const requestingUserId = authenticatedUserId;

    // Apply rate limiting for order deletions: use authenticated user id when available,
    // otherwise fall back to IP-based limiting inside the limiter.
    const rateLimitResponse = await orderUpdateRateLimiter(request, authenticatedUserId ?? null);
    if (rateLimitResponse) {
      return rateLimitResponse;
    }

    if (!requestingUserId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers });
    }

    const existingOrder = await prisma.order.findUnique({
      where: { orderId: String(body.orderId) },
      select: { userId: true },
    });
    if (!existingOrder) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404, headers });
    }

    if (existingOrder.userId !== requestingUserId) {
      // Allow platform admins (cookie-based) to delete any order.
      try {
        const { requirePlatformAdminId } = await import('@/utils/platform-admin-auth');
        requirePlatformAdminId(request);
      } catch {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403, headers });
      }
    }

    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await reverseOfferUsage(body.orderId, tx);

      await tx.orderItem.deleteMany({
        where: { orderId: body.orderId },
      });

      const orderIdStr = String(body.orderId);
      const fleetsWithJson = await tx.fleet.findMany({
        where: {
          OR: [
            { assignedOrderIds: { array_contains: [orderIdStr] } },
            { completedOrderIds: { array_contains: [orderIdStr] } },
          ],
        },
        select: {
          id: true,
          assignedOrderIds: true,
          completedOrderIds: true,
          customers: true,
        },
      });

      for (const fleet of fleetsWithJson) {
        const assigned: string[] = Array.isArray(fleet.assignedOrderIds)
          ? (fleet.assignedOrderIds as string[])
          : [];
        const completed: string[] = Array.isArray(fleet.completedOrderIds)
          ? (fleet.completedOrderIds as string[])
          : [];
        const customers: { storeName?: string; contactName?: string; orderId?: string }[] = Array.isArray(
          fleet.customers,
        )
          ? (fleet.customers as { storeName?: string; contactName?: string; orderId?: string }[])
          : [];

        const nextAssigned: string[] = [];
        const nextCustomers: typeof customers = [];
        const usedCustomerIndexes = new Set<number>();
        const remainingAssigned = assigned.filter((id) => id !== body.orderId);
        const remainingAssignedSet = new Set(remainingAssigned);

        assigned.forEach((id, index) => {
          if (id === body.orderId) return;
          nextAssigned.push(id);

          const byOrderIdIndex = customers.findIndex((c) => c.orderId && c.orderId === id);
          if (byOrderIdIndex >= 0) {
            nextCustomers.push(customers[byOrderIdIndex]);
            usedCustomerIndexes.add(byOrderIdIndex);
            return;
          }

          // Fallback: pick any remaining customer record that hasn't been used yet
          // and doesn't belong to the deleted orderId. Avoid assuming array indexes align.
          const fallbackIndex = customers.findIndex((c, i) => {
            if (usedCustomerIndexes.has(i)) return false;
            if (c.orderId && c.orderId === body.orderId) return false;
            // If customer has an orderId, only keep it if that orderId is still assigned.
            if (c.orderId && !remainingAssignedSet.has(c.orderId)) return false;
            return true;
          });
          if (fallbackIndex >= 0) {
            nextCustomers.push(customers[fallbackIndex]);
            usedCustomerIndexes.add(fallbackIndex);
            return;
          }

          console.warn('[Orders] Fleet customers mapping missing for orderId', {
            fleetId: fleet.id,
            orderId: id,
          });
        });

        const nextCompleted = completed.filter((id) => id !== body.orderId);

        const shouldUpdate =
          nextAssigned.length !== assigned.length ||
          nextCompleted.length !== completed.length ||
          nextCustomers.length !== customers.length;

        if (shouldUpdate) {
          await tx.fleet.update({
            where: { id: fleet.id },
            data: {
              assignedOrderIds: nextAssigned as PrismaTypes.InputJsonValue,
              completedOrderIds: nextCompleted as PrismaTypes.InputJsonValue,
              customers: nextCustomers as PrismaTypes.InputJsonValue,
            },
          });
        }
      }

      await tx.order.delete({
        where: { orderId: body.orderId },
      });
    });

    try {
      if (body.orderId) {
        await broadcastOrderUpdate([String(body.orderId)]);
      }
    } catch (error) {
      console.warn('[Orders] Post-delete broadcast/cache failed:', {
        orderId: body.orderId,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    if (existingOrder.userId) {
      try {
        const { invalidateDashboardCache } = await import('@/lib/queryCache');
        await invalidateDashboardCache(existingOrder.userId);
      } catch (error) {
        console.warn('[Orders] Post-delete cache invalidation failed:', {
          userId: existingOrder.userId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    auditOrder(request, {
      action: 'delete',
      resourceId: String(body.orderId),
      actorId: requestingUserId,
      actorType: 'dashboard',
    });

    return NextResponse.json({ message: 'Order deleted successfully' }, { headers });
  } catch {
    return NextResponse.json(
      { error: 'Failed to delete order' },
      { status: 500, headers }
    );
  }
}

