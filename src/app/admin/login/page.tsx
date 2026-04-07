'use client';

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';

export default function PlatformAdminLoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath = useMemo(() => searchParams?.get('next') || '/admin', [searchParams]);

  const [email, setEmail] = useState('');
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
      const res = await fetch('/api/platform-admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error || 'Login failed');
        return;
      }
      setSuccess('Login successful. Redirecting…');
      // Small delay so the admin sees the success state.
      setTimeout(() => router.replace(nextPath), 400);
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0b1220] flex items-center justify-center px-4">
      <div className="w-full max-w-md bg-white rounded-xl border border-[#e6e6e6] shadow-sm p-6">
        <h1 className="text-xl font-semibold text-gray-900">Platform Admin</h1>
        <p className="text-sm text-gray-600 mt-1">Sign in to manage Laku platform settings.</p>

        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Email</label>
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              type="email"
              autoComplete="email"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-black outline-none focus:ring-2 focus:ring-[#0a61d7]/30"
              placeholder="admin@laku.com"
              required
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Password</label>
            <input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              type="password"
              autoComplete="current-password"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-black outline-none focus:ring-2 focus:ring-[#0a61d7]/30"
              placeholder="••••••••"
              required
            />
          </div>

          {success ? (
            <div className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
              {success}
            </div>
          ) : null}
          {error ? <p className="text-sm text-red-600">{error}</p> : null}

          <button
            disabled={loading}
            className="w-full rounded-lg bg-[#0a61d7] text-white py-2 text-sm font-medium hover:bg-[#084ba6] disabled:opacity-60"
            type="submit"
          >
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <p className="text-xs text-gray-500 mt-4">
          <span>This area is for internal platform operations only.</span>{' '}
          <Link href="/admin/register" className="underline text-[#0a61d7] hover:text-[#084ba6]">
            First-time setup
          </Link>
        </p>
      </div>
    </div>
  );
}

