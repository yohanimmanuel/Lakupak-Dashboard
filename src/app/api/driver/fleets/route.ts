import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSecurityHeaders } from '../../../../utils/auth-security';
import jwt from 'jsonwebtoken';
import { parseMarketplaceUserIdFromBuyerId } from '@/utils/buyerSync';
import { buildFleetRouteStops } from '@/utils/fleetRouteStops';

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
        etaCompletionDate: true,
        etaCompletionTime: true,
        assignedDate: true,
        lastUpdate: true,
        vehicleType: true,
        vehicleBrand: true,
        vehicleModel: true,
        plateNumber: true,
        vehicleMaxWeight: true,
        vehicleMaxVolume: true,
        totalOrders: true,
        deliveriesCompleted: true,
        loadPct: true,
        assignedOrderIds: true,
        customers: true,
        driver: { select: { lastLat: true, lastLng: true } },
        orders: {
          select: {
            buyerId: true,
            orderId: true,
            storeName: true,
            contactPerson: true,
            contactPhone: true,
            deliveryAddress: true,
            orderStatus: true,
            returnCollectedAt: true,
            returnItemsReceivedAt: true,
            orderDate: true,
            preferredDeliveryDate: true,
            estimatedDeliveryDate: true,
            estimatedDeliveryMinDays: true,
            estimatedDeliveryMaxDays: true,
            orderItemsRel: {
              select: {
                productNameSnapshot: true,
                variantNameSnapshot: true,
                packageQuantity: true,
                packageType: true,
                piecesPerPackage: true,
                product: {
                  select: {
                    name: true,
                    images: true,
                  },
                },
              },
            },
          },
        },
      },
      orderBy: { id: 'desc' },
    });

    // Map buyerId -> MarketplaceUser profile (image + banner)
    const marketplaceUserIds = new Set<number>();
    for (const fleet of fleets) {
      for (const order of fleet.orders) {
        const marketplaceUserId = parseMarketplaceUserIdFromBuyerId(order.buyerId);
        if (marketplaceUserId !== null) {
          marketplaceUserIds.add(marketplaceUserId);
        }
      }
    }

    let marketplaceProfilesById = new Map<number, { image: string | null; bannerImage: string | null }>();
    if (marketplaceUserIds.size > 0) {
      const profiles = await prisma.marketplaceUser.findMany({
        where: { id: { in: Array.from(marketplaceUserIds) } },
        select: {
          id: true,
          image: true,
          bannerImage: true,
        },
      });
      marketplaceProfilesById = new Map(
        profiles.map((p) => [p.id, { image: p.image, bannerImage: p.bannerImage }]),
      );
    }

    const enrichedFleets = fleets.map((fleet) => {
      const { deliveryAddresses, deliveryStopsCompleted } = buildFleetRouteStops({
        assignedOrderIds: fleet.assignedOrderIds,
        orders: fleet.orders.map((o) => ({
          orderId: o.orderId,
          deliveryAddress: o.deliveryAddress,
          orderStatus: o.orderStatus,
        })),
      });

      return {
        ...fleet,
        deliveryAddresses,
        deliveryStopsCompleted,
        driverLat: fleet.driver?.lastLat ?? null,
        driverLng: fleet.driver?.lastLng ?? null,
        orders: fleet.orders.map((order) => {
          const marketplaceUserId = parseMarketplaceUserIdFromBuyerId(order.buyerId);
          const profile =
            marketplaceUserId !== null ? marketplaceProfilesById.get(marketplaceUserId) ?? null : null;
          const { buyerId, ...rest } = order;
          return {
            ...rest,
            buyerProfile: profile,
          };
        }),
      };
    });

    return NextResponse.json({ fleets: enrichedFleets }, { status: 200, headers });
  } catch (error) {
    // Do not leak raw DB errors to the client
    console.error('[DriverFleets] Failed to fetch fleets for driver', payload.sub, error);
    return NextResponse.json({ error: 'Failed to load fleets' }, { status: 500, headers });
  }
}
