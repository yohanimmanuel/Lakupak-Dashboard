'use client';

import { useMemo } from 'react';
import { Briefcase } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { salesJobStatusKey } from '@/components/sales/salesJobTypes';

export type HomeSalesJob = {
  id: string;
  assignedTo: string;
  clientId: string;
  agentName: string;
  clientName: string;
  jobType: string;
  status: string;
  createdAt: string;
};

const JOB_STATUS_BADGE: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-800',
  dispatched: 'bg-purple-100 text-purple-800',
  in_progress: 'bg-blue-100 text-blue-800',
  completed: 'bg-green-100 text-green-800',
  skipped: 'bg-gray-100 text-gray-700',
};

const MAX_SALES_JOB_ROWS = 4;

type SalesJobsWidgetProps = {
  salesJobs: HomeSalesJob[];
};

export default function SalesJobsWidget({ salesJobs }: SalesJobsWidgetProps) {
  const t = useTranslations('dashboard.home.widgets.salesJobs');
  const tJobs = useTranslations('dashboard.sales.salesJobs');

  const salesJobCounts = useMemo(() => {
    const counts = { pending: 0, dispatched: 0, in_progress: 0, completed: 0 };
    for (const job of salesJobs) {
      const key = salesJobStatusKey(job.status);
      if (
        key === 'pending' ||
        key === 'dispatched' ||
        key === 'in_progress' ||
        key === 'completed'
      ) {
        counts[key] += 1;
      }
    }
    return counts;
  }, [salesJobs]);

  const recentSalesJobs = useMemo(
    () =>
      [...salesJobs]
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, MAX_SALES_JOB_ROWS),
    [salesJobs],
  );

  const jobTypeLabel = (jobType: string) =>
    tJobs.has(`types.${jobType}`) ? tJobs(`types.${jobType}` as 'types.take_order') : jobType;
  const jobStatusLabel = (status: string) => {
    const key = salesJobStatusKey(status);
    return tJobs.has(`status.${key}`) ? tJobs(`status.${key}` as 'status.pending') : key;
  };

  const countCards = [
    {
      key: 'pending',
      label: t('pending'),
      hint: t('pendingHint'),
      value: salesJobCounts.pending,
      valueClass: 'text-yellow-700',
    },
    {
      key: 'dispatched',
      label: t('dispatched'),
      hint: t('dispatchedHint'),
      value: salesJobCounts.dispatched,
      valueClass: 'text-purple-700',
    },
    {
      key: 'in_progress',
      label: t('inProgress'),
      hint: t('inProgressHint'),
      value: salesJobCounts.in_progress,
      valueClass: 'text-[#0a61d7]',
    },
    {
      key: 'completed',
      label: t('completed'),
      hint: t('completedHint'),
      value: salesJobCounts.completed,
      valueClass: 'text-emerald-600',
    },
  ] as const;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 @sm:grid-cols-2 @xl:grid-cols-4">
        {countCards.map((card) => (
          <div key={card.key} className="rounded-lg border border-[#e6e6e6] bg-white p-4">
            <p className="text-xs text-gray-500">{card.label}</p>
            <p className={`mt-1 text-2xl font-semibold ${card.valueClass}`}>
              {card.value.toLocaleString()}
            </p>
            <p className="mt-1 text-[11px] uppercase tracking-wide text-gray-500">{card.hint}</p>
          </div>
        ))}
      </div>
      {recentSalesJobs.length === 0 ? (
        <div className="flex h-40 flex-col items-center justify-center rounded-lg">
          <Briefcase className="mb-3 h-8 w-8 text-gray-300" />
          <p className="text-sm font-semibold text-gray-600">{t('emptyTitle')}</p>
          <p className="mt-1 text-xs text-gray-500">{t('emptyHint')}</p>
        </div>
      ) : (
        <div>
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500">
            {t('recentJobs')}
          </h3>
          <ul className="space-y-3">
            {recentSalesJobs.map((job) => {
              const statusKey = salesJobStatusKey(job.status);
              return (
                <li
                  key={job.id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-[#e6e6e6] bg-white px-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-black">
                      {job.clientName || job.agentName}
                    </p>
                    <p className="truncate text-xs text-gray-500">
                      {jobTypeLabel(job.jobType)}
                      {job.agentName ? ` · ${job.agentName}` : ''}
                    </p>
                  </div>
                  <span
                    className={`inline-flex shrink-0 rounded-full px-2 py-1 text-xs font-semibold ${
                      JOB_STATUS_BADGE[statusKey] || JOB_STATUS_BADGE.skipped
                    }`}
                  >
                    {jobStatusLabel(job.status)}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
