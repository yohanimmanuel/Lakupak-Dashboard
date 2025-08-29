"use client";

import React, { useEffect, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { XIcon, CheckIcon, ChartBarIcon, ShoppingCartIcon, FileIcon, PackageIcon, RocketIcon, UserIcon, ChartAreaIcon, InstagramIcon, MailIcon, FacebookIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import Head from "next/head";
import { measurePerformance, trackScrollDepth, lazyLoadSection } from "@/utils/performance";

// Performance monitoring hook
const usePerformanceTracking = () => {
  useEffect(() => {
    // Track page load performance
    if (typeof window !== 'undefined') {
      const trackPerformance = () => {
        const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
        if (navigation) {
          const loadTime = navigation.loadEventEnd - navigation.fetchStart;
          console.log(`Landing page load time: ${loadTime}ms`);
          
          // Send to analytics if configured
          if (window.gtag) {
            window.gtag('event', 'page_load_time', {
              custom_parameter: Math.round(loadTime)
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
      event_category: 'Landing Page',
      event_label: label,
      custom_parameter: new Date().toISOString()
    });
  }
  
  // Also log for debugging in development
  if (process.env.NODE_ENV === 'development') {
    console.log(`Conversion tracked: ${action}`, label);
  }
};

// Error boundary component
const ErrorBoundary = ({ children }: { children: React.ReactNode }) => {
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    const handleError = (error: ErrorEvent) => {
      console.error('Landing page error:', error);
      setHasError(true);
      
      // Track error in analytics
      if (window.gtag) {
        window.gtag('event', 'exception', {
          description: error.message,
          fatal: false
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

export default function LandingPage() {
  const router = useRouter();
  const t = useTranslations("landing");
  
  // Use performance tracking
  usePerformanceTracking();
  
  // Track advanced performance metrics and scroll depth
  useEffect(() => {
    measurePerformance();
    const cleanup = trackScrollDepth();
    
    // Lazy load heavy sections
    lazyLoadSection('features', () => {
      console.log('Features section loaded');
    });
    
    lazyLoadSection('socialproof', () => {
      console.log('Social proof section loaded');
    });
    
    return cleanup;
  }, []);
  
  // Enhanced CTA click handlers with conversion tracking
  const handleRegisterClick = () => {
    trackConversion('cta_click', 'register_button');
    router.push("/register");
  };
  
  const handleLearnMoreClick = () => {
    trackConversion('cta_click', 'learn_more_button');
    // Scroll to features section
    document.getElementById('features')?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <ErrorBoundary>
      <div className="min-h-screen bg-white">
      {/* Hero Section */}
      <section id="home" className="pt-10 pb-20 bg-gradient-to-br from-blue-50 via-white to-orange-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-20 items-center">
            {/* Left Content */}
             <div className="space-y-8">
               <div className="space-y-4">
                 {/* Custom colored hero title using array parts */}
                 {(() => {
                   const titleParts = t.raw("hero.titleParts");
                   return (
                     <h1 className="mt-10 text-6xl font-bold text-gray-900 leading-tight animate-fade-in-up">
                       {titleParts[0]}
                       <span className="text-[#0a61d7]">{titleParts[1]}</span>
                       {titleParts[2]}
                       <span className="text-orange-400">{titleParts[3]}</span>
                       {titleParts[4]}
                       <span className="bg-gradient-to-r from-green-400 to-green-600 bg-clip-text text-transparent">{titleParts[5]}</span>
                     </h1>
                   );
                 })()}
                 <p className="text-lg text-gray-600 leading-relaxed max-w-2xl animate-fade-in-up animate-delay-200">
                   {t("hero.subtitle")}
                 </p>
               </div>

              {/* CTA Buttons */}
               <div className="flex flex-col sm:flex-row gap-4">
                 <button
                   onClick={handleRegisterClick}
                   className="bg-[#0a61d7] text-white px-8 py-4 rounded-lg text-lg font-semibold hover:bg-[#084ba6] transition-all duration-200 shadow-lg hover:shadow-xl transform hover:-translate-y-1 animate-fade-in-up"
                   aria-label="Register for Laku-Laku platform"
                 >
                   {t("hero.cta")}
                 </button>
                 <button 
                   onClick={handleLearnMoreClick}
                   className="border-2 border-gray-300 text-gray-700 px-8 py-4 rounded-lg text-lg font-semibold hover:border-orange-500 hover:text-orange-500 transition-all duration-200 animate-fade-in-up animate-delay-500"
                   aria-label="Learn more about Laku-Laku features"
                 >
                   {t("hero.learnmore")}
                 </button>
               </div>

              {/* Social Proof */}
              <div className="flex items-center space-x-6 pt-4">
                <div className="flex items-center space-x-2">
                  <div className="flex text-yellow-400">
                    {[...Array(5)].map((_, i) => (
                      <svg key={i} className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                      </svg>
                    ))}
                  </div>
                  <span className="text-gray-600">{t("hero.socialproof")}</span>
                </div>
              </div>
            </div>

            {/* Right - Product Screenshot */}
            <div className="flex justify-center lg:justify-end animate-fade-in-right animate-delay-300">
              <div className="w-[600px] h-[400px] bg-gray-200 rounded-2xl flex items-center justify-center border-2 border-dashed border-gray-300 hover-lift">
                <div className="text-center">
                  <div className="text-6xl mb-4">📱</div>
                  <p className="text-gray-500 text-lg font-medium">{t("hero.screenshot")}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Pain Points vs Solution Section */}
      <section className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-gray-900 mb-4 animate-fade-in-up">
              {t("painpoints.title")}
            </h2>
            <p className="text-xl text-gray-600 max-w-3xl mx-auto animate-fade-in-up animate-delay-200">
              {t("painpoints.subtitle")}
            </p>
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
      <section id="features" className="py-20 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-gray-900 mb-4 animate-fade-in-up">
              {t("features.title")}
            </h2>
            <p className="text-xl text-gray-600 max-w-3xl mx-auto animate-fade-in-up animate-delay-200">
              {t("features.subtitle")}
            </p>
          </div>

          <div className="grid lg:grid-cols-2 gap-12">
            {/* Distributor Dashboard */}
            <div className="bg-white rounded-2xl p-8 shadow-lg hover:shadow-xl transition-shadow duration-300 animate-fade-in-left hover-lift">
              <div className="flex items-center mb-6">
                <div className="w-16 h-16 bg-blue-100 rounded-2xl flex items-center justify-center mr-4">
                  <span className="text-3xl"> <ChartAreaIcon className="text-blue-500" size={35} /></span>
                </div>
                <div>
                  <h3 className="text-2xl font-bold text-gray-900">{t("features.distributor.title")}</h3>
                  <p className="text-blue-600 font-medium">{t("features.distributor.desc")}</p>
                </div>
              </div>
              <div className="space-y-4 mb-6">
                {[1,2,3].map(i => (
                  <div key={i} className="flex items-center">
                    <div className="w-2 h-2 bg-blue-500 rounded-full mr-3"></div>
                    <span className="text-gray-700">{t(`features.distributor.${i}`)}</span>
                  </div>
                ))}
              </div>
              <div className="w-full h-[300px] bg-gray-200 rounded-xl flex items-center justify-center border-2 border-dashed border-gray-300">
                <div className="text-center">
                  <div className="text-4xl mb-2">🖥️</div>
                  <p className="text-gray-500 font-medium">{t("features.distributor.screenshot")}</p>
                </div>
              </div>
            </div>

            {/* Retailer Marketplace */}
            <div className="bg-white rounded-2xl p-8 shadow-lg hover:shadow-xl transition-shadow duration-300 animate-fade-in-right hover-lift">
              <div className="flex items-center mb-6">
                <div className="w-16 h-16 bg-orange-100 rounded-2xl flex items-center justify-center mr-4">
                  <span className="text-3xl"> <ShoppingCartIcon className="text-orange-500" size={35} /></span>
                </div>
                <div>
                  <h3 className="text-2xl font-bold text-gray-900">{t("features.retailer.title")}</h3>
                  <p className="text-orange-600 font-medium">{t("features.retailer.desc")}</p>
                </div>
              </div>
              <div className="space-y-4 mb-6">
                {[1,2,3].map(i => (
                  <div key={i} className="flex items-center">
                    <div className="w-2 h-2 bg-orange-500 rounded-full mr-3"></div>
                    <span className="text-gray-700">{t(`features.retailer.${i}`)}</span>
                  </div>
                ))}
              </div>
              <div className="w-full h-[300px] bg-gray-200 rounded-xl flex items-center justify-center border-2 border-dashed border-gray-300">
                <div className="text-center">
                  <div className="text-4xl mb-2">📱</div>
                  <p className="text-gray-500 font-medium">{t("features.retailer.screenshot")}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Social Proof Section */}
      <section id="socialproof" className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-gray-900 mb-4 animate-fade-in-up">
              {t("socialproof.title")}
            </h2>
            <p className="text-xl text-gray-600 animate-fade-in-up animate-delay-200">
              {t("socialproof.subtitle")}
            </p>
          </div>

          {/* Distributor Logos */}
           <div className="relative overflow-hidden mb-16">
             <div className="flex animate-scroll">
               {[...Array(12)].map((_, i) => (
                 <div key={i} className="flex-shrink-0 w-24 h-16 bg-gray-200 rounded-lg flex items-center justify-center border-2 border-dashed border-gray-300 mx-8">
                   <span className="text-gray-500 text-sm font-medium">{t("socialproof.logo", { number: i + 1 })}</span>
                 </div>
               ))}
             </div>
           </div>

                     {/* Testimonials */}
           <div className="grid md:grid-cols-2 gap-8">
             {[1,2].map(i => (
               <div key={i} className={`bg-gray-50 border border-gray-200 rounded-2xl p-8 animate-fade-in-${i === 1 ? 'left' : 'right'} hover-lift`}>
                <div className="flex items-center mb-4">
                  <div className={`w-12 h-12 ${i === 1 ? 'bg-blue-100' : 'bg-orange-100'} rounded-full flex items-center justify-center mr-4`}>
                    <span className="text-xl"> <UserIcon className={i === 1 ? 'text-blue-500' : 'text-orange-500'} size={25} /></span>
                  </div>
                  <div>
                    <h4 className="font-semibold text-gray-900">{t(`testimonials.${i}.name`)}</h4>
                    <p className="text-gray-600">{t(`testimonials.${i}.role`)}</p>
                  </div>
                </div>
                <p className="text-gray-700 italic">
                  {t(`testimonials.${i}.text`)}
                </p>
              </div>
            ))}
           </div>
        </div>
      </section>

      {/* How It Works Section */}
      <section className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-gray-900 mb-4 animate-fade-in-up">
              {t("howitworks.title")}
            </h2>
            <p className="text-xl text-gray-600 animate-fade-in-up animate-delay-200">
              {t("howitworks.subtitle")}
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {[1,2,3].map(i => (
              <div key={i} className="text-center animate-fade-in-up" style={{ animationDelay: `${i * 200}ms` }}>
                <div className="relative">
                  <div className="w-20 h-20 bg-[#0a61d7] rounded-full flex items-center justify-center mx-auto mb-6 animate-bounce-in">
                    <span className="text-3xl">{i === 1 ? <FileIcon className="text-white" size={35} /> : i === 2 ? <PackageIcon className="text-white" size={35} /> : <RocketIcon className="text-white" size={35} />}</span>
                  </div>
                </div>
                <div className="bg-gray-50 rounded-full w-8 h-8 flex items-center justify-center mx-auto mb-4">
                  <span className="text-white font-bold text-sm bg-[#0a61d7] rounded-full w-6 h-6 flex items-center justify-center">
                    {i}
                  </span>
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-3">{t(`howitworks.${i}.title`)}</h3>
                <p className="text-gray-600 leading-relaxed">{t(`howitworks.${i}.desc`)}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA Section */}
      <section className="py-30 bg-gradient-to-r from-[#0a61d7] to-[#084ba6]">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-4xl md:text-5xl font-bold text-white mb-6 animate-fade-in-up">
            {t("finalcta.title1")}
            <br />
            {t("finalcta.title2")}
          </h2>
          <p className="text-xl text-blue-100 mb-8 max-w-2xl mx-auto animate-fade-in-up animate-delay-200">
            {t("finalcta.subtitle")}
          </p>
          <button
            onClick={handleRegisterClick}
            className="bg-orange-500 text-white px-12 py-5 rounded-lg text-xl font-bold hover:bg-orange-600 transition-all duration-200 shadow-2xl hover:shadow-orange-500/25 transform hover:-translate-y-1 animate-fade-in-up"
            aria-label="Start free trial with Laku-Laku"
          >
            {t("finalcta.cta")}
          </button>
        </div>
      </section>
    </div>
    </ErrorBoundary>
  );
}
