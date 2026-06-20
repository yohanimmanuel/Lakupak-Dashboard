'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { MapPin, Truck, User, Package, Route, ExternalLink, Clock, Layers, ChevronRight, Maximize2 } from 'lucide-react';
import MapFullscreenModal from '@/components/MapFullscreenModal';
import LogisticsRouteMap from './LogisticsRouteMap';
import type { FleetOrderSummary, FleetStatus } from './OrderfleetList';
import { formatEtaCompletion, formatAssignedDate } from './OrderfleetList';
import TruckImageWithLoadBar from './TruckImageWithLoadBar';
import { useUserStore } from '@/store/userStore';
import { fetchGraphQL } from '@/lib/graphqlClient';
import { useLogisticsTranslations } from '@/hooks/useLogisticsTranslations';

const BUYERS_QUERY = /* GraphQL */ `
  query GetBuyersForFleet($userId: Int!, $page: Int, $limit: Int, $storeNames: [String]) {
    buyers(userId: $userId, page: $page, limit: $limit, storeNames: $storeNames) {
      nodes { buyerId storeName owner }
    }
  }
`;

interface FleetDetailsProps {
  fleet?: FleetOrderSummary;
  onOpenTracking?: () => void;
}

type TabType = 'order' | 'vehicle' | 'driver' | 'customer';

function fleetHasAssignedOrders(f: FleetOrderSummary): boolean {
  return (f.assignedOrderIds?.length ?? 0) > 0;
}

function fleetHasDeliveryAddresses(f: FleetOrderSummary): boolean {
  return (f.deliveryAddresses?.length ?? 0) > 0;
}

