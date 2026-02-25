'use client';

import React, { useMemo, useLayoutEffect, useRef } from 'react';
import { MapPin, Calendar, Clock, CreditCard, ChevronDown, Truck } from 'lucide-react';
import type { FleetOrderSummary, FleetStatus, DeliveryType } from './OrderfleetList';

export interface FleetBasicFormData extends Partial<FleetOrderSummary> {
  routeFrom?: string;
  routeTo?: string;
  etaDate?: string;
  etaTime?: string;
  paymentTerms?: string;
}

interface FleetBasicInfoProps {
  formData: FleetBasicFormData;
  onFormChange: (updates: Partial<FleetBasicFormData>) => void;
  onTabCompletion: (tabId: 'basic', isComplete: boolean) => void;
  mode: 'create' | 'edit';
  /** System-generated fleet code (read-only) */
  fleetCode?: string;
}

const STATUS_OPTIONS: FleetStatus[] = ['In Transit', 'Checking', 'Delivered', 'Delayed'];
const DELIVERY_OPTIONS: DeliveryType[] = [
  'Standard Shipping',
  'Express Shipping',
  'Same-day Delivery',
  'Next-day Delivery',
  'Scheduled Delivery',
  'Pickup Available',
];

export default function FleetBasicInfo({
  formData,
  onFormChange,
  onTabCompletion,
  mode,
  fleetCode,
}: FleetBasicInfoProps) {
  const [showStatusDropdown, setShowStatusDropdown] = React.useState(false);
  const [showDeliveryDropdown, setShowDeliveryDropdown] = React.useState(false);
  const statusRef = useRef<HTMLDivElement>(null);
  const deliveryRef = useRef<HTMLDivElement>(null);

  const isComplete = useMemo(
    () =>
      Boolean(
        (fleetCode || formData.orderCode)?.trim() &&
          formData.routeFrom?.trim() &&
          formData.routeTo?.trim() &&
          formData.status &&
          formData.deliveryType &&
          formData.etaDate?.trim() &&
          formData.etaTime?.trim() &&
          formData.paymentTerms?.trim()
      ),
    [
      fleetCode,
      formData.orderCode,
      formData.routeFrom,
      formData.routeTo,
      formData.status,
      formData.deliveryType,
      formData.etaDate,
      formData.etaTime,
      formData.paymentTerms,
    ]
  );

  const prevIsCompleteRef = useRef<boolean | undefined>(undefined);
  useLayoutEffect(() => {
    if (prevIsCompleteRef.current !== isComplete) {
      prevIsCompleteRef.current = isComplete;
      onTabCompletion('basic', isComplete);
    }
  }, [isComplete, onTabCompletion]);

  React.useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (statusRef.current && !statusRef.current.contains(e.target as Node)) setShowStatusDropdown(false);
      if (deliveryRef.current && !deliveryRef.current.contains(e.target as Node)) setShowDeliveryDropdown(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const displayCode = fleetCode ?? formData.orderCode ?? '';

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-gray-900 mb-1">Basic Fleet Information</h3>
        <p className="text-sm text-gray-500">Enter route, status, and delivery details</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-2">Fleet Code</label>
          <input
            type="text"
            value={displayCode}
            readOnly
            placeholder="Auto-generated"
            className="w-full px-4 py-2 text-gray-500 text-xs border border-gray-200 rounded-lg bg-gray-50 cursor-not-allowed"
          />
          <p className="mt-1 text-[10px] text-gray-400">System-generated</p>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-700 mb-2">
            Route From <span className="text-red-500">*</span>
          </label>
          <div className="relative">
            <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={formData.routeFrom || ''}
              onChange={(e) => onFormChange({ routeFrom: e.target.value })}
              placeholder="Warehouse Jakarta"
              className="w-full pl-10 pr-4 py-2 text-black text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0a61d7] focus:border-transparent"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-700 mb-2">
            Route To <span className="text-red-500">*</span>
          </label>
          <div className="relative">
            <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={formData.routeTo || ''}
              onChange={(e) => onFormChange({ routeTo: e.target.value })}
              placeholder="Berastagi, North Sumatra"
              className="w-full pl-10 pr-4 py-2 text-black text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0a61d7] focus:border-transparent"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-700 mb-2">
            Status <span className="text-red-500">*</span>
          </label>
          <div className="relative" ref={statusRef}>
            <button
              type="button"
              onClick={() => {
                setShowStatusDropdown(!showStatusDropdown);
                setShowDeliveryDropdown(false);
              }}
              className="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg text-left flex items-center justify-between focus:outline-none focus:ring-2 focus:ring-[#0a61d7] focus:border-transparent"
            >
              <span className={formData.status ? 'text-black' : 'text-gray-500'}>
                {formData.status || 'Select status'}
              </span>
              <ChevronDown className="w-4 h-4 text-gray-400" />
            </button>
            {showStatusDropdown && (
              <div className="absolute z-50 w-full mt-1 bg-white border border-[#e6e6e6] rounded-lg shadow-lg max-h-40 overflow-y-auto">
                {STATUS_OPTIONS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => {
                      onFormChange({ status: s });
                      setShowStatusDropdown(false);
                    }}
                    className={`w-full px-3 py-2 text-xs text-left hover:bg-gray-100 ${
                      formData.status === s ? 'text-[#0a61d7] font-semibold bg-gray-50' : 'text-gray-700'
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-700 mb-2">
            Delivery Type <span className="text-red-500">*</span>
          </label>
          <div className="relative" ref={deliveryRef}>
            <button
              type="button"
              onClick={() => {
                setShowDeliveryDropdown(!showDeliveryDropdown);
                setShowStatusDropdown(false);
              }}
              className="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg text-left flex items-center justify-between focus:outline-none focus:ring-2 focus:ring-[#0a61d7] focus:border-transparent"
            >
              <span className={formData.deliveryType ? 'text-black' : 'text-gray-500'}>
                {formData.deliveryType || 'Select delivery type'}
              </span>
              <ChevronDown className="w-4 h-4 text-gray-400" />
            </button>
            {showDeliveryDropdown && (
              <div className="absolute z-50 w-full mt-1 bg-white border border-[#e6e6e6] rounded-lg shadow-lg max-h-40 overflow-y-auto">
                {DELIVERY_OPTIONS.map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => {
                      onFormChange({ deliveryType: d });
                      setShowDeliveryDropdown(false);
                    }}
                    className={`w-full px-3 py-2 text-xs text-left hover:bg-gray-100 ${
                      formData.deliveryType === d ? 'text-[#0a61d7] font-semibold bg-gray-50' : 'text-gray-700'
                    }`}
                  >
                    {d}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-700 mb-2">
            ETA Completion Date <span className="text-red-500">*</span>
          </label>
          <div className="relative">
            <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="date"
              value={formData.etaDate || ''}
              onChange={(e) => onFormChange({ etaDate: e.target.value })}
              className="w-full pl-10 pr-4 py-2 text-black text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0a61d7] focus:border-transparent"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-700 mb-2">
            ETA Completion Time <span className="text-red-500">*</span>
          </label>
          <div className="relative">
            <Clock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="time"
              value={formData.etaTime || ''}
              onChange={(e) => onFormChange({ etaTime: e.target.value })}
              className="w-full pl-10 pr-4 py-2 text-black text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0a61d7] focus:border-transparent"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-700 mb-2">
            Payment Terms <span className="text-red-500">*</span>
          </label>
          <div className="relative">
            <CreditCard className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={formData.paymentTerms || ''}
              onChange={(e) => onFormChange({ paymentTerms: e.target.value })}
              placeholder="e.g. Net 30, Cash on Delivery"
              className="w-full pl-10 pr-4 py-2 text-black text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0a61d7] focus:border-transparent"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-700 mb-2">Assigned Logistics</label>
          <div className="relative">
            <Truck className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={formData.assignedLogistics || ''}
              onChange={(e) => onFormChange({ assignedLogistics: e.target.value })}
              placeholder="e.g. Distributor Fleet"
              className="w-full pl-10 pr-4 py-2 text-black text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0a61d7] focus:border-transparent"
            />
          </div>
          <p className="mt-1 text-[10px] text-gray-400">Shown in Logistics details and on assigned orders</p>
        </div>
      </div>
    </div>
  );
}
