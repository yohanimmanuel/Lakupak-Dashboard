'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { Menu as MenuIcon, User } from 'lucide-react';
import { useAdminMenuContext } from './AdminClientLayout';
import AdminDistributorReportsBell from '@/components/adminstuffs/AdminDistributorReportsBell';

type Me = { name: string | null; email: string };

export default function AdminNavbar() {
  const { toggleMenu } = useAdminMenuContext();
  const [me, setMe] = useState<Me | null>(null);

  useEffect(() => {
    fetch('/api/platform-admin/me')
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => {
        const admin = d?.admin as { name?: string | null; email?: string } | undefined;
        if (admin?.email) setMe({ name: admin.name ?? null, email: admin.email });
      })
      .catch(() => {});
  }, []);

  return (
    <div className="flex items-center justify-between gap-4 px-4 z-30 relative bg-white border-b border-gray-200 h-16">
      <div className="flex items-center gap-4 min-w-0 flex-1">
        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            className="md:hidden p-2 rounded-lg hover:bg-gray-200 transition-all duration-100"
            aria-label="Toggle menu"
            onClick={toggleMenu}
          >
            <MenuIcon size={20} className="text-gray-700" />
          </button>
          <Link href="/admin" className="flex items-center gap-3 min-w-0 group">
            <img
              src="/LakuTextLogo.svg"
              alt="Laku"
              className="h-9 hidden sm:block w-auto"
            />
            <img
              src="/LakuIcon.svg"
              alt="Laku"
              className="h-9 w-9 sm:hidden"
            />
            <div className="hidden sm:block border-l border-gray-200 pl-3">
              <p className="text-sm font-semibold text-gray-900 leading-tight">Platform Admin</p>
              <p className="text-xs text-gray-500 leading-tight">Internal tools</p>
            </div>
          </Link>
        </div>
      </div>

      <div className="flex items-center gap-3 justify-end shrink-0">
        {me && (
          <>
            <AdminDistributorReportsBell />
            <div className="text-right hidden sm:block">
              <p className="text-xs text-gray-500 leading-tight">Logged in as</p>
              <p className="text-sm font-semibold text-gray-900 leading-tight">{me.name || me.email}</p>
            </div>
            <div className="w-9 h-9 rounded-full bg-gray-100 border border-gray-200 flex items-center justify-center">
              <User className="w-4 h-4 text-gray-600" />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
