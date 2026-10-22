'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Sparkles, Target } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { Buyer } from '@/types/client';
import type { Order } from '@/types/order';
import { formatCompactCurrency } from '@/utils/currencyUtils';
import {
  buildSalesConversionInsights,
  type SalesConversionJobInput,
  type SalesConversionOpportunity,
  type SalesConversionOpportunityKind,
} from '@/lib/salesConversion/buildSalesConversionInsights';
import { OPPORTUNITY_KIND_BADGE_STYLES } from '@/lib/salesConversion/opportunityKindStyles';

type Filter = 'all' | SalesConversionOpportunityKind;

const FILTERS: Filter[] = ['all', 'reorder', 'quotation', 'buyer_interest', 'sales_task'];
const MAX_ACTIONS = 10;

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

export default function SalesConversionEngineWidget({
  orders,
  buyers,
  salesJobs,
  currency,
  embedded = false,
}: {
  orders: Order[];
  buyers: Buyer[];
  salesJobs: SalesConversionJobInput[];
  currency: string;
  embedded?: boolean;
}) {
  const t = useTranslations('dashboard.home.widgets.conversion');
  const tJobs = useTranslations('dashboard.sales.salesJobs');
  const [filter, setFilter] = useState<Filter>('all');

  const insights = useMemo(
    () => buildSalesConversionInsights({ orders, buyers, salesJobs }),
    [orders, buyers, salesJobs],
  );

  const visibleOpportunities = useMemo(() => {
    const rows =
      filter === 'all'
        ? insights.opportunities
        : insights.opportunities.filter((item) => item.kind === filter);
    return rows.slice(0, MAX_ACTIONS);
  }, [filter, insights.opportunities]);

  const metrics = [
    {
      key: 'open',
      label: t('openOpportunities'),
      hint: t('openOpportunitiesHint'),
      value: insights.openOpportunities,
    },
    {
      key: 'overdue',
      label: t('overdueBuyers'),
      hint: t('overdueBuyersHint'),
      value: insights.overdueBuyers,
    },
    {
      key: 'quotes',
      label: t('quotesFollowUp'),
      hint: t('quotesFollowUpHint'),
      value: insights.quotesAwaitingAction,
    },
    {
      key: 'attributed',
      label: t('ordersAttributed'),
      hint: t('ordersAttributedHint'),
      value: insights.ordersAttributed,
    },
  ];

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

  const detailFor = (opportunity: SalesConversionOpportunity) => {
    if (opportunity.kind === 'sales_task') {
      if (opportunity.jobType && tJobs.has(`types.${opportunity.jobType}`)) {
        return tJobs(`types.${opportunity.jobType}`);
      }
      return opportunity.jobType || t('salesTaskDetail');
    }
    if (opportunity.productName && opportunity.value > 0) {
      return `${opportunity.productName} · ${formatCompactCurrency(opportunity.value, currency)}`;
    }
    if (opportunity.productName) return opportunity.productName;
    if (opportunity.value > 0) return formatCompactCurrency(opportunity.value, currency);
    return null;
  };

  const body = (
    <>
      <p className="mb-3 flex items-center gap-1.5 text-xs leading-5 text-gray-500">
        <Sparkles className="h-3.5 w-3.5 shrink-0 text-[#0a61d7]" />
        <span>
          <span className="font-semibold text-[#0a61d7]">{t('aiAnalysis')}.</span> {t('description')}
        </span>
      </p>
        <div className="grid grid-cols-2 gap-3 @5xl/main:grid-cols-4">
          {metrics.map((metric) => (
            <div key={metric.key} className="rounded-lg border border-[#e6e6e6] bg-[#fbfcfe] px-3 py-3">
              <p className="text-[11px] font-medium uppercase tracking-wide text-gray-500">{metric.label}</p>
              <p className="mt-1 text-2xl font-bold leading-none text-black">{metric.value.toLocaleString()}</p>
              <p className="mt-1 text-[11px] text-gray-500">{metric.hint}</p>
            </div>
          ))}
        </div>

        <div className="mt-5 flex min-w-0 flex-col gap-3 @4xl/main:flex-row @4xl/main:items-center @4xl/main:justify-between">
          <h3 className="text-sm font-semibold text-black">{t('recommendedActions')}</h3>
          <div className="flex gap-2 overflow-x-auto pb-1 @4xl/main:pb-0">
            {FILTERS.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setFilter(item)}
                className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                  filter === item
                    ? 'border-[#0a61d7] bg-[#0a61d7] text-white'
                    : 'border-[#e6e6e6] bg-white text-gray-600 hover:border-[#0a61d7] hover:text-[#0a61d7]'
                }`}
              >
                {t(`filters.${item}`)}
              </button>
            ))}
          </div>
        </div>

        {visibleOpportunities.length ? (
          <div className="mt-3 flex snap-x gap-3 overflow-x-auto pb-2">
            {visibleOpportunities.map((opportunity) => (
              <article
                key={opportunity.id}
                className="flex min-h-40 w-[19rem] shrink-0 snap-start flex-col rounded-lg border border-[#e6e6e6] bg-white p-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <h4 className="min-w-0 truncate text-sm font-semibold text-black">
                    {opportunity.title || t('salesTaskDetail')}
                  </h4>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${OPPORTUNITY_KIND_BADGE_STYLES[opportunity.kind]}`}
                  >
                    {t(`kinds.${opportunity.kind}`)}
                  </span>
                </div>
                <p className="mt-2 text-xs leading-5 text-gray-600">{reasonFor(opportunity)}</p>
                {detailFor(opportunity) ? (
                  <p className="mt-1 truncate text-xs font-medium text-gray-500">{detailFor(opportunity)}</p>
                ) : null}
                <Link
                  href={actionHref(opportunity)}
                  className="mt-auto inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-[#0a61d7] px-3 py-2 pt-2 text-xs font-semibold text-white hover:bg-[#084ba6]"
                >
                  {t(`actions.${opportunity.kind}`)}
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </article>
            ))}
          </div>
        ) : (
          <div className="mt-3 rounded-lg border border-dashed border-gray-300 bg-[#fbfcfe] px-4 py-6 text-center">
            <p className="text-sm font-semibold text-gray-600">{t('emptyTitle')}</p>
            <p className="mt-1 text-xs text-gray-500">{t('emptyHint')}</p>
          </div>
        )}
    </>
  );

  if (embedded) {
    return <div className="min-w-0">{body}</div>;
  }

  return (
    <section className="min-w-0 overflow-hidden rounded-lg border border-[#e6e6e6] bg-white">
      <div className="flex min-w-0 flex-col gap-3 border-b border-[#e6e6e6] px-4 py-4 @4xl/main:flex-row @4xl/main:items-start @4xl/main:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#0a61d7] text-white">
            <Target className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base font-bold text-black">{t('name')}</h2>
              <span className="inline-flex items-center gap-1 rounded-full bg-[#f7faff] px-2 py-0.5 text-[11px] font-semibold text-[#0a61d7]">
                <Sparkles className="h-3 w-3" />
                {t('aiAnalysis')}
              </span>
            </div>
            <p className="mt-1 text-xs leading-5 text-gray-500">{t('description')}</p>
          </div>
        </div>
        <Link
          href="/sales"
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-[#e6e6e6] bg-white px-3 py-2 text-xs font-semibold text-black hover:border-[#0a61d7] hover:text-[#0a61d7]"
        >
          {t('action')}
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      <div className="p-4">{body}</div>
    </section>
  );
}
