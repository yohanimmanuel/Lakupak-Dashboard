'use client';

import { ArrowRight, TrendingDown, TrendingUp } from 'lucide-react';

type MetricChangeFooterProps = {
  change: number | null | undefined;
  comparisonLabel: string;
  naLabel?: string;
  previousValue?: string;
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

export function MetricChangeFooter({
  change,
  comparisonLabel,
  naLabel = 'N/A',
  previousValue,
}: MetricChangeFooterProps) {
  const previousPart = previousValue?.trim() || null;
  const periodPart = comparisonLabel.trim() ? `(${comparisonLabel.trim()})` : '';

  // No baseline: show N/A + period label only (never "Rp 0 last month")
  if (change === null || change === undefined) {
    return (
      <div className="inline-flex max-w-full flex-wrap items-center gap-2 text-xs">
        <TrendIcon tone="neutral" />
        <span className="font-semibold text-gray-500">{naLabel}</span>
        {periodPart ? <span className="text-gray-400">{periodPart}</span> : null}
      </div>
    );
  }

  const comparisonText = [previousPart, periodPart].filter(Boolean).join(' ');

  if (change === 0) {
    return (
      <div className="inline-flex max-w-full flex-wrap items-center gap-2 text-xs">
        <TrendIcon tone="neutral" />
        <span className="font-semibold text-gray-500">0.0%</span>
        {comparisonText ? <span className="text-gray-400">{comparisonText}</span> : null}
      </div>
    );
  }

  const up = change >= 0;
  const signed = `${up ? '+' : '-'}${Math.abs(change).toFixed(1)}%`;

  return (
    <div className="inline-flex max-w-full flex-wrap items-center gap-2 text-xs">
      <TrendIcon tone={up ? 'up' : 'down'} />
      <span className={`font-semibold ${up ? 'text-[#3ea73b]' : 'text-[#f65911]'}`}>{signed}</span>
      {comparisonText ? <span className="text-gray-400">{comparisonText}</span> : null}
    </div>
  );
}
