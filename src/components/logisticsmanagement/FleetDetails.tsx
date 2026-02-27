'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { MapPin, Truck, User, Package, Route, ExternalLink, Clock, Layers, ChevronRight } from 'lucide-react';
import type { FleetOrderSummary, FleetStatus } from './OrderfleetList';
import TruckImageWithLoadBar from './TruckImageWithLoadBar';
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

interface FleetDetailsProps {
  fleet?: FleetOrderSummary;
  onOpenTracking?: () => void;
}

type TabType = 'order' | 'vehicle' | 'driver' | 'customer';

export default function FleetDetails({ fleet, onOpenTracking }: FleetDetailsProps) {
  const [activeTab, setActiveTab] = useState<TabType>('order');

  if (!fleet) {
    return (
      <div className="flex h-full max-h-[calc(100vh+100px)] items-center justify-center rounded-lg border border-dashed border-gray-200 bg-white/60 p-4 text-center">
        <div>
          <Truck className="mx-auto mb-3 h-8 w-8 text-gray-300" />
          <p className="text-sm font-medium text-gray-700">Select a fleet to view details</p>
          <p className="mt-1 text-xs text-gray-500">
            You&apos;ll see live route, delivery progress, and vehicle details here.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full max-h-[calc(100vh+100px)] flex-col gap-3 rounded-lg bg-white border border-gray-200 p-4">
      {/* Header */}
      <div className="flex flex-shrink-0 flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium uppercase tracking-wide text-gray-400">
            Fleet ID
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
            Open Details
            <ExternalLink className="h-3.5 w-3.5" />
          </button>
          <p className="flex items-center gap-1.5 text-xs text-gray-500">
            <Clock className="h-3.5 w-3.5 shrink-0 text-gray-400" />
            Updated {fleet.lastUpdate}
          </p>
        </div>
      </div>

      {/* Map / route preview */}
      <div className="relative h-[450px] flex-shrink-0 w-full overflow-hidden rounded-lg bg-gradient-to-br from-blue-50 via-sky-50 to-emerald-50 border border-blue-100/70">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(14,116,144,0.13),transparent_55%),radial-gradient(circle_at_80%_80%,rgba(37,99,235,0.16),transparent_55%)]" />
        <div className="relative z-10 flex h-full flex-col justify-between p-4">
          <div className="flex items-center justify-end">
            <span className="inline-flex items-center gap-1 rounded-full bg-white/90 px-3 py-1 text-xs font-medium text-gray-700 shadow-sm">
              <Route className="h-3 w-3 text-[#0a61d7]" />
              Live route preview
            </span>
          </div>
          <div className="flex items-center justify-end">
            <div className="space-y-1 text-right">
              <p className="text-xs font-medium text-gray-700">Estimated delivery completion</p>
              <p className="text-lg font-semibold text-gray-900">{fleet.eta}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs Navigation */}
      <div className="flex-shrink-0 border-b border-gray-200">
        <nav className="flex justify-center gap-1 -mb-px">
          {[
            { id: 'order' as TabType, label: 'Order details', icon: Package },
            { id: 'vehicle' as TabType, label: 'Vehicle', icon: Truck },
            { id: 'driver' as TabType, label: 'Driver information', icon: User },
            { id: 'customer' as TabType, label: 'Customer information', icon: User },
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
  return (
    <div className="flex h-full flex-col gap-3">
      {/* Status highlight only (no ETA inside) */}
      <div className="rounded-lg border border-gray-200 bg-gray-50/80 p-3">
        <div className="flex items-center justify-between gap-2">
          <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ${deliveryStatusStyles[fleet.status]}`}>
            {fleet.status}
          </span>
        </div>
      </div>

      {/* Same-level details: ETA, Total Orders, Delivery Type, Assigned Logistics, Payment Terms */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
        <InfoRowWithIcon icon={Clock} label="Estimated delivery completion" value={fleet.eta} />
        <InfoRowWithIcon icon={Layers} label="Deliveries completed" value={fleet.deliveriesCompleted != null ? String(fleet.deliveriesCompleted) : '—'} />
        <InfoRowWithIcon icon={Layers} label="Total Orders" value={fleet.totalOrders != null ? String(fleet.totalOrders) : '—'} />
        <InfoRowWithIcon icon={Truck} label="Assigned Logistics" value={fleet.assignedLogistics ?? 'Distributor Fleet'} />
      </div>
    </div>
  );
}

// Vehicle Tab - compact, no scroll
function VehicleTab({ fleet }: { fleet: FleetOrderSummary }) {
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
          <InfoRow label="Brand" value="Hyundai" />
          <InfoRow label="Model" value="Cargo Track HD320" />
          <InfoRow label="Vehicle Type" value={getVehicleTypeInfo(vehicleType).label} />
        </div>
      </div>
    </div>
  );
}

// Driver Information Tab - simple grid (no avatar), matches Customer tab layout
function DriverTab({ fleet }: { fleet: FleetOrderSummary }) {
  return (
    <div className="grid h-full grid-cols-2 gap-x-4 gap-y-1">
      <InfoRow label="Driver" value={fleet.driverName} />
      <InfoRow label="Phone" value="+62 812-3456-7890" />
      <InfoRow label="Experience" value="5+ years" />
      <InfoRow label="Status" value="On Route" />
    </div>
  );
}

// Customer Information Tab - list of customers with orders in this fleet
function CustomerTab({ fleet, onOpenDetails: _onOpenDetails }: { fleet: FleetOrderSummary; onOpenDetails?: () => void }) {
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
    if (!storeName?.trim()) return fallback ?? '—';
    const info = buyerInfoByStore.get(storeName.trim());
    return info?.owner ?? fallback ?? '—';
  };

  if (displayCustomers.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center py-6 text-center">
        <User className="h-10 w-10 text-gray-300 mb-2" />
        <p className="text-sm text-gray-500">No customers in this fleet</p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col gap-1 py-1">
      <p className="text-xs font-medium text-gray-500 mb-1">Customers with orders in this fleet (max 3)</p>
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

