'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuthTranslations } from '@/hooks/useAuthTranslations';

const SLIDE_COUNT = 5;
const SLIDE_DURATION_MS = 5500;
const TICK_MS = 50;

type SlideImage = {
  src: string;
  altKey: string;
  className: string;
  animation: string;
  size?: 'sm' | 'md';
};

type SlideConfig = {
  titleKey: string;
  subtitleKey: string;
  images: SlideImage[];
};

const SLIDES: SlideConfig[] = [
  {
    titleKey: 'showcaseSlideHomeTitle',
    subtitleKey: 'showcaseSlideHomeSubtitle',
    images: [
      {
        src: '/Dashboardhome.png',
        altKey: 'showcaseSlideHomeAlt',
        className: 'left-1/2 top-63 z-10 w-[100%] max-w-[650px] -translate-x-1/2 -translate-y-[54%]',
        animation: 'animate-showcase-float-slow',
      },
    ],
  },
  {
    titleKey: 'showcaseSlideProductsTitle',
    subtitleKey: 'showcaseSlideProductsSubtitle',
    images: [
      {
        src: '/Dashboardproducts2.png',
        altKey: 'showcaseSlideProductsPrimaryAlt',
        className: 'left-10 top-20 z-10 w-[80%]',
        animation: 'animate-showcase-float-slow',
        size: 'md',
      },
      {
        src: '/Dashboardproducts.png',
        altKey: 'showcaseSlideProductsSecondaryAlt',
        className: 'bottom-5 right-10 z-20 w-[24%]',
        animation: 'animate-showcase-float-slower animate-delay-700',
        size: 'sm',
      },
    ],
  },
  {
    titleKey: 'showcaseSlideOrdersTitle',
    subtitleKey: 'showcaseSlideOrdersSubtitle',
    images: [
      {
        src: '/Dashboardorders.png',
        altKey: 'showcaseSlideOrdersPrimaryAlt',
        className: 'left-10 top-20 z-10 w-[80%]',
        animation: 'animate-showcase-float-slow',
        size: 'md',
      },
      {
        src: '/Dashboardlogs.png',
        altKey: 'showcaseSlideOrdersSecondaryAlt',
        className: 'bottom-5 right-10 z-20 w-[30%]',
        animation: 'animate-showcase-float-slower animate-delay-700',
        size: 'sm',
      },
    ],
  },
  {
    titleKey: 'showcaseSlideMarketingTitle',
    subtitleKey: 'showcaseSlideMarketingSubtitle',
    images: [
      {
        src: '/Dashboardmarketing.png',
        altKey: 'showcaseSlideMarketingPrimaryAlt',
        className: 'left-25 top-15 z-10 w-[50%]',
        animation: 'animate-showcase-float-slow',
        size: 'md',
      },
      {
        src: '/Dashboardmarketing2.png',
        altKey: 'showcaseSlideMarketingSecondaryAlt',
        className: 'bottom-5 right-25 z-20 w-[30%]',
        animation: 'animate-showcase-float-slower animate-delay-500',
        size: 'sm',
      },
    ],
  },
  {
    titleKey: 'showcaseSlideAnalyticsTitle',
    subtitleKey: 'showcaseSlideAnalyticsSubtitle',
    images: [
      {
        src: '/Dashboardanalytics3.png',
        altKey: 'showcaseSlideAnalyticsTertiaryAlt',
        className: 'right-[20%] top-[6%] z-10 w-[40%]',
        animation: 'animate-showcase-float-slow',
        size: 'md',
      },
      {
        src: '/Dashboardanalytics.png',
        altKey: 'showcaseSlideAnalyticsSecondaryAlt',
        className: 'left-[15%] top-[30%] z-20 w-[35%]',
        animation: 'animate-showcase-float animate-delay-300',
        size: 'md',
      },
      {
        src: '/Dashboardanalytics2.png',
        altKey: 'showcaseSlideAnalyticsPrimaryAlt',
        className: 'right-[15%] bottom-[1%] z-30 w-[38%]',
        animation: 'animate-showcase-float-slower animate-delay-700',
        size: 'md',
      },
    ],
  },
];

function ShowcaseImage({ image, alt }: { image: SlideImage; alt: string }) {
  const isSmall = image.size === 'sm';

  return (
    <div
      className={`absolute border border-white/20 bg-white shadow-[0_20px_48px_rgba(0,0,0,0.24)] ${
        isSmall ? 'rounded-xl p-1' : 'rounded-2xl p-1.5'
      } ${image.className} ${image.animation}`}
    >
      <img
        src={image.src}
        alt={alt}
        className={`w-full border border-gray-100 ${isSmall ? 'rounded-lg' : 'rounded-xl'}`}
      />
    </div>
  );
}

