import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import type { PrismaClient } from '@prisma/client';
import { Prisma } from '@/lib/prisma-generated';
import { getSecurityHeaders } from '../../../../../../utils/auth-security';
import jwt from 'jsonwebtoken';
import { broadcastOrderUpdate, broadcastNotification } from '@/utils/websocketBroadcast';
import { NotificationService } from '@/app/api/graphql/modules/notifications';
import { driverMutationRateLimiter } from '@/utils/rateLimiter';
import { auditOrder } from '@/lib/audit';
import {
  restoreStockForOrderItems,
  STOCK_NO_DEDUCT_STATUSES,
  type StockNotificationJob,
} from '@/services/orders/utils';

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET is not set');
  return secret;
}

function verifyDriverToken(req: NextRequest): { sub: number; type: string } | null {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;
  try {
    const decoded = jwt.verify(authHeader.slice(7), getJwtSecret());
    if (!decoded || typeof decoded !== 'object') return null;
    const payload = decoded as Record<string, unknown>;
    if (typeof payload.type !== 'string') return null;
    let sub: number;
    if (typeof payload.sub === 'number') {
      sub = payload.sub;
    } else if (typeof payload.sub === 'string') {
      sub = parseInt(payload.sub, 10);
    } else {
      return null;
    }
    if (!Number.isFinite(sub) || Math.floor(sub) !== sub) return null;
    return { sub, type: payload.type };
  } catch {
    return null;
  }
}

const DRIVER_ALLOWED_STATUSES = ['Shipped', 'Delivered', 'Failed'] as const;

/** Valid target states per current order status. Driver can only transition from Packed or Shipped. */
const ALLOWED_TRANSITIONS: Record<string, readonly string[]> = {
  Packed: ['Shipped', 'Failed'],
  Shipped: ['Delivered', 'Failed'],
  // Pending, Confirmed, Delivered, Failed, Cancelled, Returned: no valid driver transitions
};

type OrderFailedReasonModel = {
  create: (args: {
    data: {
      orderId: string;
      driverId: number | null;
      reason: string;
      detail: string | null;
      imageUrls: string[];
    };
  }) => Promise<unknown>;
};

function getOrderFailedReasonModel(client: PrismaClient): OrderFailedReasonModel | null {
  const candidate = (client as PrismaClient & { orderFailedReason?: OrderFailedReasonModel }).orderFailedReason;
  if (!candidate || typeof candidate.create !== 'function') return null;
  return candidate;
}

