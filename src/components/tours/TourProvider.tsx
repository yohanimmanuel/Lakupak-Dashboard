'use client';

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { Driver } from 'driver.js';
import { usePathname, useRouter } from 'next/navigation';
import 'driver.js/dist/driver.css';

import { useUserStore } from '@/store/userStore';
import { useTourProgress } from '@/hooks/useTourProgress';
import { DASHBOARD_TOURS, PENDING_ORDERS_TOUR_KEY, type DashboardTourId } from '@/components/tours/tourIds';
import { shellTourSteps } from '@/components/tours/definitions/shellTour';
import { ordersTourSteps } from '@/components/tours/definitions/ordersTour';
import { runDashboardTour } from '@/components/tours/runDashboardTour';
import { TourShellPrompt } from '@/components/tours/TourShellPrompt';

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  });
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onChange = () => setReduced(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return reduced;
}

export type DashboardTourContextValue = {
  runTour: (id: DashboardTourId) => void;
  resetTour: (id: string) => void;
  setTourStatus: (tourId: string, version: number, status: import('@/hooks/useTourProgress').TourProgressEntry['status']) => void;
  getStatus: (tourId: string, version: number) => import('@/hooks/useTourProgress').TourProgressStatus;
  isTourActive: boolean;
  reducedMotion: boolean;
  /** Tour blob finished first hydrate (local + server attempt); safe to decide shell intro. */
  tourProgressReady: boolean;
};

const TourContext = createContext<DashboardTourContextValue | null>(null);

export function useDashboardTour(): DashboardTourContextValue {
  const ctx = useContext(TourContext);
  if (!ctx) {
    throw new Error('useDashboardTour must be used within TourProvider');
  }
  return ctx;
}

/** Safe for optional use (e.g. pages that might render outside provider — returns null). */
export function useDashboardTourOptional(): DashboardTourContextValue | null {
  return useContext(TourContext);
}

export function TourProvider({ children }: { children: React.ReactNode }) {
  const user = useUserStore((s) => s.user);
  const userIdForTour =
    user != null && typeof user.id === 'number' && Number.isFinite(user.id) && user.id > 0 ? user.id : undefined;
  const progress = useTourProgress(userIdForTour);
  const pathname = usePathname();
  const router = useRouter();
  const reducedMotion = usePrefersReducedMotion();

  const driverRef = useRef<Driver | null>(null);
  const [isTourActive, setIsTourActive] = useState(false);

  const destroyDriver = useCallback(() => {
    try {
      driverRef.current?.destroy();
    } catch {
      /* noop */
    }
    driverRef.current = null;
    setIsTourActive(false);
  }, []);

  useEffect(() => {
    return () => destroyDriver();
  }, [destroyDriver]);

  useEffect(() => {
    destroyDriver();
  }, [pathname, destroyDriver]);

  const runTour = useCallback(
    (id: DashboardTourId) => {
      destroyDriver();
      const meta = DASHBOARD_TOURS[id];

      if (id === 'orders' && typeof window !== 'undefined') {
        const path = pathname?.replace(/\/$/, '') ?? '';
        const onOrdersList = path === '/orders';
        if (!onOrdersList) {
          sessionStorage.setItem(PENDING_ORDERS_TOUR_KEY, '1');
          router.push('/orders');
          return;
        }
      }

      const steps = id === 'shell' ? shellTourSteps : ordersTourSteps;
      setIsTourActive(true);
      const d = runDashboardTour({
        steps,
        reducedMotion,
        onFinish: (reason) => {
          setIsTourActive(false);
          driverRef.current = null;
          progress.setTourStatus(
            meta.id,
            meta.version,
            reason === 'completed' ? 'completed' : 'dismissed',
          );
        },
      });
      driverRef.current = d;
      if (!d) {
        setIsTourActive(false);
      }
    },
    [destroyDriver, progress, reducedMotion, pathname, router],
  );

  const value = useMemo<DashboardTourContextValue>(
    () => ({
      runTour,
      resetTour: progress.resetTour,
      setTourStatus: progress.setTourStatus,
      getStatus: progress.getStatus,
      isTourActive,
      reducedMotion,
      tourProgressReady: userIdForTour == null ? true : progress.initialLoadDone,
    }),
    [
      runTour,
      progress.resetTour,
      progress.setTourStatus,
      progress.getStatus,
      progress.initialLoadDone,
      isTourActive,
      reducedMotion,
      userIdForTour,
    ],
  );

  return (
    <TourContext.Provider value={value}>
      {children}
      {userIdForTour != null ? <TourShellPrompt /> : null}
    </TourContext.Provider>
  );
}
