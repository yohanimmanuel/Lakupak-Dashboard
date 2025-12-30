'use client';

import { useEffect, useState } from 'react';
import { useUserStore } from '@/store/userStore';
import { useSession } from 'next-auth/react';
import { AlertCircle, Clock } from 'lucide-react';

// Show warning 5 minutes before session expiry
const WARNING_THRESHOLD = 5 * 60 * 1000; // 5 minutes in milliseconds
const WARNING_THRESHOLD_SECONDS = WARNING_THRESHOLD / 1000; // 5 minutes in seconds (for progress bar)

export function SessionWarningModal() {
  const { sessionExpiry, extendSession, clearUser } = useUserStore();
  const { data: session, update: updateSession } = useSession();
  const [showWarning, setShowWarning] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [sessionType, setSessionType] = useState<'zustand' | 'nextauth' | null>(null);
  useEffect(() => {
    const checkSessions = () => {
      // Priority: Check Zustand session first (email/password login)
      if (sessionExpiry) {
        const now = Date.now();
        const timeLeft = sessionExpiry - now;
        
        // Show warning 5 minutes before expiry
        const WARNING_THRESHOLD = 5 * 60 * 1000; // 5 minutes
        
        if (timeLeft <= WARNING_THRESHOLD && timeLeft > 0) {
          setShowWarning(true);
          setCountdown(Math.ceil(timeLeft / 1000));
          setSessionType('zustand');
        } else if (timeLeft <= 0) {
          // Session expired
          setShowWarning(false);
          clearUser();
        } else {
          setShowWarning(false);
        }
        return;
      }
      
      // Check for NextAuth session (Google OAuth) if no Zustand session
      if (session?.expires) {
        const now = Date.now();
        const expiryTime = new Date(session.expires).getTime();
        const timeLeft = expiryTime - now;
        
        // Show warning 5 minutes before expiry
        const WARNING_THRESHOLD = 5 * 60 * 1000; // 5 minutes
        
        if (timeLeft <= WARNING_THRESHOLD && timeLeft > 0) {
          setShowWarning(true);
          setCountdown(Math.ceil(timeLeft / 1000));
          setSessionType('nextauth');
        } else if (timeLeft <= 0) {
          // Session expired - NextAuth will handle redirect
          setShowWarning(false);
        } else {
          setShowWarning(false);
        }
      }
    };

    checkSessions();
    const interval = setInterval(checkSessions, 1000);
    return () => clearInterval(interval);
  }, [sessionExpiry, clearUser, session]);

  const handleContinueSession = async () => {
    if (sessionType === 'zustand') {
      // Extend Zustand session (email/password login)
      extendSession();
    } else if (sessionType === 'nextauth') {
      // Extend NextAuth session (Google OAuth)
      // This triggers the JWT callback with trigger: "update"
      await updateSession();
    }
    setShowWarning(false);
  };

  if (!showWarning) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[9999]">
      <div className="bg-white rounded-lg shadow-xl p-4 w-full max-w-md mx-4 animate-in fade-in zoom-in duration-200">
        {/* Header with Icon */}
        <div className="flex items-center gap-3 mb-4">
          <div className="w-12 h-12 rounded-full bg-orange-100 flex items-center justify-center">
            <Clock className="w-6 h-6 text-orange-600" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Session Expiring Soon</h3>
            <p className="text-sm text-gray-500">Your session is about to expire</p>
          </div>
        </div>

        {/* Warning Message */}
        <div className="bg-orange-50 border border-orange-200 rounded-lg p-4 mb-4">
          <div className="flex items-start gap-2">
            <AlertCircle className="w-5 h-5 text-orange-600 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-sm text-gray-700">
                For your security, you will be automatically logged out in{' '}
                <span className="font-bold text-orange-600">
                  {Math.floor(countdown / 60)} minute{Math.floor(countdown / 60) !== 1 ? 's' : ''} {countdown % 60} second{countdown % 60 !== 1 ? 's' : ''}
                </span>.
              </p>
              <p className="text-xs text-gray-600 mt-1">
                Click "Continue Session" to stay logged in.
              </p>
            </div>
          </div>
        </div>

        {/* Countdown Progress Bar */}
        <div className="mb-6">
          <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
            <div 
              className="h-full bg-orange-500 transition-all duration-1000 ease-linear"
              style={{ width: `${(countdown / WARNING_THRESHOLD_SECONDS) * 100}%` }}
            />
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-3">
          <button
            onClick={() => {
              setShowWarning(false);
              clearUser();
            }}
            className="flex-1 px-4 py-2.5 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors text-sm font-medium"
          >
            Logout
          </button>
          <button
            onClick={handleContinueSession}
            className="flex-1 px-4 py-2.5 bg-[#0a61d7] text-white rounded-lg hover:bg-[#084ba6] transition-colors text-sm font-semibold shadow-sm"
          >
            Continue Session
          </button>
        </div>
      </div>
    </div>
  );
}

