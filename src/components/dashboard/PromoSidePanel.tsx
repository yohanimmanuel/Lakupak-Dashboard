'use client';

import React, { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { useTranslations } from 'next-intl';

type PromoSidePanelProps = {
  show: boolean;
  onCloseAction: () => void;
};

/** Premium upsell — same card design as the sidebar promo, slides in from the right. */
export function PromoSidePanel({ show, onCloseAction }: PromoSidePanelProps) {
  const tPromo = useTranslations('dashboard.promo');
  const [isVisible, setIsVisible] = useState(false);
  const [isSlidingIn, setIsSlidingIn] = useState(false);
  const [isSlidingOut, setIsSlidingOut] = useState(false);
  const slideInTimerRef = useRef<number | null>(null);
  const hideTimerRef = useRef<number | null>(null);
  const isMountedVisibleRef = useRef(false);

  const beginSlideOut = (after?: () => void) => {
    setIsSlidingOut(true);
    setIsSlidingIn(false);
    if (slideInTimerRef.current != null) {
      window.clearTimeout(slideInTimerRef.current);
      slideInTimerRef.current = null;
    }
    if (hideTimerRef.current != null) {
      window.clearTimeout(hideTimerRef.current);
    }
    hideTimerRef.current = window.setTimeout(() => {
      hideTimerRef.current = null;
      isMountedVisibleRef.current = false;
      setIsVisible(false);
      setIsSlidingOut(false);
      after?.();
    }, 500);
  };

  useEffect(() => {
    if (show) {
      isMountedVisibleRef.current = true;
      setIsVisible(true);
      setIsSlidingOut(false);
      setIsSlidingIn(false);
      slideInTimerRef.current = window.setTimeout(() => setIsSlidingIn(true), 50);
      return () => {
        if (slideInTimerRef.current != null) {
          window.clearTimeout(slideInTimerRef.current);
          slideInTimerRef.current = null;
        }
      };
    }

    if (isMountedVisibleRef.current) {
      isMountedVisibleRef.current = false;
      beginSlideOut();
    } else {
      setIsVisible(false);
      setIsSlidingIn(false);
      setIsSlidingOut(false);
    }
  }, [show]);

  const handleClose = () => {
    beginSlideOut(onCloseAction);
  };

  useEffect(() => {
    return () => {
      if (slideInTimerRef.current != null) {
        window.clearTimeout(slideInTimerRef.current);
      }
      if (hideTimerRef.current != null) {
        window.clearTimeout(hideTimerRef.current);
      }
    };
  }, []);

  if (!show && !isVisible) return null;

  const panelTransform = isSlidingOut
    ? 'translate-x-full opacity-0'
    : isSlidingIn
      ? 'translate-x-0 opacity-100'
      : 'translate-x-full opacity-0';

  return (
    <div
      className={`pointer-events-none fixed right-4 bottom-6 z-[65] sm:right-6 transform transition-all duration-500 ease-out ${panelTransform}`}
      aria-live="polite"
    >
      <div
        role="region"
        aria-label={tPromo('title')}
        className="pointer-events-auto relative w-[280px] sm:w-[300px] bg-gradient-to-r from-[#0a61d7] to-blue-500 rounded-2xl p-5 flex flex-col items-start shadow-xl"
      >
        <button
          type="button"
          className="absolute top-3 right-3 text-white hover:text-gray-300 p-1 rounded"
          onClick={handleClose}
          aria-label={tPromo('close')}
        >
          <X className="w-5 h-5" />
        </button>
        <div className="text-white text-md font-semibold mb-2 pr-6">{tPromo('title')}</div>
        <div className="text-gray-200 text-xs mb-3 leading-relaxed">{tPromo('body')}</div>
        <button
          type="button"
          className="w-full bg-white text-[#0a61d7] font-bold p-2.5 rounded-lg shadow hover:bg-gray-200 transition text-sm"
        >
          {tPromo('cta')}
        </button>
      </div>
    </div>
  );
}
