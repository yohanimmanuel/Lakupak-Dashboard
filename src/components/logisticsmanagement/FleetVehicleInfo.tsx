'use client';

import React, { useMemo, useLayoutEffect, useRef } from 'react';
import Image from 'next/image';
import { Truck, ChevronDown } from 'lucide-react';
import type { FleetOrderSummary } from './OrderfleetList';
import { VEHICLE_TYPE_LIST, getVehicleTypeInfo } from '@/config/vehicleTypes';

export interface FleetVehicleFormData extends Partial<FleetOrderSummary> {
  vehicleBrand?: string;
  vehicleModel?: string;
  vehicleMaxWeight?: number;
  vehicleMaxVolume?: number;
}

interface FleetVehicleInfoProps {
  formData: FleetVehicleFormData;
  onFormChange: (updates: Partial<FleetVehicleFormData>) => void;
  onTabCompletion: (tabId: 'vehicle', isComplete: boolean) => void;
  mode: 'create' | 'edit';
}

export default function FleetVehicleInfo({
  formData,
  onFormChange,
  onTabCompletion,
}: FleetVehicleInfoProps) {
  const [showVehicleDropdown, setShowVehicleDropdown] = React.useState(false);
  const vehicleRef = useRef<HTMLDivElement>(null);

  const isComplete = useMemo(
    () =>
      Boolean(
        formData.vehicleType &&
          formData.vehicleBrand?.trim() &&
          formData.vehicleModel?.trim() &&
          formData.vehicleMaxWeight != null &&
          formData.vehicleMaxWeight >= 0 &&
          formData.vehicleMaxVolume != null &&
          formData.vehicleMaxVolume >= 0 &&
          formData.loadPct != null &&
          formData.loadPct >= 0 &&
          formData.loadPct <= 100
      ),
    [
      formData.vehicleType,
      formData.vehicleBrand,
      formData.vehicleModel,
      formData.vehicleMaxWeight,
      formData.vehicleMaxVolume,
      formData.loadPct,
    ]
  );

  const prevIsCompleteRef = useRef<boolean | undefined>(undefined);
  useLayoutEffect(() => {
    if (prevIsCompleteRef.current !== isComplete) {
      prevIsCompleteRef.current = isComplete;
      onTabCompletion('vehicle', isComplete);
    }
  }, [isComplete, onTabCompletion]);

  React.useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (vehicleRef.current && !vehicleRef.current.contains(e.target as Node)) setShowVehicleDropdown(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const selectedLabel = VEHICLE_TYPE_LIST.find((v) => v.key === formData.vehicleType)?.label ?? '';
  const vehicleInfo = getVehicleTypeInfo(formData.vehicleType ?? '20ft_container');

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-gray-900 mb-1">Vehicle Information</h3>
        <p className="text-sm text-gray-500">Select truck type, brand, model, and load</p>
      </div>

      {/* Vehicle type with picture on top */}
      <div>
        <label className="block text-xs font-medium text-gray-700 mb-2">
          Vehicle Type <span className="text-red-500">*</span>
        </label>
        <div className="mb-4 flex flex-col items-center p-4 rounded-lg border border-gray-200 bg-gray-50 relative">
          <div className="relative w-full max-w-[180px] aspect-[2/1] mb-3">
            <Image
              src={vehicleInfo.imagePath}
              alt={vehicleInfo.label}
              fill
              className="object-contain object-center"
              sizes="180px"
              unoptimized
            />
          </div>
          <div className="relative w-full max-w-xs" ref={vehicleRef}>
            <button
              type="button"
              onClick={() => setShowVehicleDropdown(!showVehicleDropdown)}
              className="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg text-left flex items-center justify-between bg-white focus:outline-none focus:ring-2 focus:ring-[#0a61d7] focus:border-transparent"
            >
              <span className={formData.vehicleType ? 'text-black' : 'text-gray-500'}>
                {selectedLabel || 'Select vehicle type'}
              </span>
              <ChevronDown className="w-4 h-4 text-gray-400" />
            </button>
            {showVehicleDropdown && (
              <div className="absolute z-50 w-full max-w-xs mt-1 bg-white border border-[#e6e6e6] rounded-lg shadow-lg max-h-48 overflow-y-auto">
                {VEHICLE_TYPE_LIST.map((v) => {
                  const info = getVehicleTypeInfo(v.key);
                  return (
                    <button
                      key={v.key}
                      type="button"
                      onClick={() => {
                        onFormChange({ vehicleType: v.key });
                        setShowVehicleDropdown(false);
                      }}
                      className={`w-full px-3 py-2 text-xs text-left hover:bg-gray-100 flex items-center gap-2 ${
                        formData.vehicleType === v.key ? 'text-[#0a61d7] font-semibold bg-gray-50' : 'text-gray-700'
                      }`}
                    >
                      <div className="relative w-8 h-6 shrink-0">
                        <Image src={info.imagePath} alt="" fill className="object-contain" sizes="32px" unoptimized />
                      </div>
                      {info.label}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-2">
            Brand <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={formData.vehicleBrand || ''}
            onChange={(e) => onFormChange({ vehicleBrand: e.target.value })}
            placeholder="e.g. Hyundai"
            className="w-full px-4 py-2 text-black text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0a61d7] focus:border-transparent"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-700 mb-2">
            Model <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={formData.vehicleModel || ''}
            onChange={(e) => onFormChange({ vehicleModel: e.target.value })}
            placeholder="e.g. Cargo Track HD320"
            className="w-full px-4 py-2 text-black text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0a61d7] focus:border-transparent"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-700 mb-2">
            Max Weight (kg) <span className="text-red-500">*</span>
          </label>
          <div className="relative">
            <input
              type="number"
              min={0}
              step={0.01}
              value={formData.vehicleMaxWeight ?? ''}
              onChange={(e) => {
                const v = e.target.value === '' ? undefined : Number(e.target.value);
                onFormChange({ vehicleMaxWeight: v });
              }}
              placeholder="e.g. 7260"
              className="w-full px-4 py-2 pr-12 text-black text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0a61d7] focus:border-transparent"
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-500">kg</span>
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-700 mb-2">
            Max Volume (m³) <span className="text-red-500">*</span>
          </label>
          <div className="relative">
            <input
              type="number"
              min={0}
              step={0.01}
              value={formData.vehicleMaxVolume ?? ''}
              onChange={(e) => {
                const v = e.target.value === '' ? undefined : Number(e.target.value);
                onFormChange({ vehicleMaxVolume: v });
              }}
              placeholder="e.g. 372.45"
              className="w-full px-4 py-2 pr-12 text-black text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0a61d7] focus:border-transparent"
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-500">m³</span>
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-700 mb-2">
            Load Percentage (0–100) <span className="text-red-500">*</span>
          </label>
          <input
            type="number"
            min={0}
            max={100}
            value={formData.loadPct ?? ''}
            onChange={(e) => {
              const v = e.target.value === '' ? undefined : Number(e.target.value);
              onFormChange({ loadPct: v });
            }}
            placeholder="71"
            className="w-full px-4 py-2 text-black text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0a61d7] focus:border-transparent"
          />
        </div>
      </div>
    </div>
  );
}
