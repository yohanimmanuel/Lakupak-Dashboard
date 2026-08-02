'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, Truck } from 'lucide-react';
import type { FleetOrderSummary } from '@/components/logisticsmanagement/OrderfleetList';
import { fetchFleets } from '@/data/logisticsFleetsApi';
import { useAutomationTranslations } from '@/hooks/useAutomationTranslations';
import { useUserStore } from '@/store/userStore';
import { BuilderSelect } from './BuilderSelect';

export type PickedFleet = {
  fleetId: string;
  fleetLabel: string;
  fleetStatus: string;
  driverId: string;
  driverName: string;
  assignedLogistics: string;
};

export function normalizePickedFleet(config: Record<string, unknown> | undefined): PickedFleet | null {
  const fleetId = String(config?.fleetId ?? '').trim();
  if (!fleetId) return null;
  return {
    fleetId,
    fleetLabel: String(config?.fleetLabel ?? ''),
    fleetStatus: String(config?.fleetStatus ?? ''),
    driverId: String(config?.driverId ?? ''),
    driverName: String(config?.driverName ?? ''),
    assignedLogistics: String(config?.assignedLogistics ?? ''),
  };
}

export function fleetToPicked(fleet: FleetOrderSummary): PickedFleet {
  const labelParts = [fleet.orderCode, fleet.route].filter(Boolean);
  return {
    fleetId: fleet.id,
    fleetLabel: labelParts.join(' · ') || fleet.id,
    fleetStatus: fleet.status,
    driverId: fleet.driverId ?? fleet.driver?.id ?? '',
    driverName: fleet.driverName || fleet.driver?.name || '',
    assignedLogistics: fleet.assignedLogistics ?? '',
  };
}

