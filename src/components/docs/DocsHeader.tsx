'use client';

import React from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { ChevronUpIcon } from 'lucide-react';
import { DocsSearchBar } from './DocsSearchBar';
import type { DocLocale } from '@/lib/docs/types';

const LANG_OPTIONS = [
  { code: 'en', label: 'English', icon: '/USIcon.svg' },
  { code: 'id', label: 'Bahasa', icon: '/IndonesiaIcon.svg' },
] as const;

function isDocsContentPage(pathname: string | null): boolean {
  if (!pathname) return false;
  const match = pathname.match(/^\/(en|id)\/docs(\/.*)?$/);
  if (!match) return false;
  const rest = match[2] ?? '';
  return rest.length > 0;
}

export function DocsHeader() {
  const pathname = usePathname();
  const router = useRouter();
  const tNav = useTranslations('navbar');
  const tDocs = useTranslations('docs');
  const locale = (pathname?.split('/')[1] === 'id' ? 'id' : 'en') as DocLocale;
  const showContentChrome = isDocsContentPage(pathname);
  const [dropdownOpen, setDropdownOpen] = React.useState(false);
  const [focusIndex, setFocusIndex] = React.useState<number>(-1);
  const currentLang = LANG_OPTIONS.find((l) => l.code === locale);
  const toggleButtonRef = React.useRef<HTMLButtonElement | null>(null);
  const optionRefs = React.useRef<Array<HTMLButtonElement | null>>([]);

  const handleLocaleChange = (newLocale: string) => {
    if (newLocale === locale) return setDropdownOpen(false);
    const segments = (pathname ?? '').split('/');
    if (segments[1] === 'en' || segments[1] === 'id') {
      segments[1] = newLocale;
    } else {
      segments.splice(1, 0, newLocale);
    }
    router.push(segments.join('/') || '/');
    setDropdownOpen(false);
  };

  React.useEffect(() => {
    if (!dropdownOpen) return;
    const onPointerDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest('[data-dropdown-container="lang"]')) return;
      setDropdownOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [dropdownOpen]);

  React.useEffect(() => {
    if (!dropdownOpen) {
      setFocusIndex(-1);
      return;
    }
    const initial = Math.max(
      0,
      LANG_OPTIONS.findIndex((o) => o.code === locale),
    );
    setFocusIndex(initial);
  }, [dropdownOpen, locale]);

  React.useEffect(() => {
    if (!dropdownOpen || focusIndex < 0) return;
    optionRefs.current[focusIndex]?.focus();
  }, [dropdownOpen, focusIndex]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      setDropdownOpen(false);
      toggleButtonRef.current?.focus();
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setFocusIndex((i) => (i + 1) % LANG_OPTIONS.length);
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setFocusIndex((i) => (i <= 0 ? LANG_OPTIONS.length - 1 : i - 1));
      return;
    }
    if (e.key === 'Home') {
      e.preventDefault();
      setFocusIndex(0);
      return;
    }
    if (e.key === 'End') {
      e.preventDefault();
      setFocusIndex(LANG_OPTIONS.length - 1);
    }
  };

  return (
    <header className="sticky top-0 z-30 w-full bg-white border-b border-gray-200">
      <div className="flex items-center justify-between gap-4 px-4 h-16">
        <div className="flex items-center gap-4 min-w-0 flex-1">
          <Link href={`/${locale}/landing`} className="flex items-center min-w-0 shrink-0">
            <img
              src="/Lakupak!.svg"
              alt="Lakupak"
              width={120}
              height={36}
              className="h-9 w-auto hidden sm:block"
              loading="eager"
              fetchPriority="high"
              decoding="async"
            />
            <img
              src="/Lakupak!.svg"
              alt="Lakupak"
              width={36}
              height={36}
              className="h-9 w-9 sm:hidden"
              loading="eager"
              decoding="async"
            />
          </Link>

          {showContentChrome ? (
            <div className="hidden sm:flex min-w-0 w-full max-w-xs md:max-w-sm lg:max-w-md">
              <DocsSearchBar
                locale={locale}
                className="relative w-full max-w-none"
                placeholder={tDocs('landing.searchPlaceholder')}
              />
            </div>
          ) : null}
        </div>

        <div className="flex items-center gap-2 justify-end shrink-0">
          <div
            className="relative"
            data-dropdown-container="lang"
            onKeyDown={handleKeyDown}
          >
            <button
              ref={toggleButtonRef}
              onClick={() => setDropdownOpen((open) => !open)}
              className="flex items-center px-2.5 py-1.5 rounded-full bg-white border border-gray-200 hover:bg-gray-50 transition-colors shadow-sm"
              aria-label="Select language"
              aria-haspopup="menu"
              aria-expanded={dropdownOpen}
              type="button"
            >
              <Image
                src={currentLang?.icon || ''}
                alt={currentLang?.label || ''}
                width={20}
                height={20}
                className="mr-1.5"
              />
              <ChevronUpIcon
                className={`w-3.5 h-3.5 text-gray-500 transition-transform ${
                  dropdownOpen ? '' : 'rotate-180'
                }`}
              />
            </button>
            {dropdownOpen && (
              <div
                role="menu"
                aria-label="Language options"
                className="absolute right-0 mt-2 w-40 bg-white rounded-xl shadow-lg border border-gray-200 z-50 overflow-hidden"
              >
                {LANG_OPTIONS.map((option, index) => (
                  <button
                    key={option.code}
                    ref={(el) => {
                      optionRefs.current[index] = el;
                    }}
                    role="menuitem"
                    tabIndex={-1}
                    type="button"
                    onClick={() => handleLocaleChange(option.code)}
                    className={`flex items-center w-full px-3 py-2 text-sm hover:bg-gray-50 focus:bg-gray-50 focus:outline-none transition-colors ${
                      locale === option.code ? 'font-semibold text-[#0a61d7]' : 'text-gray-700'
                    }`}
                  >
                    <Image src={option.icon} alt={option.label} width={18} height={18} className="mr-2" />
                    {option.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={() => router.push('/login')}
            className="hidden sm:inline text-sm text-gray-600 hover:text-[#0a61d7] transition-colors"
          >
            {tNav('signin')}
          </button>
          <button
            type="button"
            onClick={() => router.push('/register')}
            className="bg-[#0a61d7] text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-[#084ba6] transition-colors"
          >
            {tNav('getstarted')}
          </button>
        </div>
      </div>
    </header>
  );
}
