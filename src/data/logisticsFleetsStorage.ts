import type { FleetOrderSummary } from '@/components/logisticsmanagement/OrderfleetList';

const STORAGE_KEY = 'laku_logistics_fleets';

function getStored(): FleetOrderSummary[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function setStored(fleets: FleetOrderSummary[]) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(fleets));
  } catch {
    // ignore
  }
}

/** Returns fleets from localStorage. */
export function getFleets(): FleetOrderSummary[] {
  return getStored();
}

/** Add a new fleet. Persists to localStorage. */
export function addFleet(fleet: FleetOrderSummary): void {
  const stored = getStored();
  const without = stored.filter((f) => f.id !== fleet.id);
  setStored([...without, fleet]);
}

/** Update an existing fleet by id. Adds to stored if not present. */
export function updateFleet(id: string, updates: Partial<FleetOrderSummary>): void {
  const fleets = getFleets();
  const existing = fleets.find((f) => f.id === id);
  if (!existing) return;
  const updated = { ...existing, ...updates };
  addFleet(updated);
}

