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

const steps = ["User Info", "Company Info", "Set Password"];

export default function RegisterPage() {
  const [step, setStep] = useState(0);
  const [stepKey, setStepKey] = useState(0);
  
  // Form data
  const [userInfo, setUserInfo] = useState({ firstName: "", lastName: "", email: "" });
  const [companyInfo, setCompanyInfo] = useState({ company: "", address: "", region: "ID" });
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showRegionDropdown, setShowRegionDropdown] = useState(false);
  const regionDropdownRef = useRef<HTMLDivElement>(null);
  
  // Validation states
  const [validationStates, setValidationStates] = useState({
    firstName: true,
    lastName: true,
    email: true,
    company: true,
    address: true,
    region: true,
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
          validationStates.firstName && 
          validationStates.lastName && 
          validationStates.email
        );
      case 1:
        return (
          companyInfo.company.trim() && 
          companyInfo.address.trim() && 
          companyInfo.region &&
          validationStates.company &&
          validationStates.region
        );
      case 2:
        return (
          password && 
          confirmPassword && 
          password === confirmPassword && 
          validationStates.password
        );
      default:
        return false;
    }
  }, [step, userInfo, companyInfo, password, confirmPassword, validationStates]);

  const handleNext = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();
    setSuccess("");
    
    // Validate current step
    if (!validateCurrentStep()) {
      handleError({ error: "Please complete all required fields correctly." });
      return;
    }
    
    if (step < 2) {
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
          password,
          company: companyInfo.company.trim(),
          address: companyInfo.address.trim(),
          region: companyInfo.region,
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
        id: data.id,
        firstName: data.firstName,
        lastName: data.lastName,
        email: data.email,
        companyId: data.companyId,
        company: data.company,
        region: data.region,
        currency: data.currency,
      }, true); // Auto-remember new registrations
      
      // Track successful registration
      if (typeof window !== 'undefined' && window.gtag) {
        window.gtag('event', 'sign_up', {
          event_category: 'Authentication',
          event_label: 'Email Registration',
          value: 1
        });
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
  }, [step, userInfo, companyInfo, password, validateCurrentStep, router, setUser, handleError, clearError, startLoading, stopLoading]);

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
    };

    if (showRegionDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showRegionDropdown]);

  return (
    <div className="grid grid-cols-9 min-h-screen w-full flex bg-white">
      {/* Left: Registration Form */}
      <div className="col-span-4 flex flex-col justify-center p-16 bg-white animate-fade-in-left">
        <div>
          <a href="/" aria-label="Go to homepage">
            <img src="/LakuLakuTextLogo.svg" alt="Laku-Laku Logo" className="h-13 mb-4" />
          </a>
        </div>
        <h2 className="text-3xl text-black font-bold mb-2">Create Distributor Account</h2>
        <p className="mb-8 text-gray-500">Register your distributor account in three easy steps.</p>
        
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
              </div>
            )}
            
            {step === 2 && (
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
                loadingText={step < 2 ? "Processing..." : "Creating Account..."}
                disabled={!validateCurrentStep()}
                className="px-6 py-2 rounded-lg bg-[#0a61d7] text-white font-medium hover:bg-[#084ba6] ml-auto text-sm transition-colors"
              >
                {step < 2 ? "Next" : "Create Account"}
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
        <div className="flex items-center mt-4 text-sm">
          <span className="text-gray-500">Already have an account?</span>
          <a href="/login" className="ml-2 text-[#0a61d7] font-semibold hover:underline">Log in here</a>
        </div>
      </div>
      {/* Right: Placeholder for Distribution/Retailing Image */}
      <div className="col-span-5 bg-blue-600 flex items-center justify-center animate-fade-in-right">
        <span className="text-white text-2xl font-bold">[Distribution/Retailing Image Placeholder]</span>
      </div>
    </div>
  );
}
