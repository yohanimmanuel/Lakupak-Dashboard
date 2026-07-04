"use client";
import React, { useEffect, useLayoutEffect, useState, useCallback } from "react";
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
import { getSession, signIn, signOut } from "next-auth/react";
import { useAuthTranslations } from '@/hooks/useAuthTranslations';
import { AuthLanguageSwitcher } from '@/components/auth/AuthLanguageSwitcher';
import { LoginShowcaseCarousel } from '@/components/auth/LoginShowcaseCarousel';

const DESKTOP_SHOWCASE_MQ = '(min-width: 1024px)';
import {
  type RememberedLogin,
  clearRememberedLogin,
  getRememberedDisplayName,
  readRememberedLogin,
  storeRememberedLogin,
} from '@/lib/rememberedLogin';

export default function LoginPage() {
  const { locale, tLogin } = useAuthTranslations();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [emailValid, setEmailValid] = useState(true);
  const [rememberMe, setRememberMe] = useState(false);
  const [rememberedAccount, setRememberedAccount] = useState<RememberedLogin | null>(null);
  const [showRememberedPrompt, setShowRememberedPrompt] = useState(false);
  
  const [showShowcase, setShowShowcase] = useState(false);
  
  const router = useRouter();
  const searchParams = useSearchParams();
  const setUser = useUserStore(state => state.setUser);
  
  const { error, handleError, clearError } = useAuthErrorHandler();
  const { loading, startLoading, stopLoading } = useAuthLoading();
  const [success, setSuccess] = useState("");
  
  useAuthPerformanceTracking('Login');

  useLayoutEffect(() => {
    const saved = readRememberedLogin();
    if (!saved) return;
    setRememberedAccount(saved);
    setEmail(saved.email);
    setRememberMe(true);
    setShowRememberedPrompt(true);
  }, []);

  useLayoutEffect(() => {
    const mq = window.matchMedia(DESKTOP_SHOWCASE_MQ);
    const sync = () => setShowShowcase(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  useEffect(() => {
    const err = searchParams?.get('error');
    if (err === 'ACCOUNT_SUSPENDED') {
      handleError({ error: tLogin('accountSuspended') });
    } else if (err === 'TOO_MANY_ATTEMPTS') {
      handleError({ error: tLogin('tooManyAttempts') });
    }
  }, [searchParams, handleError, tLogin]);

  const handleUseAnotherAccount = useCallback(() => {
    clearRememberedLogin();
    setRememberedAccount(null);
    setShowRememberedPrompt(false);
    setEmail('');
    setRememberMe(false);
    setPassword('');
  }, []);

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
        } else if (result.error === 'TOO_MANY_ATTEMPTS') {
          handleError({ error: tLogin('tooManyAttempts') });
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

      if (rememberMe) {
        const session = await getSession();
        const sessionUser = session?.user as {
          email?: string | null;
          firstName?: string | null;
          lastName?: string | null;
          name?: string | null;
        } | undefined;
        const sessionEmail = sessionUser?.email?.trim() || email.trim();
        if (sessionEmail) {
          const nameParts = (sessionUser?.name || '').trim().split(' ').filter(Boolean);
          storeRememberedLogin({
            email: sessionEmail,
            firstName: sessionUser?.firstName?.trim() || nameParts[0] || '',
            lastName: sessionUser?.lastName?.trim() || nameParts.slice(1).join(' ') || '',
          });
        }
      } else {
        clearRememberedLogin();
      }

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
      {showShowcase && <LoginShowcaseCarousel />}

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
          {showRememberedPrompt && rememberedAccount && (
            <div className="rounded-lg border border-[#0a61d7]/20 bg-blue-50/60 p-4">
              <p className="text-sm font-medium text-gray-900">
                {tLogin('welcomeBack', { name: getRememberedDisplayName(rememberedAccount) })}
              </p>
              <p className="mt-0.5 text-sm text-gray-500">{rememberedAccount.email}</p>
              <button
                type="button"
                onClick={handleUseAnotherAccount}
                className="mt-2 text-sm text-[#0a61d7] hover:underline focus:outline-none focus:ring-2 focus:ring-blue-500 rounded"
              >
                {tLogin('useAnotherAccount')}
              </button>
            </div>
          )}
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
                onClick={() => {
                  const next = !rememberMe;
                  setRememberMe(next);
                  if (next && rememberedAccount) {
                    setShowRememberedPrompt(true);
                  } else {
                    setShowRememberedPrompt(false);
                  }
                }}
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