export function FleetPickerField({
  label,
  value,
  onSelectAction,
  onClearAction,
  requireDriver = false,
}: {
  label: string;
  value: PickedFleet | null;
  onSelectAction: (fleet: PickedFleet) => void;
  onClearAction: () => void;
  /** When true (assign_driver), only fleets with a driverId can be selected. */
  requireDriver?: boolean;
}) {
  const { tBuilder } = useAutomationTranslations();
  const user = useUserStore((s) => s.user);
  const userId = user?.id ?? null;
  const [fleets, setFleets] = useState<FleetOrderSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestVersionRef = useRef(0);

  const loadFleets = useCallback(async () => {
    const requestVersion = ++requestVersionRef.current;
    const isCurrent = () => requestVersionRef.current === requestVersion;

    if (userId == null) {
      setFleets([]);
      setError(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const pageSize = 100;
      let page = 1;
      let totalPages = 1;
      const all: FleetOrderSummary[] = [];

      do {
        if (!isCurrent()) return;
        const result = await fetchFleets(userId, { page, limit: pageSize });
        if (!isCurrent()) return;
        all.push(...(result.nodes ?? []));
        totalPages = Math.max(1, result.pagination?.totalPages ?? 1);
        page += 1;
      } while (page <= totalPages);

      if (!isCurrent()) return;
      setFleets(all);
    } catch (e) {
      if (!isCurrent()) return;
      setError(e instanceof Error ? e.message : tBuilder('fleetPickerLoadFailed'));
      setFleets([]);
    } finally {
      if (!isCurrent()) return;
      setLoading(false);
    }
  }, [userId, tBuilder]);

  useEffect(() => {
    void loadFleets();
  }, [loadFleets]);

  const valueMissingDriver = Boolean(requireDriver && value?.fleetId && !value.driverId.trim());

  const options = useMemo(() => {
    const mapped = fleets
      .map((fleet) => {
        const picked = fleetToPicked(fleet);
        const driverBit = picked.driverName
          ? tBuilder('fleetPickerDriverSuffix', { name: picked.driverName })
          : tBuilder('fleetPickerNoDriver');
        return {
          value: fleet.id,
          label: `${picked.fleetLabel} · ${picked.fleetStatus} · ${driverBit}`,
          picked,
        };
      })
      .filter((o) => !requireDriver || Boolean(o.picked.driverId.trim()));

    if (
      value?.fleetId &&
      !mapped.some((o) => o.value === value.fleetId) &&
      (!requireDriver || Boolean(value.driverId.trim()))
    ) {
      mapped.unshift({
        value: value.fleetId,
        label: value.fleetLabel || value.fleetId,
        picked: value,
      });
    }

    return mapped;
  }, [fleets, value, tBuilder, requireDriver]);

  const eligibleCount = useMemo(
    () =>
      fleets.filter((fleet) => {
        const picked = fleetToPicked(fleet);
        return !requireDriver || Boolean(picked.driverId.trim());
      }).length,
    [fleets, requireDriver],
  );

  return (
    <div>
      <span className="mb-1 block text-xs font-medium text-gray-600">{label}</span>
      {loading ? (
        <div className="flex items-center gap-2 rounded-lg border border-[#e6e6e6] bg-white px-3 py-2.5 text-xs text-gray-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          {tBuilder('fleetPickerLoading')}
        </div>
      ) : error ? (
        <div className="space-y-2">
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            {error}
          </div>
          <button
            type="button"
            onClick={() => void loadFleets()}
            className="text-xs font-medium text-[#0a61d7] hover:underline"
          >
            {tBuilder('fleetPickerRetry')}
          </button>
        </div>
      ) : fleets.length === 0 && !value ? (
        <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 px-3 py-2.5 text-xs text-gray-500">
          {tBuilder('fleetPickerEmpty')}
        </div>
      ) : requireDriver && eligibleCount === 0 && !value?.driverId?.trim() ? (
        <div className="rounded-lg border border-dashed border-amber-300 bg-amber-50 px-3 py-2.5 text-xs text-amber-800">
          {tBuilder('fleetPickerEmptyNoDriver')}
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Truck className="h-4 w-4 shrink-0 text-[#0a61d7]" />
            <div className="min-w-0 flex-1">
              <BuilderSelect
                aria-label={label}
                value={valueMissingDriver ? '' : value?.fleetId ?? ''}
                options={[
                  { value: '', label: tBuilder('fleetPickerPlaceholder') },
                  ...options.map((o) => ({ value: o.value, label: o.label })),
                ]}
                onChangeAction={(next) => {
                  if (!next) {
                    onClearAction();
                    return;
                  }
                  const match = options.find((o) => o.value === next);
                  if (!match) return;
                  if (requireDriver && !match.picked.driverId.trim()) return;
                  onSelectAction(match.picked);
                }}
              />
            </div>
          </div>
          {valueMissingDriver ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-800">
              <p>{tBuilder('fleetPickerDriverRequired')}</p>
              <button
                type="button"
                onClick={onClearAction}
                className="mt-1.5 text-[11px] font-medium text-red-600 hover:underline"
              >
                {tBuilder('fleetPickerClear')}
              </button>
            </div>
          ) : value?.fleetId ? (
            <div className="rounded-lg border border-[#e6e6e6] bg-[#f7faff] px-3 py-2 text-[11px] text-gray-600">
              <p className="font-medium text-black">{value.fleetLabel || value.fleetId}</p>
              {value.fleetStatus ? (
                <p className="mt-0.5">{tBuilder('fleetPickerStatus', { status: value.fleetStatus })}</p>
              ) : null}
              {value.driverName ? (
                <p className="mt-0.5">{tBuilder('fleetPickerDriver', { name: value.driverName })}</p>
              ) : (
                <p className="mt-0.5">{tBuilder('fleetPickerNoDriver')}</p>
              )}
              {value.assignedLogistics ? (
                <p className="mt-0.5">
                  {tBuilder('fleetPickerLogistics', { name: value.assignedLogistics })}
                </p>
              ) : null}
              <button
                type="button"
                onClick={onClearAction}
                className="mt-1.5 text-[11px] font-medium text-red-600 hover:underline"
              >
                {tBuilder('fleetPickerClear')}
              </button>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
