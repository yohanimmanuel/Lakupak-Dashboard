/** Tour id + version. Bump version to re-offer a tour after a major UI change. */
export const DASHBOARD_TOURS = {
  shell: { id: 'shell', version: 2 },
  orders: { id: 'orders', version: 1 },
  products: { id: 'products', version: 1 },
  offers: { id: 'offers', version: 1 },
  marketplace: { id: 'marketplace', version: 1 },
  logistics: { id: 'logistics', version: 1 },
} as const;

export type DashboardTourId = keyof typeof DASHBOARD_TOURS;

/** Module tours that start on a specific route (not shell). */
export type DashboardModuleTourId = Exclude<DashboardTourId, 'shell'>;

export const MODULE_TOUR_HOME_PATH: Record<DashboardModuleTourId, string> = {
  orders: '/orders',
  products: '/products',
  offers: '/offers',
  marketplace: '/marketplace',
  logistics: '/logistics',
};

/** Base key; combine with user id so a new account is not suppressed by another user in the same browser tab. */
export const SESSION_SHELL_INTRO_KEY = 'laku.dashboard.tours.shellIntroOffered';

export function shellIntroSessionStorageKey(userId: number): string {
  return `${SESSION_SHELL_INTRO_KEY}:${userId}`;
}

/**
 * Set to a `DashboardModuleTourId` before redirecting so the target page can call `runTour` after DOM is ready.
 * Replaces the legacy orders-only pending flag.
 */
export const PENDING_DASHBOARD_TOUR_KEY = 'laku.dashboard.tours.pendingRunId';
