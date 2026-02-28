'use client';

import React, { useMemo, useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { RefreshCcw, Download, Plus, Check } from 'lucide-react';
import * as XLSX from 'xlsx';
import OrderfleetList, {
  type FleetOrderSummary,
  type DeliveryType,
  type DriverSummary,
} from '@/components/logisticsmanagement/OrderfleetList';
import FleetDetails from '@/components/logisticsmanagement/FleetDetails';
import { useUserStore } from '@/store/userStore';
import { fetchFleets, fetchDrivers } from '@/data/logisticsFleetsApi';

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
  const [drivers, setDrivers] = useState<DriverSummary[]>([]);
  const [selectedFleetId, setSelectedFleetId] = useState<string | undefined>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showOverlay, setShowOverlay] = useState(false);
  const [overlayMessage, setOverlayMessage] = useState('');
  const [isSlidingIn, setIsSlidingIn] = useState(false);
  const [isSlidingOut, setIsSlidingOut] = useState(false);
  const overlayTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const loadFleets = useCallback(async () => {
    const uid = user?.id;
    if (uid == null || typeof uid !== 'number') {
      setFleets([]);
      setLoading(false);
      return;
    }
    
    setLoading(true);
    setError(null);
    
    // Clear any existing timeouts
    if (overlayTimeoutRef.current) {
      clearTimeout(overlayTimeoutRef.current);
    }
    
    // For refresh button, start slide-in animation
    if (fleets.length > 0) {
      setIsSlidingOut(false);
      setIsSlidingIn(true);
      setOverlayMessage('Refreshing fleet data');
    } else {
      setIsSlidingIn(true);
      setOverlayMessage('Loading fleet data...');
    }
    
    try {
      const [result, driverList] = await Promise.all([fetchFleets(uid), fetchDrivers(uid)]);
      setFleets(result?.nodes ?? []);
      setDrivers(driverList ?? []);
      setOverlayMessage(`Showing fleet data (${result?.nodes?.length ?? 0} fleets loaded)`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load fleets');
      setFleets([]);
      setOverlayMessage('Error loading fleets');
    } finally {
      setLoading(false);
      
      // Complete slide-in animation and show overlay
      setTimeout(() => {
        setIsSlidingIn(false);
        setShowOverlay(true);
      }, 1500);
      
      // Auto-hide overlay after 2.5 seconds
      overlayTimeoutRef.current = setTimeout(() => {
        // Start slide-out animation
        setIsSlidingOut(true);
        setShowOverlay(false);
        
        // Remove overlay completely after animation
        setTimeout(() => {
          setIsSlidingOut(false);
        }, 500);
      }, 2500);
    }
  }, [user?.id, fleets.length]);

  useEffect(() => {
    // Start slide-in animation immediately for initial page load
    setIsSlidingIn(true);
    setOverlayMessage('Loading fleet data...');
    
    loadFleets();
    
    // Cleanup timeout on unmount
    return () => {
      if (overlayTimeoutRef.current) {
        clearTimeout(overlayTimeoutRef.current);
      }
    };
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
    setRefreshKey(prev => prev + 1);
    loadFleets();
  };

  const handleExport = () => {
    try {
      if (fleets.length === 0) {
        alert('No fleet data to export.');
        return;
      }
      const rows = fleets.map((f) => ({
        'Fleet ID': f.id,
        'Fleet Code': f.orderCode ?? '',
        Route: f.route ?? '',
        Status: f.status ?? '',
        'Delivery Type': f.deliveryType ?? '',
        ETA: f.eta ?? '',
        'Last Update': f.lastUpdate ?? '',
        Driver: f.driverName ?? '',
        'Driver Phone': f.driverPhone ?? '',
        'Vehicle Type': f.vehicleType ?? '',
        'Vehicle Brand': f.vehicleBrand ?? '',
        'Vehicle Model': f.vehicleModel ?? '',
        'Load %': f.loadPct ?? '',
        'Total Orders': f.totalOrders ?? '',
        'Deliveries Completed': f.deliveriesCompleted ?? '',
        'Payment Terms': f.paymentTerms ?? '',
        Customers: Array.isArray(f.customers)
          ? f.customers.map((c) => c.storeName || c.contactName).filter(Boolean).join('; ')
          : '',
      }));
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(rows);
      XLSX.utils.book_append_sheet(wb, ws, 'Fleets');
      const filename = `logistics_fleets_export_${new Date().toISOString().split('T')[0]}.xlsx`;
      XLSX.writeFile(wb, filename);
    } catch {
      alert('Failed to export data. Please try again.');
    }
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

          {/* Add Fleet & Driver Button */}
          <button
            onClick={handleAddFleet}
            className="flex items-center gap-2 px-6 py-2 bg-[#0a61d7] text-white rounded-lg hover:bg-[#0851b8] transition-colors text-sm font-semibold"
          >
            <Plus className="w-4 h-4" />
            Add Fleet & Driver
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
            <div className="text-center">
              <div className="w-8 h-8 border-4 border-[#0a61d7] border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
              <p className="text-gray-600">Loading fleets...</p>
            </div>
          </div>
        ) : (
          <OrderfleetList
            fleets={fleets}
            selectedFleetId={effectiveSelectedFleetId}
            onSelectFleet={setSelectedFleetId}
            availableDeliveryTypes={availableDeliveryTypes}
            onFleetsDeleted={handleRefresh}
            drivers={drivers}
            onDriverDeleted={handleRefresh}
          />
        )}
        {loading ? (
          <div className="flex items-center justify-center py-12 text-gray-500">
            <div className="text-center">
              <div className="w-8 h-8 border-4 border-[#0a61d7] border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
              <p className="text-gray-600">Loading fleet details...</p>
            </div>
          </div>
        ) : (
          <FleetDetails key={`${effectiveSelectedFleetId}-${refreshKey}`} fleet={selectedFleet} onOpenTracking={handleOpenTracking} />
        )}
      </div>

      {/* Data Status Overlay */}
      {(showOverlay || isSlidingIn || isSlidingOut) && (
        <div className={`fixed top-20 right-6 z-50 bg-white border border-green-300 rounded-lg shadow-lg p-4 min-w-[280px] transform transition-all duration-500 ease-out ${
          isSlidingIn ? 'translate-x-0 opacity-100' : 
          isSlidingOut ? 'translate-x-full opacity-0' : 
          'translate-x-full opacity-0'
        }`}>
          <div className="flex items-center gap-3">
            {loading ? (
              <div className="w-5 h-5 border-2 border-[#0a61d7] border-t-transparent rounded-full animate-spin"></div>
            ) : (
              <div className="w-6 h-6 bg-green-500 rounded-full flex items-center justify-center">
                <Check className="w-4 h-4 text-white" />
              </div>
            )}
            <div>
              <p className="text-sm font-medium text-gray-900">{overlayMessage}</p>
              <p className="text-xs text-gray-500">
                {loading ? 'Please wait...' : `${fleets.length} fleet${fleets.length !== 1 ? 's' : ''} loaded`}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

