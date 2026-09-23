'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Building2, Upload, X, Edit3, Save, AlertCircle, CheckCircle, MapPin, Phone, Mail, Shield, Clock, Truck, ChevronDown } from 'lucide-react';
import { useUserStore } from '@/store/userStore';
import { uploadToCloudinaryDirect } from '@/utils/cloudinaryDirect';
import { generateSlug } from '@/utils/slugUtils';
import { useSettingsTranslations } from '@/hooks/useSettingsTranslations';

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
  deliveryCoverageArea: string;
  fulfillmentNotes: string;
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
  autoApplyBasePriceForFirstBuyers: boolean;
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
  const {
    tDistributor,
    translateIndustryType,
    translateCompanySize,
    translateShippingOption,
    translateDeliveryTimeSlot,
    translateDeliveryDay,
  } = useSettingsTranslations();
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
    deliveryCoverageArea: '',
    fulfillmentNotes: '',
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
    autoApplyBasePriceForFirstBuyers: false,
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
    deliveryCoverageArea: '',
    fulfillmentNotes: '',
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
    autoApplyBasePriceForFirstBuyers: false,
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
        deliveryCoverageArea: (company as { deliveryCoverageArea?: string | null })?.deliveryCoverageArea || '',
        fulfillmentNotes: (company as { fulfillmentNotes?: string | null })?.fulfillmentNotes || '',
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
        autoApplyBasePriceForFirstBuyers: Boolean(
          (company as { autoApplyBasePriceForFirstBuyers?: boolean | null })?.autoApplyBasePriceForFirstBuyers,
        ),
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
        deliveryCoverageArea: (company as { deliveryCoverageArea?: string | null })?.deliveryCoverageArea || '',
        fulfillmentNotes: (company as { fulfillmentNotes?: string | null })?.fulfillmentNotes || '',
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
        autoApplyBasePriceForFirstBuyers: Boolean(
          (company as { autoApplyBasePriceForFirstBuyers?: boolean | null })?.autoApplyBasePriceForFirstBuyers,
        ),
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
      setError(tDistributor('errors.fileSizeLimit'));
      return;
    }

    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      setError(tDistributor('errors.invalidImageType'));
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
        throw new Error(result.error || tDistributor('errors.uploadFailed'));
      }

      setIsLoading(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : tDistributor('errors.imageProcessFailed'));
      setIsLoading(false);
    }
  };

  const handleBannerUpload = async (file: File) => {
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      setError(tDistributor('errors.fileSizeLimit'));
      return;
    }

    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      setError(tDistributor('errors.invalidImageType'));
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
        throw new Error(result.error || tDistributor('errors.uploadFailed'));
      }

      setIsLoading(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : tDistributor('errors.imageProcessFailed'));
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
        validationErrors.push(tDistributor('errors.companyNameRequired'));
      } else if (formData.companyName.trim().length < 2) {
        validationErrors.push(tDistributor('errors.companyNameMinLength'));
      } else if (formData.companyName.trim().length > 100) {
        validationErrors.push(tDistributor('errors.companyNameMaxLength'));
      }

      // Business address validation
      if (!formData.businessAddress.trim()) {
        validationErrors.push(tDistributor('errors.businessAddressRequired'));
      } else if (formData.businessAddress.trim().length < 10) {
        validationErrors.push(tDistributor('errors.businessAddressMinLength'));
      } else if (formData.businessAddress.trim().length > 500) {
        validationErrors.push(tDistributor('errors.businessAddressMaxLength'));
      }

      // Business phone validation
      if (formData.businessPhone.trim()) {
        const phoneRegex = /^[\+]?[0-9\s\-\(\)]{8,20}$/;
        if (!phoneRegex.test(formData.businessPhone.trim())) {
          validationErrors.push(tDistributor('errors.invalidBusinessPhone'));
        }
      }

      // Business email validation
      if (formData.businessEmail.trim()) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(formData.businessEmail.trim())) {
          validationErrors.push(tDistributor('errors.invalidBusinessEmail'));
        } else if (formData.businessEmail.trim().length > 254) {
          validationErrors.push(tDistributor('errors.businessEmailMaxLength'));
        }
      }

      // Business description validation
      if (formData.businessDescription.trim() && formData.businessDescription.trim().length > 1000) {
        validationErrors.push(tDistributor('errors.businessDescriptionMaxLength'));
      }

      // Special instructions validation
      if (formData.specialInstructions.trim() && formData.specialInstructions.trim().length > 500) {
        validationErrors.push(tDistributor('errors.specialInstructionsMaxLength'));
      }

      // Pickup address validation
      if (formData.shippingPreferences.includes('Self Pickup') && formData.pickupAddress.trim()) {
        if (formData.pickupAddress.trim().length < 10) {
          validationErrors.push(tDistributor('errors.pickupAddressMinLength'));
        } else if (formData.pickupAddress.trim().length > 500) {
          validationErrors.push(tDistributor('errors.pickupAddressMaxLength'));
        }
      }

      // XSS prevention
      const xssPattern = /<[^>]*>|javascript:|on\w+\s*=/i;
      if (xssPattern.test(formData.companyName) || xssPattern.test(formData.businessDescription) || 
          xssPattern.test(formData.specialInstructions) || xssPattern.test(formData.pickupAddress)) {
        validationErrors.push(tDistributor('errors.invalidCharacters'));
      }

      // Delivery lead time validation
      const MIN_DAYS = 0;
      const MAX_DAYS = 90;
      const leadTimeLabel = tDistributor('errors.leadTimeLabel');
      const parseDaysField = (val: number | ''): number | null => {
        if (val === '') return null;
        const n = Number(val);
        if (!Number.isFinite(n)) return null;
        return n;
      };
      const validateDaysPair = (minRaw: number | '', maxRaw: number | ''): void => {
        const minVal = parseDaysField(minRaw);
        const maxVal = parseDaysField(maxRaw);
        if (minVal != null) {
          if (!Number.isInteger(minVal) || minVal < MIN_DAYS || minVal > MAX_DAYS) {
            validationErrors.push(
              tDistributor('errors.leadTimeMinInvalid', { label: leadTimeLabel, min: MIN_DAYS, max: MAX_DAYS })
            );
          }
        }
        if (maxVal != null) {
          if (!Number.isInteger(maxVal) || maxVal < MIN_DAYS || maxVal > MAX_DAYS) {
            validationErrors.push(
              tDistributor('errors.leadTimeMaxInvalid', { label: leadTimeLabel, min: MIN_DAYS, max: MAX_DAYS })
            );
          }
        }
        if (minVal != null && maxVal != null && minVal > maxVal) {
          validationErrors.push(
            tDistributor('errors.leadTimeMinGreaterThanMax', { label: leadTimeLabel })
          );
        }
      };
      validateDaysPair(formData.defaultDeliveryLeadTimeMinDays, formData.defaultDeliveryLeadTimeMaxDays);

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
          setError(tDistributor('errors.createCompanyFailed'));
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
        deliveryCoverageArea: formData.deliveryCoverageArea.trim(),
        fulfillmentNotes: formData.fulfillmentNotes.trim(),
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
        autoApplyBasePriceForFirstBuyers: formData.autoApplyBasePriceForFirstBuyers,
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
        throw new Error(errorData.error || tDistributor('errors.saveCompanyProfileFailed'));
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
      setSuccess(tDistributor('success.profileSaved'));
      
      // Auto-hide success message after 3 seconds
      setTimeout(() => {
        setSuccess('');
      }, 3000);
    } catch (err) {
      setError(tDistributor('errors.updateCompanyProfileFailed'));
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
          <h1 className="text-2xl font-bold text-black mb-2">{tDistributor('title')}</h1>
        </div>
        
        {!isEditing ? (
          <button
            onClick={() => setIsEditing(true)}
            className="px-4 py-2 bg-[#0a61d7] text-white text-sm font-semibold rounded-lg hover:bg-[#084ba6] flex items-center gap-2 transition-colors"
          >
            <Edit3 className="w-4 h-4" />
            {tDistributor('edit')}
          </button>
        ) : (
          <div className="flex gap-2">
            <button
              onClick={handleSave}
              disabled={isLoading || !hasChanges}
              className="px-4 py-2 bg-green-600 text-white text-sm font-semibold rounded-lg hover:bg-green-700 flex items-center gap-2 transition-colors disabled:opacity-50"
            >
              <Save className="w-4 h-4" />
              {isLoading ? tDistributor('saving') : tDistributor('save')}
            </button>
            <button
              onClick={handleCancel}
              className="px-4 py-2 bg-white border border-gray-200 text-black text-sm font-medium rounded-lg hover:bg-gray-200 transition-colors"
            >
              {tDistributor('cancel')}
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
          {tDistributor('companyInformation')}
        </h2>

        <div className="space-y-4">
          {/* Company Logo Section */}
          <div className="flex flex-col items-center">
            <div className="w-24 h-24 rounded-lg bg-gray-100 border-2 border-gray-200 flex items-center justify-center overflow-hidden mb-4">
              {formData.companyLogo ? (
                <img 
                  src={formData.companyLogo} 
                  alt={tDistributor('companyLogoAlt')} 
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
                {isLoading ? tDistributor('uploading') : tDistributor('uploadLogo')}
              </button>
              
              {formData.companyLogo && isEditing && (
                <button
                  type="button"
                  onClick={() => setFormData(prev => ({ ...prev, companyLogo: null }))}
                  className="px-4 py-2 bg-gray-500 text-white text-xs font-semibold rounded-lg hover:bg-gray-600 flex items-center gap-2 transition-colors"
                >
                  <X className="w-4 h-4" />
                  {tDistributor('remove')}
                </button>
              )}
            </div>
            
            <p className="text-xs text-gray-500 mt-2 text-center">
              {tDistributor('imageUploadHint')}
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
                  alt={tDistributor('companyBannerAlt')} 
                  className="w-full h-full object-cover" 
                />
              ) : (
                <div className="text-center">
                  <Building2 className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                  <p className="text-xs text-gray-500">{tDistributor('companyBannerEmpty')}</p>
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
                {isLoading ? tDistributor('uploading') : tDistributor('uploadBanner')}
              </button>
              
              {formData.companyBanner && isEditing && (
                <button
                  type="button"
                  onClick={() => setFormData(prev => ({ ...prev, companyBanner: null }))}
                  className="px-4 py-2 bg-gray-500 text-white text-xs font-semibold rounded-lg hover:bg-gray-600 flex items-center gap-2 transition-colors"
                >
                  <X className="w-4 h-4" />
                  {tDistributor('remove')}
                </button>
              )}
            </div>
            
            <p className="text-xs text-gray-500 mt-2 text-center">
              {tDistributor('imageUploadHint')}
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
                  {tDistributor('companyName')}
                </label>
                <input
                  type="text"
                  value={formData.companyName}
                  onChange={(e) => handleInputChange('companyName', e.target.value)}
                  disabled={!isEditing}
                  className="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0a61d7] focus:border-transparent disabled:bg-gray-50 text-black"
                  placeholder={tDistributor('companyNamePlaceholder')}
                />
              </div>
              
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-2">
                  {tDistributor('businessRegistrationNumber')}
                </label>
                <input
                  type="text"
                  value={formData.businessRegistrationNumber}
                  onChange={(e) => handleInputChange('businessRegistrationNumber', e.target.value)}
                  disabled={!isEditing}
                  className="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0a61d7] focus:border-transparent disabled:bg-gray-50 text-black"
                  placeholder={tDistributor('businessRegistrationNumberPlaceholder')}
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                {tDistributor('generatedStoreUrl')}
              </label>
              <p className="text-[11px] text-gray-500 mb-2">
                {tDistributor('generatedStoreUrlDescription')}
              </p>
              <div className="w-full px-3 py-2 text-xs border border-gray-200 rounded-lg bg-gray-50 text-[#0a61d7] font-semibold break-all">
                {tDistributor('storeUrlPrefix')}{generateSlug(formData.companyName || tDistributor('storeUrlFallbackName')) || tDistributor('storeUrlFallbackSlug')}
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-2">
                {tDistributor('taxId')}
              </label>
              <input
                type="text"
                value={formData.taxId}
                onChange={(e) => handleInputChange('taxId', e.target.value)}
                disabled={!isEditing}
                className="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0a61d7] focus:border-transparent disabled:bg-gray-50 text-black"
                placeholder={tDistributor('taxIdPlaceholder')}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-2">
                  {tDistributor('industryType')}
                </label>
                <div className="relative dropdown-container">
                  <button
                    type="button"
                    className="w-full px-3 py-2 text-xs border border-[#e6e6e6] rounded-lg bg-white text-gray-700 hover:bg-gray-100 transition-colors focus:outline-none focus:ring-2 focus:ring-[#0a61d7] disabled:bg-gray-50 disabled:cursor-not-allowed flex items-center justify-between"
                    onClick={() => isEditing && handleDropdownToggle('industry')}
                    disabled={!isEditing}
                  >
                    <span className={formData.industryType ? 'text-black' : 'text-gray-500'}>
                      {formData.industryType ? translateIndustryType(formData.industryType) : tDistributor('industryTypePlaceholder')}
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
                          {translateIndustryType(type)}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-2">
                  {tDistributor('companySize')}
                </label>
                <div className="relative dropdown-container">
                  <button
                    type="button"
                    className="w-full px-3 py-2 text-xs border border-[#e6e6e6] rounded-lg bg-white text-gray-700 hover:bg-gray-100 transition-colors focus:outline-none focus:ring-2 focus:ring-[#0a61d7] disabled:bg-gray-50 disabled:cursor-not-allowed flex items-center justify-between"
                    onClick={() => isEditing && handleDropdownToggle('companySize')}
                    disabled={!isEditing}
                  >
                    <span className={formData.companySize ? 'text-black' : 'text-gray-500'}>
                      {formData.companySize ? translateCompanySize(formData.companySize) : tDistributor('companySizePlaceholder')}
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
                          {translateCompanySize(size)}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-2">
                {tDistributor('businessDescription')}
              </label>
              <textarea
                value={formData.businessDescription}
                onChange={(e) => handleInputChange('businessDescription', e.target.value)}
                disabled={!isEditing}
                rows={3}
                className="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0a61d7] focus:border-transparent disabled:bg-gray-50 text-black resize-none"
                placeholder={tDistributor('businessDescriptionPlaceholder')}
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-2">
                {tDistributor('yearsInOperation')}
              </label>
              <input
                type="text"
                value={formData.yearsInOperation}
                onChange={(e) => handleInputChange('yearsInOperation', e.target.value)}
                disabled={!isEditing}
                className="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0a61d7] focus:border-transparent disabled:bg-gray-50 text-black"
                placeholder={tDistributor('yearsInOperationPlaceholder')}
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-2">
                {tDistributor('deliveryCoverageArea')}
              </label>
              <textarea
                value={formData.deliveryCoverageArea}
                onChange={(e) => handleInputChange('deliveryCoverageArea', e.target.value)}
                disabled={!isEditing}
                rows={2}
                className="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0a61d7] focus:border-transparent disabled:bg-gray-50 text-black resize-none"
                placeholder={tDistributor('deliveryCoverageAreaPlaceholder')}
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-2">
                {tDistributor('fulfillmentNotes')}
              </label>
              <textarea
                value={formData.fulfillmentNotes}
                onChange={(e) => handleInputChange('fulfillmentNotes', e.target.value)}
                disabled={!isEditing}
                rows={2}
                className="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0a61d7] focus:border-transparent disabled:bg-gray-50 text-black resize-none"
                placeholder={tDistributor('fulfillmentNotesPlaceholder')}
              />
              <p className="mt-1 text-[11px] text-gray-500">
                {tDistributor('fulfillmentNotesHint')}
              </p>
            </div>

            {/* Contact Information */}
            <div className="border-t border-gray-200 pt-6">
              <h3 className="text-sm font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <Phone className="w-4 h-4 text-gray-500" />
                {tDistributor('contactInformation')}
              </h3>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-2">
                    {tDistributor('businessAddress')}
                  </label>
                  <div className="flex gap-2">
                    <MapPin className="w-4 h-4 text-gray-400 mt-3" />
                    <textarea
                      value={formData.businessAddress}
                      onChange={(e) => handleInputChange('businessAddress', e.target.value)}
                      disabled={!isEditing}
                      rows={2}
                      className="flex-1 px-3 py-2 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0a61d7] focus:border-transparent disabled:bg-gray-50 text-black resize-none"
                      placeholder={tDistributor('businessAddressPlaceholder')}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-2">
                      {tDistributor('businessPhone')}
                    </label>
                    <div className="flex gap-2">
                      <Phone className="w-4 h-4 text-gray-400 mt-3" />
                      <input
                        type="tel"
                        value={formData.businessPhone}
                        onChange={(e) => handleInputChange('businessPhone', e.target.value)}
                        disabled={!isEditing}
                        className="flex-1 px-3 py-2 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0a61d7] focus:border-transparent disabled:bg-gray-50 text-black"
                        placeholder={tDistributor('businessPhonePlaceholder')}
                      />
                    </div>
                  </div>
                  
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-2">
                      {tDistributor('businessEmail')}
                    </label>
                    <div className="flex gap-2">
                      <Mail className="w-4 h-4 text-gray-400 mt-3" />
                      <input
                        type="email"
                        value={formData.businessEmail}
                        onChange={(e) => handleInputChange('businessEmail', e.target.value)}
                        disabled={!isEditing}
                        className="flex-1 px-3 py-2 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0a61d7] focus:border-transparent disabled:bg-gray-50 text-black"
                        placeholder={tDistributor('businessEmailPlaceholder')}
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
          {tDistributor('shippingDeliveryConfigurations')}
        </h2>
        
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              {tDistributor('shippingOptions')}
            </label>
            <p className="text-[11px] text-gray-500 mb-2">
              {tDistributor('shippingOptionsDescription')}
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
                    <span className="text-xs text-gray-700">{translateShippingOption(option)}</span>
                  </label>
                );
              })}
            </div>
          </div>

          {/* Pickup Address — only shown when Self Pickup is enabled */}
          {formData.shippingPreferences.includes('Self Pickup') && (
          <div className="mt-6">
            <label className="block text-xs font-medium text-gray-700 mb-2">
              {tDistributor('pickupAddress')}
            </label>
            <input
              type="text"
              value={formData.pickupAddress}
              onChange={(e) => handleInputChange('pickupAddress', e.target.value)}
              disabled={!isEditing}
              className="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0a61d7] focus:border-transparent disabled:bg-gray-50 text-black"
              placeholder={tDistributor('pickupAddressPlaceholder')}
            />
          </div>
          )}

                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-2">
                    {tDistributor('preferredDeliveryTimeSlots')}
                  </label>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {deliveryTimeSlots.map(slot => {
                      const flexibleOn = formData.deliveryTimeSlots.includes('Flexible');
                      const slotLocked = slot !== 'Flexible' && flexibleOn;
                      const slotDisabled = !isEditing || slotLocked;
                      const slotChecked = flexibleOn || formData.deliveryTimeSlots.includes(slot);
                      return (
                      <label key={slot} className={`flex items-center space-x-2 ${slotDisabled ? 'cursor-not-allowed' : 'cursor-pointer'}`}>
                        <button
                          type="button"
                          onClick={() => {
                            if (!isEditing || slotLocked) return;
                            if (slot === 'Flexible') {
                              handleInputChange(
                                'deliveryTimeSlots',
                                flexibleOn
                                  ? formData.deliveryTimeSlots.filter((item) => item !== 'Flexible')
                                  : [...deliveryTimeSlots],
                              );
                              return;
                            }
                            if (formData.deliveryTimeSlots.includes(slot)) {
                              handleInputChange('deliveryTimeSlots', formData.deliveryTimeSlots.filter(item => item !== slot));
                            } else {
                              handleInputChange('deliveryTimeSlots', [...formData.deliveryTimeSlots, slot]);
                            }
                          }}
                          disabled={slotDisabled}
                          aria-disabled={slotDisabled}
                          className={`w-4 h-4 border-2 rounded transition-all duration-200 flex items-center justify-center focus:outline-none ${
                            slotChecked
                              ? 'bg-green-500 border-green-500'
                              : 'bg-white border-gray-300 hover:border-green-400'
                          } ${slotDisabled ? 'opacity-50 cursor-not-allowed' : ''}`}
                        >
                          {slotChecked && (
                            <svg className="w-2.5 h-2.5 text-white" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                            </svg>
                          )}
                        </button>
                        <span className="text-xs text-gray-700">{translateDeliveryTimeSlot(slot)}</span>
                      </label>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-2">
                    {tDistributor('preferredDeliveryDays')}
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
                        <span className="text-xs text-gray-700">{translateDeliveryDay(day)}</span>
                      </label>
                    ))}
                  </div>
                </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-2">
              {tDistributor('specialDeliveryInstructions')}
            </label>
            <textarea
              value={formData.specialInstructions}
              onChange={(e) => handleInputChange('specialInstructions', e.target.value)}
              disabled={!isEditing}
              rows={3}
              className="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0a61d7] focus:border-transparent disabled:bg-gray-50 text-black resize-none"
              placeholder={tDistributor('specialInstructionsPlaceholder')}
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-2">
              {tDistributor('defaultDeliveryLeadTimeDays')}
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
                placeholder={tDistributor('leadTimeMin')}
              />
              <span className="text-xs text-gray-500">{tDistributor('leadTimeTo')}</span>
              <input
                type="number"
                min={0}
                max={90}
                value={formData.defaultDeliveryLeadTimeMaxDays}
                onChange={(e) => handleInputChange('defaultDeliveryLeadTimeMaxDays', e.target.value === '' ? '' : Number(e.target.value))}
                disabled={!isEditing}
                className="w-full max-w-[80px] px-3 py-2 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0a61d7] focus:border-transparent disabled:bg-gray-50 text-black"
                placeholder={tDistributor('leadTimeMax')}
              />
              <span className="text-xs text-gray-500">{tDistributor('leadTimeDaysSuffix')}</span>
            </div>
            <p className="mt-1 text-[11px] text-gray-500">{tDistributor('defaultDeliveryLeadTimeHint')}</p>
          </div>

          <div className="flex items-start justify-between gap-4 border-t border-gray-200 pt-6">
            <div className="min-w-0">
              <h3 className="text-sm font-medium text-gray-900">
                {tDistributor('autoApplyBasePriceForFirstBuyers')}
              </h3>
              <p className="mt-1 text-[11px] text-gray-500">
                {tDistributor('autoApplyBasePriceForFirstBuyersHint')}
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={formData.autoApplyBasePriceForFirstBuyers}
              disabled={!isEditing}
              onClick={() =>
                isEditing &&
                handleInputChange(
                  'autoApplyBasePriceForFirstBuyers',
                  !formData.autoApplyBasePriceForFirstBuyers,
                )
              }
              className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
                formData.autoApplyBasePriceForFirstBuyers ? 'bg-[#0a61d7]' : 'bg-gray-200'
              } ${!isEditing ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  formData.autoApplyBasePriceForFirstBuyers ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
