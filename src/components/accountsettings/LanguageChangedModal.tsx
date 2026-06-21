'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { CheckCircle, X } from 'lucide-react';
import { useUserStore } from '@/store/userStore';
import { useSettingsTranslations } from '@/hooks/useSettingsTranslations';

export const LANGUAGE_CHANGED_SESSION_KEY = 'laku.languageChangedTo';

function normalizeLocale(language?: string | null) {
  return language === 'id' ? 'id' : 'en';
}

export function LanguageChangedModal() {
  const [languageCode, setLanguageCode] = useState<string | null>(null);
  const [pendingLanguage, setPendingLanguage] = useState<string | null>(null);
  const isHydrated = useUserStore((state) => state.isHydrated);
  const userLanguage = useUserStore((state) => state.user?.language);
  const { tLanguage, translateLanguageOption } = useSettingsTranslations();
  const autoDismissRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showDelayRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const dismiss = useCallback(() => {
    if (autoDismissRef.current) {
      clearTimeout(autoDismissRef.current);
      autoDismissRef.current = null;
    }
    setLanguageCode(null);
  }, []);

  useEffect(() => {
    const pending = sessionStorage.getItem(LANGUAGE_CHANGED_SESSION_KEY);
    if (pending) {
      setPendingLanguage(pending);
    }
  }, []);

  useEffect(() => {
    if (!pendingLanguage || !isHydrated) return;

    const expected = normalizeLocale(pendingLanguage);
    const current = normalizeLocale(userLanguage);
    if (current !== expected) return;

    showDelayRef.current = setTimeout(() => {
      sessionStorage.removeItem(LANGUAGE_CHANGED_SESSION_KEY);
      setLanguageCode(pendingLanguage);
      setPendingLanguage(null);
      autoDismissRef.current = setTimeout(dismiss, 2500);
    }, 200);

    return () => {
      if (showDelayRef.current) {
        clearTimeout(showDelayRef.current);
        showDelayRef.current = null;
      }
    };
  }, [pendingLanguage, isHydrated, userLanguage, dismiss]);

  useEffect(() => {
    return () => {
      if (autoDismissRef.current) {
        clearTimeout(autoDismissRef.current);
      }
      if (showDelayRef.current) {
        clearTimeout(showDelayRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!languageCode) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        dismiss();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [languageCode, dismiss]);

  if (!languageCode) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="language-changed-title"
      onClick={dismiss}
    >
      <div
        className="relative w-full max-w-sm rounded-xl bg-white shadow-2xl border border-gray-200 p-6 animate-fade-in"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={dismiss}
          className="absolute top-3 right-3 rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
          aria-label={tLanguage('success.languageChangedClose')}
        >
          <X className="h-5 w-5" />
        </button>
        <div className="flex flex-col items-center text-center gap-3 pt-2">
          <div className="w-12 h-12 rounded-full bg-green-50 flex items-center justify-center">
            <CheckCircle className="w-8 h-8 text-green-600" />
          </div>
          <h3 id="language-changed-title" className="text-lg font-semibold text-gray-900">
            {tLanguage('success.languageChangedTitle')}
          </h3>
          <p className="text-sm text-gray-600">
            {tLanguage('success.languageChangedMessage', {
              language: translateLanguageOption(languageCode),
            })}
          </p>
        </div>
      </div>
    </div>
  );
}
