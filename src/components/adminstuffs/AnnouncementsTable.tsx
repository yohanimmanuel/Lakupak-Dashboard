'use client';

import React, { useMemo, useState } from 'react';
import { Pencil, Trash2, Eye, EyeOff } from 'lucide-react';

export type AnnouncementRow = {
  id: number;
  title: string;
  body: string;
  category: string;
  imageUrl: string | null;
  linkUrl: string | null;
  isPublished: boolean;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

function formatDate(iso: string | null) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString();
}

export default function AnnouncementsTable({
  rows,
  onEditAction,
  onRefreshAction,
}: {
  rows: AnnouncementRow[];
  onEditAction: (row: AnnouncementRow) => void;
  onRefreshAction: () => void;
}) {
  const [busyId, setBusyId] = useState<number | null>(null);

  const counts = useMemo(() => {
    const published = rows.filter((r) => r.isPublished).length;
    return { total: rows.length, published, draft: Math.max(0, rows.length - published) };
  }, [rows]);

  const togglePublish = async (row: AnnouncementRow) => {
    setBusyId(row.id);
    try {
      await fetch(`/api/platform-admin/announcements/${row.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ isPublished: !row.isPublished }),
      });
    } finally {
      setBusyId(null);
      onRefreshAction();
    }
  };

  const remove = async (row: AnnouncementRow) => {
    const ok = window.confirm(`Delete "${row.title}"? This cannot be undone.`);
    if (!ok) return;
    setBusyId(row.id);
    try {
      await fetch(`/api/platform-admin/announcements/${row.id}`, { method: 'DELETE' });
    } finally {
      setBusyId(null);
      onRefreshAction();
    }
  };

  return (
    <div className="bg-white border border-[#e6e6e6] rounded-lg overflow-hidden">
      <div className="px-5 py-4 border-b border-[#e6e6e6] flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-gray-900">Announcements</p>
          <p className="text-xs text-gray-600 mt-1">
            Total: {counts.total} <span className="text-gray-300">•</span> Published: {counts.published}{' '}
            <span className="text-gray-300">•</span> Draft: {counts.draft}
          </p>
        </div>
      </div>

      <div className="overflow-auto p-4">
        <div className="rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-100 text-xs text-gray-600">
            <tr>
              <th className="text-left font-medium px-5 py-3 uppercase">Title</th>
              <th className="text-left font-medium px-4 py-3 uppercase">Category</th>
              <th className="text-left font-medium px-4 py-3 uppercase">Status</th>
              <th className="text-left font-medium px-4 py-3 uppercase">Published</th>
              <th className="text-right font-medium px-5 py-3 uppercase">Actions</th>
            </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-5 py-8 text-gray-500">
                    No announcements yet. Create your first update.
                  </td>
                </tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.id} className="hover:bg-gray-50/50">
                    <td className="px-5 py-3">
                      <p className="font-semibold text-gray-900">{r.title}</p>
                      <p className="text-xs text-gray-600 line-clamp-1 mt-0.5">{r.body}</p>
                    </td>
                    <td className="px-4 py-3 text-gray-700">{r.category}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full ${
                          r.isPublished ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
                        }`}
                      >
                        {r.isPublished ? 'Published' : 'Draft'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-700">{formatDate(r.publishedAt)}</td>
                    <td className="px-5 py-3">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => togglePublish(r)}
                          disabled={busyId === r.id}
                          className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-gray-200 text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                        >
                          {r.isPublished ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                          <span className="text-xs font-semibold">{r.isPublished ? 'Unpublish' : 'Publish'}</span>
                        </button>
                        <button
                          onClick={() => onEditAction(r)}
                          disabled={busyId === r.id}
                          className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-gray-200 text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                        >
                          <Pencil className="w-4 h-4" />
                          <span className="text-xs font-semibold">Edit</span>
                        </button>
                        <button
                          onClick={() => remove(r)}
                          disabled={busyId === r.id}
                          className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-red-200 text-red-700 hover:bg-red-50 disabled:opacity-50"
                        >
                          <Trash2 className="w-4 h-4" />
                          <span className="text-xs font-semibold">Delete</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

