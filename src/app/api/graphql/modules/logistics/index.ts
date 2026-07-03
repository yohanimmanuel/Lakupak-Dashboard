import bcrypt from 'bcryptjs';
import { type Prisma } from '@/lib/db';
import { prisma } from '../common/prisma';
import { sanitizePagination, buildPaginationInfo } from '../common/utils';
import { broadcastNotification } from '@/utils/websocketBroadcast';
import { sendExpoPushToDriver } from '@/utils/expoPush';
import { translateDriverFleetAssigned, translateDriverOrdersAdded } from '@/utils/driverPushTranslations';
import { scheduleFleetOrderAssignmentSideEffects } from '@/services/logistics/fleetOrderSyncSideEffects';
import { buildFleetRouteStops, parseFleetJsonStringArray } from '@/utils/fleetRouteStops';
import { requireDashboardUser } from '../common/auth';

type DbClient = Pick<typeof prisma, 'order'>;

const DEFAULT_ASSIGNED_LOGISTICS_LABEL = 'Distributor Fleet';

type TxWithOrder = Pick<Prisma.TransactionClient, 'order'>;

/** Build a single Date from fleet etaCompletionDate + etaCompletionTime for Order.estimatedDeliveryDate. */
function buildEtaCompletionDate(
  etaCompletionDate: Date | null,
  etaCompletionTime: string | null,
): Date | null {
  if (!etaCompletionDate) return null;
  const d = new Date(etaCompletionDate.getTime());
  const time = (etaCompletionTime ?? '').trim();
  if (time) {
    const match = time.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?/);
    if (match) {
      d.setUTCHours(parseInt(match[1], 10), parseInt(match[2], 10), match[3] ? parseInt(match[3], 10) : 0, 0);
    }
  }
  return d;
}

/** When a fleet's ETA completion is set/updated or cleared, sync Order.estimatedDeliveryDate for all orders assigned to that fleet. */
async function syncFleetEtaToOrders(
  fleetId: number,
  etaCompletionDate: Date | null,
  etaCompletionTime: string | null,
  tx: TxWithOrder,
): Promise<void> {
  const date = buildEtaCompletionDate(etaCompletionDate, etaCompletionTime);
  await tx.order.updateMany({
    where: { fleetId },
    data: { estimatedDeliveryDate: date },
  });
}

/** Sync Order.fleetId, Order.trackingNumber, and Order.assignedLogistics when a fleet's assignedOrderIds changes. */
async function syncOrdersToFleet(
  fleetId: number,
  fleetCode: string,
  assignedOrderIds: string[],
  tx?: DbClient,
  userId?: number,
  assignedLogisticsLabel?: string | null,
) {
  const orderIds = assignedOrderIds.filter((id): id is string => typeof id === 'string' && id.length > 0);
  const logisticsLabel =
    assignedLogisticsLabel != null && assignedLogisticsLabel.trim().length > 0
      ? assignedLogisticsLabel.trim()
      : DEFAULT_ASSIGNED_LOGISTICS_LABEL;

  const run = async (db: DbClient) => {
    if (orderIds.length > 0) {
      const alreadyAssigned = await db.order.findMany({
        where: {
          orderId: { in: orderIds },
          fleetId: { not: null },
          ...(userId !== undefined && { userId }),
        },
        select: { orderId: true, fleetId: true },
      });
      const assignedToOther = alreadyAssigned.filter((o) => o.fleetId !== fleetId);
      if (assignedToOther.length > 0) {
        throw new Error(
          `Orders already assigned to another fleet: ${assignedToOther.map((o) => o.orderId).join(', ')}`,
        );
      }
    }
    await db.order.updateMany({
      where: {
        fleetId,
        orderId: { notIn: orderIds },
        ...(userId !== undefined && { userId }),
      },
      data: { fleetId: null, trackingNumber: null, assignedLogistics: null },
    });
    if (orderIds.length > 0) {
      await db.order.updateMany({
        where: {
          orderId: { in: orderIds },
          ...(userId !== undefined && { userId }),
        },
        data: { fleetId, trackingNumber: fleetCode, assignedLogistics: logisticsLabel },
      });
    }
  };

  if (tx) {
    await run(tx);
  } else {
    await prisma.$transaction(run);
  }
}

// ============================================================================ //
// TYPE DEFS
// ============================================================================ //

