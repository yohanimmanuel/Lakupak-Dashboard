'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Activity, ChevronDown, Users } from 'lucide-react';
import SlidingSegmentedControl from '@/components/SlidingSegmentedControl';

type AnalyticsSeriesRow = {
  day: string; // YYYY-MM-DD
  newDistributors: number;
  newMarketplaceBuyers: number;
  newDrivers: number;
  netGrowth: number;
  growthEfficiency: number;
  buyerDAU: number;
  searchVolume: number;
  searchZeroRate: number;
};

type SessionUsageKpi = { avgSec: number | null; samples: number };

type SessionSeriesRow = { day: string; avgSec: number; samples: number };

type AnalyticsPayload = {
  params: { since: string; until: string; grain: 'day' };
  kpis: {
    totals: {
      distributorsTotal: number;
      buyersTotal: number;
      driversTotal: number;
      distributorsSuspended: number;
      buyersSuspended: number;
    };
    newInPeriod: { distributors: number; marketplaceBuyers: number; drivers: number };
    activation: {
      distributorsActivated: number;
      buyersActivated: number;
      driversActivated: number;
      distributorsActivationRate: number;
      buyersActivationRate: number;
      driversActivationRate: number;
    };
    retention: { buyersWAU: number; buyersMAU: number; buyersStickyRatio: number };
    sessionUsage: {
      dashboard: SessionUsageKpi;
      marketplace: SessionUsageKpi;
      driver: SessionUsageKpi;
    };
  };
  sessionSeries: {
    dashboard: SessionSeriesRow[];
    marketplace: SessionSeriesRow[];
    driver: SessionSeriesRow[];
  };
  series: AnalyticsSeriesRow[];
};

function fmtInt(n: number | undefined) {
  if (n === undefined || Number.isNaN(n)) return '—';
  return n.toLocaleString();
}

function fmtPct(n: number | undefined) {
  if (n === undefined || Number.isNaN(n)) return '—';
  return `${Math.round(n * 100)}%`;
}

