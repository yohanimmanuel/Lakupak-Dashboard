'use client';

import React, { useEffect, useState } from 'react';
import { Menu as MenuIcon, User } from 'lucide-react';
import { useAdminMenuContext } from './AdminClientLayout';

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
    <div className="flex items-center justify-between px-4 py-3 z-30 relative bg-white border-b border-gray-200 h-16">
      <div className="flex items-center gap-3">
        <button
          onClick={toggleMenu}
          className="p-2 rounded-lg hover:bg-gray-100 transition"
          aria-label="Toggle menu"
        >
          <MenuIcon className="w-5 h-5 text-gray-600" />
        </button>
        <div className="flex items-center gap-2">
          <div>
            <p className="text-sm font-semibold text-gray-900 leading-tight">Platform Admin</p>
            <p className="text-xs text-gray-500 leading-tight">Internal tools</p>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3 justify-end">
        {me && (
          <>
            <div className="text-right">
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

