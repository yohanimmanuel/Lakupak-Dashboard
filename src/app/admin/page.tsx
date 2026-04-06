'use client';

import React, { useEffect, useState } from 'react';
import AdminLatestUpdatesCard from '@/components/adminstuffs/AdminLatestUpdatesCard';

export default function PlatformAdminHomePage() {
  const [metrics, setMetrics] = useState<{
    totalAdmins: number;
    activeAdmins: number;
    totalAnnouncements: number;
    publishedAnnouncements: number;
    draftAnnouncements: number;
  } | null>(null);

  useEffect(() => {
    fetch('/api/platform-admin/metrics')
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => setMetrics(d?.metrics ?? null))
      .catch(() => {});
  }, []);

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <div className="bg-white border border-[#e6e6e6] rounded-xl p-4">
          <p className="text-xs text-gray-600">Active admins</p>
          <p className="text-2xl font-bold text-gray-900">{metrics?.activeAdmins ?? '—'}</p>
          <p className="text-xs text-gray-500 mt-1">of {metrics?.totalAdmins ?? '—'} total</p>
        </div>
        <div className="bg-white border border-[#e6e6e6] rounded-xl p-4">
          <p className="text-xs text-gray-600">Published updates</p>
          <p className="text-2xl font-bold text-gray-900">{metrics?.publishedAnnouncements ?? '—'}</p>
          <p className="text-xs text-gray-500 mt-1">Visible in Marketplace</p>
        </div>
        <div className="bg-white border border-[#e6e6e6] rounded-xl p-4">
          <p className="text-xs text-gray-600">Draft updates</p>
          <p className="text-2xl font-bold text-gray-900">{metrics?.draftAnnouncements ?? '—'}</p>
          <p className="text-xs text-gray-500 mt-1">Not published yet</p>
        </div>
        <div className="bg-white border border-[#e6e6e6] rounded-xl p-4 opacity-80">
          <p className="text-xs text-gray-600">Account controls</p>
          <p className="text-2xl font-bold text-gray-900">—</p>
          <p className="text-xs text-gray-500 mt-1">Suspensions (next)</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <AdminLatestUpdatesCard />
        <div className="bg-white border border-[#e6e6e6] rounded-xl p-4 opacity-90">
          <p className="text-sm font-semibold text-gray-900">Manage users</p>
          <p className="text-xs text-gray-600 mt-1">
            Next we’ll mirror the interactive table layout (search, actions) like your reference.
          </p>
          <div className="mt-3 text-xs text-gray-500">Coming next.</div>
        </div>
      </div>
    </div>
  );
}

