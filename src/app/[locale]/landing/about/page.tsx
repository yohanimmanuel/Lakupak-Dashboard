'use client';

import { useState, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  createErrorBoundary,
  createTrackConversion,
  usePagePerformanceTracking,
} from '@/utils/landing-enhancements';
import { Reveal } from '../Reveal';

const ErrorBoundary = createErrorBoundary('About');

/** Whitelisted rich tags for static about story copy (next-intl). */
const STORY_RICH = {
  b: (chunks: ReactNode) => <b>{chunks}</b>,
};

export default function AboutPage() {
  const router = useRouter();
  const t = useTranslations('about');
  const [activeSlide, setActiveSlide] = useState(0);

  usePagePerformanceTracking('About');
  const trackConversion = createTrackConversion('About');

  const goSolutions = () => {
    trackConversion('cta_click', 'view_solutions');
    router.push('/landing/solutions');
  };

  const storyBefore = [1, 2, 3, 4, 5] as const;
  const storyAfter = [6, 7, 8] as const;

  const pillars = [
    {
      title: t('carousel.1.title'),
      body: <p className="text-base sm:text-lg text-gray-600 leading-relaxed">{t('carousel.1.content')}</p>,
    },
    {
      title: t('carousel.2.title'),
      body: <p className="text-base sm:text-lg text-gray-600 leading-relaxed">{t('carousel.2.content')}</p>,
    },
    {
      title: t('carousel.3.title'),
      body: (
        <ul className="space-y-3 text-base sm:text-lg text-gray-600 leading-relaxed">
          <li>{t('carousel.3.1')}</li>
          <li>{t('carousel.3.2')}</li>
          <li>{t('carousel.3.3')}</li>
        </ul>
      ),
    },
    {
      title: t('carousel.4.title'),
      body: <p className="text-base sm:text-lg text-gray-600 leading-relaxed">{t('carousel.4.content')}</p>,
    },
  ];

  const goPrev = () => setActiveSlide((i) => (i === 0 ? pillars.length - 1 : i - 1));
  const goNext = () => setActiveSlide((i) => (i === pillars.length - 1 ? 0 : i + 1));

  return (
    <ErrorBoundary>
      <div className="min-h-screen bg-white text-gray-900">
        {/* Hero — quiet, no decorative background animation */}
        <section className="relative overflow-hidden pb-14 sm:pb-16 pt-24 sm:pt-28 bg-gradient-to-b from-white via-[#f8fbff] to-[#eef4fd]">
          <div className="relative z-10 mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 text-center">
            <Reveal>
              <p className="text-sm font-semibold tracking-widest uppercase text-[#0a61d7] mb-4">Lakupak</p>
              <h1 className="text-3xl sm:text-4xl lg:text-[2.75rem] font-bold tracking-tight text-gray-900 leading-tight">
                {t('hero.title')}
              </h1>
              <p className="mx-auto mt-4 text-base sm:text-lg text-gray-600 leading-relaxed max-w-2xl">
                {t('hero.subtitle')}
              </p>
            </Reveal>
          </div>
        </section>

        {/* Story */}
        <section className="py-16 sm:py-20 bg-white">
          <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
            <div className="space-y-6 text-[15px] sm:text-base text-gray-700 leading-relaxed">
              {storyBefore.map((n, i) => (
                <Reveal key={n} delayMs={i * 40}>
                  <p>{t.rich(`story.${n}`, STORY_RICH)}</p>
                </Reveal>
              ))}

              <Reveal delayMs={200}>
                <blockquote className="border-l-2 border-[#0a61d7] pl-5 py-1 text-gray-900 font-semibold italic">
                  {t('story.vision')}
                </blockquote>
              </Reveal>

              {storyAfter.map((n, i) => (
                <Reveal key={n} delayMs={i * 40}>
                  <p>{t.rich(`story.${n}`, STORY_RICH)}</p>
                </Reveal>
              ))}

              <Reveal>
                <blockquote className="border-l-2 border-gray-300 pl-5 py-1 text-gray-800 italic leading-relaxed">
                  {t('story.mission')}
                </blockquote>
              </Reveal>

              <Reveal>
                <p className="text-gray-500">{t('story.end')}</p>
              </Reveal>
            </div>
          </div>
        </section>

        {/* Mission / Vision / Beliefs / Why Laku — carousel */}
        <section className="py-16 sm:py-20 bg-[#f7f9fc] border-y border-gray-200">
          <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
            <Reveal>
              <div className="relative">
                <div className="overflow-hidden">
                  <div
                    className="flex transition-transform duration-500 ease-out"
                    style={{ transform: `translateX(-${activeSlide * 100}%)` }}
                  >
                    {pillars.map((item, i) => (
                      <div key={item.title} className="w-full shrink-0 px-1">
                        <div className="border-t border-gray-200 pt-8 min-h-[220px] sm:min-h-[200px]">
                          <p className="text-xs font-semibold tracking-widest text-[#0a61d7] mb-3">
                            {String(i + 1).padStart(2, '0')}
                          </p>
                          <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-4 tracking-tight">
                            {item.title}
                          </h2>
                          {item.body}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="mt-10 flex items-center justify-between gap-4">
                  <button
                    type="button"
                    onClick={goPrev}
                    aria-label="Previous"
                    className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-700 hover:border-[#0a61d7] hover:text-[#0a61d7] transition-colors"
                  >
                    <ChevronLeft className="w-5 h-5" strokeWidth={1.75} />
                  </button>

                  <div className="flex items-center gap-2">
                    {pillars.map((item, i) => (
                      <button
                        key={item.title}
                        type="button"
                        aria-label={`Go to slide ${i + 1}`}
                        aria-current={activeSlide === i}
                        onClick={() => setActiveSlide(i)}
                        className={`h-2 rounded-full transition-all ${
                          activeSlide === i ? 'w-6 bg-[#0a61d7]' : 'w-2 bg-gray-300 hover:bg-gray-400'
                        }`}
                      />
                    ))}
                  </div>

                  <button
                    type="button"
                    onClick={goNext}
                    aria-label="Next"
                    className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-700 hover:border-[#0a61d7] hover:text-[#0a61d7] transition-colors"
                  >
                    <ChevronRight className="w-5 h-5" strokeWidth={1.75} />
                  </button>
                </div>
              </div>
            </Reveal>
          </div>
        </section>

        {/* Final CTA */}
        <section className="py-16 sm:py-20 bg-gradient-to-b from-[#0a61d7] to-[#084ba6]">
          <Reveal className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 text-center">
            <h2 className="text-3xl sm:text-4xl font-bold text-white tracking-tight">{t('cta.title')}</h2>
            <p className="mt-4 text-base sm:text-lg text-blue-100 leading-relaxed">{t('cta.subtitle')}</p>
            <button
              type="button"
              onClick={goSolutions}
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
