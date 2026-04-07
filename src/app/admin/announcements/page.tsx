'use client';

import React, { useEffect, useState } from 'react';
import { Plus, Search } from 'lucide-react';
import AnnouncementEditorModal, { EditableAnnouncement } from '@/components/adminstuffs/AnnouncementEditorModal';
import AnnouncementsTable, { AnnouncementRow } from '@/components/adminstuffs/AnnouncementsTable';

export default function PlatformAdminAnnouncementsPage() {
  const [rows, setRows] = useState<AnnouncementRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');

  const applyRowsAction = (updater: (prev: AnnouncementRow[]) => AnnouncementRow[]) => {
    setRows((prev) => updater(prev));
  };

  const [editorOpen, setEditorOpen] = useState(false);
  const [editorMode, setEditorMode] = useState<'create' | 'edit'>('create');
  const [editorInitial, setEditorInitial] = useState<EditableAnnouncement | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const r = await fetch('/api/platform-admin/announcements?limit=100');
      const d = r.ok ? await r.json() : null;
      setRows((d?.announcements ?? []) as AnnouncementRow[]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load().catch(() => {});
  }, []);

  const openCreate = () => {
    setEditorMode('create');
    setEditorInitial({
      title: '',
      body: '',
      category: 'update',
      imageUrl: '',
      isPublished: false,
    });
    setEditorOpen(true);
  };

  const openEdit = (row: AnnouncementRow) => {
    setEditorMode('edit');
    setEditorInitial({
      id: row.id,
      title: row.title,
      body: row.body,
      category: row.category,
      imageUrl: row.imageUrl,
      isPublished: row.isPublished,
    });
    setEditorOpen(true);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-start md:items-center justify-between gap-3 flex-col md:flex-row">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Latest updates</h1>
          <p className="text-sm text-gray-600 mt-1">
            Create announcements that appear in the Marketplace app under “Latest updates”.
          </p>
        </div>

        <div className="flex items-center gap-2 w-full md:w-auto">
          <div className="relative flex-1 md:w-[340px]">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search updates…"
              className="w-full border border-gray-200 rounded-lg pl-9 pr-3 py-2 text-sm text-black outline-none focus:ring-1 focus:ring-[#0a61d7] focus:border-[#0a61d7] bg-white"
            />
          </div>

          <button
            onClick={openCreate}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#0a61d7] text-white text-sm font-semibold hover:bg-[#084ba6]"
          >
            <Plus className="w-4 h-4" />
            New update
          </button>
        </div>
      </div>

      {loading ? (
        <div className="bg-white border border-[#e6e6e6] rounded-xl p-5 text-sm text-gray-600">Loading…</div>
      ) : (
        <AnnouncementsTable
          rows={rows}
          searchQuery={query}
          onEditAction={openEdit}
          onRefreshAction={load}
          onApplyRowsAction={applyRowsAction}
        />
      )}

      <AnnouncementEditorModal
        open={editorOpen}
        mode={editorMode}
        initial={editorInitial}
        onCloseAction={() => setEditorOpen(false)}
        onSavedAction={load}
      />
    </div>
  );
}

