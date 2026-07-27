'use client';

import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { AuthDecorativeBackground } from '@/components/auth/AuthDecorativeBackground';
import { FeatureMediaFrame } from '../FeatureMediaFrame';
import { Reveal } from '../Reveal';
import type { FeatureModuleSlug } from './modules';
import { FEATURE_MODULES, featurePath, getFeatureModule } from './modules';

type PointMedia = { src: string; width: number; height: number };
type PointMediaConfig =
  | { type: 'single'; image: PointMedia; placement?: 'corner' | 'center' }
  | {
      type: 'diagonal';
      back: PointMedia;
      front: PointMedia;
      orientation?: 'tl-br' | 'tr-bl';
      /** Smaller stack so taller screenshots stay inside the stage. */
      scale?: 'sm' | 'md';
    };

/** Real screenshots for specific detail steps; the rest fall back to placeholders. */
const POINT_MEDIA: Partial<Record<FeatureModuleSlug, Record<number, PointMediaConfig>>> = {
  clients: {
    1: {
      type: 'single',
      placement: 'corner',
      image: { src: '/Dashboardclientbuyer2.png', width: 740, height: 345 },
    },
    2: {
      type: 'diagonal',
      back: { src: '/Dashboardclientbuyer3.png', width: 488, height: 295 },
      front: { src: '/Dashboardclientbuyer4.png', width: 736, height: 287 },
      orientation: 'tr-bl',
    },
    3: {
      type: 'single',
      placement: 'center',
      image: { src: '/Dashboardclientbuyer5.png', width: 486, height: 297 },
    },
    4: {
      type: 'single',
      placement: 'center',
      image: { src: '/Dashboardclientbuyer7.png', width: 1488, height: 378 },
    },
    5: {
      type: 'single',
      placement: 'center',
      image: { src: '/Dashboardclientbuyer8.png', width: 1488, height: 761 },
    },
  },
  products: {
    1: {
      type: 'single',
      placement: 'corner',
      image: { src: '/Dashboardproducts6.png', width: 1517, height: 761 },
    },
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
    5: {
      type: 'single',
      placement: 'center',
      image: { src: '/Dashboardproducts9.png', width: 1457, height: 203 },
    },
  },
  orders: {
    1: {
      type: 'single',
      placement: 'center',
      image: { src: '/Dashboardorders3.png', width: 1505, height: 675 },
    },
    2: {
      type: 'single',
      placement: 'center',
      image: { src: '/Dashboardorders4.png', width: 947, height: 762 },
    },
    3: {
      type: 'single',
      placement: 'center',
      image: { src: '/Dashboardorders6.png', width: 1000, height: 2048 },
    },
    4: {
      type: 'diagonal',
      back: { src: '/Dashboardorders5.png', width: 492, height: 727 },
      front: { src: '/Dashboardlogs.png', width: 751, height: 790 },
      orientation: 'tr-bl',
      scale: 'sm',
    },
  },
};

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

function PointDiagonalStack({
  back,
  front,
  orientation = 'tl-br',
  scale = 'md',
}: {
  back: PointMedia;
  front: PointMedia;
  orientation?: 'tl-br' | 'tr-bl';
  scale?: 'sm' | 'md';
}) {
  const mirrored = orientation === 'tr-bl';
  const compact = scale === 'sm';
  const backWidth = compact ? 'w-[42%] sm:w-[40%]' : 'w-[66%] sm:w-[62%]';
  const frontWidth = compact ? 'w-[52%] sm:w-[48%]' : 'w-[78%] sm:w-[72%]';
  const backPos = mirrored
    ? compact
      ? 'right-[8%] top-[12%]'
      : 'right-[4%] top-[10%]'
    : compact
      ? 'left-[8%] top-[12%]'
      : 'left-[4%] top-[10%]';
  const frontPos = mirrored
    ? compact
      ? 'left-[10%] bottom-[10%]'
      : 'left-[2%] bottom-[6%]'
    : compact
      ? 'right-[10%] bottom-[10%]'
      : 'right-[2%] bottom-[6%]';

  return (
    <div className="relative mx-auto h-full w-full">
      <div
        className={`absolute z-0 ${backWidth} animate-fade-in motion-reduce:animate-none ${backPos}`}
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
            className="block h-auto w-full rounded-lg"
            sizes={compact ? '(min-width: 1024px) 220px, 42vw' : '(min-width: 1024px) 360px, 62vw'}
          />
        </div>
      </div>
      <div
        className={`absolute z-10 ${frontWidth} animate-fade-in-up motion-reduce:animate-none ${frontPos}`}
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
            sizes={compact ? '(min-width: 1024px) 280px, 52vw' : '(min-width: 1024px) 420px, 74vw'}
          />
        </div>
      </div>
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
                {(['dashboard', 'marketplace', 'driver'] as const).map((surface) => {
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
              const imageLeft = i % 2 === 1;
              const title = t(`${slug}.points.${n}.title`);
              const pointMedia = POINT_MEDIA[slug]?.[n];
              /** Fixed stage size so screenshot steps match placeholder steps. */
              const stageHeightClass = 'h-[240px] sm:h-[320px]';
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
                ) : (
                  <FeatureMediaFrame framed={false} minHeightClass={stageHeightClass}>
                    <PointDiagonalStack
                      back={pointMedia.back}
                      front={pointMedia.front}
                      orientation={pointMedia.orientation}
                      scale={pointMedia.scale}
                    />
                  </FeatureMediaFrame>
                )
              ) : (
                <FeatureMediaFrame minHeightClass={stageHeightClass}>
                  <ImagePlaceholder
                    label={t('usesPlaceholder', { title })}
                    className="h-full w-full border-0 bg-white rounded-none"
                  />
                </FeatureMediaFrame>
              );
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
                  <div className="grid lg:grid-cols-2 gap-10 lg:gap-14 items-center">
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
