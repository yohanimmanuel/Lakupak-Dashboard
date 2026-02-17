'use client';

import React, { useState } from 'react';
import { MapPin, Navigation2, Truck, User, Package, Route, ExternalLink } from 'lucide-react';
import type { FleetOrderSummary } from './OrderfleetList';

interface FleetDetailsProps {
  fleet?: FleetOrderSummary;
  onOpenTracking?: () => void;
}

type TabType = 'order' | 'vehicle' | 'driver' | 'customer';

export default function FleetDetails({ fleet, onOpenTracking }: FleetDetailsProps) {
  const [activeTab, setActiveTab] = useState<TabType>('order');

  if (!fleet) {
    return (
      <div className="flex h-full max-h-[calc(100vh-210px)] items-center justify-center rounded-lg border border-dashed border-gray-200 bg-white/60 p-4 text-center">
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
            Order ID
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
      <div className="relative h-[480px] flex-shrink-0 w-full overflow-hidden rounded-xl bg-gradient-to-br from-blue-50 via-sky-50 to-emerald-50 border border-blue-100/70">
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
              <p className="text-xs font-medium text-gray-700">Estimated arrival</p>
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
        {activeTab === 'customer' && <CustomerTab />}
      </div>
    </div>
  );
}

// Order Details Tab - compact, no scroll
function OrderDetailsTab({ fleet }: { fleet: FleetOrderSummary }) {
  return (
    <div className="grid h-full grid-cols-2 gap-x-4 gap-y-1 py-2">
      <InfoRow label="Order ID" value={fleet.orderCode} />
      <InfoRow label="Status" value={fleet.status} />
      <InfoRow label="Route" value={fleet.route} />
      <InfoRow label="Distance" value={`${fleet.distanceLeftKm.toFixed(1)} km`} />
      <InfoRow label="ETA" value={fleet.eta} />
      <InfoRow label="Stops" value="3 / 5" />
      <InfoRow label="Location" value="En route" />
      <InfoRow label="Priority" value="Standard" />
    </div>
  );
}

// Vehicle Tab - compact, no scroll
function VehicleTab() {
  return (
    <div className="py-2">
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
          <InfoRow label="Weight" value="7,260 kg" />
          <InfoRow label="Load Volume" value="372.45 m³" />
        </div>
      </div>
    </div>
  );
}

// Driver Information Tab - compact, no scroll
function DriverTab({ fleet }: { fleet: FleetOrderSummary }) {
  return (
    <div className="flex h-full flex-col gap-2 py-2">
      <div className="flex items-center gap-3 rounded-lg border border-gray-200 bg-gray-50/50 p-2">
        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-blue-100 text-[#0a61d7]">
          <User className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold text-gray-900">{fleet.driverName}</h3>
          <p className="text-[11px] text-gray-500">Professional Driver</p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1">
        <InfoRow label="Phone" value="+62 812-3456-7890" />
        <InfoRow label="License" value="SIM-A 123456789" />
        <InfoRow label="Experience" value="5+ years" />
        <InfoRow label="Status" value="On Route" />
      </div>
    </div>
  );
}

// Customer Information Tab - compact, no scroll
function CustomerTab() {
  return (
    <div className="grid h-full grid-cols-2 gap-x-4 gap-y-1 py-2">
      <InfoRow label="Customer" value="PT. Berastagi Distribution" />
      <InfoRow label="Contact" value="John Doe" />
      <InfoRow label="Phone" value="+62 812-9876-5432" />
      <InfoRow label="Email" value="contact@berastagidist.com" />
      <InfoRow label="Address" value="Jl. Raya Berastagi No. 123" className="col-span-2" />
      <InfoRow label="Delivery" value="Standard" />
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

