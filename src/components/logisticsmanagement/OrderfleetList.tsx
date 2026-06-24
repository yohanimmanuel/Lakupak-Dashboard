'use client';

import React, { useMemo, useState, useRef, useEffect } from 'react';
import Image from 'next/image';
import { Search, Truck, MapPin, Filter, ChevronDown, User, Trash, Trash2, Phone, Briefcase, AtSign, ShieldCheck } from 'lucide-react';
import { getVehicleTypeInfo } from '@/config/vehicleTypes';
import { useUserStore } from '@/store/userStore';
import { deleteFleet, deleteDriver, type DriverSummary } from '@/data/logisticsFleetsApi';
import { useLogisticsTranslations } from '@/hooks/useLogisticsTranslations';

export type { DriverSummary };

/** Format fleet ETA completion date + time for display. */
export function formatEtaCompletion(fleet: { etaCompletionDate?: string | null; etaCompletionTime?: string | null }): string {
  const d = fleet.etaCompletionDate;
  const t = fleet.etaCompletionTime?.trim();
  if (!d) return '—';
  try {
    const date = new Date(d);
    if (isNaN(date.getTime())) return '—';
    const dateStr = date.toLocaleDateString(undefined, { day: '2-digit', month: '2-digit', year: 'numeric' });
    return t ? `${dateStr} ${t}` : dateStr;
  } catch {
    return '—';
  }
}

/** Format fleet assigned date (YYYY-MM-DD or ISO) for display. */
export function formatAssignedDate(assignedDate?: string | null): string {
  if (!assignedDate?.trim()) return '—';
  try {
    const date = new Date(assignedDate.trim());
    if (isNaN(date.getTime())) return '—';
    return date.toLocaleDateString(undefined, { day: '2-digit', month: '2-digit', year: 'numeric' });
  } catch {
    return '—';
  }
}

export type FleetStatus = 'Available' | 'Unavailable' | 'In Transit' | 'Checking';

// Order statuses from orders module
export type OrderStatus = 'Pending' | 'Confirmed' | 'Packed' | 'Shipped' | 'Delivered' | 'Failed' | 'Cancelled' | 'Returned';

// Delivery types from distributor operations shipping options
export type DeliveryType = 'Standard Shipping' | 'Express Shipping' | 'Same-day Delivery' | 'Next-day Delivery' | 'Scheduled Delivery' | 'Pickup Available';

export interface FleetOrderSummary {
  id: string;
  orderCode: string;
  route: string;
  status: FleetStatus;
  orderStatus?: OrderStatus;
  deliveryType?: DeliveryType;
  etaCompletionDate?: string | null;
  etaCompletionTime?: string | null;
  /** Date drivers see this fleet (YYYY-MM-DD); when set, tasks use this date. */
  assignedDate?: string | null;
  lastUpdate: string;
  /** Nested driver object from the Driver relation */
  driver?: DriverSummary | null;
  /** Foreign key to Driver */
  driverId?: string;
  driverName: string;
  totalOrders?: number;
  deliveriesCompleted?: number;
  customers?: { storeName: string; contactName: string }[];
  vehicleType?: string;
  loadPct?: number;
  /** Payment terms */
  paymentTerms?: string;
  /** Assigned logistics label (e.g. "Distributor Fleet") */
  assignedLogistics?: string;
  /** Vehicle details */
  vehicleBrand?: string;
  vehicleModel?: string;
  plateNumber?: string;
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
  /** Driver app login username */
  driverUsername?: string;
  /** Order IDs assigned to this fleet */
  assignedOrderIds?: string[];
  /** Order IDs marked as delivered (for checklist) */
  completedOrderIds?: string[];
  /** Actual delivery addresses from assigned orders (for real route mapping) */
  deliveryAddresses?: string[];
  /** Per-stop completion aligned with deliveryAddresses (Delivered or Received) */
  deliveryStopsCompleted?: boolean[];
  /** Driver's last known GPS latitude (synced from Laku-Driver app) */
  driverLat?: number | null;
  /** Driver's last known GPS longitude */
  driverLng?: number | null;
  /** ISO timestamp of when the driver location was last updated */
  driverLocationAt?: string | null;
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
  /** Driver list for the Drivers tab */
  drivers?: DriverSummary[];
  /** Callback when a driver is deleted */
  onDriverDeleted?: () => void;
}

