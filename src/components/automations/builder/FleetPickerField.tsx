'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Loader2, Truck, X } from 'lucide-react';
import OrderfleetList, {
  type FleetOrderSummary,
} from '@/components/logisticsmanagement/OrderfleetList';
import { fetchFleets } from '@/data/logisticsFleetsApi';
import { useAutomationTranslations } from '@/hooks/useAutomationTranslations';
import { useUserStore } from '@/store/userStore';

export type PickedFleet = {
  fleetId: string;
  fleetLabel: string;
  fleetStatus: string;
  driverId: string;
  driverName: string;
  assignedLogistics: string;
};

/** Prefer selectedFleets[]; fall back to legacy single fleetId fields. */
export function normalizePickedFleets(
  config: Record<string, unknown> | undefined,
): PickedFleet[] {
  const list = config?.selectedFleets;
  if (Array.isArray(list)) {
    return list
      .map((item) => {
        if (!item || typeof item !== 'object') return null;
        const row = item as Record<string, unknown>;
        const fleetId = String(row.fleetId ?? '').trim();
        if (!fleetId) return null;
        return {
          fleetId,
          fleetLabel: String(row.fleetLabel ?? ''),
          fleetStatus: String(row.fleetStatus ?? ''),
          driverId: String(row.driverId ?? ''),
          driverName: String(row.driverName ?? ''),
          assignedLogistics: String(row.assignedLogistics ?? ''),
        };
      })
      .filter((f): f is PickedFleet => Boolean(f));
  }

  const fleetId = String(config?.fleetId ?? '').trim();
  if (!fleetId) return [];
  return [
    {
      fleetId,
      fleetLabel: String(config?.fleetLabel ?? ''),
      fleetStatus: String(config?.fleetStatus ?? ''),
      driverId: String(config?.driverId ?? ''),
      driverName: String(config?.driverName ?? ''),
      assignedLogistics: String(config?.assignedLogistics ?? ''),
    },
  ];
}

