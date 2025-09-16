'use client';

import React, { useState, createContext, useContext, useEffect } from 'react';
import Menu from '@/components/Menu';
import Navbar from '@/components/Navbar';

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
