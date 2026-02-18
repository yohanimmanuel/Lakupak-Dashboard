'use client';

import React, { useMemo, useState, useRef, useEffect } from 'react';
import { Search, Truck, Clock, MapPin, ChevronRight, Filter, ChevronDown } from 'lucide-react';

export type FleetStatus = 'In Transit' | 'Checking' | 'Delivered' | 'Delayed';

// Order statuses from orders module
export type OrderStatus = 'Pending' | 'Confirmed' | 'Packed' | 'Shipped' | 'Delivered' | 'Cancelled' | 'Returned';

// Delivery types from distributor operations shipping options
export type DeliveryType = 'Standard Shipping' | 'Express Shipping' | 'Same-day Delivery' | 'Next-day Delivery' | 'Scheduled Delivery' | 'Pickup Available';

export interface FleetOrderSummary {
  id: string;
  orderCode: string;
  route: string;
  status: FleetStatus;
  orderStatus?: OrderStatus; // Order status from orders module
  deliveryType?: DeliveryType; // Delivery type from distributor shipping options
  distanceLeftKm: number;
  eta: string;
  lastUpdate: string;
  driverName: string;
  /** Total orders (from different customers) delivered in this fleet */
  totalOrders?: number;
  /** Number of deliveries completed so far in this fleet run */
  deliveriesCompleted?: number;
  /** Customers (stores) with orders in this fleet */
  customers?: { storeName: string; contactName: string }[];
}

interface OrderfleetListProps {
  fleets: FleetOrderSummary[];
  selectedFleetId?: string;
  onSelectFleet: (fleetId: string) => void;
  /** Delivery types offered by the distributor (from company shipping options). Only these will show as filters. */
  availableDeliveryTypes?: DeliveryType[];
}

const statusColors: Record<FleetStatus, string> = {
  'In Transit': 'bg-emerald-100 text-emerald-700',
  Checking: 'bg-amber-100 text-amber-700',
  Delivered: 'bg-blue-100 text-blue-700',
  Delayed: 'bg-rose-100 text-rose-700',
};

const ALL_DELIVERY_TYPES: DeliveryType[] = [
  'Standard Shipping',
  'Express Shipping',
  'Same-day Delivery',
  'Next-day Delivery',
  'Scheduled Delivery',
  'Pickup Available',
];

