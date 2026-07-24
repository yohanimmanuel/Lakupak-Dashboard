'use client';

import React, { useEffect, useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { measurePerformance, trackScrollDepth, lazyLoadSection } from '@/utils/performance';
import { AuthDecorativeBackground } from '@/components/auth/AuthDecorativeBackground';
import { FeatureMediaFrame } from './FeatureMediaFrame';
import { Reveal } from './Reveal';

type SellingTab = 'clients' | 'products' | 'orders';
type AutomationsTab = 'workflows' | 'triggers' | 'control';

const SELLING_TABS: SellingTab[] = ['clients', 'products', 'orders'];
const AUTOMATIONS_TABS: AutomationsTab[] = ['workflows', 'triggers', 'control'];

const AUTOMATIONS_MEDIA: Partial<
  Record<AutomationsTab, { src: string; width: number; height: number }>
> = {
  workflows: { src: '/Dashboardautomations.png', width: 1552, height: 650 },
};

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

type SellingMediaLayer = {
  src: string;
  width: number;
  height: number;
  className?: string;
};

function SellingDiagonalStack({
  alt,
  back,
  front,
  orientation = 'tl-br',
}: {
  alt: string;
  back: SellingMediaLayer;
  front: SellingMediaLayer;
  /** tl-br: back top-left → front bottom-right; tr-bl: mirrored */
  orientation?: 'tl-br' | 'tr-bl';
}) {
  const mirrored = orientation === 'tr-bl';

  return (
    <div className="relative mx-auto h-full w-full max-w-4xl">
      <div
        className={`absolute z-0 w-[68%] sm:w-[64%] animate-fade-in motion-reduce:animate-none ${
          mirrored ? 'right-[2%] top-[8%]' : 'left-[2%] top-[8%]'
        }`}
        style={{ animationDuration: '0.45s' }}
      >
        <div
          className={`rounded-xl border border-gray-200/90 bg-white p-1 overflow-hidden shadow-[0_16px_40px_-16px_rgba(15,23,42,0.32)] ${
            mirrored ? 'rotate-[5deg]' : '-rotate-[5deg]'
          }`}
        >
          <Image
            src={back.src}
            alt=""
            width={back.width}
            height={back.height}
            quality={85}
            className="w-full h-auto block rounded-lg"
            sizes="(min-width: 1024px) 640px, 70vw"
          />
        </div>
      </div>
      <div
        className={`absolute z-10 w-[72%] sm:w-[68%] animate-fade-in-up motion-reduce:animate-none ${
          mirrored ? 'left-[2%] bottom-[6%]' : 'right-[2%] bottom-[6%]'
        }`}
        style={{ animationDuration: '0.55s', animationDelay: '0.12s', opacity: 0 }}
      >
        <div
          className={`rounded-xl border border-gray-200/90 bg-white p-1 overflow-hidden shadow-[0_20px_48px_-14px_rgba(10,97,215,0.35)] ${
            mirrored ? '-rotate-[3deg]' : 'rotate-[3deg]'
          }`}
        >
          <Image
            src={front.src}
            alt={alt}
            width={front.width}
            height={front.height}
            quality={90}
            className="w-full h-auto block rounded-lg"
            sizes="(min-width: 1024px) 700px, 75vw"
          />
        </div>
      </div>
    </div>
  );
}

/** Product on top, two offers below with dotted connectors. */
function ProductsOffersFlow({ alt }: { alt: string }) {
  return (
    <div className="relative mx-auto flex h-full w-full max-w-3xl items-center px-3 sm:px-6">
      <div className="flex w-full flex-col items-center">
        {/* Product — top center */}
        <div
          className="relative z-10 w-[52%] sm:w-[42%] rounded-xl border border-gray-200/90 bg-white p-1 shadow-[0_16px_40px_-16px_rgba(15,23,42,0.28)] overflow-hidden animate-scale-in motion-reduce:animate-none"
          style={{ animationDuration: '0.5s' }}
        >
          <Image
            src="/Dashboardproducts3.png"
            alt={alt}
            width={735}
            height={602}
            quality={90}
            className="w-full h-auto block rounded-lg"
            sizes="(min-width: 1024px) 380px, 50vw"
          />
        </div>

        {/* Dotted Y-connectors */}
        <div
          className="relative z-0 h-9 w-full sm:h-11 animate-fade-in motion-reduce:animate-none"
          style={{ animationDuration: '0.4s', animationDelay: '0.15s', opacity: 0 }}
          aria-hidden
        >
          <svg
            className="absolute inset-0 h-full w-full"
            viewBox="0 0 400 56"
            preserveAspectRatio="none"
          >
            <path
              d="M200 0 V18 C200 18 100 28 100 56"
              fill="none"
              stroke="#94a3b8"
              strokeWidth="3"
              strokeDasharray="0 8"
              strokeLinecap="round"
            />
            <path
              d="M200 0 V18 C200 18 300 28 300 56"
              fill="none"
              stroke="#94a3b8"
              strokeWidth="3"
              strokeDasharray="0 8"
              strokeLinecap="round"
            />
          </svg>
        </div>

        {/* Offers — left & right with center gap */}
        <div className="relative z-10 mx-auto grid w-[82%] sm:w-[72%] grid-cols-2 gap-6 sm:gap-12 lg:gap-16">
          <div
            className="rounded-xl border border-gray-200/90 bg-white p-1 shadow-[0_14px_36px_-16px_rgba(10,97,215,0.28)] overflow-hidden animate-fade-in-left motion-reduce:animate-none"
            style={{ animationDuration: '0.5s', animationDelay: '0.22s', opacity: 0 }}
          >
            <Image
              src="/Dashboardoffers.png"
              alt=""
              width={487}
              height={303}
              quality={90}
              className="w-full h-auto block rounded-lg"
              sizes="(min-width: 1024px) 280px, 34vw"
            />
          </div>
          <div
            className="rounded-xl border border-gray-200/90 bg-white p-1 shadow-[0_14px_36px_-16px_rgba(10,97,215,0.28)] overflow-hidden animate-fade-in-right motion-reduce:animate-none"
            style={{ animationDuration: '0.5s', animationDelay: '0.28s', opacity: 0 }}
          >
            <Image
              src="/Dashboardoffers1.png"
              alt=""
              width={486}
              height={305}
              quality={90}
              className="w-full h-auto block rounded-lg"
              sizes="(min-width: 1024px) 280px, 34vw"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

const SELLING_MEDIA: Partial<
  Record<
    SellingTab,
    {
      back: SellingMediaLayer;
      front: SellingMediaLayer;
    }
  >
> = {
  clients: {
    back: { src: '/Dashboardclientbuyer1.png', width: 1488, height: 692 },
    front: { src: '/Dashboardclientbuyer.png', width: 1530, height: 642 },
  },
  orders: {
    back: { src: '/Dashboardorders1.png', width: 1490, height: 792 },
    front: { src: '/Dashboardorders2.png', width: 1530, height: 660 },
  },
};

function SellingSection() {
  const t = useTranslations('landing');
  const [active, setActive] = useState<SellingTab>('clients');
  const media = SELLING_MEDIA[active];
  /** Fixed stage size so tab switches don’t jump the background. */
  const sellingStageClass = 'h-[500px] sm:h-[600px]';

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
          <FeatureMediaFrame
            className="mb-10"
            framed={false}
            minHeightClass={sellingStageClass}
          >
            {active === 'products' ? (
              <ProductsOffersFlow
                key={active}
                alt={t('features.selling.products.title')}
              />
            ) : media ? (
              <SellingDiagonalStack
                key={active}
                alt={t(`features.selling.${active}.title`)}
                back={media.back}
                front={media.front}
                orientation={active === 'orders' ? 'tr-bl' : 'tl-br'}
              />
            ) : (
              <ImagePlaceholder
                key={active}
                label={t(`features.selling.placeholders.${active}`)}
                className="min-h-[220px] sm:min-h-[320px] w-full border-0 bg-white/80 rounded-xl animate-fade-in motion-reduce:animate-none"
              />
            )}
          </FeatureMediaFrame>
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

function AutomationsSection() {
  const t = useTranslations('landing');
  const [active, setActive] = useState<AutomationsTab>('workflows');
  const media = AUTOMATIONS_MEDIA[active];
  const automationsStageClass = 'h-[500px] sm:h-[600px]';

  return (
    <section id="automations" className="py-16 sm:py-20 bg-white">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <Reveal className="mb-10 max-w-3xl">
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-gray-900">
            {t('features.automations.title')}
          </h2>
          <p className="mt-3 text-base sm:text-lg text-gray-600 leading-relaxed">
            {t('features.automations.subtitle')}
          </p>
        </Reveal>

        <Reveal>
          <FeatureMediaFrame
            className="mb-10"
            framed={false}
            minHeightClass={automationsStageClass}
          >
            {media ? (
              <div
                key={active}
                className="flex h-full w-full items-center justify-center animate-fade-in motion-reduce:animate-none"
                style={{ animationDuration: '0.45s' }}
              >
                <div className="w-full overflow-hidden rounded-xl border border-gray-200/90 bg-white shadow-[0_14px_36px_-16px_rgba(15,23,42,0.28)]">
                  <Image
                    src={media.src}
                    alt={t(`features.automations.${active}.title`)}
                    width={media.width}
                    height={media.height}
                    quality={90}
                    className="w-full h-auto block"
                    sizes="(min-width: 1024px) 1024px, 100vw"
                  />
                </div>
              </div>
            ) : (
              <ImagePlaceholder
                key={active}
                label={t(`features.automations.placeholders.${active}`)}
                className="min-h-[220px] sm:min-h-[320px] w-full border-0 bg-white/80 rounded-xl animate-fade-in motion-reduce:animate-none"
              />
            )}
          </FeatureMediaFrame>
        </Reveal>

        <Reveal>
          <div className="grid md:grid-cols-3 gap-6 md:gap-8">
            {AUTOMATIONS_TABS.map((tab) => {
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
                    {t(`features.automations.${tab}.title`)}
                  </h3>
                  <p
                    className={`mt-2 text-sm leading-relaxed transition-colors ${
                      isActive ? 'text-gray-600' : 'text-gray-400'
                    }`}
                  >
                    {t(`features.automations.${tab}.desc`)}
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
  media,
}: {
  id: string;
  titleKey: string;
  subtitleKey: string;
  placeholderKey: string;
  points: { titleKey: string; descKey: string }[];
  tone?: 'muted' | 'white';
  media?: React.ReactNode;
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
          <FeatureMediaFrame className="mb-10" framed={!media} minHeightClass="min-h-[280px] sm:min-h-[400px]">
            {media ?? (
              <ImagePlaceholder
                label={t(placeholderKey)}
                className="min-h-[220px] sm:min-h-[320px] w-full border-0 bg-white rounded-none"
              />
            )}
          </FeatureMediaFrame>
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

/** Two marketing screenshots side by side with a circle-dotted connector. */
function MarketingSideBySide({ alt }: { alt: string }) {
  return (
    <div className="relative mx-auto flex h-full w-full max-w-5xl items-center px-2 py-4 sm:px-4 sm:py-6">
      <div className="relative flex w-full items-center gap-2 sm:gap-3">
        <div className="relative z-10 w-[56%] sm:w-[58%] rounded-xl border border-gray-200/90 bg-white p-1 shadow-[0_14px_36px_-16px_rgba(15,23,42,0.28)] overflow-hidden">
          <Image
            src="/Dashboardmarketing3.png"
            alt={alt}
            width={1477}
            height={780}
            quality={90}
            className="w-full h-auto block rounded-lg"
            sizes="(min-width: 1024px) 520px, 55vw"
          />
        </div>

        <div className="relative z-0 h-8 w-[6%] min-w-[24px] sm:h-10 sm:w-[8%]" aria-hidden>
          <svg
            className="absolute inset-0 h-full w-full"
            viewBox="0 0 80 40"
            preserveAspectRatio="none"
          >
            <path
              d="M0 20 H80"
              fill="none"
              stroke="#94a3b8"
              strokeWidth="3"
              strokeDasharray="0 8"
              strokeLinecap="round"
            />
          </svg>
        </div>

        <div className="relative z-10 w-[36%] sm:w-[32%] rounded-xl border border-gray-200/90 bg-white p-1 shadow-[0_14px_36px_-16px_rgba(10,97,215,0.28)] overflow-hidden">
          <Image
            src="/Dashboardmarketingeng.png"
            alt=""
            width={665}
            height={571}
            quality={90}
            className="w-full h-auto block rounded-lg"
            sizes="(min-width: 1024px) 300px, 32vw"
          />
        </div>
      </div>
    </div>
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
  mediaStageClass = 'h-[420px] sm:h-[500px]',
}: {
  id: string;
  titleKey: string;
  subtitleKey: string;
  placeholderKey: string;
  points: {
    titleKey: string;
    descKey: string;
    image?: {
      src: string;
      width: number;
      height: number;
      /** phone = tall mobile shot; fill = use full media width */
      fit?: 'phone' | 'fill';
      /** Extra sizing classes for the image wrapper (e.g. smaller width). */
      className?: string;
    };
    /** Two images side by side with a circle-dotted connector between them. */
    images?: [{ src: string; width: number; height: number }, { src: string; width: number; height: number }];
  }[];
  mediaPosition: 'left' | 'right';
  tone?: 'muted' | 'white';
  /** Fixed stage height so tab switches don’t jump (same idea as selling section). */
  mediaStageClass?: string;
}) {
  const t = useTranslations('landing');
  const [activeIndex, setActiveIndex] = useState(0);
  const activePoint = points[activeIndex] ?? points[0];
  const activeImage = activePoint?.image;
  const activePair = activePoint?.images;
  const mediaKey = activePair
    ? `${activePair[0].src}-${activePair[1].src}`
    : activeImage?.src ?? 'placeholder';
  const isPhone =
    activeImage?.fit === 'phone' ||
    (!activeImage?.fit && activeImage != null && activeImage.height / activeImage.width > 1.4);

  const media = (
    <FeatureMediaFrame framed={false} minHeightClass={mediaStageClass}>
      {activePair ? (
        <div
          key={mediaKey}
          className="flex h-full w-full items-center justify-center gap-2 px-2 py-3 sm:gap-3 sm:px-3 animate-fade-in motion-reduce:animate-none"
          style={{ animationDuration: '0.45s' }}
        >
          <div className="w-[42%] max-w-[170px] sm:max-w-[200px] rounded-xl border border-gray-200/90 bg-white p-0.5 shadow-[0_14px_36px_-16px_rgba(15,23,42,0.28)] overflow-hidden">
            <Image
              src={activePair[0].src}
              alt={t(activePoint.titleKey)}
              width={activePair[0].width}
              height={activePair[0].height}
              quality={90}
              className="w-full h-auto block rounded-lg"
              sizes="200px"
            />
          </div>
          <div className="h-8 w-8 shrink-0 sm:h-10 sm:w-12" aria-hidden>
            <svg className="h-full w-full" viewBox="0 0 80 40" preserveAspectRatio="none">
              <path
                d="M0 20 H80"
                fill="none"
                stroke="#94a3b8"
                strokeWidth="3"
                strokeDasharray="0 8"
                strokeLinecap="round"
              />
            </svg>
          </div>
          <div className="w-[42%] max-w-[170px] sm:max-w-[200px] rounded-xl border border-gray-200/90 bg-white p-0.5 shadow-[0_14px_36px_-16px_rgba(10,97,215,0.28)] overflow-hidden">
            <Image
              src={activePair[1].src}
              alt=""
              width={activePair[1].width}
              height={activePair[1].height}
              quality={90}
              className="w-full h-auto block rounded-lg"
              sizes="200px"
            />
          </div>
        </div>
      ) : activeImage ? (
        <div
          key={mediaKey}
          className="flex h-full w-full items-center justify-center animate-fade-in motion-reduce:animate-none"
          style={{ animationDuration: '0.45s' }}
        >
          <div
            className={
              isPhone
                ? `max-h-full w-auto rounded-2xl border border-gray-200/90 bg-white p-0.5 shadow-[0_14px_36px_-16px_rgba(15,23,42,0.28)] overflow-hidden ${activeImage.className ?? ''}`
                : `overflow-hidden rounded-xl border border-gray-200/90 bg-white shadow-[0_14px_36px_-16px_rgba(15,23,42,0.28)] ${
                    activeImage.className ?? 'w-full'
                  }`
            }
          >
            <Image
              src={activeImage.src}
              alt={t(activePoint.titleKey)}
              width={activeImage.width}
              height={activeImage.height}
              quality={90}
              className={
                isPhone
                  ? 'max-h-[360px] sm:max-h-[440px] w-auto h-auto object-contain block rounded-xl'
                  : 'w-full h-auto block'
              }
              sizes="(min-width: 1024px) 560px, 100vw"
            />
          </div>
        </div>
      ) : (
        <ImagePlaceholder
          label={t(placeholderKey)}
          className="min-h-[240px] sm:min-h-[300px] w-full border-0 bg-white rounded-none"
        />
      )}
    </FeatureMediaFrame>
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

          <HeroStagger delayMs={420} className="relative z-10 mx-auto mt-12 sm:mt-16 max-w-6xl px-4 sm:px-6 lg:px-8">
            <div className="relative pt-6 sm:pt-8">
              {/* Back layer — top edge only */}
              <div
                aria-hidden
                className="pointer-events-none absolute left-[6%] right-[6%] top-0 z-0 h-10 sm:h-12 overflow-hidden rounded-t-2xl border border-gray-200/80 bg-white shadow-[0_8px_24px_-12px_rgba(15,23,42,0.2)]"
              >
                <Image
                  src="/Dashboardhomeeng.png"
                  alt=""
                  width={1845}
                  height={877}
                  quality={60}
                  className="w-full h-auto block opacity-50"
                  sizes="(min-width: 1024px) 1000px, 90vw"
                />
              </div>

              {/* Middle layer — top edge only */}
              <div
                aria-hidden
                className="pointer-events-none absolute left-[3%] right-[3%] top-3 sm:top-3.5 z-[1] h-10 sm:h-12 overflow-hidden rounded-t-2xl border border-gray-200/90 bg-white shadow-[0_10px_28px_-12px_rgba(15,23,42,0.22)]"
              >
                <Image
                  src="/Dashboardhomeeng.png"
                  alt=""
                  width={1845}
                  height={877}
                  quality={65}
                  className="w-full h-auto block opacity-70"
                  sizes="(min-width: 1024px) 1080px, 95vw"
                />
            </div>

              {/* Front layer */}
              <div className="relative z-[2] rounded-2xl border border-gray-200/90 bg-white p-1.5 sm:p-2 shadow-[0_18px_50px_-14px_rgba(10,97,215,0.3)] overflow-hidden">
                <Image
                  src="/Dashboardhomeeng.png"
                  alt={t('hero.productPlaceholder')}
                  width={1845}
                  height={877}
                  priority
                  quality={90}
                  className="w-full h-auto rounded-xl block"
                  sizes="(min-width: 1024px) 1152px, 100vw"
                />
              </div>
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
            {
              titleKey: 'features.analytics.financial.title',
              descKey: 'features.analytics.financial.desc',
              image: { src: '/Dashboardanalyticsfin.png', width: 952, height: 513 },
            },
            {
              titleKey: 'features.analytics.sales.title',
              descKey: 'features.analytics.sales.desc',
              image: { src: '/Dashboardanalyticscus.png', width: 887, height: 581 },
            },
            {
              titleKey: 'features.analytics.operational.title',
              descKey: 'features.analytics.operational.desc',
              image: { src: '/Dashboardanalyticsops.png', width: 835, height: 477 },
            },
          ]}
        />

        <FeatureBlock
          id="marketing"
          titleKey="features.marketing.title"
          subtitleKey="features.marketing.subtitle"
          placeholderKey="features.marketing.placeholder"
          tone="white"
          media={<MarketingSideBySide alt={t('features.marketing.title')} />}
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
            {
              titleKey: 'features.logistics.1.title',
              descKey: 'features.logistics.1.desc',
              image: {
                src: '/Drivermobile1.jpeg',
                width: 1000,
                height: 2048,
                fit: 'phone',
              },
            },
            {
              titleKey: 'features.logistics.2.title',
              descKey: 'features.logistics.2.desc',
              image: {
                src: '/Dashboardlogs.png',
                width: 751,
                height: 790,
                fit: 'fill',
                className: 'w-[72%] sm:w-[68%]',
              },
            },
            {
              titleKey: 'features.logistics.3.title',
              descKey: 'features.logistics.3.desc',
              images: [
                { src: '/Drivermobile.jpeg', width: 1006, height: 2048 },
                { src: '/Drivermobile2.jpeg', width: 1000, height: 2048 },
              ],
            },
          ]}
        />

        <AutomationsSection />

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
