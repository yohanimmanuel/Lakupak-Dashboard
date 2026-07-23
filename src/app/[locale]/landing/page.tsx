'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { measurePerformance, trackScrollDepth, lazyLoadSection } from '@/utils/performance';
import { AuthDecorativeBackground } from '@/components/auth/AuthDecorativeBackground';
import { Reveal } from './Reveal';

type SellingTab = 'clients' | 'products' | 'orders';

const SELLING_TABS: SellingTab[] = ['clients', 'products', 'orders'];

const usePerformanceTracking = () => {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const trackPerformance = () => {
      const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
      if (navigation && window.gtag) {
        const loadTime = navigation.loadEventEnd - navigation.fetchStart;
        window.gtag('event', 'page_load_time', {
          custom_parameter: Math.round(loadTime),
        });
      }
    };
    if (document.readyState === 'complete') trackPerformance();
    else window.addEventListener('load', trackPerformance);
  }, []);
};

const trackConversion = (action: string, label?: string) => {
  if (typeof window !== 'undefined' && window.gtag) {
    window.gtag('event', action, {
      event_category: 'Landing Page',
      event_label: label,
      custom_parameter: new Date().toISOString(),
    });
  }
};

function ErrorBoundary({ children }: { children: React.ReactNode }) {
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    const handleError = (error: ErrorEvent) => {
      setHasError(true);
      if (window.gtag) {
        window.gtag('event', 'exception', {
          description: error.message,
          fatal: false,
        });
      }
    };
    window.addEventListener('error', handleError);
    return () => window.removeEventListener('error', handleError);
  }, []);

  if (hasError) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center bg-[#f7f9fc]">
        <div className="text-center px-4">
          <h2 className="text-2xl font-semibold text-gray-900 mb-3">
            Something went wrong
          </h2>
          <p className="text-gray-600 mb-6">Please refresh the page and try again.</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="bg-[#0a61d7] text-white px-6 py-2.5 rounded-xl hover:bg-[#084ba6] transition-colors"
          >
            Refresh page
          </button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

function ImagePlaceholder({ label, className = '' }: { label: string; className?: string }) {
  return (
    <div
      className={`flex items-center justify-center rounded-2xl border border-dashed border-gray-300 bg-gray-100/80 text-center px-6 ${className}`}
      role="img"
      aria-label={label}
    >
      <p className="text-sm text-gray-500 max-w-sm leading-relaxed">{label}</p>
    </div>
  );
}

function HeroStagger({
  children,
  delayMs,
  className = '',
}: {
  children: React.ReactNode;
  delayMs: number;
  className?: string;
}) {
  const [show, setShow] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    setReduceMotion(reduce);
    if (reduce) {
      setShow(true);
      return;
    }
    const id = window.setTimeout(() => setShow(true), delayMs);
    return () => window.clearTimeout(id);
  }, [delayMs]);

  return (
    <div
      className={className}
      style={{
        opacity: show ? 1 : 0,
        transform: show || reduceMotion ? 'translateY(0)' : 'translateY(16px)',
        transition: reduceMotion ? 'none' : 'opacity 0.55s ease, transform 0.55s ease',
      }}
    >
      {children}
    </div>
  );
}

function SellingSection() {
  const t = useTranslations('landing');
  const [active, setActive] = useState<SellingTab>('clients');

  return (
    <section id="features" className="py-16 sm:py-20 bg-white">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <Reveal className="mb-10 max-w-3xl">
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-gray-900">
            {t('features.selling.title')}
          </h2>
          <p className="mt-3 text-base sm:text-lg text-gray-600 leading-relaxed">
            {t('features.selling.subtitle')}
          </p>
        </Reveal>

        <Reveal>
          <div className="rounded-2xl border border-gray-200 bg-[#f7f9fc] p-3 sm:p-4 mb-10">
            <ImagePlaceholder
              label={t(`features.selling.placeholders.${active}`)}
              className="min-h-[240px] sm:min-h-[360px] w-full bg-white"
            />
          </div>
        </Reveal>

        <Reveal>
          <div className="grid md:grid-cols-3 gap-6 md:gap-8">
            {SELLING_TABS.map((tab) => {
              const isActive = active === tab;
              return (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setActive(tab)}
                  className="text-left group"
                >
                  <div
                    className={`h-0.5 w-full mb-4 transition-colors ${
                      isActive ? 'bg-gray-900' : 'bg-gray-200 group-hover:bg-gray-300'
                    }`}
                  />
                  <h3
                    className={`text-base sm:text-lg font-bold leading-snug transition-colors ${
                      isActive ? 'text-gray-900' : 'text-gray-500'
                    }`}
                  >
                    {t(`features.selling.${tab}.title`)}
                  </h3>
                  <p
                    className={`mt-2 text-sm leading-relaxed transition-colors ${
                      isActive ? 'text-gray-600' : 'text-gray-400'
                    }`}
                  >
                    {t(`features.selling.${tab}.desc`)}
                  </p>
                </button>
              );
            })}
          </div>
        </Reveal>
      </div>
    </section>
  );
}

