'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Download, Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as XLSX from 'xlsx';
import { fetchGraphQL } from '@/lib/graphqlClient';
import { useUserStore } from '@/store/userStore';
import { SkeletonTablePage } from '@/components/skeleton/SkeletonTablePage';
import JobsStatcards from './JobsStatcards';
import JobsTable from './JobsTable';
import { SalesJobRow, salesJobStatusKey } from './salesJobTypes';

const COMPLETION_FIELDS = `
  order_placed order_amount payment_collected payment_amount stock_checked products_demoed notes
  delivered promoted returned product_given samples_given given_counts { product_id quantity }
  stock_counts { product_id checked counted }
  items_returned { product_id quantity reason }
  replacement_issued replacement_value
  competitor_name competitor_product observed_price observed_promo shelf_share_observation
  product_id product_ids display_setup_completed retailer_briefed
  scheme_reference execution_confirmed claim_amount
`;

const JOB_FIELDS = `
  id assignedTo agentName clientId clientCustomerNumber clientName clientOwner clientPhone clientAddress clientStatus
  linkedClients { name status } jobType priorityReason
  suggestedProducts suggestedProductNames createdBy status scheduledDate createdAt updatedAt listGroupId dispatchNote
  schedules { date reminderTime }
  completionData { ${COMPLETION_FIELDS} }
`;

const JOBS_QUERY = `
  query SalesJobs($userId: Int!) {
    salesJobs(userId: $userId) { ${JOB_FIELDS} }
  }
`;

export default function SalesJobsBoard() {
  const t = useTranslations('dashboard.sales.salesJobs');
  const router = useRouter();
  const userId = useUserStore((state) => state.user?.id);
  const [jobs, setJobs] = useState<SalesJobRow[]>([]);
  const [initialLoading, setInitialLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!userId) {
      setJobs([]);
      setInitialLoading(false);
      return;
    }
    const list = await fetchGraphQL<{ salesJobs: SalesJobRow[] }>(JOBS_QUERY, { userId });
    setJobs(list.salesJobs);
  }, [userId]);

  useEffect(() => {
    load()
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Failed to load jobs'))
      .finally(() => setInitialLoading(false));
  }, [load]);

  const typeLabel = (jobType: string) => t(`types.${jobType}` as 'types.take_order');
  const statusLabel = (status: string) => t(`status.${salesJobStatusKey(status)}` as 'status.pending');

  const exportJobs = () => {
    if (jobs.length === 0) {
      setError(t('table.noJobsToExport'));
      return;
    }
    const headers = [t('client'), t('type'), t('rep'), t('table.status'), t('date'), t('reason'), t('table.createdBy'), t('products')];
    const rows = jobs.map((job) => [
      job.clientName,
      typeLabel(job.jobType),
      job.agentName,
      statusLabel(job.status),
      job.updatedAt || job.createdAt,
      job.priorityReason || '',
      job.createdBy === 'ai' ? t('ai') : t('manager'),
      job.suggestedProductNames.join(', '),
    ]);
    const sheet = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, sheet, t('table.sheetName'));
    XLSX.writeFile(book, 'jobs.xlsx');
  };

  if (initialLoading) {
    return <SkeletonTablePage statCards={4} rows={8} />;
  }

  return (
    <div className="flex min-h-full w-full min-w-0 flex-col bg-gradient-to-b from-gray-50 to-white p-4">
      <div className="mb-4 flex min-w-0 flex-col gap-4 @5xl/main:flex-row @5xl/main:items-center @5xl/main:justify-between">
        <div className="min-w-0">
          <h2 className="truncate text-2xl font-bold text-black">{t('title')}</h2>
        </div>
        <div className="flex w-full min-w-0 flex-col gap-2 @4xl/main:flex-row @4xl/main:flex-wrap @4xl/main:items-center @5xl/main:w-auto">
          <button
            type="button"
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-[#e6e6e6] bg-white px-4 py-2 text-sm font-medium text-black transition hover:bg-gray-100 @4xl/main:w-auto"
            onClick={exportJobs}
          >
            <Download className="h-4 w-4" /> {t('exportData')}
          </button>
          <button
            type="button"
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#0a61d7] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#084ba6] @4xl/main:w-auto"
            onClick={() => router.push('/sales/jobs/new')}
          >
            <Plus className="h-4 w-4" /> {t('createJob')}
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      <JobsStatcards jobs={jobs} />
      <JobsTable
        jobs={jobs}
        onEditAction={({ assignedTo, clientId, listGroupId }) =>
          router.push(
            `/sales/jobs/edit?assignedTo=${encodeURIComponent(assignedTo)}&clientId=${encodeURIComponent(clientId)}&groupId=${encodeURIComponent(listGroupId)}`,
          )
        }
        onDeleteAction={(ids) => {
          setError('');
          void (async () => {
            try {
              await fetchGraphQL(
                `mutation DeleteJobs($userId: Int!, $ids: [String!]!) { deleteSalesJobs(userId: $userId, ids: $ids) }`,
                { userId, ids },
              );
              await load();
            } catch (err) {
              setError(err instanceof Error ? err.message : 'Request failed');
            }
          })();
        }}
      />
    </div>
  );
}
