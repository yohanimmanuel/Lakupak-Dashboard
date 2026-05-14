'use client';

import { driver, type Driver } from 'driver.js';
import type { TourStepDef } from '@/components/tours/definitions/tourStepTypes';

export type TourFinishReason = 'completed' | 'dismissed';

/** Start driver.js with filtered steps; returns null if nothing to show. */
export function runDashboardTour(options: {
  steps: TourStepDef[];
  reducedMotion: boolean;
  onFinish: (reason: TourFinishReason) => void;
}): Driver | null {
  if (typeof document === 'undefined') return null;

  const driveSteps = options.steps
    .filter((s) => document.querySelector(s.selector))
    .map((s) => ({
      element: s.selector,
      popover: {
        title: s.title,
        description: s.body,
        side: s.side ?? ('bottom' as const),
        align: 'start' as const,
      },
    }));

  if (driveSteps.length === 0) {
    options.onFinish('dismissed');
    return null;
  }

  let completedLastStep = false;

  const d = driver({
    showProgress: true,
    smoothScroll: !options.reducedMotion,
    animate: !options.reducedMotion,
    allowClose: true,
    overlayClickBehavior: 'close',
    showButtons: ['next', 'previous', 'close'],
    steps: driveSteps,
    // Global onNextClick replaces the library default; we must call moveNext() ourselves.
    onNextClick: (_element, _step, { driver: dr }) => {
      if (dr.isLastStep()) {
        completedLastStep = true;
      }
      dr.moveNext();
    },
    onDestroyed: () => {
      options.onFinish(completedLastStep ? 'completed' : 'dismissed');
    },
  });

  d.drive();
  return d;
}