async function verifyDriverOrderAccess(
  orderId: string,
  driverId: number,
  headers: Record<string, string>,
) {
  const order = await prisma.order.findFirst({
    where: { orderId: orderId.trim() },
    include: {
      fleet: {
        select: { id: true, driverId: true, fleetCode: true },
      },
    },
  });

  if (!order) {
    return { error: NextResponse.json({ error: 'Order not found' }, { status: 404, headers }) };
  }
  if (!order.fleet) {
    return { error: NextResponse.json({ error: 'Order is not assigned to a fleet' }, { status: 403, headers }) };
  }
  if (order.fleet.driverId !== driverId) {
    return { error: NextResponse.json({ error: 'Order not in your assigned fleet' }, { status: 403, headers }) };
  }

  return { order };
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ orderId: string }> }
) {
  const headers = getSecurityHeaders();
  const payload = verifyDriverToken(req);
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers });
  if (payload.type !== 'driver') return NextResponse.json({ error: 'Invalid token type' }, { status: 403, headers });

  const rateLimitResponse = await driverMutationRateLimiter(req, payload.sub, 'order-status');
  if (rateLimitResponse) return rateLimitResponse;

  const { orderId } = await params;
  if (!orderId?.trim()) {
    return NextResponse.json({ error: 'Order ID required' }, { status: 400, headers });
  }

  let body: {
    orderStatus?: string;
    collectReturn?: boolean;
    failureReason?: string;
    pod?: string;
    returnPod?: string;
    failureProof?: string;
    failureEvidenceUrls?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400, headers });
  }

  const collectReturn = body.collectReturn === true;
  const orderStatus = typeof body.orderStatus === 'string' ? body.orderStatus.trim() : undefined;
  const failureReason = typeof body.failureReason === 'string' ? body.failureReason.trim() : undefined;
  const pod = typeof body.pod === 'string' ? body.pod.trim() : undefined;
  const returnPod = typeof body.returnPod === 'string' ? body.returnPod.trim() : undefined;
  const failureProof = typeof body.failureProof === 'string' ? body.failureProof.trim() : undefined;
  const rawEvidenceUrls = body.failureEvidenceUrls;
  let failureEvidenceUrls: string[] = [];
  if (Array.isArray(rawEvidenceUrls)) {
    failureEvidenceUrls = rawEvidenceUrls
      .filter((u): u is string => typeof u === 'string')
      .map((u) => u.trim())
      .filter(Boolean);
  }
  if (failureEvidenceUrls.length === 0 && failureProof) {
    failureEvidenceUrls = [failureProof];
  }

  if (collectReturn) {
    try {
      const access = await verifyDriverOrderAccess(orderId, payload.sub, headers);
      if (access.error) return access.error;
      const order = access.order!;

      const collectedAt = new Date();
      const result = await prisma.order.updateMany({
        where: {
          orderId: orderId.trim(),
          orderStatus: 'Returned',
          returnCollectedAt: null,
        },
        data: {
          returnCollectedAt: collectedAt,
          ...(returnPod ? { returnPod } : {}),
        },
      });

      if (result.count === 0) {
        const current = await prisma.order.findUnique({
          where: { orderId: orderId.trim() },
          select: { orderStatus: true },
        });
        if (!current || current.orderStatus !== 'Returned') {
          return NextResponse.json(
            { error: 'Return collection is only available for Returned orders' },
            { status: 400, headers },
          );
        }
        return NextResponse.json({ error: 'Return items already collected' }, { status: 400, headers });
      }

      const updated = await prisma.order.findUniqueOrThrow({
        where: { orderId: orderId.trim() },
      });

      try {
        await broadcastOrderUpdate([updated.orderId]);
      } catch {
        // best-effort
      }

      if (updated.userId) {
        try {
          const fleetCode = order.fleet?.fleetCode ?? null;
          await NotificationService.createDriverStatusNotification(
            updated.userId,
            updated.orderId,
            fleetCode,
            'ReturnCollected',
          );
        } catch {
          // ignore notification errors
        }
      }

      auditOrder(req, {
        action: 'return_collected',
        resourceId: updated.orderId,
        actorId: payload.sub,
        actorType: 'driver',
      });

      return NextResponse.json(
        {
          success: true,
          returnCollectedAt: updated.returnCollectedAt?.toISOString() ?? null,
        },
        { status: 200, headers },
      );
    } catch (error) {
      console.error('[DriverOrderStatus] Failed to collect return', orderId, error);
      return NextResponse.json({ error: 'Failed to collect return' }, { status: 500, headers });
    }
  }

  if (!orderStatus || !DRIVER_ALLOWED_STATUSES.includes(orderStatus as (typeof DRIVER_ALLOWED_STATUSES)[number])) {
    return NextResponse.json(
      { error: 'orderStatus must be one of: Shipped, Delivered, Failed' },
      { status: 400, headers }
    );
  }

  try {
    const access = await verifyDriverOrderAccess(orderId, payload.sub, headers);
    if (access.error) return access.error;
    const order = access.order!;

    const currentStatus = order.orderStatus;
    const allowed = ALLOWED_TRANSITIONS[currentStatus];
    if (!allowed || !allowed.includes(orderStatus)) {
      return NextResponse.json(
        {
          error: `Invalid transition: order status "${currentStatus}" cannot be changed to "${orderStatus}"`,
        },
        { status: 400, headers }
      );
    }

    const updateData: {
      orderStatus: string;
      deliveredAt?: Date;
      deliveryConfirmation?: string;
      pod?: string;
      cancellationReason?: string;
    } = {
      orderStatus,
      deliveryConfirmation:
        orderStatus === 'Shipped' ? 'in_transit' : orderStatus === 'Delivered' ? 'delivered' : 'failed',
    };
    if (orderStatus === 'Delivered') {
      updateData.deliveredAt = new Date();
      if (pod) updateData.pod = pod;
    }
    if (orderStatus === 'Failed' && failureReason) {
      const evidenceNote =
        failureEvidenceUrls.length > 0
          ? ` (${failureEvidenceUrls.length} photo${failureEvidenceUrls.length === 1 ? '' : 's'})`
          : '';
      updateData.cancellationReason = `[Delivery failed] ${failureReason}${evidenceNote}`;
    }

    // A driver-marked "Failed" delivery moves the order OUT of a stock-deducted status
    // (Packed/Shipped) into Failed (no-deduct), so the reserved inventory must be returned.
    // Do the restore + status write atomically to avoid losing stock on this path.
    const shouldRestoreStock =
      orderStatus === 'Failed' &&
      !(STOCK_NO_DEDUCT_STATUSES as readonly string[]).includes(currentStatus);

    const { updated, stockNotificationJobs } = await prisma.$transaction(
      async (tx: Prisma.TransactionClient) => {
        const stockJobs: StockNotificationJob[] = [];

        if (shouldRestoreStock) {
          const itemsForStockRestore = await tx.orderItem.findMany({
            where: { orderId: orderId.trim() },
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

        const updatedOrder = await tx.order.update({
          where: { orderId: orderId.trim() },
          data: updateData,
        });

        return { updated: updatedOrder, stockNotificationJobs: stockJobs };
      },
    );

    // Notify the distributor of any low-stock threshold crossed by the restore (best-effort).
    for (const job of stockNotificationJobs) {
      try {
        await NotificationService.checkAndNotifyStockLevel(
          job.userId,
          job.productId,
          job.productName,
          job.previousStock,
          job.newStock,
          job.lowStockThreshold,
          job.variantName,
          job.variantOptionId,
        );
      } catch {
        // best-effort
      }
    }

    // Broadcast order update so marketplace + dashboards refresh
    try {
      await broadcastOrderUpdate([updated.orderId]);
    } catch {
      // best-effort
    }

    // Dashboard order notifications for distributor user
    if (updated.userId) {
      try {
        const storeName = updated.storeName || 'Unknown Store';
        await NotificationService.createOrderNotification(
          updated.userId,
          updated.orderId,
          updated.orderStatus,
          storeName,
          Number(updated.totalAmount ?? 0),
        );

        // Additional driver-to-dashboard notification with explicit wording
        const fleetCode = order.fleet?.fleetCode ?? null;
        if (orderStatus === 'Shipped' || orderStatus === 'Delivered' || orderStatus === 'Failed') {
          await NotificationService.createDriverStatusNotification(
            updated.userId,
            updated.orderId,
            fleetCode,
            orderStatus,
            failureReason,
          );
        }
      } catch {
        // ignore notification errors
      }
    }

    // Record structured failed reason when driver marks delivery as Failed
    if (orderStatus === 'Failed') {
      try {
        const model = getOrderFailedReasonModel(prisma);
        if (model) {
          await model.create({
            data: {
              orderId: updated.orderId,
              driverId: order.fleet?.driverId ?? null,
              // Store the human-readable failure reason selected by the driver.
              reason: failureReason || 'Delivery failed',
              detail: failureReason ? `Driver reported: ${failureReason}` : null,
              imageUrls: failureEvidenceUrls,
            },
          });
        }
      } catch {
        // best-effort only
      }
    }

    // Marketplace buyer push/websocket notification
    try {
      const { parseMarketplaceUserIdFromBuyerId } = await import('@/utils/buyerSync');
      const { sendExpoPushToMarketplaceUser } = await import('@/utils/expoPush');
      const marketplaceUserId = parseMarketplaceUserIdFromBuyerId(updated.buyerId);

      if (marketplaceUserId != null) {
        const { translateMarketplaceBuyerOrderFromDriverApp } = await import('@/utils/marketplacePushTranslations');
        const driverPushTranslations = translateMarketplaceBuyerOrderFromDriverApp({
          orderId: updated.orderId,
          orderStatus: String(updated.orderStatus),
        });
        const payload = { orderId: updated.orderId, orderStatus: updated.orderStatus, type: 'order' };
        const { tokenCount } = await sendExpoPushToMarketplaceUser(
          marketplaceUserId,
          driverPushTranslations,
          payload,
        );
        if (tokenCount === 0) {
          await broadcastNotification(
            'order',
            driverPushTranslations.en.title,
            driverPushTranslations.en.body,
            payload,
            marketplaceUserId,
            'marketplace',
          );
        }
      }
    } catch {
      // ignore marketplace notification failures
    }

    auditOrder(req, {
      action: 'status_change',
      resourceId: updated.orderId,
      actorId: payload.sub,
      actorType: 'driver',
      metadata: {
        fromStatus: currentStatus,
        toStatus: orderStatus,
        ...(failureReason ? { failureReason } : {}),
      },
    });

    return NextResponse.json({ success: true, orderStatus: updated.orderStatus }, { status: 200, headers });
  } catch (error) {
    console.error('[DriverOrderStatus] Failed to update order', orderId, error);
    return NextResponse.json({ error: 'Failed to update order status' }, { status: 500, headers });
  }
}
