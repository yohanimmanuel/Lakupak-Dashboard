'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { AuthDecorativeBackground } from '@/components/auth/AuthDecorativeBackground';
import { FeatureMediaFrame } from '../FeatureMediaFrame';
import { Reveal } from '../Reveal';
import type { FeatureModuleSlug } from './modules';
import { FEATURE_MODULES, featurePath, getFeatureModule } from './modules';

type PointMedia = { src: string; width: number; height: number; label?: string };
type PointMediaConfig =
  | { type: 'single'; image: PointMedia; placement?: 'corner' | 'center' }
  | {
      type: 'diagonal';
      back: PointMedia;
      front: PointMedia;
      orientation?: 'tl-br' | 'tr-bl';
      /** Smaller stack so taller screenshots stay inside the stage. */
      scale?: 'xs' | 'sm' | 'md';
      /** Which layer paints on top. Positions stay the same. */
      overlap?: 'front' | 'back';
      /** Overrides the front layer width from scale. */
      frontWidthClass?: string;
    }
  | {
      type: 'straight';
      back: PointMedia;
      front: PointMedia;
      /** Width classes for each layer (back sits behind, front on top). */
      backWidthClass?: string;
      frontWidthClass?: string;
      /** side = login-style left+bottom-right; iconRight = main image with icon overlapping the right edge; row = flat side-by-side. */
      layout?: 'side' | 'iconRight' | 'row';
    }
  | {
      type: 'carousel';
      images: PointMedia[];
      /** Auto-advance interval in ms. */
      intervalMs?: number;
      /** Larger lapse frames for wide dashboard screenshots. */
      size?: 'md' | 'lg';
    }
  | { type: 'placeholder' };

