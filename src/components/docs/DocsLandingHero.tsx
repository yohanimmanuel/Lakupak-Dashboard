'use client';

import { useTranslations } from 'next-intl';
import { DocsSearchBar } from './DocsSearchBar';
import type { DocLocale } from '@/lib/docs/types';
import {
  BookOpen,
  LayoutDashboard,
  Store,
  Truck,
  Plug,
  Settings,
  ArrowRight,
} from 'lucide-react';
import Link from 'next/link';
import { getDocsCategories } from '@/lib/docs/categories';

const iconMap = {
  overview: BookOpen,
  dashboard: LayoutDashboard,
  marketplace: Store,
  driver: Truck,
  services: Plug,
  operations: Settings,
} as const;

export function DocsLandingHero({ locale }: { locale: DocLocale }) {
  const t = useTranslations('docs');

  return (
    <section className="relative overflow-hidden bg-gradient-to-br from-[#0a61d7] via-[#0851b8] to-[#063d8a] px-4 py-16 sm:py-20">
      <div className="pointer-events-none absolute inset-0 opacity-20" aria-hidden>
        <div className="absolute -right-20 -top-20 h-64 w-64 rotate-12 rounded-3xl bg-white/10" />
        <div className="absolute -bottom-16 -left-16 h-48 w-48 -rotate-6 rounded-3xl bg-white/10" />
        <div className="absolute left-1/2 top-[62%] w-[min(100%,36rem)] -translate-x-1/2 -translate-y-1/2">
          <div className="relative mx-auto h-44 w-full max-w-lg">
            <div className="absolute left-[8%] top-2 h-14 w-14 -rotate-12 rounded-2xl bg-white/15" />
            <div className="absolute left-1/2 top-1/2 h-28 w-28 -translate-x-1/2 -translate-y-1/2 rotate-6 rounded-3xl border border-white/25 bg-white/10" />
            <div className="absolute right-[10%] top-0 h-16 w-16 rotate-12 rounded-2xl bg-white/20" />
            <div className="absolute bottom-0 left-[18%] h-12 w-20 -rotate-3 rounded-xl bg-white/10" />
            <div className="absolute bottom-1 right-[20%] h-10 w-10 rotate-45 rounded-lg bg-white/15" />
            <div className="absolute left-[42%] -top-3 h-9 w-9 rotate-6 rounded-lg bg-white/25" />
            <div className="absolute right-[38%] bottom-3 h-14 w-14 -rotate-6 rounded-2xl border border-white/20 bg-white/5" />
          </div>
        </div>
      </div>
      <div className="relative z-10 mx-auto max-w-3xl text-center">
        <h1 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">{t('landing.title')}</h1>
        <p className="mt-3 text-base text-blue-100 sm:text-lg">{t('landing.subtitle')}</p>
        <div className="mt-8">
          <DocsSearchBar locale={locale} large placeholder={t('landing.searchPlaceholder')} />
        </div>
      </div>
    </section>
  );
}

export function DocsCategoryGrid({ locale }: { locale: DocLocale }) {
  const categories = getDocsCategories(locale);

  return (
    <section className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {categories.map((cat) => {
          const Icon = iconMap[cat.icon];
          return (
            <Link
              key={cat.id}
              href={cat.href}
              className="group flex flex-col rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition hover:border-[#0a61d7]/40 hover:shadow-md"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 text-[#0a61d7]">
                <Icon className="h-5 w-5" aria-hidden />
              </div>
              <h2 className="mt-4 text-lg font-semibold text-gray-900 group-hover:text-[#0a61d7]">
                {cat.title}
              </h2>
              <p className="mt-2 flex-1 text-sm text-gray-600">{cat.description}</p>
              <span className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-[#0a61d7]">
                Browse
                <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
              </span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