export default function OrderfleetList({
  fleets,
  selectedFleetId,
  onSelectFleet,
  availableDeliveryTypes = [],
}: OrderfleetListProps) {
  // Distributor options + always Standard Shipping (every distributor has it)
  const deliveryTypesToShow = (() => {
    const base =
      availableDeliveryTypes.length > 0
        ? availableDeliveryTypes.filter((t): t is DeliveryType => ALL_DELIVERY_TYPES.includes(t))
        : [];
    const withStandard =
      base.includes('Standard Shipping') ? base : (['Standard Shipping', ...base] as DeliveryType[]);
    return withStandard.length > 0 ? withStandard : (['Standard Shipping'] as DeliveryType[]);
  })();
  const [search, setSearch] = useState('');
  const [selectedDeliveryStatus, setSelectedDeliveryStatus] = useState<FleetStatus | null>(null);
  const [selectedDeliveryType, setSelectedDeliveryType] = useState<DeliveryType | null>(null);
  const [showDeliveryStatusDropdown, setShowDeliveryStatusDropdown] = useState(false);
  const [showDeliveryTypeDropdown, setShowDeliveryTypeDropdown] = useState(false);
  const deliveryStatusDropdownRef = useRef<HTMLDivElement>(null);
  const deliveryTypeDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (deliveryStatusDropdownRef.current && !deliveryStatusDropdownRef.current.contains(event.target as Node)) {
        setShowDeliveryStatusDropdown(false);
      }
      if (deliveryTypeDropdownRef.current && !deliveryTypeDropdownRef.current.contains(event.target as Node)) {
        setShowDeliveryTypeDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Delivery status from logistics module (not order status)
  const DELIVERY_STATUSES: FleetStatus[] = ['In Transit', 'Checking', 'Delivered', 'Delayed'];

  const filteredFleets = useMemo(() => {
    let result = fleets;

    // Text search filter
    const q = search.trim().toLowerCase();
    if (q) {
      result = result.filter(f =>
        f.orderCode.toLowerCase().includes(q) ||
        f.route.toLowerCase().includes(q) ||
        f.driverName.toLowerCase().includes(q),
      );
    }

    // Delivery status filter (logistics status)
    if (selectedDeliveryStatus) {
      result = result.filter(f => f.status === selectedDeliveryStatus);
    }

    // Delivery type filter
    if (selectedDeliveryType) {
      result = result.filter(f => f.deliveryType === selectedDeliveryType);
    }

    return result;
  }, [fleets, search, selectedDeliveryStatus, selectedDeliveryType]);

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
        </div>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search fleet ID, route, or driver"
              aria-label="Search fleets by ID, route, or driver"
              className="w-full rounded-lg border border-gray-200 bg-gray-50/80 px-9 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-[#0a61d7] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#0a61d7]/10"
            />
          </div>
        </div>

        {/* Filter dropdowns - same style as ProductTable */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Delivery Status Dropdown (logistics module status) */}
          <div className="relative" ref={deliveryStatusDropdownRef}>
            <button
              type="button"
              className="flex items-center gap-1 px-3 py-2 rounded-lg border border-[#e6e6e6] bg-white text-gray-700 hover:bg-gray-100 text-sm"
              onClick={() => {
                setShowDeliveryStatusDropdown(v => !v);
                setShowDeliveryTypeDropdown(false);
              }}
            >
              <Filter className="w-4 h-4" />
              {selectedDeliveryStatus ?? 'All statuses'}
              <ChevronDown className="w-4 h-4 ml-1 text-gray-500" />
            </button>
            {showDeliveryStatusDropdown && (
              <div className="absolute left-0 mt-2 min-w-[10rem] w-48 max-h-56 overflow-y-auto bg-white border border-[#e6e6e6] rounded-lg shadow z-20">
                <button
                  type="button"
                  onClick={() => {
                    setSelectedDeliveryStatus(null);
                    setShowDeliveryStatusDropdown(false);
                  }}
                  className={`w-full text-left px-4 py-2 text-sm first:rounded-t-lg hover:bg-gray-100 ${
                    selectedDeliveryStatus === null ? 'text-[#0a61d7] font-semibold' : 'text-gray-700'
                  }`}
                >
                  All statuses
                </button>
                {DELIVERY_STATUSES.map((status) => (
                  <button
                    key={status}
                    type="button"
                    onClick={() => {
                      setSelectedDeliveryStatus(status);
                      setShowDeliveryStatusDropdown(false);
                    }}
                    className={`w-full text-left px-4 py-2 text-sm last:rounded-b-lg hover:bg-gray-100 ${
                      selectedDeliveryStatus === status ? 'text-[#0a61d7] font-semibold' : 'text-gray-700'
                    }`}
                  >
                    {status}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Delivery Type Dropdown - only options the distributor offers */}
          {deliveryTypesToShow.length > 0 && (
            <div className="relative" ref={deliveryTypeDropdownRef}>
              <button
                type="button"
                className="flex items-center gap-1 px-3 py-2 rounded-lg border border-[#e6e6e6] bg-white text-gray-700 hover:bg-gray-100 text-sm"
                onClick={() => {
                  setShowDeliveryTypeDropdown(v => !v);
                  setShowDeliveryStatusDropdown(false);
                }}
              >
                <Filter className="w-4 h-4" />
                {selectedDeliveryType ?? 'All types'}
                <ChevronDown className="w-4 h-4 ml-1 text-gray-500" />
              </button>
              {showDeliveryTypeDropdown && (
                <div className="absolute left-0 mt-2 min-w-[10rem] w-52 max-h-56 overflow-y-auto bg-white border border-[#e6e6e6] rounded-lg shadow z-20">
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedDeliveryType(null);
                      setShowDeliveryTypeDropdown(false);
                    }}
                    className={`w-full text-left px-4 py-2 text-sm first:rounded-t-lg hover:bg-gray-100 ${
                      selectedDeliveryType === null ? 'text-[#0a61d7] font-semibold' : 'text-gray-700'
                    }`}
                  >
                    All types
                  </button>
                  {deliveryTypesToShow.map((type) => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => {
                        setSelectedDeliveryType(type);
                        setShowDeliveryTypeDropdown(false);
                      }}
                      className={`w-full text-left px-4 py-2 text-sm last:rounded-b-lg hover:bg-gray-100 ${
                        selectedDeliveryType === type ? 'text-[#0a61d7] font-semibold' : 'text-gray-700'
                      }`}
                    >
                      {type}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
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
                            Fleet ID: {fleet.orderCode}
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
                            Completion {fleet.eta}
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

