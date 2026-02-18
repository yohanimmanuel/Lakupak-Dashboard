'use client';

import React from 'react';
import Image from 'next/image';
import { getVehicleTypeInfo, type VehicleTypeKey } from '@/config/vehicleTypes';

interface TruckImageWithLoadBarProps {
  /** Vehicle type: van, box_truck, 20ft_container, 40ft_container, flatbed */
  vehicleType: VehicleTypeKey | string;
  /** Load percentage 0–100 */
  loadPct: number;
  /** Optional class for the container */
  className?: string;
}

export default function TruckImageWithLoadBar({
  vehicleType,
  loadPct,
  className = '',
}: TruckImageWithLoadBarProps) {
  const info = getVehicleTypeInfo(vehicleType);
  const pct = Math.min(100, Math.max(0, loadPct));

  return (
    <div className={`flex flex-col items-center w-full max-w-[200px] ${className}`}>
      <div className="relative w-full max-w-full aspect-[2/1] flex items-center justify-center rounded-lg overflow-hidden">
        <Image
          src={info.imagePath}
          alt={info.label}
          fill
          className="object-contain object-center p-2"
          sizes="200px"
          unoptimized
        />
      </div>
      <div className="w-full max-w-full">
        <div className="relative h-7 w-full overflow-hidden rounded-lg border-2 border-gray-400 bg-white">
          <div
            className="absolute inset-y-0 left-0 rounded-l-sm transition-all duration-300"
            style={{
              width: `${pct}%`,
              backgroundColor: '#0a61d7',
              backgroundImage: 'repeating-linear-gradient(135deg, transparent, transparent 2px, rgba(255,255,255,0.12) 2px, rgba(255,255,255,0.12) 4px)',
            }}
          />
          <span className="absolute inset-0 z-10 flex items-center justify-center text-sm font-bold text-white drop-shadow-sm pointer-events-none">
            {pct}%
          </span>
        </div>
      </div>
    </div>
  );
}