/** @deprecated Prefer normalizePickedFleets */
export function normalizePickedFleet(config: Record<string, unknown> | undefined): PickedFleet | null {
  return normalizePickedFleets(config)[0] ?? null;
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
  selectedFleets,
  onSelectAction,
  onClearAction,
  requireDriver = false,
}: {
  label: string;
  selectedFleets: PickedFleet[];
  onSelectAction: (fleets: PickedFleet[]) => void;
  onClearAction: () => void;
  /** When true (assign_driver), only fleets with a driverId can be selected. */
  requireDriver?: boolean;
}) {
  const { tBuilder } = useAutomationTranslations();
  const user = useUserStore((s) => s.user);
  const [open, setOpen] = useState(false);
  const [fleets, setFleets] = useState<FleetOrderSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedFleetId, setSelectedFleetId] = useState(selectedFleets[0]?.fleetId ?? '');

  const loadFleets = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    setError(null);
    try {
      const pageSize = 100;
      let page = 1;
      let totalPages = 1;
      const all: FleetOrderSummary[] = [];
      do {
        const result = await fetchFleets(user.id, { page, limit: pageSize });
        all.push(...(result.nodes ?? []));
        totalPages = Math.max(1, result.pagination?.totalPages ?? 1);
        page += 1;
      } while (page <= totalPages);
      setFleets(all);
    } catch (e) {
      setError(e instanceof Error ? e.message : tBuilder('fleetPickerLoadFailed'));
      setFleets([]);
    } finally {
      setLoading(false);
    }
  }, [user?.id, tBuilder]);

  const selectedFleetIdsKey = selectedFleets.map((f) => f.fleetId).join(',');

  useEffect(() => {
    if (!open) return;
    setSelectedFleetId(selectedFleetIdsKey.split(',')[0] ?? '');
    void loadFleets();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, loadFleets]);

  const valueMissingDriver = Boolean(
    requireDriver &&
      selectedFleets.length > 0 &&
      selectedFleets.some((f) => !f.driverId.trim()),
  );

  const hasSelection = selectedFleets.length > 0 && !valueMissingDriver;
  const summaryLabel = useMemo(() => {
    if (selectedFleets.length === 0) return '';
    if (selectedFleets.length === 1) {
      return selectedFleets[0].fleetLabel || selectedFleets[0].fleetId;
    }
    return tBuilder('fleetPickerSelectedCount', { count: selectedFleets.length });
  }, [selectedFleets, tBuilder]);

  const summarySub = useMemo(() => {
    if (selectedFleets.length === 0) return '';
    if (selectedFleets.length === 1) {
      const f = selectedFleets[0];
      return [
        f.fleetStatus ? tBuilder('fleetPickerStatus', { status: f.fleetStatus }) : null,
        f.driverName
          ? tBuilder('fleetPickerDriver', { name: f.driverName })
          : tBuilder('fleetPickerNoDriver'),
      ]
        .filter(Boolean)
        .join(' · ');
    }
    const withDriver = selectedFleets.filter((f) => f.driverId.trim()).length;
    return tBuilder('fleetPickerDriversReady', {
      count: withDriver,
      total: selectedFleets.length,
    });
  }, [selectedFleets, tBuilder]);

  return (
    <div>
      <span className="mb-1 block text-xs font-medium text-gray-600">{label}</span>
      {hasSelection ? (
        <div className="space-y-2 rounded-lg border border-[#e6e6e6] bg-white px-3 py-2.5">
          <div className="flex items-start gap-2">
            <Truck className="mt-0.5 h-4 w-4 shrink-0 text-[#0a61d7]" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-semibold text-black">{summaryLabel}</p>
              <p className="mt-0.5 truncate text-[11px] text-gray-500">{summarySub}</p>
            </div>
            <div className="flex shrink-0 flex-col gap-1">
              <button
                type="button"
                onClick={() => setOpen(true)}
                className="rounded-md px-2 py-1 text-[11px] font-medium text-[#0a61d7] hover:bg-[#f7faff]"
              >
                {tBuilder('fleetPickerChange')}
              </button>
              <button
                type="button"
                onClick={onClearAction}
                className="rounded-md px-2 py-1 text-[11px] font-medium text-red-600 hover:bg-red-50"
              >
                {tBuilder('fleetPickerClear')}
              </button>
            </div>
          </div>
          {selectedFleets.length > 1 && (
            <ul className="space-y-1 border-t border-gray-100 pt-2">
              {selectedFleets.slice(0, 5).map((fleet) => (
                <li key={fleet.fleetId} className="truncate text-[11px] text-gray-600">
                  <span className="font-medium text-black">
                    {fleet.fleetLabel || fleet.fleetId}
                  </span>
                  {fleet.driverName ? ` · ${fleet.driverName}` : ''}
                </li>
              ))}
              {selectedFleets.length > 5 && (
                <li className="text-[11px] font-medium text-gray-400">
                  {tBuilder('fleetPickerAndMore')}
                </li>
              )}
            </ul>
          )}
        </div>
      ) : valueMissingDriver ? (
        <div className="space-y-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5">
          <p className="text-xs text-amber-800">{tBuilder('fleetPickerDriverRequired')}</p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="rounded-md px-2 py-1 text-[11px] font-medium text-[#0a61d7] hover:bg-white"
            >
              {tBuilder('fleetPickerChange')}
            </button>
            <button
              type="button"
              onClick={onClearAction}
              className="rounded-md px-2 py-1 text-[11px] font-medium text-red-600 hover:bg-white"
            >
              {tBuilder('fleetPickerClear')}
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-[#e6e6e6] bg-white px-3 py-2.5 text-xs font-semibold text-black hover:bg-gray-50"
        >
          <Truck className="h-4 w-4 text-[#0a61d7]" />
          {tBuilder('fleetPickerOpen')}
        </button>
      )}

      {open &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 p-3 sm:p-6"
            onClick={() => setOpen(false)}
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-label={tBuilder('fleetPickerTitle')}
              className="flex max-h-[min(90dvh,52rem)] w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-[#e6e6e6] bg-white shadow-xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex shrink-0 items-start justify-between gap-3 border-b border-gray-100 px-4 py-3">
                <div>
                  <h3 className="text-sm font-semibold text-black">
                    {tBuilder('fleetPickerTitle')}
                  </h3>
                  <p className="mt-0.5 text-xs text-gray-500">
                    {requireDriver
                      ? tBuilder('fleetPickerHintDriverMulti')
                      : tBuilder('fleetPickerHintMulti')}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="-mr-1 rounded-lg p-1 text-gray-500 hover:bg-gray-50 hover:text-black"
                  aria-label={tBuilder('fleetPickerClose')}
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto">
                {loading ? (
                  <div className="flex items-center justify-center gap-2 py-16 text-sm text-gray-500">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {tBuilder('fleetPickerLoading')}
                  </div>
                ) : error ? (
                  <div className="space-y-2 px-4 py-3">
                    <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
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
                ) : (
                  <OrderfleetList
                    fleets={fleets}
                    selectedFleetId={selectedFleetId}
                    onSelectFleet={setSelectedFleetId}
                    onFleetsDeleted={() => void loadFleets()}
                    pickerMode
                    pickerSingleSelect={false}
                    requireDriver={requireDriver}
                    pickerConfirmLabel={tBuilder('fleetPickerConfirm')}
                    initialSelectedFleetIds={selectedFleets.map((f) => f.fleetId)}
                    onConfirmPickerSelection={(picked) => {
                      onSelectAction(picked.map(fleetToPicked));
                      setOpen(false);
                    }}
                  />
                )}
              </div>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
