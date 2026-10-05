'use client';

import { useTranslations } from 'next-intl';
import { SalesJobCompletion, SalesJobStockCount } from './salesJobTypes';

const inputClass = 'w-full border border-[#e6e6e6] rounded-lg px-3 py-2 text-xs text-black bg-white';

export type CompletionProduct = { productId: string; name: string };

export default function JobCompletionFields({
  jobTypes,
  completion,
  stockProducts,
  onChangeAction,
}: {
  jobTypes: string[];
  completion: SalesJobCompletion;
  stockProducts: CompletionProduct[];
  onChangeAction: (next: SalesJobCompletion) => void;
}) {
  const t = useTranslations('dashboard.sales.salesJobs');
  const types = new Set(jobTypes);
  const stockLines = completion.stock_counts ?? [];

  const patchStock = (productId: string, patch: Partial<SalesJobStockCount>) => {
    const current = stockLines.find((line) => line.product_id === productId) ?? {
      product_id: productId,
      checked: true,
      counted: null,
    };
    const nextLine = { ...current, ...patch, product_id: productId };
    const exists = stockLines.some((line) => line.product_id === productId);
    onChangeAction({
      ...completion,
      stock_counts: exists
        ? stockLines.map((line) => (line.product_id === productId ? nextLine : line))
        : [...stockLines, nextLine],
    });
  };

  return (
    <div className="grid gap-3">
      {types.has('take_order') && (
        <CheckRow
          checked={completion.delivered === true}
          label={t('completion.delivered')}
          onChangeAction={(delivered) => onChangeAction({ ...completion, delivered })}
        />
      )}
      {types.has('collect_payment') && (
        <CheckRow
          checked={completion.payment_collected}
          label={t('paymentCollected')}
          onChangeAction={(payment_collected) => onChangeAction({ ...completion, payment_collected, payment_amount: null })}
        />
      )}
      {types.has('promote_product') && (
        <CheckRow
          checked={completion.promoted === true}
          label={t('completion.promoted')}
          onChangeAction={(promoted) => onChangeAction({ ...completion, promoted })}
        />
      )}
      {types.has('stock_check') && (
        <div className="grid gap-2">
          <CheckRow
            checked={completion.stock_checked}
            label={t('completion.checked')}
            onChangeAction={(stock_checked) => onChangeAction({ ...completion, stock_checked })}
          />
          {stockProducts.map((product) => {
            const line = stockLines.find((row) => row.product_id === product.productId) ?? {
              product_id: product.productId,
              checked: true,
              counted: null,
            };
            return (
              <div key={product.productId} className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => patchStock(product.productId, { checked: !line.checked, product_id: product.productId, counted: line.counted })}
                  className="flex items-center gap-2 text-xs text-gray-700 text-left min-w-0 flex-1"
                >
                  <GreenCheck checked={line.checked} />
                  <span className="truncate">{product.name}</span>
                </button>
                <input
                  type="number"
                  min={0}
                  step={1}
                  aria-label={t('completion.countedStock')}
                  placeholder={t('completion.countedStock')}
                  className="w-28 border border-[#e6e6e6] rounded-lg px-3 py-2 text-xs text-black bg-white"
                  value={line.counted ?? ''}
                  onChange={(event) =>
                    patchStock(product.productId, {
                      product_id: product.productId,
                      checked: line.checked,
                      counted: event.target.value === '' ? null : Number(event.target.value),
                    })
                  }
                />
              </div>
            );
          })}
        </div>
      )}
      {types.has('returns_pickup') && (
        <CheckRow
          checked={completion.returned === true}
          label={t('completion.returned')}
          onChangeAction={(returned) => onChangeAction({ ...completion, returned })}
        />
      )}

      {types.has('competitor_intel') && (
        <div className="grid gap-2">
          <input
            className={inputClass}
            placeholder={t('completion.competitorName')}
            value={completion.competitor_name ?? ''}
            onChange={(event) => onChangeAction({ ...completion, competitor_name: event.target.value })}
          />
          <input
            className={inputClass}
            placeholder={t('completion.competitorProduct')}
            value={completion.competitor_product ?? ''}
            onChange={(event) => onChangeAction({ ...completion, competitor_product: event.target.value })}
          />
          <input
            type="number"
            min={0}
            placeholder={t('completion.observedPrice')}
            className={inputClass}
            value={completion.observed_price ?? ''}
            onChange={(event) => onChangeAction({ ...completion, observed_price: event.target.value === '' ? null : Number(event.target.value) })}
          />
          <input
            className={inputClass}
            placeholder={t('completion.observedPromo')}
            value={completion.observed_promo ?? ''}
            onChange={(event) => onChangeAction({ ...completion, observed_promo: event.target.value })}
          />
          <input
            className={inputClass}
            placeholder={t('completion.shelfShare')}
            value={completion.shelf_share_observation ?? ''}
            onChange={(event) => onChangeAction({ ...completion, shelf_share_observation: event.target.value })}
          />
        </div>
      )}

      {types.has('new_product_activation') && (
        <div className="flex items-center gap-2">
          <CheckRow
            checked={completion.product_given === true}
            label={t('completion.productGiven')}
            onChangeAction={(product_given) => onChangeAction({ ...completion, product_given })}
          />
          <input
            type="number"
            min={0}
            step={1}
            aria-label={t('completion.productGiven')}
            placeholder={t('completion.quantity')}
            className="w-28 border border-[#e6e6e6] rounded-lg px-3 py-2 text-xs text-black bg-white"
            value={completion.samples_given ?? ''}
            onChange={(event) =>
              onChangeAction({ ...completion, samples_given: event.target.value === '' ? null : Number(event.target.value) })
            }
          />
        </div>
      )}

      <input
        className={inputClass}
        placeholder={t('notes')}
        value={completion.notes}
        onChange={(event) => onChangeAction({ ...completion, notes: event.target.value })}
      />
    </div>
  );
}

