/** Tour id + version. Bump version to re-offer a tour after a major UI change. */
export const DASHBOARD_TOURS = {
  shell: { id: 'shell', version: 2 },
  orders: { id: 'orders', version: 1 },
} as const;

export type DashboardTourId = keyof typeof DASHBOARD_TOURS;

/** Base key; combine with user id so a new account is not suppressed by another user in the same browser tab. */
export const SESSION_SHELL_INTRO_KEY = 'laku.dashboard.tours.shellIntroOffered';

export function shellIntroSessionStorageKey(userId: number): string {
  return `${SESSION_SHELL_INTRO_KEY}:${userId}`;
}

/** Set before redirecting to /orders so the list page can start the orders tour after DOM is ready. */
export const PENDING_ORDERS_TOUR_KEY = 'laku.dashboard.tours.pendingRunOrders';
