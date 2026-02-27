'use client';

import React, { useState, useMemo, useLayoutEffect, useRef } from 'react';
import { User, Phone, Briefcase, Activity, Upload, X, AtSign, Lock, Eye, EyeOff, Key, AlertCircle, ArrowRight } from 'lucide-react';
import { getPasswordStrength } from '@/utils/auth-security';
import Image from 'next/image';
import { uploadToCloudinaryDirect } from '@/utils/cloudinaryDirect';
import type { FleetOrderSummary } from './OrderfleetList';

/** Static map so Tailwind can see every class at build time — never use dynamic interpolation. */
const STRENGTH_COLORS: Record<string, { text: string; bg: string }> = {
  gray:   { text: 'text-gray-600',   bg: 'bg-gray-500' },
  red:    { text: 'text-red-600',    bg: 'bg-red-500'   },
  orange: { text: 'text-orange-600', bg: 'bg-orange-500' },
  blue:   { text: 'text-blue-600',   bg: 'bg-blue-500'  },
  green:  { text: 'text-green-600',  bg: 'bg-green-500' },
};

export interface FleetDriverFormData extends Partial<FleetOrderSummary> {
  driverPhone?: string;
  driverExperience?: string;
  driverStatus?: string;
  driverAvatar?: string;
  driverUsername?: string;
  driverPassword?: string;
}

interface FleetDriverInfoProps {
  formData: FleetDriverFormData;
  onFormChange: (updates: Partial<FleetDriverFormData>) => void;
  onTabCompletion: (tabId: 'driver', isComplete: boolean) => void;
  mode: 'create' | 'edit';
  /** ID of the fleet being edited — required for current-password verification in edit mode */
  fleetId?: string | null;
}

