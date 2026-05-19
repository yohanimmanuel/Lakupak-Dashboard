"use client";
import React from "react";
import Image from "next/image";
import { useRouter, usePathname } from "next/navigation";
import { GlobeIcon, LanguagesIcon, ChevronDownIcon, ChevronUpIcon } from "lucide-react";
import { useTranslations } from "next-intl";

export default function LandingNavbar() {
  const router = useRouter();
  const pathname = usePathname();
  const t = useTranslations("navbar");
  const [dropdownOpen, setDropdownOpen] = React.useState(false);
  // You may want to get the current locale from next-intl or the URL
  // For now, parse it from the pathname (assuming /en/... or /id/...)
  const locale = pathname?.split("/")[1] === "id" ? "id" : "en";
  const langOptions = [
    {
      code: 'en',
      label: 'English',
      icon: '/USIcon.svg',
    },
    {
      code: 'id',
      label: 'Bahasa',
      icon: '/IndonesiaIcon.svg',
    },
  ];
  const currentLang = langOptions.find(l => l.code === locale);

  // Helper to switch locale in the URL
  const handleLocaleChange = (newLocale: string) => {
    if (newLocale === locale) return setDropdownOpen(false);
    // Replace the first segment of the path with the new locale
    const segments = (pathname ?? '').split('/');
    if (segments[1] === 'en' || segments[1] === 'id') {
      segments[1] = newLocale;
    } else {
      segments.splice(1, 0, newLocale);
    }
    const newPath = segments.join('/') || '/';
    router.push(newPath);
    setDropdownOpen(false);
  };

  return (
    <nav className="fixed top-0 w-full bg-white/30 backdrop-blur-lg border-b border-white/30 z-50 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-20">
          {/* Logo */}
          <div className="flex items-center">
            <a href="/">
              <Image src="/LakuTextLogo.svg" alt="Laku Logo" width={135} height={80} />
            </a>
          </div>
          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center space-x-10">
            <button onClick={() => router.push(`/${locale}/landing`)} className="text-gray-700 hover:text-[#0a61d7] transition-colors bg-transparent border-none cursor-pointer">{t("home")}</button>
            <button onClick={() => router.push(`/${locale}/landing/features`)} className="text-gray-700 hover:text-[#0a61d7] transition-colors bg-transparent border-none cursor-pointer">{t("features")}</button>
            <button onClick={() => router.push(`/${locale}/landing/pricing`)} className="text-gray-700 hover:text-[#0a61d7] transition-colors bg-transparent border-none cursor-pointer">{t("pricing")}</button>
            <button onClick={() => router.push(`/${locale}/landing/solutions`)} className="text-gray-700 hover:text-[#0a61d7] transition-colors bg-transparent border-none cursor-pointer">{t("solutions")}</button>
            <button onClick={() => router.push(`/${locale}/landing/about`)} className="text-gray-700 hover:text-[#0a61d7] transition-colors bg-transparent border-none cursor-pointer">{t("about")}</button>
            <button onClick={() => router.push(`/${locale}/docs`)} className="text-gray-700 hover:text-[#0a61d7] transition-colors bg-transparent border-none cursor-pointer">{t("documentation")}</button>
          </div>
          {/* CTA Buttons + Language Dropdown */}
          <div className="flex items-center space-x-6">
            {/* Language Dropdown */}
            <div className="relative">
              <button
                onClick={() => setDropdownOpen((open) => !open)}
                className="flex items-center px-3 py-2 rounded-full bg-white border border-gray-200 shadow-sm hover:bg-gray-50 transition min-w-[64px]"
                aria-label="Select language"
                type="button"
              >
                <Image src={currentLang?.icon || ''} alt={currentLang?.label || ''} width={24} height={24} className="mr-2" />
                <ChevronUpIcon className={`w-4 h-4 ml-1 text-gray-500 transition-transform ${dropdownOpen ? '' : 'rotate-180'}`} />
              </button>
              {dropdownOpen && (
                <div className="absolute left-0 mt-2 w-40 bg-white rounded-xl shadow-lg border border-gray-100 z-50 animate-fade-in-up">
                  {langOptions.map(option => (
                    <button
                      key={option.code}
                      onClick={() => handleLocaleChange(option.code)}
                      className={`flex items-center w-full px-4 py-2 text-sm rounded-xl hover:bg-blue-50 transition-colors ${locale === option.code ? 'font-bold text-blue-700' : 'text-gray-700'}`}
                    >
                      <Image src={option.icon} alt={option.label} width={22} height={22} className="mr-2" />
                      {option.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button onClick={() => router.push("/login")}
              className="text-gray-700 hover:text-[#0a61d7] transition-colors">{t("signin")}</button>
            <button onClick={() => router.push("/register")}
              className="bg-[#0a61d7] text-white px-6 py-2.5 rounded-lg hover:bg-[#084ba6] transition-colors shadow-lg hover:shadow-xl">{t("getstarted")}</button>
          </div>
        </div>
      </div>
    </nav>
  );
}
