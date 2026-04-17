'use client';

import React, { useEffect, useState } from 'react';
import { X } from 'lucide-react';

type CreatePlatformAdminModalProps = {
  open: boolean;
  onCloseAction: () => void;
  onCreatedAction: () => void | Promise<void>;
};

export default function CreatePlatformAdminModal({
  open,
  onCloseAction,
  onCreatedAction,
}: CreatePlatformAdminModalProps) {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setEmail('');
    setName('');
    setPassword('');
    setError(null);
    setSaving(false);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && !saving) onCloseAction();
  };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onCloseAction, saving]);

  if (!open) return null;

  const submit = async (e: React.FormEvent) => {
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
      onCloseAction();
      try {
        await onCreatedAction();
      } catch {
        // Admin created successfully, callback error is non-critical
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create admin');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="create-admin-modal-title"
    >
      <button
        type="button"
        className="absolute inset-0 cursor-default z-0"
        aria-label="Close dialog"
        onClick={() => !saving && onCloseAction()}
      />
      <div className="relative z-10 w-full max-w-md bg-white rounded-lg border border-[#e6e6e6] shadow-xl overflow-hidden">
        <div className="h-14 px-4 flex items-center justify-between border-b border-[#e6e6e6] shrink-0">
          <h2 id="create-admin-modal-title" className="text-base font-semibold text-gray-900">
            Create admin account
          </h2>
          <button
            type="button"
            onClick={() => !saving && onCloseAction()}
            className="p-2 rounded-lg hover:bg-gray-100 text-gray-700 disabled:opacity-50"
            aria-label="Close"
            disabled={saving}
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <form onSubmit={submit} className="p-4 space-y-3">
          {error ? (
            <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</div>
          ) : null}
          <div>
            <label htmlFor="create-admin-email" className="block text-xs font-medium text-gray-700 mb-1">
              Email
            </label>
            <input
              id="create-admin-email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-black outline-none focus:ring-1 focus:ring-[#0a61d7] focus:border-[#0a61d7]"
              type="email"
              required
              autoComplete="email"
            />
          </div>
          <div>
            <label htmlFor="create-admin-name" className="block text-xs font-medium text-gray-700 mb-1">
              Name (optional)
            </label>
            <input
              id="create-admin-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-black outline-none focus:ring-1 focus:ring-[#0a61d7] focus:border-[#0a61d7]"
              autoComplete="name"
            />
          </div>
          <div>
            <label htmlFor="create-admin-password" className="block text-xs font-medium text-gray-700 mb-1">
              Password
            </label>
            <input
              id="create-admin-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-black outline-none focus:ring-1 focus:ring-[#0a61d7] focus:border-[#0a61d7]"
              type="password"
              minLength={8}
              required
              autoComplete="new-password"
            />
            <p className="text-xs text-gray-500 mt-1">Min 8 characters.</p>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => !saving && onCloseAction()}
              disabled={saving}
              className="px-4 py-2 rounded-lg border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 rounded-lg bg-[#0a61d7] text-white text-sm font-medium hover:bg-[#084ba6] disabled:opacity-60"
            >
              {saving ? 'Creating…' : 'Create admin'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
