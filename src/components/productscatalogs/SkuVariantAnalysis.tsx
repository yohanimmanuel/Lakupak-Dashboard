'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, ChevronDown, ChevronLeft, ChevronRight, Filter, Search, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useProductsTranslations } from '@/hooks/useProductsTranslations';
import { priorityLabelFromStored, type PriorityLabel } from '@/lib/assortmentOpportunities/config';
import { getVisiblePageNumbers } from '@/utils/tablePagination';

type SkuGroup = {
  variantOptionId: number;
  skuLabel: string;
  variantName: string;
  productName: string;
  brand: string;
  retailerCount: number;
  penetration: number;
  matchScore: number;
  priorityScore: number;
  newAssortment: number;
  reactivation: number;
};

type GroupResponse = {
  page: number;
  total: number;
  totalPages: number;
  rows: SkuGroup[];
  product: { name: string; brand: string; image: string | null } | null;
};

type RetailerRow = {
  id: string;
  retailerName: string;
  segment: string;
  opportunityType: 'new_assortment' | 'reactivation';
  matchScore: number;
  confidence: number;
  recommendedAction: 'introduce' | 'reorder';
  breakdown?: unknown;
};

type RetailerResponse = {
  page: number;
  total: number;
  totalPages: number;
  rows: RetailerRow[];
};

type Signal = { available?: boolean; score?: number | null; weight?: number };

type DetailResponse = {
  opportunity: {
    id: string;
    reasons: string[];
    breakdown: { signals?: Record<string, Signal> };
  };
};

type ActionabilitySource = 'inCart' | 'favorited' | 'viewed';

function readActionability(breakdown: unknown): { score: number | null; source: ActionabilitySource | null } {
  if (!breakdown || typeof breakdown !== 'object' || Array.isArray(breakdown)) return { score: null, source: null };
  const record = breakdown as {
    priority?: { actionability?: unknown };
    marketplace?: { viewed?: boolean; favorited?: boolean; inCart?: boolean };
  };
  const raw = record.priority?.actionability;
  const score = typeof raw === 'number' && Number.isFinite(raw) ? raw : null;
  const marketplace = record.marketplace;
  const source: ActionabilitySource | null = marketplace?.inCart
    ? 'inCart'
    : marketplace?.favorited
      ? 'favorited'
      : marketplace?.viewed
        ? 'viewed'
        : null;
  return { score, source };
}

const PRIORITY_BADGE: Record<PriorityLabel, string> = {
  urgent: 'bg-red-100 text-red-500',
  high: 'bg-amber-100 text-amber-600',
  medium: 'bg-yellow-100 text-yellow-600',
  low: 'bg-green-100 text-green-500',
  none: 'bg-gray-100 text-gray-500',
};

const SIGNAL_ORDER = ['categoryAffinity', 'coPurchase', 'segmentFit', 'purchasingActivity', 'priceSuitability'];

function PriorityBadge({ score }: { score: number }) {
  const t = useTranslations('dashboard.products.opportunitiesPage');
  const level = priorityLabelFromStored(score);
  return (
    <span className={`inline-block rounded-full px-2 py-1 text-xs font-bold ${PRIORITY_BADGE[level]}`}>
      {t(`priorityLabels.${level}`)}
    </span>
  );
}

