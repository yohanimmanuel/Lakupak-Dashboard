'use client';

import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  BarChart2,
  Clock,
  CreditCard,
  FileText,
  Gift,
  ShoppingCart,
  Store,
  TrendingUp,
  Truck,
} from 'lucide-react';
import { AuthDecorativeBackground } from '@/components/auth/AuthDecorativeBackground';
import {
  createErrorBoundary,
  createTrackConversion,
  usePagePerformanceTracking,
} from '@/utils/landing-enhancements';
import { Reveal } from '../Reveal';

const ErrorBoundary = createErrorBoundary('Solutions');

const DISTRIBUTOR_ICONS = [Store, BarChart2, FileText, TrendingUp, Gift] as const;
const RETAILER_ICONS = [ShoppingCart, Store, Clock, CreditCard, Truck] as const;

/** Normalize badge sub-copy to [prefix, emphasis, suffix]; avoids rendering undefined. */
function badgeSubParts(raw: unknown): [string, string, string] {
  const parts = Array.isArray(raw) ? raw.map((p) => (typeof p === 'string' ? p : '')) : [];
  return [parts[0] ?? '', parts[1] ?? '', parts[2] ?? ''];
}

export default function SolutionsPage() {
  const router = useRouter();
  const t = useTranslations('solutions');

  usePagePerformanceTracking('Solutions');
  const trackConversion = createTrackConversion('Solutions');

  const goRegister = () => {
    trackConversion('cta_click', 'solutions_register');
    router.push('/register');
  };

  const testimonials = [1, 2, 3, 4].map((n) => ({
    name: t(`testimonials.${n}.name`),
    role: t(`testimonials.${n}.role`),
    text: t(`testimonials.${n}.text`),
  }));

  const leftSub = badgeSubParts(t.raw('badges.left.sub'));
  const rightSub = badgeSubParts(t.raw('badges.right.sub'));

  return (
    <ErrorBoundary>
      <div className="min-h-screen bg-white text-gray-900">
        {/* Hero — full-bleed under navbar */}
        <section className="relative overflow-hidden pb-16 sm:pb-20 pt-24 sm:pt-28 bg-gradient-to-b from-white via-[#f8fbff] to-[#eef4fd]">
          <AuthDecorativeBackground variant="light" />

          <div className="relative z-10 mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 text-center">
            <Reveal className="mx-auto max-w-3xl">
              <h1 className="text-3xl sm:text-4xl lg:text-[2.75rem] font-bold tracking-tight text-gray-900 leading-tight">
                {t('hero.title')}
              </h1>
              <p className="mx-auto mt-4 text-base sm:text-lg text-gray-600 leading-relaxed max-w-2xl">
                {t('hero.subtitle')}
              </p>
              <button
                type="button"
                onClick={goRegister}
                className="mt-8 bg-[#0a61d7] text-white px-7 py-3 rounded-xl text-sm font-semibold hover:bg-[#084ba6] transition-colors"
              >
                {t('hero.cta')}
              </button>
            </Reveal>

            <Reveal delayMs={120} className="mt-10 sm:mt-12">
              {/* Image showcase with original attached statcards (unchanged) */}
              <div className="flex justify-center relative">
                {/* Left Badge Group */}
                <div className="absolute left-0 top-40 z-30 pointer-events-none">
                  <div className="flex flex-col items-start">
                    <div className="bg-white px-5 py-2 rounded-full shadow-lg text-sm font-semibold text-[#0a61d7] border border-blue-100 mb-2 pointer-events-auto">
                      {t('badges.left.main')}
                    </div>
                    <div className="bg-white px-5 py-2 rounded-full shadow text-xs font-medium text-gray-700 border border-blue-100 mt-2 pointer-events-auto">
                      {leftSub[0]}
                      <span className="text-[#0a61d7] font-bold">{leftSub[1]}</span>
                      {leftSub[2]}
                    </div>
                  </div>
                </div>
                {/* Right Badge Group */}
                <div className="absolute right-0 top-60 z-30 pointer-events-none">
                  <div className="flex flex-col items-end">
                    <div className="bg-white px-5 py-2 rounded-full shadow-lg text-sm font-semibold text-orange-600 border border-orange-100 mb-2 pointer-events-auto">
                      {t('badges.right.main')}
                    </div>
                    <div className="bg-white px-5 py-2 rounded-full shadow text-xs font-medium text-gray-700 border border-orange-100 mt-2 pointer-events-auto">
                      {rightSub[0]}
                      <span className="text-green-500 font-bold">{rightSub[1]}</span>
                      {rightSub[2]}
                    </div>
                  </div>
                </div>

                <div className="w-full max-w-5xl rounded-2xl border border-white/80 bg-white/90 p-2 sm:p-3 shadow-[0_12px_40px_-12px_rgba(10,97,215,0.18)] backdrop-blur-sm overflow-hidden">
                  <div className="relative flex w-full aspect-[2/1] min-h-[200px] sm:min-h-[280px] rounded-xl overflow-hidden">
                    <div className="relative w-1/2 h-full">
                      <Image
                        src="/femaleworkerwarehouse.png"
                        alt="Female Worker Warehouse"
                        fill
                        quality={100}
                        className="object-cover"
                        sizes="(min-width:1280px) 900px, (min-width:1024px) 700px, 100vw"
                        priority
                      />
                    </div>
                    <div className="relative w-1/2 h-full">
                      <Image
                        src="/deliveryman.png"
                        alt="Ecommerce Delivery Man"
                        fill
                        quality={100}
                        className="object-cover"
                        sizes="(min-width:1280px) 900px, (min-width:1024px) 700px, 100vw"
                        priority
                      />
                    </div>
                  </div>
                </div>
              </div>
            </Reveal>
          </div>
        </section>

        {/* Two audiences */}
        <section className="py-16 sm:py-20 bg-white">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
            <Reveal className="text-center mb-12 max-w-2xl mx-auto">
              <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-gray-900">
                {t('twocol.title')}
              </h2>
              <p className="mt-3 text-base sm:text-lg text-gray-600 leading-relaxed">
                {t('twocol.subtitle')}
              </p>
            </Reveal>

            <div className="grid md:grid-cols-2 gap-4 sm:gap-6">
              <Reveal>
                <div className="h-full rounded-2xl border border-gray-200 bg-[#f7f9fc] p-6 sm:p-8">
                  <p className="text-xs font-semibold tracking-widest uppercase text-[#0a61d7] mb-3">
                    Distributor
                  </p>
                  <h3 className="text-xl font-bold text-gray-900 mb-6 leading-snug">
                    {t('twocol.distributor.title')}
                  </h3>
                  <ul className="space-y-5">
                    {DISTRIBUTOR_ICONS.map((Icon, i) => {
                      const n = (i + 1) as 1 | 2 | 3 | 4 | 5;
                      return (
                        <li key={n} className="flex items-start gap-3">
                          <span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white border border-gray-200 text-[#0a61d7]">
                            <Icon className="w-4 h-4" strokeWidth={1.75} />
                          </span>
                          <div>
                            <p className="text-sm font-semibold text-gray-900">
                              {t(`twocol.distributor.${n}.label`)}
                            </p>
                            <p className="mt-1 text-sm text-gray-600 leading-relaxed">
                              {t(`twocol.distributor.${n}.desc`)}
                            </p>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              </Reveal>

              <Reveal delayMs={80}>
                <div className="h-full rounded-2xl border border-gray-200 bg-white p-6 sm:p-8">
                  <p className="text-xs font-semibold tracking-widest uppercase text-[#0a61d7] mb-3">
                    Retailer
                  </p>
                  <h3 className="text-xl font-bold text-gray-900 mb-6 leading-snug">
                    {t('twocol.retailer.title')}
                  </h3>
                  <ul className="space-y-5">
                    {RETAILER_ICONS.map((Icon, i) => {
                      const n = (i + 1) as 1 | 2 | 3 | 4 | 5;
                      return (
                        <li key={n} className="flex items-start gap-3">
                          <span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#f7faff] text-[#0a61d7]">
                            <Icon className="w-4 h-4" strokeWidth={1.75} />
                          </span>
                          <div>
                            <p className="text-sm font-semibold text-gray-900">
                              {t(`twocol.retailer.${n}.label`)}
                            </p>
                            <p className="mt-1 text-sm text-gray-600 leading-relaxed">
                              {t(`twocol.retailer.${n}.desc`)}
                            </p>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              </Reveal>
            </div>
          </div>
        </section>

        {/* Steps */}
        <section className="py-16 sm:py-20 bg-[#f7f9fc] border-y border-gray-200">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
            <Reveal className="text-center mb-12 max-w-2xl mx-auto">
              <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-gray-900">
                {t('steps.title')}
              </h2>
              <p className="mt-3 text-base sm:text-lg text-gray-600">{t('steps.subtitle')}</p>
            </Reveal>

            <div className="grid md:grid-cols-3 gap-8 md:gap-10">
              {[1, 2, 3].map((i) => (
                <Reveal key={i} delayMs={i * 70}>
                  <div className="border-t border-gray-200 pt-6">
                    <p className="text-xs font-semibold tracking-widest text-[#0a61d7] mb-3">
                      {String(i).padStart(2, '0')}
                    </p>
                    <h3 className="text-lg font-bold text-gray-900 mb-2">{t(`steps.${i}.title`)}</h3>
                    <p className="text-sm text-gray-600 leading-relaxed">{t(`steps.${i}.desc`)}</p>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* Testimonials */}
        <section className="py-16 sm:py-20 bg-white">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
            <Reveal className="text-center mb-12">
              <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-gray-900">
                {t('testimonials.title')}
              </h2>
            </Reveal>

            <div className="grid sm:grid-cols-2 gap-4 sm:gap-6">
              {testimonials.map((item, i) => (
                <Reveal key={item.name} delayMs={i * 60}>
                  <blockquote className="h-full rounded-2xl border border-gray-200 bg-[#f7f9fc] p-6 sm:p-8">
                    <p className="text-gray-700 leading-relaxed text-[15px]">“{item.text}”</p>
                    <footer className="mt-6">
                      <p className="text-sm font-semibold text-gray-900">{item.name}</p>
                      <p className="text-sm text-gray-500">{item.role}</p>
                    </footer>
                  </blockquote>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* Final CTA */}
        <section className="relative overflow-hidden py-16 sm:py-20 bg-gradient-to-b from-[#0a61d7] to-[#084ba6]">
          <AuthDecorativeBackground variant="blue" />
          <Reveal className="relative z-10 mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 text-center">
            <h2 className="text-3xl sm:text-4xl font-bold text-white tracking-tight">{t('cta.title')}</h2>
            <p className="mt-4 text-base sm:text-lg text-blue-100 leading-relaxed">{t('cta.subtitle')}</p>
            <button
              type="button"
              onClick={goRegister}
              className="mt-8 bg-white text-[#0a61d7] px-8 py-3.5 rounded-xl text-sm font-semibold hover:bg-blue-50 transition-colors"
            >
              {t('cta.button')}
            </button>
          </Reveal>
        </section>
      </div>
    </ErrorBoundary>
  );
}
