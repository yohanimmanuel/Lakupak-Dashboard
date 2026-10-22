'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Filter,
  Loader2,
  Search,
  Target,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { fetchGraphQL } from '@/lib/graphqlClient';
import { useUserStore } from '@/store/userStore';
import type { Buyer } from '@/types/client';
import type { Order } from '@/types/order';
import { formatCompactCurrency, getDefaultCurrency } from '@/utils/currencyUtils';
import {
  buildSalesConversionInsights,
  type SalesConversionJobInput,
  type SalesConversionOpportunity,
  type SalesConversionOpportunityKind,
} from '@/lib/salesConversion/buildSalesConversionInsights';
import { OPPORTUNITY_KIND_BADGE_STYLES } from '@/lib/salesConversion/opportunityKindStyles';
import {
  getOpportunityUrgencyLevel,
  OPPORTUNITY_URGENCY_BADGE_STYLES,
} from '@/lib/salesConversion/opportunityUrgency';

type Filter = 'all' | SalesConversionOpportunityKind;

const FILTERS: Filter[] = ['all', 'reorder', 'quotation', 'buyer_interest', 'sales_task'];
const ROWS_PER_PAGE = 8;

type TimingFilter = 'all' | 'days30' | 'days14' | 'days7' | 'under7' | 'none';
const TIMING_FILTERS: TimingFilter[] = ['all', 'days30', 'days14', 'days7', 'under7', 'none'];

type ValueFilter = 'all' | 'high' | 'medium' | 'low' | 'none';
const VALUE_FILTERS: ValueFilter[] = ['all', 'high', 'medium', 'low', 'none'];
const VALUE_HIGH_THRESHOLD = 500000;
const VALUE_MEDIUM_THRESHOLD = 100000;

function matchesTiming(days: number, timing: TimingFilter): boolean {
  switch (timing) {
    case 'days30':
      return days >= 30;
    case 'days14':
      return days >= 14 && days < 30;
    case 'days7':
      return days >= 7 && days < 14;
    case 'under7':
      return days >= 1 && days < 7;
    case 'none':
      return days === 0;
    default:
      return true;
  }
}

function matchesValue(value: number, filter: ValueFilter): boolean {
  switch (filter) {
    case 'high':
      return value >= VALUE_HIGH_THRESHOLD;
    case 'medium':
      return value >= VALUE_MEDIUM_THRESHOLD && value < VALUE_HIGH_THRESHOLD;
    case 'low':
      return value > 0 && value < VALUE_MEDIUM_THRESHOLD;
    case 'none':
      return value === 0;
    default:
      return true;
  }
}

const SNAPSHOT_QUERY = `
  query SalesConversionSnapshot($userId: Int!, $ordersLimit: Int!, $productsLimit: Int!, $contactsLimit: Int!) {
    dashboardSnapshot(userId: $userId, ordersLimit: $ordersLimit, productsLimit: $productsLimit, contactsLimit: $contactsLimit) {
      orders {
        orderId
        buyerId
        orderStatus
        paymentStatus
        totalAmount
        storeName
        contactPerson
        orderDate
        createdAt
        orderItems {
          productName
          productNameSnapshot
          subtotal
          offerApplied
        }
      }
      buyers {
        buyerId
        owner
        storeName
        status
        avgMonthlySpending
      }
    }
  }
`;

const JOBS_QUERY = `
  query SalesConversionJobs($userId: Int!) {
    salesJobs(userId: $userId) {
      id
      clientId
      clientName
      agentName
      jobType
      status
      createdAt
    }
  }
`;

type RawRecord = Record<string, unknown>;

function asRecord(value: unknown): RawRecord | null {
  return value != null && typeof value === 'object' ? (value as RawRecord) : null;
}

function text(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : value == null ? fallback : String(value);
}