function FeatureBlock({
  id,
  titleKey,
  subtitleKey,
  placeholderKey,
  points,
  tone = 'muted',
}: {
  id: string;
  titleKey: string;
  subtitleKey: string;
  placeholderKey: string;
  points: { titleKey: string; descKey: string }[];
  tone?: 'muted' | 'white';
}) {
  const t = useTranslations('landing');

  return (
    <section id={id} className={`py-16 sm:py-20 ${tone === 'muted' ? 'bg-[#f7f9fc]' : 'bg-white'}`}>
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <Reveal className="mb-10 max-w-3xl">
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-gray-900">
            {t(titleKey)}
          </h2>
          <p className="mt-3 text-base sm:text-lg text-gray-600 leading-relaxed">{t(subtitleKey)}</p>
        </Reveal>

        <Reveal>
          <div
            className={`rounded-2xl border border-gray-200 p-3 sm:p-4 mb-10 ${
              tone === 'muted' ? 'bg-white' : 'bg-[#f7f9fc]'
            }`}
          >
            <ImagePlaceholder
              label={t(placeholderKey)}
              className={`min-h-[240px] sm:min-h-[360px] w-full ${tone === 'muted' ? 'bg-[#f7f9fc]' : 'bg-white'}`}
            />
          </div>
        </Reveal>

        <Reveal>
          <div className="grid md:grid-cols-3 gap-6 md:gap-8">
            {points.map((point) => (
              <div key={point.titleKey}>
                <h3 className="text-base sm:text-lg font-bold text-gray-900 leading-snug">
                  {t(point.titleKey)}
                </h3>
                <p className="mt-2 text-sm text-gray-600 leading-relaxed">{t(point.descKey)}</p>
              </div>
            ))}
          </div>
        </Reveal>
      </div>
    </section>
  );
}

function SplitFeatureSection({
  id,
  titleKey,
  subtitleKey,
  placeholderKey,
  points,
  mediaPosition,
  tone = 'white',
}: {
  id: string;
  titleKey: string;
  subtitleKey: string;
  placeholderKey: string;
  points: { titleKey: string; descKey: string }[];
  mediaPosition: 'left' | 'right';
  tone?: 'muted' | 'white';
}) {
  const t = useTranslations('landing');
  const [activeIndex, setActiveIndex] = useState(0);

  const media = (
    <div
      className={`rounded-2xl border border-gray-200 p-3 sm:p-4 ${
        tone === 'muted' ? 'bg-white' : 'bg-[#f7f9fc]'
      }`}
    >
      <ImagePlaceholder
        label={t(placeholderKey)}
        className={`min-h-[280px] sm:min-h-[360px] w-full ${tone === 'muted' ? 'bg-[#f7f9fc]' : 'bg-white'}`}
      />
    </div>
  );

  const description = (
    <div>
      {points.map((point, index) => {
        const isActive = activeIndex === index;
        return (
          <button
            key={point.titleKey}
            type="button"
            onClick={() => setActiveIndex(index)}
            className={`w-full text-left py-5 border-b border-gray-200 last:border-b-0 transition-colors ${
              index === 0 ? 'pt-0' : ''
            }`}
          >
            <h3
              className={`text-lg font-bold leading-snug transition-colors ${
                isActive ? 'text-gray-900' : 'text-gray-400'
              }`}
            >
              {t(point.titleKey)}
            </h3>
            <p
              className={`mt-2 text-sm leading-relaxed transition-colors ${
                isActive ? 'text-gray-600' : 'text-gray-400'
              }`}
            >
              {t(point.descKey)}
            </p>
          </button>
        );
      })}
    </div>
  );

  return (
    <section id={id} className={`py-16 sm:py-20 ${tone === 'muted' ? 'bg-[#f7f9fc]' : 'bg-white'}`}>
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <Reveal className="mb-10 max-w-3xl">
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-gray-900">
            {t(titleKey)}
          </h2>
          <p className="mt-3 text-base sm:text-lg text-gray-600 leading-relaxed">{t(subtitleKey)}</p>
        </Reveal>

        <Reveal>
          <div className="grid lg:grid-cols-2 gap-10 lg:gap-14 items-center">
            {mediaPosition === 'left' ? (
              <>
                {media}
                {description}
              </>
            ) : (
              <>
                {description}
                {media}
              </>
            )}
          </div>
        </Reveal>
      </div>
    </section>
  );
}

