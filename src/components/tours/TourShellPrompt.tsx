'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Sparkles } from 'lucide-react';
import { DASHBOARD_TOURS, shellIntroSessionStorageKey } from '@/components/tours/tourIds';
import { useDashboardTour } from '@/components/tours/TourProvider';
import { useUserStore } from '@/store/userStore';

/** One-time-per-session offer: short shell tour or skip (progress persisted). Slides in from the left like module refresh toasts. */
export function TourShellPrompt() {
  const { runTour, setTourStatus, getStatus, tourProgressReady } = useDashboardTour();
  const userId = useUserStore((s) => s.user?.id);
  const [showPanel, setShowPanel] = useState(false);
  const [isSlidingIn, setIsSlidingIn] = useState(false);
  const [isSlidingOut, setIsSlidingOut] = useState(false);
  const openTimerRef = useRef<number | null>(null);
  const slideInTimerRef = useRef<number | null>(null);
  const hideTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!tourProgressReady) return;
    if (userId == null || !Number.isFinite(userId) || userId <= 0) return;

    const sessionKey = shellIntroSessionStorageKey(userId);
    if (sessionStorage.getItem(sessionKey)) return;
    if (getStatus(DASHBOARD_TOURS.shell.id, DASHBOARD_TOURS.shell.version) !== 'none') return;

    openTimerRef.current = window.setTimeout(() => {
      setShowPanel(true);
      setIsSlidingOut(false);
      setIsSlidingIn(false);
      slideInTimerRef.current = window.setTimeout(() => setIsSlidingIn(true), 50);
    }, 900);

    return () => {
      if (openTimerRef.current != null) {
        window.clearTimeout(openTimerRef.current);
        openTimerRef.current = null;
      }
      if (slideInTimerRef.current != null) {
        window.clearTimeout(slideInTimerRef.current);
        slideInTimerRef.current = null;
      }
      if (hideTimerRef.current != null) {
        window.clearTimeout(hideTimerRef.current);
        hideTimerRef.current = null;
      }
    };
  }, [getStatus, tourProgressReady, userId]);

  const closeSessionAndHide = (afterHide?: () => void) => {
    if (userId != null && Number.isFinite(userId) && userId > 0) {
      sessionStorage.setItem(shellIntroSessionStorageKey(userId), '1');
    }
    setIsSlidingOut(true);
    setIsSlidingIn(false);
    if (hideTimerRef.current != null) {
      window.clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
    hideTimerRef.current = window.setTimeout(() => {
      hideTimerRef.current = null;
      setShowPanel(false);
      setIsSlidingOut(false);
      afterHide?.();
    }, 500);
  };

  if (!showPanel && !isSlidingIn && !isSlidingOut) return null;

  const panelTransform = isSlidingOut
    ? '-translate-x-full opacity-0'
    : isSlidingIn
      ? 'translate-x-0 opacity-100'
      : '-translate-x-full opacity-0';

  return (
    <div
      className={`pointer-events-none fixed left-4 top-24 z-[70] max-w-md sm:left-6 transform transition-all duration-500 ease-out ${panelTransform}`}
      aria-live="polite"
    >
      <div
        role="region"
        aria-label="Dashboard tour invitation"
        className="pointer-events-auto rounded-lg border-2 border-[#0a61d7] bg-white p-4 shadow-lg shadow-blue-900/10 min-w-[280px] sm:min-w-[320px]"
      >
        <div className="flex gap-3">
          <div
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-50 ring-2 ring-blue-100"
            aria-hidden
          >
            <Sparkles className="h-5 w-5 text-[#0a61d7]" strokeWidth={2} />
          </div>
          <div className="min-w-0 flex-1">
            <h2 id="tour-shell-title" className="text-sm font-semibold text-gray-900">
              Welcome to Laku
            </h2>
            <p className="mt-1 text-xs text-gray-600 leading-relaxed">
              Take a quick tour of the sidebar and search, or skip. You can replay anytime from Settings → Product
              tours.
            </p>
            <div className="mt-3 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-800 hover:bg-gray-50"
                onClick={() => {
                  closeSessionAndHide(() => {
                    setTourStatus(DASHBOARD_TOURS.shell.id, DASHBOARD_TOURS.shell.version, 'dismissed');
                  });
                }}
              >
                Skip
              </button>
              <button
                type="button"
                className="rounded-lg bg-[#0a61d7] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#084ba6]"
                onClick={() => {
                  closeSessionAndHide(() => {
                    runTour('shell');
                  });
                }}
              >
                Take a 60-second tour
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