function number(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function actionHref(opportunity: SalesConversionOpportunity): string {
  if (opportunity.kind === 'quotation' && opportunity.orderId) {
    return `/orders/details/${encodeURIComponent(opportunity.orderId)}`;
  }
  if (opportunity.kind === 'sales_task') {
    return '/sales/jobs';
  }
  if (opportunity.buyerId) {
    return `/clients/buyers/details/${encodeURIComponent(opportunity.buyerId)}`;
  }
  return '/clients/buyers';
}

export default function SalesConversionTable() {
  const t = useTranslations('dashboard.home.widgets.conversion');
  const tHub = useTranslations('dashboard.sales.hub.conversion');
  const tJobs = useTranslations('dashboard.sales.salesJobs');
  const user = useUserStore((state) => state.user);
  const currency = user?.currency || getDefaultCurrency();

  const [orders, setOrders] = useState<Order[]>([]);
  const [buyers, setBuyers] = useState<Buyer[]>([]);
  const [salesJobs, setSalesJobs] = useState<SalesConversionJobInput[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [filter, setFilter] = useState<Filter>('all');
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [timingFilter, setTimingFilter] = useState<TimingFilter>('all');
  const [valueFilter, setValueFilter] = useState<ValueFilter>('all');
  const [showTimingDropdown, setShowTimingDropdown] = useState(false);
  const [showValueDropdown, setShowValueDropdown] = useState(false);
  const timingDropdownRef = useRef<HTMLDivElement>(null);
  const valueDropdownRef = useRef<HTMLDivElement>(null);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [indicatorStyle, setIndicatorStyle] = useState({ left: 0, width: 0 });

  useEffect(() => {
    const index = FILTERS.indexOf(filter);
    const activeTab = tabRefs.current[index];
    if (activeTab) {
      setIndicatorStyle({ left: activeTab.offsetLeft, width: activeTab.offsetWidth });
    }
  }, [filter]);

  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      if (!timingDropdownRef.current?.contains(event.target as Node)) {
        setShowTimingDropdown(false);
      }
      if (!valueDropdownRef.current?.contains(event.target as Node)) {
        setShowValueDropdown(false);
      }
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, []);

  useEffect(() => {
    const userId = user?.id;
    if (typeof userId !== 'number' || Number.isNaN(userId)) {
      setLoading(false);
      return;
    }

    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setLoadError(false);
      try {
        const [snapshotData, jobsData] = await Promise.all([
          fetchGraphQL<{ dashboardSnapshot: RawRecord }>(SNAPSHOT_QUERY, {
            userId,
            ordersLimit: 100,
            productsLimit: 1,
            contactsLimit: 100,
          }),
          fetchGraphQL<{ salesJobs: unknown[] }>(JOBS_QUERY, { userId }).catch(() => ({
            salesJobs: [] as unknown[],
          })),
        ]);
        if (cancelled) return;

        const snapshot = snapshotData.dashboardSnapshot ?? {};
        const rawOrders = Array.isArray(snapshot.orders) ? snapshot.orders : [];
        const rawBuyers = Array.isArray(snapshot.buyers) ? snapshot.buyers : [];

        setOrders(
          rawOrders
            .map(asRecord)
            .filter((row): row is RawRecord => row != null)
            .map(
              (row) =>
                ({
                  orderId: text(row.orderId),
                  buyerId: text(row.buyerId),
                  orderStatus: text(row.orderStatus),
                  paymentStatus: text(row.paymentStatus),
                  totalAmount: number(row.totalAmount),
                  storeName: text(row.storeName),
                  contactPerson: text(row.contactPerson),
                  orderDate: text(row.orderDate),
                  createdAt: text(row.createdAt),
                  orderItems: (Array.isArray(row.orderItems) ? row.orderItems : [])
                    .map(asRecord)
                    .filter((item): item is RawRecord => item != null)
                    .map((item) => ({
                      productName: text(item.productName),
                      productNameSnapshot: text(item.productNameSnapshot),
                      subtotal: number(item.subtotal),
                      offerApplied: item.offerApplied === true,
                    })),
                }) as unknown as Order,
            ),
        );
        setBuyers(
          rawBuyers
            .map(asRecord)
            .filter((row): row is RawRecord => row != null)
            .map(
              (row) =>
                ({
                  buyerId: text(row.buyerId),
                  owner: text(row.owner),
                  storeName: text(row.storeName),
                  status: text(row.status),
                  avgMonthlySpending: number(row.avgMonthlySpending),
                }) as unknown as Buyer,
            ),
        );
        setSalesJobs(
          (Array.isArray(jobsData.salesJobs) ? jobsData.salesJobs : [])
            .map(asRecord)
            .filter((row): row is RawRecord => row != null)
            .map((row) => ({
              id: text(row.id),
              clientId: text(row.clientId),
              clientName: text(row.clientName),
              agentName: text(row.agentName),
              jobType: text(row.jobType),
              status: text(row.status, 'pending'),
              createdAt: text(row.createdAt),
            }))
            .filter((job) => job.id),
        );
      } catch {
        if (!cancelled) setLoadError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  const insights = useMemo(
    () => buildSalesConversionInsights({ orders, buyers, salesJobs }),
    [orders, buyers, salesJobs],
  );

  const visibleOpportunities = useMemo(() => {
    const query = search.trim().toLowerCase();
    return insights.opportunities.filter((item) => {
      if (filter !== 'all' && item.kind !== filter) return false;
      if (!matchesTiming(item.days, timingFilter)) return false;
      if (!matchesValue(item.value, valueFilter)) return false;
      if (query) {
        const haystack = [item.title, item.productName, item.agentName, item.jobType]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(query)) return false;
      }
      return true;
    });
  }, [filter, insights.opportunities, search, timingFilter, valueFilter]);

  const totalPages = Math.max(1, Math.ceil(visibleOpportunities.length / ROWS_PER_PAGE));
  const safePage = Math.min(page, totalPages);
  const pagedOpportunities = visibleOpportunities.slice(
    (safePage - 1) * ROWS_PER_PAGE,
    safePage * ROWS_PER_PAGE,
  );
  const fromRow = visibleOpportunities.length === 0 ? 0 : (safePage - 1) * ROWS_PER_PAGE + 1;
  const toRow = Math.min(safePage * ROWS_PER_PAGE, visibleOpportunities.length);

  const reasonFor = (opportunity: SalesConversionOpportunity) => {
    if (opportunity.kind === 'reorder') {
      return t('reorderReason', { days: opportunity.days });
    }
    if (opportunity.kind === 'quotation') {
      return t('quotationReason', { days: opportunity.days });
    }
    if (opportunity.kind === 'sales_task') {
      const statusKey = opportunity.jobStatus?.toLowerCase() || '';
      const status =
        statusKey && tJobs.has(`status.${statusKey}`)
          ? tJobs(`status.${statusKey}`)
          : opportunity.jobStatus || t('openStatus');
      return t('salesTaskReason', {
        status,
        agent: opportunity.agentName || t('unassigned'),
      });
    }
    return t('buyerInterestReason');
  };

  const timingLabel = (value: TimingFilter) => tHub(`timingFilters.${value}`);

  const valueLabel = (value: ValueFilter) => {
    if (value === 'high') {
      return tHub('valueFilters.high', {
        amount: formatCompactCurrency(VALUE_HIGH_THRESHOLD, currency),
      });
    }
    if (value === 'medium') {
      return tHub('valueFilters.medium', {
        low: formatCompactCurrency(VALUE_MEDIUM_THRESHOLD, currency),
        high: formatCompactCurrency(VALUE_HIGH_THRESHOLD, currency),
      });
    }
    if (value === 'low') {
      return tHub('valueFilters.low', {
        amount: formatCompactCurrency(VALUE_MEDIUM_THRESHOLD, currency),
      });
    }
    return tHub(`valueFilters.${value}`);
  };

  const metrics = [
    { key: 'open', label: t('openOpportunities'), value: insights.openOpportunities },
    { key: 'overdue', label: t('overdueBuyers'), value: insights.overdueBuyers },
    { key: 'quotes', label: t('quotesFollowUp'), value: insights.quotesAwaitingAction },
    { key: 'attributed', label: t('ordersAttributed'), value: insights.ordersAttributed },
  ];

  return (
    <section className="relative mb-8 min-w-0 shrink-0 rounded-lg border border-[#e6e6e6] bg-white">
      <div className="flex min-w-0 flex-col gap-3 rounded-t-lg border-b border-[#e6e6e6] px-4 py-4 @4xl/main:flex-row @4xl/main:items-center @4xl/main:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#0a61d7] text-white">
            <Target className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h2 className="text-base font-bold text-black">{tHub('title')}</h2>
            <p className="mt-1 text-xs leading-5 text-gray-500">{tHub('subtitle')}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {metrics.map((metric) => (
            <span
              key={metric.key}
              className="inline-flex items-center gap-1.5 rounded-full bg-[#f7faff] px-2.5 py-1 text-[11px] font-semibold text-gray-600"
            >
              {metric.label}
              <span className="text-[#0a61d7]">{metric.value.toLocaleString()}</span>
            </span>
          ))}
        </div>
      </div>

      <div className="px-4 pt-4">
        {/* Filter tabs, matching the Offer/Product table tab design */}
        <div className="mb-4 w-full min-w-0">
          <div className="w-full overflow-x-auto">
            <div className="relative inline-flex w-max overflow-hidden rounded-lg bg-gray-100">
              <div
                className="absolute top-0 h-full transition-all duration-300"
                style={{
                  left: indicatorStyle.left,
                  width: indicatorStyle.width,
                  background: '#0a61d7',
                  borderRadius: '0.75rem',
                  zIndex: 1,
                }}
              />
              {FILTERS.map((item, idx) => (
                <button
                  key={item}
                  ref={(el) => {
                    tabRefs.current[idx] = el;
                  }}
                  type="button"
                  onClick={() => {
                    setFilter(item);
                    setPage(1);
                  }}
                  className={`relative z-10 shrink-0 whitespace-nowrap px-4 py-2 text-[14px] font-medium transition-colors duration-200 focus:outline-none ${
                    filter === item ? 'text-white' : 'text-gray-700 hover:text-[#0a61d7]'
                  }`}
                  style={{ background: 'transparent', boxShadow: 'none' }}
                >
                  {t(`filters.${item}`)}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Search */}
        <div className="mb-4 flex w-full min-w-0 flex-col gap-3">
          <div className="relative w-full">
            <input
              type="text"
              placeholder={tHub('searchPlaceholder')}
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              className="w-full rounded-lg border border-[#e6e6e6] bg-white py-2 pl-10 pr-4 text-sm text-black focus:outline-none focus:ring-2 focus:ring-[#0a61d7]"
              maxLength={100}
            />
            <Search className="absolute left-3 top-2 h-5 w-5 text-gray-400" />
          </div>

          <div className="flex w-full min-w-0 flex-col gap-2 @4xl/main:flex-row @4xl/main:flex-wrap @4xl/main:items-center">
            {/* Timing filter */}
            <div className="relative w-full @4xl/main:w-auto" ref={timingDropdownRef}>
              <button
                type="button"
                className="flex w-full items-center justify-between gap-1 whitespace-nowrap rounded-lg border border-[#e6e6e6] bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 @4xl/main:w-auto @4xl/main:justify-start"
                onClick={() => {
                  setShowTimingDropdown((v) => !v);
                  setShowValueDropdown(false);
                }}
              >
                <span className="inline-flex items-center gap-1">
                  <Filter className="h-4 w-4" />
                  {tHub('timingFilterLabel')}: {timingLabel(timingFilter)}
                </span>
                <ChevronDown className="ml-1 h-4 w-4 text-gray-500" />
              </button>
              {showTimingDropdown && (
                <div className="absolute left-0 right-0 z-30 mt-2 rounded-lg border border-[#e6e6e6] bg-white shadow-lg @4xl/main:right-auto @4xl/main:w-44">
                  {TIMING_FILTERS.map((opt) => (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => {
                        setTimingFilter(opt);
                        setShowTimingDropdown(false);
                        setPage(1);
                      }}
                      className={`w-full px-4 py-2 text-left text-sm hover:bg-gray-100 ${
                        timingFilter === opt ? 'font-bold text-[#0a61d7]' : 'text-gray-700'
                      }`}
                    >
                      {timingLabel(opt)}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Value filter */}
            <div className="relative w-full @4xl/main:w-auto" ref={valueDropdownRef}>
              <button
                type="button"
                className="flex w-full items-center justify-between gap-1 whitespace-nowrap rounded-lg border border-[#e6e6e6] bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 @4xl/main:w-auto @4xl/main:justify-start"
                onClick={() => {
                  setShowValueDropdown((v) => !v);
                  setShowTimingDropdown(false);
                }}
              >
                <span className="inline-flex items-center gap-1">
                  <Filter className="h-4 w-4" />
                  {tHub('valueFilterLabel')}: {valueLabel(valueFilter)}
                </span>
                <ChevronDown className="ml-1 h-4 w-4 text-gray-500" />
              </button>
              {showValueDropdown && (
                <div className="absolute left-0 right-0 z-30 mt-2 rounded-lg border border-[#e6e6e6] bg-white shadow-lg @4xl/main:right-auto @4xl/main:w-52">
                  {VALUE_FILTERS.map((opt) => (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => {
                        setValueFilter(opt);
                        setShowValueDropdown(false);
                        setPage(1);
                      }}
                      className={`w-full px-4 py-2 text-left text-sm hover:bg-gray-100 ${
                        valueFilter === opt ? 'font-bold text-[#0a61d7]' : 'text-gray-700'
                      }`}
                    >
                      {valueLabel(opt)}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center gap-2 px-4 py-10 text-sm text-gray-500">
          <Loader2 className="h-4 w-4 animate-spin text-[#0a61d7]" />
          {tHub('loading')}
        </div>
      ) : loadError ? (
        <p className="px-4 py-10 text-center text-sm text-rose-600">{tHub('loadError')}</p>
      ) : visibleOpportunities.length ? (
        <div className="p-4">
          {/* Desktop Table */}
          <div className="overflow-x-auto hidden md:block rounded-lg">
            <table className="min-w-full text-sm text-left whitespace-nowrap text-xs">
              <thead className="bg-gray-100 text-gray-500 whitespace-nowrap">
                <tr>
                  <th className="py-3 px-4 font-medium uppercase">{tHub('columns.rank')}</th>
                  <th className="py-3 px-4 font-medium uppercase">{tHub('columns.buyer')}</th>
                  <th className="py-3 px-4 font-medium uppercase">{tHub('columns.type')}</th>
                  <th className="py-3 px-4 font-medium uppercase">{tHub('columns.urgency')}</th>
                  <th className="py-3 px-4 font-medium uppercase">{tHub('columns.reason')}</th>
                  <th className="py-3 px-4 font-medium uppercase">{tHub('columns.rep')}</th>
                  <th className="py-3 px-4 font-medium uppercase">{tHub('columns.timing')}</th>
                  <th className="py-3 px-4 font-medium uppercase">{tHub('columns.value')}</th>
                  <th className="py-3 px-4 font-medium uppercase">{tHub('columns.action')}</th>
                </tr>
              </thead>
              <tbody className="bg-white">
                {pagedOpportunities.map((opportunity, index) => (
                  <tr
                    key={opportunity.id}
                    className="border-b border-[#f0f0f0] transition hover:bg-gray-50"
                  >
                    <td className="py-3 px-4">
                      <span className="font-bold text-[#0a61d7]">
                        #{(safePage - 1) * ROWS_PER_PAGE + index + 1}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-medium text-black">
                        {opportunity.title || t('salesTaskDetail')}
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={`inline-block px-2 py-1 rounded-full text-xs font-bold ${OPPORTUNITY_KIND_BADGE_STYLES[opportunity.kind]}`}
                      >
                        {t(`kinds.${opportunity.kind}`)}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={`inline-block px-2 py-1 rounded-full text-xs font-bold ${OPPORTUNITY_URGENCY_BADGE_STYLES[getOpportunityUrgencyLevel(opportunity.score)]}`}
                      >
                        {t(`urgency.${getOpportunityUrgencyLevel(opportunity.score)}`)}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-gray-600 whitespace-normal max-w-xs">
                      <div className="line-clamp-3">{reasonFor(opportunity)}</div>
                    </td>
                    <td className="py-3 px-4 text-gray-600">{opportunity.agentName || '-'}</td>
                    <td className="py-3 px-4 text-gray-600">
                      {opportunity.days > 0 ? tHub('timingDays', { days: opportunity.days }) : '-'}
                    </td>
                    <td className="py-3 px-4 font-semibold text-black">
                      {opportunity.value > 0 ? formatCompactCurrency(opportunity.value, currency) : '-'}
                    </td>
                    <td className="py-3 px-4">
                      <Link
                        href={actionHref(opportunity)}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-[#e6e6e6] bg-white px-3 py-1.5 text-xs font-semibold text-black hover:border-[#0a61d7] hover:text-[#0a61d7]"
                      >
                        {t(`actions.${opportunity.kind}`)}
                        <ArrowRight className="h-3.5 w-3.5" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile Cards */}
          <div className="md:hidden">
            <div className="space-y-3">
              {pagedOpportunities.map((opportunity, index) => (
                <div key={opportunity.id} className="border border-[#e6e6e6] rounded-lg p-4 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="font-medium text-black min-w-0">
                      <span className="mr-1.5 font-bold text-[#0a61d7]">
                        #{(safePage - 1) * ROWS_PER_PAGE + index + 1}
                      </span>
                      {opportunity.title || t('salesTaskDetail')}
                    </div>
                    <span className="flex shrink-0 flex-col items-end gap-1">
                      <span
                        className={`inline-block px-2 py-1 rounded-full text-xs font-bold ${OPPORTUNITY_KIND_BADGE_STYLES[opportunity.kind]}`}
                      >
                        {t(`kinds.${opportunity.kind}`)}
                      </span>
                      <span
                        className={`inline-block px-2 py-1 rounded-full text-xs font-bold ${OPPORTUNITY_URGENCY_BADGE_STYLES[getOpportunityUrgencyLevel(opportunity.score)]}`}
                      >
                        {t(`urgency.${getOpportunityUrgencyLevel(opportunity.score)}`)}
                      </span>
                    </span>
                  </div>
                  <p className="text-sm text-gray-600">{reasonFor(opportunity)}</p>
                  <div className="text-xs text-gray-500">
                    {[
                      opportunity.agentName,
                      opportunity.days > 0 ? tHub('timingDays', { days: opportunity.days }) : null,
                      opportunity.value > 0 ? formatCompactCurrency(opportunity.value, currency) : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </div>
                  <div className="pt-1">
                    <Link
                      href={actionHref(opportunity)}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-[#0a61d7] px-3 py-2 text-xs font-semibold text-white hover:bg-[#084ba6]"
                    >
                      {t(`actions.${opportunity.kind}`)}
                      <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Pagination */}
          <div className="flex flex-col md:flex-row md:items-center md:justify-between mt-6 gap-2">
            <div className="text-sm text-gray-500">
              {tHub('pagination.showing', {
                from: String(fromRow),
                to: String(toRow),
                total: String(visibleOpportunities.length),
              })}
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                className="p-2 rounded-lg hover:bg-gray-100 disabled:opacity-50"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={safePage === 1}
                aria-label={tHub('pagination.previous')}
              >
                <ChevronLeft className="w-4 h-4 text-gray-500" />
              </button>
              {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                <button
                  key={p}
                  type="button"
                  className={`px-3 py-2 rounded-lg font-semibold text-sm transition ${
                    p === safePage
                      ? 'bg-[#0a61d7] text-white'
                      : 'bg-white text-[#0a61d7] hover:bg-[#f7faff]'
                  }`}
                  onClick={() => setPage(p)}
                >
                  {p}
                </button>
              ))}
              <button
                type="button"
                className="p-2 rounded-lg hover:bg-gray-100 disabled:opacity-50"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={safePage === totalPages}
                aria-label={tHub('pagination.next')}
              >
                <ChevronRight className="w-4 h-4 text-gray-500" />
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="px-4 py-10 text-center">
          <p className="text-sm font-semibold text-gray-600">{t('emptyTitle')}</p>
          <p className="mt-1 text-xs text-gray-500">{t('emptyHint')}</p>
        </div>
      )}
    </section>
  );
}
