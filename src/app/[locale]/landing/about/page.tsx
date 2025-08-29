"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { BookOpenIcon, SparklesIcon, ArrowLeftIcon, ArrowRightIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { measurePerformance, trackScrollDepth, lazyLoadSection } from "@/utils/performance";

// Performance monitoring hook
const usePerformanceTracking = () => {
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const trackPerformance = () => {
        const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
        if (navigation) {
          const loadTime = navigation.loadEventEnd - navigation.fetchStart;
          console.log(`About page load time: ${loadTime}ms`);
          
          if (window.gtag) {
            window.gtag('event', 'page_load_time', {
              page: 'about',
              value: Math.round(loadTime)
            });
          }
        }
      };

      if (document.readyState === 'complete') {
        trackPerformance();
      } else {
        window.addEventListener('load', trackPerformance);
      }
    }
  }, []);
};

// Conversion tracking utility
const trackConversion = (action: string, label?: string) => {
  if (typeof window !== 'undefined' && window.gtag) {
    window.gtag('event', action, {
      event_category: 'About Page',
      event_label: label,
      page: 'about'
    });
  }
  
  if (process.env.NODE_ENV === 'development') {
    console.log(`About page conversion tracked: ${action}`, label);
  }
};

// Error boundary component
const ErrorBoundary = ({ children }: { children: React.ReactNode }) => {
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    const handleError = (error: ErrorEvent) => {
      console.error('About page error:', error);
      setHasError(true);
      
      if (window.gtag) {
        window.gtag('event', 'exception', {
          description: error.message,
          fatal: false,
          page: 'about'
        });
      }
    };

    window.addEventListener('error', handleError);
    return () => window.removeEventListener('error', handleError);
  }, []);

  if (hasError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">Something went wrong</h2>
          <p className="text-gray-600 mb-4">We're experiencing technical difficulties. Please refresh the page.</p>
          <button 
            onClick={() => window.location.reload()} 
            className="bg-[#0a61d7] text-white px-6 py-2 rounded-lg hover:bg-[#084ba6] transition-colors"
          >
            Refresh Page
          </button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};

