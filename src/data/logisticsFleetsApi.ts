import { fetchGraphQL } from '@/lib/graphqlClient';
import type { FleetOrderSummary, FleetStatus } from '@/components/logisticsmanagement/OrderfleetList';

/**
 * Normalizes legacy fleet status values to the current availability-centric set.
 * Migrate permanently:
 *   UPDATE "Fleet" SET status='Available' WHERE status='Delivered';
 *   UPDATE "Fleet" SET status='Checking'  WHERE status='Delayed';
 */
function normalizeFleetStatus(raw: string): FleetStatus {
  const map: Record<string, FleetStatus> = { Delivered: 'Available', Delayed: 'Checking' };
  const current: FleetStatus[] = ['Available', 'Unavailable', 'In Transit', 'Checking'];
  if (current.includes(raw as FleetStatus)) return raw as FleetStatus;
  return map[raw] ?? 'Checking';
}

// ---- Shared driver fragment ----
const DRIVER_FRAGMENT = `
  driver {
    id name phone experience status avatar username fleetCount
  }
`;

const FLEET_FIELDS = `
  id orderCode route status deliveryType etaCompletionDate etaCompletionTime assignedDate lastUpdate
  driverId driverName driverPhone driverExperience driverStatus driverAvatar driverUsername
  ${DRIVER_FRAGMENT}
  totalOrders deliveriesCompleted
  customers { storeName contactName }
  vehicleType loadPct paymentTerms vehicleBrand vehicleModel plateNumber vehicleMaxWeight vehicleMaxVolume
  assignedLogistics assignedOrderIds completedOrderIds deliveryAddresses deliveryStopsCompleted
  driverLat driverLng driverLocationAt
`;

// ============================================================================
// Fleet Queries / Mutations
// ============================================================================

const FLEETS_QUERY = /* GraphQL */ `
  query Fleets($userId: Int!, $page: Int, $limit: Int, $status: String, $deliveryType: String, $search: String) {
    fleets(userId: $userId, page: $page, limit: $limit, status: $status, deliveryType: $deliveryType, search: $search) {
      nodes { ${FLEET_FIELDS} }
      pagination { page limit totalCount totalPages }
    }
  }
`;

const FLEET_QUERY = /* GraphQL */ `
  query Fleet($userId: Int!, $id: String!) {
    fleet(userId: $userId, id: $id) { ${FLEET_FIELDS} }
  }
`;

const CREATE_FLEET_MUTATION = /* GraphQL */ `
  mutation CreateFleet($userId: Int!, $input: CreateFleetInput!) {
    createFleet(userId: $userId, input: $input) { ${FLEET_FIELDS} }
  }
`;

const UPDATE_FLEET_MUTATION = /* GraphQL */ `
  mutation UpdateFleet($userId: Int!, $id: String!, $input: UpdateFleetInput!) {
    updateFleet(userId: $userId, id: $id, input: $input) { ${FLEET_FIELDS} }
  }
`;

const DELETE_FLEET_MUTATION = /* GraphQL */ `
  mutation DeleteFleet($userId: Int!, $id: String!) {
    deleteFleet(userId: $userId, id: $id) {
      success
      deleted { ${FLEET_FIELDS} }
    }
  }
`;

// ============================================================================
// Driver Queries / Mutations
// ============================================================================

const DRIVER_FIELDS = `id name phone experience status avatar username fleetCount createdAt updatedAt`;

const DRIVERS_QUERY = /* GraphQL */ `
  query Drivers($userId: Int!) {
    drivers(userId: $userId) { ${DRIVER_FIELDS} }
  }
`;

const CREATE_DRIVER_MUTATION = /* GraphQL */ `
  mutation CreateDriver($userId: Int!, $input: DriverInput!) {
    createDriver(userId: $userId, input: $input) { ${DRIVER_FIELDS} }
  }
`;

const UPDATE_DRIVER_MUTATION = /* GraphQL */ `
  mutation UpdateDriver($userId: Int!, $id: String!, $input: UpdateDriverInput!) {
    updateDriver(userId: $userId, id: $id, input: $input) { ${DRIVER_FIELDS} }
  }
`;

const DELETE_DRIVER_MUTATION = /* GraphQL */ `
  mutation DeleteDriver($userId: Int!, $id: String!) {
    deleteDriver(userId: $userId, id: $id)
  }
`;

// ============================================================================
// Types
// ============================================================================

export interface DriverSummary {
  id: string;
  name: string;
  phone?: string | null;
  experience?: string | null;
  status?: string | null;
  avatar?: string | null;
  username: string;
  fleetCount?: number | null;
  createdAt?: string | null;
  updatedAt?: string | null;
}

