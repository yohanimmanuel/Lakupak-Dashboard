'use client';

import React, { useState } from 'react';
import { MapPin, Truck, User, Package, Route, ExternalLink, Clock, Layers, ChevronRight } from 'lucide-react';
import type { FleetOrderSummary, FleetStatus } from './OrderfleetList';

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
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-gray-400">
            Fleet ID
          </p>
          <h2 className="text-lg font-semibold text-gray-900">{fleet.orderCode}</h2>
          <p className="mt-1 flex items-center gap-1.5 text-xs text-gray-500">
            <MapPin className="h-3.5 w-3.5 text-gray-400" />
            {fleet.route}
          </p>
        </div>
        <button
          type="button"
          onClick={onOpenTracking}
          disabled={!onOpenTracking}
          className="inline-flex items-center gap-1.5 rounded-lg bg-[#0a61d7] px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-[#0851b8] transition-colors"
        >
          Open Details
          <ExternalLink className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Map / route preview */}
      <div className="relative h-[460px] flex-shrink-0 w-full overflow-hidden rounded-lg bg-gradient-to-br from-blue-50 via-sky-50 to-emerald-50 border border-blue-100/70">
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
        {activeTab === 'vehicle' && <VehicleTab />}
        {activeTab === 'driver' && <DriverTab fleet={fleet} />}
        {activeTab === 'customer' && <CustomerTab fleet={fleet} onOpenDetails={onOpenTracking} />}
      </div>
    </div>
  );
}

const deliveryStatusStyles: Record<FleetStatus, string> = {
  'In Transit': 'bg-emerald-100 text-emerald-700',
  Checking: 'bg-amber-100 text-amber-700',
  Delivered: 'bg-blue-100 text-blue-700',
  Delayed: 'bg-rose-100 text-rose-700',
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
          <span className="flex items-center gap-1.5 text-xs text-gray-600">
            <Route className="h-3.5 w-3.5 text-gray-500" />
            <span>{fleet.distanceLeftKm.toFixed(1)} km left</span>
          </span>
        </div>
      </div>

      {/* Same-level details: ETA, Total Orders, Delivery Type, Assigned Logistics, Payment Terms */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
        <InfoRowWithIcon icon={Clock} label="Estimated delivery completion" value={fleet.eta} />
        <InfoRowWithIcon icon={Layers} label="Deliveries completed" value={fleet.deliveriesCompleted != null ? String(fleet.deliveriesCompleted) : '—'} />
        <InfoRowWithIcon icon={Layers} label="Total Orders" value={fleet.totalOrders != null ? String(fleet.totalOrders) : '—'} />
        <InfoRowWithIcon icon={Truck} label="Assigned Logistics" value="Distributor Fleet" />
      </div>
    </div>
  );
}

// Vehicle Tab - compact, no scroll
function VehicleTab() {
  return (
    <div className="py-4">
      <div className="flex items-center gap-4">
        <div className="flex flex-1 flex-col items-center">
          <Truck className="mb-1 h-10 w-10 text-gray-400" />
          <div className="h-2 w-full overflow-hidden rounded bg-gray-200">
            <div className="h-full w-[71%] bg-[#0a61d7]" />
          </div>
          <span className="mt-1 text-xs font-semibold text-gray-900">71% Loaded</span>
        </div>
        <div className="flex flex-1 flex-col gap-1">
          <InfoRow label="Brand" value="Hyundai" />
          <InfoRow label="Model" value="Cargo Track HD320" />
          <InfoRow label="Vehicle Type" value="20ft Container" />
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

// Customer Information Tab - list of customers with orders in this fleet; More goes to logistics details
function CustomerTab({ fleet, onOpenDetails }: { fleet: FleetOrderSummary; onOpenDetails?: () => void }) {
  const customers = fleet.customers ?? [];
  const displayCustomers = customers.slice(0, 3);

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
      <p className="text-[11px] font-medium text-gray-500 mb-1">Customers with orders in this fleet (max 3)</p>
      <ul className="space-y-1">
        {displayCustomers.map((c, i) => (
          <li key={i} className="flex items-center justify-between gap-2 rounded-lg border border-gray-100 bg-gray-50/50 px-3 py-2">
            <span className="min-w-0 truncate text-sm text-gray-900">
              {c.storeName} <span className="text-gray-500">({c.contactName})</span>
            </span>
            <button
              type="button"
              onClick={onOpenDetails}
              className="flex-shrink-0 inline-flex items-center gap-1 rounded-lg bg-[#0a61d7] px-2.5 py-1.5 text-xs font-medium text-white hover:bg-[#0851b8] transition-colors"
            >
              More
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
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

