"use client";
import React, { useState, useCallback, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { signIn, signOut } from "next-auth/react";
import { useUserStore } from '@/store/userStore';
import { validateAuthInput } from '@/utils/auth-security';
import { REGIONS, getRegionByCode, getRegionDisplayName, getCurrencyDisplayName } from '@/config/regionConfig';
import { ChevronDown } from 'lucide-react';
import { 
  useAuthErrorHandler, 
  useAuthLoading, 
  useAuthPerformanceTracking,
  ValidatedInput,
  ErrorMessage,
  SuccessMessage,
  LoadingButton,
  FormStepIndicator
} from '@/utils/auth-enhancements';

const steps = ["User Info", "Company Info", "Business Credentials", "Set Password"];

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
    industryType: "Wholesale & Distribution",
    companySize: "11-50 employees",
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
    industryType: true,
    companySize: true,
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
          businessCreds.industryType.trim() &&
          businessCreds.companySize.trim() &&
          companyInfo.businessPhone.trim() &&
          validationStates.businessRegistrationNumber &&
          validationStates.industryType &&
          validationStates.companySize &&
          validationStates.taxId &&
          validationStates.businessPhone
        );
      case 3:
        return (
          password && 
          confirmPassword && 
          password === confirmPassword && 
          validationStates.password
        );
      default:
        return false;
    }
  }, [step, userInfo, companyInfo, businessCreds, password, confirmPassword, validationStates]);

  const handleNext = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();
    setSuccess("");
    
    // Validate current step
    if (!validateCurrentStep()) {
      handleError({ error: "Please complete all required fields correctly." });
      return;
    }
    
    if (step < 3) {
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
          taxId: businessCreds.taxId.trim(),
          industryType: businessCreds.industryType.trim(),
          companySize: businessCreds.companySize.trim(),
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
  }, [step, userInfo, companyInfo, businessCreds, password, validateCurrentStep, router, setUser, handleError, clearError, startLoading, stopLoading]);

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
    <div className="grid grid-cols-9 min-h-screen w-full bg-white">
      {/* Left: Registration Form */}
      <div className="col-span-4 flex flex-col justify-center p-16 bg-white animate-fade-in-left">
        <div>
          <a href="/" aria-label="Go to homepage">
            <img src="/LakuTextLogo.svg" alt="Laku Logo" className="h-13 mb-4" />
          </a>
        </div>
        <h2 className="text-3xl text-black font-bold mb-2">Create Distributor Account</h2>
        <p className="mb-8 text-gray-500">Register your distributor account in four easy steps.</p>
        
        <FormStepIndicator steps={steps} currentStep={step} />
        
        {/* Enhanced Error/Success Messages */}
        {error && (
          <ErrorMessage 
            message={error} 
            onClose={clearError}
          />
        )}
        {success && (
          <SuccessMessage 
            message={success}
            onClose={() => setSuccess('')}
          />
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
                  label="Company Address"
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
                loadingText={step < 3 ? "Processing..." : "Creating Account..."}
                disabled={!validateCurrentStep()}
                className="px-6 py-2 rounded-lg bg-[#0a61d7] text-white font-medium hover:bg-[#084ba6] ml-auto text-sm transition-colors"
              >
                {step < 3 ? "Next" : "Create Account"}
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
        {/* Login redirect prompt */}
        <div className="mt-4 flex items-center text-sm">
          <span className="text-gray-500">Already have an account?</span>
          <a href="/login" className="ml-2 text-[#0a61d7] font-semibold hover:underline">Log in here</a>
        </div>
        <p className="mt-3 text-sm text-gray-500">
          <a
            href="/en/docs"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[#0a61d7] hover:underline"
          >
            Documentation
          </a>
        </p>
      </div>
      {/* Right: Placeholder for Distribution/Retailing Image */}
      <div className="col-span-5 bg-blue-600 flex items-center justify-center animate-fade-in-right">
        <span className="text-white text-2xl font-bold">[Distribution/Retailing Image Placeholder]</span>
      </div>
    </div>
  );
}