/** Real screenshots for specific detail steps; the rest fall back to placeholders. */
const POINT_MEDIA: Partial<Record<FeatureModuleSlug, Record<number, PointMediaConfig>>> = {
  clients: {
    1: { type: 'placeholder' },
    2: {
      type: 'single',
      placement: 'corner',
      image: { src: '/Dashboardclientbuyer2.png', width: 740, height: 345 },
    },
    3: {
      type: 'diagonal',
      back: { src: '/Dashboardclientbuyer3.png', width: 488, height: 295 },
      front: { src: '/Dashboardclientbuyer4.png', width: 736, height: 287 },
      orientation: 'tr-bl',
    },
    4: {
      type: 'single',
      placement: 'center',
      image: { src: '/Dashboardclientbuyer9.png', width: 1517, height: 362 },
    },
    5: {
      type: 'single',
      placement: 'center',
      image: { src: '/Dashboardclientbuyer7.png', width: 1488, height: 378 },
    },
    6: {
      type: 'single',
      placement: 'center',
      image: { src: '/Dashboardclientbuyer8.png', width: 1488, height: 761 },
    },
  },
  products: {
    1: { type: 'placeholder' },
    2: {
      type: 'single',
      placement: 'center',
      image: { src: '/Dashboardproducts7.png', width: 1477, height: 721 },
    },
    3: {
      type: 'single',
      placement: 'center',
      image: { src: '/Dashboardproducts8.png', width: 1080, height: 924 },
    },
    4: {
      type: 'single',
      placement: 'center',
      image: { src: '/Dashboardproducts3.png', width: 735, height: 602 },
    },
    5: { type: 'placeholder' },
  },
  orders: {
    1: {
      type: 'carousel',
      intervalMs: 3500,
      images: [
        { src: '/Dashboardorders8.png', width: 902, height: 637, label: 'Create order' },
        { src: '/Dashboardorders9.png', width: 1533, height: 750, label: 'Order history' },
      ],
    },
    2: {
      type: 'single',
      placement: 'center',
      image: { src: '/Dashboardorders3.png', width: 1505, height: 675 },
    },
    3: {
      type: 'single',
      placement: 'center',
      image: { src: '/Dashboardorders4.png', width: 947, height: 762 },
    },
  },
  offers: {
    1: {
      type: 'single',
      placement: 'center',
      image: { src: '/Dashboardoffers5.png', width: 1530, height: 602 },
    },
    2: {
      type: 'single',
      placement: 'center',
      image: { src: '/Dashboardoffers2.png', width: 737, height: 781 },
    },
    3: {
      type: 'straight',
      back: { src: '/Dashboardproducts.png', width: 362, height: 577 },
      front: { src: '/Dashboardoffers.png', width: 648, height: 307 },
      backWidthClass: 'w-[52%] sm:w-[48%]',
      frontWidthClass: 'w-[72%] sm:w-[68%]',
    },
    4: {
      type: 'single',
      placement: 'center',
      image: { src: '/Dashboardproducts11.png', width: 1236, height: 792 },
    },
    5: {
      type: 'single',
      placement: 'center',
      image: { src: '/Dashboardoffers4.png', width: 1515, height: 521 },
    },
  },
  sales: {
    1: {
      type: 'single',
      placement: 'center',
      image: { src: '/Dashboardsales.png', width: 1538, height: 687 },
    },
    2: {
      type: 'single',
      placement: 'center',
      image: { src: '/Dashboardsales3.png', width: 1511, height: 452 },
    },
    3: {
      type: 'single',
      placement: 'center',
      image: { src: '/Dashboardsales1.png', width: 1533, height: 727 },
    },
  },
  analytics: {
    1: {
      type: 'carousel',
      intervalMs: 3500,
      images: [
        { src: '/Dashboardanalyticsfin.png', width: 952, height: 513, label: 'Financial' },
        { src: '/Dashboardanalyticscus.png', width: 887, height: 581, label: 'Customer' },
        { src: '/Dashboardanalyticsops.png', width: 835, height: 477, label: 'Operational' },
      ],
    },
    2: {
      type: 'single',
      placement: 'center',
      image: { src: '/Dashboardanalytics1.png', width: 1265, height: 577 },
    },
    3: {
      type: 'single',
      placement: 'center',
      image: { src: '/Dashboardanalytics4.png', width: 1513, height: 540 },
    },
    4: {
      type: 'diagonal',
      back: { src: '/Dashboardanalyticseng.png', width: 811, height: 702 },
      front: { src: '/Dashboardanalytics5.png', width: 670, height: 702 },
      orientation: 'tr-bl',
      scale: 'sm',
    },
  },
  marketplace: {
    1: {
      type: 'single',
      placement: 'center',
      image: { src: '/Dashboardmarketplace.png', width: 1512, height: 617 },
    },
    2: {
      type: 'single',
      placement: 'center',
      image: { src: '/Dashboardmarketplace1.png', width: 1112, height: 685 },
    },
    3: {
      type: 'straight',
      back: { src: '/Dashboardmarketplace4.png', width: 906, height: 740 },
      front: { src: '/Dashboardmarketplace3.png', width: 917, height: 388 },
      backWidthClass: 'w-[52%] sm:w-[48%]',
      frontWidthClass: 'w-[72%] sm:w-[68%]',
    },
    4: {
      type: 'single',
      placement: 'center',
      image: { src: '/Dashboardmarketplace2.png', width: 1050, height: 770 },
    },
  },
  automations: {
    1: {
      type: 'single',
      placement: 'center',
      image: { src: '/Dashboardautomations4.png', width: 1558, height: 783 },
    },
    2: {
      type: 'single',
      placement: 'center',
      image: { src: '/Dashboardautomations3.png', width: 1143, height: 632 },
    },
    3: {
      type: 'straight',
      back: { src: '/Dashboardautomations5.png', width: 752, height: 637 },
      front: { src: '/Dashboardautomations6.png', width: 1247, height: 528 },
      backWidthClass: 'w-[52%] sm:w-[48%]',
      frontWidthClass: 'w-[72%] sm:w-[68%]',
    },
    4: {
      type: 'single',
      placement: 'center',
      image: { src: '/Dashboardautomations7.png', width: 1492, height: 371 },
    },
  },
  'laku-ai': {
    1: {
      type: 'single',
      placement: 'center',
      image: { src: '/DashboardAI.png', width: 1451, height: 785 },
    },
    2: {
      type: 'diagonal',
      back: { src: '/DashboardAI2.png', width: 945, height: 2048 },
      front: { src: '/Dashboardsales1.png', width: 1533, height: 727 },
      orientation: 'tr-bl',
      scale: 'sm',
      overlap: 'back',
      frontWidthClass: 'w-[92%] sm:w-[86%]',
    },
    3: {
      type: 'single',
      placement: 'center',
      image: { src: '/Dashboardsales4.png', width: 1551, height: 777 },
    },
    4: {
      type: 'single',
      placement: 'center',
      image: { src: '/Dashboardsales7.png', width: 1535, height: 527 },
    },
    5: {
      type: 'diagonal',
      back: { src: '/Dashboardsales6.png', width: 1000, height: 2048 },
      front: { src: '/Dashboardautomations8.png', width: 1557, height: 783 },
      orientation: 'tr-bl',
      scale: 'sm',
      overlap: 'back',
      frontWidthClass: 'w-[92%] sm:w-[86%]',
    },
  },
};

