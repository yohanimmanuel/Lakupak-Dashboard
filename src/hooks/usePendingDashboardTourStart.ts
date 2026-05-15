'use client';

import { useEffect } from 'react';
import { PENDING_DASHBOARD_TOUR_KEY, type DashboardModuleTourId } from '@/components/tours/tourIds';
import { useDashboardTourOptional } from '@/components/tours/TourProvider';

/** After `router.push` from Settings, the module page clears the flag and starts the matching tour. */
export function usePendingDashboardTourStart(
  tourId: DashboardModuleTourId,
  options: { ready: boolean },
): void {
  const tour = useDashboardTourOptional();

  useEffect(() => {
    if (!options.ready || typeof window === 'undefined' || !tour) return;
    if (sessionStorage.getItem(PENDING_DASHBOARD_TOUR_KEY) !== tourId) return;
    sessionStorage.removeItem(PENDING_DASHBOARD_TOUR_KEY);
    const t = window.setTimeout(() => {
      tour.runTour(tourId);
    }, 0);
    return () => window.clearTimeout(t);
  }, [options.ready, tour, tourId]);
}
