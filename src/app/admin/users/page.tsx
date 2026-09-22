'use client';

import React, { useCallback, useEffect, useState } from 'react';
import ManageUsersTable from '@/components/adminstuffs/ManageUsersTable';
import { usePlatformAdminInboxSocket } from '@/hooks/usePlatformAdminInboxSocket';

type UserStatusMetrics = {
  platformUserTotal: number;
  platformActiveUsers: number;
  platformUpcomingUsers: number;
  platformSuspendedUsers: number;
};

export default function AdminUsersPage() {
  const [m, setM] = useState<UserStatusMetrics | null>(null);

  const loadMetrics = useCallback(() => {
    fetch('/api/platform-admin/metrics')
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => setM((d?.metrics as UserStatusMetrics) ?? null))
      .catch(() => setM(null));
  }, []);

  useEffect(() => {
    loadMetrics();
  }, [loadMetrics]);

  usePlatformAdminInboxSocket(loadMetrics);

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">Manage users</h1>
          <p className="text-sm text-gray-600 mt-1">
            View distributors (dashboard), marketplace accounts, and drivers in one place.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-white border border-[#e6e6e6] rounded-xl p-4">
          <p className="text-xs text-gray-600">Total users</p>
          <p className="text-2xl font-bold text-gray-900 mt-0.5">{m?.platformUserTotal?.toLocaleString?.() ?? '—'}</p>
          <p className="text-xs text-gray-500 mt-1">All sources</p>
        </div>
        <div className="bg-white border border-[#e6e6e6] rounded-xl p-4">
          <p className="text-xs text-gray-600">Active</p>
          <p className="text-2xl font-bold text-gray-900 mt-0.5">{m?.platformActiveUsers?.toLocaleString?.() ?? '—'}</p>
          <p className="text-xs text-gray-500 mt-1">Can access their apps</p>
        </div>
        <div className="bg-white border border-[#e6e6e6] rounded-xl p-4">
          <p className="text-xs text-gray-600">Upcoming users</p>
          <p className="text-2xl font-bold text-gray-900 mt-0.5">{m?.platformUpcomingUsers?.toLocaleString?.() ?? '—'}</p>
          <p className="text-xs text-gray-500 mt-1">Pending registration &amp; KYC</p>
        </div>
        <div className="bg-white border border-[#e6e6e6] rounded-xl p-4">
          <p className="text-xs text-gray-600">Suspended</p>
          <p className="text-2xl font-bold text-gray-900 mt-0.5">{m?.platformSuspendedUsers?.toLocaleString?.() ?? '—'}</p>
          <p className="text-xs text-gray-500 mt-1">Blocked from access</p>
        </div>
      </div>

      <ManageUsersTable />
    </div>
  );
}
