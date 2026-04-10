'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  Building2,
  Ban,
  CheckCircle2,
  Flag,
  Loader2,
  MapPin,
  Navigation,
  Package,
  Search,
  Shield,
  Smartphone,
  Store,
  Truck,
  UserCircle,
  Users,
} from 'lucide-react';

function formatDt(v: string | Date | null | undefined) {
  if (v == null) return '—';
  const d = typeof v === 'string' ? new Date(v) : v;
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function BoolPill(v: boolean | null | undefined) {
  if (v == null) return '—';
  return (
    <span
      className={`inline-block text-xs font-semibold px-2 py-0.5 rounded-full ${
        v ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-700'
      }`}
    >
      {v ? 'Yes' : 'No'}
    </span>
  );
}

/** Company fields often store JSON string arrays — show as chips instead of raw JSON. */
function parseStringList(value: unknown): string[] {
  if (value == null) return [];
  if (Array.isArray(value)) {
    return value.map((x) => String(x).trim()).filter(Boolean);
  }
  if (typeof value !== 'string') return [];
  const t = value.trim();
  if (!t) return [];
  if (t.startsWith('[')) {
    try {
      const p = JSON.parse(t);
      if (Array.isArray(p)) return p.map((x) => String(x).trim()).filter(Boolean);
    } catch {
      /* fall through */
    }
  }
  return [t];
}

function StringChips({ items }: { items: string[] }) {
  if (items.length === 0) {
    return <span className="text-sm text-gray-400 italic">Not set</span>;
  }
  return (
    <ul className="flex flex-wrap gap-2 list-none m-0 p-0">
      {items.map((s, idx) => (
        <li
          key={`${s}-${idx}`}
          className="px-2.5 py-1 rounded-md bg-slate-100 text-slate-800 text-xs font-medium border border-slate-200/80"
        >
          {s}
        </li>
      ))}
    </ul>
  );
}

function TextOrEmpty({ value, multiline }: { value: string | null | undefined; multiline?: boolean }) {
  const t = typeof value === 'string' ? value.trim() : '';
  if (!t) return <span className="text-sm text-gray-400 italic">Not provided</span>;
  return (
    <span className={`text-sm text-gray-900 ${multiline ? 'whitespace-pre-wrap break-words' : ''}`}>{t}</span>
  );
}

function complianceStatusClass(status: string) {
  const s = status.trim().toLowerCase();
  if (s.includes('approv') || s.includes('verified') || s === 'active') {
    return 'bg-emerald-50 text-emerald-900 border-emerald-200';
  }
  if (s.includes('pending') || s.includes('review')) {
    return 'bg-amber-50 text-amber-900 border-amber-200';
  }
  if (s.includes('reject') || s.includes('suspend') || s.includes('block')) {
    return 'bg-red-50 text-red-900 border-red-200';
  }
  return 'bg-slate-100 text-slate-800 border-slate-200';
}

function marketplaceActivityTypeClass(t: string) {
  const x = t.trim().toLowerCase();
  if (x.includes('purchased') || x.includes('purchase')) return 'bg-violet-100 text-violet-900 border-violet-200';
  if (x.includes('cart')) return 'bg-amber-100 text-amber-900 border-amber-200';
  if (x.includes('favorite') || x.includes('favourite')) return 'bg-pink-100 text-pink-900 border-pink-200';
  if (x.includes('view')) return 'bg-slate-100 text-slate-800 border-slate-200';
  return 'bg-gray-100 text-gray-800 border-gray-200';
}

function driverStatusClass(status: string | null | undefined) {
  if (status == null || !String(status).trim()) {
    return 'bg-gray-100 text-gray-600 border-gray-200';
  }
  const x = String(status).toLowerCase();
  if (x.includes('active') || x.includes('available')) return 'bg-emerald-50 text-emerald-900 border-emerald-200';
  if (x.includes('busy') || x.includes('transit')) return 'bg-blue-50 text-blue-900 border-blue-200';
  if (x.includes('off') || x.includes('inactive') || x.includes('suspend')) {
    return 'bg-gray-100 text-gray-700 border-gray-200';
  }
  return 'bg-slate-100 text-slate-800 border-slate-200';
}

function DistributorField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-xs font-medium text-gray-500 mb-1">{label}</p>
      <div className="min-h-[1.25rem]">{children}</div>
    </div>
  );
}

function DistributorSection({
  title,
  icon: Icon,
  children,
  className = '',
}: {
  title: string;
  icon?: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`rounded-xl border border-[#e6e6e6] bg-[#fafbfc] overflow-hidden ${className}`}>
      <div className="flex items-center gap-2 px-4 py-3 border-b border-[#e6e6e6] bg-white/80">
        {Icon ? <Icon className="w-4 h-4 text-[#0a61d7] shrink-0" aria-hidden /> : null}
        <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
      </div>
      <div className="p-4 text-sm">{children}</div>
    </div>
  );
}