const statusColors: Record<FleetStatus, string> = {
  Available: 'bg-emerald-100 text-emerald-700',
  Unavailable: 'bg-gray-200 text-gray-700',
  'In Transit': 'bg-sky-100 text-sky-700',
  Checking: 'bg-amber-100 text-amber-700',
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
  drivers = [],
  onDriverDeleted,
}: OrderfleetListProps) {
  const {
    tShared,
    tList,
    translateFleetStatus,
    translateDeliveryType,
    translateVehicleType,
  } = useLogisticsTranslations();
  const user = useUserStore((state) => state.user);
  const [activeTab, setActiveTab] = useState<'fleets' | 'drivers'>('fleets');
  const [driverSearchQuery, setDriverSearchQuery] = useState('');
  const [selectedDriverIds, setSelectedDriverIds] = useState<string[]>([]);
  const [driverToDelete, setDriverToDelete] = useState<DriverSummary | null>(null);
  const [isBulkDriverDelete, setIsBulkDriverDelete] = useState(false);
  const [showDriverDeleteModal, setShowDriverDeleteModal] = useState(false);
  const [isDeletingDriver, setIsDeletingDriver] = useState(false);
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

  // Fleet status (availability / operational state)
  const DELIVERY_STATUSES: FleetStatus[] = ['Available', 'Unavailable', 'In Transit', 'Checking'];

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
              ? tList('deleteFleetPartialSuccess', {
                  success: successfulDeletes.length,
                  failed: failedDeletes.length,
                })
              : tList('deleteFleetAllFailed', { count: failedDeletes.length });
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
      alert(tList('deleteFleetFailed'));
    } finally {
      setIsDeleting(false);
      setShowDeleteModal(false);
      setFleetToDelete(null);
      setIsBulkDelete(false);
    }
  };

  const filteredDrivers = useMemo(() => {
    const q = driverSearchQuery.trim().toLowerCase();
    if (!q) return drivers;
    return drivers.filter(
      (d) =>
        d.name.toLowerCase().includes(q) ||
        d.username.toLowerCase().includes(q) ||
        (d.phone ?? '').toLowerCase().includes(q),
    );
  }, [drivers, driverSearchQuery]);

  const allFilteredDriverIds = useMemo(() => filteredDrivers.map((d) => d.id), [filteredDrivers]);
  const allFilteredDriversSelected = useMemo(
    () => allFilteredDriverIds.length > 0 && allFilteredDriverIds.every((id) => selectedDriverIds.includes(id)),
    [allFilteredDriverIds, selectedDriverIds],
  );

  const handleDriverCheckbox = (driverId: string) => {
    setSelectedDriverIds((prev) =>
      prev.includes(driverId) ? prev.filter((id) => id !== driverId) : [...prev, driverId],
    );
  };

  const handleSelectAllDrivers = () => {
    if (allFilteredDriversSelected) {
      setSelectedDriverIds((prev) => prev.filter((id) => !allFilteredDriverIds.includes(id)));
    } else {
      setSelectedDriverIds((prev) => {
        const next = [...prev];
        allFilteredDriverIds.forEach((id) => { if (!next.includes(id)) next.push(id); });
        return next;
      });
    }
  };

  const handleDriverDeleteClick = (driver: DriverSummary) => {
    setDriverToDelete(driver);
    setIsBulkDriverDelete(false);
    setShowDriverDeleteModal(true);
  };

  const handleBulkDriverRemove = () => {
    setIsBulkDriverDelete(true);
    setDriverToDelete(null);
    setShowDriverDeleteModal(true);
  };

  const handleDriverDeleteCancel = () => {
    setShowDriverDeleteModal(false);
    setDriverToDelete(null);
    setIsBulkDriverDelete(false);
  };

  const handleDriverDeleteConfirm = async () => {
    if (!user?.id || isDeletingDriver) return;
    setIsDeletingDriver(true);
    try {
      if (isBulkDriverDelete) {
        const toDelete = [...selectedDriverIds];
        const failed: string[] = [];
        const succeeded: string[] = [];
        for (const id of toDelete) {
          try {
            await deleteDriver(user.id, id);
            succeeded.push(id);
          } catch {
            failed.push(id);
          }
        }
        if (failed.length > 0) {
          alert(
            succeeded.length > 0
              ? tList('deleteDriverPartialSuccess', {
                  success: succeeded.length,
                  failed: failed.length,
                })
              : tList('deleteDriverAllFailed', { count: failed.length }),
          );
        }
        setSelectedDriverIds((prev) => prev.filter((id) => !succeeded.includes(id)));
        if (succeeded.length > 0 && onDriverDeleted) onDriverDeleted();
      } else if (driverToDelete) {
        await deleteDriver(user.id, driverToDelete.id);
        if (onDriverDeleted) onDriverDeleted();
      }
    } catch {
      alert(tList('deleteDriverFailed'));
    } finally {
      setIsDeletingDriver(false);
      setShowDriverDeleteModal(false);
      setDriverToDelete(null);
      setIsBulkDriverDelete(false);
    }
  };

  return (
    <div className="flex h-full max-h-[calc(100vh+100px)] flex-col rounded-lg bg-white border border-gray-200" data-tour="logistics-fleet-list">
      {/* Tab Switcher */}
      <div className="flex border-b border-gray-100">
        <button
          type="button"
          onClick={() => setActiveTab('fleets')}
          className={`flex-1 px-4 py-3 text-sm font-semibold transition-colors ${
            activeTab === 'fleets'
              ? 'border-b-2 border-[#0a61d7] text-[#0a61d7]'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          {tList('tabFleets')}
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('drivers')}
          className={`flex-1 px-4 py-3 text-sm font-semibold transition-colors ${
            activeTab === 'drivers'
              ? 'border-b-2 border-[#0a61d7] text-[#0a61d7]'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          {tList('tabDrivers')}
          {drivers.length > 0 && (
            <span className="ml-1.5 rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] font-bold text-gray-600">
              {drivers.length}
            </span>
          )}
        </button>
      </div>

      {/* ===== DRIVERS TAB ===== */}
      {activeTab === 'drivers' && (
        <div className="flex flex-col flex-1 min-h-0">
          {/* Driver toolbar */}
          <div className="flex flex-col gap-3 p-4 border-b border-gray-100">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                value={driverSearchQuery}
                onChange={(e) => setDriverSearchQuery(e.target.value)}
                placeholder={tList('searchDrivers')}
                aria-label={tList('searchDriversAria')}
                className="w-full rounded-lg border border-gray-200 px-9 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-[#0a61d7] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#0a61d7]"
              />
            </div>
            {/* Select All */}
            {filteredDrivers.length > 0 && (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleSelectAllDrivers}
                  className={`w-5 h-5 border-2 rounded transition-all duration-200 flex items-center justify-center ${
                    allFilteredDriversSelected ? 'bg-green-500 border-green-500' : 'bg-white border-gray-300 hover:border-green-400'
                  }`}
                  title={allFilteredDriversSelected ? tShared('deselectAll') : tShared('selectAll')}
                >
                  {allFilteredDriversSelected && (
                    <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  )}
                </button>
                <span className="text-sm text-gray-700">{allFilteredDriversSelected ? tShared('deselectAll') : tShared('selectAll')}</span>
              </div>
            )}
          </div>

          {/* Bulk Action Bar */}
          {selectedDriverIds.length > 0 && (
            <div className="bg-white border border-[#e6e6e6] border-l-4 border-l-green-500 rounded-lg p-3 md:p-4 mx-4 mt-2 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-green-700">
                  {selectedDriverIds.length === 1
                    ? tList('driverSelected', { count: selectedDriverIds.length })
                    : tList('driversSelected', { count: selectedDriverIds.length })}
                </span>
                <div className="flex items-center gap-4">
                  <span className="hidden md:block text-gray-600 text-xs font-semibold">{tList('selectDriversToRemove')}</span>
                  <button
                    onClick={handleBulkDriverRemove}
                    className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white font-semibold text-sm rounded-lg hover:bg-red-700 transition-colors"
                  >
                    <Trash className="w-4 h-4" />
                    {tShared('remove')}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Driver list */}
          <div className="flex-1 overflow-y-auto">
            {drivers.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center gap-2 px-4 py-10 text-center">
                <User className="h-8 w-8 text-gray-300" />
                <p className="text-sm font-medium text-gray-700">{tList('noDriversYet')}</p>
                <p className="text-xs text-gray-500">{tList('noDriversYetHint')}</p>
              </div>
            ) : filteredDrivers.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center gap-2 px-4 py-10 text-center">
                <User className="h-8 w-8 text-gray-300" />
                <p className="text-sm font-medium text-gray-700">{tList('noDriversMatch')}</p>
                <p className="text-xs text-gray-500">{tList('noDriversMatchHint')}</p>
              </div>
            ) : (
              <ul className="flex flex-col gap-2 p-4">
                {filteredDrivers.map((driver) => {
                  const isSelected = selectedDriverIds.includes(driver.id);
                  return (
                    <li key={driver.id}>
                      <div className={`w-full rounded-lg border-2 bg-white p-4 transition-all ${isSelected ? 'border-[#0a61d7]' : 'border-gray-200'}`}>
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-full border-2 border-gray-200 bg-[#0a61d7]/10 text-[#0a61d7]">
                              {driver.avatar ? (
                                <Image src={driver.avatar} alt={driver.name} fill className="object-cover" sizes="40px" unoptimized />
                              ) : (
                                <span className="flex h-full w-full items-center justify-center">
                                  <User className="h-5 w-5" />
                                </span>
                              )}
                            </div>
                            <div className="min-w-0">
                              <p className="truncate text-sm font-bold text-gray-900">{driver.name}</p>
                              <p className="flex items-center gap-1 text-xs text-gray-500">
                                <AtSign className="h-3 w-3" />
                                <span className="truncate">{driver.username}</span>
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            {(driver.fleetCount ?? 0) > 0 && (
                              <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-700">
                                {tList('driverFleetCount', { count: driver.fleetCount ?? 0 })}
                              </span>
                            )}
                            <button
                              type="button"
                              onClick={() => handleDriverDeleteClick(driver)}
                              className="inline-flex items-center justify-center rounded-lg p-1.5 hover:bg-red-100 transition-colors"
                              title={tList('deleteDriver')}
                            >
                              <Trash2 className="h-4 w-4 text-red-500" />
                            </button>
                          </div>
                        </div>

                        <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 border-t border-gray-100 pt-3">
                          {driver.phone && (
                            <div className="flex items-center gap-1.5 text-xs text-gray-600">
                              <Phone className="h-3 w-3 text-gray-400 shrink-0" />
                              <span className="truncate">{driver.phone}</span>
                            </div>
                          )}
                          {driver.experience && (
                            <div className="flex items-center gap-1.5 text-xs text-gray-600">
                              <Briefcase className="h-3 w-3 text-gray-400 shrink-0" />
                              <span className="truncate">{driver.experience}</span>
                            </div>
                          )}
                          {driver.status && (
                            <div className="flex items-center gap-1.5 text-xs text-gray-600 col-span-2">
                              <ShieldCheck className="h-3 w-3 text-gray-400 shrink-0" />
                              <span className="truncate">{driver.status}</span>
                            </div>
                          )}
                        </div>

                        {/* Card footer: checkbox + delete */}
                        <div className="pt-2 -mb-2 -mx-4 border-t border-gray-200 px-4 mt-3 flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => handleDriverCheckbox(driver.id)}
                              className={`w-4 h-4 border-2 rounded transition-all duration-200 flex items-center justify-center ${
                                isSelected ? 'bg-green-500 border-green-500' : 'bg-white border-gray-300 hover:border-green-400'
                              }`}
                              title={isSelected ? tShared('deselect') : tShared('select')}
                            >
                              {isSelected && (
                                <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                </svg>
                              )}
                            </button>
                            <span className="text-xs text-gray-600 font-medium">{isSelected ? tShared('selected') : tShared('select')}</span>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleDriverDeleteClick(driver)}
                            className="inline-flex items-center justify-center rounded-lg p-2 hover:bg-red-100 transition-colors"
                            title={tList('deleteDriver')}
                          >
                            <Trash2 className="w-4 h-4 text-red-600" />
                          </button>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* Driver Delete Modal */}
          {showDriverDeleteModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
              <div className="bg-white rounded-lg border border-[#e6e6e6] p-4 w-full max-w-sm">
                <h2 className="text-lg font-bold mb-2 text-red-500">
                  {isBulkDriverDelete ? tList('deleteDriversTitle') : tList('deleteDriverTitle')}
                </h2>
                <p className="mb-4 text-gray-500">
                  {isBulkDriverDelete
                    ? tList('deleteDriversConfirm', { count: selectedDriverIds.length })
                    : tList('deleteDriverConfirm', { name: driverToDelete?.name ?? '' })}
                </p>
                <div className="flex justify-end gap-2">
                  <button
                    className="px-4 py-2 rounded-lg bg-gray-200 text-gray-700 hover:bg-gray-300 transition-colors"
                    onClick={handleDriverDeleteCancel}
                    disabled={isDeletingDriver}
                  >
                    {tShared('cancel')}
                  </button>
                  <button
                    className="px-4 py-2 rounded-lg bg-red-600 text-white hover:bg-red-700 transition-colors"
                    onClick={handleDriverDeleteConfirm}
                    disabled={isDeletingDriver}
                  >
                    {isDeletingDriver ? tShared('deleting') : tShared('delete')}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ===== FLEETS TAB ===== */}
      {activeTab === 'fleets' && <>
      {/* Toolbar */}
      <div className="flex flex-col gap-3 p-4 border-b border-gray-100">
        <div className="flex items-center justify-between gap-3">
        </div>
        <div className="flex gap-2 items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder={tList('searchShipments')}
              aria-label={tList('searchShipmentsAria')}
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
              {selectedDeliveryStatus ? translateFleetStatus(selectedDeliveryStatus) : tList('allStatuses')}
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
                  {tList('allStatuses')}
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
                    {translateFleetStatus(status)}
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
                {selectedDeliveryType ? translateDeliveryType(selectedDeliveryType) : tList('allTypes')}
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
                    {tList('allTypes')}
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
                      {translateDeliveryType(type)}
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
            title={allFilteredSelected ? tShared('deselectAll') : tShared('selectAll')}
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
            {allFilteredSelected ? tShared('deselectAll') : tShared('selectAll')}
          </span>
        </div>
      </div>

      {/* Bulk Action Bar */}
      {selectedFleets.length > 0 && (
        <div className="bg-white border border-[#e6e6e6] border-l-4 border-l-green-500 rounded-lg p-3 md:p-4 mx-4 mb-2 shadow-sm">
          {/* Mobile Layout */}
          <div className="md:hidden space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-green-700">
                {selectedFleets.length === 1
                  ? tList('fleetSelected', { count: selectedFleets.length })
                  : tList('fleetsSelected', { count: selectedFleets.length })}
              </span>
            </div>
            <div className="text-gray-600 text-xs font-semibold leading-relaxed">{tList('selectFleetsToRemove')}</div>
            <div className="flex gap-2">
              <button
                onClick={handleBulkRemove}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-red-600 text-white font-semibold text-sm rounded-lg hover:bg-red-700 transition-colors"
              >
                <Trash className="w-4 h-4 text-white" />
                {tShared('remove')}
              </button>
            </div>
          </div>

          {/* Desktop Layout */}
          <div className="hidden md:flex items-center justify-between">
            <span className="text-sm font-semibold text-green-700">
              {selectedFleets.length === 1
                ? tList('fleetSelected', { count: selectedFleets.length })
                : tList('fleetsSelected', { count: selectedFleets.length })}
            </span>
            <div className="flex items-center gap-4">
              <span className="text-gray-600 text-xs md:text-sm font-semibold">{tList('selectFleetsToRemoveShort')}</span>
              <div className="flex gap-2">
                <button
                  onClick={handleBulkRemove}
                  className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white font-semibold text-sm rounded-lg hover:bg-red-700 transition-colors"
                >
                  <Trash className="w-4 h-4 text-white" />
                  {tShared('remove')}
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
            <p className="text-sm font-medium text-gray-700">{tList('noFleetsMatch')}</p>
            <p className="text-xs text-gray-500">
              {tList('noFleetsMatchHint')}
            </p>
          </div>
        ) : (
          <>
            <ul className="flex flex-col gap-2 p-4">
              {filteredFleets.map(fleet => {
                const isActive = fleet.id === selectedFleetId;
                const loadPct = fleet.loadPct ?? 0;
                const vehicleInfo = getVehicleTypeInfo(fleet.vehicleType ?? '20ft_container');
                const vehicleType = fleet.vehicleType ?? '20ft_container';
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
                          <p className="mt-0.5 truncate text-xs text-gray-500">
                            {fleet.deliveryType ? translateDeliveryType(fleet.deliveryType) : tList('defaultDelivery')}
                          </p>
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
                            <p className="text-[10px] font-medium text-gray-400">{tList('driverLabel')}</p>
                            <p className="flex items-center gap-1.5 truncate text-xs font-semibold text-gray-900">
                              {fleet.driverName}
                              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" aria-hidden />
                            </p>
                          </div>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <span className="text-right text-[10px] font-medium text-gray-600 truncate max-w-[72px]">
                            {translateVehicleType(vehicleType)}
                          </span>
                          <div className="relative h-10 w-[84px] shrink-0 overflow-hidden">
                            <Image src={vehicleInfo.imagePath} alt={translateVehicleType(vehicleType)} fill className="object-contain object-center" sizes="60px" unoptimized />
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
                            title={isSelected ? tList('deselectFleet') : tList('selectFleet')}
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
                            {isSelected ? tShared('selected') : tShared('select')}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDelete(fleet);
                          }}
                          className="inline-flex items-center justify-center rounded-lg p-2 hover:bg-red-100 transition-colors focus:outline-none"
                          title={tList('deleteFleet')}
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
                    {tList('noMoreFleets')}
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
              {isBulkDelete ? tList('deleteFleetsTitle') : tList('deleteFleetTitle')}
            </h2>
            <p className="mb-4 text-gray-500">
              {isBulkDelete
                ? selectedFleets.length === 1
                  ? tList('deleteFleetsConfirm', { count: selectedFleets.length })
                  : tList('deleteFleetsConfirmPlural', { count: selectedFleets.length })
                : fleetToDelete?.orderCode
                  ? tList('deleteFleetConfirm', { code: fleetToDelete.orderCode })
                  : tList('deleteFleetConfirmThis')}
            </p>
            <div className="flex justify-end gap-2">
              <button
                className="px-4 py-2 rounded-lg bg-gray-200 text-gray-700 hover:bg-gray-300 transition-colors"
                onClick={handleDeleteCancel}
                disabled={isDeleting}
              >
                {tShared('cancel')}
              </button>
              <button
                className="px-4 py-2 rounded-lg bg-red-600 text-white hover:bg-red-700 transition-colors"
                onClick={handleDeleteConfirm}
                disabled={isDeleting}
              >
                {isDeleting ? tShared('deleting') : tShared('delete')}
              </button>
            </div>
          </div>
        </div>
      )}
      </> /* end fleets tab */}
    </div>
  );
}

