'use client';

import React, { useEffect, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import CreateSalesJobForm from '@/components/sales/CreateSalesJobForm';
import { SalesJobRow } from '@/components/sales/salesJobTypes';
import { SkeletonSalesJobForm } from '@/components/skeleton/SkeletonSalesJobForm';
import { fetchGraphQL } from '@/lib/graphqlClient';
import { useUserStore } from '@/store/userStore';

const JOB_FIELDS = `
  id assignedTo agentName clientId clientCustomerNumber clientName clientOwner clientPhone clientAddress clientStatus
  jobType priorityReason suggestedProducts orderId orderIds clientIds scheduledDate createdAt updatedAt listGroupId
  schedules { date reminderTime }
  suggestedProductNames createdBy status dispatchNote
  completionData { order_placed order_amount payment_collected payment_amount stock_checked products_demoed notes
    delivered promoted returned product_given samples_given given_counts { product_id quantity client_id }
    stock_counts { product_id checked counted client_id } client_checks { client_id checked }
    competitor_name competitor_product observed_price observed_promo shelf_share_observation }
`;

export default function EditSalesJobPage() {
  const t = useTranslations('dashboard.sales.salesJobs');
  const router = useRouter();
  const searchParams = useSearchParams();
  const userId = useUserStore((state) => state.user?.id);
  const assignedTo = searchParams?.get('assignedTo') || '';
  const groupId = searchParams?.get('groupId') || '';
  const hasClientParam = searchParams?.has('clientId') ?? false;
  const clientId = searchParams?.get('clientId') || '';
  const [jobs, setJobs] = useState<SalesJobRow[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!userId || !assignedTo || (!groupId && !hasClientParam)) return;
    fetchGraphQL<{ salesJobs: SalesJobRow[] }>(
      `query EditSalesJobs($userId: Int!) { salesJobs(userId: $userId) { ${JOB_FIELDS} } }`,
      { userId },
    )
      .then((result) => {
        setJobs(
          result.salesJobs.filter((job) =>
            groupId
              ? job.listGroupId === groupId
              : job.assignedTo === assignedTo && (job.clientId || '') === clientId,
          ),
        );
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Failed to load'));
  }, [userId, assignedTo, clientId, hasClientParam, groupId]);

  if (!assignedTo || (!groupId && !hasClientParam)) {
    return (
      <div className="p-4">
        <p className="text-sm text-red-700">{t('form.jobMissing')}</p>
        <button type="button" className="mt-3 flex items-center gap-2 px-3 py-2 text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors" onClick={() => router.push('/sales/jobs')}>
          <ArrowLeft className="w-4 h-4" />
          {t('form.backToJobs')}
        </button>
      </div>
    );
  }

  if (error) {
    return <div className="p-4 text-sm text-red-700">{error}</div>;
  }

  if (!jobs) return <SkeletonSalesJobForm />;

  const editableJobs = jobs.filter((job) => job.jobType !== 'prospect_new_outlet');

  if (jobs.length === 0 || editableJobs.length === 0) {
    return (
      <div className="p-4">
        <p className="text-sm text-gray-700">{jobs.length === 0 ? t('form.jobMissing') : t('form.prospectMoved')}</p>
        <button type="button" className="mt-3 flex items-center gap-2 px-3 py-2 text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors" onClick={() => router.push('/sales/jobs')}>
          <ArrowLeft className="w-4 h-4" />
          {t('form.backToJobs')}
        </button>
      </div>
    );
  }

  return <CreateSalesJobForm editing={{ assignedTo, replaceIds: editableJobs.map((job) => job.id), jobs: editableJobs }} />;
}