export const logisticsTypeDefs = /* GraphQL */ `
  type FleetCustomer {
    storeName: String
    contactName: String
  }

  type Driver {
    id: String!
    name: String!
    phone: String
    experience: String
    status: String
    avatar: String
    username: String!
    fleetCount: Int
    createdAt: String
    updatedAt: String
  }

  type Fleet {
    id: String!
    orderCode: String!
    route: String!
    status: String!
    deliveryType: String
    etaCompletionDate: String
    etaCompletionTime: String
    assignedDate: String
    lastUpdate: String!
    driver: Driver
    driverId: String
    driverName: String
    driverPhone: String
    driverExperience: String
    driverStatus: String
    driverAvatar: String
    driverUsername: String
    driverLat: Float
    driverLng: Float
    driverLocationAt: String
    totalOrders: Int
    deliveriesCompleted: Int
    customers: [FleetCustomer!]
    vehicleType: String
    loadPct: Int
    paymentTerms: String
    vehicleBrand: String
    vehicleModel: String
    plateNumber: String
    vehicleMaxWeight: Int
    vehicleMaxVolume: Float
    assignedLogistics: String
    assignedOrderIds: [String!]
    completedOrderIds: [String!]
    deliveryAddresses: [String!]
    deliveryStopsCompleted: [Boolean!]
    createdAt: String
    updatedAt: String
  }

  type FleetConnection {
    nodes: [Fleet!]!
    pagination: PaginationInfo!
  }

  input FleetCustomerInput {
    storeName: String
    contactName: String
  }

  input DriverInput {
    name: String!
    phone: String
    experience: String
    status: String
    avatar: String
    username: String!
    password: String!
  }

  input UpdateDriverInput {
    name: String
    phone: String
    experience: String
    status: String
    avatar: String
    username: String
    password: String
  }

  input CreateFleetInput {
    fleetCode: String!
    route: String!
    routeFrom: String
    routeTo: String
    status: String!
    deliveryType: String
    etaCompletionDate: String
    etaCompletionTime: String
    assignedDate: String
    lastUpdate: String!
    driverId: String
    driverInput: DriverInput
    vehicleType: String
    vehicleBrand: String
    vehicleModel: String
    plateNumber: String
    vehicleMaxWeight: Int
    vehicleMaxVolume: Float
    loadPct: Int
    paymentTerms: String
    totalOrders: Int
    deliveriesCompleted: Int
    assignedLogistics: String
    assignedOrderIds: [String!]
    completedOrderIds: [String!]
    customers: [FleetCustomerInput!]
  }

  input UpdateFleetInput {
    route: String
    routeFrom: String
    routeTo: String
    status: String
    deliveryType: String
    etaCompletionDate: String
    etaCompletionTime: String
    assignedDate: String
    lastUpdate: String
    driverId: String
    driverInput: UpdateDriverInput
    vehicleType: String
    vehicleBrand: String
    vehicleModel: String
    plateNumber: String
    vehicleMaxWeight: Int
    vehicleMaxVolume: Float
    loadPct: Int
    paymentTerms: String
    totalOrders: Int
    deliveriesCompleted: Int
    assignedLogistics: String
    assignedOrderIds: [String!]
    completedOrderIds: [String!]
    customers: [FleetCustomerInput!]
  }

  extend type Query {
    fleets(
      userId: Int!
      page: Int = 1
      limit: Int = 50
      status: String
      deliveryType: String
      search: String
    ): FleetConnection!
    fleet(userId: Int!, id: String!): Fleet
    drivers(userId: Int!): [Driver!]!
    driver(userId: Int!, id: String!): Driver
  }

  extend type Mutation {
    createFleet(userId: Int!, input: CreateFleetInput!): Fleet!
    updateFleet(userId: Int!, id: String!, input: UpdateFleetInput!): Fleet!
    deleteFleet(userId: Int!, id: String!): DeleteFleetResult!
    createDriver(userId: Int!, input: DriverInput!): Driver!
    updateDriver(userId: Int!, id: String!, input: UpdateDriverInput!): Driver!
    deleteDriver(userId: Int!, id: String!): Boolean!
  }

  type DeleteFleetResult {
    success: Boolean!
    deleted: Fleet
  }
`;

// ============================================================================ //
// HELPERS
// ============================================================================ //

function validateDriverPassword(password: string): void {
  if (password.length < 8) throw new Error('Driver password must be at least 8 characters long.');
  if (password.length > 128) throw new Error('Driver password is too long (max 128 characters).');
  const hasUpper   = /[A-Z]/.test(password);
  const hasLower   = /[a-z]/.test(password);
  const hasNumber  = /\d/.test(password);
  const hasSpecial = /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(password);
  if (!hasUpper || !hasLower || !hasNumber || !hasSpecial) {
    throw new Error(
      'Driver password must include at least one uppercase letter, one lowercase letter, one digit, and one special character.',
    );
  }
}