export default function FleetDriverInfo({
  formData,
  onFormChange,
  onTabCompletion,
  mode,
  fleetId,
}: FleetDriverInfoProps) {
  const prevIsCompleteRef = useRef<boolean | undefined>(undefined);
  const [isUploading, setIsUploading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // Change-password modal (edit mode)
  const [showChangePasswordModal, setShowChangePasswordModal] = useState(false);
  const [changePasswordStep, setChangePasswordStep] = useState(1);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [changePasswordError, setChangePasswordError] = useState<string | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);

  const handleOpenChangePassword = () => {
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setChangePasswordStep(1);
    setChangePasswordError(null);
    setShowChangePasswordModal(true);
  };

  const handleCloseChangePassword = () => {
    setShowChangePasswordModal(false);
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setChangePasswordStep(1);
    setChangePasswordError(null);
  };

  const handleVerifyCurrentPassword = async () => {
    if (!currentPassword.trim()) {
      setChangePasswordError('Current password is required.');
      return;
    }
    if (!fleetId) {
      setChangePasswordError('Fleet ID is missing. Please save the fleet first.');
      return;
    }
    setIsVerifying(true);
    setChangePasswordError(null);
    try {
      const res = await fetch('/api/fleet/validate-driver-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fleetId, currentPassword }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error || 'Current password is incorrect');
      }
      setChangePasswordStep(2);
    } catch (err) {
      setChangePasswordError(err instanceof Error ? err.message : 'Current password is incorrect. Please try again.');
    } finally {
      setIsVerifying(false);
    }
  };

  const handleSaveNewPassword = () => {
    if (!newPassword.trim()) {
      setChangePasswordError('New password is required.');
      return;
    }
    const rules = {
      length: newPassword.length >= 8,
      uppercase: /[A-Z]/.test(newPassword),
      lowercase: /[a-z]/.test(newPassword),
      digit: /\d/.test(newPassword),
      special: /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(newPassword),
    };
    if (!Object.values(rules).every(Boolean)) {
      setChangePasswordError('Password must be at least 8 characters and include uppercase, lowercase, a digit, and a special character.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setChangePasswordError('Passwords do not match.');
      return;
    }
    onFormChange({ driverPassword: newPassword });
    handleCloseChangePassword();
  };

  const passwordRules = useMemo(() => {
    const p = formData.driverPassword ?? '';
    return {
      length: p.length >= 8,
      uppercase: /[A-Z]/.test(p),
      lowercase: /[a-z]/.test(p),
      digit: /\d/.test(p),
      special: /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(p),
    };
  }, [formData.driverPassword]);

  const passwordStrength = useMemo(() => {
    const { length, uppercase, lowercase, digit, special } = passwordRules;
    const types = [uppercase, lowercase, digit, special].filter(Boolean).length;
    if (!formData.driverPassword?.length) return 0;
    if (length && types >= 4) return 4; // Strong
    if (types >= 3 || (length && types >= 2)) return 3; // Good
    if (types >= 2 || length) return 2; // Fair
    return 1; // Weak
  }, [formData.driverPassword, passwordRules]);

  const isValidPassword = useMemo(
    () => Boolean(formData.driverPassword && Object.values(passwordRules).every(Boolean)),
    [formData.driverPassword, passwordRules]
  );

  const isComplete = useMemo(
    () =>
      Boolean(
        formData.driverName?.trim() &&
          formData.driverPhone?.trim() &&
          formData.driverExperience?.trim() &&
          formData.driverStatus?.trim() &&
          formData.driverUsername?.trim() &&
          (mode === 'edit' || isValidPassword)
      ),
    [formData.driverName, formData.driverPhone, formData.driverExperience, formData.driverStatus, formData.driverUsername, mode, isValidPassword]
  );

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
        <h3 className="text-lg font-semibold text-gray-900 mb-1">Register Your Driver</h3>
        <p className="text-sm text-gray-500">Make a driver account for your fleet, connecting to the Laku Driver app.</p>
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

      {/* App credentials */}
      <div>
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Laku Driver App Credentials</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Username */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-2">
              Username <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <AtSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={formData.driverUsername || ''}
                onChange={(e) => onFormChange({ driverUsername: e.target.value })}
                placeholder="e.g. andi.pratama"
                autoComplete="off"
                className="w-full pl-10 pr-4 py-2 text-black text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0a61d7] focus:border-transparent"
              />
            </div>
          </div>

          {/* Password — create mode: live editable with strength bar */}
          {mode === 'create' && (
            <div>
              <div className="flex items-center justify-between gap-3 mb-2">
                <label className="text-xs font-medium text-gray-700">
                  Password <span className="text-red-500">*</span>
                  <span className="text-[10px] text-gray-500 ml-1">
                    (min 8 chars: uppercase, lowercase, digit, special character (!@#$%^&*...))
                  </span>
                </label>
                <div className="flex items-center gap-0.5 shrink-0 ml-2" title={['', 'Weak', 'Fair', 'Good', 'Strong'][passwordStrength]}>
                  {[1, 2, 3, 4].map((i) => (
                    <div
                      key={i}
                      className={`h-1.5 w-5 rounded-sm transition-colors ${
                        i <= passwordStrength
                          ? passwordStrength <= 1 ? 'bg-red-500'
                          : passwordStrength <= 2 ? 'bg-amber-500'
                          : passwordStrength <= 3 ? 'bg-yellow-500'
                          : 'bg-emerald-500'
                          : 'bg-gray-200'
                      }`}
                    />
                  ))}
                </div>
              </div>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={formData.driverPassword || ''}
                  onChange={(e) => onFormChange({ driverPassword: e.target.value })}
                  placeholder="Set a password"
                  autoComplete="new-password"
                  className={`w-full pl-10 pr-10 py-2 text-black text-xs border rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0a61d7] focus:border-transparent ${
                    formData.driverPassword
                      ? isValidPassword ? 'border-emerald-400' : 'border-amber-400'
                      : 'border-gray-300'
                  }`}
                />
                <button type="button" onClick={() => setShowPassword((v) => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors" tabIndex={-1}>
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
          )}

          {/* Password — edit mode: disabled placeholder + Change Password button */}
          {mode === 'edit' && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-medium text-gray-700">Password</label>
                <button
                  type="button"
                  onClick={handleOpenChangePassword}
                  className="flex items-center gap-1 text-xs font-semibold text-[#0a61d7] hover:text-[#084ba6] transition-colors"
                >
                  <Key className="w-3 h-3" />
                  Change password
                </button>
              </div>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="password"
                  value="placeholder"
                  disabled
                  className="w-full pl-10 pr-4 py-2 text-gray-400 text-xs border border-gray-200 rounded-lg bg-gray-50 cursor-not-allowed"
                />
              </div>
              {formData.driverPassword && (
                <p className="mt-1 text-[10px] text-emerald-600">✓ New password staged — will be saved on submit</p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Change Password Modal (edit mode) */}
      {showChangePasswordModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4 p-4">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-base font-semibold text-gray-900 flex items-center gap-2">
                <Key className="w-5 h-5 text-gray-500" />
                Change Driver Password
              </h3>
              <button onClick={handleCloseChangePassword} className="text-gray-400 hover:text-gray-600 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Step indicator */}
            <div className="flex items-center justify-center mb-6">
              <div className="flex items-center gap-3">
                {[1, 2].map((s) => (
                  <React.Fragment key={s}>
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-colors ${changePasswordStep >= s ? 'bg-[#0a61d7] text-white' : 'bg-gray-200 text-gray-500'}`}>{s}</div>
                    {s < 2 && <div className={`w-12 h-0.5 transition-colors ${changePasswordStep >= 2 ? 'bg-[#0a61d7]' : 'bg-gray-200'}`} />}
                  </React.Fragment>
                ))}
              </div>
            </div>

            {/* Step 1 — verify current password */}
            {changePasswordStep === 1 && (
              <div className="space-y-4">
                <div>
                  <h4 className="text-sm font-medium text-gray-900 mb-2">Step 1: Verify Current Password</h4>
                  <p className="text-xs text-gray-500 mb-4">Enter the driver&apos;s current password to continue</p>
                  <div className="relative">
                    <input
                      type={showCurrentPassword ? 'text' : 'password'}
                      value={currentPassword}
                      onChange={(e) => { setCurrentPassword(e.target.value); setChangePasswordError(null); }}
                      placeholder="Enter current password"
                      autoFocus
                      className="w-full px-3 py-2 pr-10 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0a61d7] focus:border-transparent text-black"
                    />
                    <button
                      type="button"
                      onClick={() => setShowCurrentPassword((v) => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    >
                      {showCurrentPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={handleVerifyCurrentPassword}
                    disabled={isVerifying || !currentPassword.trim()}
                    className="flex items-center gap-2 px-4 py-2 bg-[#0a61d7] text-white text-xs font-semibold rounded-lg hover:bg-[#084ba6] disabled:opacity-50 transition-colors"
                  >
                    {isVerifying ? 'Verifying...' : 'Continue'}
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}

            {/* Step 2 — new password + confirm */}
            {changePasswordStep === 2 && (
              <div className="space-y-4">
                <div>
                  <h4 className="text-sm font-medium text-gray-900 mb-2">Step 2: Set New Password</h4>
                  <p className="text-xs text-gray-500 mb-4">Enter a new password and confirm it</p>
                  <div className="space-y-3">
                    <div>
                      <div className="relative">
                        <input
                          type={showNewPassword ? 'text' : 'password'}
                          value={newPassword}
                          onChange={(e) => { setNewPassword(e.target.value); setChangePasswordError(null); }}
                          placeholder="Enter new password"
                          autoFocus
                          className="w-full px-3 py-2 pr-10 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0a61d7] focus:border-transparent text-black"
                        />
                        <button
                          type="button"
                          onClick={() => setShowNewPassword((v) => !v)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                        >
                          {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                      {newPassword && (() => {
                        const s = getPasswordStrength(newPassword);
                        const c = STRENGTH_COLORS[s.color] ?? STRENGTH_COLORS.gray;
                        return (
                          <div className="mt-2">
                            <div className="flex justify-between items-center mb-1">
                              <span className="text-xs text-gray-600">Password strength</span>
                              <span className={`text-xs font-medium ${c.text}`}>{s.feedback}</span>
                            </div>
                            <div className="w-full bg-gray-200 rounded-full h-2">
                              <div className={`h-2 rounded-full transition-all duration-300 ${c.bg}`} style={{ width: `${(s.score / 5) * 100}%` }} />
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                    <div className="relative">
                      <input
                        type={showConfirmPassword ? 'text' : 'password'}
                        value={confirmPassword}
                        onChange={(e) => { setConfirmPassword(e.target.value); setChangePasswordError(null); }}
                        placeholder="Confirm new password"
                        className="w-full px-3 py-2 pr-10 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0a61d7] focus:border-transparent text-black"
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirmPassword((v) => !v)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                      >
                        {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                </div>
                <div className="flex justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => setChangePasswordStep(1)}
                    className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors text-xs font-medium"
                  >
                    Back
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveNewPassword}
                    disabled={!newPassword.trim() || !confirmPassword.trim() || newPassword !== confirmPassword}
                    className="px-4 py-2 bg-[#0a61d7] text-white text-xs font-semibold rounded-lg hover:bg-[#084ba6] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    Save Password
                  </button>
                </div>
              </div>
            )}

            {changePasswordError && (
              <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
                <span className="text-red-700 text-xs flex-1">{changePasswordError}</span>
                <button onClick={() => setChangePasswordError(null)} className="text-red-500 hover:text-red-700">
                  <X className="w-3 h-3" />
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
