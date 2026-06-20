'use client';

import React, { useState, useEffect, useRef, useMemo, useLayoutEffect } from 'react';
import { User, Mail, Phone, MapPin, Upload, X, ChevronDown } from 'lucide-react';
import { SalesAgent } from './TeamList';
import { uploadToCloudinaryDirect } from '@/utils/cloudinaryDirect';
import { useMarketingTranslations } from '@/hooks/useMarketingTranslations';

interface BasicProfileInfoProps {
  formData: Partial<SalesAgent>;
  onFormChange: (updates: Partial<SalesAgent>) => void;
  onTabCompletion: (tabId: 'profile', isComplete: boolean) => void;
  mode: 'create' | 'edit';
}

const roleOptions: SalesAgent['role'][] = [
  'Sales Manager',
  'Sales Rep',
  'Sales Support',
  'Lead Gen',
  'Account Manager',
];

const statusOptions: SalesAgent['status'][] = ['active', 'inactive'];

const GENDER_OPTIONS = [
  { value: 'Male', key: 'male' },
  { value: 'Female', key: 'female' },
  { value: 'Other', key: 'other' },
  { value: 'Prefer not to say', key: 'preferNotToSay' },
] as const;

export default function BasicProfileInfo({
  formData,
  onFormChange,
  onTabCompletion,
  mode,
}: BasicProfileInfoProps) {
  const { tBasicProfile, translateAgentRole, translateAgentStatus } = useMarketingTranslations();
  const [avatarPreview, setAvatarPreview] = useState<string | null>(formData.avatar || null);
  const [isUploading, setIsUploading] = useState(false);
  const [showRoleDropdown, setShowRoleDropdown] = useState(false);
  const [showStatusDropdown, setShowStatusDropdown] = useState(false);
  const [showSexDropdown, setShowSexDropdown] = useState(false);
  const roleDropdownRef = useRef<HTMLDivElement>(null);
  const statusDropdownRef = useRef<HTMLDivElement>(null);
  const sexDropdownRef = useRef<HTMLDivElement>(null);
  const prevIsCompleteRef = useRef<boolean | undefined>(undefined);

  // Calculate tab completion during render (not in useEffect)
  const isComplete = useMemo(() => {
    return Boolean(
      formData.name?.trim() &&
      formData.email?.trim() &&
      formData.phone?.trim() &&
      formData.role
    );
  }, [formData.name, formData.email, formData.phone, formData.role]);

  // Notify parent when completion status changes - use useLayoutEffect to sync before paint
  // This is better than useEffect for parent notifications as it happens synchronously
  useLayoutEffect(() => {
    if (prevIsCompleteRef.current !== isComplete) {
      prevIsCompleteRef.current = isComplete;
      onTabCompletion('profile', isComplete);
    }
  }, [isComplete, onTabCompletion]);

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (roleDropdownRef.current && !roleDropdownRef.current.contains(event.target as Node)) {
        setShowRoleDropdown(false);
      }
      if (statusDropdownRef.current && !statusDropdownRef.current.contains(event.target as Node)) {
        setShowStatusDropdown(false);
      }
      if (sexDropdownRef.current && !sexDropdownRef.current.contains(event.target as Node)) {
        setShowSexDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const handleAvatarUpload = async (file: File) => {
    if (!file) return;

    setIsUploading(true);
    try {
      const result = await uploadToCloudinaryDirect(file, 'sales-agents/avatars');
      if (result.success && result.url) {
        setAvatarPreview(result.url);
        onFormChange({ avatar: result.url });
      } else {
        throw new Error(result.error || 'Upload failed');
      }
    } catch (error) {
      alert(tBasicProfile('uploadFailed', { error: error instanceof Error ? error.message : tBasicProfile('unknownError') }));
    } finally {
      setIsUploading(false);
    }
  };

  const handleRemoveAvatar = () => {
    setAvatarPreview(null);
    onFormChange({ avatar: undefined });
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-gray-900 mb-1">{tBasicProfile('title')}</h3>
        <p className="text-sm text-gray-500">{tBasicProfile('subtitle')}</p>
      </div>

      {/* Avatar Upload */}
      <div className="flex flex-col items-center">
        <div className="relative mb-4">
          <div className="w-24 h-24 bg-gray-200 rounded-full flex items-center justify-center overflow-hidden border-4 border-white shadow-md">
            {avatarPreview ? (
              <img src={avatarPreview} alt="Avatar" className="w-full h-full object-cover" />
            ) : (
              <span className="text-2xl font-medium text-gray-600">
                {formData.name?.split(' ').map(n => n[0]).join('').toUpperCase() || 'SA'}
              </span>
            )}
          </div>
          {avatarPreview && (
            <button
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
              if (file) handleAvatarUpload(file);
            }}
            className="hidden"
            disabled={isUploading}
          />
          <div className="flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors text-sm font-medium text-gray-700">
            <Upload className="w-4 h-4" />
            {isUploading ? tBasicProfile('uploading') : avatarPreview ? tBasicProfile('changeAvatar') : tBasicProfile('uploadAvatar')}
          </div>
        </label>
      </div>

      {/* Form Fields */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Name */}
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-2">
            {tBasicProfile('fullName')} <span className="text-red-500">*</span>
          </label>
          <div className="relative">
            <User className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={formData.name || ''}
              onChange={(e) => onFormChange({ name: e.target.value })}
              placeholder={tBasicProfile('fullNamePlaceholder')}
              className="w-full pl-10 pr-4 py-2 text-black text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0a61d7] focus:border-transparent"
              required
            />
          </div>
        </div>

        {/* Email */}
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-2">
            {tBasicProfile('email')} <span className="text-red-500">*</span>
          </label>
          <div className="relative">
            <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="email"
              value={formData.email || ''}
              onChange={(e) => onFormChange({ email: e.target.value })}
              placeholder={tBasicProfile('emailPlaceholder')}
              className="w-full pl-10 pr-4 py-2 text-black text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0a61d7] focus:border-transparent"
              required
            />
          </div>
        </div>

        {/* Phone */}
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-2">
            {tBasicProfile('phone')} <span className="text-red-500">*</span>
          </label>
          <div className="relative">
            <Phone className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="tel"
              value={formData.phone || ''}
              onChange={(e) => onFormChange({ phone: e.target.value })}
              placeholder={tBasicProfile('phonePlaceholder')}
              className="w-full pl-10 pr-4 py-2 text-black text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0a61d7] focus:border-transparent"
              required
            />
          </div>
        </div>

        {/* Role */}
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-2">
            {tBasicProfile('role')} <span className="text-red-500">*</span>
          </label>
          <div className="relative" ref={roleDropdownRef}>
            <button
              type="button"
              onClick={() => {
                setShowRoleDropdown(!showRoleDropdown);
                setShowStatusDropdown(false);
              }}
              className="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0a61d7] focus:border-transparent text-black text-left flex items-center justify-between"
            >
              <span className={formData.role ? 'text-black' : 'text-gray-500'}>
                {formData.role ? translateAgentRole(formData.role) : tBasicProfile('selectRole')}
              </span>
              <ChevronDown className="w-4 h-4 text-gray-400" />
            </button>
            {showRoleDropdown && (
              <div className="absolute z-50 w-full mt-1 bg-white border border-[#e6e6e6] rounded-lg shadow-lg max-h-40 overflow-y-auto">
                {roleOptions.map((role) => (
                  <button
                    key={role}
                    type="button"
                    onClick={() => {
                      onFormChange({ role });
                      setShowRoleDropdown(false);
                    }}
                    className={`w-full px-3 py-2 text-xs text-left hover:bg-gray-100 ${
                      formData.role === role ? 'text-[#0a61d7] font-semibold bg-gray-50' : 'text-gray-700'
                    }`}
                  >
                    {translateAgentRole(role)}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Status */}
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-2">
            {tBasicProfile('status')} <span className="text-red-500">*</span>
          </label>
          <div className="relative" ref={statusDropdownRef}>
            <button
              type="button"
              onClick={() => {
                setShowStatusDropdown(!showStatusDropdown);
                setShowRoleDropdown(false);
              }}
              className="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0a61d7] focus:border-transparent text-black text-left flex items-center justify-between"
            >
              <span className={formData.status ? 'text-black' : 'text-gray-500'}>
                {formData.status ? translateAgentStatus(formData.status) : tBasicProfile('selectStatus')}
              </span>
              <ChevronDown className="w-4 h-4 text-gray-400" />
            </button>
            {showStatusDropdown && (
              <div className="absolute z-50 w-full mt-1 bg-white border border-[#e6e6e6] rounded-lg shadow-lg max-h-40 overflow-y-auto">
                {statusOptions.map((status) => (
                  <button
                    key={status}
                    type="button"
                    onClick={() => {
                      onFormChange({ status });
                      setShowStatusDropdown(false);
                    }}
                    className={`w-full px-3 py-2 text-xs text-left hover:bg-gray-100 ${
                      formData.status === status ? 'text-[#0a61d7] font-semibold bg-gray-50' : 'text-gray-700'
                    }`}
                  >
                    {translateAgentStatus(status)}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Territory */}
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-2">
            {tBasicProfile('territory')}
          </label>
          <div className="relative">
            <MapPin className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={formData.territory || ''}
              onChange={(e) => onFormChange({ territory: e.target.value })}
              placeholder={tBasicProfile('territoryPlaceholder')}
              className="w-full pl-10 pr-4 py-2 text-black text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0a61d7] focus:border-transparent"
            />
          </div>
        </div>

        {/* Sex/Gender */}
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-2">
            {tBasicProfile('sex')}
          </label>
          <div className="relative" ref={sexDropdownRef}>
            <button
              type="button"
              onClick={() => {
                setShowSexDropdown(!showSexDropdown);
                setShowRoleDropdown(false);
                setShowStatusDropdown(false);
              }}
              className="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0a61d7] focus:border-transparent text-black text-left flex items-center justify-between"
            >
              <span className={formData.sex ? 'text-black' : 'text-gray-500'}>
                {formData.sex
                  ? tBasicProfile(`genderOptions.${GENDER_OPTIONS.find(g => g.value === formData.sex)?.key ?? 'other'}`)
                  : tBasicProfile('selectGender')}
              </span>
              <ChevronDown className="w-4 h-4 text-gray-400" />
            </button>
            {showSexDropdown && (
              <div className="absolute z-50 w-full mt-1 bg-white border border-[#e6e6e6] rounded-lg shadow-lg max-h-40 overflow-y-auto">
                {GENDER_OPTIONS.map(({ value, key }) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => {
                      onFormChange({ sex: value });
                      setShowSexDropdown(false);
                    }}
                    className={`w-full px-3 py-2 text-xs text-left hover:bg-gray-100 ${
                      formData.sex === value ? 'text-[#0a61d7] font-semibold bg-gray-50' : 'text-gray-700'
                    }`}
                  >
                    {tBasicProfile(`genderOptions.${key}`)}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* About Me / Bio */}
      <div>
        <label className="block text-xs font-medium text-gray-700 mb-2">
          {tBasicProfile('bio')}
        </label>
        <textarea
          value={formData.bio || ''}
          onChange={(e) => onFormChange({ bio: e.target.value })}
          placeholder={tBasicProfile('bioPlaceholder')}
          rows={4}
          className="w-full text-black text-xs border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#0a61d7] focus:border-transparent resize-none"
        />
      </div>

      {/* Additional Info */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
        <p className="text-xs text-blue-800">
          <strong>{tBasicProfile('note')}</strong> {tBasicProfile('requiredNote')}
        </p>
      </div>
    </div>
  );
}

