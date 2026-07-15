'use client';

import React, { useMemo, useLayoutEffect, useRef } from 'react';
import { Route, Layers, Clock } from 'lucide-react';
import { useLogisticsTranslations } from '@/hooks/useLogisticsTranslations';
import type { FleetOrderSummary } from './OrderfleetList';

interface FleetTripInfoProps {
  formData: Partial<FleetOrderSummary>;
  onFormChange: (updates: Partial<FleetOrderSummary>) => void;
  onTabCompletion: (tabId: 'trip', isComplete: boolean) => void;
  mode: 'create' | 'edit';
}

export default function FleetTripInfo({
  formData,
  onFormChange,
  onTabCompletion,
}: FleetTripInfoProps) {
  const { tTripInfo } = useLogisticsTranslations();
  const isComplete = useMemo(
    () =>
      Boolean(
        formData.distanceLeftKm != null &&
          formData.distanceLeftKm >= 0 &&
          formData.totalOrders != null &&
          formData.totalOrders >= 0 &&
          formData.lastUpdate?.trim()
      ),
    [formData.distanceLeftKm, formData.totalOrders, formData.lastUpdate]
  );

  const prevIsCompleteRef = useRef<boolean | undefined>(undefined);
  useLayoutEffect(() => {
    if (prevIsCompleteRef.current !== isComplete) {
      prevIsCompleteRef.current = isComplete;
      onTabCompletion('trip', isComplete);
    }
  }, [isComplete, onTabCompletion]);

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-gray-900 mb-1">{tTripInfo('title')}</h3>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-2">
            {tTripInfo('distanceKm')} <span className="text-red-500">*</span>
          </label>
          <div className="relative">
            <Route className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="number"
              min={0}
              step={0.1}
              value={formData.distanceLeftKm ?? ''}
              onChange={(e) => {
                const v = e.target.value === '' ? undefined : Number(e.target.value);
                onFormChange({ distanceLeftKm: v ?? 0 });
              }}
              placeholder={tTripInfo('placeholderDistance')}
              className="w-full pl-10 pr-4 py-2 text-black text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0a61d7] focus:border-transparent"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-700 mb-2">
            {tTripInfo('totalOrders')} <span className="text-red-500">*</span>
          </label>
          <div className="relative">
            <Layers className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="number"
              min={0}
              value={formData.totalOrders ?? ''}
              onChange={(e) => {
                const v = e.target.value === '' ? undefined : Number(e.target.value);
                onFormChange({ totalOrders: v ?? 0 });
              }}
              placeholder={tTripInfo('placeholderTotalOrders')}
              className="w-full pl-10 pr-4 py-2 text-black text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0a61d7] focus:border-transparent"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-700 mb-2">
            {tTripInfo('stopsCompleted')}
          </label>
          <input
            type="number"
            min={0}
            value={formData.deliveriesCompleted ?? ''}
            onChange={(e) => {
              const v = e.target.value === '' ? undefined : Number(e.target.value);
              onFormChange({ deliveriesCompleted: v ?? 0 });
            }}
            placeholder={tTripInfo('placeholderStops')}
            className="w-full px-4 py-2 text-black text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0a61d7] focus:border-transparent"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-700 mb-2">
            {tTripInfo('lastUpdate')} <span className="text-red-500">*</span>
          </label>
          <div className="relative">
            <Clock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={formData.lastUpdate || ''}
              onChange={(e) => onFormChange({ lastUpdate: e.target.value })}
              placeholder={tTripInfo('placeholderLastUpdate')}
              className="w-full pl-10 pr-4 py-2 text-black text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0a61d7] focus:border-transparent"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
