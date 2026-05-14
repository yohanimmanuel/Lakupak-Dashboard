'use client';

import React from 'react';
import { DASHBOARD_TOURS, type DashboardTourId } from '@/components/tours/tourIds';
import { useDashboardTour } from '@/components/tours/TourProvider';

const rows: { id: DashboardTourId; title: string; description: string }[] = [
  {
    id: 'shell',
    title: 'Dashboard overview',
    description: 'Sidebar modules (products, orders, offers, marketplace, logistics), search, account, and where to replay tours.',
  },
  {
    id: 'orders',
    title: 'Orders',
    description: 'Map, summary cards, filters, and the orders table.',
  },
];

export function DashboardToursPanel() {
  const { runTour, resetTour, getStatus } = useDashboardTour();

  return (
    <div className="p-6 max-w-2xl">
      <h2 className="text-xl font-bold text-gray-900">Product tours</h2>
      <p className="mt-2 text-sm text-gray-600">
        Replay a short walkthrough anytime. Progress is saved for this account (and synced when you use another
        browser, once signed in).
      </p>
      <ul className="mt-6 divide-y divide-gray-200 rounded-lg border border-gray-200 bg-white">
        {rows.map((row) => {
          const meta = DASHBOARD_TOURS[row.id];
          if (!meta) {
            return (
              <li key={row.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-semibold text-gray-900">{row.title}</p>
                  <p className="text-sm text-gray-600">{row.description}</p>
                  <p className="mt-1 text-xs text-amber-700">Tour metadata missing for this entry.</p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <button type="button" disabled className="cursor-not-allowed rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-400">
                    Reset
                  </button>
                  <button type="button" disabled className="cursor-not-allowed rounded-lg bg-gray-200 px-3 py-2 text-sm font-semibold text-gray-500">
                    Start tour
                  </button>
                </div>
              </li>
            );
          }
          const st = getStatus(meta.id, meta.version);
          const statusLabel =
            st === 'completed' ? 'Completed' : st === 'dismissed' ? 'Skipped / closed' : 'Not started';
          return (
            <li key={row.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-semibold text-gray-900">{row.title}</p>
                <p className="text-sm text-gray-600">{row.description}</p>
                <p className="mt-1 text-xs text-gray-500">Status: {statusLabel}</p>
              </div>
              <div className="flex shrink-0 gap-2">
                <button
                  type="button"
                  className="rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-800 hover:bg-gray-50"
                  onClick={() => resetTour(meta.id)}
                >
                  Reset
                </button>
                <button
                  type="button"
                  className="rounded-lg bg-[#0a61d7] px-3 py-2 text-sm font-semibold text-white hover:bg-[#084ba6]"
                  onClick={() => runTour(meta.id)}
                >
                  Start tour
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
