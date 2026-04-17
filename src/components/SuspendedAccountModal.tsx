'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useSession, signOut } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useUserStore } from '@/store/userStore';
import { Ban, Loader2 } from 'lucide-react';

export function SuspendedAccountModal() {
  const router = useRouter();
  const { data: session, status, update } = useSession();
  const clearUser = useUserStore((s) => s.clearUser);
  const [blocking, setBlocking] = useState(false);
  const [countdown, setCountdown] = useState(60);
  const startedRef = useRef(false);
  const redirectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countdownTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const isSuspended = Boolean(session?.user?.isSuspended);
  const userId = session?.user?.id;
  const reason = (session?.user?.suspensionReason ?? '').trim();
  const suspendedAt = session?.user?.suspendedAt;
  const storageKey = userId ? `laku:suspensionRedirectAt:${userId}` : null;

  const clearTimers = () => {
    if (redirectTimerRef.current) {
      clearTimeout(redirectTimerRef.current);
      redirectTimerRef.current = null;
    }
    if (countdownTimerRef.current) {
      clearInterval(countdownTimerRef.current);
      countdownTimerRef.current = null;
    }
  };

  const goToLoginNow = () => {
    clearTimers();
    try {
      if (storageKey) window.sessionStorage.removeItem(storageKey);
    } catch {}
    startedRef.current = true;
    setCountdown(0);
    try {
      clearUser();
    } catch {}
    signOut({ redirect: false }).finally(() => {
      router.replace('/login');
      setTimeout(() => {
        window.location.href = '/login';
      }, 500);
    });
  };

  // Poll session so suspensions apply within seconds (without waiting minutes).
  useEffect(() => {
    if (status !== 'authenticated') return;
    const t = setInterval(() => {
      void update();
    }, 10_000);
    return () => clearInterval(t);
  }, [status, update]);

  useEffect(() => {
    if (status !== 'authenticated') return;
    if (!isSuspended) return;
    if (startedRef.current) return;
    startedRef.current = true;

    setBlocking(true);
    // Persist deadline so refresh doesn't reset the timer.
    const now = Date.now();
    let redirectAt = now + 60_000;
    if (storageKey) {
      const raw = window.sessionStorage.getItem(storageKey);
      const parsed = raw ? Number(raw) : NaN;
      if (Number.isFinite(parsed) && parsed > now) {
        redirectAt = parsed;
      } else {
        window.sessionStorage.setItem(storageKey, String(redirectAt));
      }
    }

    const computeCountdown = () => Math.max(0, Math.ceil((redirectAt - Date.now()) / 1000));
    setCountdown(computeCountdown());

    clearTimers();
    countdownTimerRef.current = setInterval(() => {
      setCountdown(computeCountdown());
    }, 250);

    // Keep modal visible for ~1 minute, then redirect to login.
    const delayMs = Math.max(0, redirectAt - Date.now());
    redirectTimerRef.current = setTimeout(() => {
      // Clear local dashboard user state right before redirect so layouts don't kick the user early.
      try {
        clearUser();
      } catch {}
      signOut({ redirect: false }).finally(() => {
        router.replace('/login');
        // Hard fallback for any stuck state.
        setTimeout(() => {
          window.location.href = '/login';
        }, 500);
      });
    }, delayMs);
  }, [status, isSuspended, clearUser, router, storageKey]);

  // If suspension is lifted while modal mounted, clean up stored redirect deadline.
  useEffect(() => {
    if (!storageKey) return;
    if (!isSuspended) {
      try {
        window.sessionStorage.removeItem(storageKey);
      } catch {}
    }
  }, [isSuspended, storageKey]);

  useEffect(() => {
    return () => clearTimers();
  }, []);

  if (status !== 'authenticated' || !isSuspended) return null;

  return (
    <div className="fixed inset-0 z-[9999] bg-black/60 flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-md bg-white rounded-lg border border-red-200 shadow-xl overflow-hidden">
        <div className="p-4 border-b border-[#e6e6e6] flex items-center gap-3">
          <div className="w-12 h-12 rounded-full bg-red-50 border border-red-200 flex items-center justify-center">
            <Ban className="w-6 h-6 text-red-600" />
          </div>
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-gray-900">Account suspended</h2>
            <p className="text-sm text-gray-600 mt-0.5">You can’t continue using the dashboard.</p>
          </div>
        </div>

        <div className="p-4 space-y-3">
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            Your account has been suspended by the platform admin. You will be redirected to the login page in{' '}
            <span className="font-semibold">{countdown}s</span>.
          </div>
          {reason ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              <span className="font-semibold">Reason:</span> {reason}
            </div>
          ) : null}
          {suspendedAt ? (
            <p className="text-[12px] text-gray-500">
              Suspended at <span className="font-medium text-gray-700">{new Date(suspendedAt).toLocaleString()}</span>
            </p>
          ) : null}
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <Loader2 className="w-4 h-4 animate-spin" />
            {blocking ? 'Suspension notice' : 'Preparing notice…'}
          </div>
          <button
            type="button"
            onClick={goToLoginNow}
            className="w-full inline-flex items-center justify-center rounded-lg bg-[#0a61d7] px-4 py-2 text-sm font-semibold text-white hover:bg-[#084ba6]"
          >
            Go to login
          </button>
          <p className="text-[12px] text-gray-500">
            If you believe this is a mistake, please contact support.
          </p>
        </div>
      </div>
    </div>
  );
}

