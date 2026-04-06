'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import AdminMenu from './AdminMenu';
import AdminNavbar from './AdminNavbar';

const AdminMenuContext = createContext({
  isCollapsed: false,
  toggleMenu: () => {},
  isMobileMenuOpen: false,
  toggleMobileMenu: () => {},
});

export const useAdminMenuContext = () => useContext(AdminMenuContext);

export default function AdminClientLayout({ children }: { children: React.ReactNode }) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const pathname = usePathname() ?? '';
  const router = useRouter();

  // Keep auth pages unwrapped.
  const isAuthScreen = pathname === '/admin/login' || pathname === '/admin/register';

  // Optional: if cookie is missing/expired, middleware redirects anyway, but this keeps UI clean on client nav.
  useEffect(() => {
    if (isAuthScreen) return;
    fetch('/api/platform-admin/me')
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .catch(() => {
        router.push('/admin/login');
      });
  }, [router, isAuthScreen]);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  if (isAuthScreen) return <>{children}</>;

  const toggleMenu = () => {
    if (isMobile) setIsMobileMenuOpen((v) => !v);
    else setIsCollapsed((v) => !v);
  };
  const toggleMobileMenu = () => setIsMobileMenuOpen((v) => !v);

  return (
    <AdminMenuContext.Provider value={{ isCollapsed, toggleMenu, isMobileMenuOpen, toggleMobileMenu }}>
      <div className="h-screen flex overflow-hidden relative" data-admin-layout>
        {/* Desktop Sidebar */}
        <div
          className={`hidden md:block ${isCollapsed ? 'w-[70px]' : 'w-[15%]'} bg-white transition-all duration-300 border border-gray-200 min-w-[70px]`}
        >
          <AdminMenu />
        </div>

        {/* Mobile Menu Overlay */}
        {isMobile && isMobileMenuOpen && (
          <div className="fixed inset-0 bg-black/50 z-40 md:hidden" onClick={toggleMobileMenu} />
        )}

        {/* Mobile Sidebar */}
        <div
          className={`md:hidden fixed top-0 left-0 h-full w-60 bg-white border-r border-gray-200 transform transition-transform duration-300 z-50 ${
            isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
        >
          <AdminMenu />
        </div>

        {/* Main Content Area */}
        <div
          className={`${isMobile ? 'w-full' : isCollapsed ? 'w-[calc(100%-70px)]' : 'w-[85%]'} bg-white transition-all duration-300 flex flex-col overflow-hidden`}
        >
          <div className="flex-shrink-0">
            <AdminNavbar />
          </div>
          <div className="flex-1 overflow-auto bg-[#f9fafb]">
            <div className="p-4">{children}</div>
          </div>
        </div>
      </div>
    </AdminMenuContext.Provider>
  );
}

