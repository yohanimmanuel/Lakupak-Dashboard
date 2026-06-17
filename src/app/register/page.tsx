"use client";
import React, { useState, useCallback, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { signIn, signOut } from "next-auth/react";
import { useUserStore } from '@/store/userStore';
import { validateAuthInput } from '@/utils/auth-security';
import { REGIONS, getRegionByCode, getRegionDisplayName, getCurrencyDisplayName } from '@/config/regionConfig';
import { ChevronDown, Truck } from 'lucide-react';
import { 
  useAuthErrorHandler, 
  useAuthLoading, 
  useAuthPerformanceTracking,
  ValidatedInput,
  ErrorMessage,
  SuccessMessage,
  LoadingButton,
  RegistrationProgressBar,
} from '@/utils/auth-enhancements';

const steps = ["User Info", "Company Info", "Business Credentials", "Payment", "Shipping & Delivery", "Set Password"];

const SHIPPING_OPTIONS = [
  'Self Pickup',
  'Seller/Distributor Delivery',
  'Buyer-arranged Courier',
] as const;

const DELIVERY_TIME_SLOTS = [
  'Morning (8:00 AM - 12:00 PM)',
  'Afternoon (12:00 PM - 5:00 PM)',
  'Evening (5:00 PM - 8:00 PM)',
  'Flexible',
] as const;

const DELIVERY_DAYS = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
] as const;

function isLeadTimeValid(min: number | '', max: number | ''): boolean {
  const parseDays = (val: number | ''): number | null => {
    if (val === '') return null;
    const n = Number(val);
    return Number.isFinite(n) ? n : null;
  };
  const minVal = parseDays(min);
  const maxVal = parseDays(max);
  if (minVal != null && (!Number.isInteger(minVal) || minVal < 0 || minVal > 90)) return false;
  if (maxVal != null && (!Number.isInteger(maxVal) || maxVal < 0 || maxVal > 90)) return false;
  if (minVal != null && maxVal != null && minVal > maxVal) return false;
  return true;
}

function RegisterCheckbox({
  checked,
  onToggle,
  label,
}: {
  checked: boolean;
  onToggle: () => void;
  label: string;
}) {
  return (
    <label className="flex items-center space-x-2 cursor-pointer">
      <button
        type="button"
        onClick={onToggle}
        className={`w-4 h-4 border-2 rounded transition-all duration-200 flex items-center justify-center focus:outline-none ${
          checked
            ? 'bg-green-500 border-green-500'
            : 'bg-white border-gray-300 hover:border-green-400'
        }`}
        aria-pressed={checked}
        aria-label={label}
      >
        {checked && (
          <svg className="w-2.5 h-2.5 text-white" fill="currentColor" viewBox="0 0 20 20">
            <path
              fillRule="evenodd"
              d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
              clipRule="evenodd"
            />
          </svg>
        )}
      </button>
      <span className="text-sm text-gray-700">{label}</span>
    </label>
  );
}

const INDUSTRY_OPTIONS = [
  'Wholesale & Distribution',
  'Retail',
  'Food & Beverage',
  'Pharmacy & Healthcare',
  'Electronics',
  'Fashion',
  'Logistics',
  'Manufacturing',
  'Other',
] as const;

const COMPANY_SIZE_OPTIONS = [
  '1-10 employees',
  '11-50 employees',
  '51-200 employees',
  '201-500 employees',
  '500+ employees',
] as const;

