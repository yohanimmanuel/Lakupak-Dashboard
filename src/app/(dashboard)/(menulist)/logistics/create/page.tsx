'use client';

import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Package, Truck, User, ShoppingCart, CheckCircle, AlertCircle } from 'lucide-react';
import FleetBasicInfo from '@/components/logisticsmanagement/FleetBasicInfo';
import FleetVehicleInfo from '@/components/logisticsmanagement/FleetVehicleInfo';
import FleetDriverInfo from '@/components/logisticsmanagement/FleetDriverInfo';
import FleetOrderSelection, { type AssignedOrder } from '@/components/logisticsmanagement/FleetOrderSelection';
import FleetTripSummaryModal, { type FleetTripSummaryData } from '@/components/logisticsmanagement/FleetTripSummaryModal';
import type { FleetOrderSummary, DriverSummary } from '@/components/logisticsmanagement/OrderfleetList';
import { createFleet, fetchDrivers } from '@/data/logisticsFleetsApi';
import { useUserStore } from '@/store/userStore';

type TabId = 'basic' | 'vehicle' | 'driver' | 'orders';

interface Tab {
  id: TabId;
  label: string;
  icon: React.ReactNode;
  description: string;
}

function generateFleetCode(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 10; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

export interface FleetFormData {
  orderCode?: string;
  routeFrom?: string;
  routeTo?: string;
  route?: string;
  status?: FleetOrderSummary['status'];
  deliveryType?: FleetOrderSummary['deliveryType'];
  etaDate?: string | null;
  etaTime?: string | null;
  assignedDate?: string | null;
  paymentTerms?: string;
  assignedLogistics?: string;
  vehicleType?: string;
  vehicleBrand?: string;
  vehicleModel?: string;
  plateNumber?: string;
  vehicleMaxWeight?: number;
  vehicleMaxVolume?: number;
  loadPct?: number;
  /** ID of an existing Driver record (takes precedence over inline driver fields) */
  driverId?: string;
  /** True when the user has confirmed inline edits to an existing driver */
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

export default function CreateFleetPage() {
  const router = useRouter();
  const { user } = useUserStore();
  const [activeTab, setActiveTab] = useState<TabId>('basic');
  const [isCreating, setIsCreating] = useState(false);
  const [showSummaryModal, setShowSummaryModal] = useState(false);
  const [drivers, setDrivers] = useState<DriverSummary[]>([]);

  useEffect(() => {
    if (user?.id == null) return;
    fetchDrivers(user.id).then(setDrivers).catch(() => setDrivers([]));
  }, [user?.id]);

  const fleetCode = useMemo(() => generateFleetCode(), []);

  const [formData, setFormData] = useState<FleetFormData>({
    status: 'Available',
    deliveryType: 'Standard Shipping',
    vehicleType: '20ft_container',
    loadPct: 0,
    assignedOrders: [],
  });

  const [tabCompletion, setTabCompletion] = useState({
    basic: false,
    vehicle: false,
    driver: false,
    orders: true,
  });

  const tabs: Tab[] = [
    { id: 'basic', label: 'Basic Info', icon: <Package className="w-5 h-5" />, description: 'Route, status, ETA' },
    { id: 'vehicle', label: 'Vehicle', icon: <Truck className="w-5 h-5" />, description: 'Truck type and load' },
    { id: 'driver', label: 'Driver', icon: <User className="w-5 h-5" />, description: 'Assigned driver' },
    { id: 'orders', label: 'Order Selection', icon: <ShoppingCart className="w-5 h-5" />, description: 'Assign orders' },
  ];

  const handleFormChange = useCallback((updates: Partial<FleetFormData>) => {
    setFormData((prev) => ({ ...prev, ...updates }));
  }, []);

  const handleTabCompletion = useCallback((tabId: TabId, isComplete: boolean) => {
    setTabCompletion((prev) => (prev[tabId] === isComplete ? prev : { ...prev, [tabId]: isComplete }));
  }, []);

  const validateForm = (): boolean => {
    const driverOk = Boolean(
      formData.driverId ||
      (formData.driverName?.trim() &&
        formData.driverPhone?.trim() &&
        formData.driverExperience?.trim() &&
        formData.driverStatus?.trim() &&
        formData.driverUsername?.trim() &&
        formData.driverPassword?.trim())
    );
    return Boolean(
      tabCompletion.basic &&
        tabCompletion.vehicle &&
        tabCompletion.driver &&
        driverOk &&
        formData.routeFrom?.trim() &&
        formData.routeTo?.trim() &&
        formData.etaDate?.trim() &&
        formData.etaTime?.trim() &&
        formData.paymentTerms?.trim() &&
        formData.vehicleBrand?.trim() &&
        formData.vehicleModel?.trim() &&
        formData.vehicleMaxWeight != null &&
        formData.vehicleMaxWeight >= 0 &&
        formData.vehicleMaxVolume != null &&
        formData.vehicleMaxVolume >= 0 &&
        formData.loadPct != null &&
        formData.loadPct >= 0 &&
        formData.loadPct <= 100
    );
  };

  const isReadyToCreate = validateForm();
  const canOpenSummary = isReadyToCreate && user?.id != null;

  const performCreate = async () => {
    if (user?.id == null) {
      setShowSummaryModal(false);
      alert('Please sign in to create a fleet.');
      return;
    }
    const route = `${formData.routeFrom} → ${formData.routeTo}`;

    // Read staged password — cleared only on success
    const driverPassword = formData.driverPassword;

    // Build driver portion of input
    let driverPart: Record<string, unknown>;
    if (formData.driverId) {
      driverPart = { driverId: formData.driverId };
      // When the user confirmed inline edits to an existing driver, include those changes
      if (formData.driverEdited) {
        const driverUpdate: Record<string, unknown> = {};
        if (formData.driverName !== undefined)       driverUpdate.name       = formData.driverName;
        if (formData.driverPhone !== undefined)      driverUpdate.phone      = formData.driverPhone;
        if (formData.driverExperience !== undefined) driverUpdate.experience = formData.driverExperience;
        if (formData.driverStatus !== undefined)     driverUpdate.status     = formData.driverStatus;
        if (formData.driverAvatar !== undefined)     driverUpdate.avatar     = formData.driverAvatar;
        if (formData.driverUsername !== undefined)   driverUpdate.username   = formData.driverUsername;
        if (driverPassword)                          driverUpdate.password   = driverPassword;
        if (Object.keys(driverUpdate).length > 0)   driverPart.driverInput  = driverUpdate;
      }
    } else {
      driverPart = {
        driverInput: {
          name: formData.driverName ?? '',
          phone: formData.driverPhone ?? '',
          experience: formData.driverExperience ?? '',
          status: formData.driverStatus ?? '',
          avatar: formData.driverAvatar ?? '',
          username: formData.driverUsername ?? '',
          password: driverPassword ?? '',
        },
      };
    }

    const input = {
      fleetCode,
      route,
      routeFrom: formData.routeFrom,
      routeTo: formData.routeTo,
      status: formData.status ?? 'In Transit',
      deliveryType: formData.deliveryType,
      etaCompletionDate: formData.etaDate?.trim() || undefined,
      etaCompletionTime: formData.etaTime?.trim() || undefined,
      assignedDate: formData.assignedDate?.trim() || undefined,
      lastUpdate: 'Just now',
      ...driverPart,
      totalOrders: formData.assignedOrders?.length ?? 0,
      deliveriesCompleted: formData.completedOrderIds?.length ?? 0,
      completedOrderIds: formData.completedOrderIds ?? [],
      vehicleType: formData.vehicleType ?? '20ft_container',
      loadPct: formData.loadPct ?? 0,
      paymentTerms: formData.paymentTerms,
      assignedLogistics: formData.assignedLogistics || undefined,
      vehicleBrand: formData.vehicleBrand,
      vehicleModel: formData.vehicleModel,
      plateNumber: formData.plateNumber?.trim() || undefined,
      vehicleMaxWeight: formData.vehicleMaxWeight,
      vehicleMaxVolume: formData.vehicleMaxVolume,
      assignedOrderIds: formData.assignedOrders?.map((o) => o.orderId),
      customers: formData.assignedOrders?.map((o) => ({ storeName: o.storeName ?? '', contactName: '' })),
    };
    const created = await createFleet(user.id, input);
    if (created == null || created.id == null || created.id === '') {
      console.error('createFleet did not return a valid fleet with id', { created, createFleet: createFleet.name });
      alert('Failed to create fleet: no fleet ID returned. Please try again.');
      return;
    }
    // Clear the staged password only after the fleet is successfully created
    if (driverPassword) {
      setFormData((prev) => ({ ...prev, driverPassword: undefined }));
    }
    router.push(`/logistics/details?id=${created.id}`);
  };

  const handleOpenSummary = () => {
    if (user?.id == null) {
      alert('Please sign in to create a fleet.');
      return;
    }
    if (!isReadyToCreate) {
      alert('Please complete all required fields before creating.');
      return;
    }
    setShowSummaryModal(true);
  };

  const handleModalSubmit = async () => {
    setIsCreating(true);
    try {
      await performCreate();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to create fleet.';
      if (message.includes('already assigned to another fleet')) {
        alert(message + ' Remove them from the selection or assign them in the other fleet first.');
      } else {
        alert(message || 'Failed to create fleet. Please try again.');
      }
    } finally {
      setIsCreating(false);
    }
  };

  const handleCancel = () => router.push('/logistics');

  const summaryData: FleetTripSummaryData = {
    orderCode: fleetCode,
    routeFrom: formData.routeFrom,
    routeTo: formData.routeTo,
    route: `${formData.routeFrom ?? ''} → ${formData.routeTo ?? ''}`,
    status: formData.status,
    deliveryType: formData.deliveryType,
    etaCompletionDate: formData.etaDate ?? undefined,
    etaCompletionTime: formData.etaTime ?? undefined,
    etaDate: formData.etaDate,
    etaTime: formData.etaTime,
    assignedDate: formData.assignedDate ?? undefined,
    paymentTerms: formData.paymentTerms,
    assignedLogistics: formData.assignedLogistics || undefined,
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
    assignedOrders: formData.assignedOrders,
    completedOrderIds: formData.completedOrderIds ?? [],
  };

  const renderActiveComponent = () => {
    const commonBasic = {
      formData,
      onFormChange: handleFormChange,
      onTabCompletion: handleTabCompletion,
      mode: 'create' as const,
      fleetCode,
    };
    const common = { formData, onFormChange: handleFormChange, onTabCompletion: handleTabCompletion, mode: 'create' as const };
    switch (activeTab) {
      case 'basic':
        return <FleetBasicInfo {...commonBasic} />;
      case 'vehicle':
        return <FleetVehicleInfo {...common} />;
      case 'driver':
        return <FleetDriverInfo {...common} drivers={drivers} />;
      case 'orders':
        return (
          <FleetOrderSelection
            selectedOrders={formData.assignedOrders ?? []}
            onFormChange={handleFormChange}
            onTabCompletion={handleTabCompletion}
            mode="create"
          />
        );
      default:
        return <FleetBasicInfo {...commonBasic} />;
    }
  };

  return (
    <div className="p-4 space-y-4 bg-gradient-to-b from-gray-50 to-white min-h-screen">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={handleCancel}
            className="flex items-center gap-2 px-3 py-2 text-gray-600 hover:text-black hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Fleet List
          </button>
          <div>
            <h1 className="text-2xl font-bold text-black">Add Fleet / Truck</h1>
            <p className="text-gray-500 text-sm">Create a new fleet or truck entry</p>
            <div className="flex items-center gap-4 mt-2">
              {tabs.map((t) => (
                <div key={t.id} className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${tabCompletion[t.id] ? 'bg-green-500' : 'bg-gray-300'}`} />
                  <span className="text-xs text-gray-600">{t.label}</span>
                </div>
              ))}
              {!isReadyToCreate && (
                <div className="flex items-center gap-1 text-amber-600">
                  <AlertCircle className="w-3 h-3" />
                  <span className="text-xs">Complete required fields</span>
                </div>
              )}
            </div>
          </div>
        </div>
        <button
          onClick={handleOpenSummary}
          disabled={!canOpenSummary}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg font-semibold transition text-sm ${
            canOpenSummary ? 'bg-[#0a61d7] text-white hover:bg-[#084ba6]' : 'bg-gray-300 text-gray-500 cursor-not-allowed'
          }`}
        >
          <CheckCircle className="w-4 h-4" />
          Create Fleet
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
        data={summaryData}
        mode="create"
        isSubmitting={isCreating}
        onSubmit={handleModalSubmit}
        onCompletedOrderIdsChange={(ids) => handleFormChange({ completedOrderIds: ids })}
      />
    </div>
  );
}