export function LoginShowcaseCarousel() {
  const { tLogin } = useAuthTranslations();
  const [activeSlide, setActiveSlide] = useState(0);
  const [progress, setProgress] = useState(0);
  const activeSlideRef = useRef(0);
  const slideStartRef = useRef(Date.now());

  const translate = useCallback(
    (key: string) => tLogin(key as Parameters<typeof tLogin>[0]),
    [tLogin],
  );

  const goToSlide = useCallback((index: number) => {
    const normalized = ((index % SLIDE_COUNT) + SLIDE_COUNT) % SLIDE_COUNT;
    activeSlideRef.current = normalized;
    setActiveSlide(normalized);
    setProgress(0);
    slideStartRef.current = Date.now();
  }, []);

  const goToNextSlide = useCallback(() => {
    goToSlide(activeSlideRef.current + 1);
  }, [goToSlide]);

  useEffect(() => {
    const interval = setInterval(() => {
      const elapsed = Date.now() - slideStartRef.current;
      const nextProgress = Math.min((elapsed / SLIDE_DURATION_MS) * 100, 100);
      setProgress(nextProgress);

      if (elapsed >= SLIDE_DURATION_MS) {
        goToSlide(activeSlideRef.current + 1);
      }
    }, TICK_MS);

    return () => clearInterval(interval);
  }, [goToSlide]);

  return (
    <div className="hidden lg:flex absolute inset-y-0 right-0 left-[42%] overflow-hidden bg-[#0a61d7] animate-fade-in-right">
      <div
        className="pointer-events-none absolute inset-0 opacity-40"
        style={{
          backgroundImage:
            'linear-gradient(rgba(255,255,255,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.05) 1px, transparent 1px)',
          backgroundSize: '32px 32px',
        }}
      />
      <div className="pointer-events-none absolute -right-16 top-16 h-72 w-72 rounded-[2.5rem] bg-white/10" />
      <div className="pointer-events-none absolute -left-10 bottom-24 h-56 w-56 rounded-[2rem] bg-white/10" />
      <div className="pointer-events-none absolute right-24 top-1/3 h-40 w-40 rounded-3xl bg-[#084ba6]/40" />

      <div className="relative z-0 flex h-full w-full flex-col">
        <button
          type="button"
          onClick={goToNextSlide}
          className="relative mt-8 flex min-h-[200px] w-full flex-1 cursor-pointer items-center justify-center border-0 bg-transparent p-0 px-10 xl:px-14"
          aria-label={translate('showcaseNextSlide')}
        >
          {/* Fixed-size stage: image % positions are relative to this box, not the full panel */}
          <div className="relative mx-auto h-[400px] w-full max-w-[640px] shrink-0">
            {SLIDES.map((slide, index) => (
              <div
                key={slide.titleKey}
                className={`pointer-events-none absolute inset-0 transition-opacity duration-700 ${
                  index === activeSlide ? 'opacity-100' : 'opacity-0'
                }`}
                aria-hidden={index !== activeSlide}
              >
                {slide.images.map((image) => (
                  <ShowcaseImage
                    key={image.src}
                    image={image}
                    alt={translate(image.altKey)}
                  />
                ))}
              </div>
            ))}
          </div>
        </button>

        <div className="relative z-10 flex flex-col items-center px-10 pb-4 pt-4 text-center xl:px-14">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-white/10 p-2 backdrop-blur-sm">
            <img src="/LakuIcon.svg" alt="" className="h-9 w-9" aria-hidden />
          </div>
          <div className="relative min-h-[5.5rem] w-full max-w-xl">
            {SLIDES.map((slide, index) => (
              <div
                key={slide.titleKey}
                className={`absolute inset-0 transition-opacity duration-700 ${
                  index === activeSlide ? 'opacity-100' : 'opacity-0'
                }`}
                aria-hidden={index !== activeSlide}
              >
                <h2 className="text-xl font-bold leading-tight text-white xl:text-2xl">
                  {translate(slide.titleKey)}
                </h2>
                <p className="mt-2 text-sm text-white/80">{translate(slide.subtitleKey)}</p>
              </div>
            ))}
          </div>
        </div>

        <div
          className="flex gap-2 px-10 pb-10 xl:px-14"
          role="tablist"
          aria-label={translate('showcaseCarouselLabel')}
        >
          {SLIDES.map((slide, index) => {
            const isPast = index < activeSlide;
            const isActive = index === activeSlide;
            const width = isPast ? '100%' : isActive ? `${progress}%` : '0%';

            return (
              <button
                key={slide.titleKey}
                type="button"
                role="tab"
                aria-selected={isActive}
                aria-label={translate(slide.titleKey)}
                onClick={() => goToSlide(index)}
                className="h-1 flex-1 cursor-pointer overflow-hidden rounded-full border-0 bg-white/25 p-0"
              >
                <div
                  className="h-full rounded-full bg-white transition-[width] duration-100 ease-linear"
                  style={{ width }}
                />
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
