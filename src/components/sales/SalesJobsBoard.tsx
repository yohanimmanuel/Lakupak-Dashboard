'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Download, Plus, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as XLSX from 'xlsx';
import { fetchGraphQL } from '@/lib/graphqlClient';
import { useUserStore } from '@/store/userStore';
import { SkeletonTablePage } from '@/components/skeleton/SkeletonTablePage';
import JobCompletionFields, { CompletionOffer, CompletionProduct, completionInput, completionIsPerVisit } from './JobCompletionFields';
import JobsStatcards from './JobsStatcards';
import JobsTable from './JobsTable';
import { SalesJobCompletion, SalesJobRow } from './salesJobTypes';

const COMPLETION_FIELDS = `
  order_placed order_amount payment_collected payment_amount stock_checked products_demoed notes
  items_returned { product_id quantity reason }
  replacement_issued replacement_value
  competitor_name competitor_product observed_price observed_promo shelf_share_observation
  product_id product_ids display_setup_completed samples_given retailer_briefed
  scheme_reference execution_confirmed claim_amount
`;

const JOB_FIELDS = `
  id assignedTo agentName clientId clientName clientStatus jobType priorityReason
  suggestedProducts suggestedProductNames createdBy status scheduledDate createdAt dispatchNote
  schedules { date reminderTime }
  completionData { ${COMPLETION_FIELDS} }
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
  items_returned: [],
  replacement_issued: false,
  replacement_value: null,
  competitor_name: '',
  competitor_product: '',
  observed_price: null,
  observed_promo: '',
  shelf_share_observation: '',
  product_id: '',
  product_ids: [],
  display_setup_completed: false,
  samples_given: null,
  retailer_briefed: false,
  scheme_reference: '',
  execution_confirmed: false,
  claim_amount: null,
});

function completionFromJob(job?: SalesJobRow): SalesJobCompletion {
  const base = emptyCompletion();
  if (!job) return base;
  const saved = job.completionData;
  return {
    ...base,
    ...saved,
    notes: saved?.notes ?? '',
    items_returned: saved?.items_returned ?? [],
    competitor_name: saved?.competitor_name ?? '',
    competitor_product: saved?.competitor_product ?? '',
    observed_promo: saved?.observed_promo ?? '',
    shelf_share_observation: saved?.shelf_share_observation ?? '',
    product_id: saved?.product_ids?.[0] || saved?.product_id || job.suggestedProducts?.[0] || '',
    product_ids: saved?.product_ids?.length
      ? saved.product_ids
      : saved?.product_id
        ? [saved.product_id]
        : job.suggestedProducts ?? [],
    scheme_reference: saved?.scheme_reference ?? '',
  };
}

type CompletingJob = { id: string; jobType: string; clientId: string };

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
      <div className="w-full max-w-2xl bg-white rounded-lg border border-[#e6e6e6] flex flex-col max-h-[90vh] overflow-hidden">
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
  const t = useTranslations('dashboard.sales.salesJobs');
  const router = useRouter();
  const userId = useUserStore((state) => state.user?.id);
  const [jobs, setJobs] = useState<SalesJobRow[]>([]);
  const [initialLoading, setInitialLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [completing, setCompleting] = useState<CompletingJob[]>([]);
  const [completingName, setCompletingName] = useState('');
  const [completion, setCompletion] = useState<SalesJobCompletion>(emptyCompletion());
  const [completionProducts, setCompletionProducts] = useState<CompletionProduct[]>([]);
  const [completionOffers, setCompletionOffers] = useState<CompletionOffer[]>([]);

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

  useEffect(() => {
    let active = true;
    setCompletionProducts([]);
    setCompletionOffers([]);
    if (!userId || completing.length === 0) {
      return () => {
        active = false;
      };
    }
    const types = new Set(completing.map((job) => job.jobType));
    if (types.has('returns_pickup') || types.has('new_product_activation')) {
      fetchGraphQL<{ products: { nodes: CompletionProduct[] } }>(
        `query CompletionProducts($userId: Int!) { products(userId: $userId, page: 1, limit: 500) { nodes { productId name } } }`,
        { userId },
      )
        .then((result) => {
          if (active) setCompletionProducts(result.products.nodes);
        })
        .catch(() => {
          if (active) setCompletionProducts([]);
        });
    }
    if (types.has('scheme_reconciliation')) {
      const buyerIds = Array.from(
        new Set(completing.filter((job) => job.jobType === 'scheme_reconciliation').map((job) => job.clientId)),
      );
      const apply = (rows: { offerId: string; productName?: string | null; discountType: string }[]) => {
        if (!active) return;
        setCompletionOffers(
          rows.map((row) => ({
            offerId: row.offerId,
            label: row.productName ? `${row.offerId} · ${row.productName}` : `${row.offerId} · ${row.discountType}`,
          })),
        );
      };
      if (buyerIds.length === 1) {
        fetchGraphQL<{ offersForBuyer: { offerId: string; productName?: string | null; discountType: string }[] }>(
          `query CompletionOffers($userId: Int!, $buyerId: String!) { offersForBuyer(userId: $userId, buyerId: $buyerId) { offerId productName discountType } }`,
          { userId, buyerId: buyerIds[0] },
        )
          .then((result) => apply(result.offersForBuyer))
          .catch(() => {
            if (active) setCompletionOffers([]);
          });
      } else {
        fetchGraphQL<{ offers: { nodes: { offerId: string; productName?: string | null; discountType: string }[] } }>(
          `query CompletionOffers($userId: Int!) { offers(userId: $userId, page: 1, limit: 100) { nodes { offerId productName discountType } } }`,
          { userId },
        )
          .then((result) => apply(result.offers.nodes))
          .catch(() => {
            if (active) setCompletionOffers([]);
          });
      }
    }
    return () => {
      active = false;
    };
  }, [userId, completing]);

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
        onEditAction={({ assignedTo, clientId }) =>
          router.push(`/sales/jobs/edit?assignedTo=${encodeURIComponent(assignedTo)}&clientId=${encodeURIComponent(clientId)}`)
        }
        onDeleteAction={(ids) => {
          setError('');
          setMessage('');
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
        onCompleteAction={(rows) => {
          if (rows.length > 1 && rows.some((job) => completionIsPerVisit(job.jobType))) {
            setMessage('');
            setError(t('completeSeparately'));
            return;
          }
          setError('');
          setCompleting(rows.map((job) => ({ id: job.id, jobType: job.jobType, clientId: job.clientId })));
          setCompletingName(Array.from(new Set(rows.map((job) => job.clientName))).join(', '));
          const next = completionFromJob(rows.length === 1 ? rows[0] : undefined);
          const activationProducts = Array.from(
            new Set(rows.filter((job) => job.jobType === 'new_product_activation').flatMap((job) => job.suggestedProducts ?? [])),
          );
          if ((next.product_ids ?? []).length === 0 && activationProducts.length > 0) {
            next.product_ids = activationProducts;
            next.product_id = activationProducts[0];
          }
          setCompletion(next);
        }}
      />

      {completing.length > 0 && (
        <ModalShell title={t('complete')} onClose={() => setCompleting([])}>
          <div className="grid gap-3">
            <p className="text-sm font-medium text-gray-900">{completingName}</p>
            <JobCompletionFields
              jobTypes={completing.map((job) => job.jobType)}
              completion={completion}
              products={completionProducts}
              offers={completionOffers}
              onChangeAction={setCompletion}
            />
            <div className="flex gap-2 pt-1">
              <button
                type="button"
                className="px-4 py-2 bg-[#0a61d7] text-white rounded-lg text-sm font-semibold hover:bg-[#084ba6]"
                onClick={() =>
                  run(async () => {
                    if (completing.length > 1 && completing.some((job) => completionIsPerVisit(job.jobType))) {
                      throw new Error(t('completeSeparately'));
                    }
                    for (const job of completing) {
                      await fetchGraphQL(
                        `mutation Complete($userId: Int!, $id: String!, $completion: SalesJobCompletionInput!) { completeSalesJob(userId: $userId, id: $id, completion: $completion) { id } }`,
                        { userId, id: job.id, completion: completionInput(job.jobType, completion) },
                      );
                    }
                    setCompleting([]);
                  })
                }
              >
                {t('save')}
              </button>
              <button
                type="button"
                className="px-4 py-2 border border-[#e6e6e6] rounded-lg text-sm font-medium hover:bg-gray-100"
                onClick={() => setCompleting([])}
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
