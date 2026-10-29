'use client';

import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom';
import { X, BookOpen } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useUserStore } from '@/store/userStore';

type DashboardHelpModalProps = {
  open: boolean;
  onCloseAction: () => void;
};

const HELP_FEATURE_KEYS = [
  'products',
  'orders',
  'clients',
  // MVP pause: 'sales', 'analytics', 'marketplace',
  'logistics',
] as const;
const HELP_TIP_KEYS = ['search', 'sidebar', 'tours'] as const;
const SEARCH_VISIBLE_MQ = '(min-width: 640px)';

export function DashboardHelpModal({ open, onCloseAction }: DashboardHelpModalProps) {
  const tHelp = useTranslations('dashboard.help');
  const user = useUserStore((s) => s.user);
  const docLocale = user?.language === 'id' ? 'id' : 'en';
  const [isSearchVisible, setIsSearchVisible] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(SEARCH_VISIBLE_MQ).matches,
  );

  useEffect(() => {
    const mq = window.matchMedia(SEARCH_VISIBLE_MQ);
    const sync = () => setIsSearchVisible(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  const tipKeys = HELP_TIP_KEYS.filter((key) => key !== 'search' || isSearchVisible);

  if (!open) return null;

  return ReactDOM.createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/30" onClick={onCloseAction} aria-hidden />
      <div
        className="relative z-10 mx-4 w-full max-w-md rounded-xl bg-white p-6 shadow-2xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-labelledby="dashboard-help-title"
      >
        <button
          type="button"
          onClick={onCloseAction}
          className="absolute right-3 top-3 rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          aria-label={tHelp('close')}
        >
          <X size={18} />
        </button>
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-[#e8f0fe]">
          <img src="/LakuIcon.svg" alt="" className="h-8 w-8 object-contain" aria-hidden />
        </div>
        <h2 id="dashboard-help-title" className="text-lg font-bold text-gray-900">
          {tHelp('title')}
        </h2>
        <p className="mt-1 text-sm font-medium text-[#0a61d7]">{tHelp('tagline')}</p>

        <div className="mt-4">
          <p className="text-sm font-semibold text-gray-900">{tHelp('whatYouCanDo')}</p>
          <ul className="mt-2 space-y-2">
            {HELP_FEATURE_KEYS.map((key) => (
              <li key={key} className="flex gap-2 text-sm text-gray-600">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#0a61d7]" aria-hidden />
                <span>{tHelp(`features.${key}`)}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="mt-5 rounded-lg border border-gray-100 bg-gray-50 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{tHelp('quickTipsTitle')}</p>
          <ul className="mt-2 space-y-1.5">
            {tipKeys.map((key) => (
              <li key={key} className="text-sm text-gray-700">
                {tHelp(`tips.${key}`)}
              </li>
            ))}
          </ul>
        </div>

        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href={`/${docLocale}/docs`}
            className="inline-flex items-center gap-2 rounded-lg bg-[#0a61d7] px-4 py-2 text-sm font-semibold text-white hover:bg-[#084ba6] transition-colors"
            onClick={onCloseAction}
          >
            <BookOpen size={16} />
            {tHelp('docsLink')}
          </Link>
          <button
            type="button"
            onClick={onCloseAction}
            className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
          >
            {tHelp('close')}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