function dayLabel(isoDay: string) {
  // "Apr 20"
  const d = new Date(`${isoDay}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return isoDay;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function fmtDurSec(sec: number | null | undefined) {
  if (sec === undefined || sec === null || Number.isNaN(sec) || sec <= 0) return '—';
  const totalSec = Math.round(sec);
  if (totalSec <= 0) return '—';

  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;

  if (m < 60) {
    if (m === 0) return `${s}s`;
    return s ? `${m}m ${s}s` : `${m}m`;
  }
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return `${h}h ${mm}m`;
}

function SessionChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ payload?: SessionSeriesRow }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload;
  if (!row) return null;
  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-sm px-3 py-2 text-xs">
      <p className="font-semibold text-gray-900">{label ? dayLabel(String(label)) : ''}</p>
      <div className="mt-1 space-y-0.5 text-gray-700">
        <div className="flex justify-between gap-4">
          <span>Avg session</span>
          <span className="font-semibold text-gray-900">
            {row.samples > 0 ? fmtDurSec(row.avgSec) : '—'}
          </span>
        </div>
        <div className="flex justify-between gap-4">
          <span>Samples</span>
          <span className="font-semibold text-gray-900">{fmtInt(row.samples)}</span>
        </div>
      </div>
    </div>
  );
}

function CardShell({
  title,
  subtitle,
  icon,
  children,
}: {
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white border border-[#e6e6e6] rounded-xl p-4 shadow-[0_1px_0_rgba(0,0,0,0.02)]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-gray-900 flex items-center gap-2">
            {icon ? (
              <span className="inline-flex h-7 w-7 rounded-md bg-[#0a61d7]/10 border border-[#0a61d7]/15 items-center justify-center">
                {icon}
              </span>
            ) : null}
            <span className="truncate">{title}</span>
          </p>
          {subtitle ? <p className="text-xs text-gray-600 mt-1 leading-relaxed">{subtitle}</p> : null}
        </div>
      </div>
      <div className="mt-3">{children}</div>
    </div>
  );
}

function Metric({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="bg-gradient-to-b from-gray-50/70 to-white border border-gray-200 rounded-lg p-3">
      <p className="text-[11px] font-semibold text-gray-600">{label}</p>
      <p className="text-xl font-bold text-gray-900 mt-1">{value}</p>
      {hint ? <p className="text-[11px] text-gray-500 mt-1">{hint}</p> : null}
    </div>
  );
}

function ChartTooltip({
  active,
  payload,
  label,
  percentNames,
}: {
  active?: boolean;
  payload?: Array<{ value: unknown; name?: string; dataKey?: string; color?: string }>;
  label?: string;
  percentNames?: Set<string>;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-sm px-3 py-2 text-xs">
      <p className="font-semibold text-gray-900">{label}</p>
      <div className="mt-1 space-y-0.5">
        {payload.map((p, idx) => (
          <div key={idx} className="flex items-center justify-between gap-4">
            <span className="text-gray-600">{p.name ?? String(p.dataKey ?? 'value')}</span>
            <span className="font-semibold text-gray-900">
              {typeof p.value === 'number'
                ? percentNames?.has(String(p.name ?? ''))
                  ? fmtPct(p.value)
                  : fmtInt(p.value)
                : String(p.value ?? '')}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function AdminAnalyticsPage() {
  const [data, setData] = useState<AnalyticsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [days, setDays] = useState<1 | 3 | 7 | 30 | 60>(30);
  const [tab, setTab] = useState<'growth' | 'finance' | 'operational'>('growth');
  const [sessionAppTab, setSessionAppTab] = useState<'marketplace' | 'dashboard' | 'driver'>('marketplace');
  const [showDaysDropdown, setShowDaysDropdown] = useState(false);
  const daysDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/platform-admin/analytics/overview?grain=day&days=${days}`);
        if (!res.ok) throw new Error('Failed to load analytics');
        const json = (await res.json()) as AnalyticsPayload;
        if (alive) setData(json);
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : 'Failed to load analytics');
      } finally {
        if (alive) setLoading(false);
      }
    };
    void load();
    return () => {
      alive = false;
    };
  }, [days]);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node | null;
      if (!t) return;
      if (daysDropdownRef.current && !daysDropdownRef.current.contains(t)) setShowDaysDropdown(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  const series = data?.series ?? [];
  const sessionSeriesPick = useMemo(() => {
    if (!data) return null;
    if (sessionAppTab === 'marketplace') return data.sessionSeries.marketplace;
    if (sessionAppTab === 'dashboard') return data.sessionSeries.dashboard;
    return data.sessionSeries.driver;
  }, [data, sessionAppTab]);

  const sessionKpiPick = useMemo(() => {
    if (!data) return null;
    if (sessionAppTab === 'marketplace') return data.kpis.sessionUsage.marketplace;
    if (sessionAppTab === 'dashboard') return data.kpis.sessionUsage.dashboard;
    return data.kpis.sessionUsage.driver;
  }, [data, sessionAppTab]);

  const headerSubtitle = 'Track platform-wide growth, activation, and early retention signals.';
  const rangeLabel = useMemo(() => {
    if (!data) return null;
    const since = new Date(data.params.since);
    const until = new Date(data.params.until);
    const s = Number.isNaN(since.getTime()) ? data.params.since : since.toLocaleDateString();
    const u = Number.isNaN(until.getTime()) ? data.params.until : until.toLocaleDateString();
    return `Showing growth metrics from ${s} to ${u}`;
  }, [data]);

  return (
    <div className="space-y-3">
      <CardShell
        title="Platform analytics"
        subtitle={headerSubtitle}
      >
        {rangeLabel ? (
          <p className="text-xs text-gray-600 mb-4 -mt-2">{rangeLabel}</p>
        ) : null}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <SlidingSegmentedControl
            size="compact"
            items={[
              { key: 'growth', label: 'Growth' },
              { key: 'finance', label: 'Finance' },
              { key: 'operational', label: 'Operational' },
            ]}
            value={tab}
            onChange={(k) => setTab(k as typeof tab)}
            className="sm:max-w-[420px]"
          />

          <div ref={daysDropdownRef} className="relative shrink-0 w-full sm:w-auto">
            <button
              type="button"
              className="w-full sm:w-auto flex items-center justify-center gap-1 px-3 py-2 rounded-lg border border-[#e6e6e6] bg-white text-gray-700 hover:bg-gray-100 text-sm whitespace-nowrap"
              onClick={() => setShowDaysDropdown((v) => !v)}
            >
              {days === 1 ? 'Daily' : `Last ${days} days`}
              <ChevronDown className="w-4 h-4 ml-1 text-gray-500" />
            </button>
            {showDaysDropdown ? (
              <div className="absolute right-0 mt-2 w-40 bg-white border border-[#e6e6e6] rounded-lg shadow-lg z-50 max-h-60 overflow-y-auto">
                {[1, 3, 7, 30, 60].map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => {
                      setDays(d as 1 | 3 | 7 | 30 | 60);
                      setShowDaysDropdown(false);
                    }}
                    className={`w-full text-left px-4 py-2 text-sm first:rounded-t-lg last:rounded-b-lg ${
                      days === d ? 'text-[#0a61d7] font-semibold hover:bg-gray-100' : 'text-gray-700 hover:bg-gray-100'
                    }`}
                  >
                    {d === 1 ? 'Daily' : `${d} days`}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      </CardShell>

      {loading ? (
        <div className="bg-white border border-[#e6e6e6] rounded-xl p-8 text-sm text-gray-600 text-center">Loading…</div>
      ) : error ? (
        <div className="bg-white border border-[#e6e6e6] rounded-xl p-6 text-sm text-red-700">
          {error}
        </div>
      ) : tab !== 'growth' ? (
        <div className="bg-white border border-[#e6e6e6] rounded-xl p-6 text-sm text-gray-600">
          <p className="font-semibold text-gray-900">{tab === 'finance' ? 'Finance analytics' : 'Operational analytics'}</p>
          <p className="mt-2">
            Placeholder for now. Next we’ll wire platform-wide metrics for{' '}
            {tab === 'finance' ? 'GMV, revenue, discounts, and top distributors/products.' : 'SLAs, cancellations/returns, delivery failures, and quality signals.'}
          </p>
        </div>
      ) : !data ? (
        <div className="bg-white border border-[#e6e6e6] rounded-xl p-6 text-sm text-gray-600">No data.</div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <CardShell title="Distributors" icon={<Users className="w-4 h-4 text-[#0a61d7]" aria-hidden />}>
              <div className="grid grid-cols-2 gap-2">
                <Metric label="Total" value={fmtInt(data.kpis.totals.distributorsTotal)} hint={`${fmtInt(data.kpis.totals.distributorsSuspended)} suspended`} />
                <Metric label={`New (${days}d)`} value={fmtInt(data.kpis.newInPeriod.distributors)} hint={`Activated: ${fmtPct(data.kpis.activation.distributorsActivationRate)}`} />
              </div>
            </CardShell>

            <CardShell title="Marketplace buyers" icon={<Activity className="w-4 h-4 text-[#0a61d7]" aria-hidden />}>
              <div className="grid grid-cols-2 gap-2">
                <Metric label="Total" value={fmtInt(data.kpis.totals.buyersTotal)} hint={`${fmtInt(data.kpis.totals.buyersSuspended)} suspended`} />
                <Metric label={`New (${days}d)`} value={fmtInt(data.kpis.newInPeriod.marketplaceBuyers)} hint={`Activated: ${fmtPct(data.kpis.activation.buyersActivationRate)}`} />
              </div>
            </CardShell>

            <CardShell title="Drivers" icon={<Users className="w-4 h-4 text-[#0a61d7]" aria-hidden />}>
              <div className="grid grid-cols-2 gap-2">
                <Metric label="Total" value={fmtInt(data.kpis.totals.driversTotal)} />
                <Metric label={`New (${days}d)`} value={fmtInt(data.kpis.newInPeriod.drivers)} hint={`Activated: ${fmtPct(data.kpis.activation.driversActivationRate)}`} />
              </div>
            </CardShell>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <CardShell title="Growth">
              <div className="grid grid-cols-3 gap-2 mb-3">
                <Metric
                  label={`Activated distributors (${days}d)`}
                  value={fmtInt(data.kpis.activation.distributorsActivated)}
                />
                <Metric
                  label={`Activated buyers (${days}d)`}
                  value={fmtInt(data.kpis.activation.buyersActivated)}
                />
                <Metric
                  label={`Activated drivers (${days}d)`}
                  value={fmtInt(data.kpis.activation.driversActivated)}
                />
              </div>
              <div className="h-[320px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={series} margin={{ top: 10, right: 24, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="day" tickFormatter={dayLabel} minTickGap={18} />
                    <YAxis allowDecimals={false} />
                    <Tooltip content={<ChartTooltip />} labelFormatter={(l) => dayLabel(String(l))} />
                    <Line
                      type="monotone"
                      dataKey="newDistributors"
                      name="New distributors"
                      stroke="#0a61d7"
                      strokeWidth={2.5}
                      dot={false}
                      activeDot={{ r: 4 }}
                    />
                    <Line
                      type="monotone"
                      dataKey="newMarketplaceBuyers"
                      name="New buyers"
                      stroke="#f97316"
                      strokeWidth={2.5}
                      dot={false}
                      activeDot={{ r: 4 }}
                    />
                    <Line
                      type="monotone"
                      dataKey="newDrivers"
                      name="New drivers"
                      stroke="#fb923c"
                      strokeWidth={2}
                      dot={false}
                      strokeDasharray="6 4"
                      activeDot={{ r: 4 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardShell>

            <CardShell title="Buyer retention (DAU) + Search quality">
              <div className="grid grid-cols-3 gap-2 mb-3">
                <Metric label="Buyers WAU" value={fmtInt(data.kpis.retention.buyersWAU)} />
                <Metric label="Buyers MAU" value={fmtInt(data.kpis.retention.buyersMAU)} />
                <Metric label="Sticky (WAU/MAU)" value={fmtPct(data.kpis.retention.buyersStickyRatio)} />
              </div>
              <div className="h-[320px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={series} margin={{ top: 10, right: 24, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="day" tickFormatter={dayLabel} minTickGap={18} />
                    <YAxis yAxisId="left" allowDecimals={false} />
                    <YAxis yAxisId="right" orientation="right" tickFormatter={(v) => `${Math.round(Number(v) * 100)}%`} />
                    <Tooltip
                      content={<ChartTooltip percentNames={new Set(['Zero-result rate'])} />}
                      labelFormatter={(l) => dayLabel(String(l))}
                    />
                    <Line
                      yAxisId="left"
                      type="monotone"
                      dataKey="buyerDAU"
                      name="Buyer DAU"
                      stroke="#0a61d7"
                      strokeWidth={2.5}
                      dot={false}
                      activeDot={{ r: 4 }}
                    />
                    <Line
                      yAxisId="left"
                      type="monotone"
                      dataKey="searchVolume"
                      name="Search volume"
                      stroke="#93c5fd"
                      strokeWidth={2}
                      dot={false}
                      activeDot={{ r: 4 }}
                    />
                    <Line
                      yAxisId="right"
                      type="monotone"
                      dataKey="searchZeroRate"
                      name="Zero-result rate"
                      stroke="#f97316"
                      strokeWidth={2.5}
                      dot={false}
                      activeDot={{ r: 4 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardShell>
          </div>

          <CardShell
            title="Average session length"
            subtitle="Mean duration per recorded session sample (telemetry). Switch app to compare."
          >
            <div className="flex flex-col gap-3">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <SlidingSegmentedControl
                  size="compact"
                  items={[
                    { key: 'marketplace', label: 'Marketplace' },
                    { key: 'dashboard', label: 'Dashboard' },
                    { key: 'driver', label: 'Driver' },
                  ]}
                  value={sessionAppTab}
                  onChange={(k) => setSessionAppTab(k as typeof sessionAppTab)}
                  className="w-full sm:max-w-[480px]"
                />
                <Metric
                  label={`Period average (${days === 1 ? '1 day' : `${days} days`})`}
                  value={sessionKpiPick && sessionKpiPick.samples > 0 ? fmtDurSec(sessionKpiPick.avgSec) : '—'}
                  hint={
                    sessionKpiPick
                      ? `${fmtInt(sessionKpiPick.samples)} session sample${sessionKpiPick.samples === 1 ? '' : 's'}`
                      : undefined
                  }
                />
              </div>
              <div className="h-[300px] w-full min-w-0">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={sessionSeriesPick ?? []}
                    margin={{ top: 10, right: 24, left: 8, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="day" tickFormatter={dayLabel} minTickGap={18} />
                    <YAxis
                      tickFormatter={(v) => {
                        const n = Number(v);
                        if (n >= 3600) return `${Math.round(n / 3600)}h`;
                        if (n >= 60) return `${Math.round(n / 60)}m`;
                        return `${Math.round(n)}s`;
                      }}
                    />
                    <Tooltip
                      content={<SessionChartTooltip />}
                      labelFormatter={(l) => String(l)}
                    />
                    <Line
                      type="monotone"
                      dataKey="avgSec"
                      name="Avg session"
                      stroke={
                        sessionAppTab === 'dashboard'
                          ? '#0a61d7'
                          : sessionAppTab === 'marketplace'
                            ? '#f97316'
                            : '#ea580c'
                      }
                      strokeWidth={2.5}
                      dot={false}
                      activeDot={{ r: 4 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          </CardShell>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <CardShell title="Net growth" subtitle="New accounts minus suspensions (buyers + distributors)">
              <div className="h-[280px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={series} margin={{ top: 10, right: 24, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="day" tickFormatter={dayLabel} minTickGap={18} />
                    <YAxis allowDecimals={false} />
                    <Tooltip content={<ChartTooltip />} labelFormatter={(l) => dayLabel(String(l))} />
                    <Line
                      type="monotone"
                      dataKey="netGrowth"
                      name="Net growth"
                      stroke="#0a61d7"
                      strokeWidth={2.5}
                      dot={false}
                      activeDot={{ r: 4 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardShell>

            <CardShell title="Growth efficiency" subtitle="New accounts per active accounts (higher is better)">
              <div className="h-[280px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={series} margin={{ top: 10, right: 24, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="day" tickFormatter={dayLabel} minTickGap={18} />
                    <YAxis tickFormatter={(v) => `${Math.round(Number(v) * 100)}%`} />
                    <Tooltip content={<ChartTooltip percentNames={new Set(['Growth efficiency'])} />} labelFormatter={(l) => dayLabel(String(l))} />
                    <Line
                      type="monotone"
                      dataKey="growthEfficiency"
                      name="Growth efficiency"
                      stroke="#f97316"
                      strokeWidth={2.5}
                      dot={false}
                      activeDot={{ r: 4 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardShell>
          </div>
        </>
      )}
    </div>
  );
}

