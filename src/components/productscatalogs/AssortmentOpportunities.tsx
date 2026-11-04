'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ChevronDown, ChevronLeft, ChevronRight, Edit, Filter, RefreshCw, Search, Target } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useProductsTranslations } from '@/hooks/useProductsTranslations';
import { confidenceFilterFraction, priorityLabelFromStored, type PriorityLabel } from '@/lib/assortmentOpportunities/config';
import { getVisiblePageNumbers } from '@/utils/tablePagination';

type FamilyRow = {
  productId: string;
  productName: string;
  brand: string;
  categorySlug: string | null;
  variantCount: number;
  retailerCount: number;
  penetration: number;
  matchScore: number;
  priorityScore: number;
  confidence: number;
  image: string | null;
};

type ListResponse = {
  summary: { total: number; highPriority: number; newAssortment: number; reactivation: number };
  facets: { brands: string[]; categories: string[]; families: string[]; segments: string[] };
  page: number;
  total: number;
  totalPages: number;
  rows: FamilyRow[];
};

const PRIORITY_BADGE: Record<PriorityLabel, string> = {
  urgent: 'bg-red-100 text-red-500',
  high: 'bg-amber-100 text-amber-600',
  medium: 'bg-yellow-100 text-yellow-600',
  low: 'bg-green-100 text-green-500',
  none: 'bg-gray-100 text-gray-500',
};

function PriorityBadge({ score, label }: { score: number; label?: string | null }) {
  const t = useTranslations('dashboard.products.opportunitiesPage');
  const level = priorityLabelFromStored(score, label);
  return (
    <span className={`inline-block rounded-full px-2 py-1 text-xs font-bold ${PRIORITY_BADGE[level]}`}>
      {t(`priorityLabels.${level}`)}
    </span>
  );
}

function analysisKindClass(kind: string): string {
  if (kind === 'coPurchase') return 'bg-violet-100 text-violet-700';
  if (kind === 'segmentFit') return 'bg-emerald-100 text-emerald-700';
  if (kind === 'purchasingActivity') return 'bg-amber-100 text-amber-700';
  if (kind === 'priceSuitability') return 'bg-sky-100 text-sky-700';
  return 'bg-blue-100 text-blue-700';
}

function ProductThumb({ src, name }: { src?: string | null; name: string }) {
  return (
    <div className="h-10 w-10 shrink-0 overflow-hidden rounded-lg bg-gray-100">
      {src ? <img src={src} alt="" className="h-full w-full object-cover" /> : <span className="sr-only">{name}</span>}
    </div>
  );
}

const emptyFilters = {
  q: '',
  brand: 'all',
  category: 'all',
  segment: 'all',
  type: 'all',
  minMatch: '',
  minPriority: '',
  minConfidence: '',
};