export default function SkuVariantAnalysis() {
  const t = useTranslations('dashboard.products.opportunitiesPage');
  const { tShared } = useProductsTranslations();
  const searchParams = useSearchParams();
  const productId = searchParams.get('productId') || '';
  const router = useRouter();
  const [filters, setFilters] = useState({ q: '', type: 'all', minPriority: '', sort: 'priority' });
  const [page, setPage] = useState(1);
  const [data, setData] = useState<GroupResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedSku, setExpandedSku] = useState<number | null>(null);
  const [retailers, setRetailers] = useState<RetailerResponse | null>(null);
  const [retailerPage, setRetailerPage] = useState(1);
  const [retailerLoading, setRetailerLoading] = useState(false);
  const [selected, setSelected] = useState<RetailerRow | null>(null);
  const [detail, setDetail] = useState<DetailResponse | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const loadRequestRef = useRef(0);
  const retailerRequestRef = useRef(0);

  const load = useCallback(async (nextPage: number, current = filters) => {
    const requestId = ++loadRequestRef.current;
    setLoading(true);
    const params = new URLSearchParams({ group: 'variant', page: String(nextPage), limit: '10', sort: current.sort });
    if (productId) params.set('productId', productId);
    if (current.q.trim()) params.set('q', current.q.trim());
    if (current.type !== 'all') params.set('type', current.type);
    if (current.minPriority) params.set('minPriority', current.minPriority);
    try {
      const response = await fetch(`/api/products/opportunities?${params.toString()}`, { credentials: 'include' });
      if (requestId !== loadRequestRef.current) return;
      if (response.ok) {
        const payload = await response.json();
        if (requestId !== loadRequestRef.current) return;
        setData(payload);
      }
    } finally {
      if (requestId === loadRequestRef.current) setLoading(false);
    }
  }, [filters, productId]);

  useEffect(() => {
    void load(page);
  }, [load, page]);

  const loadRetailers = async (variantOptionId: number, nextPage = 1) => {
    const requestId = ++retailerRequestRef.current;
    setExpandedSku(variantOptionId);
    setRetailerPage(nextPage);
    setSelected(null);
    setDetail(null);
    setRetailerLoading(true);
    const params = new URLSearchParams({
      variantOptionId: String(variantOptionId),
      page: String(nextPage),
      limit: '10',
    });
    if (productId) params.set('productId', productId);
    if (filters.type !== 'all') params.set('type', filters.type);
    if (filters.minPriority) params.set('minPriority', filters.minPriority);
    if (filters.q.trim()) params.set('q', filters.q.trim());
    try {
      const response = await fetch(`/api/products/opportunities?${params.toString()}`, { credentials: 'include' });
      if (requestId !== retailerRequestRef.current) return;
      if (response.ok) {
        const payload = await response.json();
        if (requestId !== retailerRequestRef.current) return;
        setRetailers(payload);
      }
    } finally {
      if (requestId === retailerRequestRef.current) setRetailerLoading(false);
    }
  };

  const openCriteria = async (row: RetailerRow) => {
    setSelected(row);
    setDetail(null);
    setDetailLoading(true);
    try {
      const response = await fetch(`/api/products/opportunities/${row.id}`, { credentials: 'include' });
      if (response.ok) setDetail(await response.json());
    } finally {
      setDetailLoading(false);
    }
  };

  const closeCriteria = () => {
    setSelected(null);
    setDetail(null);
  };

  const setFilter = (patch: Partial<typeof filters>) => {
    setFilters({ ...filters, ...patch });
    setPage(1);
    setExpandedSku(null);
  };

  const product = data?.product;
  return (
    <div className="mx-auto w-full rounded-lg border border-[#e6e6e6] bg-white">
      <div className="flex flex-col gap-3 border-b border-[#e6e6e6] p-4 @3xl/main:flex-row @3xl/main:items-center">
        <button
          type="button"
          onClick={() => router.push('/products/opportunities')}
          className="flex w-full shrink-0 items-center justify-center gap-2 rounded-lg px-3 py-2 text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-800 @3xl/main:w-auto @3xl/main:justify-start"
        >
          <ArrowLeft className="h-4 w-4" />
          {t('back')}
        </button>
        <div className="flex min-w-0 items-center gap-3">
          <div className="h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-gray-100">
            {product?.image ? <img src={product.image} alt="" className="h-full w-full object-cover" /> : null}
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-bold text-gray-900">{t('variantAnalysisTitle')}</h1>
            <p className="truncate text-sm text-gray-600">{product?.name || t('variantAnalysisSubtitle')}</p>
          </div>
        </div>
      </div>

      <div className="p-4">
        <div className="flex flex-col gap-2 @4xl/main:flex-row @4xl/main:flex-wrap @4xl/main:items-center">
          <div className="relative min-w-0 flex-1">
            <input
              value={filters.q}
              onChange={(event) => setFilter({ q: event.target.value })}
              placeholder={t('searchSku')}
              aria-label={t('searchSku')}
              className="w-full rounded-lg border border-[#e6e6e6] bg-white py-2 pl-10 pr-4 text-sm text-black focus:outline-none focus:ring-2 focus:ring-[#0a61d7]"
            />
            <Search className="absolute left-3 top-2 h-5 w-5 text-gray-400" />
          </div>
          <FilterSelect
            label={t('type')}
            value={filters.type}
            allLabel={t('all')}
            options={[
              { value: 'new_assortment', label: t('types.new_assortment') },
              { value: 'reactivation', label: t('types.reactivation') },
            ]}
            onChange={(type) => setFilter({ type })}
          />
          <FilterSelect
            label={t('minPriority')}
            value={filters.minPriority || 'all'}
            allLabel={t('all')}
            options={[
              { value: '4', label: t('priorityLabels.urgent') },
              { value: '3', label: t('priorityLabels.high') },
              { value: '2', label: t('priorityLabels.medium') },
              { value: '1', label: t('priorityLabels.low') },
            ]}
            onChange={(minPriority) => setFilter({ minPriority: minPriority === 'all' ? '' : minPriority })}
          />
          <FilterSelect
            label={t('sort')}
            value={filters.sort}
            allLabel={t('sortPriority')}
            includeAll={false}
            options={[
              { value: 'priority', label: t('sortPriority') },
              { value: 'match', label: t('sortMatch') },
              { value: 'penetration', label: t('sortPenetration') },
              { value: 'retailers', label: t('sortRetailers') },
            ]}
            onChange={(sort) => setFilter({ sort })}
          />
        </div>

        <div className="mt-3 space-y-2">
          {loading ? (
            <div className="flex items-center gap-3 py-10">
              <div className="h-6 w-6 animate-spin rounded-full border-4 border-[#0a61d7] border-t-transparent" />
              <p className="text-sm text-gray-600">{t('refreshing')}</p>
            </div>
          ) : (data?.rows.length ?? 0) === 0 ? (
            <p className="py-10 text-center text-sm text-gray-500">{t('noRows')}</p>
          ) : data?.rows.map((group) => {
            const open = expandedSku === group.variantOptionId;
            const typeLabel = group.newAssortment > 0 && group.reactivation > 0
              ? `${group.reactivation} ${t('types.reactivation')} · ${group.newAssortment} ${t('types.new_assortment')}`
              : group.reactivation > 0 ? t('types.reactivation') : t('types.new_assortment');
            return (
              <article key={group.variantOptionId} className="rounded-lg border border-[#e6e6e6] bg-white">
                <button
                  type="button"
                  onClick={() => void (open ? setExpandedSku(null) : loadRetailers(group.variantOptionId, 1))}
                  className="flex w-full items-start gap-3 px-3 py-3 text-left"
                >
                  <ChevronDown className={`mt-0.5 h-4 w-4 shrink-0 text-gray-500 ${open ? 'rotate-180' : ''}`} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-black">{group.skuLabel}</span>
                    <span className="mt-0.5 block truncate text-xs text-gray-500">{group.variantName}</span>
                    <span className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-5">
                      <Metric label={t('opportunityType')} value={typeLabel} />
                      <Metric label={t('matchedRetailers')} value={String(group.retailerCount)} />
                      <Metric label={t('penetration')} value={`${group.penetration}%`} />
                      <Metric label={t('avgMatch')} value={String(group.matchScore)} />
                      <span className="min-w-0">
                        <span className="block text-[11px] font-medium uppercase tracking-wide text-gray-500">{t('priority')}</span>
                        <span className="mt-1 block"><PriorityBadge score={group.priorityScore} /></span>
                      </span>
                    </span>
                  </span>
                </button>
                {open ? (
                  <div className="border-t border-[#e6e6e6] px-3 py-2">
                    {retailerLoading ? (
                      <div className="flex items-center gap-3 py-6">
                        <div className="h-5 w-5 animate-spin rounded-full border-4 border-[#0a61d7] border-t-transparent" />
                        <p className="text-sm text-gray-600">{t('refreshing')}</p>
                      </div>
                    ) : (
                      <>
                        <div className="overflow-x-auto rounded-lg border border-[#e6e6e6]">
                          <table className="w-full">
                            <thead>
                              <tr className="whitespace-nowrap bg-gray-100 text-gray-500">
                                <th className="px-3 py-2 text-left text-xs font-medium uppercase">{t('retailer')}</th>
                                <th className="px-3 py-2 text-left text-xs font-medium uppercase">{t('segment')}</th>
                                <th className="px-3 py-2 text-left text-xs font-medium uppercase">{t('opportunityType')}</th>
                                <th className="px-3 py-2 text-left text-xs font-medium uppercase">{t('match')}</th>
                                <th className="px-3 py-2 text-left text-xs font-medium uppercase">{t('confidence')}</th>
                                <th className="px-3 py-2 text-left text-xs font-medium uppercase">{t('actionability')}</th>
                                <th className="px-3 py-2 text-left text-xs font-medium uppercase">{t('action')}</th>
                              </tr>
                            </thead>
                            <tbody className="text-xs">
                              {(retailers?.rows.length ?? 0) === 0 ? (
                                <tr><td colSpan={7} className="py-8 text-center text-sm text-gray-500">{t('noRows')}</td></tr>
                              ) : retailers?.rows.map((row) => {
                                const actionability = readActionability(row.breakdown);
                                return (
                                <tr
                                  key={row.id}
                                  onClick={() => void openCriteria(row)}
                                  className="cursor-pointer border-t border-[#e6e6e6] hover:bg-gray-50"
                                >
                                  <td className="px-3 py-2 font-medium text-gray-900">{row.retailerName}</td>
                                  <td className="px-3 py-2 text-gray-700">{row.segment}</td>
                                  <td className="px-3 py-2 text-gray-700">{t(`types.${row.opportunityType}`)}</td>
                                  <td className="px-3 py-2 text-gray-900">{row.matchScore}</td>
                                  <td className="px-3 py-2 text-gray-900">{Math.round(row.confidence * 100)}%</td>
                                  <td className="px-3 py-2 text-gray-900">
                                    <span className="block">{actionability.score ?? '—'}</span>
                                    {actionability.source ? (
                                      <span className="block text-[11px] text-gray-500">{t(`actionabilitySources.${actionability.source}`)}</span>
                                    ) : null}
                                  </td>
                                  <td className="px-3 py-2 text-gray-700">{t(`actions.${row.recommendedAction}`)}</td>
                                </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                        <Pager
                          page={retailerPage}
                          totalPages={retailers?.totalPages || 1}
                          showing={tShared('pagination.showing', {
                            from: retailers && retailers.total > 0 ? (retailerPage - 1) * 10 + 1 : 0,
                            to: retailers ? Math.min(retailerPage * 10, retailers.total) : 0,
                            total: retailers?.total ?? 0,
                          })}
                          previousLabel={tShared('previousPage')}
                          nextLabel={tShared('nextPage')}
                          onPage={(next) => void loadRetailers(group.variantOptionId, next)}
                        />
                      </>
                    )}
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>

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
      {selected ? (
        <CriteriaModal
          retailer={selected}
          detail={detail}
          loading={detailLoading}
          onClose={closeCriteria}
        />
      ) : null}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <span className="min-w-0">
      <span className="block text-[11px] font-medium uppercase tracking-wide text-gray-500">{label}</span>
      <span className="mt-1 block truncate text-sm font-medium text-gray-900">{value}</span>
    </span>
  );
}

function FilterSelect({
  label,
  value,
  options,
  onChange,
  allLabel,
  includeAll = true,
}: {
  label: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
  allLabel: string;
  includeAll?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const choices = includeAll ? [{ value: 'all', label: value === 'all' ? label : allLabel }, ...options] : options;
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
        onClick={() => setOpen((next) => !next)}
        className="flex w-full items-center justify-between gap-1 whitespace-nowrap rounded-lg border border-[#e6e6e6] bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 @4xl/main:w-auto @4xl/main:justify-start"
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

function CriteriaModal({
  retailer,
  detail,
  loading,
  onClose,
}: {
  retailer: RetailerRow;
  detail: DetailResponse | null;
  loading: boolean;
  onClose: () => void;
}) {
  const t = useTranslations('dashboard.products.opportunitiesPage');
  const signals = detail?.opportunity.breakdown.signals ?? {};
  const keys = [...SIGNAL_ORDER.filter((key) => key in signals), ...Object.keys(signals).filter((key) => !SIGNAL_ORDER.includes(key))];
  const actionability = readActionability(detail?.opportunity.breakdown ?? retailer.breakdown);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-labelledby="criteria-title" onClick={onClose}>
      <div className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-lg border border-[#e6e6e6] bg-white shadow-xl" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 border-b border-[#e6e6e6] p-4">
          <div className="min-w-0">
            <h2 id="criteria-title" className="truncate text-lg font-bold text-gray-900">{retailer.retailerName}</h2>
            <p className="mt-0.5 truncate text-sm text-gray-600">{retailer.segment} · {t(`types.${retailer.opportunityType}`)}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1 text-gray-500 hover:bg-gray-100" aria-label={t('close')}>
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="grid grid-cols-2 gap-3 border-b border-[#e6e6e6] px-4 py-3 sm:grid-cols-4">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-wide text-gray-500">{t('match')}</p>
            <p className="mt-1 text-lg font-semibold text-gray-900">{retailer.matchScore}</p>
          </div>
          <div>
            <p className="text-[11px] font-medium uppercase tracking-wide text-gray-500">{t('confidence')}</p>
            <p className="mt-1 text-lg font-semibold text-gray-900">{Math.round(retailer.confidence * 100)}%</p>
          </div>
          <div>
            <p className="text-[11px] font-medium uppercase tracking-wide text-gray-500">{t('actionability')}</p>
            <p className="mt-1 text-lg font-semibold text-gray-900">{actionability.score ?? '—'}</p>
            {actionability.source ? (
              <p className="text-xs text-gray-500">{t(`actionabilitySources.${actionability.source}`)}</p>
            ) : null}
          </div>
          <div>
            <p className="text-[11px] font-medium uppercase tracking-wide text-gray-500">{t('action')}</p>
            <p className="mt-1 text-sm font-semibold text-gray-900">{t(`actions.${retailer.recommendedAction}`)}</p>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-auto p-4">
          {loading || !detail ? (
            <div className="flex items-center gap-3 py-8">
              <div className="h-5 w-5 animate-spin rounded-full border-4 border-[#0a61d7] border-t-transparent" />
              <p className="text-sm text-gray-600">{t('refreshing')}</p>
            </div>
          ) : (
            <>
              <h3 className="text-sm font-semibold text-gray-900">{t('criteria')}</h3>
              <table className="mt-2 w-full">
                <thead>
                  <tr className="text-left text-[11px] font-medium uppercase tracking-wide text-gray-500">
                    <th className="py-2 pr-4 font-medium">{t('criteria')}</th>
                    <th className="w-24 py-2 text-right font-medium">{t('weight')}</th>
                    <th className="w-20 py-2 pl-4 text-right font-medium">{t('score')}</th>
                  </tr>
                </thead>
                <tbody>
                  {keys.map((key) => {
                    const signal = signals[key];
                    const score = signal?.available && signal.score != null ? String(signal.score) : '—';
                    return (
                      <tr key={key} className="border-t border-[#e6e6e6] text-sm">
                        <td className="py-2.5 pr-4 text-gray-800">{t(`signals.${key}` as 'signals.categoryAffinity')}</td>
                        <td className="py-2.5 text-right text-gray-600">{signal?.weight ?? 0}</td>
                        <td className="py-2.5 pl-4 text-right font-semibold text-gray-900">{score}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <h3 className="mt-5 text-sm font-semibold text-gray-900">{t('evidence')}</h3>
              <ul className="mt-2 space-y-2">
                {detail.opportunity.reasons.length === 0 ? (
                  <li className="text-sm text-gray-500">{t('unavailable')}</li>
                ) : detail.opportunity.reasons.map((reason) => (
                  <li key={reason} className="rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-800">
                    {t(`reasonLabels.${reason}` as 'reasonLabels.never_purchased')}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
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
    <div className="mt-3 flex items-center justify-between">
      <div className="text-sm text-gray-500">{showing}</div>
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => onPage(Math.max(1, page - 1))} disabled={page <= 1} aria-label={previousLabel} className="px-3 py-1 text-sm text-gray-500 hover:text-gray-700 disabled:cursor-not-allowed disabled:opacity-50">
          <ChevronLeft className="h-4 w-4" />
        </button>
        <div className="flex items-center gap-1">
          {getVisiblePageNumbers(page, totalPages).map((pageNum) => (
            <button key={pageNum} type="button" onClick={() => onPage(pageNum)} className={`rounded-lg px-3 py-2 text-sm ${page === pageNum ? 'bg-[#0a61d7] text-white' : 'text-gray-500 hover:bg-gray-100 hover:text-gray-700'}`}>
              {pageNum}
            </button>
          ))}
        </div>
        <button type="button" onClick={() => onPage(Math.min(totalPages, page + 1))} disabled={page >= totalPages} aria-label={nextLabel} className="px-3 py-1 text-sm text-gray-500 hover:text-gray-700 disabled:cursor-not-allowed disabled:opacity-50">
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
