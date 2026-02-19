'use client';

import React, { useMemo, useState, useRef, useEffect } from 'react';
import Image from 'next/image';
import { Search, Truck, Clock, MapPin, Filter, ChevronDown, User, Trash, Trash2 } from 'lucide-react';
import { getVehicleTypeInfo } from '@/config/vehicleTypes';
import { useUserStore } from '@/store/userStore';
import { deleteFleet } from '@/data/logisticsFleetsApi';

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
  orderStatus?: OrderStatus;
  deliveryType?: DeliveryType;
  eta: string;
  lastUpdate: string;
  driverName: string;
  totalOrders?: number;
  deliveriesCompleted?: number;
  customers?: { storeName: string; contactName: string }[];
  vehicleType?: string;
  loadPct?: number;
  /** Payment terms */
  paymentTerms?: string;
  /** Vehicle details */
  vehicleBrand?: string;
  vehicleModel?: string;
  vehicleMaxWeight?: number;
  vehicleMaxVolume?: number;
  /** Driver phone */
  driverPhone?: string;
  /** Driver experience (e.g. 5+ years) */
  driverExperience?: string;
  /** Driver status (e.g. On route, Available) */
  driverStatus?: string;
  /** Driver avatar URL (Cloudinary) */
  driverAvatar?: string;
  /** Assigned order IDs for reference */
  assignedOrderIds?: string[];
  /** Order IDs marked as delivered (for checklist) */
  completedOrderIds?: string[];
  /** Distance left (km) – trip form / display only */
  distanceLeftKm?: number;
}

