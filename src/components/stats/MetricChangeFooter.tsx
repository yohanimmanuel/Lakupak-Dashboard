'use client';

import { ArrowRight, TrendingDown, TrendingUp } from 'lucide-react';

type MetricChangeFooterProps = {
  change: number | null | undefined;
  comparisonLabel: string;
  naLabel?: string;
  previousValue?: string;
  /** When set with previousValue, hover shows "X this month vs Y last month". */
  currentValue?: string;
  thisMonthLabel?: string;
  lastMonthLabel?: string;
  vsLabel?: string;
};

function TrendIcon({ tone }: { tone: 'up' | 'down' | 'neutral' }) {
  if (tone === 'neutral') {
    return (
      <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-gray-200 bg-gray-50 text-gray-400">
        <ArrowRight className="h-3.5 w-3.5" />
      </span>
    );
  }

  if (tone === 'up') {
    return (
      <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-[#c6ebd0] bg-[#e6f7ec] text-[#3ea73b]">
        <TrendingUp className="h-3.5 w-3.5" />
      </span>
    );
  }

  return (
    <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-[#ffd4c2] bg-[#fff1eb] text-[#f65911]">
      <TrendingDown className="h-3.5 w-3.5" />
    </span>
  );
}

function buildComparisonText({
  currentValue,
  previousValue,
  naLabel,
  thisMonthLabel,
  lastMonthLabel,
  vsLabel,
}: {
  currentValue?: string;
  previousValue?: string;
  naLabel: string;
  thisMonthLabel: string;
  lastMonthLabel: string;
  vsLabel: string;
}): string | null {
  const currentPart = currentValue?.trim() || null;
  const previousPart = previousValue?.trim() || null;
  if (!currentPart && !previousPart) return null;
  return `${currentPart ?? naLabel} ${thisMonthLabel} ${vsLabel} ${previousPart ?? naLabel} ${lastMonthLabel}`;
}

export function MetricChangeFooter({
  change,
  comparisonLabel,
  naLabel = 'N/A',
  previousValue,
  currentValue,
  thisMonthLabel = 'this month',
  lastMonthLabel = 'last month',
  vsLabel = 'vs',
}: MetricChangeFooterProps) {
  const comparisonText = buildComparisonText({
    currentValue,
    previousValue,
    naLabel,
    thisMonthLabel,
    lastMonthLabel,
    vsLabel,
  });

  const percentLabel =
    change === null || change === undefined
      ? naLabel
      : change === 0
        ? '0.0%'
        : `${change >= 0 ? '+' : '-'}${Math.abs(change).toFixed(1)}%`;

  const tone: 'up' | 'down' | 'neutral' =
    change === null || change === undefined || change === 0
      ? 'neutral'
      : change >= 0
        ? 'up'
        : 'down';

  const percentClass =
    tone === 'up'
      ? 'text-[#3ea73b]'
      : tone === 'down'
        ? 'text-[#f65911]'
        : 'text-gray-500';

  return (
    <div
      className="group/metric relative inline-flex max-w-full items-center gap-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-[#0a61d7]/focus-visible:ring-offset-1"
      tabIndex={comparisonText ? 0 : undefined}
    >
      <TrendIcon tone={tone} />
      <span className={`font-semibold ${percentClass}`}>{percentLabel}</span>
      <span className="truncate text-gray-500">
        {vsLabel} {comparisonLabel}
      </span>
      {comparisonText ? (
        <div
          role="tooltip"
          className="pointer-events-none absolute bottom-[calc(100%+0.5rem)] left-0 z-50 hidden min-w-[12rem] max-w-[18rem] rounded-lg border border-gray-200 bg-white px-3 py-2 text-left text-xs font-medium leading-snug text-gray-700 shadow-[0_12px_28px_-12px_rgba(15,23,42,0.35)] group-hover/metric:block group-focus-within/metric:block"
        >
          {comparisonText}
        </div>
      ) : null}
    </div>
  );
}