function parseJsonStringArray(val: unknown): string[] {
  return parseFleetJsonStringArray(val);
}

function parseJsonCustomers(val: unknown): { storeName?: string; contactName?: string }[] {
  if (Array.isArray(val)) {
    return val.map((x) => ({
      storeName: typeof (x as { storeName?: string }).storeName === 'string' ? (x as { storeName: string }).storeName : undefined,
      contactName: typeof (x as { contactName?: string }).contactName === 'string' ? (x as { contactName: string }).contactName : undefined,
    }));
  }
  if (typeof val === 'string') {
    try {
      const arr = JSON.parse(val) as unknown;
      return Array.isArray(arr) ? parseJsonCustomers(arr) : [];
    } catch { return []; }
  }
  return [];
}

type DriverRow = {
  id: number;
  name: string;
  phone: string | null;
  experience: string | null;
  status: string | null;
  avatar: string | null;
  username: string;
  lastLat: number | null;
  lastLng: number | null;
  lastLocationAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  _count?: { fleets: number };
};

function mapDriver(row: DriverRow) {
  return {
    id: String(row.id),
    name: row.name,
    phone: row.phone ?? null,
    experience: row.experience ?? null,
    status: row.status ?? null,
    avatar: row.avatar ?? null,
    username: row.username,
    fleetCount: row._count?.fleets ?? null,
    createdAt: row.createdAt?.toISOString?.() ?? null,
    updatedAt: row.updatedAt?.toISOString?.() ?? null,
  };
}

type FleetRow = {
  id: number;
  fleetCode: string;
  route: string;
  status: string;
  deliveryType: string | null;
  etaCompletionDate: Date | null;
  etaCompletionTime: string | null;
  assignedDate: Date | null;
  lastUpdate: string;
  totalOrders: number | null;
  deliveriesCompleted: number | null;
  assignedLogistics: string | null;
  customers: unknown;
  vehicleType: string | null;
  loadPct: number | null;
  paymentTerms: string | null;
  vehicleBrand: string | null;
  vehicleModel: string | null;
  plateNumber: string | null;
  vehicleMaxWeight: number | null;
  vehicleMaxVolume: number | null;
  assignedOrderIds: unknown;
  completedOrderIds: unknown;
  createdAt: Date;
  updatedAt: Date;
  driver: DriverRow | null;
  orders: { orderId: string; deliveryAddress: string | null; orderStatus: string }[];
};

function mapFleet(row: FleetRow) {
  const existingOrderIds = new Set(row.orders?.map((o) => o.orderId) ?? []);

  const rawAssigned = parseJsonStringArray(row.assignedOrderIds);
  const rawCompleted = parseJsonStringArray(row.completedOrderIds);
  const rawCustomers = parseJsonCustomers(row.customers);

  const assignedOrderIds: string[] = [];
  const customers: ReturnType<typeof parseJsonCustomers> = [];

  rawAssigned.forEach((orderId, index) => {
    if (!existingOrderIds.has(orderId)) return;
    assignedOrderIds.push(orderId);
    if (rawCustomers[index]) customers.push(rawCustomers[index]);
  });

  const completedOrderIds = rawCompleted.filter((id) => existingOrderIds.has(id));

  const { deliveryAddresses, deliveryStopsCompleted } = buildFleetRouteStops({
    assignedOrderIds: row.assignedOrderIds,
    orders: row.orders ?? [],
  });

  const d = row.driver;
  return {
    id: String(row.id),
    orderCode: row.fleetCode,
    route: row.route,
    status: row.status,
    deliveryType: row.deliveryType ?? null,
    etaCompletionDate: row.etaCompletionDate?.toISOString?.() ?? null,
    etaCompletionTime: row.etaCompletionTime ?? null,
    assignedDate: row.assignedDate ? row.assignedDate.toISOString().slice(0, 10) : null,
    lastUpdate: row.lastUpdate,
    driverId: d ? String(d.id) : null,
    driverName: d?.name ?? '',
    driverPhone: d?.phone ?? null,
    driverExperience: d?.experience ?? null,
    driverStatus: d?.status ?? null,
    driverAvatar: d?.avatar ?? null,
    driverUsername: d?.username ?? null,
    driverLat: d?.lastLat ?? null,
    driverLng: d?.lastLng ?? null,
    driverLocationAt: d?.lastLocationAt?.toISOString() ?? null,
    driver: d ? mapDriver(d) : null,
    totalOrders: row.totalOrders ?? null,
    deliveriesCompleted: row.deliveriesCompleted ?? null,
    assignedLogistics: row.assignedLogistics ?? null,
    customers,
    vehicleType: row.vehicleType ?? null,
    loadPct: row.loadPct ?? null,
    paymentTerms: row.paymentTerms ?? null,
    vehicleBrand: row.vehicleBrand ?? null,
    vehicleModel: row.vehicleModel ?? null,
    plateNumber: row.plateNumber ?? null,
    vehicleMaxWeight: row.vehicleMaxWeight ?? null,
    vehicleMaxVolume: row.vehicleMaxVolume ?? null,
    assignedOrderIds,
    completedOrderIds,
    deliveryAddresses,
    deliveryStopsCompleted,
    createdAt: row.createdAt?.toISOString?.() ?? null,
    updatedAt: row.updatedAt?.toISOString?.() ?? null,
  };
}