function PointDiagonalStack({
  back,
  front,
  orientation = 'tl-br',
  scale = 'md',
  overlap = 'front',
  frontWidthClass,
}: {
  back: PointMedia;
  front: PointMedia;
  orientation?: 'tl-br' | 'tr-bl';
  scale?: 'xs' | 'sm' | 'md';
  overlap?: 'front' | 'back';
  frontWidthClass?: string;
}) {
  const mirrored = orientation === 'tr-bl';
  const backOnTop = overlap === 'back';
  const tiny = scale === 'xs';
  const compact = scale === 'sm' || tiny;
  const backWidth = tiny
    ? 'w-[26%] sm:w-[24%]'
    : compact
      ? 'w-[42%] sm:w-[40%]'
      : 'w-[66%] sm:w-[62%]';
  const frontWidth =
    frontWidthClass ??
    (tiny
      ? 'w-[44%] sm:w-[40%]'
      : compact
        ? 'w-[52%] sm:w-[48%]'
        : 'w-[78%] sm:w-[72%]');
  const backPos = mirrored
    ? tiny
      ? 'right-[14%] top-[8%]'
      : compact
        ? 'right-[8%] top-[12%]'
        : 'right-[4%] top-[10%]'
    : tiny
      ? 'left-[14%] top-[8%]'
      : compact
        ? 'left-[8%] top-[12%]'
        : 'left-[4%] top-[10%]';
  const frontPos = frontWidthClass
    ? mirrored
      ? 'left-[2%] bottom-[2%]'
      : 'right-[2%] bottom-[2%]'
    : mirrored
      ? tiny
        ? 'left-[12%] bottom-[8%]'
        : compact
          ? 'left-[10%] bottom-[10%]'
          : 'left-[2%] bottom-[6%]'
      : tiny
        ? 'right-[12%] bottom-[8%]'
        : compact
          ? 'right-[10%] bottom-[10%]'
          : 'right-[2%] bottom-[6%]';

  return (
    <div className="relative mx-auto h-full w-full">
      <div
        className={`absolute ${backOnTop ? 'z-10' : 'z-0'} ${backWidth} animate-fade-in motion-reduce:animate-none ${backPos}`}
        style={{ animationDuration: '0.45s' }}
      >
        <div
          className={`overflow-hidden rounded-xl border border-gray-200/90 bg-white p-1 shadow-[0_16px_40px_-16px_rgba(15,23,42,0.32)] ${
            mirrored ? 'rotate-[5deg]' : '-rotate-[5deg]'
          }`}
        >
          <Image
            src={back.src}
            alt=""
            width={back.width}
            height={back.height}
            quality={90}
            className={`block h-auto w-full rounded-lg ${tiny ? 'max-h-[210px] sm:max-h-[270px] object-contain' : ''}`}
            sizes={
              tiny
                ? '(min-width: 1024px) 140px, 26vw'
                : compact
                  ? '(min-width: 1024px) 220px, 42vw'
                  : '(min-width: 1024px) 360px, 62vw'
            }
          />
        </div>
      </div>
      <div
        className={`absolute ${backOnTop ? 'z-0' : 'z-10'} ${frontWidth} animate-fade-in-up motion-reduce:animate-none ${frontPos}`}
        style={{ animationDuration: '0.55s', animationDelay: '0.12s', opacity: 0 }}
      >
        <div
          className={`overflow-hidden rounded-xl border border-white/90 bg-white p-1.5 shadow-[0_20px_44px_-18px_rgba(10,97,215,0.34)] ${
            mirrored ? '-rotate-[3deg]' : 'rotate-[3deg]'
          }`}
        >
          <Image
            src={front.src}
            alt=""
            width={front.width}
            height={front.height}
            quality={92}
            className="block h-auto w-full rounded-lg"
            sizes={
              frontWidthClass
                ? '(min-width: 1024px) 720px, 86vw'
                : tiny
                  ? '(min-width: 1024px) 240px, 44vw'
                  : compact
                    ? '(min-width: 1024px) 280px, 52vw'
                    : '(min-width: 1024px) 420px, 74vw'
            }
          />
        </div>
      </div>
    </div>
  );
}

