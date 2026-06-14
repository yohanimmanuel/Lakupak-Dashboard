'use client';

import { ArrowRight, TrendingDown, TrendingUp } from 'lucide-react';

export type StatCardTrend = { percent: string; label: string; up: boolean };

export function StatCardTrendRow({ trend }: { trend: StatCardTrend }) {
  if (trend.percent === 'N/A') {
    return (
      <div className="flex items-center gap-2 mt-4 ml-1">
        <ArrowRight className="w-5 h-5 text-gray-400" />
        <span className="text-gray-400 text-xs font-semibold">N/A</span>
        <span className="text-gray-400 text-xs">{trend.label}</span>
      </div>
    );
  }

  if (trend.percent === '0.0%' || trend.percent === '0%') {
    return (
      <div className="flex items-center gap-2 mt-4 ml-1">
        <ArrowRight className="w-5 h-5 text-gray-400" />
        <span className="text-gray-400 text-xs font-semibold">{trend.percent}</span>
        <span className="text-gray-400 text-xs">{trend.label}</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 mt-4 ml-1">
      {trend.up ? (
        <TrendingUp className="w-5 h-5 text-[#3ea73b]" />
      ) : (
        <TrendingDown className="w-5 h-5 text-[#f65911]" />
      )}
      <span
        className={
          trend.up ? 'text-[#3ea73b] text-xs font-semibold' : 'text-[#f65911] text-xs font-semibold'
        }
      >
        {trend.percent}
      </span>
      <span className="text-gray-400 text-xs">{trend.label}</span>
    </div>
  );
}
