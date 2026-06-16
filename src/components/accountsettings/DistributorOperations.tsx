'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Building2, Upload, X, Edit3, Save, AlertCircle, CheckCircle, MapPin, Phone, Mail, Shield, Clock, Truck, ChevronDown, CreditCard } from 'lucide-react';
import { useUserStore } from '@/store/userStore';
import { uploadToCloudinaryDirect } from '@/utils/cloudinaryDirect';
import { generateSlug } from '@/utils/slugUtils';

interface CompanyProfileData {
  // Company Information
  companyName: string;
  businessRegistrationNumber: string;
  taxId: string;
  companyLogo: string | null;
  companyBanner: string | null;
  
  // Business Details
  industryType: string;
  businessDescription: string;
  yearsInOperation: string;
  companySize: string;
  
  // Contact Information
  businessAddress: string;
  businessPhone: string;
  businessEmail: string;
  
  // Verification Status
  documentVerification: boolean;
  businessLicenseVerification: boolean;
  complianceStatus: string;
  
  // Shipping and Delivery Preferences
  shippingPreferences: string[];
  deliveryTimeSlots: string[];
  preferredDeliveryDays: string[];
  specialInstructions: string;
  pickupAddress: string;
  defaultDeliveryLeadTimeMinDays: number | '';
  defaultDeliveryLeadTimeMaxDays: number | '';
  buyerPaymentTermDays: number | '';
}

const industryTypes = [
  'Retail & E-commerce',
  'Manufacturing',
  'Wholesale & Distribution',
  'Food & Beverage',
  'Fashion & Apparel',
  'Electronics',
  'Health & Beauty',
  'Home & Garden',
  'Automotive',
  'Other'
];

const companySizes = [
  '1-10 employees',
  '11-50 employees',
  '51-200 employees',
  '201-500 employees',
  '500+ employees'
];

const deliveryTimeSlots = [
  'Morning (8:00 AM - 12:00 PM)',
  'Afternoon (12:00 PM - 5:00 PM)',
  'Evening (5:00 PM - 8:00 PM)',
  'Flexible'
];

const deliveryDays = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday'
];

const ALL_SHIPPING_OPTIONS = [
  'Self Pickup',
  'Seller/Distributor Delivery',
  'Buyer-arranged Courier',
];

