'use client';

import { SkeletonLogisticsPage } from '@/components/skeleton/SkeletonLogisticsPage';
import React, { useMemo, useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { RefreshCcw, Download, Plus, Check } from 'lucide-react';
import * as XLSX from 'xlsx';
import OrderfleetList, {
  type FleetOrderSummary,
  type DeliveryType,
  type DriverSummary,
  formatEtaCompletion,
} from '@/components/logisticsmanagement/OrderfleetList';
import FleetDetails from '@/components/logisticsmanagement/FleetDetails';
import { useUserStore } from '@/store/userStore';
import { fetchFleets, fetchDrivers } from '@/data/logisticsFleetsApi';
import { useLogisticsTranslations } from '@/hooks/useLogisticsTranslations';

const VALID_DELIVERY_TYPES: DeliveryType[] = [
  'Standard Shipping',
  'Express Shipping',
  'Same-day Delivery',
  'Next-day Delivery',
  'Scheduled Delivery',
  'Pickup Available',
];

export default function LogisticsPage() {
  const { tPage, tShared } = useLogisticsTranslations();
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
      setOverlayMessage(tPage('overlayRefreshing'));
    } else {
      setIsSlidingIn(true);
      setOverlayMessage(tPage('overlayLoading'));
    }
    
    try {
      const [result, driverList] = await Promise.all([fetchFleets(uid), fetchDrivers(uid)]);
      setFleets(result?.nodes ?? []);
      setDrivers(driverList ?? []);
      setOverlayMessage(tPage('overlayShowing', { count: result?.nodes?.length ?? 0 }));
    } catch (e) {
      setError(e instanceof Error ? e.message : tPage('loadFailed'));
      setFleets([]);
      setOverlayMessage(tPage('overlayError'));
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
  }, [user?.id, fleets.length, tPage]);

  useEffect(() => {
    // Start slide-in animation immediately for initial page load
    setIsSlidingIn(true);
    setOverlayMessage(tPage('overlayLoading'));
    
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
        alert(tPage('exportNoData'));
        return;
      }
      const rows = fleets.map((f) => ({
        'Fleet ID': f.id,
        'Fleet Code': f.orderCode ?? '',
        Route: f.route ?? '',
        Status: f.status ?? '',
        'Delivery Type': f.deliveryType ?? '',
        ETA: formatEtaCompletion(f),
        'Last Update': f.lastUpdate ?? '',
        Driver: f.driverName ?? '',
        'Driver Phone': f.driverPhone ?? '',
        'Vehicle Type': f.vehicleType ?? '',
        'Vehicle Brand': f.vehicleBrand ?? '',
        'Vehicle Model': f.vehicleModel ?? '',
        'Plate number': f.plateNumber ?? '',
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
      alert(tPage('exportFailed'));
    }
  };

  const handleAddFleet = () => {
    router.push('/logistics/create');
  };

  const handleOpenTracking = () => {
    if (effectiveSelectedFleetId) router.push(`/logistics/details?id=${effectiveSelectedFleetId}`);
  };

  if (loading && fleets.length === 0) {
    return <SkeletonLogisticsPage />;
  }

  return (
    <div className="flex min-h-full w-full min-w-0 flex-col bg-gradient-to-b from-gray-50 to-white p-4">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-2">
        <div data-tour="logistics-page-header">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">{tPage('title')}</h1>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-3" data-tour="logistics-actions">
          {/* Refresh Button */}
          <button
            onClick={handleRefresh}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-[#e6e6e6] text-black rounded-lg hover:bg-gray-50 transition-colors text-sm font-medium"
          >
            <RefreshCcw className="w-4 h-4" />
            {tShared('refresh')}
          </button>

          {/* Export Button */}
          <button
            onClick={handleExport}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-[#e6e6e6] text-black rounded-lg hover:bg-gray-50 transition-colors text-sm font-medium"
          >
            <Download className="w-4 h-4" />
            {tShared('exportData')}
          </button>

          {/* Add Fleet & Driver Button */}
          <button
            onClick={handleAddFleet}
            className="flex items-center gap-2 px-6 py-2 bg-[#0a61d7] text-white rounded-lg hover:bg-[#0851b8] transition-colors text-sm font-semibold"
          >
            <Plus className="w-4 h-4" />
            {tShared('addFleetDriver')}
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
          {error}
        </div>
      )}

      {/* Main content: list + details/tracking */}
      <div className="mt-4 grid grid-cols-1 gap-4 @4xl/main:grid-cols-2">
        <OrderfleetList
          fleets={fleets}
          selectedFleetId={effectiveSelectedFleetId}
          onSelectFleet={setSelectedFleetId}
          availableDeliveryTypes={availableDeliveryTypes}
          onFleetsDeleted={handleRefresh}
          drivers={drivers}
          onDriverDeleted={handleRefresh}
        />
        <FleetDetails key={`${effectiveSelectedFleetId}-${refreshKey}`} fleet={selectedFleet} onOpenTracking={handleOpenTracking} />
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
                {loading
                  ? tShared('pleaseWait')
                  : fleets.length === 1
                    ? tPage('overlayLoaded', { count: fleets.length })
                    : tPage('overlayLoadedPlural', { count: fleets.length })}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

