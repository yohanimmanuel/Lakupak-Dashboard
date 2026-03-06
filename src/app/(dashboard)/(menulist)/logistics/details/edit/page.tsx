'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, Package, Truck, User, ShoppingCart, CheckCircle } from 'lucide-react';
import FleetBasicInfo from '@/components/logisticsmanagement/FleetBasicInfo';
import FleetVehicleInfo from '@/components/logisticsmanagement/FleetVehicleInfo';
import FleetDriverInfo from '@/components/logisticsmanagement/FleetDriverInfo';
import FleetOrderSelection, { type AssignedOrder } from '@/components/logisticsmanagement/FleetOrderSelection';
import FleetTripSummaryModal, { type FleetTripSummaryData } from '@/components/logisticsmanagement/FleetTripSummaryModal';
import type { FleetOrderSummary, DriverSummary } from '@/components/logisticsmanagement/OrderfleetList';
import { fetchFleet, updateFleet, fetchDrivers } from '@/data/logisticsFleetsApi';
import { useUserStore } from '@/store/userStore';

type TabId = 'basic' | 'vehicle' | 'driver' | 'orders';

interface Tab {
  id: TabId;
  label: string;
  icon: React.ReactNode;
  description: string;
}

export interface FleetFormData {
  orderCode?: string;
  routeFrom?: string;
  routeTo?: string;
  route?: string;
  status?: FleetOrderSummary['status'];
  deliveryType?: FleetOrderSummary['deliveryType'];
  etaDate?: string;
  etaTime?: string;
  paymentTerms?: string;
  assignedLogistics?: string;
  vehicleType?: string;
  vehicleBrand?: string;
  vehicleModel?: string;
  plateNumber?: string;
  vehicleMaxWeight?: number;
  vehicleMaxVolume?: number;
  loadPct?: number;
  /** ID of an existing Driver record */
  driverId?: string;
  /** True when the user has edited driver fields inline and confirmed the edits */
  driverEdited?: boolean;
  driverName?: string;
  driverPhone?: string;
  driverExperience?: string;
  driverStatus?: string;
  driverAvatar?: string;
  driverUsername?: string;
  driverPassword?: string;
  assignedOrders?: AssignedOrder[];
  completedOrderIds?: string[];
}

function parseRoute(route: string): { from: string; to: string } {
  const arrow = route.includes('→') ? '→' : route.includes('-') ? '-' : '–';
  const parts = route.split(arrow).map((s) => s.trim());
  return { from: parts[0] ?? '', to: parts[1] ?? '' };
}

/** Format ISO/date string to YYYY-MM-DD for date input. */
function toDateInputValue(d: string | null | undefined): string {
  if (!d) return '';
  try {
    const date = new Date(d);
    if (isNaN(date.getTime())) return '';
    return date.toISOString().slice(0, 10);
  } catch {
    return '';
  }
}

