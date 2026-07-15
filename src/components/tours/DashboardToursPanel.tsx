'use client';

import React from 'react';
import { BookOpen } from 'lucide-react';
import { DASHBOARD_TOURS, type DashboardTourId } from '@/components/tours/tourIds';
import { useDashboardTour } from '@/components/tours/TourProvider';
import { useUserStore } from '@/store/userStore';
import { useSettingsTranslations } from '@/hooks/useSettingsTranslations';

const TOUR_IDS: DashboardTourId[] = ['shell', 'products', 'orders', 'offers', 'marketplace', 'logistics'];

export function DashboardToursPanel() {
  const { runTour, resetTour, getStatus } = useDashboardTour();
  const user = useUserStore((s) => s.user);
  const { tTours, translateTourStatus } = useSettingsTranslations();
  const docLocale = user?.language === 'id' ? 'id' : 'en';

  return (
    <div className="p-4 max-w-6xl">
      <h2 className="text-2xl font-bold text-black">{tTours('title')}</h2>
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-2">
        {TOUR_IDS.map((id) => {
          const row = {
            id,
            title: tTours(`items.${id}.title`),
            description: tTours(`items.${id}.description`),
          };
          const meta = DASHBOARD_TOURS[row.id];
          if (!meta) {
            return (
              <div
                key={row.id}
                className="flex h-full min-h-[140px] flex-col justify-between gap-4 rounded-lg border border-gray-200 bg-white p-4"
              >
                <div>
                  <p className="font-semibold text-gray-900">{row.title}</p>
                  <p className="text-sm text-gray-600">{row.description}</p>
                  <p className="mt-1 text-xs text-amber-700">{tTours('missingMetadata')}</p>
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  <button type="button" disabled className="cursor-not-allowed rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-400">
                    {tTours('reset')}
                  </button>
                  <button type="button" disabled className="cursor-not-allowed rounded-lg bg-gray-200 px-3 py-2 text-sm font-semibold text-gray-500">
                    {tTours('startTour')}
                  </button>
                </div>
              </div>
            );
          }
          const st = getStatus(meta.id, meta.version);
          const statusLabel =
            st === 'completed'
              ? translateTourStatus('completed')
              : st === 'dismissed'
                ? translateTourStatus('dismissed')
                : translateTourStatus('notStarted');
          return (
            <div
              key={row.id}
              className="flex h-full min-h-[160px] flex-col justify-between gap-4 rounded-lg border border-gray-200 bg-white p-4"
            >
              <div>
                <p className="font-semibold text-gray-900">{row.title}</p>
                <p className="mt-1 text-sm text-gray-600">{row.description}</p>
                <p className="mt-2 text-xs text-gray-500">{tTours('statusLabel', { status: statusLabel })}</p>
              </div>
              <div className="flex shrink-0 flex-wrap gap-2">
                <button
                  type="button"
                  className="rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-800 hover:bg-gray-50"
                  onClick={() => resetTour(meta.id)}
                >
                  {tTours('reset')}
                </button>
                <button
                  type="button"
                  className="rounded-lg bg-[#0a61d7] px-3 py-2 text-sm font-semibold text-white hover:bg-[#084ba6]"
                  onClick={() => runTour(meta.id)}
                >
                  {tTours('startTour')}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-6 rounded-lg border border-gray-200 bg-white p-4">
        <div className="flex items-start gap-3">
          <BookOpen className="mt-0.5 h-5 w-5 shrink-0 text-[#0a61d7]" aria-hidden />
          <div>
            <p className="font-semibold text-gray-900">{tTours('documentationTitle')}</p>
            <p className="mt-1 text-sm text-gray-600">{tTours('documentationDescription')}</p>
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-sm">
              <a
                href={`/${docLocale}/docs`}
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-[#0a61d7] hover:underline"
              >
                {tTours('browseAllDocumentation')}
              </a>
              <a
                href={`/${docLocale}/docs/dashboard/overview`}
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-[#0a61d7] hover:underline"
              >
                {tTours('dashboardGuide')}
              </a>
              <a
                href={`/${docLocale}/docs/getting-started`}
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-[#0a61d7] hover:underline"
              >
                {tTours('gettingStarted')}
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
