'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { FilePenLine, Gift, Plus, RefreshCcw, Zap } from 'lucide-react';
import { SkeletonTablePage } from '@/components/skeleton/SkeletonTablePage';
import { STAT_ICON_BG_BLUE, STAT_ICON_BG_GREEN, STAT_ICON_BLUE, STAT_ICON_GREEN } from '@/utils/statCardStyles';
import OfferCampaignTable, { type CampaignOfferRow } from '@/components/offersincentivesdisc/OfferCampaignTable';

/** Must match API max `limit` in `src/app/api/offers/campaigns/route.ts`. */
const OFFERS_API_PAGE_SIZE = 100;

export default function CampaignPage() {
  const [rows, setRows] = useState<CampaignOfferRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const acc: CampaignOfferRow[] = [];
      let offset = 0;
      for (;;) {
        const r = await fetch(`/api/offers/campaigns?limit=${OFFERS_API_PAGE_SIZE}&offset=${offset}`);
        if (!r.ok) {
          setRows([]);
          setLoadError(`Failed to load offers (${r.status})`);
          return;
        }
        const d = (await r.json()) as { offers?: CampaignOfferRow[]; totalCount?: number };
        const chunk = d?.offers ?? [];
        const totalCount = typeof d.totalCount === 'number' ? d.totalCount : undefined;
        acc.push(...chunk);
        if (chunk.length < OFFERS_API_PAGE_SIZE) break;
        if (totalCount !== undefined && acc.length >= totalCount) break;
        offset += OFFERS_API_PAGE_SIZE;
      }
      setRows(acc);
    } catch (e) {
      setRows([]);
      setLoadError(e instanceof Error ? e.message : 'Failed to load offers');
    } finally {
      setLoading(false);
      setHasLoaded(true);
    }
  }, []);

  useEffect(() => {
    load().catch(() => {});
  }, [load]);

  const counts = useMemo(() => {
    const published = rows.filter((r) => r.isPublished).length;
    return { total: rows.length, published, draft: Math.max(0, rows.length - published) };
  }, [rows]);

  if (loading && !hasLoaded) {
    return <SkeletonTablePage />;
  }

  const statCards = [
    {
      id: 'total',
      label: 'Total campaigns',
      value: counts.total,
      icon: <Gift className={`h-6 w-6 ${STAT_ICON_BLUE}`} />,
      color: STAT_ICON_BG_BLUE,
    },
    {
      id: 'published',
      label: 'Published',
      value: counts.published,
      icon: <Zap className={`h-6 w-6 ${STAT_ICON_GREEN}`} />,
      color: STAT_ICON_BG_GREEN,
    },
    {
      id: 'draft',
      label: 'Draft',
      value: counts.draft,
      icon: <FilePenLine className={`h-6 w-6 ${STAT_ICON_BLUE}`} />,
      color: STAT_ICON_BG_BLUE,
    },
  ];

  return (
    <div className="flex min-h-full w-full min-w-0 flex-col bg-gradient-to-b from-gray-50 to-white p-4">
      <div className="mb-4 flex min-w-0 flex-col gap-4 @5xl/main:flex-row @5xl/main:items-center @5xl/main:justify-between">
        <h1 className="min-w-0 truncate text-2xl font-bold text-gray-900">Campaign</h1>
        <div className="flex w-full min-w-0 flex-col gap-2 @4xl/main:flex-row @4xl/main:flex-wrap @4xl/main:items-center @5xl/main:w-auto">
          <button
            type="button"
            onClick={() => void load()}
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-[#e6e6e6] bg-white px-4 py-2 text-sm font-medium text-black transition-colors hover:bg-gray-50 @4xl/main:w-auto"
          >
            <RefreshCcw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <Link
            href="/offers/campaign/new"
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#0a61d7] px-6 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#0851b8] @4xl/main:w-auto"
          >
            <Plus className="h-4 w-4" />
            Create campaign
          </Link>
        </div>
      </div>

      {loadError ? (
        <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{loadError}</p>
      ) : null}

      <div className="mx-auto grid w-full grid-cols-1 gap-3 @3xl/main:grid-cols-2 @5xl/main:grid-cols-3">
        {statCards.map((stat) => (
          <div key={stat.id} className="flex items-center gap-4 rounded-lg border border-[#e6e6e6] bg-white p-4">
            <div className={`flex h-12 w-12 items-center justify-center rounded-lg ${stat.color}`}>{stat.icon}</div>
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">{stat.label}</div>
              <div className="text-xl font-bold text-black">{stat.value}</div>
            </div>
          </div>
        ))}
      </div>

      <OfferCampaignTable rows={rows} loading={loading} onRefreshAction={load} />
    </div>
  );
}
