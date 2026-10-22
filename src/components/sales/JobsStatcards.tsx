'use client';

import React, { useMemo } from 'react';
import { Briefcase, CheckCircle2, ClipboardList, Clock } from 'lucide-react';
import { useTranslations } from 'next-intl';
import {
  STAT_ICON_BG_BLUE,
  STAT_ICON_BG_GREEN,
  STAT_ICON_BLUE,
  STAT_ICON_GREEN,
} from '@/utils/statCardStyles';
import { combineSalesJobCardsByListGroup } from './salesJobCards';
import { OPEN_SALES_JOB_STATUSES, PENDING_SALES_JOB_STATUSES, SalesJobRow } from './salesJobTypes';

type StatCardConfig = {
  key: string;
  label: string;
  count: number;
  hint: string;
  icon: React.ReactNode;
  iconBg: string;
};

function JobStatCard({ label, count, hint, icon, iconBg }: Omit<StatCardConfig, 'key'>) {
  return (
    <div className="flex flex-col justify-between p-4 rounded-lg bg-white border border-[#e6e6e6]">
      <div className="flex items-center gap-4 border-b border-[#e6e6e6] pb-4">
        <div className={`flex items-center justify-center w-12 h-12 rounded-lg ${iconBg}`}>
          {icon}
        </div>
        <div>
          <div className="text-xs text-gray-500 font-semibold uppercase tracking-wide">{label}</div>
          <div className="text-xl font-bold text-black">{count.toLocaleString()}</div>
        </div>
      </div>
      <div className="mt-4 ml-1">
        <span className="inline-flex items-center rounded-md bg-[#f3f4f6] px-2 py-1 text-xs text-gray-500">
          {hint}
        </span>
      </div>
    </div>
  );
}

export default function JobsStatcards({ jobs }: { jobs: SalesJobRow[] }) {
  const t = useTranslations('dashboard.sales.salesJobs');

  const stats = useMemo((): StatCardConfig[] => {
    // Count the cards the user sees, not the per-client database rows behind them.
    const cards = combineSalesJobCardsByListGroup(jobs);
    const total = cards.length;
    const pending = cards.filter((job) => (PENDING_SALES_JOB_STATUSES as readonly string[]).includes(job.status)).length;
    const open = cards.filter((job) => (OPEN_SALES_JOB_STATUSES as readonly string[]).includes(job.status)).length;
    const completed = cards.filter((job) => job.status === 'completed').length;
    const share = (count: number) => (total > 0 ? Math.round((count / total) * 100) : 0);
    const hint = (count: number) => (total > 0 ? t('stats.shareOfTotal', { percent: share(count) }) : t('stats.noJobs'));

    return [
      {
        key: 'total',
        label: t('stats.total'),
        count: total,
        hint: t('stats.allJobs'),
        icon: <Briefcase className={`w-6 h-6 ${STAT_ICON_BLUE}`} />,
        iconBg: STAT_ICON_BG_BLUE,
      },
      {
        key: 'pending',
        label: t('status.pending'),
        count: pending,
        hint: hint(pending),
        icon: <Clock className={`w-6 h-6 ${STAT_ICON_BLUE}`} />,
        iconBg: STAT_ICON_BG_BLUE,
      },
      {
        key: 'open',
        label: t('stats.open'),
        count: open,
        hint: hint(open),
        icon: <ClipboardList className={`w-6 h-6 ${STAT_ICON_BLUE}`} />,
        iconBg: STAT_ICON_BG_BLUE,
      },
      {
        key: 'completed',
        label: t('status.completed'),
        count: completed,
        hint: hint(completed),
        icon: <CheckCircle2 className={`w-6 h-6 ${STAT_ICON_GREEN}`} />,
        iconBg: STAT_ICON_BG_GREEN,
      },
    ];
  }, [jobs, t]);

  return (
    <div className="mx-auto grid w-full grid-cols-1 gap-3 @3xl/main:grid-cols-2 @5xl/main:grid-cols-4">
      {stats.map((stat) => (
        <JobStatCard key={stat.key} label={stat.label} count={stat.count} hint={stat.hint} icon={stat.icon} iconBg={stat.iconBg} />
      ))}
    </div>
  );
}
