'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Image from 'next/image';

export default function PlatformAdminRegisterPage() {
  const router = useRouter();
  const [bootstrapKey, setBootstrapKey] = useState('');
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch('/api/platform-admin/bootstrap', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-platform-admin-bootstrap-key': bootstrapKey,
        },
        body: JSON.stringify({ email, password, name }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error || 'Registration failed');
        return;
      }
      setSuccess('Platform admin created. Redirecting…');
      setTimeout(() => router.replace('/admin'), 200);
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0A61D7] flex items-center justify-center px-4">
      <div className="w-full max-w-md bg-white rounded-xl border border-[#e6e6e6] shadow-sm p-6">
        <Image src="/Lakupak!.svg" alt="Lakupak" width={100} height={100} />
        <h1 className="text-xl font-semibold text-gray-900 mt-4">Create platform admin</h1>
        <p className="text-sm text-gray-600 mt-1">
          First-time setup only. Requires the bootstrap key.
        </p>

        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Bootstrap key</label>
            <input
              value={bootstrapKey}
              onChange={(e) => setBootstrapKey(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-black"
              placeholder="PLATFORM_ADMIN_BOOTSTRAP_KEY"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Email</label>
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              type="email"
              autoComplete="email"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-black"
              placeholder="admin@laku.com"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Name (optional)</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-black"
              placeholder="Lakupak Admin"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Password</label>
            <input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              type="password"
              minLength={8}
              autoComplete="new-password"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-black"
              placeholder="Min 8 characters"
              required
            />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}
          {success && <p className="text-sm text-green-700">{success}</p>}

          <button
            disabled={loading}
            className="w-full rounded-lg bg-[#0a61d7] text-white py-2 text-sm font-medium hover:bg-[#084ba6] disabled:opacity-60"
            type="submit"
          >
            {loading ? 'Creating…' : 'Create admin'}
          </button>
        </form>

        <div className="mt-4 flex items-center justify-between text-xs text-gray-600">
          <Link href="/admin/login" className="text-[#0a61d7] hover:text-[#084ba6]">
            Back to sign in
          </Link>
          <span>For internal use only</span>
        </div>
      </div>
    </div>
  );
}

