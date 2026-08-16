'use client';

import React from 'react';
import Image from 'next/image';
import { useRouter, usePathname } from 'next/navigation';
import { ChevronDown, ChevronUpIcon, Menu, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import {
  FEATURE_MODULES,
  featurePath,
  getFeaturedModule,
  type FeatureModuleSlug,
} from './features/modules';

export default function LandingNavbar() {
  const router = useRouter();
  const pathname = usePathname();
  const t = useTranslations('navbar');
  const tf = useTranslations('featureModules');
  const [langOpen, setLangOpen] = React.useState(false);
  const [featuresOpen, setFeaturesOpen] = React.useState(false);
  const [mobileFeaturesOpen, setMobileFeaturesOpen] = React.useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = React.useState(false);
  const [scrolled, setScrolled] = React.useState(false);
  const featuresRef = React.useRef<HTMLDivElement>(null);
  const featuresCloseTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const locale = pathname?.split('/')[1] === 'id' ? 'id' : 'en';
  const langOptions = [
    { code: 'en', label: 'English', icon: '/USIcon.svg' },
    { code: 'id', label: 'Bahasa', icon: '/IndonesiaIcon.svg' },
  ];
  const currentLang = langOptions.find((l) => l.code === locale);
  const featured = getFeaturedModule();
  const FeaturedIcon = featured.icon;

  const navItems = [
    { label: t('home'), href: `/${locale}/landing` },
    { label: t('pricing'), href: `/${locale}/landing/pricing` },
    { label: t('solutions'), href: `/${locale}/landing/solutions` },
    { label: t('about'), href: `/${locale}/landing/about` },
    { label: t('documentation'), href: `/${locale}/docs` },
  ];

  React.useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  React.useEffect(() => {
    if (!mobileMenuOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [mobileMenuOpen]);

  React.useEffect(() => {
    setMobileMenuOpen(false);
    setLangOpen(false);
    setFeaturesOpen(false);
  }, [pathname]);

  React.useEffect(() => {
    if (!featuresOpen) return;
    const onPointerDown = (e: MouseEvent) => {
      if (featuresRef.current && !featuresRef.current.contains(e.target as Node)) {
        setFeaturesOpen(false);
      }
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [featuresOpen]);

  React.useEffect(() => {
    return () => {
      if (featuresCloseTimer.current) clearTimeout(featuresCloseTimer.current);
    };
  }, []);

  const openFeaturesMenu = () => {
    if (featuresCloseTimer.current) {
      clearTimeout(featuresCloseTimer.current);
      featuresCloseTimer.current = null;
    }
    setFeaturesOpen(true);
  };

  const scheduleCloseFeaturesMenu = () => {
    if (featuresCloseTimer.current) clearTimeout(featuresCloseTimer.current);
    featuresCloseTimer.current = setTimeout(() => {
      setFeaturesOpen(false);
      featuresCloseTimer.current = null;
    }, 160);
  };

  const handleLocaleChange = (newLocale: string) => {
    if (newLocale === locale) return setLangOpen(false);
    const segments = (pathname ?? '').split('/');
    if (segments[1] === 'en' || segments[1] === 'id') {
      segments[1] = newLocale;
    } else {
      segments.splice(1, 0, newLocale);
    }
    router.push(segments.join('/') || '/');
    setLangOpen(false);
  };

  const goTo = (href: string) => {
    setMobileMenuOpen(false);
    setFeaturesOpen(false);
    router.push(href);
  };

  const goToFeature = (slug?: FeatureModuleSlug) => {
    goTo(featurePath(locale, slug));
  };

  const linkClass =
    'text-sm text-gray-600 hover:text-[#0a61d7] transition-colors bg-transparent border-none cursor-pointer';

  const solidNav = scrolled || mobileMenuOpen || featuresOpen;

  return (
    <>
      <nav
        className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ease-out ${
          solidNav
            ? 'border-b border-gray-200/60 bg-white/70 backdrop-blur-md'
            : 'border-none bg-transparent backdrop-blur-none'
        }`}
        style={solidNav ? undefined : { background: 'transparent', borderBottom: 'none', boxShadow: 'none' }}
      >
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
          <div className="flex items-center">
              <a href="/" className="flex items-center">
                <img
                  src="/LakuTextLogo.svg"
                  alt="Laku"
                  width={120}
                  height={40}
                  className="h-10 w-auto"
                  loading="eager"
                  fetchPriority="high"
                  decoding="async"
                />
              </a>
            </div>

            <div className="hidden md:flex items-center gap-8">
              <button type="button" onClick={() => router.push(`/${locale}/landing`)} className={linkClass}>
                {t('home')}
              </button>

              <div
                className="relative"
                ref={featuresRef}
                onMouseEnter={openFeaturesMenu}
                onMouseLeave={scheduleCloseFeaturesMenu}
              >
                <button
                  type="button"
                  onClick={() => setFeaturesOpen((open) => !open)}
                  onFocus={openFeaturesMenu}
                  className={`${linkClass} inline-flex items-center gap-1 ${
                    featuresOpen || pathname?.includes('/landing/features') ? 'text-[#0a61d7]' : ''
                  }`}
                  aria-expanded={featuresOpen}
                >
                  {t('features')}
                  <ChevronDown
                    className={`w-3.5 h-3.5 transition-transform ${featuresOpen ? 'rotate-180' : ''}`}
                  />
                </button>

                {featuresOpen && (
                  <div className="absolute left-1/2 -translate-x-1/2 top-full pt-4 w-[min(94vw,40rem)]">
                    <div className="rounded-2xl border border-gray-200 bg-white shadow-xl overflow-hidden">
                      <div className="grid grid-cols-[1fr_13rem]">
                        <div className="p-4">
                          <p className="px-2 mb-2 text-[11px] font-semibold tracking-widest uppercase text-gray-400">
                            {tf('menu.modulesLabel')}
                          </p>
                          <ul className="grid grid-cols-2 gap-x-1 gap-y-0.5">
                            {FEATURE_MODULES.filter((m) => m.slug !== 'marketplace').map((m) => {
                              const Icon = m.icon;
                              return (
                                <li key={m.slug}>
                                  <button
                                    type="button"
                                    onClick={() => goToFeature(m.slug)}
                                    className="w-full flex items-center gap-2.5 rounded-lg px-2 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 hover:text-[#0a61d7] transition-colors"
                                  >
                                    <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gray-100 text-gray-500">
                                      <Icon className="w-4 h-4" strokeWidth={1.75} />
                                    </span>
                                    <span className="leading-snug">{tf(`${m.slug}.menuLabel`)}</span>
                                  </button>
                                </li>
                              );
                            })}
                          </ul>
                        </div>

                        <div className="bg-[#0a61d7] text-white p-5 flex flex-col">
                          <p className="text-[11px] font-semibold tracking-widest uppercase text-blue-100">
                            {tf('menu.featuredLabel')}
                          </p>
                          <div className="mt-4 inline-flex h-9 w-9 items-center justify-center rounded-lg bg-white/15">
                            <FeaturedIcon className="w-4 h-4" strokeWidth={1.75} />
                          </div>
                          <h3 className="mt-3 text-lg font-bold leading-snug">{tf(`${featured.slug}.menuLabel`)}</h3>
                          <p className="mt-2 text-sm text-blue-100 leading-relaxed line-clamp-4">
                            {tf(`${featured.slug}.subtitle`)}
                          </p>
                          <button
                            type="button"
                            onClick={() => goToFeature(featured.slug)}
                            className="mt-auto pt-6 text-sm font-semibold text-white hover:underline text-left"
                          >
                            {tf('menu.featuredCta')} →
                          </button>
                        </div>
                      </div>
                      <div className="border-t border-gray-100 px-5 py-3">
                        <button
                          type="button"
                          onClick={() => goToFeature()}
                          className="text-sm font-medium text-[#0a61d7] hover:underline"
                        >
                          {tf('menu.viewAll')} →
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {navItems.slice(1).map((item) => (
                <button key={item.href} type="button" onClick={() => router.push(item.href)} className={linkClass}>
                  {item.label}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2.5 sm:gap-4">
              <div className="relative hidden sm:block">
                <button
                  type="button"
                  onClick={() => setLangOpen((open) => !open)}
                  className={`flex items-center px-2.5 py-1.5 rounded-lg border transition-colors ${
                    solidNav
                      ? 'bg-white border-gray-200 hover:bg-gray-50'
                      : 'bg-white/70 border-gray-200/70 hover:bg-white/90'
                  }`}
                  aria-label="Select language"
                >
                  <Image
                    src={currentLang?.icon || ''}
                    alt={currentLang?.label || ''}
                    width={20}
                    height={20}
                    className="mr-1.5"
                  />
                  <ChevronUpIcon
                    className={`w-3.5 h-3.5 text-gray-500 transition-transform ${langOpen ? '' : 'rotate-180'}`}
                  />
                </button>
                {langOpen && (
                  <div className="absolute right-0 mt-2 w-40 bg-white rounded-xl border border-gray-200 shadow-sm z-50 overflow-hidden">
                    {langOptions.map((option) => (
                      <button
                        key={option.code}
                        type="button"
                        onClick={() => handleLocaleChange(option.code)}
                        className={`flex items-center w-full px-3 py-2 text-sm hover:bg-gray-50 transition-colors ${
                          locale === option.code ? 'font-semibold text-[#0a61d7]' : 'text-gray-700'
                        }`}
                      >
                        <Image src={option.icon} alt={option.label} width={18} height={18} className="mr-2" />
                        {option.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <button
                type="button"
                onClick={() => router.push('/login')}
                className="hidden md:inline text-sm text-gray-600 hover:text-[#0a61d7] transition-colors"
              >
                {t('signin')}
              </button>
              <button
                type="button"
                onClick={() => router.push('/register')}
                className="hidden sm:inline-flex bg-[#0a61d7] text-white px-4 py-2 rounded-xl text-sm font-semibold hover:bg-[#084ba6] transition-colors"
              >
                {t('getstarted')}
              </button>

              <button
                type="button"
                onClick={() => setMobileMenuOpen(true)}
                className="md:hidden inline-flex items-center justify-center w-10 h-10 rounded-xl text-gray-700 hover:bg-black/5 transition-colors"
                aria-label="Open menu"
              >
                <Menu className="w-5 h-5" strokeWidth={2} />
              </button>
            </div>
          </div>
        </div>
      </nav>

      <div
        className={`fixed inset-0 z-[60] md:hidden ${mobileMenuOpen ? 'pointer-events-auto' : 'pointer-events-none'}`}
        aria-hidden={!mobileMenuOpen}
      >
        <button
          type="button"
          className={`absolute inset-0 bg-black/40 transition-opacity duration-300 ${
            mobileMenuOpen ? 'opacity-100' : 'opacity-0'
          }`}
          aria-label="Close menu"
          onClick={() => setMobileMenuOpen(false)}
        />

        <aside
          className={`absolute top-0 right-0 h-full w-[min(100%,22rem)] bg-white shadow-xl flex flex-col transition-transform duration-300 ease-out ${
            mobileMenuOpen ? 'translate-x-0' : 'translate-x-full'
          }`}
        >
          <div className="flex items-center justify-between px-5 h-16 border-b border-gray-100">
            <img
              src="/LakuTextLogo.svg"
              alt="Laku"
              width={110}
              height={36}
              className="h-9 w-auto"
              loading="eager"
              decoding="async"
            />
            <button
              type="button"
              onClick={() => setMobileMenuOpen(false)}
              className="inline-flex items-center justify-center w-10 h-10 rounded-xl text-gray-600 hover:bg-gray-50 transition-colors"
              aria-label="Close menu"
            >
              <X className="w-5 h-5" strokeWidth={2} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-5 py-4">
            <nav className="flex flex-col gap-1">
              <button
                type="button"
                onClick={() => goTo(`/${locale}/landing`)}
                className="w-full text-left px-3 py-3 rounded-xl text-[15px] font-medium text-gray-800 hover:bg-gray-50 transition-colors"
              >
                {t('home')}
              </button>

              <div className="rounded-xl">
                <button
                  type="button"
                  onClick={() => setMobileFeaturesOpen((open) => !open)}
                  className="w-full flex items-center justify-between px-3 py-3 rounded-xl text-[15px] font-medium text-gray-800 hover:bg-gray-50 transition-colors"
                >
                  {t('features')}
                  <ChevronDown
                    className={`w-4 h-4 text-gray-500 transition-transform ${mobileFeaturesOpen ? 'rotate-180' : ''}`}
                  />
                </button>
                {mobileFeaturesOpen && (
                  <div className="pb-2 pl-2 space-y-0.5">
                    <p className="px-3 pt-1 pb-1 text-[11px] font-semibold tracking-widest uppercase text-gray-400">
                      {tf('menu.modulesLabel')}
                    </p>
                    {FEATURE_MODULES.filter((m) => m.slug !== 'marketplace').map((m) => {
                      const Icon = m.icon;
                      return (
                        <button
                          key={m.slug}
                          type="button"
                          onClick={() => goToFeature(m.slug)}
                          className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                        >
                          <Icon className="w-4 h-4 text-gray-500" strokeWidth={1.75} />
                          {tf(`${m.slug}.menuLabel`)}
                        </button>
                      );
                    })}
                    <button
                      type="button"
                      onClick={() => goToFeature('marketplace')}
                      className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                    >
                      <FeaturedIcon className="w-4 h-4 text-gray-500" strokeWidth={1.75} />
                      {tf('marketplace.menuLabel')}
                    </button>
                    <button
                      type="button"
                      onClick={() => goToFeature()}
                      className="w-full text-left px-3 py-2 text-sm font-medium text-[#0a61d7]"
                    >
                      {tf('menu.viewAll')} →
                    </button>
                  </div>
                )}
              </div>

              {navItems.slice(1).map((item) => (
                <button
                  key={item.href}
                  type="button"
                  onClick={() => goTo(item.href)}
                  className="w-full text-left px-3 py-3 rounded-xl text-[15px] font-medium text-gray-800 hover:bg-gray-50 transition-colors"
                >
                  {item.label}
                </button>
              ))}
            </nav>
          </div>

          <div className="border-t border-gray-100 px-5 py-4 space-y-3">
            <div className="relative">
              <button
                type="button"
                onClick={() => setLangOpen((open) => !open)}
                className="flex items-center px-2.5 py-1.5 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 transition-colors"
                aria-label="Select language"
              >
                <Image
                  src={currentLang?.icon || ''}
                  alt={currentLang?.label || ''}
                  width={20}
                  height={20}
                  className="mr-1.5"
                />
                <span className="text-sm text-gray-700 mr-1">{currentLang?.label}</span>
                <ChevronUpIcon
                  className={`w-3.5 h-3.5 text-gray-500 transition-transform ${langOpen ? '' : 'rotate-180'}`}
                />
              </button>
              {langOpen && (
                <div className="absolute left-0 bottom-full mb-2 w-40 bg-white rounded-xl border border-gray-200 shadow-sm z-50 overflow-hidden">
                  {langOptions.map((option) => (
                    <button
                      key={option.code}
                      type="button"
                      onClick={() => handleLocaleChange(option.code)}
                      className={`flex items-center w-full px-3 py-2 text-sm hover:bg-gray-50 transition-colors ${
                        locale === option.code ? 'font-semibold text-[#0a61d7]' : 'text-gray-700'
                      }`}
                    >
                      <Image src={option.icon} alt={option.label} width={18} height={18} className="mr-2" />
                      {option.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => goTo('/register')}
                className="flex-1 bg-[#0a61d7] text-white px-4 py-3 rounded-xl text-sm font-semibold hover:bg-[#084ba6] transition-colors"
              >
                {t('getstarted')}
              </button>
              <button
                type="button"
                onClick={() => goTo('/login')}
                className="flex-1 border border-[#0a61d7] text-[#0a61d7] px-4 py-3 rounded-xl text-sm font-semibold hover:bg-blue-50 transition-colors"
              >
                {t('signin')}
              </button>
            </div>
          </div>
        </aside>
      </div>
    </>
  );
}