const FLEET_INCLUDE = {
  driver: true,
  orders: { select: { orderId: true, deliveryAddress: true, orderStatus: true } },
} as const;

// ============================================================================ //
// RESOLVERS
// ============================================================================ //

export const logisticsResolvers = {
  Query: {
    async fleets(
      _: unknown,
      args: { userId: number; page?: number; limit?: number; status?: string; deliveryType?: string; search?: string },
      ctx: unknown,
    ) {
      requireDashboardUser(ctx, args.userId);
      const { userId, page = 1, limit = 50, status, deliveryType, search } = args;
      const { page: p, limit: l } = sanitizePagination(page, limit, 100);

      const where: Prisma.FleetWhereInput = { userId };
      if (status && status.trim()) where.status = status.trim();
      if (deliveryType && deliveryType.trim()) where.deliveryType = deliveryType.trim();
      if (search && search.trim()) {
        where.OR = [
          { fleetCode: { contains: search.trim(), mode: 'insensitive' } },
          { route: { contains: search.trim(), mode: 'insensitive' } },
          { driver: { name: { contains: search.trim(), mode: 'insensitive' } } },
        ];
      }

      const [nodes, totalCount] = await Promise.all([
        prisma.fleet.findMany({ where, include: FLEET_INCLUDE, orderBy: { updatedAt: 'desc' }, skip: (p - 1) * l, take: l }),
        prisma.fleet.count({ where }),
      ]);

      return {
        nodes: nodes.map(mapFleet),
        pagination: buildPaginationInfo(p, l, totalCount),
      };
    },

    async fleet(_: unknown, args: { userId: number; id: string }, ctx: unknown) {
      requireDashboardUser(ctx, args.userId);
      const { userId, id } = args;
      const numId = parseInt(id, 10);
      if (!Number.isInteger(numId) || numId <= 0) return null;
      const row = await prisma.fleet.findFirst({ where: { id: numId, userId }, include: FLEET_INCLUDE });
      return row ? mapFleet(row) : null;
    },

    async drivers(_: unknown, args: { userId: number }, ctx: unknown) {
      requireDashboardUser(ctx, args.userId);
      const rows = await prisma.driver.findMany({
        where: { userId: args.userId },
        include: { _count: { select: { fleets: true } } },
        orderBy: { name: 'asc' },
      });
      return rows.map(mapDriver);
    },

    async driver(_: unknown, args: { userId: number; id: string }, ctx: unknown) {
      requireDashboardUser(ctx, args.userId);
      const numId = parseInt(args.id, 10);
      if (!Number.isInteger(numId) || numId <= 0) return null;
      const row = await prisma.driver.findFirst({
        where: { id: numId, userId: args.userId },
        include: { _count: { select: { fleets: true } } },
      });
      return row ? mapDriver(row) : null;
    },
  },

  Mutation: {
    async createFleet(_: unknown, args: { userId: number; input: Record<string, unknown> }, ctx: unknown) {
      requireDashboardUser(ctx, args.userId);
      const { userId, input } = args;
      const assignedIds = Array.isArray(input.assignedOrderIds) ? (input.assignedOrderIds as string[]) : [];

      // Resolve driver: link existing, optionally update its fields, or create a new one
      let existingDriverId: number | null = null;
      let newDriverData: Prisma.DriverUncheckedCreateInput | null = null;
      // Staged field-level update for an existing driver (driverId + driverInput together)
      let existingDriverUpdate: Record<string, unknown> | null = null;

      if (input.driverId) {
        const driverId = parseInt(input.driverId as string, 10);
        if (!Number.isInteger(driverId) || driverId <= 0) throw new Error('Invalid driver ID.');
        const existing = await prisma.driver.findFirst({ where: { id: driverId, userId } });
        if (!existing) throw new Error('Driver not found or does not belong to your account.');
        existingDriverId = driverId;

        // When driverInput is also present, stage an update for the linked driver
        if (input.driverInput) {
          const di = input.driverInput as Record<string, unknown>;
          const updateData: Record<string, unknown> = {};
          if (di.name !== undefined)       updateData.name       = di.name as string;
          if (di.phone !== undefined)      updateData.phone      = (di.phone as string) || null;
          if (di.experience !== undefined) updateData.experience = (di.experience as string) || null;
          if (di.status !== undefined)     updateData.status     = (di.status as string) || null;
          if (di.avatar !== undefined)     updateData.avatar     = (di.avatar as string) || null;
          if (di.username !== undefined)   updateData.username   = (di.username as string) || null;
          if (di.password !== undefined) {
            const rawPw = di.password as string;
            if (rawPw !== rawPw.trim()) throw new Error('Driver password must not start or end with spaces.');
            validateDriverPassword(rawPw);
            updateData.passwordHash = await bcrypt.hash(rawPw, 12);
          }
          if (Object.keys(updateData).length > 0) existingDriverUpdate = updateData;
        }
      } else if (input.driverInput) {
        const di = input.driverInput as Record<string, unknown>;
        const rawPassword = typeof di.password === 'string' ? di.password : '';
        if (!rawPassword) throw new Error('Driver password is required.');
        if (rawPassword !== rawPassword.trim()) throw new Error('Driver password must not start or end with spaces.');
        validateDriverPassword(rawPassword);
        const passwordHash = await bcrypt.hash(rawPassword, 12);
        // Stage data for creation inside the transaction so it can roll back with the fleet
        newDriverData = {
          userId,
          name: (di.name as string) ?? '',
          phone: (di.phone as string) || null,
          experience: (di.experience as string) || null,
          status: (di.status as string) || null,
          avatar: (di.avatar as string) || null,
          username: (di.username as string) ?? '',
          passwordHash,
        };
      } else {
        throw new Error('Either driverId or driverInput must be provided.');
      }

      const row = await prisma.$transaction(async (tx) => {
        // Resolve final driverId and apply any staged driver changes inside the transaction
        let resolvedDriverId: number;
        if (existingDriverId != null) {
          resolvedDriverId = existingDriverId;
          // Apply inline edits to the existing driver atomically with the fleet creation
          if (existingDriverUpdate) {
            await tx.driver.update({ where: { id: resolvedDriverId }, data: existingDriverUpdate });
          }
        } else if (newDriverData) {
          const createdDriver = await tx.driver.create({ data: newDriverData });
          resolvedDriverId = createdDriver.id;
        } else {
          throw new Error('Either driverId or driverInput must be provided.');
        }

        const etaCompletionDateInput = input.etaCompletionDate as string | undefined;
        const etaCompletionTimeInput = input.etaCompletionTime as string | undefined;
        const etaCompletionDate = etaCompletionDateInput
          ? new Date(etaCompletionDateInput)
          : null;
        const etaCompletionTime = (etaCompletionTimeInput?.trim() ?? null) || null;
        const assignedDateInput = input.assignedDate as string | undefined;
        const assignedDate = assignedDateInput
          ? (() => { const d = new Date(assignedDateInput); return isNaN(d.getTime()) ? null : d; })()
          : null;

        const created = await tx.fleet.create({
          data: {
            userId,
            driverId: resolvedDriverId,
            fleetCode: (input.fleetCode as string) ?? '',
            route: (input.route as string) ?? '',
            routeFrom: (input.routeFrom as string) || null,
            routeTo: (input.routeTo as string) || null,
            status: (input.status as string) ?? 'In Transit',
            deliveryType: (input.deliveryType as string) || null,
            etaCompletionDate: isNaN(etaCompletionDate?.getTime() ?? NaN) ? null : etaCompletionDate,
            etaCompletionTime,
            assignedDate,
            lastUpdate: (input.lastUpdate as string) ?? 'Just now',
            vehicleType: (input.vehicleType as string) || null,
            vehicleBrand: (input.vehicleBrand as string) || null,
            vehicleModel: (input.vehicleModel as string) || null,
            plateNumber: (input.plateNumber as string) || null,
            vehicleMaxWeight: typeof input.vehicleMaxWeight === 'number' ? input.vehicleMaxWeight : null,
            vehicleMaxVolume: typeof input.vehicleMaxVolume === 'number' ? input.vehicleMaxVolume : null,
            loadPct: typeof input.loadPct === 'number' ? input.loadPct : null,
            paymentTerms: (input.paymentTerms as string) || null,
            totalOrders: typeof input.totalOrders === 'number' ? input.totalOrders : null,
            deliveriesCompleted: typeof input.deliveriesCompleted === 'number' ? input.deliveriesCompleted : null,
            assignedLogistics: (input.assignedLogistics as string) || null,
            assignedOrderIds: Array.isArray(input.assignedOrderIds) ? input.assignedOrderIds : undefined,
            completedOrderIds: Array.isArray(input.completedOrderIds) ? input.completedOrderIds : undefined,
            customers: Array.isArray(input.customers) ? input.customers : undefined,
          },
          include: FLEET_INCLUDE,
        });
        await syncOrdersToFleet(created.id, created.fleetCode, assignedIds, tx, userId, created.assignedLogistics);
        if (created.etaCompletionDate != null) {
          await syncFleetEtaToOrders(created.id, created.etaCompletionDate, created.etaCompletionTime, tx);
        }
        return created;
      });

      if (row.driverId) {
        broadcastNotification(
          'fleet_assigned',
          'New fleet assigned',
          `Fleet ${row.fleetCode} has been assigned to you.`,
          { fleetId: row.id, fleetCode: row.fleetCode },
          row.driverId,
        ).catch(() => {});
      }

      if (assignedIds.length > 0) {
        scheduleFleetOrderAssignmentSideEffects(assignedIds, [], row.fleetCode).catch(() => {});
      }

      return mapFleet(row);
    },

    async updateFleet(_: unknown, args: { userId: number; id: string; input: Record<string, unknown> }, ctx: unknown) {
      requireDashboardUser(ctx, args.userId);
      const { userId, id, input } = args;
      const numId = parseInt(id, 10);
      if (!Number.isInteger(numId) || numId <= 0) throw new Error('Invalid fleet id');

      const existingFleet = await prisma.fleet.findFirst({
        where: { id: numId, userId },
        select: { driverId: true, assignedOrderIds: true, fleetCode: true },
      });
      if (!existingFleet) throw new Error('Fleet not found');

      // Resolve driver changes
      let driverIdUpdate: number | undefined;

      if (input.driverId !== undefined) {
        const driverId = parseInt(input.driverId as string, 10);
        if (!Number.isInteger(driverId) || driverId <= 0) throw new Error('Invalid driver ID.');
        const driver = await prisma.driver.findFirst({ where: { id: driverId, userId } });
        if (!driver) throw new Error('Driver not found or does not belong to your account.');
        driverIdUpdate = driverId;
      }

      const row = await prisma.$transaction(async (tx) => {
        // Optionally update current driver's fields in-place when driverInput is provided
        if (input.driverInput) {
          const targetDriverId = driverIdUpdate ?? existingFleet.driverId;
          if (targetDriverId) {
            // Ensure the target driver actually belongs to this user
            const driverOwnerCheck = await tx.driver.findFirst({
              where: { id: targetDriverId, userId },
              select: { id: true },
            });
            if (!driverOwnerCheck) throw new Error('Driver not found or does not belong to your account.');

            const di = input.driverInput as Record<string, unknown>;
            const driverData: Record<string, unknown> = {};
            if (di.name !== undefined) driverData.name = di.name as string;
            if (di.phone !== undefined) driverData.phone = (di.phone as string) || null;
            if (di.experience !== undefined) driverData.experience = (di.experience as string) || null;
            if (di.status !== undefined) driverData.status = (di.status as string) || null;
            if (di.avatar !== undefined) driverData.avatar = (di.avatar as string) || null;
            if (di.username !== undefined) driverData.username = (di.username as string) || null;
            if (di.password !== undefined) {
              const rawPw = di.password as string;
              if (rawPw !== rawPw.trim()) throw new Error('Driver password must not start or end with spaces.');
              validateDriverPassword(rawPw);
              driverData.passwordHash = await bcrypt.hash(rawPw, 12);
            }
            if (Object.keys(driverData).length > 0) {
              await tx.driver.update({ where: { id: targetDriverId }, data: driverData });
            }
          }
        }

        const updated = await tx.fleet.update({
          where: { id: numId },
          data: {
            ...(driverIdUpdate !== undefined && { driverId: driverIdUpdate }),
            ...(input.route !== undefined && { route: input.route as string }),
            ...(input.routeFrom !== undefined && { routeFrom: input.routeFrom as string }),
            ...(input.routeTo !== undefined && { routeTo: input.routeTo as string }),
            ...(input.status !== undefined && { status: input.status as string }),
            ...(input.deliveryType !== undefined && { deliveryType: input.deliveryType as string }),
            ...(input.etaCompletionDate !== undefined && {
              etaCompletionDate: (() => {
                const v = input.etaCompletionDate as string | null;
                if (v == null || v === '') return null;
                const d = new Date(v);
                return isNaN(d.getTime()) ? null : d;
              })(),
            }),
            ...(input.etaCompletionTime !== undefined && {
              etaCompletionTime: (input.etaCompletionTime as string) || null,
            }),
            ...(input.assignedDate !== undefined && {
              assignedDate: (() => {
                const v = input.assignedDate as string | null;
                if (v == null || v === '') return null;
                const d = new Date(v);
                return isNaN(d.getTime()) ? null : d;
              })(),
            }),
            ...(input.lastUpdate !== undefined && { lastUpdate: input.lastUpdate as string }),
            ...(input.vehicleType !== undefined && { vehicleType: input.vehicleType as string }),
            ...(input.vehicleBrand !== undefined && { vehicleBrand: input.vehicleBrand as string }),
            ...(input.vehicleModel !== undefined && { vehicleModel: input.vehicleModel as string }),
            ...(input.plateNumber !== undefined && { plateNumber: input.plateNumber as string }),
            ...(input.vehicleMaxWeight !== undefined && { vehicleMaxWeight: input.vehicleMaxWeight as number }),
            ...(input.vehicleMaxVolume !== undefined && { vehicleMaxVolume: input.vehicleMaxVolume as number }),
            ...(input.loadPct !== undefined && { loadPct: input.loadPct as number }),
            ...(input.paymentTerms !== undefined && { paymentTerms: input.paymentTerms as string }),
            ...(input.totalOrders !== undefined && { totalOrders: input.totalOrders as number }),
            ...(input.deliveriesCompleted !== undefined && { deliveriesCompleted: input.deliveriesCompleted as number }),
            ...(input.assignedLogistics !== undefined && { assignedLogistics: input.assignedLogistics as string }),
            ...(input.assignedOrderIds !== undefined && { assignedOrderIds: input.assignedOrderIds as Prisma.InputJsonValue }),
            ...(input.completedOrderIds !== undefined && { completedOrderIds: input.completedOrderIds as Prisma.InputJsonValue }),
            ...(input.customers !== undefined && { customers: input.customers as Prisma.InputJsonValue }),
          },
          include: FLEET_INCLUDE,
        });
        if (input.assignedOrderIds !== undefined) {
          const assignedIds = Array.isArray(input.assignedOrderIds) ? (input.assignedOrderIds as string[]) : [];
          await syncOrdersToFleet(numId, updated.fleetCode, assignedIds, tx, userId, updated.assignedLogistics);
        }
        if (input.etaCompletionDate !== undefined || input.etaCompletionTime !== undefined) {
          const date = updated.etaCompletionDate ?? null;
          const time = updated.etaCompletionTime ?? null;
          await syncFleetEtaToOrders(numId, date, time, tx);
        }
        return updated;
      });

      if (driverIdUpdate && driverIdUpdate !== existingFleet.driverId) {
        const fleetCode = row.fleetCode;
        const route = row.route ?? '';
        // Push notification (Expo) + WebSocket broadcast in parallel — both best-effort
        sendExpoPushToDriver(
          driverIdUpdate,
          translateDriverFleetAssigned({ fleetCode, route }),
          { type: 'fleet_assigned', fleetId: String(row.id), fleetCode },
        ).catch(() => {});
        broadcastNotification(
          'fleet_assigned',
          'New fleet assigned',
          `Fleet ${fleetCode} has been assigned to you.`,
          { fleetId: row.id, fleetCode },
          driverIdUpdate,
        ).catch(() => {});
      }

      // Notify driver when completion checklist or fleet status changes (not assignedOrderIds — orders_added handles that).
      const affectsDriverRoute =
        input.completedOrderIds !== undefined ||
        input.status !== undefined;

      if (affectsDriverRoute && row.driverId && row.driverId !== 0) {
        broadcastNotification(
          'fleet_updated',
          'Route updated',
          `Delivery route for fleet ${row.fleetCode} was updated.`,
          { fleetId: row.id, fleetCode: row.fleetCode, hint: 'refetch' },
          row.driverId,
        ).catch(() => {});
      }

      if (input.assignedOrderIds !== undefined) {
        const prevAssigned = parseJsonStringArray(existingFleet.assignedOrderIds);
        const prevSet = new Set(prevAssigned);
        const nextAssigned = Array.isArray(input.assignedOrderIds) ? (input.assignedOrderIds as string[]) : [];
        const nextSet = new Set(nextAssigned);
        const addedOrderIds = nextAssigned.filter((id) => !prevSet.has(id));
        const removedOrderIds = prevAssigned.filter((id) => !nextSet.has(id));

        scheduleFleetOrderAssignmentSideEffects(addedOrderIds, removedOrderIds, row.fleetCode).catch(
          () => {},
        );

        // Notify driver when orders are added to an already-assigned fleet
        if (addedOrderIds.length > 0 && row.driverId && row.driverId !== 0) {
          sendExpoPushToDriver(
            row.driverId,
            translateDriverOrdersAdded({ fleetCode: row.fleetCode, count: addedOrderIds.length }),
            { type: 'orders_added', fleetId: String(row.id), fleetCode: row.fleetCode },
          ).catch(() => {});
          broadcastNotification(
            'orders_added',
            'Orders added',
            `New orders were added to fleet ${row.fleetCode}.`,
            { fleetId: row.id, fleetCode: row.fleetCode, hint: 'refetch' },
            row.driverId,
          ).catch(() => {});
        }
      }

      return mapFleet(row);
    },

    async deleteFleet(_: unknown, args: { userId: number; id: string }, ctx: unknown) {
      requireDashboardUser(ctx, args.userId);
      const { userId, id } = args;
      const numId = parseInt(id, 10);
      if (!Number.isInteger(numId) || numId <= 0) throw new Error('Invalid fleet id');
      const existing = await prisma.fleet.findFirst({ where: { id: numId, userId } });
      if (!existing) throw new Error('Fleet not found');
      const deleted = await prisma.$transaction(async (tx) => {
        await tx.order.updateMany({
          where: { fleetId: numId },
          data: { fleetId: null, trackingNumber: null, assignedLogistics: null },
        });
        return tx.fleet.delete({ where: { id: numId }, include: FLEET_INCLUDE });
      });
      return { success: true, deleted: mapFleet(deleted) };
    },

    // ---- Driver mutations ----

    async createDriver(_: unknown, args: { userId: number; input: Record<string, unknown> }, ctx: unknown) {
      requireDashboardUser(ctx, args.userId);
      const { userId, input } = args;
      const rawPassword = typeof input.password === 'string' ? input.password : '';
      if (!rawPassword) throw new Error('Driver password is required.');
      if (rawPassword !== rawPassword.trim()) throw new Error('Driver password must not start or end with spaces.');
      validateDriverPassword(rawPassword);
      const passwordHash = await bcrypt.hash(rawPassword, 12);
      const row = await prisma.driver.create({
        data: {
          userId,
          name: (input.name as string) ?? '',
          phone: (input.phone as string) || null,
          experience: (input.experience as string) || null,
          status: (input.status as string) || null,
          avatar: (input.avatar as string) || null,
          username: (input.username as string) ?? '',
          passwordHash,
        },
        include: { _count: { select: { fleets: true } } },
      });
      return mapDriver(row);
    },

    async updateDriver(_: unknown, args: { userId: number; id: string; input: Record<string, unknown> }, ctx: unknown) {
      requireDashboardUser(ctx, args.userId);
      const { userId, id, input } = args;
      const numId = parseInt(id, 10);
      if (!Number.isInteger(numId) || numId <= 0) throw new Error('Invalid driver id');
      const existing = await prisma.driver.findFirst({ where: { id: numId, userId } });
      if (!existing) throw new Error('Driver not found');

      const data: Record<string, unknown> = {};
      if (input.name !== undefined) data.name = input.name as string;
      if (input.phone !== undefined) data.phone = (input.phone as string) || null;
      if (input.experience !== undefined) data.experience = (input.experience as string) || null;
      if (input.status !== undefined) data.status = (input.status as string) || null;
      if (input.avatar !== undefined) data.avatar = (input.avatar as string) || null;
      if (input.username !== undefined) data.username = (input.username as string) || null;
      if (input.password !== undefined) {
        const rawPw = input.password as string;
        if (rawPw !== rawPw.trim()) throw new Error('Driver password must not start or end with spaces.');
        validateDriverPassword(rawPw);
        data.passwordHash = await bcrypt.hash(rawPw, 12);
      }

      const row = await prisma.driver.update({
        where: { id: numId },
        data,
        include: { _count: { select: { fleets: true } } },
      });
      return mapDriver(row);
    },

    async deleteDriver(_: unknown, args: { userId: number; id: string }, ctx: unknown) {
      requireDashboardUser(ctx, args.userId);
      const { userId, id } = args;
      const numId = parseInt(id, 10);
      if (!Number.isInteger(numId) || numId <= 0) throw new Error('Invalid driver id');
      const existing = await prisma.driver.findFirst({ where: { id: numId, userId } });
      if (!existing) throw new Error('Driver not found');
      // Unlink from fleets and delete driver atomically
      await prisma.$transaction(async (tx) => {
        await tx.fleet.updateMany({ where: { driverId: numId }, data: { driverId: null } });
        await tx.driver.delete({ where: { id: numId } });
      });
      return true;
    },
  },
};