export default function AboutPage() {
  const router = useRouter();
  const t = useTranslations("about");
  const [activeSlide, setActiveSlide] = React.useState(0);
  
  // Use performance tracking
  usePerformanceTracking();
  
  // Track advanced performance metrics and scroll depth
  useEffect(() => {
    measurePerformance();
    const cleanup = trackScrollDepth();
    
    // Lazy load heavy sections
    lazyLoadSection('story', () => {
      console.log('Story section loaded');
    });
    
    lazyLoadSection('carousel', () => {
      console.log('Carousel section loaded');
    });
    
    return cleanup;
  }, []);

  // Enhanced CTA click handler with conversion tracking
  const handleSolutionsClick = () => {
    trackConversion('cta_click', 'view_solutions');
    router.push("/landing/solutions");
  };
  const slides = [
    {
      title: t("carousel.1.title"),
      content: (
        <p className="text-gray-800 text-lg">{t("carousel.1.content")}</p>
      ),
    },
    {
      title: t("carousel.2.title"),
      content: (
        <p className="text-gray-800 text-lg">{t("carousel.2.content")}</p>
      ),
    },
    {
      title: t("carousel.3.title"),
      content: (
        <div className="flex flex-col gap-2 text-gray-800 text-lg font-semibold">
          <div>{t("carousel.3.1")}</div>
          <div>{t("carousel.3.2")}</div>
          <div>{t("carousel.3.3")}</div>
        </div>
      ),
    },
    {
      title: t("carousel.4.title"),
      content: (
        <p className="text-gray-800 text-lg">{t("carousel.4.content")}</p>
      ),
    },
  ];
  return (
    <ErrorBoundary>
      <div className="min-h-screen bg-white">
        {/* Hero Section */}
      <section className="relative pt-16 pb-20 bg-gradient-to-br from-blue-50 via-white to-orange-50 overflow-hidden animate-fade-in">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center relative z-10">
          <div className="flex flex-col items-center mb-8">
            <span className="inline-flex items-center justify-center w-16 h-16 bg-blue-100 rounded-full mb-4 animate-scale-in" style={{ animationDelay: '0.1s' }}>
              <BookOpenIcon className="text-[#0a61d7] w-8 h-8" />
            </span>
            <h1 className="text-5xl font-bold text-gray-900 mb-4 animate-fade-in-up" style={{ animationDelay: '0.2s' }}>
              {t("hero.title")}
            </h1>
            <p className="text-xl text-gray-600 max-w-2xl mx-auto animate-fade-in-up animate-delay-200">
              {t("hero.subtitle")}
            </p>
          </div>
        </div>
        {/* Optional background illustration */}
        <div className="absolute inset-0 pointer-events-none">
          <svg width="100%" height="100%" viewBox="0 0 1440 320" fill="none" xmlns="http://www.w3.org/2000/svg" className="absolute bottom-0 left-0 w-full h-64 opacity-20">
            <path fill="#0a61d7" fillOpacity="0.1" d="M0,160L60,170.7C120,181,240,203,360,197.3C480,192,600,160,720,133.3C840,107,960,85,1080,101.3C1200,117,1320,171,1380,197.3L1440,224L1440,320L1380,320C1320,320,1200,320,1080,320C960,320,840,320,720,320C600,320,480,320,360,320C240,320,120,320,60,320L0,320Z" />
          </svg>
        </div>
      </section>

      {/* Story Section */}
      <section id="story" className="py-16 bg-white">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 text-lg text-gray-800 space-y-8">
          {[
            t.raw("story.1"),
            t.raw("story.2"),
            t.raw("story.3"),
            t.raw("story.4"),
            t.raw("story.5")
          ].map((text, idx) => (
            <p key={idx} className="animate-fade-in-up" style={{ animationDelay: `${0.1 + idx * 0.1}s` }} dangerouslySetInnerHTML={{ __html: text }} />
          ))}
          <blockquote className="border-l-4 border-blue-400 pl-4 italic text-gray-700 bg-blue-50 py-2 rounded animate-fade-in-up" style={{ animationDelay: '0.5s' }}>
            {t.raw("story.vision")}
          </blockquote>
          {[
            t.raw("story.6"),
            t.raw("story.7"),
            t.raw("story.8"),
            t.raw("story.9")
          ].map((text, idx) => (
            <p key={idx+4} className="animate-fade-in-up" style={{ animationDelay: `${0.6 + idx * 0.1}s` }} dangerouslySetInnerHTML={{ __html: text }} />
          ))}
          <blockquote className="border-l-4 border-orange-400 pl-4 italic text-gray-700 bg-orange-50 py-2 rounded animate-fade-in-up" style={{ animationDelay: '1.1s' }}>
            {t.raw("story.mission")}
          </blockquote>
          <p className="animate-fade-in-up" style={{ animationDelay: '1.2s' }}>
            {t("story.10")}
          </p>
          <p className="text-gray-500 text-base animate-fade-in-up" style={{ animationDelay: '1.3s' }}>{t("story.end")}</p>
        </div>
      </section>

      {/* Mission, Vision, Belief Section as Carousel */}
      <section id="carousel" className="py-12 bg-white">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-center relative w-full">
            {/* Left Arrow */}
            <button
              className="bg-white rounded-full shadow p-2 hover:bg-blue-50 transition disabled:opacity-30 z-10 mr-10"
              onClick={() => setActiveSlide((prev) => (prev === 0 ? slides.length - 1 : prev - 1))}
              aria-label="Previous"
              disabled={slides.length <= 1}
              type="button"
              style={{ minWidth: 44 }}
            >
              <ArrowLeftIcon className="w-6 h-6 text-blue-500" />
            </button>
            {/* Slide Row */}
            <div className="w-full flex justify-center overflow-hidden mb-2" style={{height: 'min-content'}}>
              <div
                className="flex transition-transform duration-500 ease-in-out"
                style={{ transform: `translateX(-${activeSlide * 100}%)`, width: `${slides.length * 100}%` }}
              >
                {slides.map((slide, idx) => (
                  <div
                    key={slide.title}
                    className="bg-white rounded-2xl shadow-sm px-8 py-10 border border-gray-100 flex-shrink-0 w-full"
                  >
                    <h2 className="text-2xl font-bold text-blue-900 mb-4 text-center">{slide.title}</h2>
                    <div className="text-center">{slide.content}</div>
                  </div>
                ))}
              </div>
            </div>
            {/* Right Arrow */}
            <button
              className="bg-white rounded-full shadow p-2 hover:bg-blue-50 transition disabled:opacity-30 z-10 ml-10"
              onClick={() => setActiveSlide((prev) => (prev === slides.length - 1 ? 0 : prev + 1))}
              aria-label="Next"
              disabled={slides.length <= 1}
              type="button"
              style={{ minWidth: 44 }}
            >
              <ArrowRightIcon className="w-6 h-6 text-blue-500" />
            </button>
          </div>
          {/* Dots Indicator */}
          <div className="flex justify-center mt-6 gap-2 animate-fade-in-up" style={{ animationDelay: '0.3s' }}>
            {slides.map((_, idx) => (
              <span
                key={idx}
                className={`inline-block w-3 h-3 rounded-full ${activeSlide === idx ? 'bg-blue-500' : 'bg-gray-300'}`}
              />
            ))}
          </div>
        </div>
      </section>

      {/* Call to Action Section */}
      <section className="py-16 bg-gradient-to-r from-[#0a61d7] to-[#084ba6] animate-fade-in-up">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <span className="inline-flex items-center justify-center w-12 h-12 bg-orange-100 rounded-full mb-4 animate-scale-in" style={{ animationDelay: '0.1s' }}>
            <SparklesIcon className="text-orange-500 w-6 h-6" />
          </span>
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-4 animate-fade-in-up" style={{ animationDelay: '0.2s' }}>
            {t("cta.title")}
          </h2>
          <p className="text-lg text-blue-100 mb-8 max-w-xl mx-auto animate-fade-in-up animate-delay-200">
            {t("cta.subtitle")}
          </p>
          <button
            onClick={handleSolutionsClick}
            className="bg-orange-500 text-white px-10 py-4 rounded-lg text-lg font-bold hover:bg-orange-600 transition-all duration-200 shadow-xl hover:shadow-orange-500/25 transform hover:-translate-y-1 animate-fade-in-up"
            style={{ animationDelay: '0.3s' }}
            aria-label="View our solutions"
          >
            {t("cta.button")}
          </button>
        </div>
      </section>
      </div>
    </ErrorBoundary>
  );
}
