"use client";
import React, { useRef, useEffect, useState } from "react";
import { BarChart3Icon, ShoppingCartIcon, CreditCardIcon, PackageIcon, SmartphoneIcon, FileTextIcon, XIcon, CheckIcon, ChartAreaIcon } from "lucide-react";
import { useRouter } from "next/navigation";
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
          console.log(`Features page load time: ${loadTime}ms`);
          
          if (window.gtag) {
            window.gtag('event', 'page_load_time', {
              page: 'features',
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
      event_category: 'Features Page',
      event_label: label,
      page: 'features'
    });
  }
  
  if (process.env.NODE_ENV === 'development') {
    console.log(`Features page conversion tracked: ${action}`, label);
  }
};

// Error boundary component
const ErrorBoundary = ({ children }: { children: React.ReactNode }) => {
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    const handleError = (error: ErrorEvent) => {
      console.error('Features page error:', error);
      setHasError(true);
      
      if (window.gtag) {
        window.gtag('event', 'exception', {
          description: error.message,
          fatal: false,
          page: 'features'
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

export default function FeaturesPage() {
  const router = useRouter();
  const t = useTranslations("features");
  
  // Use performance tracking
  usePerformanceTracking();
  
  // Track advanced performance metrics and scroll depth
  useEffect(() => {
    measurePerformance();
    const cleanup = trackScrollDepth();
    
    // Lazy load heavy sections
    lazyLoadSection('distributor-features', () => {
      console.log('Distributor features section loaded');
    });
    
    lazyLoadSection('retailer-features', () => {
      console.log('Retailer features section loaded');
    });
    
    return cleanup;
  }, []);

  // Enhanced CTA click handler with conversion tracking
  const handlePricingClick = () => {
    trackConversion('cta_click', 'view_pricing');
    router.push("/landing/pricing");
  };
  const distributorFeaturesRaw = t.raw("distributorFeatures");
  const retailerFeaturesRaw = t.raw("retailerFeatures");

  const distributorIcons = [
    <BarChart3Icon className="text-blue-500" size={45} />,
    <CreditCardIcon className="text-blue-500" size={45} />,
    <FileTextIcon className="text-blue-500" size={45} />
  ];
  const retailerIcons = [
    <ShoppingCartIcon className="text-orange-500" size={45} />,
    <PackageIcon className="text-orange-500" size={45} />,
    <SmartphoneIcon className="text-orange-500" size={45} />
  ];

  const distributorFeatures = distributorFeaturesRaw.map((feature: any, idx: number) => ({
    ...feature,
    icon: distributorIcons[idx]
  }));
  const retailerFeatures = retailerFeaturesRaw.map((feature: any, idx: number) => ({
    ...feature,
    icon: retailerIcons[idx]
  }));

  function StickyFeatureSection({
    features,
    stickyTitle,
    stickySubtitle,
    color,
  }: {
    features: typeof distributorFeatures;
    stickyTitle: string;
    stickySubtitle: string;
    color: string;
  }) {
    const [activeIdx, setActiveIdx] = useState(0);
    const descRefs = useRef<(HTMLDivElement | null)[]>([]);
    const sectionRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
      const handleScroll = () => {
        let found = 0;
        descRefs.current.forEach((ref, idx) => {
          if (ref) {
            const rect = ref.getBoundingClientRect();
            if (rect.top < window.innerHeight / 2) {
              found = idx;
            }
          }
        });
        setActiveIdx(found);
      };
      window.addEventListener("scroll", handleScroll);
      return () => window.removeEventListener("scroll", handleScroll);
    }, []);

    // Height of sticky block (adjust if needed)
    const stickyOffset = 140; // px

    return (
      <div ref={sectionRef} className="relative max-w-6xl mx-auto mb-32 animate-fade-in">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
          {/* Sticky Block: Title, Subtitle, and Image together */}
          <div className="hidden md:flex flex-col justify-start">
            <div className="sticky" style={{ top: `${stickyOffset}px` }}>
              <div className="bg-white/95 rounded-2xl p-2 flex flex-col shadow-none animate-fade-in-up animation-delay-100">
                <h2 className={`text-4xl font-bold mb-2 ${color}`}>{stickyTitle}</h2>
                <p className="text-md text-gray-500 mb-6 animate-fade-in-up animation-delay-200">{stickySubtitle}</p>
                <div className="relative w-[500px] h-[300px]">
                  {features.map((feature: any, idx: number) => (
                    <div
                      key={idx}
                      className={`absolute inset-0 flex items-center justify-center transition-opacity duration-700 ${activeIdx === idx ? 'opacity-100 z-10' : 'opacity-0 z-0'}`}
                    >
                      <div className="w-full h-full bg-gray-200 rounded-2xl flex items-center justify-center border-2 border-dashed border-gray-300 text-gray-500 text-lg font-medium shadow-xl animate-fade-in-up animation-delay-300">
                        {feature.image}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
          {/* Feature Descriptions */}
          <div className="flex flex-col space-y-100 mt-20">
            {features.map((feature: any, idx: number) => (
              <div
                key={idx}
                ref={(el: HTMLDivElement | null) => {
                  descRefs.current[idx] = el;
                }}
                className={`transition-opacity duration-700 ${activeIdx === idx ? 'opacity-100' : 'opacity-40'} flex flex-col justify-center min-h-[400px] animate-fade-in-up animation-delay-400`}
              >
                <span className={`inline-block mb-2 px-3 py-1 text-xs font-semibold rounded-full ${color === 'text-blue-700' ? 'bg-blue-50 text-blue-600' : 'bg-orange-50 text-orange-600'}`}>{feature.badge}</span>
                <div className="flex items-center mb-2">
                  <span className="mr-3">{feature.icon}</span>
                  <h3 className="text-3xl font-bold text-gray-900">{feature.title}</h3>
                </div>
                <p className="text-gray-600 mb-3 text-lg animate-fade-in-up animation-delay-500">{feature.subtitle}</p>
                <ul className="list-disc pl-5 space-y-2 text-gray-700 text-base animate-fade-in-up animation-delay-600">
                  {feature.points.map((point: any, i: number) => (
                    <li key={i}>{point}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <div className="min-h-screen bg-white animate-fade-in">
      <div className="w-full">
        {/* Combined Header Section */}
        <div className="flex flex-col items-center justify-center text-center py-20 gap-6 animate-fade-in-up">
          <h1 className="text-5xl font-bold text-gray-900 mb-2 animate-fade-in-up animation-delay-100">{t("header.title")}</h1>
          <p className="text-xl text-gray-600 max-w-2xl mx-auto animate-fade-in-up animation-delay-200 mb-2">{t("header.subtitle")}</p>
          <div className="flex items-center justify-center gap-6 mb-2 animate-fade-in-up animation-delay-300">
            <button className="bg-[#0a61d7] text-white px-8 py-3 rounded-lg text-lg font-semibold hover:bg-[#084ba6] transition-all duration-200 shadow-lg hover:shadow-xl animate-fade-in-up animation-delay-400 flex items-center gap-2">
              <img src="/whatsapp.svg" alt="WhatsApp" className="w-6 h-6 mr-2" />
              <span>{t("header.cta1")}</span>
            </button>
            <button 
              onClick={() => {
                trackConversion('cta_click', 'header_register');
                router.push("/register");
              }}
              className="bg-white text-[#0a61d7] border border-[#0a61d7] px-8 py-3 rounded-lg text-lg font-semibold hover:bg-[#e6f0fa] transition-all duration-200 animate-fade-in-up animation-delay-500"
              aria-label="Register for Laku-Laku">
              {t("header.cta2")}
            </button>
          </div>
          <div className="flex flex-col items-center mb-2 animate-fade-in-up animation-delay-600">
            <div className="flex items-center space-x-2 mb-2">
              {[...Array(5)].map((_, i) => (
                <svg key={i} className="w-6 h-6 text-yellow-400 animate-fade-in-up" style={{animationDelay: `${700 + i * 50}ms`}} fill="currentColor" viewBox="0 0 20 20">
                  <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                </svg>
              ))}
            </div>
            <span className="text-gray-600 text-lg mb-2 animate-fade-in-up animation-delay-800">{t("header.socialproof")}</span>
          </div>
          {/* Video Placeholder */}
          <div className="w-[1200px] h-[600px] bg-gray-200 rounded-2xl flex flex-col items-center justify-center border-2 border-dashed border-gray-300 mb-2 animate-fade-in-up animation-delay-900">
            <svg className="w-16 h-16 text-gray-400 mb-2" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <polygon points="9.5,7.5 16.5,12 9.5,16.5" fill="currentColor" />
              <rect x="2" y="2" width="20" height="20" rx="4" stroke="currentColor" strokeWidth="2" fill="none" />
            </svg>
            <span className="text-gray-500 text-lg font-medium">{t("header.video")}</span>
          </div>
        </div>

        {/* Pain Points vs Solution Section */}
        <section className="py-20 bg-white">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-16">
                <h2 className="text-4xl font-bold text-gray-900 mb-4 animate-fade-in-up">{t("painpoints.title")}</h2>
                <p className="text-xl text-gray-600 max-w-3xl mx-auto animate-fade-in-up animate-delay-200">{t("painpoints.subtitle")}</p>
            </div>

            <div className="grid md:grid-cols-2 gap-12">
                {/* Without Laku-Laku */}
                <div className="bg-red-50 rounded-2xl p-8 border border-red-100 animate-fade-in-left hover-lift">
                <div className="flex items-center mb-6">
                    <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mr-4">
                    <span className="text-2xl"> <XIcon className="text-red-500" size={35} /></span>
                    </div>
                    <h3 className="text-2xl font-bold text-red-800">{t("painpoints.without.title")}</h3>
                </div>
                <ul className="space-y-4">
                    {[1,2,3,4].map(i => (
                      <li key={i} className="flex items-start">
                        <span className="text-red-500 mr-3 mt-1">•</span>
                        <span className="text-red-700">{t(`painpoints.without.${i}`)}</span>
                      </li>
                    ))}
                </ul>
                </div>

                {/* With Laku-Laku */}
                <div className="bg-green-50 rounded-2xl p-8 border border-green-100 animate-fade-in-right hover-lift">
                <div className="flex items-center mb-6">
                    <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mr-4">
                    <span className="text-2xl"> <CheckIcon className="text-green-500" size={35} /></span>
                    </div>
                    <h3 className="text-2xl font-bold text-green-800">{t("painpoints.with.title")}</h3>
                </div>
                <ul className="space-y-4">
                    {[1,2,3,4].map(i => (
                      <li key={i} className="flex items-start">
                        <span className="text-green-500 mr-3 mt-1">•</span>
                        <span className="text-green-700">{t(`painpoints.with.${i}`)}</span>
                      </li>
                    ))}
                </ul>
                </div>
            </div>
            </div>
      </section>

      
      {/* Features Section */}
      <section className="py-20 bg-gray-50 mb-20">
        <div className="w-full flex flex-col items-center">
          <div className="text-center mb-16 w-full">
            <h2 className="text-4xl font-bold text-gray-900 mb-4 animate-fade-in-up">{t("platforms.title")}</h2>
            <p className="text-xl text-gray-600 max-w-3xl mx-auto animate-fade-in-up animate-delay-200">{t("platforms.subtitle")}</p>
          </div>

          <div className="flex flex-col lg:flex-row gap-8 justify-center">
                         {/* Distributor Dashboard */}
             <div className="bg-white rounded-2xl p-8 shadow-lg hover:shadow-xl transition-shadow duration-300 animate-fade-in-left hover-lift w-[600px]" style={{animationDelay: '100ms'}}>
              <div className="flex items-center mb-6">
                <div className="w-16 h-16 bg-blue-100 rounded-2xl flex items-center justify-center mr-4">
                  <span className="text-3xl"> <ChartAreaIcon className="text-blue-500" size={35} /></span>
                </div>
                <div>
                  <h3 className="text-2xl font-bold text-gray-900">{t("platforms.distributor.title")}</h3>
                  <p className="text-blue-600 font-medium">{t("platforms.distributor.desc")}</p>
                </div>
              </div>
              
              <div className="space-y-4 mb-6">
                {[1,2,3,4,5].map(i => (
                  <div key={i} className="flex items-center">
                    <div className="w-2 h-2 bg-blue-500 rounded-full mr-3"></div>
                    <span className="text-gray-700">{t(`platforms.distributor.${i}`)}</span>
                  </div>
                ))}
              </div>

              <div className="w-full h-[350px] bg-gray-200 rounded-xl flex items-center justify-center border-2 border-dashed border-gray-300">
                <div className="text-center">
                  <div className="text-4xl mb-2">🖥️</div>
                  <p className="text-gray-500 font-medium">{t("platforms.distributor.screenshot")}</p>
                </div>
              </div>
            </div>

            {/* Retailer Marketplace */}
             <div className="bg-white rounded-2xl p-8 shadow-lg hover:shadow-xl transition-shadow duration-300 animate-fade-in-right hover-lift w-[600px]" style={{animationDelay: '200ms'}}>
              <div className="flex items-center mb-6">
                <div className="w-16 h-16 bg-orange-100 rounded-2xl flex items-center justify-center mr-4">
                  <span className="text-3xl"> <ShoppingCartIcon className="text-orange-500" size={35} /></span>
                </div>
                <div>
                  <h3 className="text-2xl font-bold text-gray-900">{t("platforms.retailer.title")}</h3>
                  <p className="text-orange-600 font-medium">{t("platforms.retailer.desc")}</p>
                </div>
              </div>
              
              <div className="space-y-4 mb-6">
                {[1,2,3,4,5].map(i => (
                  <div key={i} className="flex items-center">
                    <div className="w-2 h-2 bg-orange-500 rounded-full mr-3"></div>
                    <span className="text-gray-700">{t(`platforms.retailer.${i}`)}</span>
                  </div>
                ))}
              </div>

              <div className="w-full h-[350px] bg-gray-200 rounded-xl flex items-center justify-center border-2 border-dashed border-gray-300">
                <div className="text-center">
                  <div className="text-4xl mb-2">📱</div>
                  <p className="text-gray-500 font-medium">{t("platforms.retailer.screenshot")}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

        
        {/* Distributor Sticky Section */}
        <div id="distributor-features">
          <StickyFeatureSection
          features={distributorFeatures}
          stickyTitle={t("sticky.distributor.title")}
          stickySubtitle={t("sticky.distributor.subtitle")}
          color="text-blue-700"
        />
        </div>
        {/* Retailer Sticky Section */}
        <div id="retailer-features">
          <StickyFeatureSection
          features={retailerFeatures}
          stickyTitle={t("sticky.retailer.title")}
          stickySubtitle={t("sticky.retailer.subtitle")}
          color="text-orange-700"
        />
        </div>
        {/* CTA Section with Product Image Placeholder */}
        <section className="py-20 bg-gradient-to-r from-[#0a61d7] to-[#084ba6] mt-20 w-full">
          <div className="w-full flex flex-col items-center justify-center px-0 text-center">
            <h2 className="text-4xl md:text-5xl font-bold text-white mb-6 animate-fade-in-up">{t("cta.title")}</h2>
            <p className="text-xl text-blue-100 mb-8 max-w-2xl mx-auto animate-fade-in-up animate-delay-200">{t("cta.subtitle")}</p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center animate-fade-in-up animate-delay-400">
              <button
                onClick={() => {
                  trackConversion('cta_click', 'bottom_register');
                  router.push("/register");
                }}
                className="bg-orange-500 text-white px-12 py-5 rounded-lg text-xl font-bold hover:bg-orange-600 transition-all duration-300 shadow-2xl hover:shadow-orange-500/25 transform hover:-translate-y-2 hover:scale-105 animate-fade-in-up animate-delay-500"
                aria-label="Start free trial with Laku-Laku"
              >
                {t("cta.button")}
              </button>
            </div>
            <div className="flex justify-center gap-6 mt-15 w-full">
              <div className="flex flex-col items-center">
                <div className="w-[690px] h-[450px] bg-gray-200 rounded-2xl flex items-center justify-center border-2 border-dashed border-gray-300 mx-auto">
                  <span className="text-gray-500 text-lg font-medium">[Dashboard Screenshot]</span>
                </div>
              </div>
              <div className="flex flex-col items-center">
                <div className="w-[500px] h-[450px] bg-gray-200 rounded-2xl flex items-center justify-center border-2 border-dashed border-gray-300 mx-auto">
                  <span className="text-gray-500 text-lg font-medium">[Mobile App Screenshot]</span>
                </div>
              </div>
            </div>
            <div className="flex justify-center gap-6 mt-6 w-full">
              <div className="flex flex-col items-center">
                <div className="w-[389px] h-[250px] bg-gray-200 rounded-2xl flex items-center justify-center border-2 border-dashed border-gray-300 mx-auto">
                  <span className="text-gray-500 text-lg font-medium">[Dashboard Screenshot]</span>
                </div>
              </div>
              <div className="flex flex-col items-center">
                <div className="w-[389px] h-[250px] bg-gray-200 rounded-2xl flex items-center justify-center border-2 border-dashed border-gray-300 mx-auto">
                  <span className="text-gray-500 text-lg font-medium">[Marketplace Screenshot]</span>
                </div>
              </div>
              <div className="flex flex-col items-center">
                <div className="w-[389px] h-[250px] bg-gray-200 rounded-2xl flex items-center justify-center border-2 border-dashed border-gray-300 mx-auto">
                  <span className="text-gray-500 text-lg font-medium">[Mobile App Screenshot]</span>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
      </div>
    </ErrorBoundary>
  );
}
