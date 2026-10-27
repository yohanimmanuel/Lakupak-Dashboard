'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, ChevronLeft, ChevronRight, Filter, Search, X } from 'lucide-react';
import { useUserStore } from '@/store/userStore';
import { fetchGraphQL } from '@/lib/graphqlClient';
import { useProductsTranslations } from '@/hooks/useProductsTranslations';
import {
  PREFERRED_ASSORTMENT_SEGMENTS,
  type AssortmentCellKind,
  type AssortmentSegment,
} from '@/lib/products/assortmentGapShared';
import { getVisiblePageNumbers } from '@/utils/tablePagination';

const KNOWN_SEGMENT_LABELS = new Set<string>(PREFERRED_ASSORTMENT_SEGMENTS);

type Cell = {
  segment: AssortmentSegment;
  purchased: number;
  eligible: number;
  penetration: number | null;
  kind: AssortmentCellKind;
};

type Row = {
  productId: string;
  name: string;
  sku: string;
  categoryLabel: string | null;
  cells: Cell[];
};

type VariantRow = {
  variantOptionId: number;
  variantName: string;
  sku: string | null;
  cells: Cell[];
};

type Heatmap = {
  segments: AssortmentSegment[];
  rows: Row[];
  categories: { slug: string; label: string }[];
  totalProducts: number;
  page: number;
  limit: number;
};

const PERIODS = ['30d', '90d', '180d', '365d', 'all'] as const;
const PAGE_SIZE = 6;
const VARIANT_PAGE_SIZE = 5;

/** Static styles for empty / zero cells (unchanged). */
const TILE_STATIC: Record<'missing' | 'zero', string> = {
  missing: 'bg-gray-100 text-gray-400',
  zero: 'bg-red-50 text-red-700',
};

const ZERO_PRESENCE_COLOR = '#b91c1c';

/** Continuous red → yellow → green for penetration &gt; 0. */
function penetrationHue(penetration: number): number {
  const t = Math.min(100, Math.max(0, penetration)) / 100;
  return t * 120; // 0° red → 60° yellow → 120° green
}

function penetrationFill(penetration: number): string {
  return `hsl(${penetrationHue(penetration)} 82% 46%)`;
}

function penetrationOnFill(penetration: number): string {
  const hue = penetrationHue(penetration);
  // Yellow through green (incl. 100%) is bright; use dark text. Keep white on reds.
  return hue > 38 ? '#111827' : '#ffffff';
}

/** Darker ink for tooltip text on white (same hue family as the fill). */
function penetrationInk(penetration: number): string {
  return `hsl(${penetrationHue(penetration)} 72% 32%)`;
}

const SCALE_GRADIENT =
  'linear-gradient(to right, hsl(0 82% 46%), hsl(60 82% 46%), hsl(120 72% 42%))';

const QUERY = `
  query AssortmentGap(
    $userId: Int!
    $category: String
    $segment: String
    $period: String
    $search: String
    $page: Int
    $limit: Int
  ) {
    assortmentGapHeatmap(
      userId: $userId
      category: $category
      segment: $segment
      period: $period
      search: $search
      page: $page
      limit: $limit
    ) {
      segments
      totalProducts
      page
      limit
      categories { slug label }
      rows {
        productId
        name
        sku
        categoryLabel
        cells { segment purchased eligible penetration kind }
      }
    }
  }
`;

const VARIANTS_QUERY = `
  query AssortmentGapVariants(
    $userId: Int!
    $productId: String!
    $segment: String
    $period: String
  ) {
    assortmentGapVariants(
      userId: $userId
      productId: $productId
      segment: $segment
      period: $period
    ) {
      productId
      name
      sku
      segments
      rows {
        variantOptionId
        variantName
        sku
        cells { segment purchased eligible penetration kind }
      }
    }
  }
`;

