// Production-ready authentication UI enhancements
import React, { useState, useCallback, useEffect } from 'react';
import { getPasswordStrength } from './auth-security';

// Enhanced error handling hook
export const useAuthErrorHandler = () => {
  const [error, setError] = useState<string>('');

  const handleError = useCallback((errorResponse: { error?: string } | unknown, defaultMessage = 'An error occurred') => {
    if (errorResponse && typeof errorResponse === 'object' && 'error' in errorResponse && typeof errorResponse.error === 'string') {
      setError(errorResponse.error);
    } else {
      setError(defaultMessage);
    }
  }, []);

  const clearError = useCallback(() => {
    setError('');
  }, []);

  return { error, handleError, clearError };
};

// Enhanced loading state hook
export const useAuthLoading = () => {
  const [loading, setLoading] = useState(false);
  const [loadingText, setLoadingText] = useState('');

  const startLoading = useCallback((text = 'Processing...') => {
    setLoading(true);
    setLoadingText(text);
  }, []);

  const stopLoading = useCallback(() => {
    setLoading(false);
    setLoadingText('');
  }, []);

  return { loading, loadingText, startLoading, stopLoading };
};

// Password strength indicator component
export const PasswordStrengthIndicator: React.FC<{ password: string }> = ({ password }) => {
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

// Enhanced input field with validation
interface ValidatedInputProps {
  label: string;
  type: string;
  value: string;
  onChange: (value: string) => void;
  onValidation?: (isValid: boolean, error?: string) => void;
  validator?: (value: string) => { valid: boolean; error?: string };
  placeholder?: string;
  required?: boolean;
  showPasswordStrength?: boolean;
  className?: string;
}

export const ValidatedInput: React.FC<ValidatedInputProps> = ({
  label,
  type,
  value,
  onChange,
  onValidation,
  validator,
  placeholder,
  required = false,
  showPasswordStrength = false,
  className = ''
}) => {
  const [touched, setTouched] = useState(false);
  const [validationError, setValidationError] = useState<string>('');

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    onChange(newValue);
    
    if (validator && touched) {
      const result = validator(newValue);
      setValidationError(result.valid ? '' : result.error || '');
      onValidation?.(result.valid, result.error);
    }
  }, [onChange, validator, touched, onValidation]);

  const handleBlur = useCallback(() => {
    setTouched(true);
    if (validator) {
      const result = validator(value);
      setValidationError(result.valid ? '' : result.error || '');
      onValidation?.(result.valid, result.error);
    }
  }, [validator, value, onValidation]);

  const hasError = touched && validationError;
  const inputClasses = `w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 text-sm transition-colors ${
    hasError 
      ? 'border-red-300 focus:ring-red-500 bg-red-50' 
      : 'border-gray-200 focus:ring-blue-500 bg-white'
  } text-black ${className}`;

  return (
    <div className="space-y-1">
      <label className="block text-sm text-gray-500">
        {label}
        {required && <span className="text-red-500 ml-1">*</span>}
      </label>
      <input
        type={type}
        value={value}
        onChange={handleChange}
        onBlur={handleBlur}
        placeholder={placeholder}
        className={inputClasses}
        required={required}
        autoComplete={type === 'password' ? 'current-password' : 'on'}
      />
      {hasError && (
        <p className="text-red-500 text-xs mt-1">{validationError}</p>
      )}
      {showPasswordStrength && type === 'password' && value && (
        <PasswordStrengthIndicator password={value} />
      )}
    </div>
  );
};

// Success message component
export const SuccessMessage: React.FC<{ message: string; onClose?: () => void }> = ({ 
  message, 
  onClose 
}) => (
  <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-4">
    <div className="flex items-center justify-between">
      <div className="flex items-center">
        <div className="flex-shrink-0">
          <svg className="h-5 w-5 text-green-400" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
          </svg>
        </div>
        <p className="ml-3 text-sm font-medium text-green-800">{message}</p>
      </div>
      {onClose && (
        <button
          onClick={onClose}
          className="text-green-400 hover:text-green-600 transition-colors"
        >
          <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
          </svg>
        </button>
      )}
    </div>
  </div>
);

// Enhanced error message component
export const ErrorMessage: React.FC<{ 
  message: string; 
  onClose?: () => void;
}> = ({ message, onClose }) => (
  <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
    <div className="flex items-center justify-between">
      <div className="flex items-center">
        <div className="flex-shrink-0">
          <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
          </svg>
        </div>
        <div className="ml-3">
          <p className="text-sm font-medium text-red-800">{message}</p>
        </div>
      </div>
      {onClose && (
        <button
          onClick={onClose}
          className="text-red-400 hover:text-red-600 transition-colors"
        >
          <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
          </svg>
        </button>
      )}
    </div>
  </div>
);

