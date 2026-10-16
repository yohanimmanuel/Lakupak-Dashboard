'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  MapPin,
  Truck,
  User,
  Package,
  Route,
  Clock,
  CreditCard,
  Layers,
  Building2,
  Phone,
  Navigation2,
  ChevronRight,
  Edit,
  Maximize2,
} from 'lucide-react';
import MapFullscreenModal from '@/components/MapFullscreenModal';
import LogisticsRouteMap from './LogisticsRouteMap';
import type { FleetOrderSummary, FleetStatus } from './OrderfleetList';
import { formatEtaCompletion, formatAssignedDate } from './OrderfleetList';
import TruckImageWithLoadBar from './TruckImageWithLoadBar';
import Image from 'next/image';
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

interface OrderfleetDetailsProps {
  fleet: FleetOrderSummary;
  onBack?: () => void;
  onEdit?: () => void;
}

const deliveryStatusStyles: Record<FleetStatus, string> = {
  Available: 'bg-emerald-100 text-emerald-700',
  Unavailable: 'bg-gray-200 text-gray-700',
  'In Transit': 'bg-sky-100 text-sky-700',
  Checking: 'bg-amber-100 text-amber-700',
};

function fleetHasAssignedOrders(f: FleetOrderSummary): boolean {
  return (f.assignedOrderIds?.length ?? 0) > 0;
}

function fleetHasDeliveryAddresses(f: FleetOrderSummary): boolean {
  return (f.deliveryAddresses?.length ?? 0) > 0;
}

function DetailRow({ label, value, icon: Icon }: { label: string; value: string; icon?: React.ComponentType<{ className?: string }> }) {
  const { tShared } = useLogisticsTranslations();
  return (
    <div className="flex items-center justify-between gap-2 py-2 border-b border-gray-100 last:border-0">
      <dt className="flex items-center gap-2 text-sm text-gray-500">
        {Icon && <Icon className="h-4 w-4 text-gray-400" />}
        {label}
      </dt>
      <dd className="text-sm font-medium text-gray-900 text-right break-words max-w-[60%]">{value || tShared('notApplicable')}</dd>
    </div>
  );
}

