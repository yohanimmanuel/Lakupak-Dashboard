'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { DocsSearchBar } from './DocsSearchBar';
import type { DocLocale } from '@/lib/docs/types';

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
          <Link href={`/${locale}/docs`} className="flex shrink-0 items-center">
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
            <button
              type="button"
              onClick={() => router.push(`/${locale}/landing`)}
              className="hidden text-gray-700 transition-colors hover:text-[#0a61d7] bg-transparent border-none cursor-pointer md:inline"
            >
              {tNav('home')}
            </button>
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
              className="rounded-lg bg-[#0a61d7] px-4 py-2 text-sm text-white shadow-lg transition-colors hover:bg-[#084ba6] hover:shadow-xl sm:px-6 sm:py-2.5 sm:text-base"
            >
              {tNav('getstarted')}
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
