'use client';

import React, { useState, useRef, useEffect } from 'react';
import { User, Upload, X, Edit3, Save, AlertCircle, CheckCircle } from 'lucide-react';
import { useUserStore } from '@/store/userStore';
import { uploadToCloudinaryDirect } from '@/utils/cloudinaryDirect';

interface GeneralInfoData {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  bio: string;
  location: string;
  avatar: string | null;
}

export default function GeneralInfo() {
  const { user, updateUser } = useUserStore();
  const [isEditing, setIsEditing] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Initialize formData from user prop using initializer function (not useEffect)
  const [formData, setFormData] = useState<GeneralInfoData>(() => {
    if (!user) {
      return {
        firstName: '',
        lastName: '',
        email: '',
        phone: '',
        bio: '',
        location: '',
        avatar: null,
      };
    }
    // Check if avatar is a blob URL (temporary) and treat as null
    const avatar = user?.avatar && !user.avatar.startsWith('blob:') ? user.avatar : null;
    
    return {
      firstName: user?.firstName || '',
      lastName: user?.lastName || '',
      email: user?.email || '',
      phone: user?.phone || '',
      bio: user?.bio || '',
      location: user?.location || '',
      avatar: avatar,
    };
  });

  const [originalData, setOriginalData] = useState<GeneralInfoData>(formData);

  // Sync formData when user changes (using key prop would reset component, but we want to sync)
  useEffect(() => {
    if (user) {
      // Check if avatar is a blob URL (temporary) and treat as null
      const avatar = user?.avatar && !user.avatar.startsWith('blob:') ? user.avatar : null;
      
      const newFormData = {
        firstName: user?.firstName || '',
        lastName: user?.lastName || '',
        email: user?.email || '',
        phone: user?.phone || '',
        bio: user?.bio || '',
        location: user?.location || '',
        avatar: avatar,
      };
      
      setFormData(newFormData);
      setOriginalData(newFormData);
    }
  }, [user]);

  const handleInputChange = (field: keyof GeneralInfoData, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    setError(null);
  };

  const handleFileUpload = async (file: File) => {
    if (!file) return;

    // Validate file size (2MB limit)
    if (file.size > 2 * 1024 * 1024) {
      setError('File size must be under 2MB');
      return;
    }

    // Validate file type
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      setError('Please upload a valid image file (PNG, JPEG, GIF, or WebP)');
      return;
    }

    try {
      setIsLoading(true);
      setError(null);

      // Direct upload to Cloudinary (faster, no base64 conversion)
      const result = await uploadToCloudinaryDirect(file, 'users/avatars');

      if (result.success && result.url) {
        setFormData(prev => ({ ...prev, avatar: result.url || null }));
      } else {
        throw new Error(result.error || 'Upload failed');
      }

      setIsLoading(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to process image. Please try again.');
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      setIsLoading(true);
      setError(null);

      // Enhanced validation
      const validationErrors: string[] = [];

      // Required fields validation
      if (!formData.firstName.trim()) {
        validationErrors.push('First name is required');
      } else if (formData.firstName.trim().length < 2) {
        validationErrors.push('First name must be at least 2 characters');
      }

      if (!formData.lastName.trim()) {
        validationErrors.push('Last name is required');
      } else if (formData.lastName.trim().length < 2) {
        validationErrors.push('Last name must be at least 2 characters');
      }

      if (!formData.email.trim()) {
        validationErrors.push('Email is required');
      } else {
        // Enhanced email validation
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(formData.email.trim())) {
          validationErrors.push('Please enter a valid email address');
        } else if (formData.email.trim().length > 500) {
          validationErrors.push('Email must be less than 500 characters');
        }
      }

      // Phone validation (optional but if provided, must be valid)
      if (formData.phone.trim() && formData.phone.trim().length > 0) {
        const phoneRegex = /^[\+]?[0-9\s\-\(\)]{8,20}$/;
        if (!phoneRegex.test(formData.phone.trim())) {
          validationErrors.push('Please enter a valid phone number');
        }
      }

      // Bio validation (optional but if provided, must be reasonable length)
      if (formData.bio.trim() && formData.bio.trim().length > 500) {
        validationErrors.push('Bio must be less than 500 characters');
      }

      // Location validation removed - no character limit

      // XSS prevention
      const xssPattern = /<[^>]*>|javascript:|on\w+\s*=/i;
      if (xssPattern.test(formData.firstName) || xssPattern.test(formData.lastName) || 
          xssPattern.test(formData.bio) || xssPattern.test(formData.location)) {
        validationErrors.push('Invalid characters detected in input fields');
      }

      if (validationErrors.length > 0) {
        setError(validationErrors.join('. '));
        return;
      }

      // Save to database
      const response = await fetch('/api/user/update', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId: user?.id,
          firstName: formData.firstName.trim(),
          lastName: formData.lastName.trim(),
          email: formData.email.trim(),
          phone: formData.phone.trim(),
          bio: formData.bio.trim(),
          location: formData.location.trim(),
          avatar: formData.avatar
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to save profile');
      }

      const updatedUser = await response.json();
      
      // Update user data in store
      updateUser(updatedUser);
      setOriginalData(formData);
      setIsEditing(false);
      setSuccess('Your profile has been saved');
      
      // Auto-hide success message after 3 seconds
      setTimeout(() => {
        setSuccess('');
      }, 3000);
    } catch (err) {
      setError('Failed to update profile. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCancel = () => {
    setFormData(originalData);
    setIsEditing(false);
    setError(null);
    setSuccess(null);
  };

  const hasChanges = JSON.stringify(formData) !== JSON.stringify(originalData);

  return (
    <div className="w-full p-4">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-black mb-2">General Information</h1>
          <p className="text-sm text-gray-600">Manage your personal information and profile details</p>
        </div>
        
        {!isEditing ? (
          <button
            onClick={() => setIsEditing(true)}
            className="px-4 py-2 bg-[#0a61d7] text-white text-sm font-semibold rounded-lg hover:bg-[#084ba6] flex items-center gap-2 transition-colors"
          >
            <Edit3 className="w-4 h-4" />
            Edit
          </button>
        ) : (
          <div className="flex gap-2">
            <button
              onClick={handleSave}
              disabled={isLoading || !hasChanges}
              className="px-4 py-2 bg-green-600 text-white text-sm font-semibold rounded-lg hover:bg-green-700 flex items-center gap-2 transition-colors disabled:opacity-50"
            >
              <Save className="w-4 h-4" />
              {isLoading ? 'Saving...' : 'Save'}
            </button>
            <button
              onClick={handleCancel}
              className="px-4 py-2 bg-white border border-gray-200 text-black text-sm font-medium rounded-lg hover:bg-gray-200 transition-colors"
            >
              Cancel
            </button>
          </div>
        )}
      </div>

      {/* Error/Success Messages */}
      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2">
          <AlertCircle className="w-5 h-5 text-red-500" />
          <span className="text-red-700 text-sm">{error}</span>
        </div>
      )}

      {success && (
        <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg flex items-center gap-2">
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

      {/* Personal Information Section */}
      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <h2 className="text-md font-semibold text-gray-900 mb-6 flex items-center gap-2">
          <User className="w-5 h-5 text-gray-500" />
          Personal Information
        </h2>

        <div className="space-y-6">
          {/* Profile Picture Section */}
          <div className="flex flex-col items-center">
            <div className="w-24 h-24 rounded-full bg-gray-100 border-2 border-gray-200 flex items-center justify-center overflow-hidden mb-4">
              {formData.avatar ? (
                <img 
                  src={formData.avatar} 
                  alt="Profile" 
                  className="w-full h-full object-cover" 
                />
              ) : (
                <User className="w-12 h-12 text-gray-400" />
              )}
            </div>
            
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isLoading || !isEditing}
                className={`px-4 py-2 text-white text-xs font-semibold rounded-lg flex items-center gap-2 transition-colors ${
                  isEditing 
                    ? 'bg-[#0a61d7] hover:bg-[#084ba6] disabled:opacity-50' 
                    : 'bg-gray-400 cursor-not-allowed'
                }`}
              >
                <Upload className="w-4 h-4" />
                {isLoading ? 'Uploading...' : 'Change Image'}
              </button>
              
              {formData.avatar && isEditing && (
                <button
                  type="button"
                  onClick={() => setFormData(prev => ({ ...prev, avatar: null }))}
                  className="px-4 py-2 bg-gray-500 text-white text-xs font-semibold rounded-lg hover:bg-gray-600 flex items-center gap-2 transition-colors"
                >
                  <X className="w-4 h-4" />
                  Remove
                </button>
              )}
            </div>
            
            <p className="text-xs text-gray-500 mt-2 text-center">
              We support PNGs, JPEGs and GIFs under 2MB
            </p>
            
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              disabled={!isEditing}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file && isEditing) handleFileUpload(file);
              }}
            />
          </div>

          {/* Form Fields */}
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-2">
                  First Name *
                </label>
                <input
                  type="text"
                  value={formData.firstName}
                  onChange={(e) => handleInputChange('firstName', e.target.value)}
                  disabled={!isEditing}
                  className="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0a61d7] focus:border-transparent disabled:bg-gray-50 text-black"
                  placeholder="Enter your first name"
                />
              </div>
              
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-2">
                  Last Name *
                </label>
                <input
                  type="text"
                  value={formData.lastName}
                  onChange={(e) => handleInputChange('lastName', e.target.value)}
                  disabled={!isEditing}
                  className="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0a61d7] focus:border-transparent disabled:bg-gray-50 text-black"
                  placeholder="Enter your last name"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-2">
                Email Address *
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

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-2">
                Phone Number
              </label>
              <input
                type="tel"
                value={formData.phone}
                onChange={(e) => handleInputChange('phone', e.target.value)}
                disabled={!isEditing}
                className="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0a61d7] focus:border-transparent disabled:bg-gray-50 text-black"
                placeholder="Enter your phone number"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-2">
                Bio
              </label>
              <textarea
                value={formData.bio}
                onChange={(e) => handleInputChange('bio', e.target.value)}
                disabled={!isEditing}
                rows={3}
                className="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0a61d7] focus:border-transparent disabled:bg-gray-50 text-black resize-none"
                placeholder="Tell us about yourself"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-2">
                Location
              </label>
              <input
                type="text"
                value={formData.location}
                onChange={(e) => handleInputChange('location', e.target.value)}
                disabled={!isEditing}
                className="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0a61d7] focus:border-transparent disabled:bg-gray-50 text-black"
                placeholder="Enter your location"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
