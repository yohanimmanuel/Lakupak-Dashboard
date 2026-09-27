'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Download, Plus, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as XLSX from 'xlsx';
import { fetchGraphQL } from '@/lib/graphqlClient';
import { useUserStore } from '@/store/userStore';
import { SkeletonTablePage } from '@/components/skeleton/SkeletonTablePage';
import JobsStatcards from './JobsStatcards';
import JobsTable from './JobsTable';
import { SalesJobCompletion, SalesJobRow } from './salesJobTypes';

const JOB_FIELDS = `
  id assignedTo agentName clientId clientName clientStatus jobType priorityReason
  suggestedProductNames createdBy status scheduledDate dispatchNote
  schedules { date reminderTime }
  completionData { order_placed order_amount payment_collected payment_amount stock_checked products_demoed notes }
`;

const JOBS_QUERY = `
  query SalesJobs($userId: Int!) {
    salesJobs(userId: $userId) { ${JOB_FIELDS} }
  }
`;

const emptyCompletion = (): SalesJobCompletion => ({
  order_placed: false,
  order_amount: null,
  payment_collected: false,
  payment_amount: null,
  stock_checked: false,
  products_demoed: 0,
  notes: '',
});

function ModalShell({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-lg bg-white rounded-lg border border-[#e6e6e6] flex flex-col max-h-[90vh] overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#e6e6e6]">
          <h3 className="text-base font-semibold text-gray-900">{title}</h3>
          <button type="button" onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100 text-gray-700" aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto p-4">{children}</div>
      </div>
    </div>
  );
}

export default function SalesJobsBoard() {
  const t = useTranslations('dashboard.marketing.salesJobs');
  const router = useRouter();
  const userId = useUserStore((state) => state.user?.id);
  const [jobs, setJobs] = useState<SalesJobRow[]>([]);
  const [initialLoading, setInitialLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [completing, setCompleting] = useState<SalesJobRow | null>(null);
  const [completion, setCompletion] = useState<SalesJobCompletion>(emptyCompletion());

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

  const run = async (work: () => Promise<void>) => {
    setError('');
    setMessage('');
    try {
      await work();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Request failed');
    }
  };

  const typeLabel = (jobType: string) => t(`types.${jobType}` as 'types.take_order');
  const statusLabel = (status: string) => t(`status.${status}` as 'status.suggested');

  const review = (ids: string[], action: 'approve' | 'reject') => {
    setError('');
    setMessage('');
    return (async () => {
      try {
        for (const id of ids) {
          await fetchGraphQL(
            `mutation Review($userId: Int!, $id: String!, $action: String!) { reviewSalesJob(userId: $userId, id: $id, action: $action) { id } }`,
            { userId, id, action },
          );
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Request failed');
      } finally {
        await load().catch((err: unknown) => {
          setError((current) => current || (err instanceof Error ? err.message : 'Request failed'));
        });
      }
    })();
  };

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
      job.scheduledDate,
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
          <h2 className="text-2xl font-bold text-black mb-2">{t('title')}</h2>
          <p className="text-sm text-gray-600">{t('subtitle')}</p>
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
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white border border-[#e6e6e6] text-black font-medium hover:bg-gray-100 transition text-sm"
            onClick={() =>
              run(async () => {
                const result = await fetchGraphQL<{ suggestSalesJobs: { created: number } }>(
                  `mutation Suggest($userId: Int!) { suggestSalesJobs(userId: $userId) { created } }`,
                  { userId },
                );
                setMessage(t('suggestedCount', { count: result.suggestSalesJobs.created }));
              })
            }
          >
            {t('generate')}
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

      {message && (
        <div className="mb-4 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">{message}</div>
      )}
      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      <JobsStatcards jobs={jobs} />
      <JobsTable
        jobs={jobs}
        onApproveAction={(ids) => review(ids, 'approve')}
        onRejectAction={(ids) => review(ids, 'reject')}
        onCompleteAction={(job) => {
          setCompleting(job);
          setCompletion(job.completionData || emptyCompletion());
        }}
      />

      {completing && (
        <ModalShell title={t('complete')} onClose={() => setCompleting(null)}>
          <div className="grid gap-3">
            <p className="text-sm font-medium text-gray-900">{completing.clientName}</p>
            <label className="text-xs text-gray-600 flex items-center gap-2">
              <input
                type="checkbox"
                checked={completion.order_placed}
                onChange={(event) => setCompletion((prev) => ({ ...prev, order_placed: event.target.checked }))}
              />
              {t('orderPlaced')}
            </label>
            <input
              type="number"
              placeholder={t('orderAmount')}
              className="border border-[#e6e6e6] rounded-lg px-3 py-2 text-sm text-black"
              value={completion.order_amount ?? ''}
              onChange={(event) =>
                setCompletion((prev) => ({ ...prev, order_amount: event.target.value === '' ? null : Number(event.target.value) }))
              }
            />
            <label className="text-xs text-gray-600 flex items-center gap-2">
              <input
                type="checkbox"
                checked={completion.payment_collected}
                onChange={(event) => setCompletion((prev) => ({ ...prev, payment_collected: event.target.checked }))}
              />
              {t('paymentCollected')}
            </label>
            <input
              type="number"
              placeholder={t('paymentAmount')}
              className="border border-[#e6e6e6] rounded-lg px-3 py-2 text-sm text-black"
              value={completion.payment_amount ?? ''}
              onChange={(event) =>
                setCompletion((prev) => ({ ...prev, payment_amount: event.target.value === '' ? null : Number(event.target.value) }))
              }
            />
            <label className="text-xs text-gray-600 flex items-center gap-2">
              <input
                type="checkbox"
                checked={completion.stock_checked}
                onChange={(event) => setCompletion((prev) => ({ ...prev, stock_checked: event.target.checked }))}
              />
              {t('stockChecked')}
            </label>
            <input
              type="number"
              placeholder={t('productsDemoed')}
              className="border border-[#e6e6e6] rounded-lg px-3 py-2 text-sm text-black"
              value={completion.products_demoed}
              onChange={(event) => setCompletion((prev) => ({ ...prev, products_demoed: Number(event.target.value) || 0 }))}
            />
            <input
              className="border border-[#e6e6e6] rounded-lg px-3 py-2 text-sm text-black"
              placeholder={t('notes')}
              value={completion.notes}
              onChange={(event) => setCompletion((prev) => ({ ...prev, notes: event.target.value }))}
            />
            <div className="flex gap-2 pt-1">
              <button
                type="button"
                className="px-4 py-2 bg-[#0a61d7] text-white rounded-lg text-sm font-semibold hover:bg-[#084ba6]"
                onClick={() =>
                  run(async () => {
                    await fetchGraphQL(
                      `mutation Complete($userId: Int!, $id: String!, $completion: SalesJobCompletionInput!) { completeSalesJob(userId: $userId, id: $id, completion: $completion) { id } }`,
                      { userId, id: completing.id, completion },
                    );
                    setCompleting(null);
                  })
                }
              >
                {t('save')}
              </button>
              <button
                type="button"
                className="px-4 py-2 border border-[#e6e6e6] rounded-lg text-sm font-medium hover:bg-gray-100"
                onClick={() => setCompleting(null)}
              >
                {t('cancel')}
              </button>
            </div>
          </div>
        </ModalShell>
      )}
    </div>
  );
}
