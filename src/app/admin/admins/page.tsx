'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';

type AdminRow = {
  id: number;
  email: string;
  name: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export default function PlatformAdminsPage() {
  const [admins, setAdmins] = useState<AdminRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [saving, setSaving] = useState(false);

  const refresh = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/platform-admin/admins');
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Failed to load admins');
      setAdmins(data.admins || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load admins');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  const activeCount = useMemo(() => admins.filter((a) => a.isActive).length, [admins]);

  const createAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/platform-admin/admins', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, name, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || 'Failed to create admin');
      setEmail('');
      setName('');
      setPassword('');
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create admin');
    } finally {
      setSaving(false);
    }
  };

  const setActive = async (adminId: number, isActive: boolean) => {
    setError(null);
    const previous = admins;
    setAdmins((rows) => rows.map((r) => (r.id === adminId ? { ...r, isActive } : r)));
    try {
      const res = await fetch(`/api/platform-admin/admins/${adminId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || 'Failed to update admin');
      await refresh();
    } catch (e) {
      setAdmins(previous);
      setError(e instanceof Error ? e.message : 'Failed to update admin');
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Platform admins</h1>
          <p className="text-sm text-gray-600 mt-1">
            Manage who can access the platform admin area. Active admins: {activeCount}
          </p>
        </div>
      </div>

        {error && (
          <div className="mt-4 bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
          <div className="bg-white border border-[#e6e6e6] rounded-lg p-4">
            <p className="text-sm font-semibold text-gray-900">Create admin</p>
            <form onSubmit={createAdmin} className="mt-4 space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Email</label>
                <input
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-black"
                  type="email"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Name (optional)</label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-black"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Password</label>
                <input
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-black"
                  type="password"
                  minLength={8}
                  required
                />
                <p className="text-xs text-gray-500 mt-1">Min 8 characters.</p>
              </div>
              <button
                disabled={saving}
                className="w-full rounded-lg bg-[#0a61d7] text-white py-2 text-sm font-medium hover:bg-[#084ba6] disabled:opacity-60"
              >
                {saving ? 'Creating…' : 'Create admin'}
              </button>
            </form>
          </div>

          <div className="bg-white border border-[#e6e6e6] rounded-lg p-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-gray-900">Admins</p>
              <button
                onClick={refresh}
                className="text-xs px-2 py-1 rounded border border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
              >
                Refresh
              </button>
            </div>

            <div className="mt-4">
              {loading ? (
                <p className="text-sm text-gray-600">Loading…</p>
              ) : admins.length === 0 ? (
                <p className="text-sm text-gray-600">No admins found.</p>
              ) : (
                <div className="space-y-3">
                  {admins.map((a) => (
                    <div key={a.id} className="flex items-center justify-between border border-gray-200 rounded-lg p-3">
                      <div>
                        <p className="text-sm font-semibold text-gray-900">{a.email}</p>
                        <p className="text-xs text-gray-600">{a.name || '—'}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span
                          className={`text-xs px-2 py-0.5 rounded-full ${a.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}
                        >
                          {a.isActive ? 'Active' : 'Inactive'}
                        </span>
                        <button
                          onClick={() => setActive(a.id, !a.isActive)}
                          className="text-xs px-2 py-1 rounded border border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
                        >
                          {a.isActive ? 'Deactivate' : 'Activate'}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
    </div>
  );
}

