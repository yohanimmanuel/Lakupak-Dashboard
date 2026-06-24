import { isDeliveryStopComplete } from '@/utils/deliveryCompletion';

export type FleetOrderRouteInput = {
  orderId: string;
  deliveryAddress: string | null;
  orderStatus: string;
};

export type FleetRouteStops = {
  assignedOrderIds: string[];
  deliveryAddresses: string[];
  deliveryStopsCompleted: boolean[];
};

export function parseFleetJsonStringArray(val: unknown): string[] {
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

/** Build delivery stop lists in assigned-order sequence (matches LogisticsRouteMap). */
export function buildFleetRouteStops(input: {
  assignedOrderIds: unknown;
  orders: FleetOrderRouteInput[];
}): FleetRouteStops {
  const existingOrderIds = new Set(input.orders.map((o) => o.orderId));
  const rawAssigned = parseFleetJsonStringArray(input.assignedOrderIds);

  const assignedOrderIds: string[] = [];
  rawAssigned.forEach((orderId) => {
    if (existingOrderIds.has(orderId)) assignedOrderIds.push(orderId);
  });

  const deliveryAddressMap = new Map(
    input.orders
      .filter((o) => o.deliveryAddress)
      .map((o) => [o.orderId, o.deliveryAddress as string]),
  );
  const orderStatusMap = new Map(input.orders.map((o) => [o.orderId, o.orderStatus]));

  const deliveryAddresses = assignedOrderIds
    .map((id) => deliveryAddressMap.get(id))
    .filter((a): a is string => Boolean(a));

  const deliveryStopsCompleted = assignedOrderIds
    .filter((id) => Boolean(deliveryAddressMap.get(id)))
    .map((id) => isDeliveryStopComplete(orderStatusMap.get(id)));

  return { assignedOrderIds, deliveryAddresses, deliveryStopsCompleted };
}

export type LngLat = [number, number];

/** Waypoints for Mapbox Directions — same rules as LogisticsRouteMap. */
export function buildFleetRouteWaypoints(input: {
  deliveryAddresses: string[];
  deliveryStopsCompleted: boolean[];
  addressCoords: Record<string, LngLat>;
  driverCoord?: LngLat | null;
}): LngLat[] {
  const stopPairs = input.deliveryAddresses
    .map((addr, i) => ({
      addr,
      coord: input.addressCoords[addr] ?? null,
      isCompleted: input.deliveryStopsCompleted[i] === true,
    }))
    .filter(
      (p): p is { addr: string; coord: LngLat; isCompleted: boolean } => p.coord !== null,
    );

  const pendingStops = stopPairs.filter((p) => !p.isCompleted).map((p) => p.coord);
  const driverCoord = input.driverCoord ?? null;

  if (driverCoord) {
    return pendingStops.length ? [driverCoord, ...pendingStops] : [];
  }
  return [...pendingStops];
}

/** Pending stop numbers (1-based) in assigned-order sequence. */
export function buildPendingDeliveryStepNumbers(input: {
  deliveryAddresses: string[];
  deliveryStopsCompleted: boolean[];
  addressCoords: Record<string, LngLat>;
}): Record<number, number> {
  const stepByIndex: Record<number, number> = {};
  let step = 1;
  input.deliveryAddresses.forEach((addr, i) => {
    if (input.deliveryStopsCompleted[i]) return;
    if (input.addressCoords[addr]) {
      stepByIndex[i] = step++;
    }
  });
  return stepByIndex;
}

