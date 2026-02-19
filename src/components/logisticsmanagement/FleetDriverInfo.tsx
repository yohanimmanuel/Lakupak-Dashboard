'use client';

import React, { useState, useMemo, useLayoutEffect, useRef } from 'react';
import { User, Phone, Briefcase, Activity, Upload, X } from 'lucide-react';
import Image from 'next/image';
import { uploadToCloudinaryDirect } from '@/utils/cloudinaryDirect';
import type { FleetOrderSummary } from './OrderfleetList';

export interface FleetDriverFormData extends Partial<FleetOrderSummary> {
  driverPhone?: string;
  driverExperience?: string;
  driverStatus?: string;
  driverAvatar?: string;
}

interface FleetDriverInfoProps {
  formData: FleetDriverFormData;
  onFormChange: (updates: Partial<FleetDriverFormData>) => void;
  onTabCompletion: (tabId: 'driver', isComplete: boolean) => void;
  mode: 'create' | 'edit';
}

export default function FleetDriverInfo({
  formData,
  onFormChange,
  onTabCompletion,
}: FleetDriverInfoProps) {
  const isComplete = useMemo(
    () =>
      Boolean(
        formData.driverName?.trim() &&
          formData.driverPhone?.trim() &&
          formData.driverExperience?.trim() &&
          formData.driverStatus?.trim()
      ),
    [formData.driverName, formData.driverPhone, formData.driverExperience, formData.driverStatus]
  );

  const prevIsCompleteRef = useRef<boolean | undefined>(undefined);
  const [isUploading, setIsUploading] = useState(false);

  const handleAvatarUpload = async (file: File) => {
    if (!file) return;
    setIsUploading(true);
    try {
      const result = await uploadToCloudinaryDirect(file, 'logistics/driver-avatars');
      if (result.success && result.url) {
        onFormChange({ driverAvatar: result.url });
      } else {
        throw new Error(result.error || 'Upload failed');
      }
    } catch (error) {
      alert(`Failed to upload avatar: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsUploading(false);
    }
  };

  const handleRemoveAvatar = () => {
    onFormChange({ driverAvatar: undefined });
  };

  useLayoutEffect(() => {
    if (prevIsCompleteRef.current !== isComplete) {
      prevIsCompleteRef.current = isComplete;
      onTabCompletion('driver', isComplete);
    }
  }, [isComplete, onTabCompletion]);

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-gray-900 mb-1">Driver Information</h3>
        <p className="text-sm text-gray-500">Enter assigned driver details</p>
      </div>

      {/* Avatar Upload */}
      <div className="flex flex-col items-center">
        <div className="relative mb-4">
          <div className="w-24 h-24 bg-gray-200 rounded-full flex items-center justify-center overflow-hidden border-4 border-white shadow-md">
            {formData.driverAvatar ? (
              <Image src={formData.driverAvatar} alt="Driver avatar" width={96} height={96} className="w-full h-full object-cover" unoptimized />
            ) : (
              <span className="text-2xl font-medium text-gray-600">
                {formData.driverName?.split(' ').filter(Boolean).map((n) => n[0]).join('').toUpperCase().slice(0, 2) || 'DR'}
              </span>
            )}
          </div>
          {formData.driverAvatar && (
            <button
              type="button"
              onClick={handleRemoveAvatar}
              className="absolute -top-1 -right-1 w-6 h-6 bg-red-500 rounded-full flex items-center justify-center border-2 border-white hover:bg-red-600 transition-colors"
            >
              <X className="w-3 h-3 text-white" />
            </button>
          )}
        </div>
        <label className="cursor-pointer">
          <input
            type="file"
            accept="image/*"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) {
                handleAvatarUpload(file);
                e.target.value = ''; // Reset to allow re-uploading same file
              }
            }}
            className="hidden"
            disabled={isUploading}
          />
          <div className="flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors text-sm font-medium text-gray-700">
            <Upload className="w-4 h-4" />
            {isUploading ? 'Uploading...' : formData.driverAvatar ? 'Change Avatar' : 'Upload Avatar'}
          </div>
        </label>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-2">
            Driver Name <span className="text-red-500">*</span>
          </label>
          <div className="relative">
            <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={formData.driverName || ''}
              onChange={(e) => onFormChange({ driverName: e.target.value })}
              placeholder="Andi Pratama"
              className="w-full pl-10 pr-4 py-2 text-black text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0a61d7] focus:border-transparent"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-700 mb-2">
            Driver Phone <span className="text-red-500">*</span>
          </label>
          <div className="relative">
            <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="tel"
              value={formData.driverPhone || ''}
              onChange={(e) => onFormChange({ driverPhone: e.target.value })}
              placeholder="+62 812-3456-7890"
              className="w-full pl-10 pr-4 py-2 text-black text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0a61d7] focus:border-transparent"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-700 mb-2">
            Experience <span className="text-red-500">*</span>
          </label>
          <div className="relative">
            <Briefcase className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={formData.driverExperience || ''}
              onChange={(e) => onFormChange({ driverExperience: e.target.value })}
              placeholder="e.g. 5+ years"
              className="w-full pl-10 pr-4 py-2 text-black text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0a61d7] focus:border-transparent"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-700 mb-2">
            Status <span className="text-red-500">*</span>
          </label>
          <div className="relative">
            <Activity className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={formData.driverStatus || ''}
              onChange={(e) => onFormChange({ driverStatus: e.target.value })}
              placeholder="e.g. On route, Available"
              className="w-full pl-10 pr-4 py-2 text-black text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0a61d7] focus:border-transparent"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
