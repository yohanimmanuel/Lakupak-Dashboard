"use client";
import React, { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
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

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [emailValid, setEmailValid] = useState(true);
  const [rememberMe, setRememberMe] = useState(false);
  
  const router = useRouter();
  const setUser = useUserStore(state => state.setUser);
  
  // Enhanced hooks for production features
  const { error, handleError, clearError } = useAuthErrorHandler();
  const { loading, startLoading, stopLoading } = useAuthLoading();
  const [success, setSuccess] = useState("");
  
  // Performance tracking
  useAuthPerformanceTracking('Login');

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
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "Cache-Control": "no-cache"
        },
        body: JSON.stringify({ email: email.trim(), password }),
      });
      
      const data = await res.json();
      
      if (!res.ok) {
        handleError(data, "Login failed. Please try again.");
        return;
      }
      
      // Success
      setSuccess("Login successful! Redirecting...");
      setUser({
        id: data.id,
        firstName: data.firstName,
        lastName: data.lastName,
        email: data.email,
        company: data.company,
        address: data.address,
      }, rememberMe);
      
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
  }, [email, password, rememberMe, router, setUser, handleError, clearError, startLoading, stopLoading]);

  return (
    <div className="grid grid-cols-9 min-h-screen w-full flex bg-white">
      {/* Left: Login Form */}
      <div className="col-span-4 justify-center flex flex-col p-16 bg-white animate-fade-in-left">
        <div className="flex flex-col items-center justify-center text-center">
          <a href="/" aria-label="Go to homepage">
            <img src="/LakuLakuIcon.svg" alt="Laku-Laku Logo" className="h-13 mb-4" />
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
        
        <form className="space-y-4" onSubmit={handleLogin}>
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
            <label className="flex items-center">
              <input 
                type="checkbox" 
                className="mr-2 rounded border-gray-300" 
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
              />
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
        <div className="my-4 flex items-center">
          <div className="flex-grow h-px bg-gray-200" />
          <span className="mx-4 text-gray-400 text-sm">Or Login With</span>
          <div className="flex-grow h-px bg-gray-200" />
        </div>
        <div className="flex space-x-4">
          <button className="flex-1 py-2 text-gray-500 border border-gray-200 rounded-lg flex items-center justify-center hover:bg-gray-50">
            <img src="/google.svg" alt="Google" className="h-5 w-5 mr-2" /> Google
          </button>
          <button className="flex-1 py-2 text-gray-500 border border-gray-200 rounded-lg flex items-center justify-center hover:bg-gray-50">
            <img src="/apple.svg" alt="Apple" className="h-5 w-4 mr-2" /> Apple
          </button>
        </div>
        <p className="mt-6 text-center text-sm text-gray-500">
          Don&apos;t have an account? <a href="/register" className="l-2 text-[#0a61d7] font-semibold hover:underline">Register Now</a>
        </p>
      </div>
      {/* Right: Placeholder for Distribution/Retailing Image */}
      <div className="col-span-5 bg-blue-600 flex items-center justify-center animate-fade-in-right">
        <span className="text-white text-2xl font-bold">[Distribution/Retailing Image Placeholder]</span>
      </div>
    </div>
  );
}