function PointStraightStack({
  back,
  front,
  backWidthClass = 'w-[52%] sm:w-[48%]',
  frontWidthClass = 'w-[72%] sm:w-[68%]',
  layout = 'side',
}: {
  back: PointMedia;
  front: PointMedia;
  backWidthClass?: string;
  frontWidthClass?: string;
  layout?: 'side' | 'iconRight' | 'row';
}) {
  if (layout === 'iconRight') {
    return (
      <div className="relative mx-auto flex h-full w-full items-center justify-center">
        <div
          className={`relative z-10 ${backWidthClass} animate-fade-in motion-reduce:animate-none`}
          style={{ animationDuration: '0.45s' }}
        >
          <div className="overflow-hidden rounded-xl border border-gray-200/90 bg-white p-1 shadow-[0_16px_40px_-16px_rgba(15,23,42,0.28)]">
            <Image
              src={back.src}
              alt=""
              width={back.width}
              height={back.height}
              quality={90}
              className="block h-auto w-full rounded-lg"
              sizes="(min-width: 1024px) 460px, 82vw"
            />
          </div>
          {/* Compact channel icon, no chrome — sits on the screenshot’s right edge. */}
          <div
            className={`pointer-events-none absolute top-1/2 z-20 -translate-y-1/2 ${frontWidthClass} animate-fade-in-up motion-reduce:animate-none`}
            style={{
              right: '-4%',
              animationDuration: '0.55s',
              animationDelay: '0.1s',
              opacity: 0,
            }}
          >
            <Image
              src={front.src}
              alt=""
              width={front.width}
              height={front.height}
              quality={92}
              className="block h-auto w-full drop-shadow-[0_10px_20px_rgba(0,0,0,0.28)]"
              sizes="56px"
            />
          </div>
        </div>
      </div>
    );
  }

  if (layout === 'row') {
    return (
      <div className="flex h-full w-full items-center justify-center gap-3 px-3 sm:gap-4 sm:px-4">
        <div
          className={`${backWidthClass} animate-fade-in motion-reduce:animate-none`}
          style={{ animationDuration: '0.45s' }}
        >
          <div className="overflow-hidden rounded-xl border border-gray-200/90 bg-white p-1 shadow-[0_16px_40px_-16px_rgba(15,23,42,0.28)]">
            <Image
              src={back.src}
              alt=""
              width={back.width}
              height={back.height}
              quality={90}
              className="block h-auto max-h-[210px] w-full rounded-lg object-contain sm:max-h-[280px]"
              sizes="(min-width: 1024px) 260px, 48vw"
            />
          </div>
        </div>
        <div
          className={`${frontWidthClass} animate-fade-in-up motion-reduce:animate-none`}
          style={{ animationDuration: '0.55s', animationDelay: '0.1s', opacity: 0 }}
        >
          <div className="overflow-hidden rounded-xl border border-white/90 bg-white p-1 shadow-[0_18px_40px_-16px_rgba(10,97,215,0.3)]">
            <Image
              src={front.src}
              alt=""
              width={front.width}
              height={front.height}
              quality={92}
              className="block h-auto max-h-[210px] w-full rounded-lg object-contain sm:max-h-[280px]"
              sizes="(min-width: 1024px) 150px, 28vw"
            />
          </div>
        </div>
      </div>
    );
  }

  /** Side-by-side overlap like login showcase slide 2: primary left, secondary bottom-right. */
  return (
    <div className="relative mx-auto h-full w-full">
      <div
        className={`absolute left-[4%] top-[10%] z-10 sm:left-[5%] sm:top-[12%] ${backWidthClass} animate-fade-in motion-reduce:animate-none`}
        style={{ animationDuration: '0.45s' }}
      >
        <div className="overflow-hidden rounded-xl border border-gray-200/90 bg-white p-1 shadow-[0_16px_40px_-16px_rgba(15,23,42,0.28)]">
          <Image
            src={back.src}
            alt=""
            width={back.width}
            height={back.height}
            quality={90}
            className="block h-auto w-full rounded-lg"
            sizes="(min-width: 1024px) 280px, 52vw"
          />
        </div>
      </div>
      <div
        className={`absolute bottom-[10%] right-[2%] z-20 sm:bottom-[12%] sm:right-[3%] ${frontWidthClass} animate-fade-in-up motion-reduce:animate-none`}
        style={{ animationDuration: '0.55s', animationDelay: '0.1s', opacity: 0 }}
      >
        <div className="overflow-hidden rounded-xl border border-white/90 bg-white p-1 shadow-[0_18px_40px_-16px_rgba(10,97,215,0.3)]">
          <Image
            src={front.src}
            alt=""
            width={front.width}
            height={front.height}
            quality={92}
            className="block h-auto w-full rounded-lg"
            sizes="(min-width: 1024px) 400px, 72vw"
          />
        </div>
      </div>
    </div>
  );
}

