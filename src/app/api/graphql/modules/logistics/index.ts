import { prisma } from '../common/prisma';
import { sanitizePagination, buildPaginationInfo } from '../common/utils';

// ============================================================================ //
// TYPE DEFS
// ============================================================================ //

export const logisticsTypeDefs = /* GraphQL */ `
  type FleetCustomer {
    storeName: String
    contactName: String
  }

  type Fleet {
    id: String!
    orderCode: String!
    route: String!
    status: String!
    deliveryType: String
    eta: String!
    lastUpdate: String!
    driverName: String!
    totalOrders: Int
    deliveriesCompleted: Int
    customers: [FleetCustomer!]
    vehicleType: String
    loadPct: Int
    paymentTerms: String
    vehicleBrand: String
    vehicleModel: String
    vehicleMaxWeight: Int
    vehicleMaxVolume: Float
    driverPhone: String
    driverExperience: String
    driverStatus: String
    driverAvatar: String
    assignedOrderIds: [String!]
    completedOrderIds: [String!]
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

  input CreateFleetInput {
    fleetCode: String!
    route: String!
    routeFrom: String
    routeTo: String
    status: String!
    deliveryType: String
    eta: String!
    lastUpdate: String!
    driverName: String!
    driverPhone: String
    driverExperience: String
    driverStatus: String
    driverAvatar: String
    vehicleType: String
    vehicleBrand: String
    vehicleModel: String
    vehicleMaxWeight: Int
    vehicleMaxVolume: Float
    loadPct: Int
    paymentTerms: String
    totalOrders: Int
    deliveriesCompleted: Int
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
    eta: String
    lastUpdate: String
    driverName: String
    driverPhone: String
    driverExperience: String
    driverStatus: String
    driverAvatar: String
    vehicleType: String
    vehicleBrand: String
    vehicleModel: String
    vehicleMaxWeight: Int
    vehicleMaxVolume: Float
    loadPct: Int
    paymentTerms: String
    totalOrders: Int
    deliveriesCompleted: Int
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
  }

  extend type Mutation {
    createFleet(userId: Int!, input: CreateFleetInput!): Fleet!
    updateFleet(userId: Int!, id: String!, input: UpdateFleetInput!): Fleet!
  }
`;

// ============================================================================ //
// HELPERS
// ============================================================================ //

function parseJsonStringArray(val: unknown): string[] {
  if (Array.isArray(val)) return val.filter((x): x is string => typeof x === 'string');
  if (typeof val === 'string') {
    try {
      const arr = JSON.parse(val) as unknown;
      return Array.isArray(arr) ? arr.filter((x): x is string => typeof x === 'string') : [];
    } catch {
      return [];
    }
  }
  return [];
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
    } catch {
      return [];
    }
  }
  return [];
}

function mapFleet(row: {
  id: number;
  fleetCode: string;
  route: string;
  status: string;
  deliveryType: string | null;
  eta: string;
  lastUpdate: string;
  driverName: string;
  totalOrders: number | null;
  deliveriesCompleted: number | null;
  customers: unknown;
  vehicleType: string | null;
  loadPct: number | null;
  paymentTerms: string | null;
  vehicleBrand: string | null;
  vehicleModel: string | null;
  vehicleMaxWeight: number | null;
  vehicleMaxVolume: number | null;
  driverPhone: string | null;
  driverExperience: string | null;
  driverStatus: string | null;
  driverAvatar: string | null;
  assignedOrderIds: unknown;
  completedOrderIds: unknown;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: String(row.id),
    orderCode: row.fleetCode,
    route: row.route,
    status: row.status,
    deliveryType: row.deliveryType ?? null,
    eta: row.eta,
    lastUpdate: row.lastUpdate,
    driverName: row.driverName,
    totalOrders: row.totalOrders ?? null,
    deliveriesCompleted: row.deliveriesCompleted ?? null,
    customers: parseJsonCustomers(row.customers),
    vehicleType: row.vehicleType ?? null,
    loadPct: row.loadPct ?? null,
    paymentTerms: row.paymentTerms ?? null,
    vehicleBrand: row.vehicleBrand ?? null,
    vehicleModel: row.vehicleModel ?? null,
    vehicleMaxWeight: row.vehicleMaxWeight ?? null,
    vehicleMaxVolume: row.vehicleMaxVolume ?? null,
    driverPhone: row.driverPhone ?? null,
    driverExperience: row.driverExperience ?? null,
    driverStatus: row.driverStatus ?? null,
    driverAvatar: row.driverAvatar ?? null,
    assignedOrderIds: parseJsonStringArray(row.assignedOrderIds),
    completedOrderIds: parseJsonStringArray(row.completedOrderIds),
    createdAt: row.createdAt?.toISOString?.() ?? null,
    updatedAt: row.updatedAt?.toISOString?.() ?? null,
  };
}

// ============================================================================ //
// RESOLVERS
// ============================================================================ //

