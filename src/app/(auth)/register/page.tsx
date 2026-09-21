"use client";
import React, { useState, useCallback, useRef, useEffect } from "react";
import { validateAuthInput } from '@/utils/auth-security';
import { REGIONS, getRegionByCode } from '@/config/regionConfig';
import { ChevronDown, FileUp, MailCheck } from 'lucide-react';
import ReactCountryFlag from 'react-country-flag';
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
import { useAuthTranslations } from '@/hooks/useAuthTranslations';
import { AuthLanguageSwitcher } from '@/components/auth/AuthLanguageSwitcher';
import { AuthDecorativeBackground } from '@/components/auth/AuthDecorativeBackground';

const stepsCount = 6;
const FORM_LAST_STEP = 5;

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

type KycStoredFile = { url: string; name: string; publicId: string | null };

function KycFileField({
  label,
  hint,
  chooseLabel,
  replaceLabel,
  uploadingLabel,
  file,
  uploading,
  onFile,
}: {
  label: string;
  hint: string;
  chooseLabel: string;
  replaceLabel: string;
  uploadingLabel: string;
  file: KycStoredFile | null;
  uploading: boolean;
  onFile: (file: File | null) => void;
}) {
  return (
    <div className="space-y-1.5">
      <label className="block text-sm text-gray-500">
        {label} <span className="text-red-500">*</span>
      </label>
      <div className="flex items-center gap-3 rounded-lg border border-gray-200 bg-white px-3 py-2">
        <FileUp className="w-4 h-4 text-[#0a61d7] shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="text-sm text-gray-900 truncate">
            {uploading ? uploadingLabel : file?.name || chooseLabel}
          </p>
          <p className="text-[11px] text-gray-500">{hint}</p>
        </div>
        <label className="shrink-0 cursor-pointer text-xs font-semibold text-[#0a61d7] hover:underline">
          {file ? replaceLabel : chooseLabel}
          <input
            type="file"
            accept="application/pdf,image/jpeg,image/png,.pdf,.jpg,.jpeg,.png"
            className="sr-only"
            disabled={uploading}
            onChange={(e) => {
              const next = e.target.files?.[0] ?? null;
              onFile(next);
              e.target.value = '';
            }}
          />
        </label>
      </div>
    </div>
  );
}