function PointAutoCarousel({
  images,
  intervalMs = 3500,
  alt,
  size = 'md',
}: {
  images: PointMedia[];
  intervalMs?: number;
  alt: string;
  size?: 'md' | 'lg';
}) {
  const [active, setActive] = useState(0);
  const large = size === 'lg';

  useEffect(() => {
    if (images.length <= 1) return;
    const reduce =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) return;

    const id = window.setInterval(() => {
      setActive((prev) => (prev + 1) % images.length);
    }, intervalMs);
    return () => window.clearInterval(id);
  }, [images.length, intervalMs]);

  return (
    <div className="relative h-full w-full">
      {images.map((image, index) => (
        <div
          key={image.src}
          className={`absolute inset-0 flex items-center justify-center p-2 sm:p-3 transition-opacity duration-700 ease-out ${
            index === active ? 'opacity-100' : 'pointer-events-none opacity-0'
          }`}
          aria-hidden={index !== active}
        >
          <span className="inline-flex max-w-full overflow-hidden rounded-xl border border-gray-200/90 bg-white shadow-[0_14px_36px_-16px_rgba(15,23,42,0.28)]">
            <Image
              src={image.src}
              alt={image.label ? `${alt} — ${image.label}` : alt}
              width={image.width}
              height={image.height}
              quality={90}
              className={
                large
                  ? 'block h-auto w-auto max-h-[300px] max-w-full sm:max-h-[420px]'
                  : 'block h-auto w-auto max-h-[224px] max-w-full sm:max-h-[296px]'
              }
              sizes={large ? '(min-width: 1024px) 720px, 94vw' : '(min-width: 1024px) 560px, 92vw'}
              priority={index === 0}
            />
          </span>
        </div>
      ))}
    </div>
  );
}

