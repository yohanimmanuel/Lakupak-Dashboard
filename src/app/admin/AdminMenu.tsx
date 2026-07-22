'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutGrid,
  Megaphone,
  Tag,
  Users,
  UserRound,
  ChartArea,
  Search,
  LogOut,
  X,
  PanelLeft,
  PanelLeftClose,
} from 'lucide-react';
import { useAdminMenuContext } from './AdminClientLayout';

const LAKU_PRIMARY_TEXT = 'text-[#0a61d7]';
const LAKU_PRIMARY_BG = 'bg-[#e8f0fe]';

const items = [
  { href: '/admin', label: 'Home', icon: <LayoutGrid className="w-5 h-5" /> },
  { href: '/admin/users', label: 'Manage users', icon: <UserRound className="w-5 h-5" /> },
  { href: '/admin/admins', label: 'Admins', icon: <Users className="w-5 h-5" /> },
  { href: '/admin/announcements', label: 'Latest updates', icon: <Megaphone className="w-5 h-5" /> },
  { href: '/admin/offers', label: 'Offers', icon: <Tag className="w-5 h-5" /> },
  { href: '/admin/search-logs', label: 'Search logs', icon: <Search className="w-5 h-5" /> },
  { href: '/admin/analytics', label: 'Analytics', icon: <ChartArea className="w-5 h-5" /> },
];

export default function AdminMenu() {
  const pathname = usePathname() ?? '';
  const { isCollapsed, toggleMenu, toggleMobileMenu } = useAdminMenuContext();
  const [isMobile, setIsMobile] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  const shouldShowExpanded = isMobile || !isCollapsed;
  const isIconOnly = !shouldShowExpanded;

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const logout = async () => {
    setSigningOut(true);
    try {
      await fetch('/api/platform-admin/logout', { method: 'POST' });
      window.location.href = '/admin/login';
    } finally {
      setSigningOut(false);
    }
  };

  return (
    <div className="text-sm h-full flex flex-col bg-white relative overflow-x-hidden min-w-0" data-admin-menu>
      {isMobile && (
        <div className="flex items-center justify-end px-3 py-2 border-b border-gray-200 md:hidden">
          <button
            type="button"
            onClick={toggleMobileMenu}
            className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
            aria-label="Close menu"
          >
            <X className="w-5 h-5 text-gray-600" />
          </button>
        </div>
      )}

      <div className="flex-1 overflow-y-auto overflow-x-hidden min-w-0">
        <nav className="flex flex-col gap-1 py-3 px-2 text-[14px]">
          {items.map((item) => {
            const isActive =
              item.href === '/admin'
                ? pathname === '/admin'
                : pathname === item.href || pathname.startsWith(item.href + '/');
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => {
                  if (isMobile) toggleMobileMenu();
                }}
                className={`group flex w-full min-w-0 items-center gap-3 px-2.5 py-2 rounded-lg font-medium transition-colors duration-150 relative ${
                  isActive
                    ? `${LAKU_PRIMARY_TEXT} ${LAKU_PRIMARY_BG}`
                    : 'text-gray-500 hover:text-[#0a61d7] hover:bg-gray-100'
                }`}
                title={isIconOnly ? item.label : undefined}
              >
                <span className="w-[20px] h-[20px] flex items-center justify-center flex-shrink-0 [&>svg]:text-current">
                  {item.icon}
                </span>
                <span
                  className={`whitespace-nowrap transition-opacity duration-200 ${
                    shouldShowExpanded ? 'opacity-100' : 'opacity-0'
                  }`}
                >
                  {item.label}
                </span>
              </Link>
            );
          })}
        </nav>
      </div>

      <div
        className={`shrink-0 border-t border-gray-200 flex px-2 py-2.5 ${
          shouldShowExpanded ? 'items-center justify-between' : 'flex-col gap-1'
        }`}
      >
        <button
          type="button"
          onClick={() => void logout()}
          disabled={signingOut}
          className={`flex items-center rounded-lg py-2 px-2.5 text-gray-600 hover:bg-gray-100 hover:text-[#0a61d7] transition-colors disabled:opacity-60 ${
            shouldShowExpanded ? '' : 'w-full'
          }`}
          title={signingOut ? 'Signing out…' : 'Sign out'}
          aria-label={signingOut ? 'Signing out…' : 'Sign out'}
        >
          <span className="flex h-5 w-5 items-center justify-center">
            <LogOut size={18} />
          </span>
          {shouldShowExpanded ? (
            <span className="ml-2 text-sm whitespace-nowrap">
              {signingOut ? 'Signing out…' : 'Sign out'}
            </span>
          ) : null}
        </button>
        {!isMobile && (
          <button
            type="button"
            onClick={toggleMenu}
            className={`flex items-center rounded-lg py-2 px-2.5 text-gray-600 hover:bg-gray-100 hover:text-[#0a61d7] transition-colors ${
              shouldShowExpanded ? '' : 'w-full'
            }`}
            aria-label={isCollapsed ? 'Expand menu' : 'Collapse menu'}
            title={isCollapsed ? 'Expand menu' : 'Collapse menu'}
          >
            <span className="flex h-5 w-5 items-center justify-center">
              {isCollapsed ? <PanelLeft size={18} /> : <PanelLeftClose size={18} />}
            </span>
          </button>
        )}
      </div>
    </div>
  );
}
