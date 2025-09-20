'use client';

import React, { useState, createContext, useContext, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Menu from '@/components/Menu';
import Navbar from '@/components/Navbar';
import { useUserStore } from '@/store/userStore';
import { useAuthHydration } from '@/hooks/useAuthHydration';

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
  const [isClient, setIsClient] = useState(false);
  const router = useRouter();
  const { user, checkSession } = useUserStore();
  const { isHydrated } = useAuthHydration();

  // Prevent hydration mismatch
  useEffect(() => {
    setIsClient(true);
  }, []);

  // Simple authentication check - wait for hydration
  useEffect(() => {
    if (!isClient || !isHydrated) return;

    // Small delay to ensure everything is properly loaded
    const timeoutId = setTimeout(() => {
      // Now check if user exists and session is valid
      if (user && checkSession()) {
        setIsCheckingAuth(false);
        return;
      }
      
      // No valid user, redirect to login
      router.push('/login');
    }, 200);
    
    return () => clearTimeout(timeoutId);
  }, [user, checkSession, router, isClient, isHydrated]);

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
      <div className="h-screen flex items-center justify-center bg-gradient-to-b from-gray-50 to-white">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-[#0a61d7] border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <div className="text-gray-600">Loading dashboard...</div>
        </div>
      </div>
    );
  }

  return (
    <MenuContext.Provider value={{ isCollapsed, toggleMenu, isMobileMenuOpen, toggleMobileMenu }}>
      <div className="h-screen flex overflow-hidden relative" data-layout>
        {/* Desktop Sidebar */}
        <div className={`hidden md:block ${isCollapsed ? 'w-[70px]' : 'w-[15%]'} bg-white transition-all duration-300 border border-gray-200 min-w-[70px]`}>
          <Menu />
        </div>

        {/* Mobile Menu Overlay */}
        {isMobile && isMobileMenuOpen && (
          <div 
            className="fixed inset-0 bg-black/50 z-40 md:hidden"
            onClick={toggleMobileMenu}
          />
        )}

        {/* Mobile Sidebar */}
        <div className={`md:hidden fixed top-0 left-0 h-full w-60 bg-white border-r border-gray-200 transform transition-transform duration-300 z-50 ${
          isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
        }`}>
          <Menu />
        </div>

        {/* Main Content Area */}
        <div className={`${isMobile ? 'w-full' : (isCollapsed ? 'w-[calc(100%-70px)]' : 'w-[85%]')} bg-white transition-all duration-300 flex flex-col overflow-hidden`}>
          <div className="flex-shrink-0">
            <Navbar />
          </div>
          <div className="flex-1 overflow-auto">
            {children}
          </div>
        </div>
      </div>
    </MenuContext.Provider>
  );
}
