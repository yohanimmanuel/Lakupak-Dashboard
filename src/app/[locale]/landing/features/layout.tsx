"use client";

import React from "react";
import Head from "next/head";
import { useLocale } from "next-intl";

export default function FeaturesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const locale = useLocale();
  
  return (
    <>
      <Head>
        {/* SEO Meta Tags */}
        <title>Features - Laku-Laku | Complete B2B FMCG Platform for Indonesian Distributors</title>
        <meta 
          name="description" 
          content="Discover Laku-Laku's comprehensive features for FMCG distributors: inventory management, order processing, customer management, analytics, and marketplace integration." 
        />
        <meta name="keywords" content="Laku-Laku features, FMCG distributor software, inventory management Indonesia, B2B marketplace features, distribution platform capabilities" />
        <meta name="robots" content="index, follow" />
        <link rel="canonical" href={`https://laku-laku.com/${locale}/landing/features`} />
        
        {/* Open Graph Tags */}
        <meta property="og:title" content="Laku-Laku Features - Complete B2B FMCG Distribution Platform" />
        <meta property="og:description" content="Explore all features of Laku-Laku's B2B platform: from inventory management to marketplace integration for Indonesian FMCG distributors." />
        <meta property="og:url" content={`https://laku-laku.com/${locale}/landing/features`} />
        <meta property="og:type" content="website" />
        
        {/* Twitter Card Tags */}
        <meta name="twitter:title" content="Laku-Laku Features - B2B FMCG Platform" />
        <meta name="twitter:description" content="Complete feature overview of Laku-Laku's B2B marketplace and SaaS platform for distributors." />
        
        {/* Structured Data */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "WebPage",
              "name": "Laku-Laku Features",
              "description": "Complete feature overview of Laku-Laku's B2B platform for FMCG distributors",
              "mainEntity": {
                "@type": "SoftwareApplication",
                "name": "Laku-Laku",
                "applicationCategory": "BusinessApplication",
                "featureList": [
                  "Inventory Management",
                  "Order Processing",
                  "Customer Management", 
                  "Analytics Dashboard",
                  "B2B Marketplace",
                  "Mobile Application"
                ],
                "operatingSystem": "Web Browser",
                "offers": {
                  "@type": "Offer",
                  "price": "0",
                  "priceCurrency": "IDR"
                }
              }
            })
          }}
        />
      </Head>
      
      {children}
    </>
  );
}