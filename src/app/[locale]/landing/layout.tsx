'use client';

import React from 'react';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { Instagram, Facebook, Mail } from 'lucide-react';
import LandingNavbar from './LandingNavbar';
import { useLocale, useTranslations } from 'next-intl';

export default function LandingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const t = useTranslations('footer');
  const locale = useLocale();
  const pathname = usePathname();
  const isHome =
    pathname === `/${locale}/landing` ||
    pathname === `/${locale}/landing/` ||
    pathname === '/landing' ||
    pathname === '/landing/';

  return (
    <div className="min-h-screen bg-white">
      <LandingNavbar />
      <div className={isHome ? undefined : 'pt-16'}>{children}</div>
      <footer className="bg-gray-950 text-white py-14">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid md:grid-cols-4 gap-10">
            <div className="md:col-span-2">
              <div className="flex items-center mb-4">
                <Image src="/LakuWTextLogo.svg" alt="Laku" width={140} height={36} />
              </div>
              <p className="text-gray-400 text-sm leading-relaxed max-w-md">
                {t('company.description1')}
                <br />
                {t('company.description2')}
              </p>
              <div className="flex gap-3 mt-6">
                <a
                  href="#"
                  className="w-9 h-9 bg-gray-900 rounded-lg flex items-center justify-center text-white hover:bg-[#0a61d7] transition-colors"
                  aria-label="Instagram"
                >
                  <Instagram className="w-[18px] h-[18px]" strokeWidth={1.75} />
                </a>
                <a
                  href="#"
                  className="w-9 h-9 bg-gray-900 rounded-lg flex items-center justify-center text-white hover:bg-[#0a61d7] transition-colors"
                  aria-label="Facebook"
                >
                  <Facebook className="w-[18px] h-[18px]" strokeWidth={1.75} />
                </a>
                <a
                  href="#"
                  className="w-9 h-9 bg-gray-900 rounded-lg flex items-center justify-center text-white hover:bg-[#0a61d7] transition-colors"
                  aria-label="Email"
                >
                  <Mail className="w-[18px] h-[18px]" strokeWidth={1.75} />
                </a>
              </div>
            </div>
            <div>
              <h3 className="text-sm font-semibold mb-4">{t('quicklinks.title')}</h3>
              <div className="flex flex-col gap-2.5 items-start text-sm">
                <a href={`/${locale}/landing/pricing`} className="text-gray-400 hover:text-white transition-colors">
                  {t('quicklinks.pricing')}
                </a>
                <a href={`/${locale}/landing/features`} className="text-gray-400 hover:text-white transition-colors">
                  {t('quicklinks.features')}
                </a>
                <a href={`/${locale}/landing/solutions`} className="text-gray-400 hover:text-white transition-colors">
                  {t('quicklinks.solutions')}
                </a>
                <a href={`/${locale}/landing/about`} className="text-gray-400 hover:text-white transition-colors">
                  {t('quicklinks.about')}
                </a>
              </div>
            </div>
            <div>
              <h3 className="text-sm font-semibold mb-4">{t('support.title')}</h3>
              <ul className="space-y-2.5 text-sm">
                <li>
                  <a
                    href={`/${locale}/landing/legal/privacy-policy`}
                    className="text-gray-400 hover:text-white transition-colors"
                  >
                    {t('support.help')}
                  </a>
                </li>
                <li>
                  <a
                    href={`/${locale}/landing/legal/terms-and-conditions`}
                    className="text-gray-400 hover:text-white transition-colors"
                  >
                    {t('support.contact')}
                  </a>
                </li>
              </ul>
            </div>
          </div>
          <div className="border-t border-gray-800 mt-10 pt-6 text-center">
            <p className="text-gray-500 text-sm">{t('copyright')}</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