function GreenCheck({ checked }: { checked: boolean }) {
  return (
    <span
      className={`w-4 h-4 border-2 rounded flex items-center justify-center shrink-0 ${
        checked ? 'bg-green-500 border-green-500' : 'bg-white border-gray-300'
      }`}
    >
      {checked && (
        <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
          <path
            fillRule="evenodd"
            d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
            clipRule="evenodd"
          />
        </svg>
      )}
    </span>
  );
}

function CheckRow({ checked, label, onChangeAction }: { checked: boolean; label: string; onChangeAction: (checked: boolean) => void }) {
  return (
    <button type="button" onClick={() => onChangeAction(!checked)} className="flex items-center gap-2 text-xs text-gray-700 text-left">
      <GreenCheck checked={checked} />
      {label}
    </button>
  );
}

const PER_VISIT_JOB_TYPES = new Set([
  'stock_check',
  'returns_pickup',
  'competitor_intel',
  'new_product_activation',
]);

export function completionIsPerVisit(jobType: string) {
  return PER_VISIT_JOB_TYPES.has(jobType);
}

export function completionInput(jobType: string, completion: SalesJobCompletion) {
  const shared = {
    order_placed: false,
    order_amount: null as number | null,
    payment_collected: false,
    payment_amount: null as number | null,
    stock_checked: false,
    products_demoed: 0,
    notes: completion.notes,
    delivered: false,
    promoted: false,
    returned: false,
    product_given: false,
    stock_counts: [] as SalesJobStockCount[],
    items_returned: [] as [],
    retailer_briefed: false,
  };
  if (jobType === 'take_order') {
    const delivered = completion.delivered === true;
    return { ...shared, delivered, order_placed: delivered };
  }
  if (jobType === 'collect_payment') {
    return { ...shared, payment_collected: completion.payment_collected };
  }
  if (jobType === 'promote_product') {
    return { ...shared, promoted: completion.promoted === true };
  }
  if (jobType === 'stock_check') {
    return {
      ...shared,
      stock_checked: completion.stock_checked,
      stock_counts: (completion.stock_counts ?? []).map((line) => ({
        product_id: line.product_id,
        checked: line.checked,
        counted: line.counted,
      })),
    };
  }
  if (jobType === 'returns_pickup') {
    return { ...shared, returned: completion.returned === true };
  }
  if (jobType === 'competitor_intel') {
    return {
      ...shared,
      competitor_name: completion.competitor_name ?? '',
      competitor_product: completion.competitor_product ?? '',
      observed_price: completion.observed_price ?? null,
      observed_promo: completion.observed_promo ?? '',
      shelf_share_observation: completion.shelf_share_observation ?? '',
    };
  }
  if (jobType === 'new_product_activation') {
    return {
      ...shared,
      product_given: completion.product_given === true,
      samples_given: completion.samples_given ?? null,
    };
  }
  return shared;
}
