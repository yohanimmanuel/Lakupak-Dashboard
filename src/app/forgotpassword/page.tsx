"use client";
import React, { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { validateAuthInput } from '@/utils/auth-security';
import { 
  useAuthErrorHandler, 
  useAuthLoading, 
  useAuthPerformanceTracking,
  ValidatedInput,
  ErrorMessage,
  SuccessMessage,
  LoadingButton
} from '@/utils/auth-enhancements';

export default function ForgotPasswordPage() {
  const [step, setStep] = useState(0);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [emailValid, setEmailValid] = useState(true);
  const [passwordValid, setPasswordValid] = useState(true);
  const [confirmPasswordValid, setConfirmPasswordValid] = useState(true);
  
  const router = useRouter();
  
  // Enhanced hooks for production features
  const { error, handleError, clearError } = useAuthErrorHandler();
  const { loading, startLoading, stopLoading } = useAuthLoading();
  const [success, setSuccess] = useState("");
  
  // Performance tracking
  useAuthPerformanceTracking('ForgotPassword');

  const getButtonText = () => {
    if (loading) {
      return step === 0 ? "Sending..." : "Resetting...";
    }
    return step === 0 ? "Send Reset Link" : "Reset Password";
  };

  const validateConfirmPassword = useCallback((confirmPw: string) => {
    if (!confirmPw) return { valid: false, error: 'Please confirm your password' };
    if (confirmPw !== password) return { valid: false, error: 'Passwords do not match' };
    return { valid: true };
  }, [password]);

  async function handleEmailSubmit(e: React.FormEvent) {
    e.preventDefault();
    clearError();
    setSuccess("");
    
    if (!emailValid || !email) {
      handleError({ error: "Please enter a valid email address." });
      return;
    }
    
    startLoading('Sending reset link...');
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) {
        handleError(data, "Failed to process request");
      } else {
        setSuccess("Reset link sent! Check your email and proceed to the next step.");
        setTimeout(() => setStep(1), 1500);
      }
    } catch (err) {
      handleError({ error: "Network error. Please check your connection and try again." });
    } finally {
      stopLoading();
    }
  }

  async function handlePasswordSubmit(e: React.FormEvent) {
    e.preventDefault();
    clearError();
    setSuccess("");
    
    if (!passwordValid || !confirmPasswordValid || !password || !confirmPassword) {
      handleError({ error: "Please ensure all fields are valid." });
      return;
    }
    
    startLoading('Resetting password...');
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        handleError(data, "Failed to reset password");
      } else {
        setSuccess("Password has been reset successfully! Redirecting to login...");
        if (typeof window !== 'undefined' && window.gtag) {
          window.gtag('event', 'password_reset', {
            event_category: 'Authentication',
            event_label: 'Password Reset Success'
          });
        }
        setTimeout(() => router.push("/login"), 1500);
      }
    } catch (err) {
      handleError({ error: "Network error. Please check your connection and try again." });
    } finally {
      stopLoading();
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-white">
      <div className="w-full max-w-md p-8 rounded-lg">
        {step === 0 && (
          <form onSubmit={handleEmailSubmit} className="space-y-4">
            <div className="flex flex-col items-center justify-center text-center mb-8">
              <a href="/" aria-label="Go to homepage">
                <img src="/LakuTextLogo.svg" alt="Laku Logo" className="h-10" />
              </a>
            </div>
            <h2 className="text-2xl font-bold text-center text-black mb-4">Forgot Password</h2>
            <p className="text-center text-gray-500 text-sm mb-10">
              Enter your registered email address and we'll send you a link to reset your password.
            </p>
            
            {error && <ErrorMessage message={error} onClose={clearError} />}
            {success && <SuccessMessage message={success} onClose={() => setSuccess('')} />}
            
            <ValidatedInput
              label="Registered Email"
              type="email"
              value={email}
              onChange={setEmail}
              onValidation={(valid) => setEmailValid(valid)}
              validator={validateAuthInput.email}
              placeholder="you@email.com"
              required
            />
            
            <LoadingButton
              type="submit"
              loading={loading}
              loadingText="Sending..."
              disabled={!emailValid || !email}
              className="w-full py-3 bg-[#0a61d7] text-white rounded-lg font-semibold hover:bg-[#084ba6] transition text-sm"
            >
              Send Reset Link
            </LoadingButton>
            
            <div className="text-center mt-4">
              <a 
                href="/login" 
                className="text-sm text-[#0a61d7] hover:underline focus:outline-none focus:ring-2 focus:ring-blue-500 rounded"
              >
                Back to Login
              </a>
            </div>
          </form>
        )}
        
        {step === 1 && (
          <form onSubmit={handlePasswordSubmit} className="space-y-6">
            <div className="flex flex-col items-center justify-center text-center mb-8">
              <a href="/" aria-label="Go to homepage">
                <img src="/LakuTextLogo.svg" alt="Laku Logo" className="h-10" />
              </a>
            </div>
            <h2 className="text-2xl font-bold text-center text-black mb-4">Set New Password</h2>
            <p className="text-center text-gray-500 text-sm mb-10">
              Enter your new password and confirm it to complete the reset.
            </p>
            
            {error && <ErrorMessage message={error} onClose={clearError} />}
            {success && <SuccessMessage message={success} onClose={() => setSuccess('')} />}
            
            <ValidatedInput
              label="New Password"
              type="password"
              value={password}
              onChange={setPassword}
              onValidation={(valid) => setPasswordValid(valid)}
              validator={validateAuthInput.password}
              placeholder="Enter new password"
              showPasswordStrength
              required
            />
            
            <ValidatedInput
              label="Confirm Password"
              type="password"
              value={confirmPassword}
              onChange={setConfirmPassword}
              onValidation={(valid) => setConfirmPasswordValid(valid)}
              validator={validateConfirmPassword}
              placeholder="Confirm new password"
              required
            />
            
            <LoadingButton
              type="submit"
              loading={loading}
              loadingText="Resetting..."
              disabled={!passwordValid || !confirmPasswordValid || !password || !confirmPassword}
              className="w-full py-3 bg-[#0a61d7] text-white rounded-lg font-semibold hover:bg-[#084ba6] transition text-sm"
            >
              Reset Password
            </LoadingButton>
            
            <div className="text-center mt-4">
              <button
                type="button"
                onClick={() => setStep(0)}
                className="text-sm text-[#0a61d7] hover:underline focus:outline-none focus:ring-2 focus:ring-blue-500 rounded"
              >
                Back to Email Step
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
