'use client';

import React, { useMemo, useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { RefreshCcw, Download, Plus } from 'lucide-react';
import OrderfleetList, {
  type FleetOrderSummary,
  type DeliveryType,
} from '@/components/logisticsmanagement/OrderfleetList';
import FleetDetails from '@/components/logisticsmanagement/FleetDetails';
import { useUserStore } from '@/store/userStore';
import { getFleets } from '@/data/logisticsFleetsStorage';

const VALID_DELIVERY_TYPES: DeliveryType[] = [
  'Standard Shipping',
  'Express Shipping',
  'Same-day Delivery',
  'Next-day Delivery',
  'Scheduled Delivery',
  'Pickup Available',
];

export default function LogisticsPage() {
  const router = useRouter();
  const { user } = useUserStore();
  const [fleets, setFleets] = useState<FleetOrderSummary[]>([]);
  const [selectedFleetId, setSelectedFleetId] = useState<string | undefined>();

  useEffect(() => {
    setFleets(getFleets());
  }, []);

  useEffect(() => {
    if (fleets.length > 0 && !selectedFleetId) {
      setSelectedFleetId(fleets[0]?.id);
    }
  }, [fleets, selectedFleetId]);

  const availableDeliveryTypes = useMemo((): DeliveryType[] => {
    const raw = user?.company?.shippingPreferences;
    let result: DeliveryType[] = [];
    if (raw != null && raw !== '') {
      try {
        const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
        const arr = Array.isArray(parsed) ? parsed : [];
        result = arr.filter((t: string): t is DeliveryType => VALID_DELIVERY_TYPES.includes(t as DeliveryType));
      } catch {
        result = [];
      }
    }
    // Every distributor has Standard Shipping; always include it.
    if (!result.includes('Standard Shipping')) {
      result = ['Standard Shipping', ...result];
    }
    return result;
  }, [user?.company?.shippingPreferences]);

  const selectedFleet = useMemo(
    () => fleets.find(f => f.id === selectedFleetId),
    [fleets, selectedFleetId],
  );

  const handleRefresh = () => {
    setFleets(getFleets());
  };

  const handleExport = () => {
    // TODO: Implement logistics data export (e.g., XLSX/CSV)
  };

  const handleAddFleet = () => {
    router.push('/logistics/create');
  };

  const handleOpenTracking = () => {
    if (selectedFleetId) router.push(`/logistics/details?id=${selectedFleetId}`);
  };

  return (
    <div className="w-full mx-auto p-4 bg-gradient-to-b from-gray-50 to-white min-h-screen">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-2">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Logistics Management</h1>
          <p className="text-sm text-gray-500 mb-4">
            Monitor and manage your fleet, deliveries, and logistics performance across your
            distribution network.
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-3">
          {/* Refresh Button */}
          <button
            onClick={handleRefresh}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-[#e6e6e6] text-black rounded-lg hover:bg-gray-50 transition-colors text-sm font-medium"
          >
            <RefreshCcw className="w-4 h-4" />
            Refresh
          </button>

          {/* Export Button */}
          <button
            onClick={handleExport}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-[#e6e6e6] text-black rounded-lg hover:bg-gray-50 transition-colors text-sm font-medium"
          >
            <Download className="w-4 h-4" />
            Export Data
          </button>

          {/* Add Fleet / Truck Button */}
          <button
            onClick={handleAddFleet}
            className="flex items-center gap-2 px-6 py-2 bg-[#0a61d7] text-white rounded-lg hover:bg-[#0851b8] transition-colors text-sm font-semibold"
          >
            <Plus className="w-4 h-4" />
            Add Fleet / Truck
          </button>
        </div>
      </div>

      {/* Main content: list + details/tracking */}
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <OrderfleetList
          fleets={fleets}
          selectedFleetId={selectedFleetId}
          onSelectFleet={setSelectedFleetId}
          availableDeliveryTypes={availableDeliveryTypes}
        />
        <FleetDetails fleet={selectedFleet} onOpenTracking={handleOpenTracking} />
      </div>
    </div>
  );
}

