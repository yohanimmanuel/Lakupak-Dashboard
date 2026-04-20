'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, ChartArea, Search, Tag, UserRound, Users } from 'lucide-react';
import AdminLatestUpdatesCard from '@/components/adminstuffs/AdminLatestUpdatesCard';
import { MarketplaceHomeOfferRowPreview } from '@/components/adminstuffs/MarketplaceHomeOfferRowPreview';

export type PlatformAdminHomeMetrics = {
  totalAdmins: number;
  activeAdmins: number;
  totalAnnouncements: number;
  publishedAnnouncements: number;
  draftAnnouncements: number;
  dashboardUsers: number;
  marketplaceUsers: number;
  drivers: number;
  platformUserTotal: number;
  platformActiveUsers: number;
  platformSuspendedUsers: number;
  totalHomeOffers: number;
  publishedHomeOffers: number;
  draftHomeOffers: number;
  searchQueryLogs: number;
  searchTermMaps: number;
};

function fmt(n: number | undefined) {
  if (n === undefined || Number.isNaN(n)) return '—';
  return n.toLocaleString();
}

function formatJoined(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

type PlatformUserSource = 'dashboard' | 'marketplace' | 'driver';
type PlatformUserRow = {
  source: PlatformUserSource;
  dbId: number;
  name: string;
  subtitle: string | null;
  createdAt: string;
};

function sourceBadgeClass(source: PlatformUserSource) {
  switch (source) {
    case 'dashboard':
      return 'bg-blue-100 text-blue-800';
    case 'marketplace':
      return 'bg-emerald-100 text-emerald-800';
    case 'driver':
      return 'bg-orange-100 text-orange-800';
    default:
      return 'bg-gray-100 text-gray-700';
  }
}

type AdminRow = { id: number; email: string; name: string | null; isActive: boolean };
type OfferRow = {
  id: number;
  title: string;
  subtitle: string;
  discountText: string;
  backgroundColor: string;
  textColor: string;
  bannerImageUrl: string | null;
  customBannerImageUrl: string | null;
  rightIconKey: string;
  discountIconKey: string;
  isPublished: boolean;
  sortOrder: number;
};
type SearchQueryRow = { query: string; searches: number; zeroRate: number; avgResults: number };

function SectionShell({
  href,
  title,
  icon,
  subtitle,
  contentClassName,
  children,
}: {
  href: string;
  title: string;
  icon: React.ReactNode;
  subtitle: string;
  contentClassName?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white border border-[#e6e6e6] rounded-xl p-4 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <div className="h-10 w-10 rounded-lg bg-blue-50 flex items-center justify-center shrink-0 border border-blue-100">
            {icon}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-gray-900">{title}</p>
            <p className="text-xs text-gray-600 mt-1 leading-relaxed">{subtitle}</p>
          </div>
        </div>
        <Link
          href={href}
          className="shrink-0 inline-flex items-center gap-1.5 text-xs font-semibold text-[#0a61d7] hover:text-[#084ba6]"
        >
          Manage <ArrowRight className="w-4 h-4" aria-hidden />
        </Link>
      </div>
      <div
        className={
          contentClassName ??
          'border border-gray-200 rounded-lg overflow-hidden bg-white'
        }
      >
        {children}
      </div>
    </div>
  );
}

function UsersPreviewCard({ metrics }: { metrics: PlatformAdminHomeMetrics | null }) {
  const [rows, setRows] = useState<PlatformUserRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/platform-admin/users?source=all&limit=5')
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => setRows((d?.users ?? []) as PlatformUserRow[]))
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  }, []);

  const subtitle = metrics
    ? `${fmt(metrics.platformUserTotal)} total · ${fmt(metrics.dashboardUsers)} dashboard · ${fmt(metrics.marketplaceUsers)} marketplace · ${fmt(metrics.drivers)} drivers`
    : 'Distributors, marketplace buyers, and drivers in one searchable list.';

  return (
    <SectionShell
      href="/admin/users"
      title="Manage users"
      subtitle={subtitle}
      icon={<UserRound className="w-5 h-5 text-[#0a61d7]" />}
    >
      {metrics ? (
        <div className="px-4 py-3 border-b border-gray-200 bg-gray-50/60 flex flex-wrap gap-2">
          <span className="text-[11px] font-semibold px-2 py-1 rounded-full bg-white border border-gray-200 text-gray-700">
            Total: {fmt(metrics.platformUserTotal)}
          </span>
          <span className="text-[11px] font-semibold px-2 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-800">
            Active: {fmt(metrics.platformActiveUsers)}
          </span>
          <span className="text-[11px] font-semibold px-2 py-1 rounded-full bg-red-50 border border-red-200 text-red-800">
            Suspended: {fmt(metrics.platformSuspendedUsers)}
          </span>
        </div>
      ) : null}
      {loading ? (
        <div className="p-4 py-8 text-sm text-gray-600 text-center">Loading…</div>
      ) : rows.length === 0 ? (
        <div className="p-4 py-8 text-sm text-gray-600 text-center">No users found.</div>
      ) : (
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs text-gray-600">
            <tr>
              <th className="text-left font-medium px-4 py-2 uppercase">User</th>
              <th className="text-left font-medium px-4 py-2 uppercase">Source</th>
              <th className="text-right font-medium px-4 py-2 uppercase">Joined</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.map((r) => (
              <tr key={`${r.source}-${r.dbId}`} className="hover:bg-gray-50/70">
                <td className="px-4 py-2">
                  <p className="text-sm font-semibold text-gray-900 truncate">{r.name}</p>
                  {r.subtitle ? <p className="text-xs text-gray-500 truncate">{r.subtitle}</p> : null}
                </td>
                <td className="px-4 py-2">
                  <span
                    className={`inline-block text-xs font-semibold px-2 py-1 rounded-full capitalize ${sourceBadgeClass(r.source)}`}
                  >
                    {r.source}
                  </span>
                </td>
                <td className="px-4 py-2 text-right text-xs text-gray-600 whitespace-nowrap">{formatJoined(r.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </SectionShell>
  );
}

function AdminsPreviewCard({ metrics }: { metrics: PlatformAdminHomeMetrics | null }) {
  const [items, setItems] = useState<AdminRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/platform-admin/admins')
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => setItems(((d?.admins ?? []) as AdminRow[]).slice(0, 5)))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, []);

  const subtitle = metrics
    ? `${fmt(metrics.activeAdmins)} active of ${fmt(metrics.totalAdmins)} accounts`
    : 'Who can sign in to this platform admin area; activate or deactivate access.';

  return (
    <SectionShell href="/admin/admins" title="Admins" subtitle={subtitle} icon={<Users className="w-5 h-5 text-[#0a61d7]" />}>
      {loading ? (
        <div className="p-4 py-8 text-sm text-gray-600 text-center">Loading…</div>
      ) : items.length === 0 ? (
        <div className="p-4 py-8 text-sm text-gray-600 text-center">No admins found.</div>
      ) : (
        <div className="divide-y divide-gray-100">
          {items.map((a) => (
            <div key={a.id} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-gray-50/70">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-gray-900 truncate">{a.email}</p>
                <p className="text-xs text-gray-500 truncate">{a.name || '—'}</p>
              </div>
              <span
                className={`text-xs px-2 py-0.5 rounded-full whitespace-nowrap ${
                  a.isActive ? 'bg-emerald-100 text-emerald-800' : 'bg-gray-100 text-gray-600'
                }`}
              >
                {a.isActive ? 'Active' : 'Inactive'}
              </span>
            </div>
          ))}
        </div>
      )}
    </SectionShell>
  );
}

function OffersPreviewCard({ metrics }: { metrics: PlatformAdminHomeMetrics | null }) {
  const [items, setItems] = useState<OfferRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/platform-admin/offers?limit=5&offset=0')
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => setItems((d?.offers ?? []) as OfferRow[]))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, []);

  const subtitle = metrics
    ? `${fmt(metrics.publishedHomeOffers)} live · ${fmt(metrics.draftHomeOffers)} draft`
    : 'Home banners and special-offer cards buyers see on the marketplace.';

  return (
    <SectionShell
      href="/admin/offers"
      title="Offers"
      subtitle={subtitle}
      icon={<Tag className="w-5 h-5 text-[#0a61d7]" />}
      contentClassName="overflow-hidden"
    >
      {loading ? (
        <div className="p-4 py-8 text-sm text-gray-600 text-center">Loading…</div>
      ) : items.length === 0 ? (
        <div className="p-4 py-8 text-sm text-gray-600 text-center">No offers yet.</div>
      ) : (
        <div className="space-y-2 bg-white">
          {items.map((o) => (
            <div
              key={o.id}
              className="rounded-lg border border-gray-200 px-3 py-3 hover:bg-gray-50/70 flex items-center gap-3"
            >
              <MarketplaceHomeOfferRowPreview row={o} />

              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-900 truncate">{o.title}</p>
                    {o.subtitle?.trim() ? <p className="text-xs text-gray-500 truncate">{o.subtitle}</p> : null}
                  </div>

                  <div className="shrink-0 flex items-center gap-2">
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full whitespace-nowrap ${
                        o.isPublished ? 'bg-emerald-100 text-emerald-800' : 'bg-gray-100 text-gray-600'
                      }`}
                    >
                      {o.isPublished ? 'Live' : 'Draft'}
                    </span>
                    <span className="text-[11px] font-semibold text-gray-600 whitespace-nowrap">#{o.sortOrder}</span>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </SectionShell>
  );
}

function SearchLogsPreviewCard({ metrics }: { metrics: PlatformAdminHomeMetrics | null }) {
  const [items, setItems] = useState<SearchQueryRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/platform-admin/search/queries?days=7&limit=5')
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => setItems((d?.rows ?? []) as SearchQueryRow[]))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, []);

  const subtitle = metrics
    ? `${fmt(metrics.searchQueryLogs)} logged queries · ${fmt(metrics.searchTermMaps)} term maps`
    : 'Marketplace search telemetry, synonyms, and translation term maps.';

  const summaryLabel = useMemo(() => {
    if (!items.length) return 'No search data yet.';
    const worst = items[0];
    const pct = Math.round((worst.zeroRate ?? 0) * 100);
    return `Top issue query: “${worst.query}” · ${pct}% zero-results`;
  }, [items]);

  return (
    <SectionShell href="/admin/search-logs" title="Search logs" subtitle={subtitle} icon={<Search className="w-5 h-5 text-[#0a61d7]" />}>
      {loading ? (
        <div className="p-4 py-8 text-sm text-gray-600 text-center">Loading…</div>
      ) : items.length === 0 ? (
        <div className="p-4 py-8 text-sm text-gray-600 text-center">{summaryLabel}</div>
      ) : (
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs text-gray-600">
            <tr>
              <th className="text-left font-medium px-4 py-2 uppercase">Query</th>
              <th className="text-right font-medium px-4 py-2 uppercase">Searches</th>
              <th className="text-right font-medium px-4 py-2 uppercase">Zero</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {items.map((q) => (
              <tr key={q.query} className="hover:bg-gray-50/70">
                <td className="px-4 py-2">
                  <p className="text-sm font-semibold text-gray-900 truncate">{q.query}</p>
                  <p className="text-xs text-gray-500 truncate">Avg results: {Math.round(q.avgResults ?? 0)}</p>
                </td>
                <td className="px-4 py-2 text-right text-xs text-gray-600 whitespace-nowrap">{fmt(q.searches)}</td>
                <td className="px-4 py-2 text-right text-xs text-gray-600 whitespace-nowrap">{Math.round((q.zeroRate ?? 0) * 100)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </SectionShell>
  );
}

function AnalyticsPreviewCard() {
  return (
    <SectionShell
      href="/admin/analytics"
      title="Analytics"
      subtitle="Platform-wide engagement and funnel metrics (section under construction)."
      icon={<ChartArea className="w-5 h-5 text-[#0a61d7]" />}
    >
      <div className="p-4 text-sm text-gray-700">
        <p className="text-xs text-gray-600">
          This section will summarize marketplace behavior and conversion funnels. For now, use other tabs to manage content and users.
        </p>
        <ul className="mt-3 text-xs text-gray-600 list-disc pl-5 space-y-1">
          <li>Top searched terms and zero-result queries</li>
          <li>Published offers impact</li>
          <li>Announcement reach</li>
        </ul>
      </div>
    </SectionShell>
  );
}

export default function PlatformAdminHomeDashboard({ metrics }: { metrics: PlatformAdminHomeMetrics | null }) {
  const m = metrics;

  return (
    <div className="space-y-6 pb-8">
      <div>
        <h1 className="text-lg font-semibold text-gray-900">Platform overview</h1>
        <p className="text-sm text-gray-600 mt-1">Quick snapshots + simple previews. Use Manage to open full tools.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        <div className="bg-white border border-[#e6e6e6] rounded-xl p-4">
          <p className="text-xs text-gray-600">Active admins</p>
          <p className="text-2xl font-bold text-gray-900 mt-0.5">{m ? fmt(m.activeAdmins) : '—'}</p>
          <p className="text-xs text-gray-500 mt-1">of {m ? fmt(m.totalAdmins) : '—'} total</p>
        </div>
        <div className="bg-white border border-[#e6e6e6] rounded-xl p-4">
          <p className="text-xs text-gray-600">Platform user accounts</p>
          <p className="text-2xl font-bold text-gray-900 mt-0.5">{m ? fmt(m.platformUserTotal) : '—'}</p>
          <p className="text-xs text-gray-500 mt-1">Dashboard + marketplace + drivers</p>
        </div>
        <div className="bg-white border border-[#e6e6e6] rounded-xl p-4">
          <p className="text-xs text-gray-600">Latest updates</p>
          <p className="text-2xl font-bold text-gray-900 mt-0.5">{m ? fmt(m.publishedAnnouncements) : '—'}</p>
          <p className="text-xs text-gray-500 mt-1">{m ? `${fmt(m.draftAnnouncements)} draft` : 'Published in app'}</p>
        </div>
        <div className="bg-white border border-[#e6e6e6] rounded-xl p-4">
          <p className="text-xs text-gray-600">Home offers</p>
          <p className="text-2xl font-bold text-gray-900 mt-0.5">{m ? fmt(m.publishedHomeOffers) : '—'}</p>
          <p className="text-xs text-gray-500 mt-1">{m ? `${fmt(m.draftHomeOffers)} draft` : 'Published on home'}</p>
        </div>
      </div>

      <div>
        <h2 className="text-sm font-semibold text-gray-900 mb-3">Admin tools</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <UsersPreviewCard metrics={m} />
          <AdminsPreviewCard metrics={m} />
          <AdminLatestUpdatesCard />
          <OffersPreviewCard metrics={m} />
          <SearchLogsPreviewCard metrics={m} />
          <AnalyticsPreviewCard />
        </div>
      </div>
    </div>
  );
}