export default function RegisterPage() {
  const [step, setStep] = useState(0);
  const [stepKey, setStepKey] = useState(0);
  
  // Form data
  const [userInfo, setUserInfo] = useState({ firstName: "", lastName: "", email: "", phone: "", bio: "" });
  const [companyInfo, setCompanyInfo] = useState({
    company: "",
    address: "",
    region: "ID",
    yearsInOperation: "",
    businessPhone: "",
  });
  const [businessCreds, setBusinessCreds] = useState({
    businessRegistrationNumber: "",
    taxId: "",
    businessEmail: "",
    industryType: "Wholesale & Distribution",
    companySize: "11-50 employees",
  });
  const [paymentInfo, setPaymentInfo] = useState({
    billingBankName: "",
    billingBankAccountName: "",
    billingBankAccountNumber: "",
    buyerPaymentTermDays: "" as number | "",
  });
  const [shippingConfig, setShippingConfig] = useState({
    shippingPreferences: [] as string[],
    pickupAddress: "",
    deliveryTimeSlots: [] as string[],
    preferredDeliveryDays: [] as string[],
    specialInstructions: "",
    defaultDeliveryLeadTimeMinDays: "" as number | "",
    defaultDeliveryLeadTimeMaxDays: "" as number | "",
  });
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showRegionDropdown, setShowRegionDropdown] = useState(false);
  const regionDropdownRef = useRef<HTMLDivElement>(null);
  const [showIndustryDropdown, setShowIndustryDropdown] = useState(false);
  const industryDropdownRef = useRef<HTMLDivElement>(null);
  const [showCompanySizeDropdown, setShowCompanySizeDropdown] = useState(false);
  const companySizeDropdownRef = useRef<HTMLDivElement>(null);
  
  // Validation states
  const [validationStates, setValidationStates] = useState({
    firstName: true,
    lastName: true,
    email: true,
    phone: true,
    bio: true,
    company: true,
    address: true,
    region: true,
    yearsInOperation: true,
    businessPhone: true,
    businessRegistrationNumber: true,
    taxId: true,
    businessEmail: true,
    industryType: true,
    companySize: true,
    billingBankName: true,
    billingBankAccountName: true,
    billingBankAccountNumber: true,
    buyerPaymentTermDays: true,
    pickupAddress: true,
    deliveryLeadTime: true,
    password: true,
    confirmPassword: true
  });
  
  const router = useRouter();
  const setUser = useUserStore(state => state.setUser);
  
  // Enhanced hooks for production features
  const { error, handleError, clearError } = useAuthErrorHandler();
  const { loading, startLoading, stopLoading } = useAuthLoading();
  const [success, setSuccess] = useState("");
  
  // Performance tracking
  useAuthPerformanceTracking('Registration');

  const updateValidation = useCallback((field: string, valid: boolean) => {
    setValidationStates(prev => ({ ...prev, [field]: valid }));
  }, []);

  const validateCurrentStep = useCallback(() => {
    switch (step) {
      case 0:
        return (
          userInfo.firstName.trim() && 
          userInfo.lastName.trim() && 
          userInfo.email.trim() && 
          userInfo.phone.trim() &&
          validationStates.firstName && 
          validationStates.lastName && 
          validationStates.email &&
          validationStates.phone &&
          validationStates.bio
        );
      case 1:
        return (
          companyInfo.company.trim() && 
          companyInfo.address.trim() && 
          companyInfo.region &&
          validationStates.company &&
          validationStates.region &&
          companyInfo.yearsInOperation.trim() &&
          validationStates.yearsInOperation
        );
      case 2:
        return (
          businessCreds.businessRegistrationNumber.trim() &&
          businessCreds.businessEmail.trim() &&
          businessCreds.industryType.trim() &&
          businessCreds.companySize.trim() &&
          companyInfo.businessPhone.trim() &&
          validationStates.businessRegistrationNumber &&
          validationStates.businessEmail &&
          validationStates.industryType &&
          validationStates.companySize &&
          validationStates.taxId &&
          validationStates.businessPhone
        );
      case 3:
        return (
          paymentInfo.billingBankName.trim() &&
          paymentInfo.billingBankAccountName.trim() &&
          paymentInfo.billingBankAccountNumber.trim() &&
          validationStates.billingBankName &&
          validationStates.billingBankAccountName &&
          validationStates.billingBankAccountNumber &&
          validationStates.buyerPaymentTermDays
        );
      case 4:
        return (
          shippingConfig.shippingPreferences.length > 0 &&
          validationStates.deliveryLeadTime &&
          (!shippingConfig.shippingPreferences.includes('Self Pickup') ||
            (shippingConfig.pickupAddress.trim() && validationStates.pickupAddress))
        );
      case 5:
        return (
          password && 
          confirmPassword && 
          password === confirmPassword && 
          validationStates.password
        );
      default:
        return false;
    }
  }, [step, userInfo, companyInfo, businessCreds, paymentInfo, shippingConfig, password, confirmPassword, validationStates]);

  const handleNext = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();
    setSuccess("");
    
    // Validate current step
    if (!validateCurrentStep()) {
      handleError({ error: "Please complete all required fields correctly." });
      return;
    }
    
    if (step < 5) {
      // Move to next step
      setStep(step + 1);
      setStepKey(prev => prev + 1);
      return;
    }
    
    // Final step - submit registration
    startLoading('Creating your account...');
    
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "Cache-Control": "no-cache"
        },
        body: JSON.stringify({
          firstName: userInfo.firstName.trim(),
          lastName: userInfo.lastName.trim(),
          email: userInfo.email.trim(),
          phone: userInfo.phone.trim(),
          bio: userInfo.bio.trim(),
          password,
          company: companyInfo.company.trim(),
          address: companyInfo.address.trim(),
          region: companyInfo.region,
          yearsInOperation: companyInfo.yearsInOperation.trim(),
          businessPhone: companyInfo.businessPhone.trim(),
          businessRegistrationNumber: businessCreds.businessRegistrationNumber.trim(),
          businessEmail: businessCreds.businessEmail.trim(),
          taxId: businessCreds.taxId.trim(),
          industryType: businessCreds.industryType.trim(),
          companySize: businessCreds.companySize.trim(),
          billingBankName: paymentInfo.billingBankName.trim(),
          billingBankAccountName: paymentInfo.billingBankAccountName.trim(),
          billingBankAccountNumber: paymentInfo.billingBankAccountNumber.trim(),
          buyerPaymentTermDays:
            paymentInfo.buyerPaymentTermDays === '' ? null : paymentInfo.buyerPaymentTermDays,
          shippingPreferences: shippingConfig.shippingPreferences,
          pickupAddress: shippingConfig.shippingPreferences.includes('Self Pickup')
            ? shippingConfig.pickupAddress.trim()
            : null,
          deliveryTimeSlots: shippingConfig.deliveryTimeSlots,
          preferredDeliveryDays: shippingConfig.preferredDeliveryDays,
          specialInstructions: shippingConfig.specialInstructions.trim(),
          defaultDeliveryLeadTimeMinDays:
            shippingConfig.defaultDeliveryLeadTimeMinDays === ''
              ? null
              : shippingConfig.defaultDeliveryLeadTimeMinDays,
          defaultDeliveryLeadTimeMaxDays:
            shippingConfig.defaultDeliveryLeadTimeMaxDays === ''
              ? null
              : shippingConfig.defaultDeliveryLeadTimeMaxDays,
        }),
      });
      
      const data = await res.json();
      
      if (!res.ok) {
        handleError(data, "Registration failed. Please try again.");
        return;
      }
      
      // Success
      setSuccess("Registration successful! Redirecting to dashboard...");
      setUser({
        id: (() => {
          if (typeof data.id === 'number' && Number.isFinite(data.id)) return data.id;
          const parsed = Number.parseInt(String(data.id ?? ''), 10);
          if (!Number.isFinite(parsed)) {
            throw new Error('Invalid user ID received from registration API');
          }
          return parsed;
        })(),
        firstName: data.firstName,
        lastName: data.lastName,
        email: data.email,
        phone: data.phone,
        bio: data.bio,
        companyId: data.companyId,
        company: data.company,
        region: data.region,
        currency: data.currency,
        language: data.language || 'en',
      }, true); // Auto-remember new registrations
      
      // Track successful registration
      if (typeof window !== 'undefined' && window.gtag) {
        window.gtag('event', 'sign_up', {
          event_category: 'Authentication',
          event_label: 'Email Registration',
          value: 1
        });
      }

      // Auto sign-in with the newly created credentials so GraphQL / dashboard APIs have a valid session
      try {
        await signIn("credentials", {
          email: userInfo.email.trim(),
          password,
          redirect: false,
        });
      } catch (autoLoginError) {
        // Log but don't block the UX; user will be asked to log in manually if needed
        console.error("Auto login after registration failed:", autoLoginError);
      }

      // Small delay for better UX
      setTimeout(() => {
        router.push("/home");
      }, 1500);
      
    } catch (err) {
      // Registration error occurred
      handleError({ error: "Network error. Please check your connection and try again." });
    } finally {
      stopLoading();
    }
  }, [step, userInfo, companyInfo, businessCreds, paymentInfo, shippingConfig, password, validateCurrentStep, router, setUser, handleError, clearError, startLoading, stopLoading]);

  const handleBack = useCallback(() => {
    if (step > 0) {
      setStep(step - 1);
      setStepKey(prev => prev + 1);
      clearError(); // Clear error when going back
    }
  }, [step, clearError]);

  const validateConfirmPassword = useCallback((confirmPw: string) => {
    if (!confirmPw) return { valid: false, error: 'Please confirm your password' };
    if (confirmPw !== password) return { valid: false, error: 'Passwords do not match' };
    return { valid: true };
  }, [password]);

  const toggleShippingConfigArray = useCallback((
    field: 'shippingPreferences' | 'deliveryTimeSlots' | 'preferredDeliveryDays',
    option: string,
  ) => {
    setShippingConfig((prev) => {
      const current = prev[field];
      const next = current.includes(option)
        ? current.filter((o) => o !== option)
        : [...current, option];
      if (field === 'shippingPreferences') {
        return {
          ...prev,
          shippingPreferences: next,
          pickupAddress: next.includes('Self Pickup') ? prev.pickupAddress : '',
        };
      }
      return { ...prev, [field]: next };
    });
  }, []);

  const updateLeadTime = useCallback((
    field: 'defaultDeliveryLeadTimeMinDays' | 'defaultDeliveryLeadTimeMaxDays',
    raw: string,
  ) => {
    const next = raw === '' ? '' : Number(raw);
    setShippingConfig((prev) => {
      const updated = { ...prev, [field]: next };
      const valid = isLeadTimeValid(
        updated.defaultDeliveryLeadTimeMinDays,
        updated.defaultDeliveryLeadTimeMaxDays,
      );
      updateValidation('deliveryLeadTime', valid);
      return updated;
    });
  }, [updateValidation]);

  const handleRegionChange = useCallback((regionCode: string) => {
    setCompanyInfo({ ...companyInfo, region: regionCode });
    setShowRegionDropdown(false);
    updateValidation('region', true);
  }, [companyInfo, updateValidation]);

  const getSelectedRegion = useCallback(() => {
    return getRegionByCode(companyInfo.region) || REGIONS[0];
  }, [companyInfo.region]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (regionDropdownRef.current && !regionDropdownRef.current.contains(event.target as Node)) {
        setShowRegionDropdown(false);
      }
      if (industryDropdownRef.current && !industryDropdownRef.current.contains(event.target as Node)) {
        setShowIndustryDropdown(false);
      }
      if (companySizeDropdownRef.current && !companySizeDropdownRef.current.contains(event.target as Node)) {
        setShowCompanySizeDropdown(false);
      }
    };

    if (showRegionDropdown || showIndustryDropdown || showCompanySizeDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showRegionDropdown, showIndustryDropdown, showCompanySizeDropdown]);

  return (
    <div className="min-h-screen w-full bg-white">
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-6 py-8 sm:px-8 sm:py-12">
        <div className="mb-8 text-center sm:text-left">
          <a href="/" aria-label="Go to homepage" className="inline-block mb-4">
            <img src="/LakuTextLogo.svg" alt="Laku Logo" className="h-10" />
          </a>
          <h1 className="text-3xl font-bold text-gray-900 sm:text-4xl">Create Distributor Account</h1>
          <p className="mt-2 text-gray-500">Complete all six steps to start selling on Laku Marketplace.</p>
        </div>

        <div className="rounded-lg border border-gray-100 bg-white p-4 shadow-xs sm:p-6 animate-fade-in-up">
          <RegistrationProgressBar steps={steps} currentStep={step} />

          {error && (
            <ErrorMessage message={error} onClose={clearError} />
          )}
          {success && (
            <SuccessMessage message={success} onClose={() => setSuccess('')} />
          )}

          <form onSubmit={handleNext}>
            <div key={stepKey} className="animate-fade-in-up">
            {step === 0 && (
              <div className="space-y-4">
                <div className="flex gap-4">
                  <div className="w-1/2">
                    <ValidatedInput
                      label="First Name"
                      type="text"
                      value={userInfo.firstName}
                      onChange={(value) => setUserInfo({ ...userInfo, firstName: value })}
                      onValidation={(valid) => updateValidation('firstName', valid)}
                      validator={(value) => validateAuthInput.name(value, 'First name')}
                      placeholder="Enter first name"
                      required
                    />
                  </div>
                  <div className="w-1/2">
                    <ValidatedInput
                      label="Last Name"
                      type="text"
                      value={userInfo.lastName}
                      onChange={(value) => setUserInfo({ ...userInfo, lastName: value })}
                      onValidation={(valid) => updateValidation('lastName', valid)}
                      validator={(value) => validateAuthInput.name(value, 'Last name')}
                      placeholder="Enter last name"
                      required
                    />
                  </div>
                </div>
                <div className="flex gap-4">
                  <div className="w-1/2">
                    <ValidatedInput
                      label="Email"
                      type="email"
                      value={userInfo.email}
                      onChange={(value) => setUserInfo({ ...userInfo, email: value })}
                      onValidation={(valid) => updateValidation('email', valid)}
                      validator={validateAuthInput.email}
                      placeholder="your.email@company.com"
                      required
                    />
                  </div>
                  <div className="w-1/2">
                    <ValidatedInput
                      label="Phone Number"
                      type="tel"
                      value={userInfo.phone}
                      onChange={(value) => setUserInfo({ ...userInfo, phone: value })}
                      onValidation={(valid) => updateValidation('phone', valid)}
                      validator={(value) => {
                        const raw = String(value ?? '');
                        const t = raw.trim();
                        if (!t) return { valid: false, error: 'Phone number is required' };
                        if (t.length > 30) return { valid: false, error: 'Phone number is too long' };
                        // allow digits/spaces/+()- for international formats
                        if (!/^[+\d\s().-]+$/.test(t)) return { valid: false, error: 'Invalid phone number format' };
                        return { valid: true };
                      }}
                      placeholder="e.g. +62 812 3456 7890"
                      required
                    />
                  </div>
                </div>
                <ValidatedInput
                  label="Bio"
                  type="text"
                  value={userInfo.bio}
                  onChange={(value) => setUserInfo({ ...userInfo, bio: value })}
                  onValidation={(valid) => updateValidation('bio', valid)}
                  validator={(value) => {
                    const t = String(value ?? '').trim();
                    if (!t) return { valid: true }; // optional
                    if (t.length > 200) return { valid: false, error: 'Bio is too long (max 200 chars)' };
                    return { valid: true };
                  }}
                  placeholder="Optional"
                />
              </div>
            )}
            
            {step === 1 && (
              <div className="space-y-4">
                
                
                {/* Region Selection */}
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-gray-700">
                    Business Region <span className="text-red-500">*</span>
                  </label>
                  <div className="relative" ref={regionDropdownRef}>
                    <button
                      type="button"
                      onClick={() => setShowRegionDropdown(!showRegionDropdown)}
                      className="w-full px-3 py-2 border border-gray-300 text-black rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0a61d7] focus:border-transparent text-sm flex items-center justify-between hover:bg-gray-50 transition-colors"
                      aria-expanded={showRegionDropdown}
                      aria-label="Select business region"
                    >
                      <span>{getRegionDisplayName(getSelectedRegion())}</span>
                      <ChevronDown className="w-4 h-4 text-gray-500" />
                    </button>
                    {showRegionDropdown && (
                      <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-20 max-h-60 overflow-y-auto">
                        {REGIONS.map((region) => (
                          <button
                            key={region.code}
                            type="button"
                            onClick={() => handleRegionChange(region.code)}
                            className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-100 transition-colors ${
                              companyInfo.region === region.code ? 'font-bold text-[#0a61d7] bg-blue-50' : 'text-gray-700'
                            }`}
                          >
                            {getRegionDisplayName(region)}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <p className="text-xs text-gray-500">
                    Currency will be automatically set based on your region selection
                  </p>
                </div>
                <ValidatedInput
                  label="Company Name"
                  type="text"
                  value={companyInfo.company}
                  onChange={(value) => setCompanyInfo({ ...companyInfo, company: value })}
                  onValidation={(valid) => updateValidation('company', valid)}
                  validator={validateAuthInput.company}
                  placeholder="Your Distribution Company"
                  required
                />
                <ValidatedInput
                  label="Business Address"
                  type="text"
                  value={companyInfo.address}
                  onChange={(value) => setCompanyInfo({ ...companyInfo, address: value })}
                  placeholder="Complete business address"
                  required
                />
                <ValidatedInput
                  label="Years in Operation"
                  type="text"
                  value={companyInfo.yearsInOperation}
                  onChange={(value) => setCompanyInfo({ ...companyInfo, yearsInOperation: value })}
                  onValidation={(valid) => updateValidation('yearsInOperation', valid)}
                  validator={(value) => {
                    const t = String(value ?? '').trim();
                    if (!t) return { valid: false, error: 'Years in operation is required' };
                    if (t.length > 50) return { valid: false, error: 'Too long' };
                    return { valid: true };
                  }}
                  placeholder="e.g. 5 years"
                  required
                />
              </div>
            )}
            
            {step === 2 && (
              <div className="space-y-4">
                <ValidatedInput
                  label="Business Registration Number"
                  type="text"
                  value={businessCreds.businessRegistrationNumber}
                  onChange={(value) => setBusinessCreds({ ...businessCreds, businessRegistrationNumber: value })}
                  onValidation={(valid) => updateValidation('businessRegistrationNumber', valid)}
                  validator={(value) => {
                    const t = String(value ?? '').trim();
                    if (!t) return { valid: false, error: 'Business registration number is required' };
                    if (t.length > 80) return { valid: false, error: 'Too long' };
                    return { valid: true };
                  }}
                  placeholder="e.g. NIB123..."
                  required
                />
                <ValidatedInput
                  label="Tax ID"
                  type="text"
                  value={businessCreds.taxId}
                  onChange={(value) => setBusinessCreds({ ...businessCreds, taxId: value })}
                  onValidation={(valid) => updateValidation('taxId', valid)}
                  validator={(value) => {
                    const t = String(value ?? '').trim();
                    if (!t) return { valid: true }; // optional
                    if (t.length > 80) return { valid: false, error: 'Too long' };
                    return { valid: true };
                  }}
                  placeholder="Optional"
                />
                <ValidatedInput
                  label="Business Email"
                  type="email"
                  value={businessCreds.businessEmail}
                  onChange={(value) => setBusinessCreds({ ...businessCreds, businessEmail: value })}
                  onValidation={(valid) => updateValidation('businessEmail', valid)}
                  validator={validateAuthInput.email}
                  placeholder="contact@yourcompany.com"
                  required
                />
                <ValidatedInput
                  label="Business Phone Number"
                  type="tel"
                  value={companyInfo.businessPhone}
                  onChange={(value) => setCompanyInfo({ ...companyInfo, businessPhone: value })}
                  onValidation={(valid) => updateValidation('businessPhone', valid)}
                  validator={(value) => {
                    const t = String(value ?? '').trim();
                    if (!t) return { valid: false, error: 'Business phone number is required' };
                    if (t.length > 30) return { valid: false, error: 'Phone number is too long' };
                    if (!/^[+\d\s().-]+$/.test(t)) return { valid: false, error: 'Invalid phone number format' };
                    return { valid: true };
                  }}
                  placeholder="e.g. +62 812 3456 7890"
                  required
                />

                <div className="flex gap-4">
                  <div className="w-1/2 space-y-2">
                    <label className="block text-sm font-medium text-gray-700">
                      Industry Type <span className="text-red-500">*</span>
                    </label>
                    <div className="relative" ref={industryDropdownRef}>
                      <button
                        type="button"
                        onClick={() => setShowIndustryDropdown(!showIndustryDropdown)}
                        className="w-full px-3 py-2 border border-gray-300 text-black rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0a61d7] focus:border-transparent text-sm flex items-center justify-between hover:bg-gray-50 transition-colors"
                        aria-expanded={showIndustryDropdown}
                        aria-label="Select industry type"
                      >
                        <span>{businessCreds.industryType}</span>
                        <ChevronDown className="w-4 h-4 text-gray-500" />
                      </button>
                      {showIndustryDropdown && (
                        <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-20 max-h-60 overflow-y-auto">
                          {INDUSTRY_OPTIONS.map((opt) => (
                            <button
                              key={opt}
                              type="button"
                              onClick={() => {
                                setBusinessCreds({ ...businessCreds, industryType: opt });
                                setShowIndustryDropdown(false);
                                updateValidation('industryType', true);
                              }}
                              className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-100 transition-colors ${
                                businessCreds.industryType === opt ? 'font-bold text-[#0a61d7] bg-blue-50' : 'text-gray-700'
                              }`}
                            >
                              {opt}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="w-1/2 space-y-2">
                    <label className="block text-sm font-medium text-gray-700">
                      Company Size <span className="text-red-500">*</span>
                    </label>
                    <div className="relative" ref={companySizeDropdownRef}>
                      <button
                        type="button"
                        onClick={() => setShowCompanySizeDropdown(!showCompanySizeDropdown)}
                        className="w-full px-3 py-2 border border-gray-300 text-black rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0a61d7] focus:border-transparent text-sm flex items-center justify-between hover:bg-gray-50 transition-colors"
                        aria-expanded={showCompanySizeDropdown}
                        aria-label="Select company size"
                      >
                        <span>{businessCreds.companySize}</span>
                        <ChevronDown className="w-4 h-4 text-gray-500" />
                      </button>
                      {showCompanySizeDropdown && (
                        <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-20 max-h-60 overflow-y-auto">
                          {COMPANY_SIZE_OPTIONS.map((opt) => (
                            <button
                              key={opt}
                              type="button"
                              onClick={() => {
                                setBusinessCreds({ ...businessCreds, companySize: opt });
                                setShowCompanySizeDropdown(false);
                                updateValidation('companySize', true);
                              }}
                              className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-100 transition-colors ${
                                businessCreds.companySize === opt ? 'font-bold text-[#0a61d7] bg-blue-50' : 'text-gray-700'
                              }`}
                            >
                              {opt}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {step === 3 && (
              <div className="space-y-4">
                <p className="text-sm text-gray-600">
                  Bank details are shown to buyers when they pay for orders.
                </p>
                <ValidatedInput
                  label="Bank Name"
                  type="text"
                  value={paymentInfo.billingBankName}
                  onChange={(value) => setPaymentInfo({ ...paymentInfo, billingBankName: value })}
                  onValidation={(valid) => updateValidation('billingBankName', valid)}
                  validator={(value) => {
                    const t = String(value ?? '').trim();
                    if (!t) return { valid: false, error: 'Bank name is required' };
                    if (t.length > 120) return { valid: false, error: 'Too long' };
                    return { valid: true };
                  }}
                  placeholder="e.g. Bank Central Asia (BCA)"
                  required
                />
                <ValidatedInput
                  label="Account Holder Name"
                  type="text"
                  value={paymentInfo.billingBankAccountName}
                  onChange={(value) => setPaymentInfo({ ...paymentInfo, billingBankAccountName: value })}
                  onValidation={(valid) => updateValidation('billingBankAccountName', valid)}
                  validator={(value) => {
                    const t = String(value ?? '').trim();
                    if (!t) return { valid: false, error: 'Account holder name is required' };
                    if (t.length > 120) return { valid: false, error: 'Too long' };
                    return { valid: true };
                  }}
                  placeholder="Name on the bank account"
                  required
                />
                <ValidatedInput
                  label="Account Number"
                  type="text"
                  value={paymentInfo.billingBankAccountNumber}
                  onChange={(value) => setPaymentInfo({ ...paymentInfo, billingBankAccountNumber: value })}
                  onValidation={(valid) => updateValidation('billingBankAccountNumber', valid)}
                  validator={(value) => {
                    const t = String(value ?? '').trim();
                    if (!t) return { valid: false, error: 'Account number is required' };
                    if (t.length > 80) return { valid: false, error: 'Too long' };
                    return { valid: true };
                  }}
                  placeholder="Bank account number for buyer transfers"
                  required
                />
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Term of payment (days)
                  </label>
                  <div className="flex items-center gap-2 flex-wrap">
                    <input
                      type="number"
                      min={1}
                      step={1}
                      value={paymentInfo.buyerPaymentTermDays}
                      onChange={(e) => {
                        const raw = e.target.value;
                        const next = raw === '' ? '' : Number(raw);
                        setPaymentInfo({ ...paymentInfo, buyerPaymentTermDays: next });
                        if (raw === '') {
                          updateValidation('buyerPaymentTermDays', true);
                          return;
                        }
                        const days = Number(raw);
                        updateValidation(
                          'buyerPaymentTermDays',
                          Number.isInteger(days) && days >= 1,
                        );
                      }}
                      placeholder="e.g. 14"
                      className="w-full max-w-[120px] px-3 py-2 border border-gray-300 text-black rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0a61d7] focus:border-transparent text-sm"
                    />
                    <span className="text-sm text-gray-500">days</span>
                  </div>
                  <p className="mt-1 text-xs text-gray-500">
                    Shown to buyers on Pay Order for bank transfer. Leave empty if payment is due immediately.
                  </p>
                </div>
              </div>
            )}

            {step === 4 && (
              <div className="space-y-4">
                <h2 className="text-md font-semibold text-gray-900 flex items-center gap-2">
                  <Truck className="w-5 h-5 text-gray-500" />
                  Shipping & Delivery Configurations
                </h2>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Shipping Options <span className="text-red-500">*</span>
                  </label>
                  <p className="text-xs text-gray-500 mb-2">
                    Select the shipping methods you offer. Shipping costs are agreed directly between you and the buyer — no fees are set here.
                  </p>
                  <div className="flex flex-col gap-2">
                    {SHIPPING_OPTIONS.map((option) => (
                      <RegisterCheckbox
                        key={option}
                        label={option}
                        checked={shippingConfig.shippingPreferences.includes(option)}
                        onToggle={() => toggleShippingConfigArray('shippingPreferences', option)}
                      />
                    ))}
                  </div>
                </div>

                {shippingConfig.shippingPreferences.includes('Self Pickup') && (
                  <ValidatedInput
                    label="Pickup Address"
                    type="text"
                    value={shippingConfig.pickupAddress}
                    onChange={(value) => setShippingConfig({ ...shippingConfig, pickupAddress: value })}
                    onValidation={(valid) => updateValidation('pickupAddress', valid)}
                    validator={(value) => {
                      const t = String(value ?? '').trim();
                      if (!t) return { valid: false, error: 'Pickup address is required for Self Pickup' };
                      if (t.length > 500) return { valid: false, error: 'Too long' };
                      return { valid: true };
                    }}
                    placeholder="Where buyers can collect orders"
                    required
                  />
                )}

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Preferred Delivery Time Slots
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {DELIVERY_TIME_SLOTS.map((slot) => (
                      <RegisterCheckbox
                        key={slot}
                        label={slot}
                        checked={shippingConfig.deliveryTimeSlots.includes(slot)}
                        onToggle={() => toggleShippingConfigArray('deliveryTimeSlots', slot)}
                      />
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Preferred Delivery Days
                  </label>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {DELIVERY_DAYS.map((day) => (
                      <RegisterCheckbox
                        key={day}
                        label={day}
                        checked={shippingConfig.preferredDeliveryDays.includes(day)}
                        onToggle={() => toggleShippingConfigArray('preferredDeliveryDays', day)}
                      />
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Special Delivery Instructions
                  </label>
                  <textarea
                    value={shippingConfig.specialInstructions}
                    onChange={(e) => setShippingConfig({ ...shippingConfig, specialInstructions: e.target.value })}
                    rows={3}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0a61d7] focus:border-transparent text-black resize-none"
                    placeholder="Any special instructions for delivery"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Default delivery lead time (days)
                  </label>
                  <div className="flex items-center gap-2 flex-wrap">
                    <input
                      type="number"
                      min={0}
                      max={90}
                      value={shippingConfig.defaultDeliveryLeadTimeMinDays}
                      onChange={(e) => updateLeadTime('defaultDeliveryLeadTimeMinDays', e.target.value)}
                      placeholder="Min"
                      className="w-full max-w-[80px] px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0a61d7] focus:border-transparent text-black"
                    />
                    <span className="text-sm text-gray-500">to</span>
                    <input
                      type="number"
                      min={0}
                      max={90}
                      value={shippingConfig.defaultDeliveryLeadTimeMaxDays}
                      onChange={(e) => updateLeadTime('defaultDeliveryLeadTimeMaxDays', e.target.value)}
                      placeholder="Max"
                      className="w-full max-w-[80px] px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0a61d7] focus:border-transparent text-black"
                    />
                    <span className="text-sm text-gray-500">days</span>
                  </div>
                  <p className="mt-1 text-xs text-gray-500">
                    Used to suggest estimated delivery date when you confirm an order (e.g. 3 to 5 business days from confirmation). Leave empty to use defaults (3–7 days).
                  </p>
                  {!validationStates.deliveryLeadTime && (
                    <p className="mt-1 text-xs text-red-500">
                      Lead time must be whole days between 0 and 90, with min not greater than max.
                    </p>
                  )}
                </div>
              </div>
            )}

            {step === 5 && (
              <div className="space-y-4">
                <ValidatedInput
                  label="Password"
                  type="password"
                  value={password}
                  onChange={setPassword}
                  onValidation={(valid) => updateValidation('password', valid)}
                  validator={validateAuthInput.password}
                  placeholder="Create a strong password"
                  showPasswordStrength
                  required
                />
                <ValidatedInput
                  label="Confirm Password"
                  type="password"
                  value={confirmPassword}
                  onChange={setConfirmPassword}
                  onValidation={(valid) => updateValidation('confirmPassword', valid)}
                  validator={validateConfirmPassword}
                  placeholder="Confirm your password"
                  required
                />
              </div>
            )}
            
            <div className="flex justify-between mt-6">
              {step > 0 && (
                <button
                  type="button"
                  className="px-6 py-2 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-100 text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
                  onClick={handleBack}
                  disabled={loading}
                >
                  Back
                </button>
              )}
              <LoadingButton
                type="submit"
                loading={loading}
                loadingText={step < 5 ? "Processing..." : "Creating Account..."}
                disabled={!validateCurrentStep()}
                className="px-6 py-2 rounded-lg bg-[#0a61d7] text-white font-medium hover:bg-[#084ba6] ml-auto text-sm transition-colors"
              >
                {step < 5 ? "Next" : "Create Account"}
              </LoadingButton>
            </div>
            
            {/* Google Sign-in Option */}
            <div className="mt-2">
              <div className="flex items-center my-4">
                <div className="flex-1 border-t border-gray-300"></div>
                <span className="px-3 text-sm text-gray-500 bg-white">or</span>
                <div className="flex-1 border-t border-gray-300"></div>
              </div>
              
              <button
                type="button"
                onClick={async () => {
                  await signOut({ redirect: false });
                  signIn('google', { 
                    callbackUrl: '/home',
                    prompt: 'select_account'
                  });
                }}
                className="w-full py-2.5 px-4 border border-gray-300 rounded-lg flex items-center justify-center hover:bg-gray-50 transition-colors text-sm text-gray-700"
                disabled={loading}
              >
                <img src="/google.svg" alt="Google" className="h-5 w-5 mr-3" />
                Sign up with Google
              </button>
            </div>
            </div>
          </form>

          <div className="mt-6 flex flex-col items-center gap-3 border-t border-gray-100 pt-6 text-sm sm:flex-row sm:justify-between">
            <span className="text-gray-500">
              Already have an account?{' '}
              <a href="/login" className="font-semibold text-[#0a61d7] hover:underline">
                Log in here
              </a>
            </span>
            <a
              href="/en/docs"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#0a61d7] hover:underline"
            >
              Documentation
            </a>
          </div>
        </div>
      </main>
    </div>
  );
}
