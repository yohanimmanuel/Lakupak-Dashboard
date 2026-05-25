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
  const dropdownContainerRef = React.useRef<HTMLDivElement | null>(null);
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
    const newPath = segments.join('/') || '/';
    router.push(newPath);
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
    <header className="sticky top-0 z-50 w-full border-b border-white/30 bg-white/30 shadow-sm backdrop-blur-lg">
      <div
        className={
          showContentChrome
            ? 'w-full px-4 sm:px-6 lg:px-8'
            : 'mx-auto max-w-7xl px-4 sm:px-6 lg:px-8'
        }
      >
        <div className="flex h-20 items-center gap-3 sm:gap-6 lg:gap-8">
          <Link href={`/${locale}/landing`} className="flex shrink-0 items-center">
            <Image
              src="/LakuTextLogo.svg"
              alt="Laku Logo"
              width={150}
              height={80}
              className="h-10 w-auto sm:h-12"
            />
          </Link>

          {showContentChrome ? (
            <div className="w-full max-w-[600px] sm:max-w-sm md:max-w-md">
              <DocsSearchBar
                locale={locale}
                className="max-w-none w-full"
                placeholder={tDocs('landing.searchPlaceholder')}
              />
            </div>
          ) : null}

          <div className="ml-auto flex shrink-0 items-center space-x-4 sm:space-x-6">
            <div
              className="relative"
              ref={dropdownContainerRef}
              data-dropdown-container="lang"
              onKeyDown={handleKeyDown}
            >
              <button
                ref={toggleButtonRef}
                onClick={() => setDropdownOpen((open) => !open)}
                className="flex items-center px-3 py-2 rounded-full bg-white border border-gray-200 shadow-sm hover:bg-gray-50 transition min-w-[64px]"
                aria-label="Select language"
                aria-haspopup="menu"
                aria-expanded={dropdownOpen}
                type="button"
              >
                <Image
                  src={currentLang?.icon || ''}
                  alt={currentLang?.label || ''}
                  width={24}
                  height={24}
                  className="mr-2"
                />
                <ChevronUpIcon
                  className={`w-4 h-4 ml-1 text-gray-500 transition-transform ${
                    dropdownOpen ? '' : 'rotate-180'
                  }`}
                />
              </button>
              {dropdownOpen && (
                <div
                  role="menu"
                  aria-label="Language options"
                  className="absolute right-0 mt-2 w-40 bg-white rounded-xl shadow-lg border border-gray-100 z-50 animate-fade-in-up"
                >
                  {LANG_OPTIONS.map((option, index) => (
                    <button
                      key={option.code}
                      ref={(el) => {
                        optionRefs.current[index] = el;
                      }}
                      role="menuitem"
                      tabIndex={-1}
                      onClick={() => handleLocaleChange(option.code)}
                      className={`flex items-center w-full px-4 py-2 text-sm rounded-xl hover:bg-blue-50 focus:bg-blue-50 focus:outline-none transition-colors ${
                        locale === option.code ? 'font-bold text-blue-700' : 'text-gray-700'
                      }`}
                    >
                      <Image src={option.icon} alt={option.label} width={22} height={22} className="mr-2" />
                      {option.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={() => router.push('/login')}
              className="text-gray-700 transition-colors hover:text-[#0a61d7] bg-transparent border-none cursor-pointer"
            >
              {tNav('signin')}
            </button>
            <button
              type="button"
              onClick={() => router.push('/register')}
              className="bg-[#0a61d7] text-white px-6 py-2.5 rounded-lg hover:bg-[#084ba6] transition-colors shadow-lg hover:shadow-xl"
            >
              {tNav('getstarted')}
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