export default function FleetDetails({ fleet, onOpenTracking }: FleetDetailsProps) {
  const { tFleetDetails } = useLogisticsTranslations();
  const [activeTab, setActiveTab] = useState<TabType>('order');
  const [routeMapFullscreen, setRouteMapFullscreen] = useState(false);

  if (!fleet) {
    return (
      <div className="flex h-full max-h-[calc(100vh+100px)] items-center justify-center rounded-lg border border-dashed border-gray-200 bg-white/60 p-4 text-center" data-tour="logistics-fleet-details">
        <div>
          <Truck className="mx-auto mb-3 h-8 w-8 text-gray-300" />
          <p className="text-sm font-medium text-gray-700">{tFleetDetails('selectFleetTitle')}</p>
          <p className="mt-1 text-xs text-gray-500">
            {tFleetDetails('selectFleetHint')}
          </p>
        </div>
      </div>
    );
  }

  const showRouteMap = fleetHasAssignedOrders(fleet) && fleetHasDeliveryAddresses(fleet);

  return (
    <div className="flex h-full max-h-[calc(100vh+100px)] flex-col gap-3 rounded-lg bg-white border border-gray-200 p-4" data-tour="logistics-fleet-details">
      {/* Header */}
      <div className="flex flex-shrink-0 flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium uppercase tracking-wide text-gray-400">
            {tFleetDetails('fleetId')}
          </p>
          <h2 className="text-lg font-semibold text-gray-900">{fleet.orderCode}</h2>
          <p className="mt-1 flex items-center gap-1.5 text-xs text-gray-500">
            <MapPin className="h-3.5 w-3.5 shrink-0 text-gray-400" />
            {fleet.route}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1.5 sm:mt-6">
          <button
            type="button"
            onClick={onOpenTracking}
            disabled={!onOpenTracking}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#0a61d7] px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-[#0851b8] transition-colors"
          >
            {tFleetDetails('openDetails')}
            <ExternalLink className="h-3.5 w-3.5" />
          </button>
          <p className="flex items-center gap-1.5 text-xs text-gray-500">
            <Clock className="h-3.5 w-3.5 shrink-0 text-gray-400" />
            {tFleetDetails('updated', { time: fleet.lastUpdate })}
          </p>
        </div>
      </div>

      {/* Map / route preview — map only when orders + delivery addresses exist; route label is never used for routing */}
      <div className="relative flex-shrink-0 w-full overflow-hidden rounded-lg border border-blue-100/70">
        {showRouteMap ? (
          <LogisticsRouteMap
            deliveryAddresses={fleet.deliveryAddresses!}
            stopsCompleted={fleet.deliveryStopsCompleted}
            driverLat={fleet.driverLat}
            driverLng={fleet.driverLng}
            height="450px"
          />
        ) : (
          <div
            className="flex h-[450px] flex-col items-center justify-center gap-2 bg-slate-50 px-6 text-center"
            role="status"
          >
            <Package className="h-10 w-10 text-gray-400" />
            {!fleetHasAssignedOrders(fleet) ? (
              <>
                <p className="text-sm font-semibold text-gray-500">{tFleetDetails('noOrdersAssigned')}</p>
                <p className="max-w-sm text-xs text-gray-500">
                  {tFleetDetails('noOrdersAssignedHint')}
                </p>
              </>
            ) : (
              <>
                <p className="text-sm font-semibold text-gray-800">{tFleetDetails('addressesUnavailable')}</p>
                <p className="max-w-sm text-xs text-gray-500">
                  {tFleetDetails('addressesUnavailableHint')}
                </p>
              </>
            )}
          </div>
        )}
        <div className="pointer-events-none absolute inset-0 z-10 flex flex-col justify-between p-4">
          {showRouteMap && (
            <div className="flex items-center justify-end gap-2">
              <span className="inline-flex items-center gap-1 rounded-full bg-white/90 px-3 py-1 text-xs font-medium text-gray-700 shadow-sm">
                <Route className="h-3 w-3 text-[#0a61d7]" />
                {tFleetDetails('liveRoutePreview')}
              </span>
              <button
                type="button"
                onClick={() => setRouteMapFullscreen(true)}
                className="pointer-events-auto rounded-lg bg-white/95 p-2 text-gray-600 shadow-sm transition-colors hover:bg-white hover:text-gray-900"
                aria-label={tFleetDetails('openMapAria')}
                title={tFleetDetails('fullScreenMap')}
              >
                <Maximize2 className="h-4 w-4" />
              </button>
            </div>
          )}
          {!showRouteMap && <div />}
          <div className="flex items-center justify-start">
            <div className="space-y-1 text-left rounded-lg bg-white/85 backdrop-blur-sm px-3 py-2 shadow-sm">
              {fleet.assignedDate != null && fleet.assignedDate !== '' && (
                <>
                  <p className="text-xs font-medium text-gray-500">{tFleetDetails('assignedDate')}</p>
                  <p className="text-xs font-medium text-gray-600 mb-2">{formatAssignedDate(fleet.assignedDate)}</p>
                </>
              )}
              <p className="text-sm font-medium text-gray-700">{tFleetDetails('etaCompletion')}</p>
              <p className="text-lg font-semibold text-gray-900">{formatEtaCompletion(fleet)}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs Navigation */}
      <div className="flex-shrink-0 border-b border-gray-200">
        <nav className="flex justify-center gap-1 -mb-px">
          {[
            { id: 'order' as TabType, label: tFleetDetails('tabOrder'), icon: Package },
            { id: 'vehicle' as TabType, label: tFleetDetails('tabVehicle'), icon: Truck },
            { id: 'driver' as TabType, label: tFleetDetails('tabDriver'), icon: User },
            { id: 'customer' as TabType, label: tFleetDetails('tabCustomer'), icon: User },
          ].map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setActiveTab(id)}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium transition-colors border-b-2 ${
                activeTab === id
                  ? 'border-[#0a61d7] text-[#0a61d7]'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Content - no scroll, content fits */}
      <div className="min-h-0 flex-1 overflow-hidden">
        {activeTab === 'order' && <OrderDetailsTab fleet={fleet} />}
        {activeTab === 'vehicle' && <VehicleTab fleet={fleet} />}
        {activeTab === 'driver' && <DriverTab fleet={fleet} />}
        {activeTab === 'customer' && <CustomerTab fleet={fleet} onOpenDetails={onOpenTracking} />}
      </div>

      <MapFullscreenModal
        open={routeMapFullscreen}
        onClose={() => setRouteMapFullscreen(false)}
        title={tFleetDetails('deliveryRouteTitle', { code: fleet.orderCode })}
      >
        {showRouteMap ? (
          <LogisticsRouteMap
            key={`fleet-route-fs-${fleet.orderCode}`}
            deliveryAddresses={fleet.deliveryAddresses!}
            stopsCompleted={fleet.deliveryStopsCompleted}
            driverLat={fleet.driverLat}
            driverLng={fleet.driverLng}
            height="100%"
            className="h-full rounded-none border-0 bg-white"
          />
        ) : null}
      </MapFullscreenModal>
    </div>
  );
}

