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
  items_returned { product_id quantity reason }
  replacement_issued replacement_value
  competitor_name competitor_product observed_price observed_promo shelf_share_observation
  product_id product_ids display_setup_completed samples_given retailer_briefed
  scheme_reference execution_confirmed claim_amount
`;

const JOB_FIELDS = `
  id assignedTo agentName clientId clientCustomerNumber clientName clientOwner clientPhone clientAddress clientStatus jobType priorityReason
  suggestedProducts suggestedProductNames createdBy status scheduledDate createdAt dispatchNote
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
      job.createdAt,
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
    <div className="p-4 w-full min-h-screen flex flex-col bg-gradient-to-b from-gray-50 to-white">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-4">
        <div>
          <h2 className="text-2xl font-bold text-black">{t('title')}</h2>
        </div>
        <div className="flex gap-2 items-center flex-wrap">
          <button
            type="button"
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white border border-[#e6e6e6] text-black font-medium hover:bg-gray-100 transition text-sm"
            onClick={exportJobs}
          >
            <Download className="w-4 h-4" /> {t('exportData')}
          </button>
          <button
            type="button"
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#0a61d7] text-white font-semibold hover:bg-[#084ba6] transition text-sm"
            onClick={() => router.push('/sales/jobs/new')}
          >
            <Plus className="w-4 h-4" /> {t('createJob')}
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      <JobsStatcards jobs={jobs} />
      <JobsTable
        jobs={jobs}
        onEditAction={({ assignedTo, clientId }) =>
          router.push(`/sales/jobs/edit?assignedTo=${encodeURIComponent(assignedTo)}&clientId=${encodeURIComponent(clientId)}`)
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