export default function AssortmentGapHeatmap() {
  const { tHeatmap, tShared } = useProductsTranslations();
  const user = useUserStore((state) => state.user);
  const [category, setCategory] = useState('all');
  const [segment, setSegment] = useState('all');
  const [period, setPeriod] = useState<(typeof PERIODS)[number]>('90d');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Heatmap | null>(null);
  const [segmentOptions, setSegmentOptions] = useState<AssortmentSegment[]>([
    ...PREFERRED_ASSORTMENT_SEGMENTS,
  ]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openRow, setOpenRow] = useState<Row | null>(null);
  const [variantRows, setVariantRows] = useState<VariantRow[] | null>(null);
  const [variantPage, setVariantPage] = useState(1);
  const [variantLoading, setVariantLoading] = useState(false);
  const [variantError, setVariantError] = useState<string | null>(null);
  const loadRequestIdRef = useRef(0);
  const variantsRequestIdRef = useRef(0);

  const load = useCallback(async () => {
    if (!user?.id) return;
    const requestId = ++loadRequestIdRef.current;
    setLoading(true);
    setError(null);
    try {
      const result = await fetchGraphQL<{ assortmentGapHeatmap: Heatmap }>(QUERY, {
        userId: user.id,
        category,
        segment,
        period,
        search,
        page,
        limit: PAGE_SIZE,
      });
      if (requestId !== loadRequestIdRef.current) return;
      const heatmap = result.assortmentGapHeatmap;
      setData(heatmap);
      if (segment === 'all' && heatmap.segments?.length) {
        setSegmentOptions(heatmap.segments);
      }
    } catch (err) {
      if (requestId !== loadRequestIdRef.current) return;
      setError(err instanceof Error ? err.message : tHeatmap('error'));
      setData(null);
    } finally {
      if (requestId === loadRequestIdRef.current) {
        setLoading(false);
      }
    }
  }, [user?.id, category, segment, period, search, page, tHeatmap]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const next = searchInput.trim();
    const timer = window.setTimeout(() => {
      setSearch((previous) => {
        if (previous !== next) setPage(1);
        return next;
      });
    }, 300);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    if (!openRow) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpenRow(null);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [openRow]);

  const openVariants = useCallback(
    async (row: Row) => {
      if (!user?.id) return;
      const requestId = ++variantsRequestIdRef.current;
      setOpenRow(row);
      setVariantRows(null);
      setVariantPage(1);
      setVariantError(null);
      setVariantLoading(true);
      try {
        const result = await fetchGraphQL<{
          assortmentGapVariants: { name: string; rows: VariantRow[] };
        }>(VARIANTS_QUERY, {
          userId: user.id,
          productId: row.productId,
          segment,
          period,
        });
        if (requestId !== variantsRequestIdRef.current) return;
        setVariantRows(result.assortmentGapVariants.rows);
      } catch (err) {
        if (requestId !== variantsRequestIdRef.current) return;
        setVariantError(err instanceof Error ? err.message : tHeatmap('error'));
      } finally {
        if (requestId === variantsRequestIdRef.current) {
          setVariantLoading(false);
        }
      }
    },
    [user?.id, segment, period, tHeatmap],
  );

  const total = data?.totalProducts ?? 0;
  const limit = data?.limit ?? PAGE_SIZE;
  const from = total === 0 ? 0 : (page - 1) * limit + 1;
  const to = Math.min(page * limit, total);
  const totalPages = Math.max(1, Math.ceil(total / limit) || 1);
  const segments = data?.segments?.length
    ? data.segments
    : segment === 'all'
      ? [...PREFERRED_ASSORTMENT_SEGMENTS]
      : [segment as AssortmentSegment];

  const variantTotal = variantRows?.length ?? 0;
  const variantFrom = variantTotal === 0 ? 0 : (variantPage - 1) * VARIANT_PAGE_SIZE + 1;
  const variantTo = Math.min(variantPage * VARIANT_PAGE_SIZE, variantTotal);
  const variantTotalPages = Math.max(1, Math.ceil(variantTotal / VARIANT_PAGE_SIZE) || 1);
  const pagedVariantRows = variantRows?.slice(
    (variantPage - 1) * VARIANT_PAGE_SIZE,
    variantPage * VARIANT_PAGE_SIZE,
  );

  const segmentLabel = (name: string) =>
    KNOWN_SEGMENT_LABELS.has(name) ? tHeatmap(`segments.${name}`) : name;

  return (
    <div className="flex min-h-full w-full min-w-0 flex-col">
      <div className="mb-4">
        <h1 className="truncate text-2xl font-bold text-black">{tHeatmap('title')}</h1>
        <p className="mt-1 max-w-3xl text-sm text-gray-600">{tHeatmap('subtitle')}</p>
      </div>

      <div className="mx-auto mt-0 w-full min-w-0 rounded-lg border border-[#e6e6e6] bg-white p-4">
        <div className="relative mb-3 w-full">
          <input
            type="text"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder={tHeatmap('searchPlaceholder')}
            aria-label={tHeatmap('searchPlaceholder')}
            className="w-full rounded-lg border border-[#e6e6e6] bg-white py-2 pl-10 pr-4 text-sm text-black focus:outline-none focus:ring-2 focus:ring-[#0a61d7]"
          />
          <Search className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
        </div>
        <div className="mb-4 flex w-full min-w-0 flex-col gap-2 @4xl/main:flex-row @4xl/main:flex-wrap @4xl/main:items-center">
          <FilterSelect
            label={tHeatmap('category')}
            value={category}
            onChange={(value) => {
              setPage(1);
              setCategory(value);
            }}
            options={[
              { value: 'all', label: tHeatmap('allCategories') },
              ...(data?.categories ?? []).map((row) => ({ value: row.slug, label: row.label })),
            ]}
          />
          <FilterSelect
            label={tHeatmap('segment')}
            value={segment}
            onChange={(value) => {
              setPage(1);
              setSegment(value);
            }}
            options={[
              { value: 'all', label: tHeatmap('allSegments') },
              ...segmentOptions.map((name) => ({
                value: name,
                label: segmentLabel(name),
              })),
            ]}
          />
          <FilterSelect
            label={tHeatmap('period')}
            value={period}
            onChange={(value) => {
              setPage(1);
              setPeriod(value as (typeof PERIODS)[number]);
            }}
            options={PERIODS.map((value) => ({
              value,
              label: tHeatmap(`periods.${value}`),
            }))}
          />
          <div className="ml-auto flex flex-wrap items-center gap-2 text-[11px] text-gray-600">
            <Legend swatch={TILE_STATIC.missing} label={tHeatmap('legendMissing')} />
            <Legend swatch={TILE_STATIC.zero} label={tHeatmap('legendZero')} />
            <span className="inline-flex items-center gap-1.5">
              <span>{tHeatmap('legendLow')}</span>
              <span
                className="h-3 w-20 rounded-sm border border-[#e6e6e6]"
                style={{ background: SCALE_GRADIENT }}
                aria-hidden
              />
              <span>{tHeatmap('legendHigh')}</span>
            </span>
          </div>
        </div>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-16">
            <div className="mb-4 h-8 w-8 animate-spin rounded-full border-4 border-[#0a61d7] border-t-transparent" />
            <p className="text-sm text-gray-600">{tHeatmap('loading')}</p>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center gap-3 py-16">
            <p className="text-sm text-red-600">{error}</p>
            <button
              type="button"
              onClick={() => void load()}
              className="rounded-lg bg-[#0a61d7] px-3 py-2 text-xs font-semibold text-white hover:bg-[#084ba6]"
            >
              {tHeatmap('retry')}
            </button>
          </div>
        ) : !data || data.rows.length === 0 ? (
          <p className="py-16 text-center text-sm text-gray-500">{tHeatmap('empty')}</p>
        ) : (
          <div className="overflow-x-auto">
            <table
              className="w-full border-separate border-spacing-x-1.5 border-spacing-y-1 text-xs"
              style={{ minWidth: `${10 + segments.length * 4.75}rem` }}
            >
              <thead>
                <tr className="text-gray-500">
                  <th className="min-w-[10rem] w-[22%] px-2 py-1 text-left text-[11px] font-medium uppercase">
                    {tHeatmap('product')}
                  </th>
                  {segments.map((name) => (
                    <th
                      key={name}
                      className="min-w-[4.75rem] whitespace-nowrap px-0.5 py-1 text-center text-[11px] font-medium"
                    >
                      {segmentLabel(name)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.rows.map((row) => (
                  <tr
                    key={row.productId}
                    className="cursor-pointer rounded-lg hover:bg-gray-50"
                    onClick={() => void openVariants(row)}
                  >
                    <td className="min-w-[10rem] rounded-l-lg px-2 py-1 align-middle">
                      <button
                        type="button"
                        className="block w-full min-w-0 truncate text-left text-xs font-semibold text-black hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0a61d7]"
                        title={row.name}
                        aria-label={`${tHeatmap('openVariants')}: ${row.name}`}
                        onClick={(event) => {
                          event.stopPropagation();
                          void openVariants(row);
                        }}
                      >
                        {row.name}
                      </button>
                      <div className="truncate text-[10px] text-gray-400">
                        {row.categoryLabel || tHeatmap('uncategorized')}
                      </div>
                    </td>
                    {segments.map((name) => {
                      const cell = row.cells.find((item) => item.segment === name);
                      return (
                        <td
                          key={name}
                          className="min-w-[4.75rem] px-0 py-0.5 text-center align-middle last:rounded-r-lg"
                        >
                          <HeatTile
                            cell={cell}
                            label={`${row.name} · ${segmentLabel(name)}`}
                          />
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {total > 0 ? (
          <div className="mt-4 flex min-w-0 flex-wrap items-center justify-between gap-3">
            <div className="min-w-0 shrink text-sm text-gray-500">
              {tShared('pagination.showing', { from, to, total })}
            </div>
            <div className="flex max-w-full min-w-0 items-center gap-2 overflow-x-auto">
              <button
                type="button"
                onClick={() => setPage(Math.max(1, page - 1))}
                disabled={page === 1 || loading}
                aria-label={tShared('previousPage')}
                className="shrink-0 px-3 py-1 text-sm text-gray-500 hover:text-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <div className="flex items-center gap-1">
                {getVisiblePageNumbers(page, totalPages).map((pageNum) => (
                  <button
                    key={pageNum}
                    type="button"
                    onClick={() => setPage(pageNum)}
                    disabled={loading}
                    className={`shrink-0 px-3 py-2 text-sm rounded-lg ${
                      page === pageNum
                        ? 'bg-[#0a61d7] text-white'
                        : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
                    }`}
                  >
                    {pageNum}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => setPage(Math.min(totalPages, page + 1))}
                disabled={page === totalPages || loading}
                aria-label={tShared('nextPage')}
                className="shrink-0 px-3 py-1 text-sm text-gray-500 hover:text-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        ) : null}
      </div>

      {openRow ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal>
          <div className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-lg border border-[#e6e6e6] bg-white shadow-xl">
            <div className="flex items-start justify-between gap-3 border-b border-[#e6e6e6] p-4">
              <div className="min-w-0">
                <h2 className="truncate text-lg font-bold text-black">{tHeatmap('variantTitle')}</h2>
                <p className="mt-0.5 text-sm text-gray-600">
                  {tHeatmap('variantSubtitle', { name: openRow.name })}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpenRow(null)}
                className="rounded-lg p-1 text-gray-500 hover:bg-gray-100"
                aria-label={tHeatmap('close')}
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-auto p-4">
              {variantLoading ? (
                <div className="flex flex-col items-center justify-center py-10">
                  <div className="mb-4 h-8 w-8 animate-spin rounded-full border-4 border-[#0a61d7] border-t-transparent" />
                  <p className="text-sm text-gray-600">{tHeatmap('variantLoading')}</p>
                </div>
              ) : variantError ? (
                <p className="py-10 text-center text-sm text-red-600">{variantError}</p>
              ) : !variantRows || variantRows.length === 0 ? (
                <p className="py-10 text-center text-sm text-gray-500">{tHeatmap('variantEmpty')}</p>
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <table
                      className="w-full border-separate border-spacing-x-1.5 border-spacing-y-1 text-xs"
                      style={{ minWidth: `${10 + segments.length * 4.75}rem` }}
                    >
                      <thead>
                        <tr className="text-gray-500">
                          <th className="min-w-[10rem] w-[22%] px-2 py-1 text-left text-[11px] font-medium uppercase">
                            {tHeatmap('variant')}
                          </th>
                          {segments.map((name) => (
                            <th
                              key={name}
                              className="min-w-[4.75rem] whitespace-nowrap px-0.5 py-1 text-center text-[11px] font-medium"
                            >
                              {segmentLabel(name)}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {(pagedVariantRows ?? []).map((row) => (
                          <tr key={`${row.variantOptionId}-${row.variantName}`}>
                            <td className="min-w-[10rem] px-2 py-1 align-middle">
                              <div
                                className="truncate text-xs font-semibold text-black"
                                title={row.variantName}
                              >
                                {row.variantName}
                              </div>
                              {row.sku ? (
                                <div className="truncate text-[10px] text-gray-400">{row.sku}</div>
                              ) : null}
                            </td>
                            {segments.map((name) => {
                              const cell = row.cells.find((item) => item.segment === name);
                              return (
                                <td
                                  key={name}
                                  className="min-w-[4.75rem] px-0 py-0.5 text-center align-middle"
                                >
                                  <HeatTile
                                    cell={cell}
                                    label={`${row.variantName} · ${segmentLabel(name)}`}
                                  />
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {variantTotal > VARIANT_PAGE_SIZE ? (
                    <div className="mt-4 flex min-w-0 flex-wrap items-center justify-between gap-3">
                      <div className="min-w-0 shrink text-sm text-gray-500">
                        {tShared('pagination.showing', {
                          from: variantFrom,
                          to: variantTo,
                          total: variantTotal,
                        })}
                      </div>
                      <div className="flex max-w-full min-w-0 items-center gap-2 overflow-x-auto">
                        <button
                          type="button"
                          onClick={() => setVariantPage(Math.max(1, variantPage - 1))}
                          disabled={variantPage === 1}
                          aria-label={tShared('previousPage')}
                          className="shrink-0 px-3 py-1 text-sm text-gray-500 hover:text-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <ChevronLeft className="w-4 h-4" />
                        </button>
                        <div className="flex items-center gap-1">
                          {getVisiblePageNumbers(variantPage, variantTotalPages).map((pageNum) => (
                            <button
                              key={pageNum}
                              type="button"
                              onClick={() => setVariantPage(pageNum)}
                              className={`shrink-0 px-3 py-2 text-sm rounded-lg ${
                                variantPage === pageNum
                                  ? 'bg-[#0a61d7] text-white'
                                  : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
                              }`}
                            >
                              {pageNum}
                            </button>
                          ))}
                        </div>
                        <button
                          type="button"
                          onClick={() =>
                            setVariantPage(Math.min(variantTotalPages, variantPage + 1))
                          }
                          disabled={variantPage === variantTotalPages}
                          aria-label={tShared('nextPage')}
                          className="shrink-0 px-3 py-1 text-sm text-gray-500 hover:text-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <ChevronRight className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ) : null}
                </>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

type HeatTipPos = {
  top: number;
  left: number;
  place: 'above' | 'below';
  ready: boolean;
};

function HeatTile({
  cell,
  label,
}: {
  cell?: Cell;
  label: string;
}) {
  const { tHeatmap } = useProductsTranslations();
  const tileRef = useRef<HTMLSpanElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const [tip, setTip] = useState<HeatTipPos | null>(null);

  const showTip = () => {
    const rect = tileRef.current?.getBoundingClientRect();
    if (!rect) return;
    const gap = 8;
    const estimatedHeight = 96;
    const place: 'above' | 'below' =
      rect.top < estimatedHeight + gap ? 'below' : 'above';
    setTip({
      top: place === 'above' ? rect.top - gap : rect.bottom + gap,
      left: rect.left + rect.width / 2,
      place,
      ready: false,
    });
  };

  useLayoutEffect(() => {
    if (!tip || tip.ready) return;
    const tipEl = tipRef.current;
    const tileEl = tileRef.current;
    if (!tipEl || !tileEl) return;

    const tipRect = tipEl.getBoundingClientRect();
    const tileRect = tileEl.getBoundingClientRect();
    const gap = 8;
    const margin = 8;
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    let place = tip.place;
    if (place === 'above' && tipRect.top < margin) place = 'below';
    else if (place === 'below' && tipRect.bottom > vh - margin) place = 'above';

    const top = place === 'above' ? tileRect.top - gap : tileRect.bottom + gap;
    const half = tipRect.width / 2;
    const left = Math.min(
      vw - margin - half,
      Math.max(margin + half, tileRect.left + tileRect.width / 2),
    );

    setTip({ top, left, place, ready: true });
  }, [tip]);

  if (!cell) {
    return (
      <span className="inline-flex h-20 w-full min-w-[3.75rem] items-center justify-center rounded-lg bg-gray-100 text-xs font-semibold text-gray-400">
        —
      </span>
    );
  }

  const value = cell.kind === 'missing' ? '—' : `${cell.penetration ?? 0}%`;
  const isScaled = cell.kind !== 'missing' && cell.kind !== 'zero';
  const fill = isScaled ? penetrationFill(cell.penetration ?? 0) : undefined;
  const onFill = isScaled ? penetrationOnFill(cell.penetration ?? 0) : undefined;
  const presenceColor =
    cell.kind === 'zero'
      ? ZERO_PRESENCE_COLOR
      : isScaled
        ? penetrationInk(cell.penetration ?? 0)
        : undefined;

  const tipBody =
    cell.kind === 'missing' ? (
      <p className="text-xs text-gray-600">{tHeatmap('missingExplain')}</p>
    ) : (
      <>
        <p
          className="text-sm font-semibold tabular-nums"
          style={presenceColor ? { color: presenceColor } : undefined}
        >
          {tHeatmap('hoverPresence', { value: cell.penetration ?? 0 })}
        </p>
        <p className="mt-0.5 text-xs tabular-nums text-gray-700">
          {cell.purchased}/{cell.eligible}
        </p>
        <p className="mt-0.5 text-[11px] text-gray-500">
          {tHeatmap('hoverFraction', {
            purchased: cell.purchased,
            eligible: cell.eligible,
          })}
        </p>
      </>
    );

  return (
    <>
      <span
        ref={tileRef}
        onMouseEnter={showTip}
        onFocus={showTip}
        onMouseLeave={() => setTip(null)}
        onBlur={() => setTip(null)}
        onClick={() => setTip(null)}
        tabIndex={0}
        aria-label={
          cell.kind === 'missing'
            ? `${label}. ${tHeatmap('missingExplain')}`
            : `${label}. ${tHeatmap('hoverPresence', { value: cell.penetration ?? 0 })}. ${tHeatmap(
                'hoverFraction',
                { purchased: cell.purchased, eligible: cell.eligible },
              )}`
        }
        style={
          fill && onFill
            ? { backgroundColor: fill, color: onFill }
            : undefined
        }
        className={`inline-flex h-20 w-full min-w-[3.75rem] cursor-help items-center justify-center rounded-lg text-xs font-semibold tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-[#0a61d7] ${
          cell.kind === 'missing' || cell.kind === 'zero' ? TILE_STATIC[cell.kind] : ''
        }`}
      >
        {value}
      </span>
      {tip && typeof document !== 'undefined'
        ? createPortal(
            <div
              ref={tipRef}
              role="tooltip"
              className={`pointer-events-none fixed z-[200] w-max max-w-[16rem] -translate-x-1/2 rounded-lg border border-[#e6e6e6] bg-white px-3 py-2 shadow-lg ${
                tip.place === 'above' ? '-translate-y-full' : ''
              }`}
              style={{ top: tip.top, left: tip.left }}
            >
              <p className="truncate text-xs font-medium text-black">{label}</p>
              <div className="mt-1">{tipBody}</div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}) {
  const [open, setOpen] = useState(false);
  const current = options.find((option) => option.value === value)?.label ?? label;
  return (
    <div className="relative w-full @4xl/main:w-auto">
      <button
        type="button"
        className="flex w-full items-center justify-between gap-1 whitespace-nowrap rounded-lg border border-[#e6e6e6] bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 @4xl/main:w-auto @4xl/main:justify-start"
        onClick={() => setOpen((value) => !value)}
      >
        <Filter className="h-4 w-4" />
        {current}
        <ChevronDown className="h-4 w-4" />
      </button>
      {open ? (
        <div className="absolute left-0 z-20 mt-2 max-h-56 w-48 overflow-y-auto rounded-lg border border-[#e6e6e6] bg-white shadow">
          {options.map((option) => (
            <button
              key={option.value}
              type="button"
              className={`block w-full px-4 py-2 text-left text-sm hover:bg-gray-100 ${
                option.value === value ? 'font-semibold text-[#0a61d7]' : 'text-gray-700'
              }`}
              onClick={() => {
                onChange(option.value);
                setOpen(false);
              }}
            >
              {option.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function Legend({ swatch, label }: { swatch: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`h-3 w-3 rounded-sm ${swatch}`} />
      {label}
    </span>
  );
}