export default function LandingPage() {
  const router = useRouter();
  const t = useTranslations('landing');

  usePerformanceTracking();

  useEffect(() => {
    measurePerformance();
    const cleanup = trackScrollDepth();
    lazyLoadSection('features', () => undefined);
    lazyLoadSection('socialproof', () => undefined);
    return cleanup;
  }, []);

  const handleRegisterClick = () => {
    trackConversion('cta_click', 'register_button');
    router.push('/register');
  };

  const handleLearnMoreClick = () => {
    trackConversion('cta_click', 'explore_marketplace_button');
    document.getElementById('features')?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <ErrorBoundary>
      <div className="min-h-screen bg-white text-gray-900">
        <section
          id="home"
          className="relative overflow-hidden pb-16 pt-24 sm:pt-28 sm:pb-20 bg-gradient-to-b from-white via-[#f8fbff] to-[#eef4fd]"
        >
          <AuthDecorativeBackground variant="light" />

          <div className="relative z-10 mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 text-center">
            <HeroStagger delayMs={40}>
              <h1 className="text-4xl sm:text-5xl lg:text-[3.25rem] font-bold tracking-tight text-gray-900 leading-[1.12]">
                {t('hero.titleBefore')}
                <span className="text-[#0a61d7]">{t('hero.titleAccent')}</span>
              </h1>
            </HeroStagger>

            <HeroStagger delayMs={160}>
              <p className="mx-auto mt-5 max-w-2xl text-base sm:text-lg text-gray-600 leading-relaxed">
                {t('hero.subtitle')}
              </p>
            </HeroStagger>

            <HeroStagger delayMs={280}>
              <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
                <button
                  type="button"
                  onClick={handleRegisterClick}
                  className="w-full sm:w-auto bg-[#0a61d7] text-white px-7 py-3 rounded-xl text-sm font-semibold hover:bg-[#084ba6] transition-colors"
                  aria-label={t('hero.cta')}
                >
                  {t('hero.cta')}
                </button>
                <button
                  type="button"
                  onClick={handleLearnMoreClick}
                  className="w-full sm:w-auto border border-gray-300 bg-white/80 text-gray-800 px-7 py-3 rounded-xl text-sm font-semibold hover:border-gray-400 hover:bg-white transition-colors"
                  aria-label={t('hero.learnmore')}
                >
                  {t('hero.learnmore')}
                </button>
              </div>
            </HeroStagger>
          </div>

          <HeroStagger delayMs={420} className="relative z-10 mx-auto mt-12 sm:mt-14 max-w-6xl px-4 sm:px-6 lg:px-8">
            <div className="rounded-2xl border border-white/80 bg-white/90 p-2 sm:p-3 shadow-[0_12px_40px_-12px_rgba(10,97,215,0.18)] backdrop-blur-sm">
              <ImagePlaceholder
                label={t('hero.productPlaceholder')}
                className="min-h-[220px] sm:min-h-[360px] lg:min-h-[420px] w-full rounded-xl"
              />
            </div>
          </HeroStagger>
        </section>

        <section id="socialproof" className="py-14 sm:py-16 border-t border-gray-100">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
            <Reveal>
              <p className="text-center text-sm font-medium text-gray-500 mb-8">{t('trust.title')}</p>
            </Reveal>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4">
              {[1, 2, 3, 4, 5, 6].map((n) => (
                <Reveal key={n} delayMs={n * 40}>
                  <div className="h-14 rounded-xl border border-dashed border-gray-200 bg-gray-50 flex items-center justify-center">
                    <span className="text-xs text-gray-400">{t('trust.logoPlaceholder')}</span>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        <section className="py-16 sm:py-20 bg-white border-t border-b border-gray-200">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
            <Reveal className="max-w-3xl">
              <h2 className="text-3xl sm:text-4xl lg:text-[2.75rem] font-bold tracking-tight text-gray-900 leading-tight">
                {t('platformMessage.title')}
              </h2>
              <p className="mt-5 text-base sm:text-lg text-gray-600 leading-relaxed max-w-2xl">
                {t('platformMessage.subtitle')}
              </p>
            </Reveal>
          </div>
        </section>

        <SellingSection />

        <SplitFeatureSection
          id="analytics"
          titleKey="features.analytics.title"
          subtitleKey="features.analytics.subtitle"
          placeholderKey="features.analytics.placeholder"
          mediaPosition="left"
          tone="muted"
          points={[
            { titleKey: 'features.analytics.financial.title', descKey: 'features.analytics.financial.desc' },
            { titleKey: 'features.analytics.sales.title', descKey: 'features.analytics.sales.desc' },
            {
              titleKey: 'features.analytics.operational.title',
              descKey: 'features.analytics.operational.desc',
            },
          ]}
        />

        <FeatureBlock
          id="marketing"
          titleKey="features.marketing.title"
          subtitleKey="features.marketing.subtitle"
          placeholderKey="features.marketing.placeholder"
          tone="white"
          points={[
            { titleKey: 'features.marketing.1.title', descKey: 'features.marketing.1.desc' },
            { titleKey: 'features.marketing.2.title', descKey: 'features.marketing.2.desc' },
            { titleKey: 'features.marketing.3.title', descKey: 'features.marketing.3.desc' },
          ]}
        />

        <SplitFeatureSection
          id="logistics"
          titleKey="features.logistics.title"
          subtitleKey="features.logistics.subtitle"
          placeholderKey="features.logistics.placeholder"
          mediaPosition="right"
          tone="muted"
          points={[
            { titleKey: 'features.logistics.1.title', descKey: 'features.logistics.1.desc' },
            { titleKey: 'features.logistics.2.title', descKey: 'features.logistics.2.desc' },
            { titleKey: 'features.logistics.3.title', descKey: 'features.logistics.3.desc' },
          ]}
        />

        <section id="how-it-works" className="py-16 sm:py-20 bg-white">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
            <Reveal className="text-center mb-12 max-w-2xl mx-auto">
              <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-gray-900">
                {t('howitworks.title')}
              </h2>
              <p className="mt-3 text-base sm:text-lg text-gray-600">{t('howitworks.subtitle')}</p>
            </Reveal>

            <div className="grid md:grid-cols-3 gap-8 md:gap-10">
              {[1, 2, 3].map((i) => (
                <Reveal key={i} delayMs={i * 80}>
                  <div className="border-t border-gray-200 pt-6">
                    <p className="text-xs font-semibold tracking-widest text-[#0a61d7] mb-3">
                      {String(i).padStart(2, '0')}
                    </p>
                    <h3 className="text-lg font-bold text-gray-900 mb-2">
                      {t(`howitworks.${i}.title`)}
                    </h3>
                    <p className="text-sm text-gray-600 leading-relaxed">{t(`howitworks.${i}.desc`)}</p>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        <section className="py-16 sm:py-20 bg-[#f7f9fc]">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
            <Reveal className="text-center mb-12">
              <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-gray-900">
                {t('testimonials.title')}
              </h2>
            </Reveal>
            <div className="grid md:grid-cols-2 gap-6">
              {[1, 2].map((i) => (
                <Reveal key={i} delayMs={i * 90}>
                  <blockquote className="rounded-2xl border border-gray-200 bg-white p-7 sm:p-8">
                    <p className="text-gray-700 leading-relaxed text-[15px]">“{t(`testimonials.${i}.text`)}”</p>
                    <footer className="mt-6">
                      <p className="text-sm font-semibold text-gray-900">{t(`testimonials.${i}.name`)}</p>
                      <p className="text-sm text-gray-500">{t(`testimonials.${i}.role`)}</p>
                    </footer>
                  </blockquote>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        <section className="py-16 sm:py-20 bg-gradient-to-b from-[#0a61d7] to-[#084ba6]">
          <Reveal className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 text-center">
            <h2 className="text-3xl sm:text-4xl font-bold text-white tracking-tight">
              {t('finalcta.title')}
            </h2>
            <p className="mt-4 text-base sm:text-lg text-blue-100 leading-relaxed">{t('finalcta.subtitle')}</p>
            <button
              type="button"
              onClick={handleRegisterClick}
              className="mt-8 bg-white text-[#0a61d7] px-8 py-3.5 rounded-xl text-sm font-semibold hover:bg-blue-50 transition-colors"
              aria-label={t('finalcta.cta')}
            >
              {t('finalcta.cta')}
            </button>
          </Reveal>
        </section>
      </div>
    </ErrorBoundary>
  );
}