export function FeatureModulePage({
  slug,
  locale,
}: {
  slug: FeatureModuleSlug;
  locale: string;
}) {
  const t = useTranslations('featureModules');
  const router = useRouter();
  const moduleDef = getFeatureModule(slug);
  const Icon = moduleDef?.icon;
  const pointsCount = Math.min(6, Math.max(1, moduleDef?.pointsCount ?? 3));
  const highlightsCount = Math.min(6, Math.max(1, moduleDef?.highlightsCount ?? 3));
  const points = Array.from({ length: pointsCount }, (_, i) => i + 1);
  const highlights = Array.from({ length: highlightsCount }, (_, i) => i + 1);

  if (!Icon) return null;

  return (
    <div className="min-h-screen bg-white text-gray-900">
      <section className="relative overflow-hidden pt-24 sm:pt-28 pb-14 sm:pb-16 bg-gradient-to-b from-white via-[#f8fbff] to-white">
        <AuthDecorativeBackground variant="light" />
        <div className="relative z-10 mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 text-center">
          <Reveal className="mx-auto max-w-3xl">
            <div className="inline-flex items-center justify-center gap-2 text-sm font-medium text-[#0a61d7] mb-4">
              <Icon className="w-4 h-4" strokeWidth={1.75} />
              <span>{t(`${slug}.menuLabel`)}</span>
            </div>
            <h1 className="text-3xl sm:text-4xl lg:text-[2.75rem] font-bold tracking-tight text-gray-900 leading-tight">
              {t(`${slug}.title`)}
            </h1>
            <p className="mx-auto mt-4 text-base sm:text-lg text-gray-600 leading-relaxed max-w-2xl">
              {t(`${slug}.subtitle`)}
            </p>
            <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => router.push('/register')}
                className="w-full sm:w-auto bg-[#0a61d7] text-white px-7 py-3 rounded-xl text-sm font-semibold hover:bg-[#084ba6] transition-colors"
              >
                {t('cta')}
              </button>
              <button
                type="button"
                onClick={() => router.push(featurePath(locale))}
                className="w-full sm:w-auto border border-gray-300 bg-white text-gray-800 px-7 py-3 rounded-xl text-sm font-semibold hover:bg-gray-50 transition-colors"
              >
                {t('menu.viewAll')}
              </button>
            </div>
          </Reveal>
        </div>
      </section>

      <section className="border-y border-gray-200 bg-white py-12 sm:py-14">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <Reveal>
            <nav className="text-sm text-gray-500 mb-6" aria-label="Breadcrumb">
              <ol className="flex flex-wrap items-center gap-1.5">
                <li>
                  <button
                    type="button"
                    onClick={() => router.push(`/${locale}/landing`)}
                    className="hover:text-[#0a61d7] transition-colors"
                  >
                    {t('overview.home')}
                  </button>
                </li>
                <li aria-hidden className="text-gray-300">
                  &gt;
                </li>
                <li>
                  <button
                    type="button"
                    onClick={() => router.push(featurePath(locale))}
                    className="hover:text-[#0a61d7] transition-colors"
                  >
                    {t('overview.features')}
                  </button>
                </li>
                <li aria-hidden className="text-gray-300">
                  &gt;
                </li>
                <li className="text-gray-700 font-medium">{t(`${slug}.menuLabel`)}</li>
              </ol>
            </nav>

            <p className="text-xl sm:text-2xl lg:text-[1.65rem] font-bold tracking-tight text-gray-900 leading-snug max-w-5xl">
              {t(`${slug}.overview.summary`)}
            </p>

            <div className="mt-8 flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
              <p className="text-xs font-semibold tracking-widest uppercase text-gray-400 shrink-0">
                {t('overview.loopLabel')}
              </p>
              <div className="flex flex-wrap gap-2">
                {(['dashboard', 'marketplace'] as const).map((surface) => {
                  const active = moduleDef.surfaces.includes(surface);
                  return (
                    <span
                      key={surface}
                      className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold border ${
                        active
                          ? 'border-[#0a61d7]/25 bg-[#0a61d7]/5 text-[#0a61d7]'
                          : 'border-gray-200 bg-gray-50 text-gray-400'
                      }`}
                    >
                      {t(`overview.surfaces.${surface}`)}
                    </span>
                  );
                })}
              </div>
            </div>

            <div className="mt-10">
              <p className="text-sm font-semibold text-gray-900 mb-4">{t('overview.unlocksLabel')}</p>
              <div
                className={`grid gap-4 ${
                  highlightsCount > 3 ? 'sm:grid-cols-2 lg:grid-cols-3' : 'sm:grid-cols-3'
                }`}
              >
                {highlights.map((n) => (
                  <div
                    key={n}
                    className="rounded-2xl border border-gray-200 bg-[#f7f9fc] p-5"
                  >
                    <p className="text-xs font-semibold tracking-widest text-[#0a61d7] mb-2">
                      {String(n).padStart(2, '0')}
                    </p>
                    <h3 className="text-base font-bold text-gray-900 leading-snug">
                      {t(`${slug}.overview.highlights.${n}.title`)}
                    </h3>
                    <p className="mt-2 text-sm text-gray-600 leading-relaxed">
                      {t(`${slug}.overview.highlights.${n}.desc`)}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-10 pt-8 border-t border-gray-100 flex flex-col lg:flex-row lg:items-center gap-5 lg:gap-8">
              <p className="text-sm font-semibold text-gray-900 shrink-0 lg:max-w-xs">
                {t('overview.trusted')}
              </p>
              <div className="grid grid-cols-3 sm:grid-cols-5 gap-2.5 flex-1">
                {[1, 2, 3, 4, 5].map((n) => (
                  <div
                    key={n}
                    className="h-11 rounded-lg border border-dashed border-gray-200 bg-gray-50 flex items-center justify-center"
                  >
                    <span className="text-[11px] text-gray-400">{t('overview.logoPlaceholder')}</span>
                  </div>
                ))}
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      <section className="py-16 sm:py-20 bg-white">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <Reveal className="text-center mb-12 sm:mb-16 max-w-2xl mx-auto">
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-gray-900">
              {t('usesTitle')}
            </h2>
          </Reveal>

          <div className="space-y-16 sm:space-y-24">
            {points.map((n, i) => {
              const title = t(`${slug}.points.${n}.title`);
              const pointMedia = POINT_MEDIA[slug]?.[n];
              const imageLeft = Boolean(pointMedia) && i % 2 === 1;
              /** Fixed stage size so screenshot steps match placeholder steps. */
              const stageHeightClass =
                pointMedia?.type === 'carousel' && pointMedia.size === 'lg'
                  ? 'h-[320px] sm:h-[440px]'
                  : 'h-[240px] sm:h-[320px]';
              const media = pointMedia ? (
                pointMedia.type === 'single' ? (
                  <FeatureMediaFrame framed={false} minHeightClass={stageHeightClass}>
                    {pointMedia.placement === 'center' ? (
                      /* Card shrink-wraps the image so there is no letterboxed whitespace. */
                      <div className="flex h-full w-full items-center justify-center p-2 sm:p-3">
                        <span className="inline-flex max-w-full overflow-hidden rounded-xl border border-gray-200/90 bg-white shadow-[0_14px_36px_-16px_rgba(15,23,42,0.28)]">
                          <Image
                            src={pointMedia.image.src}
                            alt={title}
                            width={pointMedia.image.width}
                            height={pointMedia.image.height}
                            quality={90}
                            className="block h-auto w-auto max-h-[224px] max-w-full sm:max-h-[296px]"
                            sizes="(min-width: 1024px) 560px, 92vw"
                          />
                        </span>
                      </div>
                    ) : (
                      /* Bottom-right corner pin (step 1 style). */
                      <div className="absolute inset-0">
                        <div className="absolute -bottom-2 -right-2 w-[96%] overflow-hidden rounded-tl-2xl border-l border-t border-gray-200/90 bg-white shadow-[0_18px_44px_-18px_rgba(10,97,215,0.32)] sm:-bottom-3 sm:-right-3">
                          <Image
                            src={pointMedia.image.src}
                            alt={title}
                            width={pointMedia.image.width}
                            height={pointMedia.image.height}
                            quality={90}
                            className="block h-auto w-full"
                            sizes="(min-width: 1024px) 560px, 96vw"
                          />
                        </div>
                      </div>
                    )}
                  </FeatureMediaFrame>
                ) : pointMedia.type === 'placeholder' ? (
                  <FeatureMediaFrame framed={false} minHeightClass={stageHeightClass}>
                    <div
                      className="flex h-full w-full items-center justify-center rounded-xl border border-dashed border-gray-300 bg-white/70 px-6 text-center"
                      role="img"
                      aria-label={t('usesPlaceholder', { title })}
                    >
                      <p className="text-sm text-gray-500 max-w-sm leading-relaxed">
                        {t('usesPlaceholder', { title })}
                      </p>
                    </div>
                  </FeatureMediaFrame>
                ) : pointMedia.type === 'carousel' ? (
                  <FeatureMediaFrame framed={false} minHeightClass={stageHeightClass}>
                    <PointAutoCarousel
                      images={pointMedia.images}
                      intervalMs={pointMedia.intervalMs}
                      size={pointMedia.size}
                      alt={title}
                    />
                  </FeatureMediaFrame>
                ) : pointMedia.type === 'straight' ? (
                  <FeatureMediaFrame framed={false} minHeightClass={stageHeightClass}>
                    <PointStraightStack
                      back={pointMedia.back}
                      front={pointMedia.front}
                      backWidthClass={pointMedia.backWidthClass}
                      frontWidthClass={pointMedia.frontWidthClass}
                      layout={pointMedia.layout}
                    />
                  </FeatureMediaFrame>
                ) : (
                  <FeatureMediaFrame framed={false} minHeightClass={stageHeightClass}>
                    <PointDiagonalStack
                      back={pointMedia.back}
                      front={pointMedia.front}
                      orientation={pointMedia.orientation}
                      scale={pointMedia.scale}
                      overlap={pointMedia.overlap}
                      frontWidthClass={pointMedia.frontWidthClass}
                    />
                  </FeatureMediaFrame>
                )
              ) : null;
              const copy = (
                <div>
                  <p className="text-xs font-semibold tracking-widest text-[#0a61d7] mb-3">
                    {String(n).padStart(2, '0')}
                  </p>
                  <h3 className="text-2xl sm:text-3xl font-bold tracking-tight text-gray-900 leading-snug">
                    {title}
                  </h3>
                  <p className="mt-4 text-base text-gray-600 leading-relaxed">
                    {t(`${slug}.points.${n}.desc`)}
                  </p>
                </div>
              );

              return (
                <Reveal key={n} delayMs={i * 60}>
                  <div
                    className={
                      media
                        ? 'grid lg:grid-cols-2 gap-10 lg:gap-14 items-center'
                        : 'max-w-3xl'
                    }
                  >
                    {imageLeft ? (
                      <>
                        {media}
                        {copy}
                      </>
                    ) : (
                      <>
                        {copy}
                        {media}
                      </>
                    )}
                  </div>
                </Reveal>
              );
            })}
          </div>
        </div>
      </section>

      <section className="py-16 sm:py-20 bg-[#f7f9fc]">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <Reveal>
            <p className="text-sm font-medium text-gray-500 mb-6">{t('hub.exploreMore')}</p>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {FEATURE_MODULES.filter((m) => m.slug !== slug).map((m) => {
                const ModIcon = m.icon;
                return (
                  <button
                    key={m.slug}
                    type="button"
                    onClick={() => router.push(featurePath(locale, m.slug))}
                    className="flex items-center gap-3 text-left rounded-xl border border-gray-200 bg-white px-4 py-3 hover:border-[#0a61d7]/30 hover:bg-white transition-colors"
                  >
                    <ModIcon className="w-4 h-4 shrink-0 text-gray-500" strokeWidth={1.75} />
                    <span className="text-sm font-medium text-gray-800">{t(`${m.slug}.menuLabel`)}</span>
                  </button>
                );
              })}
            </div>
          </Reveal>
        </div>
      </section>
    </div>
  );
}
