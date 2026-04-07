"use client";
import React, { useEffect, useState, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useUserStore } from '@/store/userStore';
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
import { signIn, signOut } from "next-auth/react";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [emailValid, setEmailValid] = useState(true);
  const [rememberMe, setRememberMe] = useState(false);
  
  const router = useRouter();
  const searchParams = useSearchParams();
  const setUser = useUserStore(state => state.setUser);
  
  // Enhanced hooks for production features
  const { error, handleError, clearError } = useAuthErrorHandler();
  const { loading, startLoading, stopLoading } = useAuthLoading();
  const [success, setSuccess] = useState("");
  
  // Performance tracking
  useAuthPerformanceTracking('Login');

  useEffect(() => {
    const err = searchParams?.get('error');
    if (err === 'ACCOUNT_SUSPENDED') {
      handleError({ error: "Your account is suspended. Please contact support." });
    }
  }, [searchParams, handleError]);

  const handleLogin = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();
    setSuccess("");
    
    // Client-side validation
    const emailValidation = validateAuthInput.email(email);
    if (!emailValidation.valid) {
      handleError({ error: emailValidation.error });
      return;
    }
    
    if (!password) {
      handleError({ error: 'Password is required' });
      return;
    }
    
    startLoading('Signing in...');
    
    try {
      // Clear any existing user session first
      const clearUser = useUserStore.getState().clearUser;
      clearUser();
      
      // Use NextAuth signIn with credentials provider
      const result = await signIn("credentials", {
        email: email.trim(),
        password,
        redirect: false,
      });
      
      if (result?.error) {
        if (result.error === 'ACCOUNT_SUSPENDED') {
          handleError({ error: "Your account is suspended. Please contact support." });
        } else {
          handleError({ error: "Invalid email or password" });
        }
        return;
      }
      
      if (!result?.ok) {
        handleError({ error: "Login failed. Please try again." });
        return;
      }
      
      // Success
      setSuccess("Login successful! Redirecting...");
      
      // Track successful login
      if (typeof window !== 'undefined' && window.gtag) {
        window.gtag('event', 'login', {
          event_category: 'Authentication',
          event_label: 'Email Login',
          value: 1
        });
      }
      
      // Small delay for better UX
      setTimeout(() => {
        router.push("/home");
      }, 1000);
      
    } catch (err) {
      // Login error occurred
      handleError({ error: "Network error. Please check your connection and try again." });
    } finally {
      stopLoading();
    }
  }, [email, password, router, handleError, clearError, startLoading, stopLoading]);

  return (
    <div className="min-h-screen w-full bg-white flex flex-col lg:grid lg:grid-cols-9">
      {/* Left: Login Form */}
      <div className="w-full lg:col-span-4 flex flex-col justify-center px-6 py-10 sm:px-12 lg:px-16 bg-white animate-fade-in-left">
        <div className="flex flex-col items-center justify-center text-center max-w-md mx-auto">
          <a href="/" aria-label="Go to homepage">
            <img src="/LakuIcon.svg" alt="Laku Logo" className="h-13 mb-4" />
          </a>
          <h2 className="text-3xl text-black font-bold mb-2">Welcome Back</h2>
          <p className="mb-6 text-gray-500">Enter your email and password to access your account.</p>
        </div>
        
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
        <form className="space-y-4 max-w-md mx-auto w-full" onSubmit={handleLogin}>
          <ValidatedInput
            label="Email"
            type="email"
            value={email}
            onChange={setEmail}
            onValidation={(valid) => setEmailValid(valid)}
            validator={validateAuthInput.email}
            placeholder="you@email.com"
            required
          />
          
          <ValidatedInput
            label="Password"
            type="password"
            value={password}
            onChange={setPassword}
            placeholder="Enter your password"
            required
          />
          
          <div className="flex items-center justify-between">
            <label className="flex items-center cursor-pointer">
              <button
                type="button"
                onClick={() => setRememberMe(!rememberMe)}
                className={`w-4 h-4 border-2 rounded transition-all duration-200 flex items-center justify-center mr-2 ${
                  rememberMe
                    ? 'bg-green-500 border-green-500'
                    : 'bg-white border-gray-300 hover:border-green-400'
                }`}
                aria-label={rememberMe ? 'Deselect Remember Me' : 'Select Remember Me'}
              >
                {rememberMe && (
                  <svg className="w-2.5 h-2.5 text-white" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                )}
              </button>
              <span className="text-sm text-gray-500">Remember Me</span>
            </label>
            <a 
              href="/forgotpassword" 
              className="text-sm text-[#0a61d7] hover:underline focus:outline-none focus:ring-2 focus:ring-blue-500 rounded"
            >
              Forgot Password?
            </a>
          </div>
          
          <LoadingButton
            type="submit"
            loading={loading}
            loadingText="Signing in..."
            disabled={!emailValid || !email || !password}
            className="w-full py-3 bg-[#0a61d7] text-white rounded-lg font-semibold hover:bg-[#084ba6] transition text-sm"
          >
            Log In
          </LoadingButton>
        </form>
        <div className="my-4 flex items-center max-w-md mx-auto w-full">
          <div className="flex-grow h-px bg-gray-200" />
          <span className="mx-4 text-gray-400 text-sm">Or Login With</span>
          <div className="flex-grow h-px bg-gray-200" />
        </div>
        <div className="flex space-x-4 max-w-md mx-auto w-full">
          <button
            type="button"
            onClick={async () => {
              // Clear user store session
              const clearUser = useUserStore.getState().clearUser;
              clearUser();
              
              await signOut({ redirect: false });
              signIn('google', { 
                callbackUrl: '/home',
                prompt: 'select_account'
              });
            }}
            className="flex-1 py-2 text-gray-500 border border-gray-200 rounded-lg flex items-center justify-center hover:bg-gray-50"
          >
            <img src="/google.svg" alt="Google" className="h-5 w-5 mr-2" /> Google
          </button>
        </div>
        <p className="mt-6 text-center text-sm text-gray-500">
          Don&apos;t have an account? <a href="/register" className="l-2 text-[#0a61d7] font-semibold hover:underline">Register Now</a>
        </p>
      </div>
      {/* Right: Placeholder for Distribution/Retailing Image */}
      <div className="hidden lg:flex lg:col-span-5 bg-blue-600 items-center justify-center animate-fade-in-right">
        <span className="text-white text-2xl font-bold">[Distribution/Retailing Image Placeholder]</span>
      </div>
    </div>
  );
}
