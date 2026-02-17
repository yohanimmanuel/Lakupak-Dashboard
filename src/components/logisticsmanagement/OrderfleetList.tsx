'use client';

import React, { useMemo, useState } from 'react';
import { Search, Filter, Truck, Clock, MapPin, ChevronRight } from 'lucide-react';

export type FleetStatus = 'In Transit' | 'Checking' | 'Delivered' | 'Delayed';

export interface FleetOrderSummary {
  id: string;
  orderCode: string;
  route: string;
  status: FleetStatus;
  distanceLeftKm: number;
  eta: string;
  lastUpdate: string;
  driverName: string;
}

interface OrderfleetListProps {
  fleets: FleetOrderSummary[];
  selectedFleetId?: string;
  onSelectFleet: (fleetId: string) => void;
}

const statusColors: Record<FleetStatus, string> = {
  'In Transit': 'bg-emerald-100 text-emerald-700',
  Checking: 'bg-amber-100 text-amber-700',
  Delivered: 'bg-blue-100 text-blue-700',
  Delayed: 'bg-rose-100 text-rose-700',
};

export default function OrderfleetList({
  fleets,
  selectedFleetId,
  onSelectFleet,
}: OrderfleetListProps) {
  const [search, setSearch] = useState('');

  const filteredFleets = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return fleets;
    return fleets.filter(f =>
      f.orderCode.toLowerCase().includes(q) ||
      f.route.toLowerCase().includes(q) ||
      f.driverName.toLowerCase().includes(q),
    );
  }, [fleets, search]);

  // Only show the tail placeholder when the list is short enough that
  // additional vertical padding is helpful. For longer lists that scroll,
  // we hide it so the list feels compact.
  const showTailPlaceholder = filteredFleets.length > 0 && filteredFleets.length <= 4;

  return (
    <div className="flex h-full max-h-[calc(100vh+100px)] flex-col rounded-lg bg-white border border-gray-200">
      {/* Toolbar */}
      <div className="flex flex-col gap-3 p-4 border-b border-gray-100">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-base font-semibold text-gray-900">Active Fleets &amp; Deliveries</h2>
          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-3 py-1 text-[11px] font-medium text-[#0a61d7]"
          >
            <Filter className="h-3 w-3" />
            Filters
          </button>
        </div>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search order ID, route, or driver"
              aria-label="Search orders by ID, route, or driver"
              className="w-full rounded-lg border border-gray-200 bg-gray-50/80 px-9 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-[#0a61d7] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#0a61d7]/10"
            />
          </div>
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {filteredFleets.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 px-4 py-10 text-center">
            <Truck className="h-8 w-8 text-gray-300" />
            <p className="text-sm font-medium text-gray-700">No fleets match your filters</p>
            <p className="text-xs text-gray-500">
              Adjust your search or filters to see active deliveries.
            </p>
          </div>
        ) : (
          <>
            <ul className="divide-y divide-gray-100">
              {filteredFleets.map(fleet => {
                const isActive = fleet.id === selectedFleetId;
                return (
                  <li key={fleet.id}>
                    <button
                      type="button"
                      onClick={() => onSelectFleet(fleet.id)}
                      className={`group flex w-full items-stretch gap-3 px-4 py-3 text-left transition-colors ${
                        isActive ? 'bg-[#0a61d7]/5' : 'hover:bg-gray-50'
                      }`}
                    >
                      <div className="mt-0.5 flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-blue-50 text-[#0a61d7]">
                        <Truck className="h-5 w-5" />
                      </div>
                      <div className="flex min-w-0 flex-1 flex-col gap-1">
                        <div className="flex items-center justify-between gap-2">
                          <p className="truncate text-sm font-semibold text-gray-900">
                            Order ID: {fleet.orderCode}
                          </p>
                          <span
                            className={`inline-flex flex-shrink-0 items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium ${statusColors[fleet.status]}`}
                          >
                            {fleet.status}
                          </span>
                        </div>
                        <p className="flex items-center gap-1 text-xs text-gray-500">
                          <MapPin className="h-3 w-3 text-gray-400" />
                          <span className="truncate">{fleet.route}</span>
                        </p>
                        <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-gray-500">
                          <span className="inline-flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            ETA {fleet.eta}
                          </span>
                          <span>{fleet.distanceLeftKm.toFixed(1)} km left</span>
                          <span className="truncate">Driver: {fleet.driverName}</span>
                          <span className="ml-auto inline-flex items-center gap-1 text-[11px] text-gray-400">
                            Updated {fleet.lastUpdate}
                            <ChevronRight className="h-3 w-3" />
                          </span>
                        </div>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>

            {showTailPlaceholder && (
              <div className="px-4 py-4">
                <div className="flex items-center justify-center gap-2 rounded-lg border border-dashed border-gray-200 bg-gray-50/70 px-3 py-2">
                  <Truck className="h-4 w-4 text-gray-300" />
                  <span className="text-[11px] font-medium text-gray-500">
                    No more fleets assigned for this view.
                  </span>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

