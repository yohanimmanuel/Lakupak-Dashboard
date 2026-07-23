'use client';

import { ArrowRight, TrendingDown, TrendingUp } from 'lucide-react';

export type StatCardTrend = { percent: string; label: string; up: boolean };

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

export function StatCardTrendRow({ trend }: { trend: StatCardTrend }) {
  if (trend.percent === 'N/A' || trend.percent === 'T/A') {
    return (
      <div className="mt-4 ml-1 inline-flex max-w-full flex-wrap items-center gap-2 text-xs">
        <TrendIcon tone="neutral" />
        <span className="font-semibold text-gray-500">{trend.percent}</span>
        <span className="text-gray-400">{trend.label}</span>
      </div>
    );
  }

  if (trend.percent === '0.0%' || trend.percent === '0%' || trend.percent === '+0.0%') {
    return (
      <div className="mt-4 ml-1 inline-flex max-w-full flex-wrap items-center gap-2 text-xs">
        <TrendIcon tone="neutral" />
        <span className="font-semibold text-gray-500">{trend.percent}</span>
        <span className="text-gray-400">{trend.label}</span>
      </div>
    );
  }

  return (
    <div className="mt-4 ml-1 inline-flex max-w-full flex-wrap items-center gap-2 text-xs">
      <TrendIcon tone={trend.up ? 'up' : 'down'} />
      <span className={`font-semibold ${trend.up ? 'text-[#3ea73b]' : 'text-[#f65911]'}`}>
        {trend.percent}
      </span>
      <span className="text-gray-400">{trend.label}</span>
    </div>
  );
}