function RegisterCheckbox({
  checked,
  onToggle,
  label,
  disabled = false,
}: {
  checked: boolean;
  onToggle: () => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <label className={`flex items-center space-x-2 ${disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}>
      <button
        type="button"
        role="checkbox"
        aria-checked={checked}
        aria-disabled={disabled}
        disabled={disabled}
        onClick={onToggle}
        className={`w-4 h-4 border-2 rounded transition-all duration-200 flex items-center justify-center focus:outline-none focus:ring-2 focus:ring-[#0a61d7] focus:ring-offset-2 ${
          checked
            ? 'bg-green-500 border-green-500'
            : 'bg-white border-gray-300 hover:border-green-400'
        } ${disabled ? 'pointer-events-none' : ''}`}
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
  const {
    locale,
    tRegister,
    tRegisterStep,
    tRegisterError,
    translateIndustry,
    translateCompanySize,
    translateShipping,
    translateTimeSlot,
    translateDay,
  } = useAuthTranslations();
  const steps = React.useMemo(
    () => Array.from({ length: stepsCount }, (_, index) => tRegisterStep(index)),
    [tRegisterStep, locale],
  );
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
  const [kycDocs, setKycDocs] = useState<{ nib: KycStoredFile | null; npwp: KycStoredFile | null }>({
    nib: null,
    npwp: null,
  });
  const [kycUploading, setKycUploading] = useState<'nib' | 'npwp' | null>(null);
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
          validationStates.businessPhone &&
          Boolean(kycDocs.nib?.url) &&
          Boolean(kycDocs.npwp?.url) &&
          kycUploading === null
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
  }, [step, userInfo, companyInfo, businessCreds, paymentInfo, shippingConfig, password, confirmPassword, validationStates, kycDocs, kycUploading]);

  const handleNext = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();
    setSuccess("");
    
    // Validate current step
    if (!validateCurrentStep()) {
      handleError({ error: tRegisterError('completeRequired') });
      return;
    }
    
    if (step < FORM_LAST_STEP) {
      // Move to next step
      setStep(step + 1);
      setStepKey(prev => prev + 1);
      return;
    }

    if (step > FORM_LAST_STEP) {
      return;
    }
    
    // Final step - submit registration
    startLoading(tRegister('creatingAccountLoading'));
    
    try {
      if (!kycDocs.nib?.url || !kycDocs.npwp?.url) {
        handleError({ error: tRegisterError('completeRequired') });
        return;
      }

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
          language: locale,
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
          nibDocumentUrl: kycDocs.nib.url,
          nibDocumentName: kycDocs.nib.name,
          nibDocumentPublicId: kycDocs.nib.publicId,
          npwpDocumentUrl: kycDocs.npwp.url,
          npwpDocumentName: kycDocs.npwp.name,
          npwpDocumentPublicId: kycDocs.npwp.publicId,
        }),
      });
      
      const data = await res.json();
      
      if (!res.ok) {
        handleError(data, tRegisterError('registrationFailed'));
        return;
      }

      setSuccess(tRegisterError('registrationSuccess'));
      setStep(6);
      setStepKey((prev) => prev + 1);
      
    } catch (err) {
      handleError({ error: tRegisterError('networkError') });
    } finally {
      stopLoading();
    }
  }, [step, userInfo, companyInfo, businessCreds, paymentInfo, shippingConfig, password, kycDocs, validateCurrentStep, handleError, clearError, startLoading, stopLoading, locale, tRegister, tRegisterError]);

  const handleBack = useCallback(() => {
    if (step > 0 && step <= FORM_LAST_STEP) {
      setStep(step - 1);
      setStepKey(prev => prev + 1);
      clearError(); // Clear error when going back
    }
  }, [step, clearError]);

  const handleKycFile = useCallback(async (kind: 'nib' | 'npwp', file: File | null) => {
    if (!file) {
      setKycDocs((prev) => ({ ...prev, [kind]: null }));
      return;
    }
    setKycUploading(kind);
    clearError();
    try {
      const fd = new FormData();
      fd.append('kind', kind);
      fd.append('file', file);
      const res = await fetch('/api/auth/register/kyc-upload', { method: 'POST', body: fd });
      const data = await res.json().catch(() => null);
      if (!res.ok || typeof data?.url !== 'string') {
        throw new Error(typeof data?.error === 'string' ? data.error : tRegisterError('kycUploadFailed'));
      }
      setKycDocs((prev) => ({
        ...prev,
        [kind]: {
          url: data.url,
          name: typeof data.name === 'string' ? data.name : file.name,
          publicId: typeof data.publicId === 'string' ? data.publicId : null,
        },
      }));
    } catch (err) {
      setKycDocs((prev) => ({ ...prev, [kind]: null }));
      handleError({
        error: err instanceof Error ? err.message : tRegisterError('kycUploadFailed'),
      });
    } finally {
      setKycUploading(null);
    }
  }, [clearError, handleError, tRegisterError]);

  const validateConfirmPassword = useCallback((confirmPw: string) => {
    if (!confirmPw) return { valid: false, error: tRegisterError('confirmPassword') };
    if (confirmPw !== password) return { valid: false, error: tRegisterError('passwordsMismatch') };
    return { valid: true };
  }, [password, tRegisterError]);

  const toggleShippingConfigArray = useCallback((
    field: 'shippingPreferences' | 'deliveryTimeSlots' | 'preferredDeliveryDays',
    option: string,
  ) => {
    setShippingConfig((prev) => {
      if (field === 'deliveryTimeSlots') {
        const current = prev.deliveryTimeSlots;
        const isFlexible = option === 'Flexible';
        const flexibleOn = current.includes('Flexible');
        if (isFlexible) {
          return {
            ...prev,
            deliveryTimeSlots: flexibleOn
              ? current.filter((o) => o !== 'Flexible')
              : [...DELIVERY_TIME_SLOTS],
          };
        }
        if (flexibleOn) return prev;
        const next = current.includes(option)
          ? current.filter((o) => o !== option)
          : [...current, option];
        return { ...prev, deliveryTimeSlots: next };
      }

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
    <div className="relative min-h-screen w-full overflow-hidden bg-gradient-to-b from-white via-[#f8fbff] to-[#eef4fd]">
      <AuthDecorativeBackground variant="light" />
      <main className="relative z-10 mx-auto flex w-full max-w-5xl flex-1 flex-col p-6 sm:p-6">
        <div className="mb-4 rounded-xl border border-white/80 bg-white/70 p-6 shadow-lg shadow-[#0a61d7]/5 backdrop-blur-sm text-center sm:text-left animate-fade-in-up">
          <a href="/" aria-label={tRegister('goHome')} className="inline-block mb-4">
            <img src="/Lakupak!.svg" alt="Lakupak" className="h-10" />
          </a>
          <h1 className="text-3xl font-bold text-gray-900 sm:text-4xl">{tRegister('title')}</h1>
          <p className="mt-2 text-gray-500">{tRegister('subtitle')}</p>
        </div>

        <div className="rounded-xl border border-white/80 bg-white/95 p-4 shadow-lg shadow-[#0a61d7]/5 backdrop-blur-sm sm:p-6 animate-fade-in-up">
          {step < 6 ? <RegistrationProgressBar steps={steps} currentStep={step} /> : null}

          {error && (
            <ErrorMessage message={error} onClose={clearError} />
          )}
          {success && (
            <SuccessMessage message={success} onClose={() => setSuccess('')} />
          )}

          <form onSubmit={handleNext}>
            <div key={stepKey} className="animate-fade-in-up">
            {step === 0 && (
              <div className="space-y-3">
                <div className="flex gap-3">
                  <div className="w-1/2">
                    <ValidatedInput
                      label={tRegister('firstName')}
                      type="text"
                      value={userInfo.firstName}
                      onChange={(value) => setUserInfo({ ...userInfo, firstName: value })}
                      onValidation={(valid) => updateValidation('firstName', valid)}
                      validator={(value) => validateAuthInput.name(value, tRegisterError('firstName'))}
                      placeholder={tRegister('firstNamePlaceholder')}
                      required
                    />
                  </div>
                  <div className="w-1/2">
                    <ValidatedInput
                      label={tRegister('lastName')}
                      type="text"
                      value={userInfo.lastName}
                      onChange={(value) => setUserInfo({ ...userInfo, lastName: value })}
                      onValidation={(valid) => updateValidation('lastName', valid)}
                      validator={(value) => validateAuthInput.name(value, tRegisterError('lastName'))}
                      placeholder={tRegister('lastNamePlaceholder')}
                      required
                    />
                  </div>
                </div>
                <div className="flex gap-3">
                  <div className="w-1/2">
                    <ValidatedInput
                      label={tRegister('email')}
                      type="email"
                      value={userInfo.email}
                      onChange={(value) => setUserInfo({ ...userInfo, email: value })}
                      onValidation={(valid) => updateValidation('email', valid)}
                      validator={validateAuthInput.email}
                      placeholder={tRegister('emailPlaceholder')}
                      required
                    />
                  </div>
                  <div className="w-1/2">
                    <ValidatedInput
                      label={tRegister('phoneNumber')}
                      type="tel"
                      value={userInfo.phone}
                      onChange={(value) => setUserInfo({ ...userInfo, phone: value })}
                      onValidation={(valid) => updateValidation('phone', valid)}
                      validator={(value) => {
                        const raw = String(value ?? '');
                        const t = raw.trim();
                        if (!t) return { valid: false, error: tRegisterError('phoneRequired') };
                        if (t.length > 30) return { valid: false, error: tRegisterError('phoneTooLong') };
                        if (!/^[+\d\s().-]+$/.test(t)) return { valid: false, error: tRegisterError('phoneInvalid') };
                        return { valid: true };
                      }}
                      placeholder={tRegister('phonePlaceholder')}
                      required
                    />
                  </div>
                </div>
                <ValidatedInput
                  label={tRegister('bio')}
                  type="text"
                  value={userInfo.bio}
                  onChange={(value) => setUserInfo({ ...userInfo, bio: value })}
                  onValidation={(valid) => updateValidation('bio', valid)}
                  validator={(value) => {
                    const t = String(value ?? '').trim();
                    if (!t) return { valid: true };
                    if (t.length > 200) return { valid: false, error: tRegisterError('bioTooLong') };
                    return { valid: true };
                  }}
                  placeholder={tRegister('bioPlaceholder')}
                />
              </div>
            )}
            
            {step === 1 && (
              <div className="space-y-3">
                
                
                {/* Region Selection */}
                <div className="space-y-2">
                  <label className="block text-sm text-gray-500">
                    {tRegister('businessRegion')} <span className="text-red-500">*</span>
                  </label>
                  <div className="relative" ref={regionDropdownRef}>
                    <button
                      type="button"
                      onClick={() => setShowRegionDropdown(!showRegionDropdown)}
                      className="w-full px-3 py-2 border border-gray-300 text-black rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0a61d7] focus:border-transparent text-sm flex items-center justify-between hover:bg-gray-50 transition-colors"
                      aria-expanded={showRegionDropdown}
                      aria-label={tRegister('selectBusinessRegion')}
                    >
                      <div className="flex items-center gap-2">
                        <ReactCountryFlag
                          countryCode={getSelectedRegion().code}
                          svg
                          style={{
                            width: '20px',
                            height: '15px',
                            borderRadius: '2px',
                          }}
                        />
                        <span>{getSelectedRegion().name}</span>
                      </div>
                      <ChevronDown className="w-4 h-4 text-gray-500" />
                    </button>
                    {showRegionDropdown && (
                      <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-20 max-h-60 overflow-y-auto">
                        {REGIONS.map((region) => (
                          <button
                            key={region.code}
                            type="button"
                            onClick={() => handleRegionChange(region.code)}
                            className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-100 transition-colors flex items-center gap-2 ${
                              companyInfo.region === region.code ? 'font-bold text-[#0a61d7] bg-blue-50' : 'text-gray-700'
                            }`}
                          >
                            <ReactCountryFlag
                              countryCode={region.code}
                              svg
                              style={{
                                width: '20px',
                                height: '15px',
                                borderRadius: '2px',
                              }}
                            />
                            <span>{region.name}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <p className="text-xs text-gray-500">
                    {tRegister('regionCurrencyHint')}
                  </p>
                </div>
                <ValidatedInput
                  label={tRegister('companyName')}
                  type="text"
                  value={companyInfo.company}
                  onChange={(value) => setCompanyInfo({ ...companyInfo, company: value })}
                  onValidation={(valid) => updateValidation('company', valid)}
                  validator={validateAuthInput.company}
                  placeholder={tRegister('companyNamePlaceholder')}
                  required
                />
                <ValidatedInput
                  label={tRegister('businessAddress')}
                  type="text"
                  value={companyInfo.address}
                  onChange={(value) => setCompanyInfo({ ...companyInfo, address: value })}
                  placeholder={tRegister('businessAddressPlaceholder')}
                  required
                />
                <ValidatedInput
                  label={tRegister('yearsInOperation')}
                  type="text"
                  value={companyInfo.yearsInOperation}
                  onChange={(value) => setCompanyInfo({ ...companyInfo, yearsInOperation: value })}
                  onValidation={(valid) => updateValidation('yearsInOperation', valid)}
                  validator={(value) => {
                    const t = String(value ?? '').trim();
                    if (!t) return { valid: false, error: tRegisterError('yearsRequired') };
                    if (t.length > 50) return { valid: false, error: tRegisterError('tooLong') };
                    return { valid: true };
                  }}
                  placeholder={tRegister('yearsInOperationPlaceholder')}
                  required
                />
              </div>
            )}
            
            {step === 2 && (
              <div className="space-y-3">
                <ValidatedInput
                  label={tRegister('businessRegistrationNumber')}
                  type="text"
                  value={businessCreds.businessRegistrationNumber}
                  onChange={(value) => setBusinessCreds({ ...businessCreds, businessRegistrationNumber: value })}
                  onValidation={(valid) => updateValidation('businessRegistrationNumber', valid)}
                  validator={(value) => {
                    const t = String(value ?? '').trim();
                    if (!t) return { valid: false, error: tRegisterError('businessRegistrationRequired') };
                    if (t.length > 80) return { valid: false, error: tRegisterError('tooLong') };
                    return { valid: true };
                  }}
                  placeholder={tRegister('businessRegistrationPlaceholder')}
                  required
                />
                <ValidatedInput
                  label={tRegister('taxId')}
                  type="text"
                  value={businessCreds.taxId}
                  onChange={(value) => setBusinessCreds({ ...businessCreds, taxId: value })}
                  onValidation={(valid) => updateValidation('taxId', valid)}
                  validator={(value) => {
                    const t = String(value ?? '').trim();
                    if (!t) return { valid: true };
                    if (t.length > 80) return { valid: false, error: tRegisterError('tooLong') };
                    return { valid: true };
                  }}
                  placeholder={tRegister('optional')}
                />
                <KycFileField
                  label={tRegister('nibDocument')}
                  hint={tRegister('kycUploadHint')}
                  chooseLabel={tRegister('kycChooseFile')}
                  replaceLabel={tRegister('kycReplaceFile')}
                  uploadingLabel={tRegister('kycUploading')}
                  file={kycDocs.nib}
                  uploading={kycUploading === 'nib'}
                  onFile={(file) => void handleKycFile('nib', file)}
                />
                <KycFileField
                  label={tRegister('npwpDocument')}
                  hint={tRegister('kycUploadHint')}
                  chooseLabel={tRegister('kycChooseFile')}
                  replaceLabel={tRegister('kycReplaceFile')}
                  uploadingLabel={tRegister('kycUploading')}
                  file={kycDocs.npwp}
                  uploading={kycUploading === 'npwp'}
                  onFile={(file) => void handleKycFile('npwp', file)}
                />
                <ValidatedInput
                  label={tRegister('businessEmail')}
                  type="email"
                  value={businessCreds.businessEmail}
                  onChange={(value) => setBusinessCreds({ ...businessCreds, businessEmail: value })}
                  onValidation={(valid) => updateValidation('businessEmail', valid)}
                  validator={validateAuthInput.email}
                  placeholder={tRegister('businessEmailPlaceholder')}
                  required
                />
                <ValidatedInput
                  label={tRegister('businessPhoneNumber')}
                  type="tel"
                  value={companyInfo.businessPhone}
                  onChange={(value) => setCompanyInfo({ ...companyInfo, businessPhone: value })}
                  onValidation={(valid) => updateValidation('businessPhone', valid)}
                  validator={(value) => {
                    const t = String(value ?? '').trim();
                    if (!t) return { valid: false, error: tRegisterError('businessPhoneRequired') };
                    if (t.length > 30) return { valid: false, error: tRegisterError('phoneTooLong') };
                    if (!/^[+\d\s().-]+$/.test(t)) return { valid: false, error: tRegisterError('phoneInvalid') };
                    return { valid: true };
                  }}
                  placeholder={tRegister('phonePlaceholder')}
                  required
                />

                <div className="flex gap-4">
                  <div className="w-1/2 space-y-2">
                    <label className="block text-sm text-gray-500">
                      {tRegister('industryType')} <span className="text-red-500">*</span>
                    </label>
                    <div className="relative" ref={industryDropdownRef}>
                      <button
                        type="button"
                        onClick={() => setShowIndustryDropdown(!showIndustryDropdown)}
                        className="w-full px-3 py-2 border border-gray-300 text-black rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0a61d7] focus:border-transparent text-sm flex items-center justify-between hover:bg-gray-50 transition-colors"
                        aria-expanded={showIndustryDropdown}
                        aria-label={tRegister('selectIndustryType')}
                      >
                        <span>{translateIndustry(businessCreds.industryType)}</span>
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
                              {translateIndustry(opt)}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="w-1/2 space-y-2">
                    <label className="block text-sm text-gray-500">
                      {tRegister('companySize')} <span className="text-red-500">*</span>
                    </label>
                    <div className="relative" ref={companySizeDropdownRef}>
                      <button
                        type="button"
                        onClick={() => setShowCompanySizeDropdown(!showCompanySizeDropdown)}
                        className="w-full px-3 py-2 border border-gray-300 text-black rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0a61d7] focus:border-transparent text-sm flex items-center justify-between hover:bg-gray-50 transition-colors"
                        aria-expanded={showCompanySizeDropdown}
                        aria-label={tRegister('selectCompanySize')}
                      >
                        <span>{translateCompanySize(businessCreds.companySize)}</span>
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
                              {translateCompanySize(opt)}
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
              <div className="space-y-3">
                <p className="text-sm font-medium text-gray-700">
                  {tRegister('bankDetailsHint')}
                </p>
                <ValidatedInput
                  label={tRegister('bankName')}
                  type="text"
                  value={paymentInfo.billingBankName}
                  onChange={(value) => setPaymentInfo({ ...paymentInfo, billingBankName: value })}
                  onValidation={(valid) => updateValidation('billingBankName', valid)}
                  validator={(value) => {
                    const t = String(value ?? '').trim();
                    if (!t) return { valid: false, error: tRegisterError('bankNameRequired') };
                    if (t.length > 120) return { valid: false, error: tRegisterError('tooLong') };
                    return { valid: true };
                  }}
                  placeholder={tRegister('bankNamePlaceholder')}
                  required
                />
                <ValidatedInput
                  label={tRegister('accountHolderName')}
                  type="text"
                  value={paymentInfo.billingBankAccountName}
                  onChange={(value) => setPaymentInfo({ ...paymentInfo, billingBankAccountName: value })}
                  onValidation={(valid) => updateValidation('billingBankAccountName', valid)}
                  validator={(value) => {
                    const t = String(value ?? '').trim();
                    if (!t) return { valid: false, error: tRegisterError('accountHolderRequired') };
                    if (t.length > 120) return { valid: false, error: tRegisterError('tooLong') };
                    return { valid: true };
                  }}
                  placeholder={tRegister('accountHolderPlaceholder')}
                  required
                />
                <ValidatedInput
                  label={tRegister('accountNumber')}
                  type="text"
                  value={paymentInfo.billingBankAccountNumber}
                  onChange={(value) => setPaymentInfo({ ...paymentInfo, billingBankAccountNumber: value })}
                  onValidation={(valid) => updateValidation('billingBankAccountNumber', valid)}
                  validator={(value) => {
                    const t = String(value ?? '').trim();
                    if (!t) return { valid: false, error: tRegisterError('accountNumberRequired') };
                    if (t.length > 80) return { valid: false, error: tRegisterError('tooLong') };
                    return { valid: true };
                  }}
                  placeholder={tRegister('accountNumberPlaceholder')}
                  required
                />
                <div>
                  <label className="block text-sm text-gray-500 mb-2">
                    {tRegister('paymentTermDays')}
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
                      placeholder={tRegister('paymentTermPlaceholder')}
                      className="w-full max-w-[120px] px-3 py-2 border border-gray-300 text-black rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0a61d7] focus:border-transparent text-sm"
                    />
                    <span className="text-sm text-gray-500">{tRegister('days')}</span>
                  </div>
                </div>
              </div>
            )}

            {step === 4 && (
              <div className="space-y-3">
                <div>
                  <label className="block text-sm text-gray-500 mb-1">
                    {tRegister('shippingOptions')} <span className="text-red-500">*</span>
                  </label>
                  <p className="text-xs text-gray-500 mb-2">
                    {tRegister('shippingOptionsHint')}
                  </p>
                  <div className="flex flex-col gap-2">
                    {SHIPPING_OPTIONS.map((option) => (
                      <RegisterCheckbox
                        key={option}
                        label={translateShipping(option)}
                        checked={shippingConfig.shippingPreferences.includes(option)}
                        onToggle={() => toggleShippingConfigArray('shippingPreferences', option)}
                      />
                    ))}
                  </div>
                </div>

                {shippingConfig.shippingPreferences.includes('Self Pickup') && (
                  <ValidatedInput
                    label={tRegister('pickupAddress')}
                    type="text"
                    value={shippingConfig.pickupAddress}
                    onChange={(value) => setShippingConfig({ ...shippingConfig, pickupAddress: value })}
                    onValidation={(valid) => updateValidation('pickupAddress', valid)}
                    validator={(value) => {
                      const t = String(value ?? '').trim();
                      if (!t) return { valid: false, error: tRegisterError('pickupAddressRequired') };
                      if (t.length > 500) return { valid: false, error: tRegisterError('tooLong') };
                      return { valid: true };
                    }}
                    placeholder={tRegister('pickupAddressPlaceholder')}
                    required
                  />
                )}

                <div>
                  <label className="block text-sm text-gray-500 mb-2">
                    {tRegister('preferredTimeSlots')}
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {DELIVERY_TIME_SLOTS.map((slot) => (
                      <RegisterCheckbox
                        key={slot}
                        label={translateTimeSlot(slot)}
                        checked={shippingConfig.deliveryTimeSlots.includes(slot)}
                        disabled={slot !== 'Flexible' && shippingConfig.deliveryTimeSlots.includes('Flexible')}
                        onToggle={() => toggleShippingConfigArray('deliveryTimeSlots', slot)}
                      />
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-sm text-gray-500 mb-2">
                    {tRegister('preferredDeliveryDays')}
                  </label>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {DELIVERY_DAYS.map((day) => (
                      <RegisterCheckbox
                        key={day}
                        label={translateDay(day)}
                        checked={shippingConfig.preferredDeliveryDays.includes(day)}
                        onToggle={() => toggleShippingConfigArray('preferredDeliveryDays', day)}
                      />
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-sm text-gray-500 mb-2">
                    {tRegister('specialInstructions')}
                  </label>
                  <textarea
                    value={shippingConfig.specialInstructions}
                    onChange={(e) => setShippingConfig({ ...shippingConfig, specialInstructions: e.target.value })}
                    rows={3}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0a61d7] focus:border-transparent text-black resize-none"
                    placeholder={tRegister('specialInstructionsPlaceholder')}
                  />
                </div>

                <div>
                  <label className="block text-sm text-gray-500 mb-2">
                    {tRegister('defaultLeadTime')}
                  </label>
                  <div className="flex items-center gap-2 flex-wrap">
                    <input
                      type="number"
                      min={0}
                      max={90}
                      value={shippingConfig.defaultDeliveryLeadTimeMinDays}
                      onChange={(e) => updateLeadTime('defaultDeliveryLeadTimeMinDays', e.target.value)}
                      placeholder={tRegister('min')}
                      className="w-full max-w-[80px] px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0a61d7] focus:border-transparent text-black"
                    />
                    <span className="text-sm text-gray-500">{tRegister('to')}</span>
                    <input
                      type="number"
                      min={0}
                      max={90}
                      value={shippingConfig.defaultDeliveryLeadTimeMaxDays}
                      onChange={(e) => updateLeadTime('defaultDeliveryLeadTimeMaxDays', e.target.value)}
                      placeholder={tRegister('max')}
                      className="w-full max-w-[80px] px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0a61d7] focus:border-transparent text-black"
                    />
                    <span className="text-sm text-gray-500">{tRegister('days')}</span>
                  </div>
                  <p className="mt-1 text-xs text-gray-500">
                    {tRegister('leadTimeHint')}
                  </p>
                  {!validationStates.deliveryLeadTime && (
                    <p className="mt-1 text-xs text-red-500">
                      {tRegister('leadTimeError')}
                    </p>
                  )}
                </div>
              </div>
            )}

            {step === 5 && (
              <div className="space-y-3">
                <ValidatedInput
                  label={tRegister('password')}
                  type="password"
                  value={password}
                  onChange={setPassword}
                  onValidation={(valid) => updateValidation('password', valid)}
                  validator={validateAuthInput.password}
                  placeholder={tRegister('passwordPlaceholder')}
                  showPasswordStrength
                  required
                />
                <ValidatedInput
                  label={tRegister('confirmPassword')}
                  type="password"
                  value={confirmPassword}
                  onChange={setConfirmPassword}
                  onValidation={(valid) => updateValidation('confirmPassword', valid)}
                  validator={validateConfirmPassword}
                  placeholder={tRegister('confirmPasswordPlaceholder')}
                  required
                />
              </div>
            )}

            {step === 6 && (
              <div className="py-6 text-center space-y-4">
                <MailCheck className="w-12 h-12 text-[#0a61d7] mx-auto" />
                <h2 className="text-xl font-semibold text-gray-900">{tRegister('pendingTitle')}</h2>
                <p className="text-sm text-gray-600 max-w-md mx-auto">
                  {tRegister('pendingBody', { email: userInfo.email.trim() })}
                </p>
                <p className="text-sm text-gray-500">{tRegister('pendingCheckInbox')}</p>
                <a
                  href="/login"
                  className="inline-flex items-center justify-center px-6 py-2.5 rounded-lg bg-[#0a61d7] text-white text-sm font-semibold hover:bg-[#084ba6]"
                >
                  {tRegister('goToLogin')}
                </a>
              </div>
            )}
            
            {step < 6 && (
            <div className="flex justify-between mt-6">
              {step > 0 && (
                <button
                  type="button"
                  className="px-6 py-2 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-100 text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
                  onClick={handleBack}
                  disabled={loading}
                >
                  {tRegister('back')}
                </button>
              )}
              <LoadingButton
                type="submit"
                loading={loading}
                loadingText={step < FORM_LAST_STEP ? tRegister('processing') : tRegister('creatingAccount')}
                disabled={!validateCurrentStep()}
                className="px-6 py-2 rounded-lg bg-[#0a61d7] text-white font-medium hover:bg-[#084ba6] ml-auto text-sm transition-colors"
              >
                {step < FORM_LAST_STEP ? tRegister('next') : tRegister('createAccount')}
              </LoadingButton>
            </div>
            )}
            </div>
          </form>

          <div className="mt-6 flex flex-col items-center gap-3 border-t border-gray-100 pt-6 text-sm sm:flex-row sm:justify-between">
            <span className="text-gray-500">
              {tRegister('alreadyHaveAccount')}{' '}
              <a href="/login" className="font-semibold text-[#0a61d7] hover:underline">
                {tRegister('logInHere')}
              </a>
            </span>
            <div className="flex items-center gap-3">
              <a
                href={`/${locale}/docs`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[#0a61d7] hover:underline"
              >
                {tRegister('documentation')}
              </a>
              <AuthLanguageSwitcher variant="register" />
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
