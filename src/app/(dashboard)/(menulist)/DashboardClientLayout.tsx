'use client';

import React, { useState, createContext, useContext, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Menu from '@/components/Menu';
import Navbar from '@/components/Navbar';
import { useUserStore } from '@/store/userStore';
import { useAuthHydration } from '@/hooks/useAuthHydration';
import { TourProvider } from '@/components/tours/TourProvider';
import { DashboardIntlProvider } from '@/components/DashboardIntlProvider';
import { LanguageChangedModal } from '@/components/accountsettings/LanguageChangedModal';
import { useTranslations } from 'next-intl';
import { useSession } from 'next-auth/react';

const MenuContext = createContext({
  isCollapsed: false,
  toggleMenu: () => {},
  isMobileMenuOpen: false,
  toggleMobileMenu: () => {},
});
export const useMenuContext = () => useContext(MenuContext);

export default function DashboardClientLayout({ children }: { children: React.ReactNode }) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const router = useRouter();
  const { user, checkSession } = useUserStore();
  const { isHydrated } = useAuthHydration();
  const { data: session, status: nextAuthStatus } = useSession();

  // Authentication check - coordinates between userStore and NextAuth session
  useEffect(() => {
    // 1. Wait until userStore is hydrated
    if (!isHydrated) return;

    // 2. If NextAuth is still resolving session, wait! (Prevents redirect race on OAuth callback)
    if (nextAuthStatus === 'loading') return;

    // 3. User is authenticated in store
    if (user && checkSession()) {
      setIsCheckingAuth(false);
      return;
    }

    // 4. NextAuth is authenticated - AuthSync will populate userStore shortly
    if (nextAuthStatus === 'authenticated' && session?.user) {
      return;
    }

    // 5. Only if NextAuth is confirmed unauthenticated AND userStore has no valid session
    if (nextAuthStatus === 'unauthenticated' && (!user || !checkSession())) {
      const timeoutId = setTimeout(() => {
        const currentUser = useUserStore.getState().user;
        const currentValid = useUserStore.getState().checkSession();
        if (!currentUser || !currentValid) {
          router.push('/login');
        } else {
          setIsCheckingAuth(false);
        }
      }, 200);

      return () => clearTimeout(timeoutId);
    }
  }, [user, checkSession, router, isHydrated, nextAuthStatus, session]);

  // When user is set/updated in store, immediately clear auth checking state
  useEffect(() => {
    if (user && checkSession()) {
      setIsCheckingAuth(false);
    }
  }, [user, checkSession]);

  // Check if screen is mobile size
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768); // md breakpoint
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const toggleMenu = () => {
    if (isMobile) {
      setIsMobileMenuOpen(!isMobileMenuOpen);
    } else {
      setIsCollapsed(!isCollapsed);
    }
  };

  const toggleMobileMenu = () => setIsMobileMenuOpen(!isMobileMenuOpen);

  // Show loading state while checking authentication
  if (isCheckingAuth) {
    return (
      <DashboardIntlProvider>
        <DashboardAuthLoading />
      </DashboardIntlProvider>
    );
  }

  return (
    <DashboardIntlProvider>
    <MenuContext.Provider value={{ isCollapsed, toggleMenu, isMobileMenuOpen, toggleMobileMenu }}>
      <TourProvider>
      <LanguageChangedModal />
      <div className="h-screen flex flex-col overflow-hidden relative" data-layout>
        {/* Full-width navbar */}
        <div className="flex-shrink-0">
          <Navbar />
        </div>

        <div className="flex flex-1 overflow-hidden min-h-0">
          {/* Desktop Sidebar */}
          <div className={`hidden md:block ${isCollapsed ? 'w-[56px]' : 'w-[15%]'} bg-white transition-[width] duration-300 ease-in-out border-r border-gray-200 min-w-[56px] overflow-hidden shrink-0`}>
            <Menu />
          </div>

          {/* Mobile Menu Overlay */}
          {isMobile && isMobileMenuOpen && (
            <div 
              className="fixed inset-0 top-16 bg-black/50 z-40 md:hidden"
              onClick={toggleMobileMenu}
            />
          )}

          {/* Mobile Sidebar */}
          <div className={`md:hidden fixed top-16 left-0 h-[calc(100%-4rem)] w-60 bg-white border-r border-gray-200 transform transition-transform duration-300 z-50 ${
            isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
          }`}>
            <Menu />
          </div>

          {/* Main Content Area */}
          <div className="flex-1 bg-white flex flex-col overflow-hidden min-w-0">
            <div className="flex-1 overflow-auto">
              {children}
            </div>
          </div>
        </div>
      </div>
      </TourProvider>
    </MenuContext.Provider>
    </DashboardIntlProvider>
  );
}

function DashboardAuthLoading() {
  const tCommon = useTranslations('dashboard.common');
  return (
    <div className="h-screen flex items-center justify-center bg-gradient-to-b from-gray-50 to-white">
      <div className="text-center">
        <div className="w-8 h-8 border-4 border-[#0a61d7] border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
        <div className="text-gray-600">{tCommon('loadingDashboard')}</div>
      </div>
    </div>
  );
}