export default function DistributorOperations() {
  const { user, updateUser } = useUserStore();
  const [isEditing, setIsEditing] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const bannerInputRef = useRef<HTMLInputElement>(null);

  const [formData, setFormData] = useState<CompanyProfileData>({
    companyName: '',
    businessRegistrationNumber: '',
    taxId: '',
    companyLogo: null,
    companyBanner: null,
    industryType: '',
    businessDescription: '',
    yearsInOperation: '',
    companySize: '',
    businessAddress: '',
    businessPhone: '',
    businessEmail: '',
    documentVerification: false,
    businessLicenseVerification: false,
    complianceStatus: 'Pending',
    shippingPreferences: [],
    deliveryTimeSlots: [],
    preferredDeliveryDays: [],
    specialInstructions: '',
    pickupAddress: '',
    defaultDeliveryLeadTimeMinDays: '',
    defaultDeliveryLeadTimeMaxDays: '',
    buyerPaymentTermDays: '',
  });

  const [originalData, setOriginalData] = useState<CompanyProfileData>({
    companyName: '',
    businessRegistrationNumber: '',
    taxId: '',
    companyLogo: null,
    companyBanner: null,
    industryType: '',
    businessDescription: '',
    yearsInOperation: '',
    companySize: '',
    businessAddress: '',
    businessPhone: '',
    businessEmail: '',
    documentVerification: false,
    businessLicenseVerification: false,
    complianceStatus: 'Pending',
    shippingPreferences: [],
    deliveryTimeSlots: [],
    preferredDeliveryDays: [],
    specialInstructions: '',
    pickupAddress: '',
    defaultDeliveryLeadTimeMinDays: '',
    defaultDeliveryLeadTimeMaxDays: '',
    buyerPaymentTermDays: '',
  });
  
  // Dropdown states
  const [showIndustryDropdown, setShowIndustryDropdown] = useState(false);
  const [showCompanySizeDropdown, setShowCompanySizeDropdown] = useState(false);


  useEffect(() => {
    if (user) {
      const company = user?.company;
      // Check if logo is a blob URL (temporary) and treat as null
      const logo = company?.logo && !company.logo.startsWith('blob:') ? company.logo : null;
      
      setFormData({
        companyName: company?.name || '',
        businessRegistrationNumber: company?.businessRegistrationNumber || '',
        taxId: company?.taxId || '',
        companyLogo: logo,
        companyBanner: company?.bannerImage && !company.bannerImage.startsWith('blob:') ? company.bannerImage : null,
        industryType: company?.industryType || '',
        businessDescription: company?.businessDescription || '',
        yearsInOperation: company?.yearsInOperation || '',
        companySize: company?.companySize || '',
        businessAddress: company?.businessAddress || '',
        businessPhone: company?.businessPhone || '',
        businessEmail: company?.businessEmail || '',
        documentVerification: company?.documentVerification || false,
        businessLicenseVerification: company?.businessLicenseVerification || false,
        complianceStatus: company?.complianceStatus || 'Pending',
        shippingPreferences: company?.shippingPreferences ? JSON.parse(company.shippingPreferences) : [],
        deliveryTimeSlots: company?.deliveryTimeSlots ? JSON.parse(company.deliveryTimeSlots) : [],
        preferredDeliveryDays: company?.preferredDeliveryDays ? JSON.parse(company.preferredDeliveryDays) : [],
        specialInstructions: company?.specialInstructions || '',
        pickupAddress: (company as { pickupAddress?: string })?.pickupAddress || '',
        defaultDeliveryLeadTimeMinDays: (company as { defaultDeliveryLeadTimeMinDays?: number | null })?.defaultDeliveryLeadTimeMinDays ?? '',
        defaultDeliveryLeadTimeMaxDays: (company as { defaultDeliveryLeadTimeMaxDays?: number | null })?.defaultDeliveryLeadTimeMaxDays ?? '',
        buyerPaymentTermDays: (company as { buyerPaymentTermDays?: number | null })?.buyerPaymentTermDays ?? '',
      });
      setOriginalData({
        companyName: company?.name || '',
        businessRegistrationNumber: company?.businessRegistrationNumber || '',
        taxId: company?.taxId || '',
        companyLogo: company?.logo || null,
        companyBanner: company?.bannerImage || null,
        industryType: company?.industryType || '',
        businessDescription: company?.businessDescription || '',
        yearsInOperation: company?.yearsInOperation || '',
        companySize: company?.companySize || '',
        businessAddress: company?.businessAddress || '',
        businessPhone: company?.businessPhone || '',
        businessEmail: company?.businessEmail || '',
        documentVerification: company?.documentVerification || false,
        businessLicenseVerification: company?.businessLicenseVerification || false,
        complianceStatus: company?.complianceStatus || 'Pending',
        shippingPreferences: company?.shippingPreferences ? JSON.parse(company.shippingPreferences) : [],
        deliveryTimeSlots: company?.deliveryTimeSlots ? JSON.parse(company.deliveryTimeSlots) : [],
        preferredDeliveryDays: company?.preferredDeliveryDays ? JSON.parse(company.preferredDeliveryDays) : [],
        specialInstructions: company?.specialInstructions || '',
        pickupAddress: (company as { pickupAddress?: string })?.pickupAddress || '',
        defaultDeliveryLeadTimeMinDays: (company as { defaultDeliveryLeadTimeMinDays?: number | null })?.defaultDeliveryLeadTimeMinDays ?? '',
        defaultDeliveryLeadTimeMaxDays: (company as { defaultDeliveryLeadTimeMaxDays?: number | null })?.defaultDeliveryLeadTimeMaxDays ?? '',
        buyerPaymentTermDays: (company as { buyerPaymentTermDays?: number | null })?.buyerPaymentTermDays ?? '',
      });
    }
  }, [user]);

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Element;
      if (!target.closest('.dropdown-container')) {
        setShowIndustryDropdown(false);
        setShowCompanySizeDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const handleInputChange = (field: keyof CompanyProfileData, value: string | boolean | string[] | number) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    setError(null);
  };

  // Dropdown toggle functions
  const handleDropdownToggle = (dropdownType: 'industry' | 'companySize') => {
    if (dropdownType === 'industry') {
      setShowIndustryDropdown(v => !v);
      setShowCompanySizeDropdown(false);
    } else {
      setShowCompanySizeDropdown(v => !v);
      setShowIndustryDropdown(false);
    }
  };

  const handleFileUpload = async (file: File) => {
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      setError('File size must be under 2MB');
      return;
    }

    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      setError('Please upload a valid image file (PNG, JPEG, GIF, or WebP)');
      return;
    }

    try {
      setIsLoading(true);
      setError(null);

      // Direct upload to Cloudinary (faster, no base64 conversion)
      const result = await uploadToCloudinaryDirect(file, 'company/logos');

      if (result.success && result.url) {
        setFormData(prev => ({ ...prev, companyLogo: result.url || null }));
      } else {
        throw new Error(result.error || 'Upload failed');
      }

      setIsLoading(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to process image. Please try again.');
      setIsLoading(false);
    }
  };

  const handleBannerUpload = async (file: File) => {
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      setError('File size must be under 2MB');
      return;
    }

    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      setError('Please upload a valid image file (PNG, JPEG, GIF, or WebP)');
      return;
    }

    try {
      setIsLoading(true);
      setError(null);

      // Direct upload to Cloudinary (faster, no base64 conversion)
      const result = await uploadToCloudinaryDirect(file, 'company/banners');

      if (result.success && result.url) {
        setFormData(prev => ({ ...prev, companyBanner: result.url || null }));
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

      // Company name validation
      if (!formData.companyName.trim()) {
        validationErrors.push('Company name is required');
      } else if (formData.companyName.trim().length < 2) {
        validationErrors.push('Company name must be at least 2 characters');
      } else if (formData.companyName.trim().length > 100) {
        validationErrors.push('Company name must be less than 100 characters');
      }

      // Business address validation
      if (!formData.businessAddress.trim()) {
        validationErrors.push('Business address is required');
      } else if (formData.businessAddress.trim().length < 10) {
        validationErrors.push('Business address must be at least 10 characters');
      } else if (formData.businessAddress.trim().length > 500) {
        validationErrors.push('Business address must be less than 500 characters');
      }

      // Business phone validation
      if (formData.businessPhone.trim()) {
        const phoneRegex = /^[\+]?[0-9\s\-\(\)]{8,20}$/;
        if (!phoneRegex.test(formData.businessPhone.trim())) {
          validationErrors.push('Please enter a valid business phone number');
        }
      }

      // Business email validation
      if (formData.businessEmail.trim()) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(formData.businessEmail.trim())) {
          validationErrors.push('Please enter a valid business email address');
        } else if (formData.businessEmail.trim().length > 254) {
          validationErrors.push('Business email must be less than 254 characters');
        }
      }

      // Business description validation
      if (formData.businessDescription.trim() && formData.businessDescription.trim().length > 1000) {
        validationErrors.push('Business description must be less than 1000 characters');
      }

      // Special instructions validation
      if (formData.specialInstructions.trim() && formData.specialInstructions.trim().length > 500) {
        validationErrors.push('Special instructions must be less than 500 characters');
      }

      // Pickup address validation
      if (formData.shippingPreferences.includes('Self Pickup') && formData.pickupAddress.trim()) {
        if (formData.pickupAddress.trim().length < 10) {
          validationErrors.push('Pickup address must be at least 10 characters');
        } else if (formData.pickupAddress.trim().length > 500) {
          validationErrors.push('Pickup address must be less than 500 characters');
        }
      }

      // XSS prevention
      const xssPattern = /<[^>]*>|javascript:|on\w+\s*=/i;
      if (xssPattern.test(formData.companyName) || xssPattern.test(formData.businessDescription) || 
          xssPattern.test(formData.specialInstructions) || xssPattern.test(formData.pickupAddress)) {
        validationErrors.push('Invalid characters detected in input fields');
      }

      // Delivery lead time validation
      const MIN_DAYS = 0;
      const MAX_DAYS = 90;
      const parseDaysField = (val: number | ''): number | null => {
        if (val === '') return null;
        const n = Number(val);
        if (!Number.isFinite(n)) return null;
        return n;
      };
      const validateDaysPair = (
        label: string,
        minRaw: number | '',
        maxRaw: number | ''
      ): void => {
        const minVal = parseDaysField(minRaw);
        const maxVal = parseDaysField(maxRaw);
        if (minVal != null) {
          if (!Number.isInteger(minVal) || minVal < MIN_DAYS || minVal > MAX_DAYS) {
            validationErrors.push(`${label}: min days must be an integer between ${MIN_DAYS} and ${MAX_DAYS}`);
          }
        }
        if (maxVal != null) {
          if (!Number.isInteger(maxVal) || maxVal < MIN_DAYS || maxVal > MAX_DAYS) {
            validationErrors.push(`${label}: max days must be an integer between ${MIN_DAYS} and ${MAX_DAYS}`);
          }
        }
        if (minVal != null && maxVal != null && minVal > maxVal) {
          validationErrors.push(`${label}: min days cannot be greater than max days`);
        }
      };
      validateDaysPair('Default delivery lead time', formData.defaultDeliveryLeadTimeMinDays, formData.defaultDeliveryLeadTimeMaxDays);

      if (formData.buyerPaymentTermDays !== '') {
        const termDays = Number(formData.buyerPaymentTermDays);
        if (!Number.isInteger(termDays) || termDays < 1) {
          validationErrors.push('Payment term must be a whole number of days (1 or more), or left empty');
        }
      }

      if (validationErrors.length > 0) {
        setError(validationErrors.join('. '));
        setIsLoading(false);
        return;
      }

      // Check if user has a company, if not create one
      let companyId = user?.company?.id;
      
      if (!companyId) {
        // Create a new company for the user
        const createCompanyResponse = await fetch('/api/company/create', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            userId: user?.id,
            name: formData.companyName.trim(),
            businessAddress: formData.businessAddress.trim(),
          }),
        });

        if (!createCompanyResponse.ok) {
          const errorData = await createCompanyResponse.json();
          setError('Failed to create company. Please try again.');
          return;
        }

        const newCompany = await createCompanyResponse.json();
        companyId = newCompany.id;
        
        // Update user with new company
        const updatedUser = {
          ...user,
          company: newCompany,
          companyId: newCompany.id,
        };
        updateUser(updatedUser);
      }

      // Save company data to database
      const companyData = {
        companyId: companyId,
        name: formData.companyName.trim(),
        businessRegistrationNumber: formData.businessRegistrationNumber.trim(),
        taxId: formData.taxId.trim(),
        logo: formData.companyLogo,
        bannerImage: formData.companyBanner,
        industryType: formData.industryType,
        businessDescription: formData.businessDescription.trim(),
        yearsInOperation: formData.yearsInOperation.trim(),
        companySize: formData.companySize,
        businessAddress: formData.businessAddress.trim(),
        businessPhone: formData.businessPhone.trim(),
        businessEmail: formData.businessEmail.trim(),
        shippingPreferences: formData.shippingPreferences,
        deliveryTimeSlots: formData.deliveryTimeSlots,
        preferredDeliveryDays: formData.preferredDeliveryDays,
        specialInstructions: formData.specialInstructions.trim(),
        pickupAddress: formData.shippingPreferences.includes('Self Pickup') ? (formData.pickupAddress?.trim() || null) : null,
        defaultDeliveryLeadTimeMinDays: formData.defaultDeliveryLeadTimeMinDays === '' ? null : Number(formData.defaultDeliveryLeadTimeMinDays),
        defaultDeliveryLeadTimeMaxDays: formData.defaultDeliveryLeadTimeMaxDays === '' ? null : Number(formData.defaultDeliveryLeadTimeMaxDays),
        buyerPaymentTermDays: formData.buyerPaymentTermDays === '' ? null : Number(formData.buyerPaymentTermDays),
      };


      const response = await fetch('/api/company/update', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(companyData),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to save company profile');
      }

      const updatedCompany = await response.json();

      // Update user with company data
      const updatedUser = {
        ...user,
        company: updatedCompany,
      };

      updateUser(updatedUser);
      setOriginalData(formData);
      setIsEditing(false);
      setSuccess('Your company profile has been saved');
      
      // Auto-hide success message after 3 seconds
      setTimeout(() => {
        setSuccess('');
      }, 3000);
    } catch (err) {
      setError('Failed to update company profile. Please try again.');
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
          <h1 className="text-2xl font-bold text-black mb-2">Distributor Operations</h1>
          <p className="text-sm text-gray-600">Manage your distributor operations and business details</p>
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

      {/* Company Profile Section */}
      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <h2 className="text-md font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <Building2 className="w-5 h-5 text-gray-500" />
          Company Information
        </h2>

        <div className="space-y-4">
          {/* Company Logo Section */}
          <div className="flex flex-col items-center">
            <div className="w-24 h-24 rounded-lg bg-gray-100 border-2 border-gray-200 flex items-center justify-center overflow-hidden mb-4">
              {formData.companyLogo ? (
                <img 
                  src={formData.companyLogo} 
                  alt="Company Logo" 
                  className="w-full h-full object-cover" 
                />
              ) : (
                <Building2 className="w-12 h-12 text-gray-400" />
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
                {isLoading ? 'Uploading...' : 'Upload Logo'}
              </button>
              
              {formData.companyLogo && isEditing && (
                <button
                  type="button"
                  onClick={() => setFormData(prev => ({ ...prev, companyLogo: null }))}
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

          {/* Company Banner Section */}
          <div className="flex flex-col items-center">
            <div className="w-full h-32 rounded-lg bg-gray-100 border-2 border-gray-200 flex items-center justify-center overflow-hidden mb-4">
              {formData.companyBanner ? (
                <img 
                  src={formData.companyBanner} 
                  alt="Company Banner" 
                  className="w-full h-full object-cover" 
                />
              ) : (
                <div className="text-center">
                  <Building2 className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                  <p className="text-xs text-gray-500">Company Banner</p>
                </div>
              )}
            </div>
            
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => bannerInputRef.current?.click()}
                disabled={isLoading || !isEditing}
                className={`px-4 py-2 text-white text-xs font-semibold rounded-lg flex items-center gap-2 transition-colors ${
                  isEditing 
                    ? 'bg-[#0a61d7] hover:bg-[#084ba6] disabled:opacity-50' 
                    : 'bg-gray-400 cursor-not-allowed'
                }`}
              >
                <Upload className="w-4 h-4" />
                {isLoading ? 'Uploading...' : 'Upload Banner'}
              </button>
              
              {formData.companyBanner && isEditing && (
                <button
                  type="button"
                  onClick={() => setFormData(prev => ({ ...prev, companyBanner: null }))}
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
              ref={bannerInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              disabled={!isEditing}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file && isEditing) handleBannerUpload(file);
              }}
            />
          </div>

          {/* Form Fields */}
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-2">
                  Company Name *
                </label>
                <input
                  type="text"
                  value={formData.companyName}
                  onChange={(e) => handleInputChange('companyName', e.target.value)}
                  disabled={!isEditing}
                  className="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0a61d7] focus:border-transparent disabled:bg-gray-50 text-black"
                  placeholder="Enter your company name"
                />
              </div>
              
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-2">
                  Business Registration Number
                </label>
                <input
                  type="text"
                  value={formData.businessRegistrationNumber}
                  onChange={(e) => handleInputChange('businessRegistrationNumber', e.target.value)}
                  disabled={!isEditing}
                  className="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0a61d7] focus:border-transparent disabled:bg-gray-50 text-black"
                  placeholder="Enter registration number"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Generated Store URL
              </label>
              <p className="text-[11px] text-gray-500 mb-2">
                This is the public URL of your marketplace store, generated from your company name.
              </p>
              <div className="w-full px-3 py-2 text-xs border border-gray-200 rounded-lg bg-gray-50 text-[#0a61d7] font-semibold break-all">
                laku.marketplace/{generateSlug(formData.companyName || 'Your Store Name') || 'your-store'}
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-2">
                Tax ID
              </label>
              <input
                type="text"
                value={formData.taxId}
                onChange={(e) => handleInputChange('taxId', e.target.value)}
                disabled={!isEditing}
                className="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0a61d7] focus:border-transparent disabled:bg-gray-50 text-black"
                placeholder="Enter tax ID"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-2">
                  Industry Type
                </label>
                <div className="relative dropdown-container">
                  <button
                    type="button"
                    className="w-full px-3 py-2 text-xs border border-[#e6e6e6] rounded-lg bg-white text-gray-700 hover:bg-gray-100 transition-colors focus:outline-none focus:ring-2 focus:ring-[#0a61d7] disabled:bg-gray-50 disabled:cursor-not-allowed flex items-center justify-between"
                    onClick={() => isEditing && handleDropdownToggle('industry')}
                    disabled={!isEditing}
                  >
                    <span className={formData.industryType ? 'text-black' : 'text-gray-500'}>
                      {formData.industryType || 'Select industry type'}
                    </span>
                    <ChevronDown className="w-4 h-4 text-gray-500" />
                  </button>
                  {showIndustryDropdown && isEditing && (
                    <div className="absolute right-0 mt-2 w-full bg-white border border-gray-200 rounded-lg shadow z-20">
                      {industryTypes.map(type => (
                        <button
                          key={type}
                          type="button"
                          onClick={() => {
                            handleInputChange('industryType', type);
                            setShowIndustryDropdown(false);
                          }}
                          className={`w-full text-left px-4 py-2 text-xs hover:bg-gray-100 transition-colors ${
                            formData.industryType === type ? 'font-bold text-[#0a61d7]' : 'text-gray-700'
                          }`}
                        >
                          {type}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-2">
                  Company Size
                </label>
                <div className="relative dropdown-container">
                  <button
                    type="button"
                    className="w-full px-3 py-2 text-xs border border-[#e6e6e6] rounded-lg bg-white text-gray-700 hover:bg-gray-100 transition-colors focus:outline-none focus:ring-2 focus:ring-[#0a61d7] disabled:bg-gray-50 disabled:cursor-not-allowed flex items-center justify-between"
                    onClick={() => isEditing && handleDropdownToggle('companySize')}
                    disabled={!isEditing}
                  >
                    <span className={formData.companySize ? 'text-black' : 'text-gray-500'}>
                      {formData.companySize || 'Select company size'}
                    </span>
                    <ChevronDown className="w-4 h-4 text-gray-500" />
                  </button>
                  {showCompanySizeDropdown && isEditing && (
                    <div className="absolute right-0 mt-2 w-full bg-white border border-gray-200 rounded-lg shadow z-20">
                      {companySizes.map(size => (
                        <button
                          key={size}
                          type="button"
                          onClick={() => {
                            handleInputChange('companySize', size);
                            setShowCompanySizeDropdown(false);
                          }}
                          className={`w-full text-left px-4 py-2 text-xs hover:bg-gray-100 transition-colors ${
                            formData.companySize === size ? 'font-bold text-[#0a61d7]' : 'text-gray-700'
                          }`}
                        >
                          {size}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-2">
                Business Description
              </label>
              <textarea
                value={formData.businessDescription}
                onChange={(e) => handleInputChange('businessDescription', e.target.value)}
                disabled={!isEditing}
                rows={3}
                className="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0a61d7] focus:border-transparent disabled:bg-gray-50 text-black resize-none"
                placeholder="Describe your business"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-2">
                Years in Operation
              </label>
              <input
                type="text"
                value={formData.yearsInOperation}
                onChange={(e) => handleInputChange('yearsInOperation', e.target.value)}
                disabled={!isEditing}
                className="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0a61d7] focus:border-transparent disabled:bg-gray-50 text-black"
                placeholder="e.g., 5 years"
              />
            </div>

            {/* Contact Information */}
            <div className="border-t border-gray-200 pt-6">
              <h3 className="text-sm font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <Phone className="w-4 h-4 text-gray-500" />
                Contact Information
              </h3>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-2">
                    Business Address
                  </label>
                  <div className="flex gap-2">
                    <MapPin className="w-4 h-4 text-gray-400 mt-3" />
                    <textarea
                      value={formData.businessAddress}
                      onChange={(e) => handleInputChange('businessAddress', e.target.value)}
                      disabled={!isEditing}
                      rows={2}
                      className="flex-1 px-3 py-2 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0a61d7] focus:border-transparent disabled:bg-gray-50 text-black resize-none"
                      placeholder="Enter business address"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-2">
                      Business Phone
                    </label>
                    <div className="flex gap-2">
                      <Phone className="w-4 h-4 text-gray-400 mt-3" />
                      <input
                        type="tel"
                        value={formData.businessPhone}
                        onChange={(e) => handleInputChange('businessPhone', e.target.value)}
                        disabled={!isEditing}
                        className="flex-1 px-3 py-2 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0a61d7] focus:border-transparent disabled:bg-gray-50 text-black"
                        placeholder="Enter business phone"
                      />
                    </div>
                  </div>
                  
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-2">
                      Business Email
                    </label>
                    <div className="flex gap-2">
                      <Mail className="w-4 h-4 text-gray-400 mt-3" />
                      <input
                        type="email"
                        value={formData.businessEmail}
                        onChange={(e) => handleInputChange('businessEmail', e.target.value)}
                        disabled={!isEditing}
                        className="flex-1 px-3 py-2 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0a61d7] focus:border-transparent disabled:bg-gray-50 text-black"
                        placeholder="Enter business email"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Shipping and Delivery Preferences */}
      <div className="bg-white rounded-lg border border-gray-200 p-4 mt-4">
        <h2 className="text-md font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <Truck className="w-5 h-5 text-gray-500" />
          Shipping & Delivery Configurations
        </h2>
        
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Shipping Options
            </label>
            <p className="text-[11px] text-gray-500 mb-2">
              Select the shipping methods you offer. Shipping costs are agreed directly between you and the buyer — no fees are set here.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
              {ALL_SHIPPING_OPTIONS.map(option => {
                const isChecked = formData.shippingPreferences.includes(option);
                return (
                  <label key={option} className="flex items-center space-x-2 cursor-pointer">
                    <button
                      type="button"
                      onClick={() => {
                        if (isEditing) {
                          if (isChecked) {
                            handleInputChange('shippingPreferences', formData.shippingPreferences.filter(item => item !== option));
                          } else {
                            handleInputChange('shippingPreferences', [...formData.shippingPreferences, option]);
                          }
                        }
                      }}
                      disabled={!isEditing}
                      className={`w-4 h-4 border-2 rounded transition-all duration-200 flex items-center justify-center focus:outline-none ${
                        isChecked
                          ? 'bg-green-500 border-green-500'
                          : 'bg-white border-gray-300 hover:border-green-400'
                      } ${!isEditing ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                      {isChecked && (
                        <svg className="w-2.5 h-2.5 text-white" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                      )}
                    </button>
                    <span className="text-xs text-gray-700">{option}</span>
                  </label>
                );
              })}
            </div>
          </div>

          {/* Pickup Address — only shown when Self Pickup is enabled */}
          {formData.shippingPreferences.includes('Self Pickup') && (
          <div className="mt-6">
            <label className="block text-xs font-medium text-gray-700 mb-2">
              Pickup Address
            </label>
            <input
              type="text"
              value={formData.pickupAddress}
              onChange={(e) => handleInputChange('pickupAddress', e.target.value)}
              disabled={!isEditing}
              className="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0a61d7] focus:border-transparent disabled:bg-gray-50 text-black"
              placeholder="Enter pickup location address"
            />
          </div>
          )}

                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-2">
                    Preferred Delivery Time Slots
                  </label>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {deliveryTimeSlots.map(slot => (
                      <label key={slot} className="flex items-center space-x-2 cursor-pointer">
                        <button
                          type="button"
                          onClick={() => {
                            if (isEditing) {
                              if (formData.deliveryTimeSlots.includes(slot)) {
                                handleInputChange('deliveryTimeSlots', formData.deliveryTimeSlots.filter(item => item !== slot));
                              } else {
                                handleInputChange('deliveryTimeSlots', [...formData.deliveryTimeSlots, slot]);
                              }
                            }
                          }}
                          disabled={!isEditing}
                          className={`w-4 h-4 border-2 rounded transition-all duration-200 flex items-center justify-center focus:outline-none ${
                            formData.deliveryTimeSlots.includes(slot)
                              ? 'bg-green-500 border-green-500'
                              : 'bg-white border-gray-300 hover:border-green-400'
                          } ${!isEditing ? 'opacity-50 cursor-not-allowed' : ''}`}
                        >
                          {formData.deliveryTimeSlots.includes(slot) && (
                            <svg className="w-2.5 h-2.5 text-white" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                            </svg>
                          )}
                        </button>
                        <span className="text-xs text-gray-700">{slot}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-2">
                    Preferred Delivery Days
                  </label>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                    {deliveryDays.map(day => (
                      <label key={day} className="flex items-center space-x-2 cursor-pointer">
                        <button
                          type="button"
                          onClick={() => {
                            if (isEditing) {
                              if (formData.preferredDeliveryDays.includes(day)) {
                                handleInputChange('preferredDeliveryDays', formData.preferredDeliveryDays.filter(item => item !== day));
                              } else {
                                handleInputChange('preferredDeliveryDays', [...formData.preferredDeliveryDays, day]);
                              }
                            }
                          }}
                          disabled={!isEditing}
                          className={`w-4 h-4 border-2 rounded transition-all duration-200 flex items-center justify-center focus:outline-none ${
                            formData.preferredDeliveryDays.includes(day)
                              ? 'bg-green-500 border-green-500'
                              : 'bg-white border-gray-300 hover:border-green-400'
                          } ${!isEditing ? 'opacity-50 cursor-not-allowed' : ''}`}
                        >
                          {formData.preferredDeliveryDays.includes(day) && (
                            <svg className="w-2.5 h-2.5 text-white" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                            </svg>
                          )}
                        </button>
                        <span className="text-xs text-gray-700">{day}</span>
                      </label>
                    ))}
                  </div>
                </div>



          <div>
            <label className="block text-xs font-medium text-gray-700 mb-2">
              Special Delivery Instructions
            </label>
            <textarea
              value={formData.specialInstructions}
              onChange={(e) => handleInputChange('specialInstructions', e.target.value)}
              disabled={!isEditing}
              rows={3}
              className="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0a61d7] focus:border-transparent disabled:bg-gray-50 text-black resize-none"
              placeholder="Any special instructions for delivery"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-2">
              Default delivery lead time (days)
            </label>
            <div className="flex items-center gap-2 flex-wrap">
              <input
                type="number"
                min={0}
                max={90}
                value={formData.defaultDeliveryLeadTimeMinDays}
                onChange={(e) => handleInputChange('defaultDeliveryLeadTimeMinDays', e.target.value === '' ? '' : Number(e.target.value))}
                disabled={!isEditing}
                className="w-full max-w-[80px] px-3 py-2 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0a61d7] focus:border-transparent disabled:bg-gray-50 text-black"
                placeholder="Min"
              />
              <span className="text-xs text-gray-500">to</span>
              <input
                type="number"
                min={0}
                max={90}
                value={formData.defaultDeliveryLeadTimeMaxDays}
                onChange={(e) => handleInputChange('defaultDeliveryLeadTimeMaxDays', e.target.value === '' ? '' : Number(e.target.value))}
                disabled={!isEditing}
                className="w-full max-w-[80px] px-3 py-2 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0a61d7] focus:border-transparent disabled:bg-gray-50 text-black"
                placeholder="Max"
              />
              <span className="text-xs text-gray-500">days</span>
            </div>
            <p className="mt-1 text-[11px] text-gray-500">Used to suggest estimated delivery date when you confirm an order (e.g. 3 to 5 business days from confirmation).</p>
          </div>
        </div>
      </div>

      {/* Buyer payment terms */}
      <div className="bg-white rounded-lg border border-gray-200 p-4 mt-4">
        <h2 className="text-md font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <CreditCard className="w-5 h-5 text-gray-500" />
          Payment Terms
        </h2>

        <div>
          <label className="block text-xs font-medium text-gray-700 mb-2">
            Term of payment (days after purchase)
          </label>
          <div className="flex items-center gap-2 flex-wrap">
            <input
              type="number"
              min={1}
              step={1}
              value={formData.buyerPaymentTermDays}
              onChange={(e) =>
                handleInputChange(
                  'buyerPaymentTermDays',
                  e.target.value === '' ? '' : Number(e.target.value),
                )
              }
              disabled={!isEditing}
              className="w-full max-w-[120px] px-3 py-2 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0a61d7] focus:border-transparent disabled:bg-gray-50 text-black"
              placeholder="e.g. 14"
            />
            <span className="text-xs text-gray-500">days after purchase</span>
          </div>
          <p className="mt-1 text-[11px] text-gray-500">
            Shown to buyers on the Pay Order screen for bank transfer orders (e.g. full payment due 14 days after purchase).
            Leave empty if payment is due immediately.
          </p>
        </div>
      </div>
    </div>
  );
}
