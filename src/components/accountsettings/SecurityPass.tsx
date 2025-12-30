'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Shield, Key, Mail, Smartphone, Eye, EyeOff, AlertCircle, CheckCircle, X, ArrowRight } from 'lucide-react';
import { useUserStore } from '@/store/userStore';
import { getPasswordStrength } from '@/utils/auth-security';

interface SecurityData {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
  twoFactorEnabled: boolean;
  email: string;
}

export default function SecurityPass() {
  const { user, updateUser } = useUserStore();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [modalError, setModalError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  // Modal states
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [passwordStep, setPasswordStep] = useState(1); // 1: current password validation, 2: new password
  const [hasPassword, setHasPassword] = useState<boolean | null>(null);
  
  // Password visibility states
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [formData, setFormData] = useState<SecurityData>({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
    twoFactorEnabled: false,
    email: '',
  });

  const [originalData, setOriginalData] = useState<SecurityData>({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
    twoFactorEnabled: false,
    email: '',
  });

  const checkPasswordExists = async () => {
    if (!user?.id) return;
    
    try {
      const response = await fetch(`/api/user/check-password?userId=${user.id}`);
      if (response.ok) {
        const data = await response.json();
        setHasPassword(data.hasPassword);
      }
    } catch {
      setHasPassword(null);
    }
  };

  useEffect(() => {
    if (user) {
      setFormData({
        currentPassword: '',
        newPassword: '',
        confirmPassword: '',
        twoFactorEnabled: false, // This would come from user data in a real app
        email: user?.email || '',
      });
      setOriginalData({
        currentPassword: '',
        newPassword: '',
        confirmPassword: '',
        twoFactorEnabled: false,
        email: user?.email || '',
      });
      
      // Check if user has a password set
      checkPasswordExists();
    }
  }, [user]);

  const handleInputChange = (field: keyof SecurityData, value: string | boolean) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    setError(null);
  };

  // Password strength indicator component
  const PasswordStrengthIndicator = ({ password }: { password: string }) => {
    const strength = getPasswordStrength(password);
    
    return (
      <div className="mt-2">
        <div className="flex justify-between items-center mb-1">
          <span className="text-xs text-gray-600">Password strength</span>
          <span className={`text-xs font-medium text-${strength.color}-600`}>
            {strength.feedback}
          </span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-2">
          <div 
            className={`h-2 rounded-full transition-all duration-300 bg-${strength.color}-500`}
            style={{ width: `${(strength.score / 5) * 100}%` }}
          />
        </div>
      </div>
    );
  };


  const handleCurrentPasswordValidation = async () => {
    try {
      setIsLoading(true);
      setModalError(null);

      if (!formData.currentPassword.trim()) {
        setModalError('Current password is required');
        return;
      }

      // Validate current password via API
      const response = await fetch('/api/user/validate-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId: user?.id,
          currentPassword: formData.currentPassword,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Current password is incorrect');
      }

      // Move to step 2
      setPasswordStep(2);
      setModalError(null);
    } catch (err) {
      setModalError('Current password is incorrect. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handlePasswordChange = async () => {
    try {
      setIsLoading(true);
      setModalError(null);

      if (!formData.newPassword.trim()) {
        setModalError('New password is required');
        return;
      }

      if (formData.newPassword.length < 8) {
        setModalError('New password must be at least 8 characters long');
        return;
      }

      if (formData.newPassword !== formData.confirmPassword) {
        setModalError('New passwords do not match');
        return;
      }

      // Use different endpoint based on whether password exists
      const endpoint = hasPassword ? '/api/user/change-password' : '/api/user/set-password';
      const method = hasPassword ? 'PUT' : 'POST';
      const body = hasPassword 
        ? {
            userId: user?.id,
            currentPassword: formData.currentPassword,
            newPassword: formData.newPassword,
          }
        : {
            userId: user?.id,
            newPassword: formData.newPassword,
          };

      const response = await fetch(endpoint, {
        method,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to set password');
      }

      // Close modal and reset
      setShowPasswordModal(false);
      setPasswordStep(1);
      setFormData(prev => ({
        ...prev,
        currentPassword: '',
        newPassword: '',
        confirmPassword: '',
      }));

      // Update hasPassword state
      setHasPassword(true);

      setSuccess(hasPassword ? 'Password changed successfully' : 'Password created successfully');
      
      // Auto-hide success message after 3 seconds
      setTimeout(() => {
        setSuccess('');
      }, 3000);
    } catch (err) {
      setModalError(err instanceof Error ? err.message : 'Failed to set password. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleOpenPasswordModal = async () => {
    // Re-check password status when opening modal
    const response = await fetch(`/api/user/check-password?userId=${user?.id}`);
    let passwordExists = hasPassword;
    
    if (response.ok) {
      const data = await response.json();
      passwordExists = data.hasPassword;
      setHasPassword(passwordExists);
    }
    
    setShowPasswordModal(true);
    // If no password exists, skip to step 2 (create password)
    // Otherwise, start at step 1 (verify current password)
    setPasswordStep(passwordExists ? 1 : 2);
    setFormData(prev => ({
      ...prev,
      currentPassword: '',
      newPassword: '',
      confirmPassword: '',
    }));
    setModalError(null);
  };

  const handleClosePasswordModal = () => {
    setShowPasswordModal(false);
    setPasswordStep(1);
    setFormData(prev => ({
      ...prev,
      currentPassword: '',
      newPassword: '',
      confirmPassword: '',
    }));
    setModalError(null);
  };

  const handle2FAToggle = async () => {
    try {
      setIsLoading(true);
      setError(null);

      // Toggle 2FA via API
      const response = await fetch('/api/user/toggle-2fa', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId: user?.id,
          enabled: !formData.twoFactorEnabled,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to update 2FA settings');
      }

      setFormData(prev => ({ ...prev, twoFactorEnabled: !prev.twoFactorEnabled }));
      setSuccess(`2FA ${!formData.twoFactorEnabled ? 'enabled' : 'disabled'} successfully`);
      
      // Auto-hide success message after 3 seconds
      setTimeout(() => {
        setSuccess('');
      }, 3000);
    } catch (err) {
      setError('Failed to update 2FA settings. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };


  return (
    <div className="space-y-4 p-4">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Security & Password</h1>
        <p className="text-gray-600 mt-1">Manage your account security settings</p>
      </div>

      {/* Error/Success Messages */}
      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2">
          <AlertCircle className="w-5 h-5 text-red-500" />
          <span className="text-red-700 text-sm flex-1">{error}</span>
          <button
            onClick={() => setError('')}
            className="text-red-500 hover:text-red-700 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {success && (
        <div className="p-3 bg-green-50 border border-green-200 rounded-lg flex items-center gap-2">
          <CheckCircle className="w-5 h-5 text-green-500" />
          <span className="text-green-700 text-sm flex-1">{success}</span>
          <button
            onClick={() => setSuccess('')}
            className="text-green-500 hover:text-green-700 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Email & Password Section */}
      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <h2 className="text-md font-semibold text-gray-900 mb-6 flex items-center gap-2">
          <Key className="w-5 h-5 text-gray-500" />
          Account Security
        </h2>

        <div className="space-y-4">
          {/* Email Section */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-2">
              Email Address
            </label>
            <input
              type="email"
              value={formData.email}
              disabled
              className="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg bg-gray-50 text-gray-500"
              placeholder="Email address"
            />
            <p className="text-xs text-gray-500 mt-1">
              Email cannot be changed for security reasons. Contact support if you need to update your email address.
            </p>
          </div>

          {/* Password Section */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-2">
              Password
            </label>
            <div className="flex gap-3">
              <input
                type="password"
                value="••••••••"
                disabled
                className="flex-1 px-3 py-2 text-xs border border-gray-300 rounded-lg bg-gray-50 text-gray-500"
                placeholder="Your current password"
              />
              <button
                onClick={handleOpenPasswordModal}
                className="px-4 py-2 bg-[#0a61d7] text-white text-xs font-semibold rounded-lg hover:bg-[#084ba6] transition-colors flex items-center gap-2"
              >
                <Key className="w-4 h-4" />
                {hasPassword === false ? 'Create Password' : 'Change Password'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Two-Factor Authentication Section */}
      {/* <div className="bg-white rounded-lg border border-gray-200 p-4">
        <h2 className="text-md font-semibold text-gray-900 mb-6 flex items-center gap-2">
          <Smartphone className="w-5 h-5 text-gray-500" />
          Two-Factor Authentication
        </h2>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-medium text-gray-900">Enable 2FA</h3>
              <p className="text-xs text-gray-500">Add an extra layer of security to your account</p>
            </div>
            <button
              onClick={handle2FAToggle}
              disabled={isLoading}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                formData.twoFactorEnabled ? 'bg-[#0a61d7]' : 'bg-gray-200'
              } ${isLoading ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  formData.twoFactorEnabled ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>

          <div className="text-xs text-gray-500">
            {formData.twoFactorEnabled 
              ? 'Two-factor authentication is currently enabled for your account.'
              : 'Two-factor authentication is currently disabled. Enable it for enhanced security.'
            }
          </div>
        </div>
      </div> */}

      {/* Password Change Modal */}
      {showPasswordModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-4 w-full max-w-md mx-4">
            {/* Modal Header */}
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                <Key className="w-5 h-5 text-gray-500" />
                {hasPassword === false ? 'Create Password' : 'Change Password'}
              </h3>
              <button
                onClick={handleClosePasswordModal}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Step Indicator - Only show if user has password */}
            {hasPassword && (
              <div className="flex items-center justify-center mb-6">
                <div className="flex items-center space-x-4">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                    passwordStep >= 1 ? 'bg-[#0a61d7] text-white' : 'bg-gray-200 text-gray-500'
                  }`}>
                    1
                  </div>
                  <div className={`w-12 h-0.5 ${passwordStep >= 2 ? 'bg-[#0a61d7]' : 'bg-gray-200'}`}></div>
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                    passwordStep >= 2 ? 'bg-[#0a61d7] text-white' : 'bg-gray-200 text-gray-500'
                  }`}>
                    2
                  </div>
                </div>
              </div>
            )}

            {/* Step 1: Current Password Validation - Only show if user has password */}
            {passwordStep === 1 && hasPassword && (
              <div className="space-y-4">
                <div>
                  <h4 className="text-sm font-medium text-gray-900 mb-2">Step 1: Verify Current Password</h4>
                  <p className="text-xs text-gray-500 mb-4">Enter your current password to continue</p>
                  
                  <div className="relative">
                    <input
                      type={showCurrentPassword ? 'text' : 'password'}
                      value={formData.currentPassword}
                      onChange={(e) => handleInputChange('currentPassword', e.target.value)}
                      className="w-full px-3 py-2 pr-10 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0a61d7] focus:border-transparent text-black"
                      placeholder="Enter current password"
                      autoFocus
                    />
                    <button
                      type="button"
                      onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                      className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    >
                      {showCurrentPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div className="flex justify-end">
                  <button
                    onClick={handleCurrentPasswordValidation}
                    disabled={isLoading || !formData.currentPassword.trim()}
                    className="px-4 py-2 bg-[#0a61d7] text-white text-xs font-semibold rounded-lg hover:bg-[#084ba6] disabled:opacity-50 transition-colors flex items-center gap-2"
                  >
                    {isLoading ? 'Verifying...' : 'Continue'}
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}

            {/* Step 2: New Password / Create Password */}
            {passwordStep === 2 && (
              <div className="space-y-4">
                <div>
                  <h4 className="text-sm font-medium text-gray-900 mb-2">
                    {hasPassword ? 'Step 2: Set New Password' : 'Create Password'}
                  </h4>
                  <p className="text-xs text-gray-500 mb-4">
                    {hasPassword 
                      ? 'Enter your new password and confirm it'
                      : 'Create a password for your account. You can use this to login with your email and password.'
                    }
                  </p>
                  
                  <div className="space-y-3">
                    <div>
                      <div className="relative">
                        <input
                          type={showNewPassword ? 'text' : 'password'}
                          value={formData.newPassword}
                          onChange={(e) => handleInputChange('newPassword', e.target.value)}
                          className="w-full px-3 py-2 pr-10 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0a61d7] focus:border-transparent text-black"
                          placeholder="Enter new password"
                          autoFocus
                        />
                        <button
                          type="button"
                          onClick={() => setShowNewPassword(!showNewPassword)}
                          className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                        >
                          {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                      {formData.newPassword && (
                        <PasswordStrengthIndicator password={formData.newPassword} />
                      )}
                    </div>

                    <div className="relative">
                      <input
                        type={showConfirmPassword ? 'text' : 'password'}
                        value={formData.confirmPassword}
                        onChange={(e) => handleInputChange('confirmPassword', e.target.value)}
                        className="w-full px-3 py-2 pr-10 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0a61d7] focus:border-transparent text-black"
                        placeholder="Confirm new password"
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                        className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                      >
                        {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                </div>

                <div className="flex justify-end gap-3">
                  {hasPassword && (
                    <button
                      onClick={() => setPasswordStep(1)}
                      className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors text-xs font-medium"
                    >
                      Back
                    </button>
                  )}
                  <button
                    onClick={handlePasswordChange}
                    disabled={isLoading || !formData.newPassword.trim() || !formData.confirmPassword.trim() || formData.newPassword !== formData.confirmPassword}
                    className="px-4 py-2 bg-[#0a61d7] text-white text-xs font-semibold rounded-lg hover:bg-[#084ba6] disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
                  >
                    {isLoading 
                      ? (hasPassword ? 'Saving...' : 'Creating...') 
                      : (hasPassword ? 'Save Password' : 'Create Password')
                    }
                  </button>
                </div>
              </div>
            )}

            {/* Error Message in Modal */}
            {modalError && (
              <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-red-500" />
                <span className="text-red-700 text-xs flex-1">{modalError}</span>
                <button
                  onClick={() => setModalError('')}
                  className="text-red-500 hover:text-red-700 transition-colors"
                >
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
