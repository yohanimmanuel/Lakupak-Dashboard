import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSecurityHeaders } from '../../../../../../utils/auth-security';
import jwt from 'jsonwebtoken';

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

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ orderId: string }> }
) {
  const headers = getSecurityHeaders();
  const payload = verifyDriverToken(req);
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers });
  if (payload.type !== 'driver') return NextResponse.json({ error: 'Invalid token type' }, { status: 403, headers });

  const { orderId } = await params;
  if (!orderId?.trim()) {
    return NextResponse.json({ error: 'Order ID required' }, { status: 400, headers });
  }

  let body: { orderStatus?: string; failureReason?: string; pod?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400, headers });
  }

  const orderStatus = typeof body.orderStatus === 'string' ? body.orderStatus.trim() : undefined;
  const failureReason = typeof body.failureReason === 'string' ? body.failureReason.trim() : undefined;
  const pod = typeof body.pod === 'string' ? body.pod.trim() : undefined;
  if (!orderStatus || !DRIVER_ALLOWED_STATUSES.includes(orderStatus as (typeof DRIVER_ALLOWED_STATUSES)[number])) {
    return NextResponse.json(
      { error: 'orderStatus must be one of: Shipped, Delivered, Failed' },
      { status: 400, headers }
    );
  }

  try {
    const order = await prisma.order.findFirst({
      where: { orderId: orderId.trim() },
      include: {
        fleet: {
          select: { id: true, driverId: true },
        },
      },
    });

    if (!order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404, headers });
    }
    if (!order.fleet) {
      return NextResponse.json({ error: 'Order is not assigned to a fleet' }, { status: 403, headers });
    }
    if (order.fleet.driverId !== payload.sub) {
      return NextResponse.json({ error: 'Order not in your assigned fleet' }, { status: 403, headers });
    }

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
      updateData.cancellationReason = `[Delivery failed] ${failureReason}`;
    }

    await prisma.order.update({
      where: { orderId: orderId.trim() },
      data: updateData,
    });

    return NextResponse.json({ success: true, orderStatus }, { status: 200, headers });
  } catch (error) {
    console.error('[DriverOrderStatus] Failed to update order', orderId, error);
    return NextResponse.json({ error: 'Failed to update order status' }, { status: 500, headers });
  }
}
