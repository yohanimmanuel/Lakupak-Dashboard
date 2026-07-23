'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { AuthDecorativeBackground } from '@/components/auth/AuthDecorativeBackground';
import { Reveal } from '../Reveal';
import type { FeatureModuleSlug } from './modules';
import { FEATURE_MODULES, featurePath, getFeatureModule } from './modules';

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
              const media = (
                <div className="rounded-2xl border border-gray-200 bg-[#f7f9fc] p-3 sm:p-4 shadow-[0_8px_30px_-12px_rgba(10,97,215,0.12)]">
                  <ImagePlaceholder
                    label={t('usesPlaceholder', { title })}
                    className="min-h-[220px] sm:min-h-[300px] w-full bg-white"
                  />
                </div>
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
