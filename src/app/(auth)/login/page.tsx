"use client";
import React, { useEffect, useState, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useUserStore, stashRememberMePreference } from '@/store/userStore';
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
import { useAuthTranslations } from '@/hooks/useAuthTranslations';
import { AuthLanguageSwitcher } from '@/components/auth/AuthLanguageSwitcher';

export default function LoginPage() {
  const { locale, tLogin } = useAuthTranslations();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [emailValid, setEmailValid] = useState(true);
  const [rememberMe, setRememberMe] = useState(false);
  
  const router = useRouter();
  const searchParams = useSearchParams();
  const setUser = useUserStore(state => state.setUser);
  
  const { error, handleError, clearError } = useAuthErrorHandler();
  const { loading, startLoading, stopLoading } = useAuthLoading();
  const [success, setSuccess] = useState("");
  
  useAuthPerformanceTracking('Login');

  useEffect(() => {
    const err = searchParams?.get('error');
    if (err === 'ACCOUNT_SUSPENDED') {
      handleError({ error: tLogin('accountSuspended') });
    }
  }, [searchParams, handleError, tLogin]);

  const handleLogin = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();
    setSuccess("");
    
    const emailValidation = validateAuthInput.email(email);
    if (!emailValidation.valid) {
      handleError({ error: emailValidation.error });
      return;
    }
    
    if (!password) {
      handleError({ error: tLogin('passwordRequired') });
      return;
    }
    
    startLoading(tLogin('signingIn'));
    
    try {
      const clearUser = useUserStore.getState().clearUser;
      clearUser();
      
      const result = await signIn("credentials", {
        email: email.trim(),
        password,
        redirect: false,
      });
      
      if (result?.error) {
        if (result.error === 'ACCOUNT_SUSPENDED') {
          handleError({ error: tLogin('accountSuspended') });
        } else {
          handleError({ error: tLogin('invalidCredentials') });
        }
        return;
      }
      
      if (!result?.ok) {
        handleError({ error: tLogin('loginFailed') });
        return;
      }

      stashRememberMePreference(rememberMe);
      setSuccess(tLogin('success'));
      
      if (typeof window !== 'undefined' && window.gtag) {
        window.gtag('event', 'login', {
          event_category: 'Authentication',
          event_label: 'Email Login',
          value: 1
        });
      }
      
      setTimeout(() => {
        router.push("/home");
      }, 1000);
      
    } catch (err) {
      handleError({ error: tLogin('networkError') });
    } finally {
      stopLoading();
    }
  }, [email, password, rememberMe, router, handleError, clearError, startLoading, stopLoading, tLogin]);

  return (
    <div className="relative flex min-h-screen w-full overflow-hidden bg-white lg:bg-[#0a61d7]">
      <div className="hidden lg:flex absolute inset-y-0 right-0 left-[42%] overflow-hidden bg-[#0a61d7] animate-fade-in-right">
        <div className="pointer-events-none absolute -right-16 top-16 h-72 w-72 rounded-[2.5rem] bg-white/10" />
        <div className="pointer-events-none absolute -left-10 bottom-24 h-56 w-56 rounded-[2rem] bg-white/10" />
        <div className="pointer-events-none absolute right-24 top-1/3 h-40 w-40 rounded-3xl bg-[#084ba6]/40" />

        <div className="relative z-0 flex h-full w-full flex-col px-10 py-12 xl:px-14">
          <div className="max-w-xl">
            <h2 className="text-2xl font-bold leading-tight text-white xl:text-3xl">
              {tLogin('showcaseTitle')}
            </h2>
            <p className="mt-3 text-sm text-white/80">
              {tLogin('showcaseSubtitle')}
            </p>
          </div>

          <div className="relative mt-8 flex-1 min-h-[380px]">
            <div className="absolute left-10 w-[76%] animate-showcase-float-slow rounded-2xl border border-white/20 bg-white p-1.5 shadow-[0_20px_48px_rgba(0,0,0,0.24)]">
              <img
                src="/Dashboardhome.png"
                alt={tLogin('showcaseHomeAlt')}
                className="w-full rounded-xl border border-gray-100"
              />
            </div>
            <div className="absolute bottom-6 right-2 w-[34%] animate-showcase-float-slower animate-delay-700 rounded-xl border border-white/20 bg-white p-1 shadow-[0_16px_40px_rgba(0,0,0,0.22)]">
              <img
                src="/Dashboardlogs.png"
                alt={tLogin('showcaseLogisticsAlt')}
                className="w-full rounded-lg border border-gray-100"
              />
            </div>
            <div className="absolute top-[50%] w-[28%] animate-showcase-float animate-delay-300 rounded-lg border border-white/20 bg-white p-1 shadow-[0_12px_32px_rgba(0,0,0,0.2)]">
              <img
                src="/Dashboardanalytics.png"
                alt={tLogin('showcaseAnalyticsAlt')}
                className="w-full rounded-md border border-gray-100"
              />
            </div>
          </div>
        </div>
      </div>

      <div className="relative z-10 flex min-h-screen w-full flex-col justify-center bg-white px-6 py-10 sm:px-12 lg:w-[44%] lg:shrink-0 lg:rounded-tl-none lg:rounded-bl-none lg:rounded-tr-2xl lg:rounded-br-2xl lg:px-14 xl:w-[42%] xl:px-16 animate-fade-in-left">
        <div className="flex flex-col items-center justify-center text-center max-w-md mx-auto">
          <a href="/" aria-label={tLogin('goHome')}>
            <img src="/LakuIcon.svg" alt={tLogin('logoAlt')} className="h-13 mb-4" />
          </a>
          <h2 className="text-3xl text-black font-bold mb-2">{tLogin('title')}</h2>
          <p className="mb-6 text-sm text-gray-500">{tLogin('subtitle')}</p>
        </div>
        
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
            label={tLogin('email')}
            type="email"
            value={email}
            onChange={setEmail}
            onValidation={(valid) => setEmailValid(valid)}
            validator={validateAuthInput.email}
            placeholder={tLogin('emailPlaceholder')}
            required
          />
          
          <ValidatedInput
            label={tLogin('password')}
            type="password"
            value={password}
            onChange={setPassword}
            placeholder={tLogin('passwordPlaceholder')}
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
                aria-label={rememberMe ? tLogin('rememberMeDeselect') : tLogin('rememberMeSelect')}
              >
                {rememberMe && (
                  <svg className="w-2.5 h-2.5 text-white" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                )}
              </button>
              <span className="text-sm text-gray-500">{tLogin('rememberMe')}</span>
            </label>
            <a 
              href="/forgotpassword" 
              className="text-sm text-[#0a61d7] hover:underline focus:outline-none focus:ring-2 focus:ring-blue-500 rounded"
            >
              {tLogin('forgotPassword')}
            </a>
          </div>
          
          <LoadingButton
            type="submit"
            loading={loading}
            loadingText={tLogin('signingIn')}
            disabled={!emailValid || !email || !password}
            className="w-full py-3 bg-[#0a61d7] text-white rounded-lg font-semibold hover:bg-[#084ba6] transition text-sm"
          >
            {tLogin('logIn')}
          </LoadingButton>
        </form>
        <div className="my-4 flex items-center max-w-md mx-auto w-full">
          <div className="flex-grow h-px bg-gray-200" />
          <span className="mx-4 text-gray-400 text-sm">{tLogin('orLoginWith')}</span>
          <div className="flex-grow h-px bg-gray-200" />
        </div>
        <div className="flex space-x-4 max-w-md mx-auto w-full">
          <button
            type="button"
            onClick={async () => {
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
            <img src="/google.svg" alt="Google" className="h-5 w-5 mr-2" /> {tLogin('google')}
          </button>
        </div>
        <p className="mt-6 text-center text-sm text-gray-500">
          {tLogin('noAccount')}{' '}
          <a href="/register" className="l-2 text-[#0a61d7] font-semibold hover:underline">
            {tLogin('registerNow')}
          </a>
        </p>
        <p className="mt-3 text-center text-sm text-gray-500">
          <a
            href={`/${locale}/docs`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[#0a61d7] hover:underline"
          >
            {tLogin('documentation')}
          </a>
        </p>
        <AuthLanguageSwitcher variant="login" />
      </div>
    </div>
  );
}
