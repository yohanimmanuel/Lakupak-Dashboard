"use client";

import React from "react";
import Image from "next/image";
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
                <Image src="/LakuWTextLogo.svg" alt="Laku Logo" width={150} height={10} />
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
                  <li><a href={`/${locale}/landing/legal/privacy-policy`} className="text-gray-400 hover:text-white transition-colors">{t("support.help")}</a></li>
                  <li><a href={`/${locale}/landing/legal/terms-and-conditions`} className="text-gray-400 hover:text-white transition-colors">{t("support.contact")}</a></li>
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
