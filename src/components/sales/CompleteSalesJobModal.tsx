'use client';

import React, { useEffect, useState } from 'react';
import { CheckCircle2, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { fetchGraphQL } from '@/lib/graphqlClient';
import { useUserStore } from '@/store/userStore';
import JobCompletionFields, { completionInput, completionIsPerVisit } from './JobCompletionFields';
import { SalesJobCompletion, SalesJobRow, SalesJobStockCount } from './salesJobTypes';

const emptyCompletion = (): SalesJobCompletion => ({
  order_placed: false,
  order_amount: null,
  payment_collected: false,
  payment_amount: null,
  stock_checked: false,
  products_demoed: 0,
  notes: '',
  delivered: false,
  promoted: false,
  returned: false,
  product_given: false,
  stock_counts: [],
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

function stockLinesFor(job: SalesJobRow | undefined, saved: SalesJobStockCount[] | undefined): SalesJobStockCount[] {
  const ids = job?.suggestedProducts ?? [];
  return ids.map((productId) => {
    const existing = saved?.find((line) => line.product_id === productId);
    if (existing) return { product_id: productId, checked: existing.checked !== false, counted: existing.counted ?? null };
    return { product_id: productId, checked: true, counted: null };
  });
}

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
    delivered: saved?.delivered === true || (saved?.delivered == null && saved?.order_placed === true),
    promoted: saved?.promoted === true,
    returned: saved?.returned === true,
    product_given: saved?.product_given === true,
    stock_counts: job.jobType === 'stock_check' ? stockLinesFor(job, saved?.stock_counts) : saved?.stock_counts ?? [],
    scheme_reference: saved?.scheme_reference ?? '',
  };
}

type SalesRepDetails = {
  name: string;
  email: string;
  phone: string;
  territory: string | null;
  favoriteProducts: { name: string }[];
};

function Detail({ label, value }: { label: string; value?: string | null }) {
  const text = value?.trim();
  if (!text) return null;
  return (
    <div>
      <p className="text-xs font-medium text-gray-700 mb-1">{label}</p>
      <p className="text-xs text-black">{text}</p>
    </div>
  );
}

export default function CompleteSalesJobModal({
  jobs,
  onClose,
  onSaved,
}: {
  jobs: SalesJobRow[];
  onClose: () => void;
  onSaved: (completion: SalesJobCompletion) => void;
}) {
  const t = useTranslations('dashboard.sales.salesJobs');
  const tSales = useTranslations('dashboard.sales.salesDetails');
  const userId = useUserStore((state) => state.user?.id);
  const [completion, setCompletion] = useState<SalesJobCompletion>(() => completionFromJob(jobs.length === 1 ? jobs[0] : undefined));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [salesRep, setSalesRep] = useState<SalesRepDetails | null>(null);
  const assignedTo = jobs[0]?.assignedTo || '';

  useEffect(() => {
    const next = completionFromJob(jobs.length === 1 ? jobs[0] : undefined);
    const activationProducts = Array.from(
      new Set(
        jobs
          .filter((job) => job.jobType === 'promote_product' || job.jobType === 'new_product_activation')
          .flatMap((job) => job.suggestedProducts ?? []),
      ),
    );
    if ((next.product_ids ?? []).length === 0 && activationProducts.length > 0) {
      next.product_ids = activationProducts;
      next.product_id = activationProducts[0];
    }
    setCompletion(next);
  }, [jobs]);

  useEffect(() => {
    if (!userId || !assignedTo) {
      setSalesRep(null);
      return;
    }
    let active = true;
    fetchGraphQL<{ salesAgent: SalesRepDetails }>(
      `query SalesRepDetails($userId: Int!, $id: String!) {
        salesAgent(userId: $userId, id: $id) {
          name email phone territory
          favoriteProducts { name }
        }
      }`,
      { userId, id: assignedTo },
    )
      .then((result) => {
        if (active) setSalesRep(result.salesAgent);
      })
      .catch(() => {
        if (active) setSalesRep(null);
      });
    return () => {
      active = false;
    };
  }, [userId, assignedTo]);

  const save = async () => {
    if (!userId || saving) return;
    if (jobs.length > 1 && jobs.some((job) => completionIsPerVisit(job.jobType))) {
      setError(t('completeSeparately'));
      return;
    }
    setSaving(true);
    setError('');
    try {
      for (const job of jobs) {
        await fetchGraphQL(
          `mutation Complete($userId: Int!, $id: String!, $completion: SalesJobCompletionInput!) { completeSalesJob(userId: $userId, id: $id, completion: $completion) { id } }`,
          { userId, id: job.id, completion: completionInput(job.jobType, completion) },
        );
      }
      onSaved(completion);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Request failed');
    } finally {
      setSaving(false);
    }
  };

  const stockJob = jobs.find((job) => job.jobType === 'stock_check');
  const stockProducts = (stockJob?.suggestedProducts ?? []).map((productId, index) => ({
    productId,
    name: stockJob?.suggestedProductNames[index] || productId,
  }));
  const activationJob = jobs.find((job) => job.jobType === 'promote_product' || job.jobType === 'new_product_activation');
  const activationProducts = (activationJob?.suggestedProducts ?? []).map((productId, index) => ({
    productId,
    name: activationJob?.suggestedProductNames[index] || productId,
  }));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" role="dialog" aria-modal="true" aria-labelledby="complete-job-title">
      <div className="bg-white rounded-lg border border-[#e6e6e6] w-full max-w-2xl relative max-h-[90vh] overflow-hidden flex flex-col mx-4">
        <button
          type="button"
          className="absolute top-4 right-4 p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors z-10"
          onClick={onClose}
          aria-label={t('cancel')}
        >
          <X className="w-5 h-5" />
        </button>
        <div className="flex items-center gap-3 px-4 pt-4 pb-4 pr-14">
          <div className="w-10 h-10 bg-[#0a61d7] rounded-lg flex items-center justify-center">
            <CheckCircle2 className="w-5 h-5 text-white" />
          </div>
          <h2 id="complete-job-title" className="text-xl font-bold text-black">
            {jobs.every((job) => job.status === 'completed') ? t('viewCompletion') : t('complete')}
          </h2>
        </div>
        <div className="border-b border-gray-200" />
        <div className="overflow-y-auto flex-1 min-h-0 px-4 py-4 flex flex-col gap-4">
          {error && <p className="text-xs text-red-700">{error}</p>}
          {jobs.map((job) => {
            const favourite = (salesRep?.favoriteProducts ?? []).map((product) => product.name).filter(Boolean).join(', ');
            return (
              <section key={job.id} className="border border-[#e6e6e6] rounded-lg p-4">
                <h3 className="text-xs font-semibold text-gray-900 mb-3">{t('details')}</h3>
                <div className="grid md:grid-cols-2 gap-3">
                  <Detail label={t('rep')} value={salesRep?.name || job.agentName} />
                  <Detail label={t('salesPhone')} value={salesRep?.phone} />
                  <Detail label={t('salesEmail')} value={salesRep?.email} />
                  <Detail label={t('salesLocation')} value={salesRep?.territory} />
                  <div className="md:col-span-2">
                    <Detail label={t('favouriteProducts')} value={favourite || tSales('noFavoriteProducts')} />
                  </div>
                </div>
              </section>
            );
          })}
          <JobCompletionFields
            jobTypes={jobs.map((job) => job.jobType)}
            completion={completion}
            stockProducts={stockProducts}
            activationProducts={activationProducts}
            onChangeAction={setCompletion}
          />
        </div>
        <div className="border-t border-gray-200" />
        <div className="flex justify-end gap-2 px-4 py-4">
          <button type="button" className="px-4 py-2 text-xs text-gray-600 hover:text-gray-800 transition-colors" onClick={onClose} disabled={saving}>
            {t('cancel')}
          </button>
          <button
            type="button"
            className="px-4 py-2 rounded-lg bg-[#0a61d7] text-white text-xs font-semibold hover:bg-[#084ba6] transition-colors disabled:opacity-50"
            onClick={() => void save()}
            disabled={saving}
          >
            {saving ? t('form.saving') : t('save')}
          </button>
        </div>
      </div>
    </div>
  );
}
