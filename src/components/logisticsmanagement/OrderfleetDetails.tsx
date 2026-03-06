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
} from 'lucide-react';
import type { FleetOrderSummary, FleetStatus } from './OrderfleetList';
import { formatEtaCompletion, formatAssignedDate } from './OrderfleetList';
import TruckImageWithLoadBar from './TruckImageWithLoadBar';
import Image from 'next/image';
import { getVehicleTypeInfo } from '@/config/vehicleTypes';
import { useUserStore } from '@/store/userStore';
import { fetchGraphQL } from '@/lib/graphqlClient';

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

function DetailRow({ label, value, icon: Icon }: { label: string; value: string; icon?: React.ComponentType<{ className?: string }> }) {
  return (
    <div className="flex items-center justify-between gap-2 py-2 border-b border-gray-100 last:border-0">
      <dt className="flex items-center gap-2 text-sm text-gray-500">
        {Icon && <Icon className="h-4 w-4 text-gray-400" />}
        {label}
      </dt>
      <dd className="text-sm font-medium text-gray-900 text-right break-words max-w-[60%]">{value || '—'}</dd>
    </div>
  );
}

export default function OrderfleetDetails({ fleet, onBack, onEdit }: OrderfleetDetailsProps) {
  const router = useRouter();
  const { user } = useUserStore();
  const [buyerInfoByStore, setBuyerInfoByStore] = useState<Map<string, { owner: string; buyerId: string }>>(new Map());

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
    if (!storeName?.trim()) return fallback ?? '—';
    const info = buyerInfoByStore.get(storeName.trim());
    return info?.owner ?? fallback ?? '—';
  };

  const buyerIdFor = (storeName: string) => buyerInfoByStore.get(storeName?.trim() ?? '')?.buyerId ?? null;

  const handleBack = () => {
    if (onBack) onBack();
    else router.push('/logistics');
  };

  const vehicleType = fleet.vehicleType ?? '20ft_container';
  const loadPct = fleet.loadPct ?? 0;
  const weightStr = fleet.vehicleMaxWeight != null ? `${fleet.vehicleMaxWeight.toLocaleString()} kg` : '—';
  const volumeStr = fleet.vehicleMaxVolume != null ? `${fleet.vehicleMaxVolume.toLocaleString()} m³` : '—';

  return (
    <div className="bg-white p-4 rounded-lg border border-[#e6e6e6]">
      <div className="w-full mx-auto">
        {/* Breadcrumb */}
        <div className="mb-4">
          <button
            onClick={handleBack}
            className="flex items-center gap-2 text-lg font-bold text-gray-500 hover:text-black transition-colors mb-2"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to fleet list
          </button>
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl font-bold text-gray-900">{fleet.orderCode}</h1>
              <span className={`inline-flex rounded-full px-3 py-1.5 text-xs font-semibold ${deliveryStatusStyles[fleet.status]}`}>
                {fleet.status}
              </span>
            </div>
            {onEdit && (
              <button
                onClick={onEdit}
                className="flex items-center gap-2 px-4 py-2 bg-[#0a61d7] text-white rounded-lg hover:bg-[#0851b8] transition-colors text-sm font-medium"
              >
                <Edit className="w-4 h-4" />
                Edit details
              </button>
            )}
          </div>
          <p className="mt-1 flex items-center gap-1.5 text-sm text-gray-500">
            <MapPin className="h-4 w-4 text-gray-400" />
            {fleet.route}
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 lg:items-stretch">
          {/* Left column – Trip & driver summary; fill height to match right column */}
          <div className="lg:col-span-1 flex flex-col gap-4 min-h-0">
            {/* Trip summary card */}
            <div className="bg-white rounded-lg border border-[#e6e6e6] p-4 flex-shrink-0">
              <div className="flex items-center gap-2 mb-4">
                <Route className="w-4 h-4 text-gray-400" />
                <h3 className="text-sm font-semibold text-gray-900">Trip Summary</h3>
              </div>
              <div className="space-y-1">
                {fleet.assignedDate != null && fleet.assignedDate !== '' && (
                  <DetailRow label="Assigned date" value={formatAssignedDate(fleet.assignedDate)} icon={Clock} />
                )}
                <DetailRow label="Estimated delivery completion" value={formatEtaCompletion(fleet)} icon={Clock} />
                <DetailRow label="Deliveries completed" value={fleet.deliveriesCompleted != null ? String(fleet.deliveriesCompleted) : '—'} icon={Layers} />
                <DetailRow label="Total Orders" value={fleet.totalOrders != null ? String(fleet.totalOrders) : '—'} icon={Layers} />
                <DetailRow label="Delivery type" value={fleet.deliveryType ?? '—'} icon={Package} />
                <DetailRow label="Last updated" value={fleet.lastUpdate} icon={Clock} />
              </div>
            </div>

            {/* Driver card */}
            <div className="bg-white rounded-lg border border-[#e6e6e6] p-4 flex-shrink-0">
              <div className="flex items-center gap-2 mb-4">
                <User className="w-4 h-4 text-gray-400" />
                <h3 className="text-sm font-semibold text-gray-900">Driver</h3>
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
                  <p className="text-xs text-gray-500">{fleet.driverStatus ?? '—'}</p>
                </div>
              </div>
              <div className="space-y-1 pt-2">
                <DetailRow label="Phone" value={fleet.driverPhone ?? '—'} icon={Phone} />
                <DetailRow label="Experience" value={fleet.driverExperience ?? '—'} />
                <DetailRow label="App username" value={fleet.driverUsername ?? '—'} />
              </div>
            </div>

            {/* Vehicle card – grows to fill remaining left column height */}
            <div className="bg-white rounded-lg border border-[#e6e6e6] p-4 flex-1 min-h-0 flex flex-col">
              <div className="flex items-center gap-2 mb-3 flex-shrink-0">
                <Truck className="w-4 h-4 text-gray-400" />
                <h3 className="text-sm font-semibold text-gray-900">Vehicle</h3>
              </div>
              <div className="flex-shrink-0 mb-4 flex justify-center">
                <TruckImageWithLoadBar vehicleType={vehicleType} loadPct={loadPct} />
              </div>
              <div className="space-y-1 flex-shrink-0">
                <DetailRow label="Brand" value={fleet.vehicleBrand ?? '—'} />
                <DetailRow label="Model" value={fleet.vehicleModel ?? '—'} />
                <DetailRow label="Plate number" value={fleet.plateNumber ?? '—'} />
                <DetailRow label="Weight" value={weightStr} />
                <DetailRow label="Volume" value={volumeStr} />
                <DetailRow label="Vehicle Type" value={getVehicleTypeInfo(vehicleType)?.label ?? '—'} />
              </div>
            </div>
          </div>

          {/* Right column – Order details, map, customer */}
          <div className="lg:col-span-2 flex flex-col gap-4 min-h-0">
            {/* Order & logistics details */}
            <div className="bg-white rounded-lg border border-[#e6e6e6] p-4">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Logistics Details</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2">
                <DetailRow label="Fleet ID" value={fleet.orderCode} icon={Package} />
                <DetailRow label="Delivery status" value={fleet.status} icon={Navigation2} />
                <DetailRow label="Assigned logistics" value={fleet.assignedLogistics ?? '—'} icon={Truck} />
                <DetailRow label="Payment terms" value={fleet.paymentTerms ?? '—'} icon={CreditCard} />
              </div>
            </div>

            {/* Route / map placeholder */}
            <div className="bg-white rounded-lg border border-[#e6e6e6] overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-[#e6e6e6]">
                <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-[#0a61d7]" />
                  Delivery Route
                </h3>
                <span className="text-xs text-gray-500">Live route preview</span>
              </div>
              <div className="relative h-[415px] bg-gradient-to-br from-blue-50 via-sky-50 to-emerald-50 flex items-center justify-center">
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_30%,rgba(14,116,144,0.12),transparent_50%),radial-gradient(circle_at_70%_70%,rgba(37,99,235,0.14),transparent_50%)]" />
                <div className="relative z-10 text-center">
                  <Route className="w-12 h-12 text-[#0a61d7]/40 mx-auto mb-2" />
                  <p className="text-sm font-medium text-gray-600">{fleet.route}</p>
                  <p className="text-xs text-gray-500 mt-1">Map integration can be added here</p>
                </div>
              </div>
            </div>

            {/* Customer information - list of customers with orders in this fleet */}
            <div className="bg-white rounded-lg border border-[#e6e6e6] p-4">
              <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <Building2 className="w-4 h-4 text-gray-400" />
                Orders in this fleet
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
                          title={buyerId ? `View buyer ${c.storeName}` : 'Buyer not found'}
                        >
                          More
                          <ChevronRight className="h-3.5 w-3.5" />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="text-sm text-gray-500">No orders assigned to this fleet.</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