// Loading button component
export const LoadingButton: React.FC<{
  loading: boolean;
  loadingText?: string;
  children: React.ReactNode;
  className?: string;
  disabled?: boolean;
  onClick?: () => void;
  type?: 'button' | 'submit';
}> = ({ 
  loading, 
  loadingText = 'Loading...', 
  children, 
  className = '', 
  disabled = false,
  onClick,
  type = 'button'
}) => (
  <button
    type={type}
    onClick={onClick}
    disabled={loading || disabled}
    className={`relative flex items-center justify-center transition-all duration-200 ${
      loading || disabled ? 'opacity-60 cursor-not-allowed' : ''
    } ${className}`}
  >
    {loading && (
      <svg className="animate-spin -ml-1 mr-3 h-4 w-4 text-current" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
      </svg>
    )}
    {loading ? loadingText : children}
  </button>
);

// Performance tracking hook for auth pages
export const useAuthPerformanceTracking = (pageName: string) => {
  useEffect(() => {
    const startTime = performance.now();
    
    return () => {
      const endTime = performance.now();
      const loadTime = endTime - startTime;
      
      // Track auth page performance
      if (typeof window !== 'undefined' && window.gtag) {
        window.gtag('event', 'page_load_time', {
          event_category: 'Authentication',
          event_label: pageName,
          value: Math.round(loadTime),
          custom_parameter: 'auth_performance'
        });
      }
      
      // Page load time tracked
    };
  }, [pageName]);
};

// Smooth line progress bar for multi-step registration
export const RegistrationProgressBar: React.FC<{
  steps: string[];
  currentStep: number;
  className?: string;
}> = ({ steps, currentStep, className = '' }) => {
  const totalSteps = steps.length;
  const progressPercent =
    totalSteps <= 1 ? 100 : Math.min(100, (currentStep / (totalSteps - 1)) * 100);

  return (
    <div className={`mb-8 ${className}`} aria-label="Registration progress">
      <div className="flex items-center justify-between gap-4 mb-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-[#0a61d7]">
          Step {currentStep + 1} of {totalSteps}
        </p>
        <p className="text-sm font-medium text-gray-900 truncate">{steps[currentStep]}</p>
      </div>

      <div
        className="relative h-2 w-full rounded-full bg-gray-100 overflow-hidden"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(progressPercent)}
        aria-label={`${steps[currentStep]} — step ${currentStep + 1} of ${totalSteps}`}
      >
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-[#0a61d7] via-[#1d74ea] to-[#3b8ef6] transition-[width] duration-700 ease-in-out shadow-[0_0_12px_rgba(10,97,215,0.35)]"
          style={{ width: `${progressPercent}%` }}
        />
      </div>

      <div className="mt-3 grid gap-1" style={{ gridTemplateColumns: `repeat(${totalSteps}, minmax(0, 1fr))` }}>
        {steps.map((label, idx) => {
          const isComplete = idx < currentStep;
          const isCurrent = idx === currentStep;
          return (
            <div key={label} className="flex flex-col items-center gap-1 min-w-0 px-0.5">
              <div
                className={`h-1 w-full rounded-full transition-colors duration-500 ease-in-out ${
                  isComplete ? 'bg-[#0a61d7]' : isCurrent ? 'bg-[#93c5fd]' : 'bg-gray-200'
                }`}
              />
              <span
                className={`hidden sm:block text-[10px] leading-tight text-center truncate w-full transition-colors duration-300 ${
                  isCurrent ? 'text-[#0a61d7] font-semibold' : isComplete ? 'text-gray-600' : 'text-gray-400'
                }`}
              >
                {label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

RegistrationProgressBar.displayName = 'RegistrationProgressBar';

// Form step indicator for registration (numbered circles — legacy)
export const FormStepIndicator: React.FC<{
  steps: string[];
  currentStep: number;
  className?: string;
}> = ({ steps, currentStep, className = '' }) => (
  <div className={`flex justify-center mb-8 ${className}`}>
    {steps.map((label, idx) => (
      <div key={label} className="flex items-center">
        <div
          className={`rounded-full w-8 h-8 flex items-center justify-center font-bold text-white text-sm transition-colors ${
            currentStep === idx
              ? "bg-[#0a61d7]"
              : currentStep > idx
              ? "bg-green-500"
              : "bg-gray-300"
          }`}
        >
          {currentStep > idx ? (
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
            </svg>
          ) : (
            idx + 1
          )}
        </div>
        {idx < steps.length - 1 && (
          <div 
            className={`w-8 h-1 mx-2 transition-colors ${
              currentStep > idx ? 'bg-green-500' : 'bg-gray-300'
            }`} 
          />
        )}
      </div>
    ))}
  </div>
);

PasswordStrengthIndicator.displayName = 'PasswordStrengthIndicator';
ValidatedInput.displayName = 'ValidatedInput';
SuccessMessage.displayName = 'SuccessMessage';
ErrorMessage.displayName = 'ErrorMessage';
LoadingButton.displayName = 'LoadingButton';
FormStepIndicator.displayName = 'FormStepIndicator';