const deliveryStatusStyles: Record<FleetStatus, string> = {
  Available: 'bg-emerald-100 text-emerald-700',
  Unavailable: 'bg-gray-200 text-gray-700',
  'In Transit': 'bg-sky-100 text-sky-700',
  Checking: 'bg-amber-100 text-amber-700',
};

// Order Details Tab - restructured with status highlight and grouped sections
function OrderDetailsTab({ fleet }: { fleet: FleetOrderSummary }) {
  const { tShared, tFleetDetails, translateFleetStatus } = useLogisticsTranslations();
  const notApplicable = tShared('notApplicable');

  return (
    <div className="flex h-full flex-col gap-3">
      {/* Status highlight only (no ETA inside) */}
      <div className="rounded-lg border border-gray-200 bg-gray-50/80 p-3">
        <div className="flex items-center justify-between gap-2">
          <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ${deliveryStatusStyles[fleet.status]}`}>
            {translateFleetStatus(fleet.status)}
          </span>
        </div>
      </div>

      {/* Same-level details: Assigned date, ETA, Total Orders, Delivery Type, Assigned Logistics, Payment Terms */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
        {fleet.assignedDate != null && fleet.assignedDate !== '' && (
          <InfoRowWithIcon icon={Clock} label={tFleetDetails('assignedDate')} value={formatAssignedDate(fleet.assignedDate)} />
        )}
        <InfoRowWithIcon icon={Clock} label={tFleetDetails('etaCompletion')} value={formatEtaCompletion(fleet)} />
        <InfoRowWithIcon icon={Layers} label={tFleetDetails('deliveriesCompleted')} value={fleet.deliveriesCompleted != null ? String(fleet.deliveriesCompleted) : notApplicable} />
        <InfoRowWithIcon icon={Layers} label={tFleetDetails('totalOrders')} value={fleet.totalOrders != null ? String(fleet.totalOrders) : notApplicable} />
        <InfoRowWithIcon icon={Truck} label={tFleetDetails('assignedLogistics')} value={fleet.assignedLogistics ?? tShared('defaultAssignedLogistics')} />
      </div>
    </div>
  );
}

// Vehicle Tab - compact, no scroll
function VehicleTab({ fleet }: { fleet: FleetOrderSummary }) {
  const { tFleetDetails, translateVehicleType } = useLogisticsTranslations();
  const vehicleType = fleet.vehicleType ?? '20ft_container';
  const loadPct = fleet.loadPct ?? 71;
  return (
    <div className="py-4">
      <div className="flex items-center gap-4">
        <div className="flex flex-1 flex-col items-center">
          <TruckImageWithLoadBar
            vehicleType={vehicleType}
            loadPct={loadPct}
            className="max-w-[120px]"
          />
        </div>
        <div className="flex flex-1 flex-col gap-1">
          <InfoRow label={tFleetDetails('brand')} value="Hyundai" />
          <InfoRow label={tFleetDetails('model')} value="Cargo Track HD320" />
          <InfoRow label={tFleetDetails('vehicleType')} value={translateVehicleType(vehicleType)} />
        </div>
      </div>
    </div>
  );
}

// Driver Information Tab - simple grid (no avatar), matches Customer tab layout
function DriverTab({ fleet }: { fleet: FleetOrderSummary }) {
  const { tShared, tFleetDetails, tDriverInfo, tList } = useLogisticsTranslations();
  const notApplicable = tShared('notApplicable');

  return (
    <div className="grid h-full grid-cols-2 gap-x-4 gap-y-1">
      <InfoRow label={tList('driverLabel')} value={fleet.driverName || notApplicable} />
      <InfoRow label={tDriverInfo('phone')} value={fleet.driverPhone || notApplicable} />
      <InfoRow label={tFleetDetails('experience')} value={fleet.driverExperience || notApplicable} />
      <InfoRow label={tDriverInfo('status')} value={fleet.driverStatus || notApplicable} />
      {fleet.driverUsername && (
        <InfoRow label={tFleetDetails('appUsername')} value={fleet.driverUsername} className="col-span-2" />
      )}
    </div>
  );
}

// Customer Information Tab - list of customers with orders in this fleet
function CustomerTab({ fleet, onOpenDetails: _onOpenDetails }: { fleet: FleetOrderSummary; onOpenDetails?: () => void }) {
  const { tShared, tFleetDetails } = useLogisticsTranslations();
  const { user } = useUserStore();
  const [buyerInfoByStore, setBuyerInfoByStore] = useState<Map<string, { owner: string; buyerId: string }>>(new Map());
  const customers = useMemo(() => fleet.customers ?? [], [fleet.customers]);
  const displayCustomers = customers.slice(0, 3);

  useEffect(() => {
    if (user?.id == null) return;
    const storeNames = Array.from(
      new Set(
        customers
          .map((c) => c.storeName?.trim())
          .filter((s): s is string => Boolean(s)),
      ),
    );
    if (storeNames.length === 0) {
      setBuyerInfoByStore(new Map());
      return;
    }
    let cancelled = false;
    fetchGraphQL<{ buyers: { nodes: { buyerId: string; storeName: string; owner: string }[] } }>(BUYERS_QUERY, {
      userId: user.id,
      page: 1,
      limit: Math.max(storeNames.length, 50),
      storeNames,
    })
      .then((data) => {
        if (cancelled) return;
        const map = new Map<string, { owner: string; buyerId: string }>();
        (data.buyers?.nodes ?? []).forEach((b) => {
          if (b.storeName?.trim() && b.buyerId) {
            map.set(b.storeName.trim(), { owner: b.owner?.trim() ?? '', buyerId: b.buyerId });
          }
        });
        setBuyerInfoByStore(map);
      })
      .catch(() => {
        if (!cancelled) setBuyerInfoByStore(new Map());
      });
    return () => {
      cancelled = true;
    };
  }, [user?.id, customers]);

  const contactNameFor = (storeName: string, fallback?: string) => {
    if (!storeName?.trim()) return fallback ?? tShared('notApplicable');
    const info = buyerInfoByStore.get(storeName.trim());
    return info?.owner ?? fallback ?? tShared('notApplicable');
  };

  if (displayCustomers.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center py-6 text-center">
        <User className="h-10 w-10 text-gray-300 mb-2" />
        <p className="text-sm text-gray-500">{tFleetDetails('noCustomers')}</p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col gap-1 py-1">
      <p className="text-xs font-medium text-gray-500 mb-1">{tFleetDetails('customersHint')}</p>
      <ul className="space-y-1">
        {displayCustomers.map((c, i) => (
          <li key={i} className="flex items-center gap-2 rounded-lg border border-gray-100 bg-gray-50/50 px-3 py-2">
            <span className="min-w-0 truncate text-xs text-gray-900">
              {c.storeName} <span className="text-gray-500">({contactNameFor(c.storeName ?? '', c.contactName)})</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// Helper: info row with optional icon (for order details tab)
function InfoRowWithIcon({
  icon: Icon,
  label,
  value,
  className = '',
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <div className={`flex items-center justify-between gap-2 border-b border-gray-100 py-1.5 ${className}`}>
      <dt className="flex items-center gap-1.5 text-[11px] font-medium text-gray-500">
        <Icon className="h-3.5 w-3.5 text-gray-400" />
        {label}
      </dt>
      <dd className="truncate text-right text-xs font-semibold text-gray-900">{value}</dd>
    </div>
  );
}

// Helper component for info rows - compact
function InfoRow({ label, value, className = '' }: { label: string; value: string; className?: string }) {
  return (
    <div className={`flex items-center justify-between gap-2 border-b border-gray-100 py-1.5 ${className}`}>
      <dt className="text-[11px] font-medium text-gray-500">{label}</dt>
      <dd className="truncate text-right text-xs font-semibold text-gray-900">{value}</dd>
    </div>
  );
}

