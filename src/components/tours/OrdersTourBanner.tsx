'use client';

import React, { useEffect, useState } from 'react';
import { DASHBOARD_TOURS } from '@/components/tours/tourIds';
import { useDashboardTourOptional } from '@/components/tours/TourProvider';
import { useOrdersTranslations } from '@/hooks/useOrdersTranslations';

const SESSION_ORDERS_BANNER = 'laku.dashboard.tours.ordersBannerSession';

export function OrdersTourBanner() {
  const { tTour } = useOrdersTranslations();
  const tour = useDashboardTourOptional();
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!tour) return;
    if (typeof window === 'undefined') return;
    if (sessionStorage.getItem(SESSION_ORDERS_BANNER)) return;
    if (tour.getStatus(DASHBOARD_TOURS.orders.id, DASHBOARD_TOURS.orders.version) !== 'none') return;
    setShow(true);
  }, [tour]);

  if (!tour || !show) return null;

  return (
    <div
      className="mb-4 flex flex-col gap-3 rounded-lg border border-blue-100 bg-blue-50/80 p-4 sm:flex-row sm:items-center sm:justify-between"
      role="region"
      aria-label={tTour('ariaLabel')}
    >
      <div>
        <p className="text-sm font-semibold text-gray-900">{tTour('title')}</p>
        <p className="text-sm text-gray-600">{tTour('description')}</p>
      </div>
      <div className="flex shrink-0 gap-2">
        <button
          type="button"
          className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-800 hover:bg-gray-50"
          onClick={() => {
            sessionStorage.setItem(SESSION_ORDERS_BANNER, '1');
            setShow(false);
          }}
        >
          {tTour('dismiss')}
        </button>
        <button
          type="button"
          className="rounded-lg bg-[#0a61d7] px-3 py-2 text-sm font-semibold text-white hover:bg-[#084ba6]"
          onClick={() => {
            sessionStorage.setItem(SESSION_ORDERS_BANNER, '1');
            setShow(false);
            tour.runTour('orders');
          }}
        >
          {tTour('startTour')}
        </button>
      </div>
    </div>
  );
}
