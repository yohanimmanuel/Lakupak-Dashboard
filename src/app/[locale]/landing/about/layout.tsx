"use client";

import React from "react";
import Head from "next/head";
import { useLocale } from "next-intl";

export default function AboutLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const locale = useLocale();
  
  return (
    <>
      <Head>
        {/* SEO Meta Tags */}
        <title>About Laku - Our Story & Mission | B2B FMCG Platform Indonesia</title>
        <meta 
          name="description" 
          content="Learn about Laku's mission to transform Indonesia's FMCG distribution. Our story, vision, and commitment to empowering distributors and small retailers across Indonesia." 
        />
        <meta name="keywords" content="about Laku, FMCG distribution Indonesia, B2B marketplace story, distributor platform mission, warung supplier vision" />
        <meta name="robots" content="index, follow" />
        <link rel="canonical" href={`https://laku.com/${locale}/landing/about`} />
        
        {/* Open Graph Tags */}
        <meta property="og:title" content="About Laku - Transforming FMCG Distribution in Indonesia" />
        <meta property="og:description" content="Discover how Laku is revolutionizing B2B FMCG distribution in Indonesia. Our mission to connect distributors with small retailers." />
        <meta property="og:url" content={`https://laku.com/${locale}/landing/about`} />
        <meta property="og:type" content="website" />
        
        {/* Twitter Card Tags */}
        <meta name="twitter:title" content="About Laku - Our Mission & Story" />
        <meta name="twitter:description" content="Learn about Laku's journey to transform Indonesia's FMCG distribution landscape." />
        
        {/* Structured Data */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "AboutPage",
              "name": "About Laku",
              "description": "Learn about Laku's mission to transform Indonesia's FMCG distribution",
              "mainEntity": {
                "@type": "Organization",
                "name": "Laku",
                "description": "B2B marketplace and SaaS platform for FMCG distributors in Indonesia",
                "foundingDate": "2024",
                "founders": [
                  {
                    "@type": "Person",
                    "name": "Laku Team"
                  }
                ],
                "mission": "To digitize and streamline FMCG distribution in Indonesia"
              }
            })
          }}
        />
      </Head>
      
      {children}
    </>
  );
}