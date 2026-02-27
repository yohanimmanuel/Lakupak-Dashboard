import { fetchGraphQL } from '@/lib/graphqlClient';
import type { FleetOrderSummary, FleetStatus } from '@/components/logisticsmanagement/OrderfleetList';

/**
 * Normalizes legacy fleet status values to the current availability-centric set.
 *
 * Migration path for existing DB records:
 *   'Delivered' → 'Available'  (fleet completed its route; now back in the pool)
 *   'Delayed'   → 'Checking'   (fleet had an issue; operator should review)
 *
 * To permanently migrate the DB run once:
 *   UPDATE "Fleet" SET status = 'Available' WHERE status = 'Delivered';
 *   UPDATE "Fleet" SET status = 'Checking'  WHERE status = 'Delayed';
 */
function normalizeFleetStatus(raw: string): FleetStatus {
  const map: Record<string, FleetStatus> = {
    Delivered: 'Available',
    Delayed:   'Checking',
  };
  const current: FleetStatus[] = ['Available', 'Unavailable', 'In Transit', 'Checking'];
  if (current.includes(raw as FleetStatus)) return raw as FleetStatus;
  return map[raw] ?? 'Checking';
}

const FLEETS_QUERY = /* GraphQL */ `
  query Fleets($userId: Int!, $page: Int, $limit: Int, $status: String, $deliveryType: String, $search: String) {
    fleets(userId: $userId, page: $page, limit: $limit, status: $status, deliveryType: $deliveryType, search: $search) {
      nodes {
        id
        orderCode
        route
        status
        deliveryType
        eta
        lastUpdate
        driverName
        totalOrders
        deliveriesCompleted
        customers { storeName contactName }
        vehicleType
        loadPct
        paymentTerms
        vehicleBrand
        vehicleModel
        vehicleMaxWeight
        vehicleMaxVolume
        driverPhone
        driverExperience
        driverStatus
        driverAvatar
        driverUsername
        assignedLogistics
        assignedOrderIds
        assignedOrderIds
        completedOrderIds
      }
      pagination { page limit totalCount totalPages }
    }
  }
`;

const FLEET_QUERY = /* GraphQL */ `
  query Fleet($userId: Int!, $id: String!) {
    fleet(userId: $userId, id: $id) {
      id
      orderCode
      route
      status
      deliveryType
      eta
      lastUpdate
      driverName
      totalOrders
      deliveriesCompleted
      customers { storeName contactName }
      vehicleType
      loadPct
      paymentTerms
      vehicleBrand
      vehicleModel
      vehicleMaxWeight
      vehicleMaxVolume
      driverPhone
      driverExperience
      driverStatus
      driverAvatar
      driverUsername
      assignedLogistics
      assignedOrderIds
      completedOrderIds
    }
  }
`;

const CREATE_FLEET_MUTATION = /* GraphQL */ `
  mutation CreateFleet($userId: Int!, $input: CreateFleetInput!) {
    createFleet(userId: $userId, input: $input) {
      id
      orderCode
      route
      status
      deliveryType
      eta
      lastUpdate
      driverName
      totalOrders
      deliveriesCompleted
      customers { storeName contactName }
      vehicleType
      loadPct
      paymentTerms
      vehicleBrand
      vehicleModel
      vehicleMaxWeight
      vehicleMaxVolume
      driverPhone
      driverExperience
      driverStatus
      driverAvatar
      driverUsername
      assignedLogistics
      assignedOrderIds
      completedOrderIds
    }
  }
`;

const UPDATE_FLEET_MUTATION = /* GraphQL */ `
  mutation UpdateFleet($userId: Int!, $id: String!, $input: UpdateFleetInput!) {
    updateFleet(userId: $userId, id: $id, input: $input) {
      id
      orderCode
      route
      status
      deliveryType
      eta
      lastUpdate
      driverName
      totalOrders
      deliveriesCompleted
      customers { storeName contactName }
      vehicleType
      loadPct
      paymentTerms
      vehicleBrand
      vehicleModel
      vehicleMaxWeight
      vehicleMaxVolume
      driverPhone
      driverExperience
      driverStatus
      driverAvatar
      driverUsername
      assignedLogistics
      assignedOrderIds
      completedOrderIds
    }
  }
`;

const DELETE_FLEET_MUTATION = /* GraphQL */ `
  mutation DeleteFleet($userId: Int!, $id: String!) {
    deleteFleet(userId: $userId, id: $id) {
      success
      deleted {
        id
        orderCode
        route
        status
        deliveryType
        eta
        lastUpdate
        driverName
        totalOrders
        deliveriesCompleted
        customers { storeName contactName }
        vehicleType
        loadPct
        paymentTerms
        vehicleBrand
        vehicleModel
        vehicleMaxWeight
        vehicleMaxVolume
        driverPhone
        driverExperience
        driverStatus
        driverAvatar
      driverUsername
      assignedLogistics
      assignedOrderIds
      completedOrderIds
      }
    }
  }
`;

function mapNodeToSummary(node: {
  id: string;
  orderCode: string;
  route: string;
  status: string;
  deliveryType?: string | null;
  eta: string;
  lastUpdate: string;
  driverName: string;
  totalOrders?: number | null;
  deliveriesCompleted?: number | null;
  customers?: Array<{ storeName?: string | null; contactName?: string | null }> | null;
  vehicleType?: string | null;
  loadPct?: number | null;
  paymentTerms?: string | null;
  vehicleBrand?: string | null;
  vehicleModel?: string | null;
  vehicleMaxWeight?: number | null;
  vehicleMaxVolume?: number | null;
  driverPhone?: string | null;
  driverExperience?: string | null;
  driverStatus?: string | null;
  driverAvatar?: string | null;
  driverUsername?: string | null;
  assignedLogistics?: string | null;
  assignedOrderIds?: string[] | null;
  completedOrderIds?: string[] | null;
}): FleetOrderSummary {
  return {
    id: node.id,
    orderCode: node.orderCode,
    route: node.route,
    status: normalizeFleetStatus(node.status),
    deliveryType: (node.deliveryType ?? undefined) as FleetOrderSummary['deliveryType'],
    eta: node.eta,
    lastUpdate: node.lastUpdate,
    driverName: node.driverName,
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
    vehicleMaxWeight: node.vehicleMaxWeight ?? undefined,
    vehicleMaxVolume: node.vehicleMaxVolume ?? undefined,
    driverPhone: node.driverPhone ?? undefined,
    driverExperience: node.driverExperience ?? undefined,
    driverStatus: node.driverStatus ?? undefined,
    driverAvatar: node.driverAvatar ?? undefined,
    driverUsername: node.driverUsername ?? undefined,
    assignedOrderIds: node.assignedOrderIds ?? undefined,
    completedOrderIds: node.completedOrderIds ?? undefined,
  };
}

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
    deleted: result.deleted && typeof result.deleted === 'object' ? mapNodeToSummary(result.deleted as Parameters<typeof mapNodeToSummary>[0]) : null,
  };
}
