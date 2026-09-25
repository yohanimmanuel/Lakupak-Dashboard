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
import {
  DASHBOARD_TOURS,
  MODULE_TOUR_HOME_PATH,
  PENDING_DASHBOARD_TOUR_KEY,
  type DashboardTourId,
} from '@/components/tours/tourIds';
import type { TourStepDef } from '@/components/tours/definitions/tourStepTypes';
import { shellTourSteps } from '@/components/tours/definitions/shellTour';
import { ordersTourSteps } from '@/components/tours/definitions/ordersTour';
import { productsTourSteps } from '@/components/tours/definitions/productsTour';
import { offersTourSteps } from '@/components/tours/definitions/offersTour';
import { marketplaceTourSteps } from '@/components/tours/definitions/marketplaceTour';
import { automationTourSteps } from '@/components/tours/definitions/automationTour';
import { runDashboardTour } from '@/components/tours/runDashboardTour';

function getTourSteps(id: DashboardTourId): TourStepDef[] {
  switch (id) {
    case 'shell':
      return shellTourSteps;
    case 'orders':
      return ordersTourSteps;
    case 'products':
      return productsTourSteps;
    case 'offers':
      return offersTourSteps;
    case 'marketplace':
      return marketplaceTourSteps;
    case 'automation':
      return automationTourSteps;
    default: {
      const _exhaustive: never = id;
      return _exhaustive;
    }
  }
}
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

      if (id !== 'shell' && typeof window !== 'undefined') {
        const home = MODULE_TOUR_HOME_PATH[id];
        const path = pathname?.replace(/\/$/, '') ?? '';
        if (path !== home) {
          sessionStorage.setItem(PENDING_DASHBOARD_TOUR_KEY, id);
          router.push(home);
          return;
        }
      }

      const steps = getTourSteps(id);
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