// ============================================================================
// Mappers
// ============================================================================

type RawDriver = {
  id: string;
  name: string;
  phone?: string | null;
  experience?: string | null;
  status?: string | null;
  avatar?: string | null;
  username: string;
  fleetCount?: number | null;
  createdAt?: string | null;
  updatedAt?: string | null;
};

function mapDriver(raw: RawDriver): DriverSummary {
  return {
    id: raw.id,
    name: raw.name,
    phone: raw.phone ?? null,
    experience: raw.experience ?? null,
    status: raw.status ?? null,
    avatar: raw.avatar ?? null,
    username: raw.username,
    fleetCount: raw.fleetCount ?? null,
    createdAt: raw.createdAt ?? null,
    updatedAt: raw.updatedAt ?? null,
  };
}

function mapNodeToSummary(node: {
  id: string;
  orderCode: string;
  route: string;
  status: string;
  deliveryType?: string | null;
  etaCompletionDate?: string | null;
  etaCompletionTime?: string | null;
  assignedDate?: string | null;
  lastUpdate: string;
  driverId?: string | null;
  driverName?: string | null;
  driverPhone?: string | null;
  driverExperience?: string | null;
  driverStatus?: string | null;
  driverAvatar?: string | null;
  driverUsername?: string | null;
  driver?: RawDriver | null;
  totalOrders?: number | null;
  deliveriesCompleted?: number | null;
  customers?: Array<{ storeName?: string | null; contactName?: string | null }> | null;
  vehicleType?: string | null;
  loadPct?: number | null;
  paymentTerms?: string | null;
  vehicleBrand?: string | null;
  vehicleModel?: string | null;
  plateNumber?: string | null;
  vehicleMaxWeight?: number | null;
  vehicleMaxVolume?: number | null;
  assignedLogistics?: string | null;
  assignedOrderIds?: string[] | null;
  completedOrderIds?: string[] | null;
  deliveryAddresses?: string[] | null;
  deliveryStopsCompleted?: boolean[] | null;
  driverLat?: number | null;
  driverLng?: number | null;
  driverLocationAt?: string | null;
}): FleetOrderSummary {
  return {
    id: node.id,
    orderCode: node.orderCode,
    route: node.route,
    status: normalizeFleetStatus(node.status),
    deliveryType: (node.deliveryType ?? undefined) as FleetOrderSummary['deliveryType'],
    etaCompletionDate: node.etaCompletionDate ?? null,
    etaCompletionTime: node.etaCompletionTime ?? null,
    assignedDate: node.assignedDate ?? null,
    lastUpdate: node.lastUpdate,
    driverId: node.driverId ?? undefined,
    driverName: node.driverName ?? '',
    driverPhone: node.driverPhone ?? undefined,
    driverExperience: node.driverExperience ?? undefined,
    driverStatus: node.driverStatus ?? undefined,
    driverAvatar: node.driverAvatar ?? undefined,
    driverUsername: node.driverUsername ?? undefined,
    driver: node.driver ? mapDriver(node.driver) : undefined,
    totalOrders: node.totalOrders ?? undefined,
    deliveriesCompleted: node.deliveriesCompleted ?? undefined,
    assignedLogistics: node.assignedLogistics ?? undefined,
    customers: (node.customers ?? []).map((c) => ({
      storeName: c.storeName ?? '',
      contactName: c.contactName ?? '',
    })),
    vehicleType: node.vehicleType ?? undefined,
    loadPct: node.loadPct ?? undefined,
    paymentTerms: node.paymentTerms ?? undefined,
    vehicleBrand: node.vehicleBrand ?? undefined,
    vehicleModel: node.vehicleModel ?? undefined,
    plateNumber: node.plateNumber ?? undefined,
    vehicleMaxWeight: node.vehicleMaxWeight ?? undefined,
    vehicleMaxVolume: node.vehicleMaxVolume ?? undefined,
    assignedOrderIds: node.assignedOrderIds ?? undefined,
    completedOrderIds: node.completedOrderIds ?? undefined,
    deliveryAddresses: node.deliveryAddresses ?? undefined,
    deliveryStopsCompleted: node.deliveryStopsCompleted ?? undefined,
    driverLat: node.driverLat ?? undefined,
    driverLng: node.driverLng ?? undefined,
    driverLocationAt: node.driverLocationAt ?? undefined,
  };
}

// ============================================================================
// Fleet API functions
// ============================================================================

