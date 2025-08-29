"use client";

import React, { useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { UserIcon, StarIcon, CheckCircleIcon, ShoppingCartIcon, BarChart2Icon, FileTextIcon, TrendingUpIcon, GiftIcon, TruckIcon, CreditCardIcon, ClockIcon, StoreIcon } from "lucide-react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { usePagePerformanceTracking, createTrackConversion, createErrorBoundary } from '@/utils/landing-enhancements';

const ErrorBoundary = createErrorBoundary('Solutions');

export default function SolutionsPage() {
  const router = useRouter();
  const t = useTranslations("solutions");
  
  // Use performance tracking
  usePagePerformanceTracking('Solutions');
  
  // Create conversion tracker
  const trackConversion = createTrackConversion('Solutions');
  // --- Testimonial auto-scroll logic ---
  const testimonials = [
    { name: t("testimonials.1.name"), role: t("testimonials.1.role"), color: "blue", review: t("testimonials.1.text") },
    { name: t("testimonials.2.name"), role: t("testimonials.2.role"), color: "orange", review: t("testimonials.2.text") },
    { name: t("testimonials.3.name"), role: t("testimonials.3.role"), color: "blue", review: t("testimonials.3.text") },
    { name: t("testimonials.4.name"), role: t("testimonials.4.role"), color: "orange", review: t("testimonials.4.text") },
    { name: t("testimonials.5.name"), role: t("testimonials.5.role"), color: "blue", review: t("testimonials.5.text") },
    { name: t("testimonials.6.name"), role: t("testimonials.6.role"), color: "orange", review: t("testimonials.6.text") },
  ];
  const scrollRef = useRef<HTMLDivElement>(null);
  const [repeatCount, setRepeatCount] = React.useState(2);

  // Dynamically repeat testimonials so scroll area is at least 2x container width
  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;
    const card = container.querySelector('.testimonial-card');
    if (!card) return;
    const cardWidth = (card as HTMLElement).offsetWidth + 32; // 32px gap
    const containerWidth = container.offsetWidth;
    const minContentWidth = containerWidth * 2;
    const needed = Math.ceil(minContentWidth / (cardWidth * testimonials.length));
    setRepeatCount(Math.max(2, needed));
  }, [testimonials.length]);

  // Auto-scroll and seamless loop
  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;
    let frame: number;
    let scrollAmount = 0.5; // px per frame
    const card = container.querySelector('.testimonial-card');
    if (!card) return;
    const cardWidth = (card as HTMLElement).offsetWidth + 32;
    const totalWidth = cardWidth * testimonials.length * repeatCount;
    function step() {
      if (!container) return;
      container.scrollLeft += scrollAmount;
      // Loop: if at end of first set, reset to start
      if (container.scrollLeft >= (cardWidth * testimonials.length)) {
        container.scrollLeft = 0;
      }
      frame = requestAnimationFrame(step);
    }
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [repeatCount, testimonials.length]);

  return (
    <ErrorBoundary>
      <div className="min-h-screen bg-white">
      {/* Hero Section */}
      <section className="relative pt-16 pb-24 bg-gradient-to-br from-blue-50 via-white to-orange-50 overflow-hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          <div className="text-center mb-12">
            <h1 className="text-5xl font-bold text-gray-900 mb-4 animate-fade-in-up">
              {t("hero.title")}
            </h1>
            <p className="text-xl text-gray-600 max-w-2xl mx-auto animate-fade-in-up animate-delay-200">
              {t("hero.subtitle")}
            </p>
            <button
              onClick={() => router.push("/register")}
              className="mt-8 bg-[#0a61d7] text-white px-10 py-4 rounded-lg text-lg font-semibold hover:bg-[#084ba6] transition-all duration-200 shadow-lg hover:shadow-xl animate-fade-in-up animate-delay-400"
            >
              {t("hero.cta")}
            </button>
          </div>
          {/* Image Showcase with Decorations - relative wrapper */}
          <div className="flex justify-center mb-16 relative">
            {/* Floating Badges OUTSIDE the image showcase */}
            {/* Left Badge Group */}
            <div className="absolute left-0 top-40 z-30 pointer-events-none animate-fade-in-up animate-delay-200">
              <div className="flex flex-col items-start">
                <div className="bg-white px-5 py-2 rounded-full shadow-lg text-sm font-semibold text-[#0a61d7] border border-blue-100 mb-2 pointer-events-auto animate-fade-in-up animate-delay-300">
                  {t("badges.left.main")}
                </div>
                {/* Left Badge Subtext with colored number */}
                <div className="bg-white px-5 py-2 rounded-full shadow text-xs font-medium text-gray-700 border border-blue-100 mt-2 pointer-events-auto animate-fade-in-up animate-delay-400">
                  {(() => {
                    const sub = t.raw("badges.left.sub");
                    return <>{sub[0]}<span className="text-[#0a61d7] font-bold">{sub[1]}</span>{sub[2]}</>;
                  })()}
                </div>
              </div>
            </div>
            {/* Right Badge Group */}
            <div className="absolute right-0 top-60 z-30 pointer-events-none animate-fade-in-up animate-delay-400">
              <div className="flex flex-col items-end">
                <div className="bg-white px-5 py-2 rounded-full shadow-lg text-sm font-semibold text-orange-600 border border-orange-100 mb-2 pointer-events-auto animate-fade-in-up animate-delay-500">
                  {t("badges.right.main")}
                </div>
                {/* Right Badge Subtext with colored number */}
                <div className="bg-white px-5 py-2 rounded-full shadow text-xs font-medium text-gray-700 border border-orange-100 mt-2 pointer-events-auto animate-fade-in-up animate-delay-600">
                  {(() => {
                    const sub = t.raw("badges.right.sub");
                    return <>{sub[0]}<span className="text-green-500 font-bold">{sub[1]}</span>{sub[2]}</>;
                  })()}
                </div>
              </div>
            </div>
            {/* Image Showcase */}
            <div className="w-full max-w-5xl aspect-[2/1] bg-white rounded-2xl shadow-sm flex items-center justify-center relative overflow-hidden animate-fade-in-up animate-delay-100">
              {/* Left Image */}
              <div className="relative w-1/2 h-full animate-fade-in-up animate-delay-300">
                <Image
                  src="/femaleworkerwarehouse.png"
                  alt="Female Worker Warehouse"
                  fill
                  quality={100}
                  style={{ objectFit: "cover", borderTopLeftRadius: '1rem', borderBottomLeftRadius: '1rem' }}
                  className="object-cover"
                  sizes="(min-width:1280px) 900px, (min-width:1024px) 700px, 100vw"
                  priority
                />
              </div>
              {/* Right Image */}
              <div className="relative w-1/2 h-full animate-fade-in-up animate-delay-400">
                <Image
                  src="/deliveryman.png"
                  alt="Ecommerce Delivery Man"
                  fill
                  quality={100}
                  style={{ objectFit: "cover", borderTopRightRadius: '1rem', borderBottomRightRadius: '1rem' }}
                  className="object-cover"
                  sizes="(min-width:1280px) 900px, (min-width:1024px) 700px, 100vw"
                  priority
                />
              </div>
            </div>
          </div>
        </div>
        {/* Background Illustration */}
        <div className="absolute inset-0 pointer-events-none">
          <svg width="100%" height="100%" viewBox="0 0 1440 320" fill="none" xmlns="http://www.w3.org/2000/svg" className="absolute bottom-0 left-0 w-full h-64 opacity-30">
            <path fill="#0a61d7" fillOpacity="0.1" d="M0,160L60,170.7C120,181,240,203,360,197.3C480,192,600,160,720,133.3C840,107,960,85,1080,101.3C1200,117,1320,171,1380,197.3L1440,224L1440,320L1380,320C1320,320,1200,320,1080,320C960,320,840,320,720,320C600,320,480,320,360,320C240,320,120,320,60,320L0,320Z" />
          </svg>
        </div>
      </section>

      {/* Two-Column Section */}
      <section className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-14">
            <h2 className="text-4xl font-bold text-gray-900 mb-4 animate-fade-in-up">
              {t("twocol.title")}
            </h2>
            <p className="text-xl text-gray-600 max-w-2xl mx-auto animate-fade-in-up animate-delay-200">
              {t("twocol.subtitle")}
            </p>
          </div>
          <div className="grid md:grid-cols-2 gap-12">
            {/* Left Column - Distributors */}
            <div className="bg-blue-50 rounded-2xl p-10 border border-blue-100 shadow-md animate-fade-in-left hover-lift">
              <h2 className="text-2xl font-bold text-blue-800 mb-6">
                {t("twocol.distributor.title")}
              </h2>
              <ul className="space-y-5 text-lg">
                <li className="flex items-start"><CheckCircleIcon className="text-green-400 mr-3 mt-1" size={28} /><span className="text-gray-800"><b>{t("twocol.distributor.1.label")}</b>: {t("twocol.distributor.1.desc")}</span></li>
                <li className="flex items-start"><BarChart2Icon className="text-green-400 mr-3 mt-1" size={24} /><span className="text-gray-800"><b>{t("twocol.distributor.2.label")}</b>: {t("twocol.distributor.2.desc")}</span></li>
                <li className="flex items-start"><FileTextIcon className="text-green-400 mr-3 mt-1" size={24} /><span className="text-gray-800"><b>{t("twocol.distributor.3.label")}</b>: {t("twocol.distributor.3.desc")}</span></li>
                <li className="flex items-start"><TrendingUpIcon className="text-green-400 mr-3 mt-1" size={24} /><span className="text-gray-800"><b>{t("twocol.distributor.4.label")}</b>: {t("twocol.distributor.4.desc")}</span></li>
                <li className="flex items-start"><GiftIcon className="text-green-400 mr-3 mt-1" size={24} /><span className="text-gray-800"><b>{t("twocol.distributor.5.label")}</b>: {t("twocol.distributor.5.desc")}</span></li>
              </ul>
            </div>
            {/* Right Column - Retailers */}
            <div className="bg-orange-50 rounded-2xl p-10 border border-orange-100 shadow-md animate-fade-in-right hover-lift">
              <h2 className="text-2xl font-bold text-orange-800 mb-6">
                {t("twocol.retailer.title")}
              </h2>
              <ul className="space-y-5 text-lg">
                <li className="flex items-start"><ShoppingCartIcon className="text-blue-400 mr-3 mt-1" size={24} /><span className="text-gray-800"><b>{t("twocol.retailer.1.label")}</b>: {t("twocol.retailer.1.desc")}</span></li>
                <li className="flex items-start"><StoreIcon className="text-blue-400 mr-3 mt-1" size={24} /><span className="text-gray-800"><b>{t("twocol.retailer.2.label")}</b>: {t("twocol.retailer.2.desc")}</span></li>
                <li className="flex items-start"><ClockIcon className="text-blue-400 mr-3 mt-1" size={24} /><span className="text-gray-800"><b>{t("twocol.retailer.3.label")}</b>: {t("twocol.retailer.3.desc")}</span></li>
                <li className="flex items-start"><CreditCardIcon className="text-blue-400 mr-3 mt-1" size={20} /><span className="text-gray-800"><b>{t("twocol.retailer.4.label")}</b>: {t("twocol.retailer.4.desc")}</span></li>
                <li className="flex items-start"><TruckIcon className="text-blue-400 mr-3 mt-1" size={24} /><span className="text-gray-800"><b>{t("twocol.retailer.5.label")}</b>: {t("twocol.retailer.5.desc")}</span></li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Testimonial Section */}
      <section className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-14">
            <h2 className="text-4xl font-bold text-gray-900 mb-4 animate-fade-in-up">
              {t("testimonials.title")}
            </h2>
            <div className="flex justify-center mb-2">
              {[...Array(5)].map((_, i) => (
                <StarIcon key={i} className="text-yellow-400 w-7 h-7" fill="#facc15" />
              ))}
            </div>
          </div>
          {/* Horizontally auto-scrolling reviews */}
          <div
            ref={scrollRef}
            className="overflow-x-auto whitespace-nowrap pb-4 group hide-scrollbar"
            style={{ WebkitOverflowScrolling: 'touch', scrollBehavior: 'smooth' }}
          >
            <div className="flex gap-8">
              {Array.from({ length: repeatCount }).flatMap((_, repIdx) =>
                testimonials.map((item, idx) => (
                  <div
                    key={repIdx + '-' + idx}
                    className="testimonial-card inline-block min-w-[350px] max-w-[400px] bg-gray-50 border border-gray-200 rounded-2xl p-8 align-top mr-2 animate-fade-in-up"
                    style={{ whiteSpace: 'normal', wordBreak: 'break-word' }}
                  >
                    <div className="flex items-center mb-4">
                      <div className={`w-14 h-14 bg-${item.color}-100 rounded-full flex items-center justify-center mr-4 overflow-hidden`}>
                        <UserIcon className={`text-${item.color}-500 w-8 h-8`} />
                      </div>
                      <div>
                        <h4 className="font-semibold text-gray-900">{item.name}</h4>
                        <p className="text-gray-600 text-sm">{item.role}</p>
                      </div>
                    </div>
                    <p className="text-gray-700 italic">“{item.review}”</p>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </section>

      {/* 3 Simple Steps Section */}
      <section className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-gray-900 mb-4 animate-fade-in-up">
              {t("steps.title")}
            </h2>
            <p className="text-xl text-gray-600 animate-fade-in-up animate-delay-200">
              {t("steps.subtitle")}
            </p>
          </div>
          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                step: "1",
                icon: <FileTextIcon className="text-white" size={35} />,
                title: t("steps.1.title"),
                description: t("steps.1.desc")
              },
              {
                step: "2",
                icon: <ShoppingCartIcon className="text-white" size={35} />,
                title: t("steps.2.title"),
                description: t("steps.2.desc")
              },
              {
                step: "3",
                icon: <TrendingUpIcon className="text-white" size={35} />,
                title: t("steps.3.title"),
                description: t("steps.3.desc")
              } 
            ].map((item, index) => (
              <div key={index} className="text-center animate-fade-in-up" style={{ animationDelay: `${(index + 1) * 200}ms` }}>
                <div className="relative">
                  <div className="w-20 h-20 bg-[#0a61d7] rounded-full flex items-center justify-center mx-auto mb-6 animate-bounce-in">
                    <span className="text-3xl">{item.icon}</span>
                  </div>
                </div>
                <div className="bg-gray-50 rounded-full w-8 h-8 flex items-center justify-center mx-auto mb-4">
                  <span className="text-white font-bold text-sm bg-[#0a61d7] rounded-full w-6 h-6 flex items-center justify-center">
                    {item.step}
                  </span>
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-3">{item.title}</h3>
                <p className="text-gray-600 leading-relaxed">{item.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA Section */}
      <section className="py-24 bg-gradient-to-r from-[#0a61d7] to-[#084ba6]">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-4xl md:text-5xl font-bold text-white mb-6 animate-fade-in-up">
            {t("cta.title")}
          </h2>
          <p className="text-xl text-blue-100 mb-8 max-w-2xl mx-auto animate-fade-in-up animate-delay-200">
            {t("cta.subtitle")}
          </p>
          <button
            onClick={() => router.push("/register")}
            className="bg-orange-500 text-white px-12 py-5 rounded-lg text-xl font-bold hover:bg-orange-600 transition-all duration-200 shadow-2xl hover:shadow-orange-500/25 transform hover:-translate-y-1 animate-fade-in-up"
          >
            {t("cta.button")}
          </button>
        </div>
      </section>
      </div>
    </ErrorBoundary>
  );
}
