"use client";

import React, { useState, useEffect, useMemo } from 'react';
import { useUserStore } from '@/store/userStore';
import { REGIONS, getRegionByCode, getRegionDisplayName, getCurrencyDisplayName } from '@/config/regionConfig';
import { ChevronDownIcon, GlobeIcon, CheckIcon } from 'lucide-react';
import ReactCountryFlag from 'react-country-flag';

interface LanguageRegionData {
  language: string;
  region: string;
  currency: string;
}

const LANGUAGES = [
  { code: 'en', name: 'English' },
  { code: 'id', name: 'Bahasa Indonesia' },
];

export default function LanguageRegion() {
  const { user, updateUser } = useUserStore();
  const [isSaving, setIsSaving] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [error, setError] = useState('');
  const [showLanguageDropdown, setShowLanguageDropdown] = useState(false);
  const [showRegionDropdown, setShowRegionDropdown] = useState(false);

  // Initialize formData from user prop using initializer function (not useEffect)
  const [formData, setFormData] = useState<LanguageRegionData>(() => {
    if (!user) {
      return {
        language: 'en',
        region: 'ID',
        currency: 'IDR',
      };
    }
    return {
      language: user.language || 'en',
      region: user.region || 'ID',
      currency: user.currency || 'IDR',
    };
  });

  const [originalData, setOriginalData] = useState<LanguageRegionData>(formData);

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Element;
      if (!target.closest('.dropdown-container')) {
        setShowLanguageDropdown(false);
        setShowRegionDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Sync formData when user changes
  useEffect(() => {
    if (user) {
      const userData = {
        language: user.language || 'en',
        region: user.region || 'ID',
        currency: user.currency || 'IDR',
      };
      setFormData(userData);
      setOriginalData(userData);
    }
  }, [user]);

  // Compute currency from region during render (not in useEffect) - follows React best practices
  const computedCurrency = useMemo(() => {
    const selectedRegion = getRegionByCode(formData.region);
    return selectedRegion?.currency || formData.currency;
  }, [formData.region, formData.currency]);

  // Update formData.currency only when computed value changes and is different
  useEffect(() => {
    if (computedCurrency !== formData.currency) {
      setFormData(prev => ({
        ...prev,
        currency: computedCurrency
      }));
    }
  }, [computedCurrency, formData.currency]);

  const handleLanguageChange = async (languageCode: string) => {
    const newFormData = {
      ...formData,
      language: languageCode
    };
    
    setFormData(newFormData);
    setShowLanguageDropdown(false);
    
    // Auto-save when language changes with new data
    await handleSave(newFormData);
  };

  const handleRegionChange = async (regionCode: string) => {
    const selectedRegion = getRegionByCode(regionCode);    if (selectedRegion) {
      const newFormData = {
        ...formData,
        region: regionCode,
        currency: selectedRegion.currency
      };
      
      setFormData(newFormData);
      setShowRegionDropdown(false);
      
      // Auto-save when region changes with new data
      await handleSave(newFormData);
    }
  };

  const handleSave = async (dataToSave?: LanguageRegionData) => {
    if (!user) return;

    const data = dataToSave || formData;
    setIsSaving(true);
    setError('');

    // Enhanced validation
    const validationErrors: string[] = [];

    // Language validation
    if (!data.language || data.language.trim().length === 0) {
      validationErrors.push('Language is required');
    } else if (!['en', 'id'].includes(data.language)) {
      validationErrors.push('Invalid language selection');
    }

    // Region validation
    if (!data.region || data.region.trim().length === 0) {
      validationErrors.push('Region is required');
    } else if (!['ID', 'US', 'SG', 'MY', 'TH', 'VN', 'PH'].includes(data.region)) {
      validationErrors.push('Invalid region selection');
    }

    // Currency validation
    if (!data.currency || data.currency.trim().length === 0) {
      validationErrors.push('Currency is required');
    } else if (!['IDR', 'USD', 'SGD', 'MYR', 'THB', 'VND', 'PHP'].includes(data.currency)) {
      validationErrors.push('Invalid currency selection');
    }

    if (validationErrors.length > 0) {
      setError(validationErrors.join('. '));
      setIsSaving(false);
      return;
    }

    try {
      const response = await fetch('/api/user/update', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId: user.id,
          language: data.language,
          region: data.region,
          currency: data.currency,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to update language and region settings');
      }

      const updatedUser = await response.json();
      
      // Update the user store
      updateUser({
        language: data.language,
        region: data.region,
        currency: data.currency,
      });

      setOriginalData(data);
      setSuccessMessage('Language and region settings updated successfully!');
      
      // Auto-dismiss success message after 3 seconds
      setTimeout(() => {
        setSuccessMessage('');
      }, 3000);

    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred while updating settings');
    } finally {
      setIsSaving(false);
    }
  };


  const handleDismissSuccess = () => {
    setSuccessMessage('');
  };

  // Component renders on client (useEffect guarantees this)
  // Use isHydrated for proper hydration check
  if (!user) {
    return (
      <div className="space-y-6">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="animate-pulse">
            <div className="h-4 bg-gray-200 rounded w-1/4 mb-4"></div>
            <div className="space-y-3">
              <div className="h-10 bg-gray-200 rounded"></div>
              <div className="h-10 bg-gray-200 rounded"></div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const currentLanguage = LANGUAGES.find(lang => lang.code === formData.language) || LANGUAGES[0];
  const currentRegion = getRegionByCode(formData.region) || REGIONS[0];
  

  return (
    <div className="space-y-4 p-4">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Language & Region</h1>
        <p className="text-gray-600 mt-1">Manage your language and regional preferences</p>
      </div>

      {/* Error/Success Messages */}
      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2">
          <span className="text-red-700 text-sm flex-1">{error}</span>
          <button
            onClick={() => setError('')}
            className="text-red-500 hover:text-red-700 transition-colors"
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>
        </div>
      )}

      {successMessage && (
        <div className="p-3 bg-green-50 border border-green-200 rounded-lg flex items-center gap-2">
          <span className="text-green-700 text-sm flex-1">{successMessage}</span>
          <button
            onClick={handleDismissSuccess}
            className="text-green-500 hover:text-green-700 transition-colors"
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>
        </div>
      )}

      {/* Language & Region Settings */}
      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <h2 className="text-md font-semibold text-gray-900 mb-6 flex items-center gap-2">
          <GlobeIcon className="w-5 h-5 text-gray-500" />
          Language & Regional Settings
        </h2>

        <div className="space-y-4">
          {/* Language Selection */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-2">
              Language
            </label>
            <div className="relative dropdown-container">
              <button
                type="button"
                onClick={() => setShowLanguageDropdown(!showLanguageDropdown)}
                className="w-full px-3 py-2 text-xs text-left bg-white border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 flex items-center justify-between"
              >
                <div className="flex items-center space-x-2">
                  <span className="text-xs font-medium text-gray-500 uppercase">{currentLanguage.code}</span>
                  <span className="text-xs text-gray-900">{currentLanguage.name}</span>
                </div>
                <ChevronDownIcon className="h-4 w-4 text-gray-400" />
              </button>

              {showLanguageDropdown && (
                <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg">
                  {LANGUAGES.map((language) => (
                    <button
                      key={language.code}
                      onClick={() => handleLanguageChange(language.code)}
                      className="w-full px-3 py-2 text-left hover:bg-gray-50 flex items-center justify-between"
                    >
                      <div className="flex items-center space-x-2">
                        <span className="text-xs font-medium text-gray-500 uppercase">{language.code}</span>
                        <span className="text-xs text-gray-900">{language.name}</span>
                      </div>
                      {formData.language === language.code && (
                        <CheckIcon className="h-4 w-4 text-blue-600" />
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Region Selection */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-2">
              Region
            </label>
            <div className="relative dropdown-container">
              <button
                type="button"
                onClick={() => setShowRegionDropdown(!showRegionDropdown)}
                className="w-full px-3 py-2 text-xs text-left bg-white border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 flex items-center justify-between"
              >
                <div className="flex items-center space-x-2">
                  <ReactCountryFlag 
                    countryCode={currentRegion.code} 
                    svg 
                    style={{
                      width: '20px',
                      height: '15px',
                      borderRadius: '2px'
                    }}
                  />
                  <span className="text-xs text-gray-900">{currentRegion.name}</span>
                </div>
                <ChevronDownIcon className="h-4 w-4 text-gray-400" />
              </button>

              {showRegionDropdown && (
                <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                  {REGIONS.map((region) => (
                    <button
                      key={region.code}
                      onClick={() => handleRegionChange(region.code)}
                      className="w-full px-3 py-2 text-left hover:bg-gray-50 flex items-center justify-between"
                    >
                      <div className="flex items-center space-x-2">
                        <ReactCountryFlag 
                          countryCode={region.code} 
                          svg 
                          style={{
                            width: '20px',
                            height: '15px',
                            borderRadius: '2px'
                          }}
                        />
                        <span className="text-xs text-gray-900">{region.name}</span>
                      </div>
                      {formData.region === region.code && (
                        <CheckIcon className="h-4 w-4 text-blue-600" />
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Currency Display (Read-only) */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-2">
              Currency
            </label>
            <div className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg">
              <div className="flex items-center space-x-3">
                <ReactCountryFlag 
                  countryCode={currentRegion.code} 
                  svg 
                  style={{
                    width: '16px',
                    height: '12px',
                    borderRadius: '2px'
                  }}
                />
                <span className="text-xs text-gray-900">
                  {getCurrencyDisplayName(currentRegion)}
                </span>
              </div>
              <p className="text-xs text-gray-500 mt-1">
                Currency is automatically set based on the selected region
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
