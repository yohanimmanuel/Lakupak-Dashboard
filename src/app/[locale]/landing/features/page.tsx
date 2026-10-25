'use client';

import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { Reveal } from '../Reveal';
import { FEATURE_MENU_GROUPS, FEATURE_MODULES, featurePath } from './modules';

export default function FeaturesHubPage() {
  const t = useTranslations('featureModules');
  const locale = useLocale();
  const router = useRouter();

  return (
    <div className="min-h-screen bg-white text-gray-900">
      <section className="pt-24 sm:pt-28 pb-14 sm:pb-16 bg-gradient-to-b from-white via-[#f8fbff] to-white">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <Reveal className="max-w-3xl">
            <h1 className="text-3xl sm:text-4xl lg:text-[2.75rem] font-bold tracking-tight text-gray-900 leading-tight">
              {t('hub.title')}
            </h1>
            <p className="mt-4 text-base sm:text-lg text-gray-600 leading-relaxed max-w-2xl">
              {t('hub.subtitle')}
            </p>
            <button
              type="button"
              onClick={() => router.push('/register')}
              className="mt-8 bg-[#0a61d7] text-white px-7 py-3 rounded-xl text-sm font-semibold hover:bg-[#084ba6] transition-colors"
            >
              {t('cta')}
            </button>
          </Reveal>
        </div>
      </section>

      <section className="pb-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 space-y-14">
          {FEATURE_MENU_GROUPS.map((group) => {
            const items = FEATURE_MODULES.filter((m) => m.group === group);
            if (items.length === 0) return null;
            return (
              <div key={group}>
                <Reveal>
                  <p className="text-xs font-semibold tracking-widest uppercase text-[#0a61d7] mb-5">
                    {t(`menu.groups.${group}`)}
                  </p>
                </Reveal>
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {items.map((m, i) => {
                    const Icon = m.icon;
                    return (
                      <Reveal key={m.slug} delayMs={i * 60}>
                        <button
                          type="button"
                          onClick={() => router.push(featurePath(locale, m.slug))}
                          className="w-full h-full text-left rounded-2xl border border-gray-200 bg-white p-5 hover:border-[#0a61d7]/30 hover:bg-[#f7f9fc] transition-colors"
                        >
                          <Icon className="w-5 h-5 text-gray-500 mb-3" strokeWidth={1.75} />
                          <h2 className="text-base font-bold text-gray-900">{t(`${m.slug}.menuLabel`)}</h2>
                          <p className="mt-2 text-sm text-gray-600 leading-relaxed line-clamp-3">
                            {t(`${m.slug}.subtitle`)}
                          </p>
                        </button>
                      </Reveal>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
