"use client";

import React from "react";
import Image from "next/image";
import Head from "next/head";
import LandingNavbar from "./LandingNavbar";
import { useLocale, useTranslations } from "next-intl";

export default function LandingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const t = useTranslations("footer");
  const locale = useLocale();
  
  return (
    <>
      <Head>
        {/* SEO Meta Tags */}
        <title>Laku-Laku - B2B Marketplace & SaaS Platform for Indonesian FMCG Distributors</title>
        <meta 
          name="description" 
          content="Laku-Laku is Indonesia's leading B2B marketplace and SaaS platform for FMCG distributors. Streamline operations, manage inventory, and grow your distribution business with our trusted digital platform." 
        />
        <meta name="keywords" content="B2B marketplace Indonesia, FMCG distributor, warung supplier, distribution software, inventory management, B2B SaaS Indonesia" />
        <meta name="robots" content="index, follow" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="canonical" href={`https://laku-laku.com/${locale}/landing`} />
        
        {/* Open Graph Tags for Social Sharing */}
        <meta property="og:title" content="Laku-Laku - B2B Marketplace for Indonesian FMCG" />
        <meta property="og:description" content="Transform your distribution business with Laku-Laku's digital platform. Connect with thousands of warungs and small retailers across Indonesia." />
        <meta property="og:image" content="https://laku-laku.com/og-image.jpg" />
        <meta property="og:url" content={`https://laku-laku.com/${locale}/landing`} />
        <meta property="og:type" content="website" />
        <meta property="og:site_name" content="Laku-Laku" />
        
        {/* Twitter Card Tags */}
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:site" content="@lakulaku" />
        <meta name="twitter:title" content="Laku-Laku - B2B Marketplace for Indonesian FMCG" />
        <meta name="twitter:description" content="Transform your distribution business with Laku-Laku's digital platform." />
        <meta name="twitter:image" content="https://laku-laku.com/twitter-image.jpg" />
        
        {/* Structured Data for Search Engines */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "SoftwareApplication",
              "name": "Laku-Laku",
              "description": "B2B marketplace and SaaS platform for FMCG distributors in Indonesia",
              "applicationCategory": "BusinessApplication",
              "operatingSystem": "Web",
              "offers": {
                "@type": "Offer",
                "price": "0",
                "priceCurrency": "IDR",
                "availability": "https://schema.org/InStock"
              },
              "aggregateRating": {
                "@type": "AggregateRating",
                "ratingValue": "4.8",
                "ratingCount": "150"
              }
            })
          }}
        />
        
        {/* Security Headers */}
        <meta httpEquiv="X-Content-Type-Options" content="nosniff" />
        <meta httpEquiv="X-Frame-Options" content="DENY" />
        <meta httpEquiv="X-XSS-Protection" content="1; mode=block" />
        <meta httpEquiv="Referrer-Policy" content="strict-origin-when-cross-origin" />
        
        {/* Google Analytics (placeholder for production) */}
        {process.env.NODE_ENV === 'production' && (
          <>
            <script async src={`https://www.googletagmanager.com/gtag/js?id=${process.env.NEXT_PUBLIC_GA_ID}`} />
            <script
              dangerouslySetInnerHTML={{
                __html: `
                  window.dataLayer = window.dataLayer || [];
                  function gtag(){dataLayer.push(arguments);}
                  gtag('js', new Date());
                  gtag('config', '${process.env.NEXT_PUBLIC_GA_ID}', {
                    page_title: 'Landing Page',
                    page_location: window.location.href,
                    send_page_view: true
                  });
                `,
              }}
            />
          </>
        )}
        
        {/* Preload critical resources */}
        <link rel="preload" href="/LakuLakuIcon.svg" as="image" />
        <link rel="preload" href="/LakuLakuTextLogo.svg" as="image" />
        
        {/* Favicon */}
        <link rel="icon" href="/favicon.ico" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
      </Head>
      
      <div className="min-h-screen bg-white">
        {/* Navigation Bar */}
        <LandingNavbar />
        <div className="pt-20">{children}</div>
      {/* Footer */}
      <footer className="bg-gray-900 text-white py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid md:grid-cols-4 gap-8">
            {/* Company Info */}
            <div className="col-span-2 animate-fade-in-up">
              <div className="flex items-center mb-4">
                <Image src="/LakuLakuwTextLogo.svg" alt="Laku-Laku Logo" width={200} height={10} />
              </div>
              <p className="text-gray-400 mb-6 max-w-md">
                {t("company.description1")}<br />
                {t("company.description2")}
              </p>
              <div className="flex space-x-4">
                <div className="w-10 h-10 bg-gray-800 rounded-lg flex items-center justify-center hover:bg-[#0a61d7] transition-colors cursor-pointer">
                  <span><Image src="/instagram.svg" alt="Instagram" width={20} height={20} /></span>
                </div>
                <div className="w-10 h-10 bg-gray-800 rounded-lg flex items-center justify-center hover:bg-[#0a61d7] transition-colors cursor-pointer">
                  <span><Image src="/facebook.svg" alt="Facebook" width={20} height={20} /></span>
                </div>
                <div className="w-10 h-10 bg-gray-800 rounded-lg flex items-center justify-center hover:bg-[#0a61d7] transition-colors cursor-pointer">
                  <span><Image src="/gmail.svg" alt="Mail" width={20} height={20} /></span>
                </div>
              </div>
            </div>
            {/* Quick Links */}
            <div className="animate-fade-in-up animate-delay-200">
              <h3 className="text-lg font-semibold mb-4">{t("quicklinks.title")}</h3>
              <div className="flex flex-col gap-3 w-full items-start">
                <a href={`/${locale}/landing/pricing`} className="text-gray-400 hover:text-white transition-colors">{t("quicklinks.pricing")}</a>
                <a href={`/${locale}/landing/features`} className="text-gray-400 hover:text-white transition-colors">{t("quicklinks.features")}</a>
                <a href={`/${locale}/landing/solutions`} className="text-gray-400 hover:text-white transition-colors">{t("quicklinks.solutions")}</a>
                <a href={`/${locale}/landing/about`} className="text-gray-400 hover:text-white transition-colors">{t("quicklinks.about")}</a>
              </div>
            </div>
            {/* Support */}
            <div className="animate-fade-in-up animate-delay-400">
              <h3 className="text-lg font-semibold mb-4">{t("support.title")}</h3>
              <ul className="space-y-3">
                <li><a href="#help" className="text-gray-400 hover:text-white transition-colors">{t("support.help")}</a></li>
                <li><a href="#contact" className="text-gray-400 hover:text-white transition-colors">{t("support.contact")}</a></li>
                <li><a href="#docs" className="text-gray-400 hover:text-white transition-colors">{t("support.docs")}</a></li>
                <li><a href="#status" className="text-gray-400 hover:text-white transition-colors">{t("support.status")}</a></li>
              </ul>
            </div>
          </div>
          <div className="border-t border-gray-800 mt-12 pt-8 text-center">
            <p className="text-gray-400">
              {t("copyright")}
            </p>
          </div>
        </div>
      </footer>
      </div>
    </>
  );
}
