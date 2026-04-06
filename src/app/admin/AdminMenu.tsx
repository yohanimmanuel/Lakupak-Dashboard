'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutGrid, Megaphone, Users, Shield, UserRound, ChartArea, LogOut } from 'lucide-react';
import { useAdminMenuContext } from './AdminClientLayout';

const items = [
  { href: '/admin', label: 'Home', icon: <LayoutGrid className="w-5 h-5" /> },
  { href: '/admin/announcements', label: 'Latest updates', icon: <Megaphone className="w-5 h-5" /> },
  { href: '/admin/users', label: 'Manage users', icon: <UserRound className="w-5 h-5" /> },
  { href: '/admin/analytics', label: 'Analytics', icon: <ChartArea className="w-5 h-5" /> },
  { href: '/admin/admins', label: 'Admins', icon: <Users className="w-5 h-5" /> },
];

export default function AdminMenu() {
  const pathname = usePathname() ?? '';
  const { isCollapsed } = useAdminMenuContext();
  const shouldShowExpanded = !isCollapsed;
  const [signingOut, setSigningOut] = useState(false);

  // Keep the menu footer info consistent with the navbar (name/email).
  const [me, setMe] = useState<{ name: string | null; email: string } | null>(null);
  useEffect(() => {
    fetch('/api/platform-admin/me')
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => {
        const admin = d?.admin as { name?: string | null; email?: string } | undefined;
        if (admin?.email) setMe({ name: admin.name ?? null, email: admin.email });
      })
      .catch(() => {});
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
    <div className="text-sm h-full flex flex-col bg-white relative" data-admin-menu>
      <div className="px-4 h-16 border-b border-gray-200 flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-[#0a61d7] flex items-center justify-center">
          <Shield className="w-5 h-5 text-white" />
        </div>
        {shouldShowExpanded && (
          <div>
            <p className="text-sm font-semibold text-gray-900 leading-tight">Laku Admin</p>
            <p className="text-xs text-gray-500 leading-tight">Platform controls</p>
          </div>
        )}
      </div>

      <div className="p-2 space-y-1 flex-1 overflow-y-auto">
        {items.map((item) => {
          const isActive =
            item.href === '/admin'
              ? pathname === '/admin'
              : pathname === item.href || pathname.startsWith(item.href + '/');
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-2.5 py-2 rounded-lg font-medium transition-colors duration-100 relative group ${
                isActive ? 'text-[#007bff]' : 'text-gray-500 hover:text-blue-400'
              }`}
              title={!shouldShowExpanded ? item.label : undefined}
            >
              {isActive && <div className="absolute left-0 top-0 bottom-0 w-1 bg-[#007bff] rounded-r" />}
              <span className="w-[20px] h-[20px] flex items-center justify-center flex-shrink-0 [&>svg]:text-current">
                {item.icon}
              </span>
              {shouldShowExpanded && <span className="whitespace-nowrap">{item.label}</span>}
            </Link>
          );
        })}
      </div>

      <div className="p-3">
        <button
          onClick={logout}
          disabled={signingOut}
          className="w-full mt-2 inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-60"
        >
          <LogOut className="w-4 h-4" />
          {signingOut ? 'Signing out…' : 'Sign out'}
        </button>
      </div>
    </div>
  );
}