export default function AssortmentOpportunities() {
  const t = useTranslations('dashboard.products.opportunitiesPage');
  const locale = useLocale();
  const { tShared } = useProductsTranslations();
  const [analysis, setAnalysis] = useState<Array<{ title: string; body: string; points?: string[]; kind: string; metricValue: string; metricLabel: string }>>([]);
  const [analysisMetrics, setAnalysisMetrics] = useState<Array<{ label: string; value: string; hint: string }>>([]);
  const [analysisSource, setAnalysisSource] = useState<'ai' | 'rules' | ''>('');
  const [analysisLoading, setAnalysisLoading] = useState(true);
  const [filters, setFilters] = useState(emptyFilters);
  const [page, setPage] = useState(1);
  const [data, setData] = useState<ListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const skipPageLoad = useRef(false);
  const loadRequestRef = useRef(0);
  const [error, setError] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(filters.q), 300);
    return () => window.clearTimeout(timer);
  }, [filters.q]);

  const load = useCallback(async (nextPage: number, current?: typeof emptyFilters) => {
    const requestId = ++loadRequestRef.current;
    const applied = current ?? {
      q: debouncedQuery,
      brand: filters.brand,
      category: filters.category,
      segment: filters.segment,
      type: filters.type,
      minMatch: filters.minMatch,
      minPriority: filters.minPriority,
      minConfidence: filters.minConfidence,
    };
    setLoading(true);
    setError('');
    const params = new URLSearchParams({ page: String(nextPage), limit: '10', group: 'family' });
    for (const [key, value] of Object.entries(applied)) {
      if (!value || value === 'all') continue;
      if (key === 'minConfidence') {
        const fraction = confidenceFilterFraction(value);
        if (fraction == null) continue;
        params.set(key, String(fraction));
        continue;
      }
      params.set(key, value);
    }
    try {
      const response = await fetch(`/api/products/opportunities?${params.toString()}`, { credentials: 'include' });
      if (requestId !== loadRequestRef.current) return;
      if (!response.ok) throw new Error('load');
      const payload = await response.json();
      if (requestId !== loadRequestRef.current) return;
      setData(payload);
    } catch {
      if (requestId !== loadRequestRef.current) return;
      setError(t('emptyBody'));
    } finally {
      if (requestId === loadRequestRef.current) setLoading(false);
    }
  }, [debouncedQuery, filters.brand, filters.category, filters.segment, filters.type, filters.minMatch, filters.minPriority, filters.minConfidence, t]);

  const loadAnalysis = useCallback(async () => {
    setAnalysisLoading(true);
    try {
      const response = await fetch(`/api/products/opportunities/analysis?locale=${encodeURIComponent(locale)}`, { credentials: 'include' });
      if (!response.ok) throw new Error('analysis failed');
      const payload = await response.json() as {
        cards: Array<{ title: string; body: string; points?: string[]; kind: string; metricValue: string; metricLabel: string }>;
        metrics: Array<{ label: string; value: string; hint: string }>;
        source: 'ai' | 'rules';
      };
      setAnalysis(payload.cards ?? []);
      setAnalysisMetrics(payload.metrics ?? []);
      setAnalysisSource(payload.source);
    } catch {
      setAnalysis([]);
      setAnalysisMetrics([]);
      setAnalysisSource('');
    } finally {
      setAnalysisLoading(false);
    }
  }, [locale]);

  useEffect(() => {
    if (skipPageLoad.current) {
      skipPageLoad.current = false;
      return;
    }
    void load(page);
  }, [load, page]);

  useEffect(() => {
    void loadAnalysis();
  }, [loadAnalysis]);

  const refresh = async () => {
    setRefreshing(true);
    setLoading(true);
    setAnalysisLoading(true);
    setError('');
    try {
      const response = await fetch('/api/products/opportunities', { method: 'POST', credentials: 'include' });
      if (!response.ok) throw new Error('refresh');
      if (page !== 1) {
        skipPageLoad.current = true;
        setPage(1);
      }
      await Promise.all([load(1, filters), loadAnalysis()]);
    } catch {
      setError(t('scoreFailed'));
      setLoading(false);
      setAnalysisLoading(false);
    } finally {
      setRefreshing(false);
    }
  };

  const summary = data?.summary;
  const cards = [
    { label: t('total'), value: summary?.total ?? 0 },
    { label: t('highPriority'), value: summary?.highPriority ?? 0 },
    { label: t('newAssortment'), value: summary?.newAssortment ?? 0 },
    { label: t('reactivation'), value: summary?.reactivation ?? 0 },
  ];

  return (
    <div className="space-y-4">
      <div className="flex min-w-0 flex-col gap-4 @5xl/main:flex-row @5xl/main:items-center @5xl/main:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-black">{t('title')}</h1>
          <p className="mt-1 max-w-3xl text-sm text-gray-600">{t('subtitle')}</p>
        </div>
        <button
          type="button"
          onClick={() => void refresh()}
          disabled={refreshing || loading}
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-[#e6e6e6] bg-white px-4 py-2 text-sm font-medium text-black transition hover:bg-gray-100 @4xl/main:w-auto"
        >
          <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
          {refreshing ? t('refreshing') : t('refresh')}
        </button>
      </div>

      <section className="min-w-0 overflow-hidden rounded-lg border border-[#e6e6e6] bg-white">
        <div className="flex min-w-0 items-start gap-3 border-b border-[#e6e6e6] px-4 py-4">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#0a61d7] text-white">
            <Target className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h2 className="text-base font-bold text-black">{t('analysisTitle')}</h2>
            <p className="mt-1 text-xs leading-5 text-gray-500">{t('analysisDescription')}</p>
          </div>
        </div>
        <div className="p-4">
          {analysisLoading ? (
            <div className="flex items-center gap-3 py-8">
              <div className="h-6 w-6 animate-spin rounded-full border-4 border-[#0a61d7] border-t-transparent" />
              <p className="text-sm text-gray-600">{t('analysisLoading')}</p>
            </div>
          ) : (
            <>
              {analysisMetrics.length > 0 ? (
                <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                  {analysisMetrics.map((metric) => (
                    <div key={metric.label} className="rounded-lg border border-[#e6e6e6] bg-[#fbfcfe] px-3 py-3">
                      <p className="text-[11px] font-medium uppercase tracking-wide text-gray-500">{metric.label}</p>
                      <p className="mt-1 text-2xl font-bold leading-none text-black">{metric.value}</p>
                      <p className="mt-1 text-[11px] text-gray-500">{metric.hint}</p>
                    </div>
                  ))}
                </div>
              ) : null}
              <h3 className="mt-5 text-sm font-semibold text-black">{t('analysisPoints')}</h3>
              {analysis.length > 0 ? (
                <div className="mt-3 flex snap-x gap-3 overflow-x-auto pb-2">
                  {analysis.map((card) => (
                    <article key={`${card.kind}-${card.title}`} className="flex min-h-52 w-[19rem] shrink-0 snap-start flex-col rounded-lg border border-[#e6e6e6] bg-white p-3">
                      <h4 className="min-w-0 truncate text-sm font-semibold text-black">{card.title}</h4>
                      <div className="mt-1.5">
                        <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${analysisKindClass(card.kind)}`}>
                          {t(`analysisKinds.${card.kind}`)}
                        </span>
                      </div>
                      <p className="mt-3 text-2xl font-bold leading-none text-black">{card.metricValue}</p>
                      <p className="mt-1 text-[11px] text-gray-500">{card.metricLabel}</p>
                      <ul className="mt-2 list-disc space-y-1 pl-4 text-xs leading-5 text-gray-600">
                        {(card.points && card.points.length > 0 ? card.points : card.body.split(/(?<=\.)\s+/)).filter(Boolean).map((point) => (
                          <li key={point}>{point.replace(/\.$/, '')}</li>
                        ))}
                      </ul>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="mt-3 rounded-lg border border-dashed border-gray-300 bg-[#fbfcfe] px-4 py-6 text-center">
                  <p className="text-sm font-semibold text-gray-600">{t('analysisEmpty')}</p>
                </div>
              )}
              {analysisSource === 'rules' && analysis.length > 0 ? (
                <p className="mt-3 text-xs text-gray-500">{t('analysisRules')}</p>
              ) : null}
            </>
          )}
        </div>
      </section>

      <div className="mx-auto mt-3 w-full min-w-0 rounded-lg border border-[#e6e6e6] bg-white p-4">
        <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {cards.map((card) => (
            <div key={card.label} className="rounded-lg border border-[#e6e6e6] bg-[#fbfcfe] p-4">
              <p className="text-sm text-gray-600">{card.label}</p>
              <p className="mt-1 text-2xl font-bold text-gray-900">{card.value}</p>
            </div>
          ))}
        </div>
        <div className="mb-4 flex w-full min-w-0 flex-col gap-3">
          <div className="relative w-full">
            <input
              value={filters.q}
              onChange={(event) => { setFilters({ ...filters, q: event.target.value }); setPage(1); }}
              placeholder={t('searchSku')}
              aria-label={t('searchSku')}
              className="w-full rounded-lg border border-[#e6e6e6] bg-white py-2 pl-10 pr-4 text-sm text-black focus:outline-none focus:ring-2 focus:ring-[#0a61d7]"
            />
            <Search className="absolute left-3 top-2 h-5 w-5 text-gray-400" />
          </div>
          <div className="flex w-full min-w-0 flex-col gap-2 @4xl/main:flex-row @4xl/main:flex-wrap @4xl/main:items-center">
            <FilterSelect label={t('brand')} value={filters.brand} options={facetOptions(data?.facets.brands)} onChange={(brand) => { setFilters({ ...filters, brand }); setPage(1); }} allLabel={t('all')} />
            <FilterSelect label={t('category')} value={filters.category} options={facetOptions(data?.facets.categories)} onChange={(category) => { setFilters({ ...filters, category }); setPage(1); }} allLabel={t('all')} />
            <FilterSelect label={t('segment')} value={filters.segment} options={facetOptions(data?.facets.segments)} onChange={(segment) => { setFilters({ ...filters, segment }); setPage(1); }} allLabel={t('all')} />
            <FilterSelect
              label={t('type')}
              value={filters.type}
              options={[
                { value: 'new_assortment', label: t('types.new_assortment') },
                { value: 'reactivation', label: t('types.reactivation') },
              ]}
              onChange={(type) => { setFilters({ ...filters, type }); setPage(1); }}
              allLabel={t('all')}
            />
            <input value={filters.minMatch} onChange={(event) => { setFilters({ ...filters, minMatch: event.target.value }); setPage(1); }} placeholder={t('minMatch')} aria-label={t('minMatch')} className="w-full rounded-lg border border-[#e6e6e6] bg-white px-3 py-2 text-sm text-gray-700 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#0a61d7] @4xl/main:w-32" />
            <FilterSelect
              label={t('minPriority')}
              value={filters.minPriority || 'all'}
              options={[
                { value: '4', label: t('priorityLabels.urgent') },
                { value: '3', label: t('priorityLabels.high') },
                { value: '2', label: t('priorityLabels.medium') },
                { value: '1', label: t('priorityLabels.low') },
              ]}
              onChange={(minPriority) => { setFilters({ ...filters, minPriority: minPriority === 'all' ? '' : minPriority }); setPage(1); }}
              allLabel={t('all')}
            />
            <input value={filters.minConfidence} onChange={(event) => { setFilters({ ...filters, minConfidence: event.target.value }); setPage(1); }} placeholder={t('minConfidence')} aria-label={t('minConfidence')} className="w-full rounded-lg border border-[#e6e6e6] bg-white px-3 py-2 text-sm text-gray-700 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#0a61d7] @4xl/main:w-36" />
          </div>
        </div>

        {error ? <p className="mb-3 text-sm text-red-600">{error}</p> : null}

        {loading ? (
          <div className="flex flex-col items-center justify-center py-16">
            <div className="mb-4 h-8 w-8 animate-spin rounded-full border-4 border-[#0a61d7] border-t-transparent" />
            <p className="text-sm text-gray-600">{t('refreshing')}</p>
          </div>
        ) : (
        <div className="overflow-x-auto rounded-lg">
          <table className="w-full">
            <thead>
              <tr className="whitespace-nowrap bg-gray-100 text-gray-500">
                <th className="px-4 py-3 text-left text-xs font-medium uppercase">{t('family')}</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase">{t('variants')}</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase">{t('retailers')}</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase">{t('penetration')}</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase">{t('match')}</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase">{t('confidence')}</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase">{t('priority')}</th>
                <th className="px-4 py-3 text-center text-xs font-medium uppercase">{tShared('actions')}</th>
              </tr>
            </thead>
            <tbody className="whitespace-nowrap text-xs">
              {(data?.rows.length ?? 0) === 0 ? (
                <tr><td colSpan={8} className="py-12 text-center text-sm text-gray-500">{data?.summary.total ? t('noRows') : t('emptyBody')}</td></tr>
              ) : data?.rows.map((row) => (
                <tr key={row.productId} className="border-b border-[#e6e6e6]">
                  <td className="max-w-64 px-4 py-3 text-xs text-gray-900">
                    <div className="flex items-center gap-3">
                      <ProductThumb src={row.image} name={row.productName} />
                      <div className="min-w-0">
                        <div className="truncate font-medium">{row.productName}</div>
                        <div className="truncate text-xs text-gray-500">{row.brand}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-900">{row.variantCount}</td>
                  <td className="px-4 py-3 text-xs text-gray-900">{row.retailerCount}</td>
                  <td className="px-4 py-3 text-xs text-gray-900">{row.penetration}%</td>
                  <td className="px-4 py-3 text-xs text-gray-900">{row.matchScore}</td>
                  <td className="px-4 py-3 text-xs text-gray-900">{Math.round(row.confidence * 100)}%</td>
                  <td className="px-4 py-3"><PriorityBadge score={row.priorityScore} /></td>
                  <td className="px-4 py-3 text-center">
                    <Link
                      href={`/products/opportunities/variants?productId=${encodeURIComponent(row.productId)}`}
                      className="inline-flex items-center justify-center rounded-lg p-2 transition-colors hover:bg-gray-100 focus:outline-none"
                      title={t('viewDetails')}
                      aria-label={t('viewDetails')}
                    >
                      <Edit className="h-4 w-4 text-gray-500" />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        )}

        <Pager
          page={page}
          totalPages={data?.totalPages || 1}
          showing={tShared('pagination.showing', {
            from: data && data.total > 0 ? (page - 1) * 10 + 1 : 0,
            to: data ? Math.min(page * 10, data.total) : 0,
            total: data?.total ?? 0,
          })}
          previousLabel={tShared('previousPage')}
          nextLabel={tShared('nextPage')}
          onPage={setPage}
        />
      </div>
    </div>
  );
}

function Pager({
  page,
  totalPages,
  showing,
  previousLabel,
  nextLabel,
  onPage,
}: {
  page: number;
  totalPages: number;
  showing: string;
  previousLabel: string;
  nextLabel: string;
  onPage: (page: number) => void;
}) {
  return (
    <div className="mt-4 flex items-center justify-between">
      <div className="text-sm text-gray-500">{showing}</div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onPage(Math.max(1, page - 1))}
          disabled={page <= 1}
          aria-label={previousLabel}
          className="px-3 py-1 text-sm text-gray-500 hover:text-gray-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <div className="flex items-center gap-1">
          {getVisiblePageNumbers(page, totalPages).map((pageNum) => (
            <button
              key={pageNum}
              type="button"
              onClick={() => onPage(pageNum)}
              className={`rounded-lg px-3 py-2 text-sm ${page === pageNum ? 'bg-[#0a61d7] text-white' : 'text-gray-500 hover:bg-gray-100 hover:text-gray-700'}`}
            >
              {pageNum}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => onPage(Math.min(totalPages, page + 1))}
          disabled={page >= totalPages}
          aria-label={nextLabel}
          className="px-3 py-1 text-sm text-gray-500 hover:text-gray-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

function facetOptions(values: string[] | undefined): Array<{ value: string; label: string }> {
  return (values ?? []).map((value) => ({ value, label: value }));
}

function FilterSelect({
  label,
  value,
  options,
  onChange,
  allLabel,
}: {
  label: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
  allLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const choices = [{ value: 'all', label: value === 'all' ? label : allLabel }, ...options];
  const current = value === 'all' ? label : options.find((option) => option.value === value)?.label ?? label;

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  return (
    <div ref={rootRef} className="relative w-full @4xl/main:w-auto">
      <button
        type="button"
        className="flex w-full items-center justify-between gap-1 whitespace-nowrap rounded-lg border border-[#e6e6e6] bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 @4xl/main:w-auto @4xl/main:justify-start"
        onClick={() => setOpen((next) => !next)}
      >
        <Filter className="h-4 w-4" />
        {current}
        <ChevronDown className="h-4 w-4" />
      </button>
      {open ? (
        <div className="absolute left-0 z-20 mt-2 max-h-56 w-52 overflow-y-auto rounded-lg border border-[#e6e6e6] bg-white shadow">
          {choices.map((option) => (
            <button
              key={option.value}
              type="button"
              className={`block w-full px-4 py-2 text-left text-sm hover:bg-gray-100 ${option.value === value ? 'font-semibold text-[#0a61d7]' : 'text-gray-700'}`}
              onClick={() => {
                onChange(option.value);
                setOpen(false);
              }}
            >
              {option.value === 'all' ? allLabel : option.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