export default function OrderfleetDetails({ fleet, onBack, onEdit }: OrderfleetDetailsProps) {
  const {
    tShared,
    tOrderfleetDetails,
    translateFleetStatus,
    translateDeliveryType,
    translateVehicleType,
  } = useLogisticsTranslations();
  const router = useRouter();
  const { user } = useUserStore();
  const [buyerInfoByStore, setBuyerInfoByStore] = useState<Map<string, { owner: string; buyerId: string }>>(new Map());
  const [routeMapFullscreen, setRouteMapFullscreen] = useState(false);

  useEffect(() => {
    if (user?.id == null) return;
    const storeNames = (fleet.customers ?? [])
      .map((c) => c.storeName?.trim())
      .filter((s): s is string => Boolean(s));
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
    return () => { cancelled = true; };
  }, [user?.id, fleet.customers]);

  const contactNameFor = (storeName: string, fallback?: string) => {
    if (!storeName?.trim()) return fallback ?? tShared('notApplicable');
    const info = buyerInfoByStore.get(storeName.trim());
    return info?.owner ?? fallback ?? tShared('notApplicable');
  };

  const buyerIdFor = (storeName: string) => buyerInfoByStore.get(storeName?.trim() ?? '')?.buyerId ?? null;

  const handleBack = () => {
    if (onBack) onBack();
    else router.push('/logistics');
  };

  const vehicleType = fleet.vehicleType ?? '20ft_container';
  const loadPct = fleet.loadPct ?? 0;
  const weightStr = fleet.vehicleMaxWeight != null
    ? `${fleet.vehicleMaxWeight.toLocaleString()} ${tShared('units.kg')}`
    : tShared('notApplicable');
  const volumeStr = fleet.vehicleMaxVolume != null
    ? `${fleet.vehicleMaxVolume.toLocaleString()} ${tShared('units.cubicMeters')}`
    : tShared('notApplicable');
  const showRouteMap = fleetHasAssignedOrders(fleet) && fleetHasDeliveryAddresses(fleet);

  return (
    <div className="bg-white p-4 rounded-lg border border-[#e6e6e6]">
      <div className="w-full mx-auto">
        {/* Breadcrumb */}
        <div className="mb-4">
          <div className="flex min-w-0 flex-col gap-3 @5xl/main:flex-row @5xl/main:items-center @5xl/main:justify-between">
            <div className="flex min-w-0 flex-col gap-3 @3xl/main:flex-row @3xl/main:items-center">
              <button
                onClick={handleBack}
                className="flex w-full shrink-0 items-center justify-center gap-2 rounded-lg px-3 py-2 text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-800 @3xl/main:w-auto @3xl/main:justify-start"
              >
                <ArrowLeft className="h-4 w-4" />
                {tOrderfleetDetails('backToFleetList')}
              </button>
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <h1 className="min-w-0 break-words text-2xl font-bold text-gray-900">{fleet.orderCode}</h1>
                <span className={`inline-flex rounded-full px-3 py-1.5 text-xs font-semibold ${deliveryStatusStyles[fleet.status]}`}>
                  {translateFleetStatus(fleet.status)}
                </span>
              </div>
            </div>
            {onEdit && (
              <button
                onClick={onEdit}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#0a61d7] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#0851b8] @4xl/main:w-auto"
              >
                <Edit className="h-4 w-4" />
                {tOrderfleetDetails('editDetails')}
              </button>
            )}
          </div>
          <p className="mt-1 flex items-center gap-1.5 text-sm text-gray-500">
            <MapPin className="h-4 w-4 text-gray-400" />
            {fleet.route}
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 @5xl/main:grid-cols-3 @5xl/main:items-stretch">
          {/* Left column – Trip & driver summary; fill height to match right column */}
          <div className="flex min-h-0 flex-col gap-4 @5xl/main:col-span-1">
            {/* Trip summary card */}
            <div className="bg-white rounded-lg border border-[#e6e6e6] p-4 flex-shrink-0">
              <div className="flex items-center gap-2 mb-4">
                <Route className="w-4 h-4 text-gray-400" />
                <h3 className="text-sm font-semibold text-gray-900">{tOrderfleetDetails('tripSummary')}</h3>
              </div>
              <div className="space-y-1">
                {fleet.assignedDate != null && fleet.assignedDate !== '' && (
                  <DetailRow label={tOrderfleetDetails('assignedDate')} value={formatAssignedDate(fleet.assignedDate)} icon={Clock} />
                )}
                <DetailRow label={tOrderfleetDetails('etaCompletion')} value={formatEtaCompletion(fleet)} icon={Clock} />
                <DetailRow label={tOrderfleetDetails('deliveriesCompleted')} value={fleet.deliveriesCompleted != null ? String(fleet.deliveriesCompleted) : tShared('notApplicable')} icon={Layers} />
                <DetailRow label={tOrderfleetDetails('totalOrders')} value={fleet.totalOrders != null ? String(fleet.totalOrders) : tShared('notApplicable')} icon={Layers} />
                <DetailRow label={tOrderfleetDetails('deliveryType')} value={fleet.deliveryType ? translateDeliveryType(fleet.deliveryType) : tShared('notApplicable')} icon={Package} />
                <DetailRow label={tOrderfleetDetails('lastUpdated')} value={fleet.lastUpdate} icon={Clock} />
              </div>
            </div>

            {/* Driver card */}
            <div className="bg-white rounded-lg border border-[#e6e6e6] p-4 flex-shrink-0">
              <div className="flex items-center gap-2 mb-4">
                <User className="w-4 h-4 text-gray-400" />
                <h3 className="text-sm font-semibold text-gray-900">{tOrderfleetDetails('driver')}</h3>
              </div>
              <div className="flex items-center gap-3 pb-3 border-b border-gray-100">
                <div className="w-12 h-12 rounded-full border-2 border-gray-200 overflow-hidden flex items-center justify-center bg-[#0a61d7]/10 text-[#0a61d7] shrink-0">
                  {fleet.driverAvatar ? (
                    <Image src={fleet.driverAvatar} alt={fleet.driverName} width={48} height={48} className="w-full h-full object-cover" unoptimized />
                  ) : (
                    <User className="w-6 h-6" />
                  )}
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-900">{fleet.driverName}</p>
                  <p className="text-xs text-gray-500">{fleet.driverStatus ?? tShared('notApplicable')}</p>
                </div>
              </div>
              <div className="space-y-1 pt-2">
                <DetailRow label={tOrderfleetDetails('phone')} value={fleet.driverPhone ?? tShared('notApplicable')} icon={Phone} />
                <DetailRow label={tOrderfleetDetails('experience')} value={fleet.driverExperience ?? tShared('notApplicable')} />
                <DetailRow label={tOrderfleetDetails('appUsername')} value={fleet.driverUsername ?? tShared('notApplicable')} />
              </div>
            </div>

            {/* Vehicle card – grows to fill remaining left column height */}
            <div className="bg-white rounded-lg border border-[#e6e6e6] p-4 flex-1 min-h-0 flex flex-col">
              <div className="flex items-center gap-2 mb-3 flex-shrink-0">
                <Truck className="w-4 h-4 text-gray-400" />
                <h3 className="text-sm font-semibold text-gray-900">{tOrderfleetDetails('vehicle')}</h3>
              </div>
              <div className="flex-shrink-0 mb-4 flex justify-center">
                <TruckImageWithLoadBar vehicleType={vehicleType} loadPct={loadPct} />
              </div>
              <div className="space-y-1 flex-shrink-0">
                <DetailRow label={tOrderfleetDetails('brand')} value={fleet.vehicleBrand ?? tShared('notApplicable')} />
                <DetailRow label={tOrderfleetDetails('model')} value={fleet.vehicleModel ?? tShared('notApplicable')} />
                <DetailRow label={tOrderfleetDetails('plateNumber')} value={fleet.plateNumber ?? tShared('notApplicable')} />
                <DetailRow label={tOrderfleetDetails('weight')} value={weightStr} />
                <DetailRow label={tOrderfleetDetails('volume')} value={volumeStr} />
                <DetailRow label={tOrderfleetDetails('vehicleType')} value={translateVehicleType(vehicleType)} />
              </div>
            </div>
          </div>

          {/* Right column – Order details, map, customer */}
          <div className="flex min-h-0 flex-col gap-4 @5xl/main:col-span-2">
            {/* Order & logistics details */}
            <div className="bg-white rounded-lg border border-[#e6e6e6] p-4">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">{tOrderfleetDetails('logisticsDetails')}</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2">
                <DetailRow label={tOrderfleetDetails('fleetId')} value={fleet.orderCode} icon={Package} />
                <DetailRow label={tOrderfleetDetails('deliveryStatus')} value={translateFleetStatus(fleet.status)} icon={Navigation2} />
                <DetailRow label={tOrderfleetDetails('assignedLogistics')} value={fleet.assignedLogistics ?? tShared('notApplicable')} icon={Truck} />
                <DetailRow label={tOrderfleetDetails('paymentTerms')} value={fleet.paymentTerms ?? tShared('notApplicable')} icon={CreditCard} />
              </div>
            </div>

            {/* Delivery Route — live Mapbox map */}
            <div className="bg-white rounded-lg border border-[#e6e6e6] overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-[#e6e6e6]">
                <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-[#0a61d7]" />
                  {tOrderfleetDetails('deliveryRoute')}
                </h3>
                <div className="flex items-center gap-2">
                  {showRouteMap ? (
                    <>
                      <span className="text-xs text-gray-500">{tOrderfleetDetails('liveRoutePreview')}</span>
                      <button
                        type="button"
                        onClick={() => setRouteMapFullscreen(true)}
                        className="rounded-lg p-2 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-800"
                        aria-label={tOrderfleetDetails('openMapAria')}
                        title={tOrderfleetDetails('fullScreenMap')}
                      >
                        <Maximize2 className="h-4 w-4" />
                      </button>
                    </>
                  ) : (
                    <span className="text-xs text-gray-400">{tOrderfleetDetails('noActiveRoute')}</span>
                  )}
                </div>
              </div>
              {showRouteMap ? (
                <LogisticsRouteMap
                  deliveryAddresses={fleet.deliveryAddresses!}
                  stopsCompleted={fleet.deliveryStopsCompleted}
                  driverLat={fleet.driverLat}
                  driverLng={fleet.driverLng}
                  height="415px"
                />
              ) : (
                <div
                  className="flex h-[415px] flex-col items-center justify-center gap-2 bg-slate-50 px-6 text-center"
                  role="status"
                >
                  <Package className="h-10 w-10 text-gray-300" />
                  {!fleetHasAssignedOrders(fleet) ? (
                    <>
                      <p className="text-sm font-semibold text-gray-800">{tOrderfleetDetails('noOrdersAssigned')}</p>
                      <p className="max-w-md text-xs text-gray-500">
                        {tOrderfleetDetails('noOrdersAssignedHint')}
                      </p>
                    </>
                  ) : (
                    <>
                      <p className="text-sm font-semibold text-gray-800">{tOrderfleetDetails('addressesUnavailable')}</p>
                      <p className="max-w-md text-xs text-gray-500">
                        {tOrderfleetDetails('addressesUnavailableHint')}
                      </p>
                    </>
                  )}
                </div>
              )}
            </div>

            {/* Customer information - list of customers with orders in this fleet */}
            <div className="bg-white rounded-lg border border-[#e6e6e6] p-4">
              <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <Building2 className="w-4 h-4 text-gray-400" />
                {tOrderfleetDetails('ordersInFleet')}
              </h3>
              {fleet.customers && fleet.customers.length > 0 ? (
                <ul className="space-y-2">
                  {fleet.customers.map((c, i) => {
                    const buyerId = buyerIdFor(c.storeName ?? '');
                    return (
                      <li key={i} className="flex items-center justify-between gap-3 rounded-lg border border-gray-100 bg-gray-50/50 px-4 py-3">
                        <span className="min-w-0 truncate text-sm text-gray-900">
                          {c.storeName} <span className="text-gray-500">({contactNameFor(c.storeName ?? '', c.contactName)})</span>
                        </span>
                        <button
                          type="button"
                          className="flex-shrink-0 inline-flex items-center gap-1 rounded-lg bg-[#0a61d7] px-2.5 py-1.5 text-xs font-medium text-white hover:bg-[#0851b8] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                          onClick={() => buyerId && router.push(`/clients/buyers/details/${buyerId}`)}
                          disabled={!buyerId}
                          title={buyerId ? tOrderfleetDetails('viewBuyerTitle', { storeName: c.storeName ?? '' }) : tOrderfleetDetails('buyerNotFound')}
                        >
                          {tOrderfleetDetails('more')}
                          <ChevronRight className="h-3.5 w-3.5" />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="text-sm text-gray-500">{tOrderfleetDetails('noOrdersInFleet')}</p>
              )}
            </div>
          </div>
        </div>
      </div>

      <MapFullscreenModal
        open={routeMapFullscreen}
        onClose={() => setRouteMapFullscreen(false)}
        title={tOrderfleetDetails('deliveryRouteTitle', { code: fleet.orderCode })}
      >
        {showRouteMap ? (
          <LogisticsRouteMap
            key={`orderfleet-route-fs-${fleet.orderCode}`}
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
