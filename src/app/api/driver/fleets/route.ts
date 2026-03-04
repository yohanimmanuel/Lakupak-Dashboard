import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSecurityHeaders } from '../../../../utils/auth-security';
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

export async function GET(req: NextRequest) {
  const headers = getSecurityHeaders();
  const payload = verifyDriverToken(req);
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers });
  if (payload.type !== 'driver') return NextResponse.json({ error: 'Invalid token type' }, { status: 403, headers });

  try {
    const fleets = await prisma.fleet.findMany({
      where: { driverId: payload.sub },
      select: {
        id: true,
        fleetCode: true,
        route: true,
        routeFrom: true,
        routeTo: true,
        status: true,
        deliveryType: true,
        eta: true,
        lastUpdate: true,
        vehicleType: true,
        vehicleMaxWeight: true,
        vehicleMaxVolume: true,
        totalOrders: true,
        deliveriesCompleted: true,
        loadPct: true,
        assignedOrderIds: true,
        customers: true,
        orders: {
          select: {
            orderId: true,
            storeName: true,
            contactPerson: true,
            contactPhone: true,
            deliveryAddress: true,
            orderStatus: true,
          },
        },
      },
      orderBy: { id: 'desc' },
    });

    return NextResponse.json({ fleets }, { status: 200, headers });
  } catch (error) {
    // Do not leak raw DB errors to the client
    console.error('[DriverFleets] Failed to fetch fleets for driver', payload.sub, error);
    return NextResponse.json({ error: 'Failed to load fleets' }, { status: 500, headers });
  }
}