export default function EditFleetPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useUserStore();
  const fleetId = searchParams?.get('id') ?? null;

  const [activeTab, setActiveTab] = useState<TabId>('basic');
  const [isSaving, setIsSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showSummaryModal, setShowSummaryModal] = useState(false);
  const [drivers, setDrivers] = useState<DriverSummary[]>([]);

  useEffect(() => {
    if (user?.id == null) return;
    fetchDrivers(user.id).then(setDrivers).catch((err) => {
      console.error('Failed to fetch drivers:', err);
      setDrivers([]);
    });
  }, [user?.id]);

  const [formData, setFormData] = useState<FleetFormData>({
    status: 'In Transit',
    deliveryType: 'Standard Shipping',
    vehicleType: '20ft_container',
    loadPct: 0,
    assignedOrders: [],
  });

  const tabs: Tab[] = [
    { id: 'basic', label: 'Basic Info', icon: <Package className="w-5 h-5" />, description: 'Route, status, ETA' },
    { id: 'vehicle', label: 'Vehicle', icon: <Truck className="w-5 h-5" />, description: 'Truck type and load' },
    { id: 'driver', label: 'Driver', icon: <User className="w-5 h-5" />, description: 'Assigned driver' },
    { id: 'orders', label: 'Order Selection', icon: <ShoppingCart className="w-5 h-5" />, description: 'Assign orders' },
  ];

  useEffect(() => {
    if (!fleetId || user?.id == null) {
      if (!fleetId) router.push('/logistics');
      setLoading(false);
      return;
    }
    let cancelled = false;
    fetchFleet(user.id, fleetId)
      .then((fleet) => {
        if (cancelled) return;
        if (!fleet) {
          alert('Fleet not found');
          router.push('/logistics');
          return;
        }
        const { from, to } = parseRoute(fleet.route);
        setFormData({
          orderCode: fleet.orderCode,
          routeFrom: from,
          routeTo: to,
          route: fleet.route,
          status: fleet.status,
          deliveryType: fleet.deliveryType ?? 'Standard Shipping',
          etaDate: toDateInputValue(fleet.etaCompletionDate) || undefined,
          etaTime: fleet.etaCompletionTime?.trim() || undefined,
          paymentTerms: fleet.paymentTerms ?? 'En route',
          assignedLogistics: fleet.assignedLogistics ?? undefined,
          vehicleType: fleet.vehicleType ?? '20ft_container',
          vehicleBrand: fleet.vehicleBrand,
          vehicleModel: fleet.vehicleModel,
          plateNumber: fleet.plateNumber ?? undefined,
          vehicleMaxWeight: typeof fleet.vehicleMaxWeight === 'number' ? fleet.vehicleMaxWeight : (typeof fleet.vehicleMaxWeight === 'string' ? parseFloat(String(fleet.vehicleMaxWeight).replace(/[^0-9.-]/g, '')) || undefined : undefined),
          vehicleMaxVolume: typeof fleet.vehicleMaxVolume === 'number' ? fleet.vehicleMaxVolume : (typeof fleet.vehicleMaxVolume === 'string' ? parseFloat(String(fleet.vehicleMaxVolume).replace(/[^0-9.-]/g, '')) || undefined : undefined),
          loadPct: fleet.loadPct ?? 0,
          driverId: fleet.driver?.id ?? fleet.driverId ?? undefined,
          driverName: fleet.driverName,
          driverPhone: fleet.driverPhone,
          driverExperience: fleet.driverExperience,
          driverStatus: fleet.driverStatus,
          driverAvatar: fleet.driverAvatar,
          driverUsername: fleet.driverUsername,
          completedOrderIds: fleet.completedOrderIds ?? [],
          assignedOrders: (() => {
            const orderIds = fleet.assignedOrderIds ?? [];
            const customers = fleet.customers ?? [];
            return orderIds.map((orderId, i) => {
              const customer = customers[i];
              return {
                orderId: orderId ?? `ORD-${i + 1}`,
                storeName: customer?.storeName ?? '',
                totalAmount: 0,
                orderStatus: '',
              };
            });
          })(),
        });
      })
      .catch(() => {
        if (!cancelled) {
          alert('Failed to load fleet');
          router.push('/logistics');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [fleetId, user?.id, router]);

  const handleFormChange = useCallback((updates: Partial<FleetFormData>) => {
    setFormData((prev) => ({ ...prev, ...updates }));
  }, []);

  const handleTabCompletion = useCallback((_tabId: TabId, _isComplete: boolean) => {}, []);

  const performSave = async () => {
    if (!fleetId || user?.id == null) return;
    const route = `${formData.routeFrom} → ${formData.routeTo}`;

    // Read the staged password (cleared only after a successful save)
    const driverPassword = formData.driverPassword;

    // Build driver portion: reassign via driverId OR update driver fields in-place
    const driverPart: Record<string, unknown> = {};
    if (formData.driverId) {
      driverPart.driverId = formData.driverId;
      const driverUpdate: Record<string, unknown> = {};
      // When the user confirmed inline edits, include all editable driver fields
      if (formData.driverEdited) {
        if (formData.driverName !== undefined)       driverUpdate.name       = formData.driverName;
        if (formData.driverPhone !== undefined)      driverUpdate.phone      = formData.driverPhone;
        if (formData.driverExperience !== undefined) driverUpdate.experience = formData.driverExperience;
        if (formData.driverStatus !== undefined)     driverUpdate.status     = formData.driverStatus;
        if (formData.driverAvatar !== undefined)     driverUpdate.avatar     = formData.driverAvatar;
        if (formData.driverUsername !== undefined)   driverUpdate.username   = formData.driverUsername;
      }
      // Staged password change from the Change Password modal
      if (driverPassword) driverUpdate.password = driverPassword;
      if (Object.keys(driverUpdate).length > 0) driverPart.driverInput = driverUpdate;
    }

    const input = {
      route,
      status: formData.status,
      deliveryType: formData.deliveryType,
      etaCompletionDate: formData.etaDate?.trim() || undefined,
      etaCompletionTime: formData.etaTime?.trim() || undefined,
      lastUpdate: 'Just now',
      ...driverPart,
      totalOrders: formData.assignedOrders?.length ?? 0,
      deliveriesCompleted: formData.completedOrderIds?.length ?? 0,
      vehicleType: formData.vehicleType,
      loadPct: formData.loadPct,
      paymentTerms: formData.paymentTerms,
      assignedLogistics: formData.assignedLogistics ?? undefined,
      vehicleBrand: formData.vehicleBrand,
      vehicleModel: formData.vehicleModel,
      plateNumber: formData.plateNumber?.trim() || undefined,
      vehicleMaxWeight: formData.vehicleMaxWeight,
      vehicleMaxVolume: formData.vehicleMaxVolume,
      completedOrderIds: formData.completedOrderIds ?? [],
      assignedOrderIds: formData.assignedOrders?.map((o) => o.orderId),
      customers: formData.assignedOrders?.map((o) => ({ storeName: o.storeName ?? '', contactName: '' })),
    };
    await updateFleet(user.id, fleetId, input);
    // Only clear the staged password once the update succeeds
    if (driverPassword) {
      setFormData((prev) => ({ ...prev, driverPassword: undefined }));
    }
    router.push(`/logistics/details?id=${fleetId}`);
  };

  const handleOpenSummary = () => {
    if (!fleetId) return;
    setShowSummaryModal(true);
  };

  const handleModalSubmit = async () => {
    setIsSaving(true);
    try {
      await performSave();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to update fleet.';
      if (message.includes('already assigned to another fleet')) {
        alert(message + ' Remove them from the selection or assign them in the other fleet first.');
      } else {
        alert(message || 'Failed to update fleet. Please try again.');
      }
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    if (fleetId) router.push(`/logistics/details?id=${fleetId}`);
    else router.push('/logistics');
  };

  const summaryData = useMemo(
    (): FleetTripSummaryData => ({
      orderCode: formData.orderCode ?? '',
      routeFrom: formData.routeFrom,
      routeTo: formData.routeTo,
      route: `${formData.routeFrom ?? ''} → ${formData.routeTo ?? ''}`,
      status: formData.status,
      deliveryType: formData.deliveryType,
      etaCompletionDate: formData.etaDate ? new Date(formData.etaDate).toISOString().slice(0, 10) : undefined,
      etaCompletionTime: formData.etaTime ?? undefined,
      etaDate: formData.etaDate,
      etaTime: formData.etaTime,
      paymentTerms: formData.paymentTerms,
      assignedLogistics: formData.assignedLogistics ?? undefined,
      vehicleType: formData.vehicleType,
      vehicleBrand: formData.vehicleBrand,
      vehicleModel: formData.vehicleModel,
      plateNumber: formData.plateNumber,
      vehicleMaxWeight: formData.vehicleMaxWeight,
      vehicleMaxVolume: formData.vehicleMaxVolume,
      loadPct: formData.loadPct,
      driverName: formData.driverName,
      driverPhone: formData.driverPhone,
      driverExperience: formData.driverExperience,
      driverStatus: formData.driverStatus,
      driverAvatar: formData.driverAvatar,
      driverUsername: formData.driverUsername,
      driverPasswordSet: !!formData.driverPassword,
      completedOrderIds: formData.completedOrderIds ?? [],
      assignedOrders: formData.assignedOrders,
    }),
    [formData]
  );

  const renderActiveComponent = () => {
    const commonBasic = {
      formData,
      onFormChange: handleFormChange,
      onTabCompletion: handleTabCompletion,
      mode: 'edit' as const,
      fleetCode: formData.orderCode,
    };
    const common = { formData, onFormChange: handleFormChange, onTabCompletion: handleTabCompletion, mode: 'edit' as const };
    switch (activeTab) {
      case 'basic':
        return <FleetBasicInfo {...commonBasic} />;
      case 'vehicle':
        return <FleetVehicleInfo {...common} />;
      case 'driver':
        return <FleetDriverInfo {...common} fleetId={fleetId} drivers={drivers} />;
      case 'orders':
        return (
          <FleetOrderSelection
            selectedOrders={formData.assignedOrders ?? []}
            onFormChange={handleFormChange}
            onTabCompletion={handleTabCompletion}
            mode="edit"
            currentFleetId={fleetId}
          />
        );
      default:
        return <FleetBasicInfo {...commonBasic} />;
    }
  };

  if (loading) {
    return (
      <div className="w-full mx-auto p-4 bg-gray-50 min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-[#0a61d7] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-600">Loading fleet data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4 bg-gradient-to-b from-gray-50 to-white min-h-screen">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={handleCancel}
            className="flex items-center gap-2 px-3 py-2 text-gray-600 hover:text-black hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Details
          </button>
          <div>
            <h1 className="text-2xl font-bold text-black">Edit Fleet / Truck</h1>
            <p className="text-gray-500 text-sm">Update fleet information</p>
          </div>
        </div>
        <button
          onClick={handleOpenSummary}
          className="flex items-center gap-2 px-4 py-2 rounded-lg font-semibold text-sm bg-[#0a61d7] text-white hover:bg-[#084ba6] transition-colors"
        >
          <CheckCircle className="w-4 h-4" />
          Save Changes
        </button>
      </div>

      <div className="bg-white rounded-lg border border-[#e6e6e6] p-1">
        <div className="flex flex-col lg:flex-row gap-1">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-3 px-4 py-3 rounded-md text-sm font-medium transition-colors flex-1 justify-center ${
                activeTab === tab.id ? 'bg-[#0a61d7] text-white' : 'text-gray-600 hover:text-black hover:bg-gray-100'
              }`}
            >
              {tab.icon}
              <div className="text-left">
                <div>{tab.label}</div>
                <div className={`text-xs ${activeTab === tab.id ? 'text-white/80' : 'text-gray-400'}`}>{tab.description}</div>
              </div>
            </button>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-lg border border-[#e6e6e6] p-4">{renderActiveComponent()}</div>

      <FleetTripSummaryModal
        isOpen={showSummaryModal}
        onClose={() => setShowSummaryModal(false)}
        data={{ ...summaryData, orderCode: summaryData.orderCode ?? '' }}
        mode="edit"
        isSubmitting={isSaving}
        onSubmit={handleModalSubmit}
        onCompletedOrderIdsChange={(ids) => handleFormChange({ completedOrderIds: ids })}
      />
    </div>
  );
}