function SuspendDistributorControl({
  userId,
  isSuspended,
  onUpdated,
}: {
  userId: number;
  isSuspended: boolean;
  onUpdated: (next: { isSuspended: boolean; suspendedAt: string | null; suspensionReason: string | null }) => void;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState('');
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setErr(null);
    try {
      const nextSuspended = !isSuspended;
      const res = await fetch(`/api/platform-admin/users/dashboard/${userId}/suspension`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ isSuspended: nextSuspended, reason: nextSuspended ? reason : null }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        user?: { isSuspended: boolean; suspendedAt: string | null; suspensionReason: string | null };
      };
      if (!res.ok) throw new Error(data?.error || 'Failed to update suspension');
      const u = data.user;
      if (!u) throw new Error('Invalid response');

      onUpdated({
        isSuspended: Boolean(u.isSuspended),
        suspendedAt: u.suspendedAt ?? null,
        suspensionReason: u.suspensionReason ?? null,
      });
      setOpen(false);
      setReason('');
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to update suspension');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setErr(null);
          setOpen(true);
        }}
        className={`inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-colors border ${
          isSuspended
            ? 'bg-white text-emerald-700 border-emerald-200 hover:bg-emerald-50'
            : 'bg-white text-red-700 border-red-200 hover:bg-red-50'
        }`}
      >
        {isSuspended ? (
          <>
            <CheckCircle2 className="w-4 h-4" />
            Unsuspend
          </>
        ) : (
          <>
            <Ban className="w-4 h-4" />
            Suspend
          </>
        )}
      </button>

      {open ? (
        <div className="fixed inset-0 z-[70] bg-black/50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-md bg-white rounded-lg border border-[#e6e6e6] shadow-xl overflow-hidden">
            <div className="h-14 px-4 flex items-center justify-between border-b border-[#e6e6e6]">
              <h2 className="text-base font-semibold text-gray-900">{isSuspended ? 'Unsuspend distributor' : 'Suspend distributor'}</h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="p-2 rounded-lg hover:bg-gray-100 text-gray-700 disabled:opacity-50"
                disabled={busy}
                aria-label="Close"
              >
                <span className="text-lg leading-none">×</span>
              </button>
            </div>

            <div className="p-4 space-y-3">
              {isSuspended ? (
                <p className="text-sm text-gray-600">This will restore dashboard access for this distributor.</p>
              ) : (
                <>
                  <p className="text-sm text-gray-600">
                    Suspending will block this distributor from signing in and using the dashboard.
                  </p>
                  <div>
                    <label className="text-xs font-medium text-gray-600">Reason (optional)</label>
                    <textarea
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      className="mt-1 w-full min-h-[84px] rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 outline-none focus:ring-1 focus:ring-[#0a61d7] focus:border-[#0a61d7]"
                      placeholder="e.g. Commission overdue, compliance breach, repeated violations…"
                      disabled={busy}
                    />
                  </div>
                </>
              )}

              {err ? (
                <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{err}</p>
              ) : null}
            </div>

            <div className="p-4 border-t border-[#e6e6e6] flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                disabled={busy}
                className="px-4 py-2 rounded-lg border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void submit()}
                disabled={busy}
                className={`px-4 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-60 ${
                  isSuspended ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-red-600 hover:bg-red-700'
                }`}
              >
                {busy ? 'Saving…' : isSuspended ? 'Unsuspend' : 'Suspend'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

type ApiOk =
  | { source: 'dashboard'; data: Record<string, unknown> }
  | { source: 'marketplace'; data: Record<string, unknown> }
  | { source: 'driver'; data: Record<string, unknown> };

function formatRelative(v: string | Date | null | undefined) {
  if (!v) return null;
  const d = typeof v === 'string' ? new Date(v) : v;
  if (Number.isNaN(d.getTime())) return null;
  const diffMs = Date.now() - d.getTime();
  const mins = Math.round(diffMs / 60000);
  if (mins < 2) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 48) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

export default function PlatformUserDetailPage() {
  const params = useParams();
  const source = (params?.source as string)?.toLowerCase() ?? '';
  const id = params?.id as string;
  const [state, setState] = useState<{ loading: true } | { loading: false; error: string } | { loading: false; body: ApiOk }>(
    { loading: true }
  );

  useEffect(() => {
    if (!source || !id) {
      setState({ loading: false, error: 'Invalid link.' });
      return;
    }
    let cancelled = false;
    setState({ loading: true });
    fetch(`/api/platform-admin/users/${encodeURIComponent(source)}/${encodeURIComponent(id)}`)
      .then(async (r) => {
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(j?.error || 'Failed to load');
        if (cancelled) return;
        setState({ loading: false, body: j as ApiOk });
      })
      .catch((e) => {
        if (!cancelled) setState({ loading: false, error: e instanceof Error ? e.message : 'Failed to load' });
      });
    return () => {
      cancelled = true;
    };
  }, [source, id]);

  if (state.loading) {
    return (
      <div className="bg-white p-4 rounded-lg border border-[#e6e6e6] flex items-center justify-center py-20 text-gray-600 gap-2">
        <Loader2 className="w-5 h-5 animate-spin" />
        Loading…
      </div>
    );
  }

  if ('error' in state) {
    return (
      <div className="bg-white p-4 rounded-lg border border-[#e6e6e6] space-y-4">
        <Link href="/admin/users" className="inline-flex items-center gap-1 text-sm text-[#0a61d7] hover:underline">
          <ArrowLeft className="w-4 h-4" />
          Back to users
        </Link>
        <div className="rounded-lg border border-red-200 bg-red-50 text-red-800 text-sm px-4 py-3">{state.error}</div>
      </div>
    );
  }

  const { body } = state;

  if (body.source === 'dashboard') {
    const u = body.data as {
      id: number;
      firstName: string | null;
      lastName: string | null;
      email: string;
      phone: string | null;
      name: string | null;
      avatar: string | null;
      image: string | null;
      bio: string | null;
      location: string | null;
      region: string | null;
      language: string;
      currency: string;
      emailVerified: string | Date | null;
      createdAt: string;
      updatedAt: string;
      company: Record<string, unknown> | null;
      _count: Record<string, number>;
      isSuspended?: boolean;
      suspendedAt?: string | Date | null;
      suspensionReason?: string | null;
      reportedDistributorReports?: Array<{
        id: number;
        reasonCode: string;
        reasonText: string;
        reasonDetail: string | null;
        imageUrls: string[];
        createdAt: string;
        adminReadAt: string | null;
        reporter: {
          id: number;
          username: string;
          name: string | null;
          email: string | null;
          phone: string;
        };
      }>;
    };
    const c = u.company;
    const displayName = (u.name || `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim() || u.email) as string;
    const avatarUrl = u.avatar || u.image;

    const shippingItems = c ? parseStringList(c.shippingPreferences) : [];
    const slotItems = c ? parseStringList(c.deliveryTimeSlots) : [];
    const dayItems = c ? parseStringList(c.preferredDeliveryDays) : [];

    const isSuspended = Boolean(u.isSuspended);
    const suspendedAtLabel = u.suspendedAt ? formatDt(u.suspendedAt) : null;
    const suspendedAtRelative = u.suspendedAt ? formatRelative(u.suspendedAt) : null;
    const suspensionReason = (u.suspensionReason ?? '').trim();

    const complianceLabel = c ? String(c.complianceStatus ?? 'Pending').trim() || 'Pending' : '';
    const compliancePending =
      c != null && (complianceLabel.toLowerCase().includes('pending') || complianceLabel.toLowerCase().includes('review'));

    const activityStats = [
      { label: 'Products', value: u._count?.products ?? 0 },
      { label: 'Orders', value: u._count?.orders ?? 0 },
      { label: 'Buyers', value: u._count?.buyers ?? 0 },
      { label: 'Suppliers', value: u._count?.suppliers ?? 0 },
      { label: 'Drivers', value: u._count?.drivers ?? 0 },
      { label: 'Fleets', value: u._count?.fleets ?? 0 },
      { label: 'Offers', value: u._count?.offers ?? 0 },
      { label: 'Campaigns', value: u._count?.campaigns ?? 0 },
      { label: 'Sales agents', value: u._count?.salesAgents ?? 0 },
      { label: 'Sales teams', value: u._count?.salesTeams ?? 0 },
      { label: 'Notifications', value: u._count?.notifications ?? 0 },
      { label: 'Seller reviews', value: u._count?.distributorReviewsReceived ?? 0 },
      { label: 'Buyer reports', value: u._count?.reportedDistributorReports ?? 0 },
    ];

    return (
      <div className="bg-white p-4 sm:p-5 rounded-lg border border-[#e6e6e6]">
        <div className="flex flex-wrap items-center gap-3 justify-between mb-5">
          <Link href="/admin/users" className="inline-flex items-center gap-1 text-sm text-[#0a61d7] hover:underline">
            <ArrowLeft className="w-4 h-4" />
            Back to users
          </Link>
          <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-blue-100 text-blue-800">Distributor</span>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-start gap-4 mb-6 pb-6 border-b border-[#e6e6e6]">
          <div className="h-14 w-14 rounded-full bg-slate-200 border border-[#e6e6e6] overflow-hidden shrink-0 flex items-center justify-center text-lg font-semibold text-slate-600">
            {avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              displayName.charAt(0).toUpperCase()
            )}
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-semibold text-gray-900 tracking-tight">{displayName}</h1>
            <p className="text-sm text-gray-600 mt-1 break-all">{u.email}</p>
            <p className="text-xs text-gray-500 mt-2">
              Account ID <span className="font-mono text-gray-700">{u.id}</span>
              {c ? (
                <>
                  {' · '}
                  Company <span className="font-mono text-gray-700">{String(c.id)}</span>
                </>
              ) : null}
            </p>
          </div>
          <div className="sm:text-right">
            {isSuspended ? (
              <span className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-red-200 bg-red-50 text-red-900 text-xs font-semibold">
                <Ban className="w-4 h-4" />
                Suspended
              </span>
            ) : (
              <span className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-900 text-xs font-semibold">
                <CheckCircle2 className="w-4 h-4" />
                Active
              </span>
            )}
            {isSuspended && (suspendedAtLabel || suspensionReason) ? (
              <div className="mt-2 text-[11px] text-gray-600 max-w-[320px] sm:ml-auto">
                {suspendedAtLabel ? (
                  <div>
                    Since <span className="font-medium text-gray-800">{suspendedAtLabel}</span>
                    {suspendedAtRelative ? <span className="text-gray-400"> · {suspendedAtRelative}</span> : null}
                  </div>
                ) : null}
                {suspensionReason ? (
                  <div className="mt-1">
                    Reason: <span className="text-gray-800">{suspensionReason}</span>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>

        <div className="space-y-5">
          <DistributorSection title="Account access (suspension)" icon={Ban}>
            <p className="text-xs text-gray-600 mb-3">
              Suspending a distributor blocks dashboard access and can be used for compliance or payment enforcement.
            </p>
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
              <div className="space-y-1">
                <p className="text-sm font-semibold text-gray-900">
                  Status:{' '}
                  <span className={isSuspended ? 'text-red-700' : 'text-emerald-700'}>
                    {isSuspended ? 'Suspended' : 'Active'}
                  </span>
                </p>
                {isSuspended ? (
                  <>
                    <p className="text-xs text-gray-600">
                      This account is currently blocked from using the dashboard.
                    </p>
                    {suspendedAtLabel ? (
                      <p className="text-xs text-gray-500">
                        Suspended at <span className="font-medium text-gray-700">{suspendedAtLabel}</span>
                        {suspendedAtRelative ? <span className="text-gray-400"> · {suspendedAtRelative}</span> : null}
                      </p>
                    ) : null}
                    {suspensionReason ? (
                      <p className="text-xs text-gray-600">
                        Reason: <span className="text-gray-800">{suspensionReason}</span>
                      </p>
                    ) : null}
                  </>
                ) : (
                  <p className="text-xs text-gray-600">This account can sign in and use the dashboard normally.</p>
                )}
              </div>

              <SuspendDistributorControl
                userId={u.id}
                isSuspended={isSuspended}
                onUpdated={(next) => {
                  setState((prev) => {
                    if ('body' in prev && prev.body.source === 'dashboard') {
                      return {
                        loading: false,
                        body: {
                          source: 'dashboard',
                          data: { ...(prev.body.data as Record<string, unknown>), ...next },
                        },
                      };
                    }
                    return prev;
                  });
                }}
              />
            </div>
          </DistributorSection>

          <DistributorSection title="Buyer reports (marketplace)" icon={Flag}>
            <p className="text-xs text-gray-600 mb-3">
              Reports submitted by marketplace buyers about this distributor. New reports also appear in the admin
              navbar bell.
            </p>
            {!u.reportedDistributorReports || u.reportedDistributorReports.length === 0 ? (
              <p className="text-sm text-gray-500 italic">No reports filed against this distributor yet.</p>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-[#e6e6e6]">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50 text-gray-600">
                    <tr>
                      <th className="text-left font-medium px-3 py-2.5">When</th>
                      <th className="text-left font-medium px-3 py-2.5">Reporter</th>
                      <th className="text-left font-medium px-3 py-2.5">Reason</th>
                      <th className="text-left font-medium px-3 py-2.5">Detail</th>
                      <th className="text-left font-medium px-3 py-2.5">Photos</th>
                      <th className="text-left font-medium px-3 py-2.5">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {u.reportedDistributorReports.map((r) => {
                      const reporterName =
                        (r.reporter.name && r.reporter.name.trim()) ||
                        r.reporter.username ||
                        `Buyer #${r.reporter.id}`;
                      const photos = Array.isArray(r.imageUrls) ? r.imageUrls : [];
                      return (
                        <tr key={r.id} className="border-t border-[#e6e6e6] bg-white">
                          <td className="px-3 py-2.5 text-gray-800 whitespace-nowrap">{formatDt(r.createdAt)}</td>
                          <td className="px-3 py-2.5">
                            <Link
                              href={`/admin/users/marketplace/${r.reporter.id}`}
                              className="text-[#0a61d7] hover:underline font-medium"
                            >
                              {reporterName}
                            </Link>
                          </td>
                          <td className="px-3 py-2.5 text-gray-800">
                            <span className="font-medium">{r.reasonText}</span>
                            <div className="text-[10px] text-gray-500 mt-0.5">{r.reasonCode}</div>
                          </td>
                          <td className="px-3 py-2.5 text-gray-700 max-w-[200px]">
                            {r.reasonDetail ? (
                              <span className="whitespace-pre-wrap break-words">{r.reasonDetail}</span>
                            ) : (
                              <span className="text-gray-400 italic">—</span>
                            )}
                          </td>
                          <td className="px-3 py-2.5 align-top">
                            {photos.length === 0 ? (
                              <span className="text-gray-400 italic">—</span>
                            ) : (
                              <div className="flex flex-wrap gap-1.5 max-w-[220px]">
                                {photos.slice(0, 5).map((url) => (
                                  <a
                                    key={url}
                                    href={url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="block shrink-0 rounded-md border border-[#e6e6e6] overflow-hidden bg-gray-50 hover:opacity-90"
                                    title="Open image"
                                  >
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img src={url} alt="" className="w-12 h-12 object-cover" />
                                  </a>
                                ))}
                              </div>
                            )}
                          </td>
                          <td className="px-3 py-2.5">
                            {r.adminReadAt ? (
                              <span className="inline-flex items-center text-[10px] font-semibold px-2 py-0.5 rounded-full bg-gray-100 text-gray-700 border border-gray-200">
                                Reviewed
                              </span>
                            ) : (
                              <span className="inline-flex items-center text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-50 text-amber-900 border border-amber-200">
                                New
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </DistributorSection>

          <DistributorSection title="Login & profile" icon={UserCircle}>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4">
              <DistributorField label="Email">
                <span className="text-sm text-gray-900 break-all">{u.email}</span>
              </DistributorField>
              <DistributorField label="Phone">
                <TextOrEmpty value={u.phone} />
              </DistributorField>
              <DistributorField label="Region">
                <TextOrEmpty value={u.region} />
              </DistributorField>
              <DistributorField label="Language / currency">
                <span className="text-sm text-gray-900">
                  {u.language} · {u.currency}
                </span>
              </DistributorField>
              <DistributorField label="Email verified">
                <span className="text-sm text-gray-900">{u.emailVerified ? formatDt(u.emailVerified) : '—'}</span>
              </DistributorField>
              <DistributorField label="Joined / updated">
                <span className="text-sm text-gray-900">
                  {formatDt(u.createdAt)} → {formatDt(u.updatedAt)}
                </span>
              </DistributorField>
              <DistributorField label="Location">
                <TextOrEmpty value={u.location} />
              </DistributorField>
              <DistributorField label="Bio">
                <TextOrEmpty value={u.bio} multiline />
              </DistributorField>
            </div>
          </DistributorSection>

          {!c ? (
            <DistributorSection title="Company" icon={Building2}>
              <p className="text-sm text-gray-600">No company profile is linked to this distributor yet.</p>
            </DistributorSection>
          ) : (
            <>
              <DistributorSection title="Company profile" icon={Building2}>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4">
                  <DistributorField label="Legal / display name">
                    <span className="text-sm font-medium text-gray-900">{String(c.name ?? '')}</span>
                  </DistributorField>
                  <DistributorField label="Industry">
                    <TextOrEmpty value={c.industryType as string | null} />
                  </DistributorField>
                  <DistributorField label="Company size">
                    <TextOrEmpty value={c.companySize as string | null} />
                  </DistributorField>
                  <DistributorField label="Years in operation">
                    <TextOrEmpty value={c.yearsInOperation as string | null} />
                  </DistributorField>
                  <DistributorField label="Business registration no.">
                    <TextOrEmpty value={c.businessRegistrationNumber as string | null} />
                  </DistributorField>
                  <DistributorField label="Tax ID">
                    <TextOrEmpty value={c.taxId as string | null} />
                  </DistributorField>
                  <div className="sm:col-span-2">
                    <DistributorField label="Business description">
                      <TextOrEmpty value={c.businessDescription as string | null} multiline />
                    </DistributorField>
                  </div>
                </div>
              </DistributorSection>

              <DistributorSection title="Compliance & verification" icon={Shield}>
                {compliancePending ? (
                  <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50/90 px-3 py-2.5 text-xs text-amber-950">
                    <strong className="font-semibold">Action may be needed:</strong> compliance is still{' '}
                    <span className="font-medium">{complianceLabel}</span>. Confirm company documents and license before
                    treating this account as fully cleared.
                  </div>
                ) : null}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4">
                  <DistributorField label="Compliance status">
                    <span
                      className={`inline-flex items-center text-xs font-semibold px-2.5 py-1 rounded-md border ${complianceStatusClass(complianceLabel)}`}
                    >
                      {complianceLabel}
                    </span>
                  </DistributorField>
                  <DistributorField label="Verification checklist">
                    <div className="flex flex-wrap gap-3 text-sm">
                      <span className="inline-flex items-center gap-1.5">
                        <span className="text-gray-500">Documents</span>
                        {BoolPill(c.documentVerification as boolean)}
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        <span className="text-gray-500">Business license</span>
                        {BoolPill(c.businessLicenseVerification as boolean)}
                      </span>
                    </div>
                  </DistributorField>
                </div>
              </DistributorSection>

              <DistributorSection title="Business contact & addresses" icon={Building2}>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4">
                  <DistributorField label="Business phone">
                    <TextOrEmpty value={c.businessPhone as string | null} />
                  </DistributorField>
                  <DistributorField label="Business email">
                    <TextOrEmpty value={c.businessEmail as string | null} />
                  </DistributorField>
                  <div className="sm:col-span-2">
                    <DistributorField label="Business address">
                      <TextOrEmpty value={c.businessAddress as string | null} multiline />
                    </DistributorField>
                  </div>
                  <div className="sm:col-span-2">
                    <DistributorField label="Pickup address">
                      <TextOrEmpty value={c.pickupAddress as string | null} multiline />
                    </DistributorField>
                  </div>
                </div>
              </DistributorSection>

              <DistributorSection title="Logistics preferences" icon={Truck}>
                <div className="space-y-5">
                  <div>
                    <p className="text-xs font-medium text-gray-500 mb-2">Shipping methods offered</p>
                    <StringChips items={shippingItems} />
                  </div>
                  <div>
                    <p className="text-xs font-medium text-gray-500 mb-2">Delivery time slots</p>
                    <StringChips items={slotItems} />
                  </div>
                  <div>
                    <p className="text-xs font-medium text-gray-500 mb-2">Preferred delivery days</p>
                    <StringChips items={dayItems} />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <DistributorField label="Default lead time (min–max days)">
                      <span className="text-sm text-gray-900 tabular-nums">
                        {c.defaultDeliveryLeadTimeMinDays != null ? String(c.defaultDeliveryLeadTimeMinDays) : '—'} —{' '}
                        {c.defaultDeliveryLeadTimeMaxDays != null ? String(c.defaultDeliveryLeadTimeMaxDays) : '—'}
                      </span>
                    </DistributorField>
                    <DistributorField label="Special instructions">
                      <TextOrEmpty value={c.specialInstructions as string | null} multiline />
                    </DistributorField>
                  </div>
                </div>
              </DistributorSection>
            </>
          )}

          <DistributorSection title="Platform activity" icon={Package}>
            <p className="text-xs text-gray-500 mb-3">Counts are from this distributor&apos;s dashboard usage (not marketplace buyers).</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {activityStats.map(({ label, value }) => (
                <div
                  key={label}
                  className="rounded-lg border border-[#e6e6e6] bg-white p-3"
                >
                  <p className="text-xl font-semibold text-gray-900 tabular-nums leading-none">{value}</p>
                  <p className="text-xs text-gray-600 mt-2 leading-snug">{label}</p>
                </div>
              ))}
            </div>
          </DistributorSection>
        </div>
      </div>
    );
  }

  if (body.source === 'marketplace') {
    const u = body.data as {
      id: number;
      username: string;
      email: string | null;
      phone: string;
      name: string | null;
      storeName: string | null;
      country: string | null;
      bio: string | null;
      chosenAddress: string | null;
      image: string | null;
      bannerImage: string | null;
      createdAt: string;
      updatedAt: string;
      addresses: Array<{
        id: number;
        label: string;
        fullName: string;
        phone: string;
        address: string;
        isDefault: boolean;
      }>;
      userActivities: Array<{ id: number; productId: string; activityType: string; createdAt: string }>;
      searchHistory: Array<{ id: number; query: string; createdAt: string }>;
      pushNotificationTokens: Array<{ id: number; platform: string; isActive: boolean; createdAt: string }>;
      _count: Record<string, number>;
    };
    const displayName = (u.name || u.username) as string;
    const mpStats = [
      { label: 'Activities logged', value: u._count.userActivities },
      { label: 'Search queries saved', value: u._count.searchHistory },
      { label: 'Push devices', value: u._count.pushNotificationTokens },
      { label: 'Product reviews', value: u._count.productReviews },
      { label: 'Delivery reviews', value: u._count.orderDeliveryReviews },
      { label: 'Seller reviews', value: u._count.distributorReviews },
      { label: 'Return requests', value: u._count.orderReturnRequests },
      { label: 'Order cancellations', value: u._count.orderCancellations },
    ];

    return (
      <div className="bg-white p-4 sm:p-5 rounded-lg border border-[#e6e6e6]">
        <div className="flex flex-wrap items-center gap-3 justify-between mb-5">
          <Link href="/admin/users" className="inline-flex items-center gap-1 text-sm text-[#0a61d7] hover:underline">
            <ArrowLeft className="w-4 h-4" />
            Back to users
          </Link>
          <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800">
            Marketplace buyer
          </span>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-start gap-4 mb-6 pb-6 border-b border-[#e6e6e6]">
          <div className="h-14 w-14 rounded-full bg-emerald-100 border border-emerald-200/80 overflow-hidden shrink-0 flex items-center justify-center text-lg font-semibold text-emerald-800">
            {u.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={u.image} alt="" className="h-full w-full object-cover" />
            ) : (
              displayName.charAt(0).toUpperCase()
            )}
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-semibold text-gray-900 tracking-tight">{displayName}</h1>
            <p className="text-sm text-gray-600 mt-1">
              <span className="font-medium text-gray-800">@{u.username}</span>
              {u.email ? <span className="text-gray-400 mx-1.5">·</span> : null}
              {u.email ? <span className="break-all">{u.email}</span> : null}
            </p>
            <p className="text-xs text-gray-500 mt-2">
              Marketplace user ID <span className="font-mono text-gray-700">{u.id}</span>
            </p>
          </div>
        </div>

        <div className="space-y-5">
          <DistributorSection title="Profile & store" icon={Store}>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4">
              <DistributorField label="Username">
                <span className="text-sm font-medium text-gray-900">@{u.username}</span>
              </DistributorField>
              <DistributorField label="Phone">
                <span className="text-sm text-gray-900">{u.phone}</span>
              </DistributorField>
              <DistributorField label="Email">
                <TextOrEmpty value={u.email} />
              </DistributorField>
              <DistributorField label="Store name">
                <TextOrEmpty value={u.storeName} />
              </DistributorField>
              <DistributorField label="Country">
                <TextOrEmpty value={u.country} />
              </DistributorField>
              <DistributorField label="Joined / updated">
                <span className="text-sm text-gray-900">
                  {formatDt(u.createdAt)} → {formatDt(u.updatedAt)}
                </span>
              </DistributorField>
              <div className="sm:col-span-2">
                <DistributorField label="Default / chosen address">
                  <TextOrEmpty value={u.chosenAddress} multiline />
                </DistributorField>
              </div>
              <div className="sm:col-span-2">
                <DistributorField label="Bio">
                  <TextOrEmpty value={u.bio} multiline />
                </DistributorField>
              </div>
            </div>
            {u.bannerImage ? (
              <div className="mt-4 pt-4 border-t border-[#e6e6e6]">
                <p className="text-xs font-medium text-gray-500 mb-2">Banner image URL</p>
                <a
                  href={u.bannerImage}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-[#0a61d7] hover:underline break-all"
                >
                  {u.bannerImage}
                </a>
              </div>
            ) : null}
          </DistributorSection>

          <DistributorSection title="Saved delivery addresses" icon={MapPin}>
            {u.addresses.length === 0 ? (
              <p className="text-sm text-gray-500 italic">No saved addresses in the marketplace app.</p>
            ) : (
              <ul className="space-y-3">
                {u.addresses.map((a) => (
                  <li
                    key={a.id}
                    className="rounded-lg border border-[#e6e6e6] bg-white p-3"
                  >
                    <div className="flex flex-wrap items-center gap-2 mb-2">
                      <span className="text-sm font-semibold text-gray-900">{a.label}</span>
                      {a.isDefault ? (
                        <span className="text-[10px] font-semibold uppercase tracking-wide bg-[#0a61d7]/10 text-[#0a61d7] px-2 py-0.5 rounded-full">
                          Default
                        </span>
                      ) : null}
                    </div>
                    <p className="text-sm text-gray-900">{a.fullName}</p>
                    <p className="text-xs text-gray-600 mt-0.5">{a.phone}</p>
                    <p className="text-sm text-gray-800 mt-2 whitespace-pre-wrap break-words">{a.address}</p>
                  </li>
                ))}
              </ul>
            )}
          </DistributorSection>

          <DistributorSection title="Engagement overview" icon={Activity}>
            <p className="text-xs text-gray-500 mb-3">
              Totals across this buyer&apos;s marketplace account (reviews, returns, app usage).
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {mpStats.map(({ label, value }) => (
                <div
                  key={label}
                  className="rounded-lg border border-[#e6e6e6] bg-white p-3"
                >
                  <p className="text-xl font-semibold text-gray-900 tabular-nums leading-none">{value}</p>
                  <p className="text-xs text-gray-600 mt-2 leading-snug">{label}</p>
                </div>
              ))}
            </div>
          </DistributorSection>

          <DistributorSection title="Recent in-app activity" icon={Package}>
            {u.userActivities.length === 0 ? (
              <p className="text-sm text-gray-500 italic">No recent activity rows (cart, views, etc.).</p>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-[#e6e6e6]">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50 text-gray-600">
                    <tr>
                      <th className="text-left font-medium px-3 py-2.5">Type</th>
                      <th className="text-left font-medium px-3 py-2.5">Product ID</th>
                      <th className="text-left font-medium px-3 py-2.5">When</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 bg-white">
                    {u.userActivities.map((a) => (
                      <tr key={a.id}>
                        <td className="px-3 py-2.5">
                          <span
                            className={`inline-flex text-[11px] font-semibold px-2 py-0.5 rounded-md border ${marketplaceActivityTypeClass(a.activityType)}`}
                          >
                            {a.activityType}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 font-mono text-gray-900">{a.productId}</td>
                        <td className="px-3 py-2.5 whitespace-nowrap text-gray-700">{formatDt(a.createdAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </DistributorSection>

          <DistributorSection title="Recent searches" icon={Search}>
            {u.searchHistory.length === 0 ? (
              <p className="text-sm text-gray-500 italic">No search history synced for this user.</p>
            ) : (
              <ul className="rounded-xl border border-[#e6e6e6] divide-y divide-gray-100 overflow-hidden bg-white">
                {u.searchHistory.map((s) => (
                  <li key={s.id} className="px-3 py-2.5 flex flex-wrap items-center justify-between gap-2">
                    <span className="text-sm text-gray-900 flex items-center gap-2 min-w-0">
                      <Search className="w-3.5 h-3.5 text-gray-400 shrink-0" aria-hidden />
                      <span className="truncate">{s.query}</span>
                    </span>
                    <span className="text-xs text-gray-500 whitespace-nowrap">{formatDt(s.createdAt)}</span>
                  </li>
                ))}
              </ul>
            )}
          </DistributorSection>

          <DistributorSection title="Push notification devices" icon={Smartphone}>
            {u.pushNotificationTokens.length === 0 ? (
              <p className="text-sm text-gray-500 italic">No devices registered for push.</p>
            ) : (
              <ul className="space-y-2">
                {u.pushNotificationTokens.map((t) => (
                  <li
                    key={t.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[#e6e6e6] bg-white px-3 py-2.5 text-xs"
                  >
                    <span className="font-semibold capitalize text-gray-900">{t.platform}</span>
                    <span
                      className={
                        t.isActive
                          ? 'text-[11px] font-semibold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200'
                          : 'text-[11px] font-semibold text-gray-600 bg-gray-100 px-2 py-0.5 rounded-full'
                      }
                    >
                      {t.isActive ? 'Active' : 'Inactive'}
                    </span>
                    <span className="text-gray-400 w-full sm:w-auto sm:ml-auto">{formatDt(t.createdAt)}</span>
                  </li>
                ))}
              </ul>
            )}
          </DistributorSection>
        </div>
      </div>
    );
  }

  const d = body.data as {
    id: number;
    userId: number;
    name: string;
    username: string;
    phone: string | null;
    experience: string | null;
    status: string | null;
    avatar: string | null;
    lastLat: number | null;
    lastLng: number | null;
    lastLocationAt: string | null;
    createdAt: string;
    updatedAt: string;
    user: {
      id: number;
      email: string;
      name: string | null;
      firstName: string | null;
      lastName: string | null;
      phone: string | null;
      company: { id: number; name: string; businessEmail: string | null; complianceStatus: string } | null;
    };
    fleets: Array<{
      id: number;
      fleetCode: string;
      route: string;
      status: string;
      plateNumber: string | null;
      vehicleType: string | null;
      vehicleBrand: string | null;
      vehicleModel: string | null;
      lastUpdate: string;
    }>;
    failedReasons: Array<{ id: number; orderId: string; reason: string; detail: string | null; createdAt: string }>;
    pushTokens: Array<{ id: number; platform: string; isActive: boolean; createdAt: string }>;
    _count: Record<string, number>;
  };

  const hasLocation = d.lastLat != null && d.lastLng != null;
  const issueTotal = d._count.failedReasons;
  const driverQuickStats = [
    { label: 'Fleet assignments (shown)', value: d.fleets.length },
    { label: 'Total fleets (account)', value: d._count.fleets },
    { label: 'Delivery issues (total)', value: issueTotal },
    { label: 'Push devices', value: d._count.pushTokens },
  ];

  return (
    <div className="bg-white p-4 sm:p-5 rounded-lg border border-[#e6e6e6]">
      <div className="flex flex-wrap items-center gap-3 justify-between mb-5">
        <Link href="/admin/users" className="inline-flex items-center gap-1 text-sm text-[#0a61d7] hover:underline">
          <ArrowLeft className="w-4 h-4" />
          Back to users
        </Link>
        <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-orange-100 text-orange-800">Driver app</span>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-start gap-4 mb-6 pb-6 border-b border-[#e6e6e6]">
        <div className="h-14 w-14 rounded-full bg-orange-50 border border-orange-200/80 overflow-hidden shrink-0 flex items-center justify-center text-lg font-semibold text-orange-900">
          {d.avatar ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={d.avatar} alt="" className="h-full w-full object-cover" />
          ) : (
            d.name.charAt(0).toUpperCase()
          )}
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-semibold text-gray-900 tracking-tight">{d.name}</h1>
          <p className="text-sm text-gray-600 mt-1">
            <span className="font-medium text-gray-800">@{d.username}</span>
          </p>
          <p className="text-xs text-gray-500 mt-2">
            Driver ID <span className="font-mono text-gray-700">{d.id}</span>
            {' · '}
            Employed under distributor user{' '}
            <Link href={`/admin/users/dashboard/${d.user.id}`} className="font-mono text-[#0a61d7] hover:underline">
              {d.user.id}
            </Link>
          </p>
        </div>
      </div>

      <div className="space-y-5">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {driverQuickStats.map(({ label, value }) => (
            <div
              key={label}
              className="rounded-lg border border-[#e6e6e6] bg-[#fafbfc] px-3 py-3 text-center sm:text-left"
            >
              <p className="text-xl font-semibold text-gray-900 tabular-nums leading-none">{value}</p>
              <p className="text-[10px] text-gray-600 mt-2 leading-snug">{label}</p>
            </div>
          ))}
        </div>

        <DistributorSection title="Driver account" icon={UserCircle}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4">
            <DistributorField label="Login username">
              <span className="text-sm font-medium text-gray-900">@{d.username}</span>
            </DistributorField>
            <DistributorField label="Phone">
              <TextOrEmpty value={d.phone} />
            </DistributorField>
            <DistributorField label="Status">
              {d.status != null && String(d.status).trim() ? (
                <span
                  className={`inline-flex text-xs font-semibold px-2.5 py-1 rounded-md border ${driverStatusClass(d.status)}`}
                >
                  {d.status}
                </span>
              ) : (
                <span className="text-sm text-gray-400 italic">Not set</span>
              )}
            </DistributorField>
            <DistributorField label="Experience">
              <TextOrEmpty value={d.experience} />
            </DistributorField>
            <DistributorField label="Joined / updated">
              <span className="text-sm text-gray-900">
                {formatDt(d.createdAt)} → {formatDt(d.updatedAt)}
              </span>
            </DistributorField>
            <div className="sm:col-span-2">
              <DistributorField label="Last known GPS">
                {hasLocation ? (
                  <div className="flex flex-col sm:flex-row sm:items-start sm:gap-4 gap-2">
                    <div className="flex items-start gap-2 text-sm text-gray-900">
                      <Navigation className="w-4 h-4 text-[#0a61d7] shrink-0 mt-0.5" aria-hidden />
                      <span className="font-mono tabular-nums">
                        {d.lastLat!.toFixed(5)}, {d.lastLng!.toFixed(5)}
                      </span>
                    </div>
                    <span className="text-xs text-gray-500 sm:border-l sm:border-gray-200 sm:pl-4">
                      {d.lastLocationAt ? `Updated ${formatDt(d.lastLocationAt)}` : 'No timestamp stored'}
                    </span>
                  </div>
                ) : (
                  <span className="text-sm text-gray-400 italic">No location synced from driver app yet</span>
                )}
              </DistributorField>
            </div>
          </div>
        </DistributorSection>

        <DistributorSection title="Distributor (employer)" icon={Users}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4">
            <DistributorField label="Distributor account">
              <Link
                href={`/admin/users/dashboard/${d.user.id}`}
                className="text-sm font-semibold text-[#0a61d7] hover:underline break-all"
              >
                {d.user.email}
              </Link>
            </DistributorField>
            <DistributorField label="Contact name">
              <span className="text-sm text-gray-900">
                {d.user.name || `${d.user.firstName ?? ''} ${d.user.lastName ?? ''}`.trim() || '—'}
              </span>
            </DistributorField>
            <DistributorField label="Distributor phone">
              <TextOrEmpty value={d.user.phone} />
            </DistributorField>
            <DistributorField label="Company">
              {d.user.company ? (
                <div className="space-y-1">
                  <span className="text-sm font-medium text-gray-900">{d.user.company.name}</span>
                  <div>
                    <span
                      className={`inline-flex text-[11px] font-semibold px-2 py-0.5 rounded-md border ${complianceStatusClass(d.user.company.complianceStatus)}`}
                    >
                      Compliance: {d.user.company.complianceStatus}
                    </span>
                  </div>
                </div>
              ) : (
                <span className="text-sm text-gray-400 italic">No company on file</span>
              )}
            </DistributorField>
            <DistributorField label="Company email">
              <TextOrEmpty value={d.user.company?.businessEmail ?? null} />
            </DistributorField>
          </div>
        </DistributorSection>

        <DistributorSection title="Fleet assignments" icon={Truck}>
          <p className="text-xs text-gray-500 mb-3">
            Showing up to 50 most recently updated fleets linked to this driver.
          </p>
          {d.fleets.length === 0 ? (
            <p className="text-sm text-gray-500 italic">No fleet rows returned for this driver.</p>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-[#e6e6e6]">
              <table className="w-full text-xs">
                <thead className="bg-gray-50 text-gray-600">
                  <tr>
                    <th className="text-left font-medium px-3 py-2.5">Code</th>
                    <th className="text-left font-medium px-3 py-2.5">Route</th>
                    <th className="text-left font-medium px-3 py-2.5">Status</th>
                    <th className="text-left font-medium px-3 py-2.5">Vehicle</th>
                    <th className="text-left font-medium px-3 py-2.5">Plate</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 bg-white">
                  {d.fleets.map((f) => (
                    <tr key={f.id}>
                      <td className="px-3 py-2.5 font-mono text-gray-900">{f.fleetCode}</td>
                      <td className="px-3 py-2.5 max-w-[220px] truncate text-gray-800" title={f.route}>
                        {f.route}
                      </td>
                      <td className="px-3 py-2.5 text-gray-800">{f.status}</td>
                      <td className="px-3 py-2.5 text-gray-800">
                        {[f.vehicleType, f.vehicleBrand, f.vehicleModel].filter(Boolean).join(' · ') || '—'}
                      </td>
                      <td className="px-3 py-2.5 text-gray-800">{f.plateNumber ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </DistributorSection>

        <DistributorSection title="Delivery issues (driver-reported)" icon={AlertTriangle}>
          {issueTotal > 0 ? (
            <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50/90 px-3 py-2.5 text-xs text-amber-950">
              <strong className="font-semibold">Heads up:</strong> this driver has{' '}
              <span className="font-semibold">{issueTotal}</span> failure record
              {issueTotal === 1 ? '' : 's'} on file. Review orders and notes below for support or compliance follow-up.
            </div>
          ) : (
            <p className="text-xs text-gray-500 mb-3">No structured failure reasons recorded for this driver.</p>
          )}
          {d.failedReasons.length === 0 ? (
            <p className="text-sm text-gray-500 italic">No recent failure rows loaded (latest 20 shown when present).</p>
          ) : (
            <ul className="space-y-2">
              {d.failedReasons.map((fr) => (
                <li
                  key={fr.id}
                  className="rounded-lg border border-[#e6e6e6] bg-white px-3 py-3 text-xs shadow-sm"
                >
                  <div className="font-semibold text-gray-900">{fr.reason}</div>
                  <div className="text-gray-600 mt-1">
                    Order ID: <span className="font-mono text-gray-800">{fr.orderId}</span>
                  </div>
                  {fr.detail ? (
                    <p className="text-gray-700 mt-2 whitespace-pre-wrap break-words">{fr.detail}</p>
                  ) : null}
                  <div className="text-gray-400 mt-2">{formatDt(fr.createdAt)}</div>
                </li>
              ))}
            </ul>
          )}
        </DistributorSection>

        <DistributorSection title="Driver app devices" icon={Smartphone}>
          {d.pushTokens.length === 0 ? (
            <p className="text-sm text-gray-500 italic">No push notification tokens registered.</p>
          ) : (
            <ul className="space-y-2">
              {d.pushTokens.map((t) => (
                <li
                  key={t.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[#e6e6e6] bg-white px-3 py-2.5 text-xs"
                >
                  <span className="font-semibold capitalize text-gray-900">{t.platform}</span>
                  <span
                    className={
                      t.isActive
                        ? 'text-[11px] font-semibold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200'
                        : 'text-[11px] font-semibold text-gray-600 bg-gray-100 px-2 py-0.5 rounded-full'
                    }
                  >
                    {t.isActive ? 'Active' : 'Inactive'}
                  </span>
                  <span className="text-gray-400 w-full sm:w-auto sm:ml-auto">{formatDt(t.createdAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </DistributorSection>
      </div>
    </div>
  );
}