interface OrderfleetListProps {
  fleets: FleetOrderSummary[];
  selectedFleetId?: string;
  onSelectFleet: (fleetId: string) => void;
  /** Delivery types offered by the distributor (from company shipping options). Only these will show as filters. */
  availableDeliveryTypes?: DeliveryType[];
  /** Callback when fleets are deleted - parent should refresh the list */
  onFleetsDeleted?: () => void;
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
  onFleetsDeleted,
}: OrderfleetListProps) {
  const user = useUserStore((state) => state.user);
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
  const [selectedFleets, setSelectedFleets] = useState<string[]>([]);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [fleetToDelete, setFleetToDelete] = useState<FleetOrderSummary | null>(null);
  const [isBulkDelete, setIsBulkDelete] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

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

  // Checkbox selection handlers
  const allFilteredFleetIds = useMemo(() => filteredFleets.map((f) => f.id), [filteredFleets]);
  const allFilteredSelected = useMemo(
    () => allFilteredFleetIds.length > 0 && allFilteredFleetIds.every((id) => selectedFleets.includes(id)),
    [allFilteredFleetIds, selectedFleets],
  );

  const handleFleetSelect = (fleetId: string) => {
    setSelectedFleets((prev) => (prev.includes(fleetId) ? prev.filter((id) => id !== fleetId) : [...prev, fleetId]));
  };

  const handleSelectAll = () => {
    if (allFilteredSelected) {
      setSelectedFleets((prev) => prev.filter((id) => !allFilteredFleetIds.includes(id)));
    } else {
      setSelectedFleets((prev) => {
        const newSelection = [...prev];
        allFilteredFleetIds.forEach((id) => {
          if (!newSelection.includes(id)) {
            newSelection.push(id);
          }
        });
        return newSelection;
      });
    }
  };

  const handleRowClick = (fleetId: string, event: React.MouseEvent) => {
    if ((event.target as HTMLElement).closest('button') || (event.target as HTMLElement).closest('input')) {
      return;
    }
    onSelectFleet(fleetId);
  };

  const handleDelete = (fleet: FleetOrderSummary) => {
    setFleetToDelete(fleet);
    setIsBulkDelete(false);
    setShowDeleteModal(true);
  };

  const handleBulkRemove = () => {
    setIsBulkDelete(true);
    setFleetToDelete(null);
    setShowDeleteModal(true);
  };

  const handleDeleteCancel = () => {
    setShowDeleteModal(false);
    setFleetToDelete(null);
    setIsBulkDelete(false);
  };

  const handleDeleteConfirm = async () => {
    if (!user?.id || isDeleting) return;

    setIsDeleting(true);
    try {
      if (isBulkDelete) {
        const fleetIdsToDelete = selectedFleets;
        const failedDeletes: string[] = [];
        const successfulDeletes: string[] = [];

        for (const fleetId of fleetIdsToDelete) {
          try {
            await deleteFleet(user.id, fleetId);
            successfulDeletes.push(fleetId);
          } catch (error) {
            failedDeletes.push(fleetId);
            console.error(`Failed to delete fleet ${fleetId}:`, error);
          }
        }

        if (failedDeletes.length > 0) {
          const message =
            successfulDeletes.length > 0
              ? `Successfully deleted ${successfulDeletes.length} fleet(s). Failed to delete ${failedDeletes.length} fleet(s). Please try again.`
              : `Failed to delete ${failedDeletes.length} fleet(s). Please try again.`;
          alert(message);
        }

        setSelectedFleets((prev) => prev.filter((id) => !successfulDeletes.includes(id)));
        if (successfulDeletes.length > 0 && onFleetsDeleted) {
          onFleetsDeleted();
        }
      } else if (fleetToDelete) {
        await deleteFleet(user.id, fleetToDelete.id);
        if (onFleetsDeleted) {
          onFleetsDeleted();
        }
      }
    } catch (error) {
      console.error('Delete error:', error);
      alert('Failed to delete fleet. Please try again.');
    } finally {
      setIsDeleting(false);
      setShowDeleteModal(false);
      setFleetToDelete(null);
      setIsBulkDelete(false);
    }
  };

  return (
    <div className="flex h-full max-h-[calc(100vh+100px)] flex-col rounded-lg bg-white border border-gray-200">
      {/* Toolbar */}
      <div className="flex flex-col gap-3 p-4 border-b border-gray-100">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-base font-semibold text-gray-900">Active Fleets &amp; Deliveries</h2>
        </div>
        <div className="flex gap-2 items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search for shipments"
              aria-label="Search for shipments"
              className="w-full rounded-lg border border-gray-200 px-9 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-[#0a61d7] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#0a61d7]"
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

        {/* Select All Checkbox - below filter dropdowns */}
        <div className="flex items-center gap-2">
          <button
            onClick={handleSelectAll}
            className={`w-5 h-5 border-2 rounded transition-all duration-200 flex items-center justify-center ${
              allFilteredSelected ? 'bg-green-500 border-green-500' : 'bg-white border-gray-300 hover:border-green-400'
            }`}
            title={allFilteredSelected ? 'Deselect all' : 'Select all'}
          >
            {allFilteredSelected && (
              <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                <path
                  fillRule="evenodd"
                  d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                  clipRule="evenodd"
                />
              </svg>
            )}
          </button>
          <span className="text-sm text-gray-700">
            {allFilteredSelected ? 'Deselect all' : 'Select all'}
          </span>
        </div>
      </div>

      {/* Bulk Action Bar */}
      {selectedFleets.length > 0 && (
        <div className="bg-gradient-to-r from-green-500 to-green-400 rounded-lg p-3 md:p-4 mx-4 mb-2">
          {/* Mobile Layout */}
          <div className="md:hidden space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1">
                <div className="text-white flex items-center justify-center text-sm font-semibold">{selectedFleets.length}</div>
                <span className="text-sm font-semibold text-white">
                  {selectedFleets.length === 1 ? 'fleet' : 'fleets'} selected
                </span>
              </div>
            </div>
            <div className="text-white text-xs font-semibold leading-relaxed">Select fleets to be removed from the system.</div>
            <div className="flex gap-2">
              <button
                onClick={handleBulkRemove}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-red-600 text-white font-semibold text-sm rounded-lg hover:bg-red-700 transition-colors"
              >
                <Trash className="w-4 h-4 text-white" />
                Remove
              </button>
            </div>
          </div>

          {/* Desktop Layout */}
          <div className="hidden md:flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1">
                <div className="text-white flex items-center justify-center text-sm font-semibold">{selectedFleets.length}</div>
                <span className="text-sm font-semibold text-white">
                  {selectedFleets.length === 1 ? 'fleet' : 'fleets'} selected
                </span>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <span className="text-white text-xs md:text-sm font-semibold">Select fleets to remove from the system.</span>
              <div className="flex gap-2">
                <button
                  onClick={handleBulkRemove}
                  className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white font-semibold text-sm rounded-lg hover:bg-red-700 transition-colors"
                >
                  <Trash className="w-4 h-4 text-white" />
                  Remove
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

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
            <ul className="flex flex-col gap-2 p-4">
              {filteredFleets.map(fleet => {
                const isActive = fleet.id === selectedFleetId;
                const loadPct = fleet.loadPct ?? 0;
                const vehicleInfo = getVehicleTypeInfo(fleet.vehicleType ?? '20ft_container');
                const isSelected = selectedFleets.includes(fleet.id);
                return (
                  <li key={fleet.id}>
                    <div
                      className={`group w-full rounded-lg border-2 bg-white p-4 text-left transition-all ${
                        isActive ? 'border-[#0a61d7]' : isSelected ? 'border-gray-200' : 'border-gray-200 hover:border-gray-200 hover:shadow'
                      }`}
                      role="button"
                      tabIndex={0}
                      onClick={(e) => handleRowClick(fleet.id, e)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          handleRowClick(fleet.id, e as unknown as React.MouseEvent);
                        }
                      }}
                    >
                      {/* Top row: Fleet ID, route, circular progress */}
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-bold text-gray-900">{fleet.orderCode}</p>
                          <p className="mt-0.5 truncate text-xs text-gray-500">{fleet.deliveryType ?? 'Delivery'}</p>
                        </div>
                        <p className="hidden shrink-0 text-xs text-gray-500 sm:block">{fleet.route}</p>
                        {/* Circular progress */}
                        <div className="relative h-12 w-12 flex-shrink-0">
                          <svg className="h-12 w-12 -rotate-90" viewBox="0 0 36 36">
                            <circle cx="18" cy="18" r="15.5" fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray="4 3" className="text-blue-300" />
                            <circle cx="18" cy="18" r="15.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="text-blue-500" strokeDasharray={`${(loadPct / 100) * 97.34} 200`} />
                          </svg>
                          <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-gray-700">{loadPct}%</span>
                        </div>
                      </div>
                      <p className="mt-2 flex items-center gap-1.5 text-xs text-gray-500 sm:hidden">
                        <MapPin className="h-3 w-3 shrink-0 text-gray-400" />
                        <span className="truncate">{fleet.route}</span>
                      </p>
                      {/* Bottom row: Courier (avatar or icon), truck image */}
                      <div className="mt-3 mb-2 flex items-center justify-between gap-3">
                        <div className="flex min-w-0 items-center gap-2">
                          <div className="relative h-9 w-9 shrink-0 overflow-hidden rounded-full border-2 border-gray-200 text-gray-600">
                            {fleet.driverAvatar ? (
                              <Image src={fleet.driverAvatar} alt={fleet.driverName} fill className="object-cover" sizes="36px" unoptimized />
                            ) : (
                              <span className="flex h-full w-full items-center justify-center"><User className="h-4 w-4" /></span>
                            )}
                          </div>
                          <div className="min-w-0">
                            <p className="text-[10px] font-medium text-gray-400">Courier</p>
                            <p className="flex items-center gap-1.5 truncate text-xs font-semibold text-gray-900">
                              {fleet.driverName}
                              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" aria-hidden />
                            </p>
                          </div>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <span className="text-right text-[10px] font-medium text-gray-600 truncate max-w-[72px]">{vehicleInfo.label}</span>
                          <div className="relative h-10 w-[84px] shrink-0 overflow-hidden">
                            <Image src={vehicleInfo.imagePath} alt={vehicleInfo.label} fill className="object-contain object-center" sizes="60px" unoptimized />
                          </div>
                        </div>
                      </div>

                      {/* Actions row: Checkbox and Delete button - border touches card edges */}
                      <div className="pt-2 -mb-2 -mx-4 border-t border-gray-200 px-4 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleFleetSelect(fleet.id);
                            }}
                            className={`w-4 h-4 border-2 rounded transition-all duration-200 flex items-center justify-center ${
                              isSelected ? 'bg-green-500 border-green-500' : 'bg-white border-gray-300 hover:border-green-400'
                            }`}
                            title={isSelected ? 'Deselect fleet' : 'Select fleet'}
                          >
                            {isSelected && (
                              <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                                <path
                                  fillRule="evenodd"
                                  d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                                  clipRule="evenodd"
                                />
                              </svg>
                            )}
                          </button>
                          <span className="text-xs text-gray-600 font-medium">
                            {isSelected ? 'Selected' : 'Select'}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDelete(fleet);
                          }}
                          className="inline-flex items-center justify-center rounded-lg p-2 hover:bg-red-100 transition-colors focus:outline-none"
                          title="Delete fleet"
                        >
                          <Trash2 className="w-4 h-4 text-red-600" />
                        </button>
                      </div>
                    </div>
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

      {/* Delete Confirmation Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-lg border border-[#e6e6e6] p-4 w-full max-w-sm">
            <h2 className="text-lg font-bold mb-2 text-red-500">
              {isBulkDelete ? 'Delete Fleets' : 'Delete Fleet'}
            </h2>
            <p className="mb-4 text-gray-500">
              {isBulkDelete
                ? `Are you sure you want to delete ${selectedFleets.length} fleet${selectedFleets.length === 1 ? '' : 's'}? This action cannot be undone.`
                : `Are you sure you want to delete ${fleetToDelete?.orderCode || 'this fleet'}? This action cannot be undone.`}
            </p>
            <div className="flex justify-end gap-2">
              <button
                className="px-4 py-2 rounded-lg bg-gray-200 text-gray-700 hover:bg-gray-300 transition-colors"
                onClick={handleDeleteCancel}
                disabled={isDeleting}
              >
                Cancel
              </button>
              <button
                className={`px-4 py-2 rounded-lg text-white hover:opacity-90 transition-colors ${
                  isBulkDelete ? 'bg-red-600 hover:bg-red-700' : 'bg-red-600 hover:bg-red-700'
                }`}
                onClick={handleDeleteConfirm}
                disabled={isDeleting}
              >
                {isDeleting ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