export const logisticsResolvers = {
  Query: {
    async fleets(
      _: unknown,
      args: {
        userId: number;
        page?: number;
        limit?: number;
        status?: string;
        deliveryType?: string;
        search?: string;
      }
    ) {
      const { userId, page = 1, limit = 50, status, deliveryType, search } = args;
      const { page: p, limit: l } = sanitizePagination(page, limit, 100);

      const where: { userId: number; status?: string; deliveryType?: string; OR?: unknown[] } = {
        userId,
      };
      if (status && status.trim()) where.status = status.trim();
      if (deliveryType && deliveryType.trim()) where.deliveryType = deliveryType.trim();
      if (search && search.trim()) {
        where.OR = [
          { fleetCode: { contains: search.trim(), mode: 'insensitive' } },
          { route: { contains: search.trim(), mode: 'insensitive' } },
          { driverName: { contains: search.trim(), mode: 'insensitive' } },
        ];
      }

      const [nodes, totalCount] = await Promise.all([
        prisma.fleet.findMany({
          where,
          orderBy: { updatedAt: 'desc' },
          skip: (p - 1) * l,
          take: l,
        }),
        prisma.fleet.count({ where }),
      ]);

      return {
        nodes: nodes.map(mapFleet),
        pagination: buildPaginationInfo(p, l, totalCount),
      };
    },

    async fleet(_: unknown, args: { userId: number; id: string }) {
      const { userId, id } = args;
      const numId = parseInt(id, 10);
      if (!Number.isInteger(numId) || numId <= 0) return null;
      const row = await prisma.fleet.findFirst({
        where: { id: numId, userId },
      });
      return row ? mapFleet(row) : null;
    },
  },

  Mutation: {
    async createFleet(_: unknown, args: { userId: number; input: Record<string, unknown> }) {
      const { userId, input } = args;
      const row = await prisma.fleet.create({
        data: {
          userId,
          fleetCode: (input.fleetCode as string) ?? '',
          route: (input.route as string) ?? '',
          routeFrom: (input.routeFrom as string) ?? undefined,
          routeTo: (input.routeTo as string) ?? undefined,
          status: (input.status as string) ?? 'In Transit',
          deliveryType: (input.deliveryType as string) ?? undefined,
          eta: (input.eta as string) ?? '',
          lastUpdate: (input.lastUpdate as string) ?? 'Just now',
          driverName: (input.driverName as string) ?? '',
          driverPhone: (input.driverPhone as string) ?? undefined,
          driverExperience: (input.driverExperience as string) ?? undefined,
          driverStatus: (input.driverStatus as string) ?? undefined,
          driverAvatar: (input.driverAvatar as string) ?? undefined,
          vehicleType: (input.vehicleType as string) ?? undefined,
          vehicleBrand: (input.vehicleBrand as string) ?? undefined,
          vehicleModel: (input.vehicleModel as string) ?? undefined,
          vehicleMaxWeight: typeof input.vehicleMaxWeight === 'number' ? input.vehicleMaxWeight : undefined,
          vehicleMaxVolume: typeof input.vehicleMaxVolume === 'number' ? input.vehicleMaxVolume : undefined,
          loadPct: typeof input.loadPct === 'number' ? input.loadPct : undefined,
          paymentTerms: (input.paymentTerms as string) ?? undefined,
          totalOrders: typeof input.totalOrders === 'number' ? input.totalOrders : undefined,
          deliveriesCompleted: typeof input.deliveriesCompleted === 'number' ? input.deliveriesCompleted : undefined,
          assignedOrderIds: Array.isArray(input.assignedOrderIds) ? input.assignedOrderIds : undefined,
          completedOrderIds: Array.isArray(input.completedOrderIds) ? input.completedOrderIds : undefined,
          customers: Array.isArray(input.customers) ? input.customers : undefined,
        },
      });
      return mapFleet(row);
    },

    async updateFleet(_: unknown, args: { userId: number; id: string; input: Record<string, unknown> }) {
      const { userId, id, input } = args;
      const numId = parseInt(id, 10);
      if (!Number.isInteger(numId) || numId <= 0) {
        throw new Error('Invalid fleet id');
      }
      const existing = await prisma.fleet.findFirst({ where: { id: numId, userId } });
      if (!existing) {
        throw new Error('Fleet not found');
      }
      const row = await prisma.fleet.update({
        where: { id: numId },
        data: {
          ...(input.route !== undefined && { route: input.route as string }),
          ...(input.routeFrom !== undefined && { routeFrom: input.routeFrom as string }),
          ...(input.routeTo !== undefined && { routeTo: input.routeTo as string }),
          ...(input.status !== undefined && { status: input.status as string }),
          ...(input.deliveryType !== undefined && { deliveryType: input.deliveryType as string }),
          ...(input.eta !== undefined && { eta: input.eta as string }),
          ...(input.lastUpdate !== undefined && { lastUpdate: input.lastUpdate as string }),
          ...(input.driverName !== undefined && { driverName: input.driverName as string }),
          ...(input.driverPhone !== undefined && { driverPhone: input.driverPhone as string }),
          ...(input.driverExperience !== undefined && { driverExperience: input.driverExperience as string }),
          ...(input.driverStatus !== undefined && { driverStatus: input.driverStatus as string }),
          ...(input.driverAvatar !== undefined && { driverAvatar: input.driverAvatar as string }),
          ...(input.vehicleType !== undefined && { vehicleType: input.vehicleType as string }),
          ...(input.vehicleBrand !== undefined && { vehicleBrand: input.vehicleBrand as string }),
          ...(input.vehicleModel !== undefined && { vehicleModel: input.vehicleModel as string }),
          ...(input.vehicleMaxWeight !== undefined && { vehicleMaxWeight: input.vehicleMaxWeight as number }),
          ...(input.vehicleMaxVolume !== undefined && { vehicleMaxVolume: input.vehicleMaxVolume as number }),
          ...(input.loadPct !== undefined && { loadPct: input.loadPct as number }),
          ...(input.paymentTerms !== undefined && { paymentTerms: input.paymentTerms as string }),
          ...(input.totalOrders !== undefined && { totalOrders: input.totalOrders as number }),
          ...(input.deliveriesCompleted !== undefined && { deliveriesCompleted: input.deliveriesCompleted as number }),
          ...(input.assignedOrderIds !== undefined && { assignedOrderIds: input.assignedOrderIds }),
          ...(input.completedOrderIds !== undefined && { completedOrderIds: input.completedOrderIds }),
          ...(input.customers !== undefined && { customers: input.customers }),
        },
      });
      return mapFleet(row);
    },
  },
};
