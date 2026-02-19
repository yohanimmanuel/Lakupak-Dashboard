'use client';

import React, { useMemo, useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { RefreshCcw, Download, Plus } from 'lucide-react';
import OrderfleetList, {
  type FleetOrderSummary,
  type DeliveryType,
} from '@/components/logisticsmanagement/OrderfleetList';
import FleetDetails from '@/components/logisticsmanagement/FleetDetails';
import { useUserStore } from '@/store/userStore';
import { fetchFleets } from '@/data/logisticsFleetsApi';

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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadFleets = useCallback(async () => {
    const uid = user?.id;
    if (uid == null || typeof uid !== 'number') {
      setFleets([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const result = await fetchFleets(uid);
      setFleets(result?.nodes ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load fleets');
      setFleets([]);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    loadFleets();
  }, [loadFleets]);

  // Derive effective selection: user's choice if still in list, otherwise first fleet (no Effect)
  const effectiveSelectedFleetId = useMemo(() => {
    if (selectedFleetId != null && fleets.some((f) => f.id === selectedFleetId)) return selectedFleetId;
    return fleets[0]?.id;
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
    () => fleets.find((f) => f.id === effectiveSelectedFleetId),
    [fleets, effectiveSelectedFleetId],
  );

  const handleRefresh = () => {
    loadFleets();
  };

  const handleExport = () => {
    // TODO: Implement logistics data export (e.g., XLSX/CSV)
  };

  const handleAddFleet = () => {
    router.push('/logistics/create');
  };

  const handleOpenTracking = () => {
    if (effectiveSelectedFleetId) router.push(`/logistics/details?id=${effectiveSelectedFleetId}`);
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

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
          {error}
        </div>
      )}

      {/* Main content: list + details/tracking */}
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        {loading ? (
          <div className="flex items-center justify-center py-12 text-gray-500">
            Loading fleets...
          </div>
        ) : (
          <OrderfleetList
            fleets={fleets}
            selectedFleetId={effectiveSelectedFleetId}
            onSelectFleet={setSelectedFleetId}
            availableDeliveryTypes={availableDeliveryTypes}
          />
        )}
        <FleetDetails fleet={selectedFleet} onOpenTracking={handleOpenTracking} />
      </div>
    </div>
  );
}

