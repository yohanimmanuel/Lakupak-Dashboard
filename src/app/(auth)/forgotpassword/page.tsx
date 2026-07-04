"use client";
import React, { useState, useCallback, useEffect } from "react";
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
import { useAuthTranslations } from '@/hooks/useAuthTranslations';
import { AuthLanguageSwitcher } from '@/components/auth/AuthLanguageSwitcher';

const TOTAL_STEPS = 3;

export default function ForgotPasswordPage() {
  const { locale, tForgot } = useAuthTranslations();
  const [step, setStep] = useState(0);
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [emailValid, setEmailValid] = useState(true);
  const [codeValid, setCodeValid] = useState(true);
  const [passwordValid, setPasswordValid] = useState(true);
  const [confirmPasswordValid, setConfirmPasswordValid] = useState(true);

  const router = useRouter();

  // Prefill email/code from the reset link and jump straight to the verify step.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const linkEmail = params.get("email");
    const linkCode = params.get("code");
    if (linkEmail) setEmail(linkEmail);
    if (linkCode) {
      setCode(linkCode);
      setStep(1);
    }
  }, []);

  // Enhanced hooks for production features
  const { error, handleError, clearError } = useAuthErrorHandler();
  const { loading, startLoading, stopLoading } = useAuthLoading();
  const [success, setSuccess] = useState("");

  // Performance tracking
  useAuthPerformanceTracking('ForgotPassword');

  const validateConfirmPassword = useCallback((confirmPw: string) => {
    if (!confirmPw) return { valid: false, error: tForgot('validation.confirmRequired') };
    if (confirmPw !== password) return { valid: false, error: tForgot('validation.passwordsMismatch') };
    return { valid: true };
  }, [password, tForgot]);

  const validateCode = useCallback((c: string) => {
    if (!c || !c.trim()) return { valid: false, error: tForgot('validation.codeRequired') };
    if (!/^\d{6}$/.test(c.trim())) return { valid: false, error: tForgot('validation.codeInvalid') };
    return { valid: true };
  }, [tForgot]);

  const goToStep = (next: number) => {
    clearError();
    setSuccess("");
    setStep(next);
  };

  // Turn an API failure into a localized message, keeping the code detection intact.
  const localizeApiError = useCallback((res: Response, data: unknown, fallbackKey: string) => {
    const code = (data as { code?: string } | null)?.code;
    if (code === 'INVALID_OR_EXPIRED_CODE') return tForgot('errors.invalidCode');
    if (res.status === 429) return tForgot('errors.tooManyRequests');
    return tForgot(fallbackKey);
  }, [tForgot]);

  // Step 1: request a reset code by email.
  async function handleEmailSubmit(e: React.FormEvent) {
    e.preventDefault();
    clearError();
    setSuccess("");

    if (!emailValid || !email) {
      handleError({ error: tForgot('errors.invalidEmail') });
      return;
    }

    startLoading(tForgot('sending'));
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) {
        handleError({ error: localizeApiError(res, data, 'errors.requestFailed') });
      } else {
        setSuccess(tForgot('codeSent'));
        setTimeout(() => goToStep(1), 1500);
      }
    } catch (err) {
      handleError({ error: tForgot('errors.network') });
    } finally {
      stopLoading();
    }
  }

  // Step 2: verify the code (does not consume it) before allowing a new password.
  async function handleCodeSubmit(e: React.FormEvent) {
    e.preventDefault();
    clearError();
    setSuccess("");

    if (!codeValid || !code) {
      handleError({ error: tForgot('errors.enterCode') });
      return;
    }

    startLoading(tForgot('verifying'));
    try {
      const res = await fetch("/api/auth/verify-reset-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, token: code.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        handleError({ error: localizeApiError(res, data, 'errors.verifyFailed') });
      } else {
        setSuccess(tForgot('codeVerified'));
        setTimeout(() => goToStep(2), 800);
      }
    } catch (err) {
      handleError({ error: tForgot('errors.network') });
    } finally {
      stopLoading();
    }
  }

  // Step 3: set the new password (server re-verifies and consumes the code).
  async function handlePasswordSubmit(e: React.FormEvent) {
    e.preventDefault();
    clearError();
    setSuccess("");

    if (!passwordValid || !confirmPasswordValid || !password || !confirmPassword) {
      handleError({ error: tForgot('errors.fieldsInvalid') });
      return;
    }

    startLoading(tForgot('resetting'));
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, token: code.trim(), password }),
      });
      const data = await res.json();
      if (!res.ok) {
        handleError({ error: localizeApiError(res, data, 'errors.resetFailed') });
        // If the code became invalid/expired between steps, send the user back to re-verify.
        if (data?.code === 'INVALID_OR_EXPIRED_CODE') {
          setTimeout(() => goToStep(1), 1500);
        }
      } else {
        setSuccess(tForgot('resetSuccess'));
        if (typeof window !== 'undefined' && window.gtag) {
          window.gtag('event', 'password_reset', {
            event_category: 'Authentication',
            event_label: 'Password Reset Success'
          });
        }
        setTimeout(() => router.push("/login"), 1500);
      }
    } catch (err) {
      handleError({ error: tForgot('errors.network') });
    } finally {
      stopLoading();
    }
  }

  const Header = ({ title, subtitle }: { title: string; subtitle: string }) => (
    <>
      <div className="flex flex-col items-center justify-center text-center mb-6">
        <a href="/" aria-label={tForgot('goHome')}>
          <img src="/LakuTextLogo.svg" alt={tForgot('logoAlt')} className="h-10" />
        </a>
      </div>
      <p className="text-center text-xs font-medium text-[#0a61d7] mb-2">
        {tForgot('stepIndicator', { current: step + 1, total: TOTAL_STEPS })}
      </p>
      <h2 className="text-2xl font-bold text-center text-black mb-4">{title}</h2>
      <p className="text-center text-gray-500 text-sm mb-8">{subtitle}</p>
    </>
  );

  const DocsLink = () => (
    <p className="mt-3 text-center text-sm text-gray-500">
      <a
        href={`/${locale}/docs`}
        target="_blank"
        rel="noopener noreferrer"
        className="text-[#0a61d7] hover:underline"
      >
        {tForgot('documentation')}
      </a>
    </p>
  );

  return (
    <div className="min-h-screen flex items-center justify-center bg-white">
      <div className="w-full max-w-md p-8 rounded-lg">
        {step === 0 && (
          <form onSubmit={handleEmailSubmit} className="space-y-4">
            <Header
              title={tForgot('emailTitle')}
              subtitle={tForgot('emailSubtitle')}
            />

            {error && <ErrorMessage message={error} onClose={clearError} />}
            {success && <SuccessMessage message={success} onClose={() => setSuccess('')} />}

            <ValidatedInput
              label={tForgot('emailLabel')}
              type="email"
              value={email}
              onChange={setEmail}
              onValidation={(valid) => setEmailValid(valid)}
              validator={validateAuthInput.email}
              placeholder={tForgot('emailPlaceholder')}
              required
            />

            <LoadingButton
              type="submit"
              loading={loading}
              loadingText={tForgot('sending')}
              disabled={!emailValid || !email}
              className="w-full py-3 bg-[#0a61d7] text-white rounded-lg font-semibold hover:bg-[#084ba6] transition text-sm"
            >
              {tForgot('sendCode')}
            </LoadingButton>

            <div className="text-center mt-4">
              <a
                href="/login"
                className="text-sm text-[#0a61d7] hover:underline focus:outline-none focus:ring-2 focus:ring-blue-500 rounded"
              >
                {tForgot('backToLogin')}
              </a>
            </div>
            <DocsLink />
          </form>
        )}

        {step === 1 && (
          <form onSubmit={handleCodeSubmit} className="space-y-6">
            <Header
              title={tForgot('verifyTitle')}
              subtitle={tForgot('verifySubtitle')}
            />

            {error && <ErrorMessage message={error} onClose={clearError} />}
            {success && <SuccessMessage message={success} onClose={() => setSuccess('')} />}

            <ValidatedInput
              label={tForgot('codeLabel')}
              type="text"
              value={code}
              onChange={setCode}
              onValidation={(valid) => setCodeValid(valid)}
              validator={validateCode}
              placeholder={tForgot('codePlaceholder')}
              required
            />

            <LoadingButton
              type="submit"
              loading={loading}
              loadingText={tForgot('verifying')}
              disabled={!codeValid || !code}
              className="w-full py-3 bg-[#0a61d7] text-white rounded-lg font-semibold hover:bg-[#084ba6] transition text-sm"
            >
              {tForgot('verifyCode')}
            </LoadingButton>

            <div className="text-center mt-4">
              <button
                type="button"
                onClick={() => goToStep(0)}
                className="text-sm text-[#0a61d7] hover:underline focus:outline-none focus:ring-2 focus:ring-blue-500 rounded"
              >
                {tForgot('backToEmail')}
              </button>
            </div>
            <DocsLink />
          </form>
        )}

        {step === 2 && (
          <form onSubmit={handlePasswordSubmit} className="space-y-6">
            <Header
              title={tForgot('resetTitle')}
              subtitle={tForgot('resetSubtitle')}
            />

            {error && <ErrorMessage message={error} onClose={clearError} />}
            {success && <SuccessMessage message={success} onClose={() => setSuccess('')} />}

            <ValidatedInput
              label={tForgot('newPasswordLabel')}
              type="password"
              value={password}
              onChange={setPassword}
              onValidation={(valid) => setPasswordValid(valid)}
              validator={validateAuthInput.password}
              placeholder={tForgot('newPasswordPlaceholder')}
              showPasswordStrength
              required
            />

            <ValidatedInput
              label={tForgot('confirmPasswordLabel')}
              type="password"
              value={confirmPassword}
              onChange={setConfirmPassword}
              onValidation={(valid) => setConfirmPasswordValid(valid)}
              validator={validateConfirmPassword}
              placeholder={tForgot('confirmPasswordPlaceholder')}
              required
            />

            <LoadingButton
              type="submit"
              loading={loading}
              loadingText={tForgot('resetting')}
              disabled={!passwordValid || !confirmPasswordValid || !password || !confirmPassword}
              className="w-full py-3 bg-[#0a61d7] text-white rounded-lg font-semibold hover:bg-[#084ba6] transition text-sm"
            >
              {tForgot('resetButton')}
            </LoadingButton>

            <div className="text-center mt-4">
              <button
                type="button"
                onClick={() => goToStep(1)}
                className="text-sm text-[#0a61d7] hover:underline focus:outline-none focus:ring-2 focus:ring-blue-500 rounded"
              >
                {tForgot('backToVerify')}
              </button>
            </div>
            <DocsLink />
          </form>
        )}

        <AuthLanguageSwitcher variant="login" />
      </div>
    </div>
  );
}
