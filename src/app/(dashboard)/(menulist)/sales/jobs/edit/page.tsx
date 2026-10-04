'use client';

import React, { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import CreateSalesJobForm from '@/components/sales/CreateSalesJobForm';
import { SalesJobRow } from '@/components/sales/salesJobTypes';
import { SkeletonSalesJobForm } from '@/components/skeleton/SkeletonSalesJobForm';
import { fetchGraphQL } from '@/lib/graphqlClient';
import { useUserStore } from '@/store/userStore';

const JOB_FIELDS = `
  id assignedTo agentName clientId clientCustomerNumber clientName clientOwner clientPhone clientAddress clientStatus
  jobType priorityReason suggestedProducts orderId orderIds scheduledDate
  schedules { date reminderTime }
  suggestedProductNames createdBy status dispatchNote
  completionData { order_placed order_amount payment_collected payment_amount stock_checked products_demoed notes }
`;

export default function EditSalesJobPage() {
  const t = useTranslations('dashboard.sales.salesJobs');
  const router = useRouter();
  const searchParams = useSearchParams();
  const userId = useUserStore((state) => state.user?.id);
  const assignedTo = searchParams?.get('assignedTo') || '';
  const hasClientParam = searchParams?.has('clientId') ?? false;
  const clientId = searchParams?.get('clientId') || '';
  const [jobs, setJobs] = useState<SalesJobRow[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!userId || !assignedTo || !hasClientParam) return;
    fetchGraphQL<{ salesJobs: SalesJobRow[] }>(
      `query EditSalesJobs($userId: Int!) { salesJobs(userId: $userId) { ${JOB_FIELDS} } }`,
      { userId },
    )
      .then((result) => {
        setJobs(result.salesJobs.filter((job) => job.assignedTo === assignedTo && (job.clientId || '') === clientId));
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Failed to load'));
  }, [userId, assignedTo, clientId, hasClientParam]);

  if (!assignedTo || !hasClientParam) {
    return (
      <div className="p-4">
        <p className="text-sm text-red-700">{t('form.jobMissing')}</p>
        <button type="button" className="mt-3 text-sm text-[#0a61d7]" onClick={() => router.push('/sales/jobs')}>
          {t('form.backToJobs')}
        </button>
      </div>
    );
  }

  if (error) {
    return <div className="p-4 text-sm text-red-700">{error}</div>;
  }

  if (!jobs) return <SkeletonSalesJobForm />;

  if (jobs.length === 0) {
    return (
      <div className="p-4">
        <p className="text-sm text-gray-700">{t('form.jobMissing')}</p>
        <button type="button" className="mt-3 text-sm text-[#0a61d7]" onClick={() => router.push('/sales/jobs')}>
          {t('form.backToJobs')}
        </button>
      </div>
    );
  }

  return <CreateSalesJobForm editing={{ assignedTo, replaceIds: jobs.map((job) => job.id), jobs }} />;
}