export interface FleetsResult {
  nodes: FleetOrderSummary[];
  pagination: { page: number; limit: number; totalCount: number; totalPages: number };
}

export async function fetchFleets(
  userId: number,
  options?: { page?: number; limit?: number; status?: string; deliveryType?: string; search?: string }
): Promise<FleetsResult> {
  const data = await fetchGraphQL<{ fleets: { nodes: unknown[]; pagination: unknown } }>(FLEETS_QUERY, {
    userId,
    page: options?.page ?? 1,
    limit: options?.limit ?? 50,
    status: options?.status ?? undefined,
    deliveryType: options?.deliveryType ?? undefined,
    search: options?.search ?? undefined,
  });
  const nodes = (data.fleets?.nodes ?? []).map((n) => mapNodeToSummary(n as Parameters<typeof mapNodeToSummary>[0]));
  return {
    nodes,
    pagination: (data.fleets?.pagination ?? { page: 1, limit: 50, totalCount: 0, totalPages: 1 }) as FleetsResult['pagination'],
  };
}

export async function fetchFleet(userId: number, id: string): Promise<FleetOrderSummary | null> {
  const data = await fetchGraphQL<{ fleet: unknown }>(FLEET_QUERY, { userId, id });
  const fleet = data.fleet;
  if (!fleet || typeof fleet !== 'object') return null;
  return mapNodeToSummary(fleet as Parameters<typeof mapNodeToSummary>[0]);
}

export async function createFleet(userId: number, input: Record<string, unknown>): Promise<FleetOrderSummary> {
  const data = await fetchGraphQL<{ createFleet: unknown }>(CREATE_FLEET_MUTATION, { userId, input });
  const created = data.createFleet;
  if (!created || typeof created !== 'object') throw new Error('Create fleet returned no data');
  return mapNodeToSummary(created as Parameters<typeof mapNodeToSummary>[0]);
}

export async function updateFleet(userId: number, id: string, input: Record<string, unknown>): Promise<FleetOrderSummary> {
  const data = await fetchGraphQL<{ updateFleet: unknown }>(UPDATE_FLEET_MUTATION, { userId, id, input });
  const updated = data.updateFleet;
  if (!updated || typeof updated !== 'object') throw new Error('Update fleet returned no data');
  return mapNodeToSummary(updated as Parameters<typeof mapNodeToSummary>[0]);
}

export async function deleteFleet(userId: number, id: string): Promise<{ success: boolean; deleted: FleetOrderSummary | null }> {
  const data = await fetchGraphQL<{ deleteFleet: { success: boolean; deleted: unknown } | null }>(DELETE_FLEET_MUTATION, { userId, id });
  const result = data.deleteFleet;
  if (!result || typeof result !== 'object') throw new Error('Delete fleet returned no data');
  if (!result.success) throw new Error('Delete fleet failed');
  return {
    success: result.success,
    deleted: result.deleted && typeof result.deleted === 'object'
      ? mapNodeToSummary(result.deleted as Parameters<typeof mapNodeToSummary>[0])
      : null,
  };
}

// ============================================================================
// Driver API functions
// ============================================================================

export async function fetchDrivers(userId: number): Promise<DriverSummary[]> {
  const data = await fetchGraphQL<{ drivers: unknown[] }>(DRIVERS_QUERY, { userId });
  return (data.drivers ?? []).map((d) => mapDriver(d as RawDriver));
}

export async function createDriver(userId: number, input: Record<string, unknown>): Promise<DriverSummary> {
  const data = await fetchGraphQL<{ createDriver: unknown }>(CREATE_DRIVER_MUTATION, { userId, input });
  if (!data.createDriver || typeof data.createDriver !== 'object') throw new Error('Create driver returned no data');
  return mapDriver(data.createDriver as RawDriver);
}

export async function updateDriver(userId: number, id: string, input: Record<string, unknown>): Promise<DriverSummary> {
  const data = await fetchGraphQL<{ updateDriver: unknown }>(UPDATE_DRIVER_MUTATION, { userId, id, input });
  if (!data.updateDriver || typeof data.updateDriver !== 'object') throw new Error('Update driver returned no data');
  return mapDriver(data.updateDriver as RawDriver);
}

export async function deleteDriver(userId: number, id: string): Promise<boolean> {
  const data = await fetchGraphQL<{ deleteDriver: boolean }>(DELETE_DRIVER_MUTATION, { userId, id });
  if (data.deleteDriver === undefined || data.deleteDriver === null) {
    throw new Error('Delete driver returned no data');
  }
  return data.deleteDriver;
}
