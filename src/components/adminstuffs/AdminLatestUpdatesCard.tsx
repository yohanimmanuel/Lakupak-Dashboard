'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Megaphone } from 'lucide-react';

type Announcement = {
  id: number;
  title: string;
  category: string;
  isPublished: boolean;
  publishedAt: string | null;
  createdAt: string;
};

export default function AdminLatestUpdatesCard() {
  const [items, setItems] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/platform-admin/announcements?limit=5')
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => setItems(d?.announcements ?? []))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, []);

  const published = useMemo(() => items.filter((a) => a.isPublished).length, [items]);

  return (
    <div className="bg-white border border-[#e6e6e6] rounded-lg p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-gray-900 flex items-center gap-2">
            <Megaphone className="w-4 h-4 text-[#0a61d7]" />
            Latest updates
          </p>
          <p className="text-xs text-gray-600 mt-1">
            Recent announcements for Marketplace. Published: {published}/{items.length}
          </p>
        </div>
        <Link
          href="/admin/announcements"
          className="text-xs font-medium text-[#0a61d7] hover:text-[#084ba6]"
        >
          Manage
        </Link>
      </div>

      <div className="mt-3">
        {loading ? (
          <p className="text-sm text-gray-500">Loading…</p>
        ) : items.length === 0 ? (
          <p className="text-sm text-gray-500">No announcements yet.</p>
        ) : (
          <div className="space-y-2">
            {items.map((a) => (
              <div key={a.id} className="flex items-center justify-between gap-3 border border-gray-200 rounded-lg px-3 py-2">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-900 truncate">{a.title}</p>
                  <p className="text-xs text-gray-500">
                    {a.category}{' '}
                    <span className="text-gray-300">•</span>{' '}
                    {a.isPublished ? `Published` : `Draft`}
                  </p>
                </div>
                <span
                  className={`text-xs px-2 py-0.5 rounded-full whitespace-nowrap ${
                    a.isPublished ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
                  }`}
                >
                  {a.isPublished ? 'Live' : 'Draft'}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

