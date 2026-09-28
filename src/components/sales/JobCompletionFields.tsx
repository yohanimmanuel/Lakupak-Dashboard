'use client';

import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown, Plus, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { SalesJobCompletion, SalesJobReturnedItem } from './salesJobTypes';

const ORIGINAL_TYPES = new Set(['take_order', 'collect_payment', 'promote_product', 'stock_check', 'prospect_new_outlet']);
const RETURN_REASONS = ['expired', 'damaged', 'unsold_near_expiry', 'other'] as const;

const inputClass = 'w-full border border-[#e6e6e6] rounded-lg px-3 py-2 text-xs text-black bg-white';

export type CompletionProduct = { productId: string; name: string };
export type CompletionOffer = { offerId: string; label: string };

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

function FieldSelect({
  value,
  placeholder,
  options,
  allowEmpty = true,
  onChangeAction,
}: {
  value: string;
  placeholder: string;
  options: { value: string; label: string }[];
  allowEmpty?: boolean;
  onChangeAction: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const selected = options.find((option) => option.value === value);

  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="w-full px-3 py-2 text-xs border border-[#e6e6e6] rounded-lg text-left flex items-center justify-between bg-white"
      >
        <span className={selected ? 'text-black truncate' : 'text-gray-500 truncate'}>{selected?.label || placeholder}</span>
        <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />
      </button>
      {open && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-[#e6e6e6] rounded-lg shadow-lg max-h-48 overflow-y-auto">
          {allowEmpty && (
            <button
              type="button"
              onClick={() => {
                onChangeAction('');
                setOpen(false);
              }}
              className={`w-full px-3 py-2 text-xs text-left hover:bg-gray-100 ${value === '' ? 'text-[#0a61d7] font-semibold bg-gray-50' : 'text-gray-500'}`}
            >
              {placeholder}
            </button>
          )}
          {options.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => {
                onChangeAction(option.value);
                setOpen(false);
              }}
              className={`w-full px-3 py-2 text-xs text-left hover:bg-gray-100 ${
                value === option.value ? 'text-[#0a61d7] font-semibold bg-gray-50' : 'text-gray-700'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const PER_VISIT_JOB_TYPES = new Set([
  'returns_pickup',
  'competitor_intel',
  'new_product_activation',
  'scheme_reconciliation',
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
  };
  if (jobType === 'returns_pickup') {
    return {
      ...shared,
      items_returned: completion.items_returned ?? [],
      replacement_issued: completion.replacement_issued === true,
      replacement_value: completion.replacement_issued ? completion.replacement_value ?? null : null,
    };
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
    const productIds = completion.product_ids?.length
      ? completion.product_ids
      : completion.product_id
        ? [completion.product_id]
        : [];
    return {
      ...shared,
      product_id: productIds[0] ?? '',
      product_ids: productIds,
      display_setup_completed: completion.display_setup_completed === true,
      samples_given: completion.samples_given ?? null,
      retailer_briefed: completion.retailer_briefed === true,
    };
  }
  if (jobType === 'scheme_reconciliation') {
    return {
      ...shared,
      scheme_reference: completion.scheme_reference ?? '',
      execution_confirmed: completion.execution_confirmed === true,
      claim_amount: completion.claim_amount ?? null,
    };
  }
  return {
    order_placed: completion.order_placed,
    order_amount: completion.order_amount,
    payment_collected: completion.payment_collected,
    payment_amount: completion.payment_amount,
    stock_checked: completion.stock_checked,
    products_demoed: completion.products_demoed,
    notes: completion.notes,
  };
}

export default function JobCompletionFields({
  jobTypes,
  completion,
  products,
  offers,
  onChangeAction,
}: {
  jobTypes: string[];
  completion: SalesJobCompletion;
  products: CompletionProduct[];
  offers: CompletionOffer[];
  onChangeAction: (next: SalesJobCompletion) => void;
}) {
  const t = useTranslations('dashboard.sales.salesJobs');
  const types = new Set(jobTypes);
  const showOriginal = jobTypes.some((jobType) => ORIGINAL_TYPES.has(jobType));
  const items = completion.items_returned ?? [];
  const productOptions = products.map((product) => ({ value: product.productId, label: product.name }));

  const patchItem = (index: number, patch: Partial<SalesJobReturnedItem>) => {
    onChangeAction({
      ...completion,
      items_returned: items.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item)),
    });
  };

  return (
    <div className="grid gap-3">
      {showOriginal && (
        <>
          <CheckRow
            checked={completion.order_placed}
            label={t('orderPlaced')}
            onChangeAction={(order_placed) => onChangeAction({ ...completion, order_placed })}
          />
          <input
            type="number"
            min={0}
            placeholder={t('orderAmount')}
            className={inputClass}
            value={completion.order_amount ?? ''}
            onChange={(event) => onChangeAction({ ...completion, order_amount: event.target.value === '' ? null : Number(event.target.value) })}
          />
          <CheckRow
            checked={completion.payment_collected}
            label={t('paymentCollected')}
            onChangeAction={(payment_collected) => onChangeAction({ ...completion, payment_collected })}
          />
          <input
            type="number"
            min={0}
            placeholder={t('paymentAmount')}
            className={inputClass}
            value={completion.payment_amount ?? ''}
            onChange={(event) =>
              onChangeAction({ ...completion, payment_amount: event.target.value === '' ? null : Number(event.target.value) })
            }
          />
          <CheckRow
            checked={completion.stock_checked}
            label={t('stockChecked')}
            onChangeAction={(stock_checked) => onChangeAction({ ...completion, stock_checked })}
          />
          <input
            type="number"
            min={0}
            placeholder={t('productsDemoed')}
            className={inputClass}
            value={completion.products_demoed}
            onChange={(event) => onChangeAction({ ...completion, products_demoed: Number(event.target.value) || 0 })}
          />
        </>
      )}

      {types.has('returns_pickup') && (
        <div className="grid gap-2">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-medium text-gray-700">{t('completion.itemsReturned')}</p>
            <button
              type="button"
              onClick={() =>
                onChangeAction({
                  ...completion,
                  items_returned: [...items, { product_id: '', quantity: 1, reason: 'expired' }],
                })
              }
              className="flex items-center gap-1 px-3 py-2 rounded-lg bg-white border border-[#e6e6e6] text-xs font-medium text-black hover:bg-gray-100"
            >
              <Plus className="w-3.5 h-3.5" />
              {t('completion.addItem')}
            </button>
          </div>
          {items.map((item, index) => (
            <div key={`${item.product_id}-${index}`} className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-center">
              <div className="sm:col-span-5">
                <FieldSelect
                  value={item.product_id}
                  placeholder={t('completion.selectProduct')}
                  options={productOptions}
                  onChangeAction={(product_id) => patchItem(index, { product_id })}
                />
              </div>
              <input
                type="number"
                min={1}
                step={1}
                aria-label={t('completion.quantity')}
                className={`${inputClass} sm:col-span-2`}
                value={item.quantity}
                onChange={(event) => patchItem(index, { quantity: Number(event.target.value) })}
              />
              <div className="sm:col-span-4">
                <FieldSelect
                  value={item.reason}
                  placeholder={t('completion.reason')}
                  allowEmpty={false}
                  options={RETURN_REASONS.map((reason) => ({ value: reason, label: t(`completion.reasons.${reason}`) }))}
                  onChangeAction={(reason) => patchItem(index, { reason: reason as SalesJobReturnedItem['reason'] })}
                />
              </div>
              <button
                type="button"
                aria-label={t('completion.removeItem')}
                onClick={() => onChangeAction({ ...completion, items_returned: items.filter((_, itemIndex) => itemIndex !== index) })}
                className="sm:col-span-1 p-2 rounded-lg hover:bg-gray-100 text-gray-500 justify-self-end"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
          <CheckRow
            checked={completion.replacement_issued === true}
            label={t('completion.replacementIssued')}
            onChangeAction={(replacement_issued) => onChangeAction({ ...completion, replacement_issued })}
          />
          {completion.replacement_issued && (
            <input
              type="number"
              min={0}
              placeholder={t('completion.replacementValue')}
              className={inputClass}
              value={completion.replacement_value ?? ''}
              onChange={(event) =>
                onChangeAction({ ...completion, replacement_value: event.target.value === '' ? null : Number(event.target.value) })
              }
            />
          )}
        </div>
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
        <div className="grid gap-2">
          <div className="max-h-48 overflow-y-auto border border-[#e6e6e6] rounded-lg">
            {productOptions.length === 0 ? (
              <p className="px-3 py-4 text-xs text-gray-500">{t('form.noProducts')}</p>
            ) : (
              productOptions.map((product) => {
                const selectedIds = completion.product_ids ?? [];
                const selected = selectedIds.includes(product.value);
                return (
                  <button
                    key={product.value}
                    type="button"
                    onClick={() => {
                      const product_ids = selected
                        ? selectedIds.filter((id) => id !== product.value)
                        : [...selectedIds, product.value];
                      onChangeAction({ ...completion, product_ids, product_id: product_ids[0] ?? '' });
                    }}
                    className={`w-full text-left px-3 py-2 border-b border-[#e6e6e6] last:border-b-0 flex items-center gap-2 text-xs ${
                      selected ? 'bg-blue-50 text-gray-900' : 'bg-white text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    <GreenCheck checked={selected} />
                    {product.label}
                  </button>
                );
              })
            )}
          </div>
          <CheckRow
            checked={completion.display_setup_completed === true}
            label={t('completion.displaySetup')}
            onChangeAction={(display_setup_completed) => onChangeAction({ ...completion, display_setup_completed })}
          />
          <input
            type="number"
            min={0}
            step={1}
            placeholder={t('completion.samplesGiven')}
            className={inputClass}
            value={completion.samples_given ?? ''}
            onChange={(event) => onChangeAction({ ...completion, samples_given: event.target.value === '' ? null : Number(event.target.value) })}
          />
          <CheckRow
            checked={completion.retailer_briefed === true}
            label={t('completion.retailerBriefed')}
            onChangeAction={(retailer_briefed) => onChangeAction({ ...completion, retailer_briefed })}
          />
        </div>
      )}

      {types.has('scheme_reconciliation') && (
        <div className="grid gap-2">
          {offers.length > 0 && (
            <FieldSelect
              value={offers.some((offer) => offer.offerId === completion.scheme_reference) ? completion.scheme_reference ?? '' : ''}
              placeholder={t('completion.selectOffer')}
              options={offers.map((offer) => ({ value: offer.offerId, label: offer.label }))}
              onChangeAction={(scheme_reference) => onChangeAction({ ...completion, scheme_reference })}
            />
          )}
          <input
            className={inputClass}
            placeholder={t('completion.schemeReference')}
            value={completion.scheme_reference ?? ''}
            onChange={(event) => onChangeAction({ ...completion, scheme_reference: event.target.value })}
          />
          <CheckRow
            checked={completion.execution_confirmed === true}
            label={t('completion.executionConfirmed')}
            onChangeAction={(execution_confirmed) => onChangeAction({ ...completion, execution_confirmed })}
          />
          <input
            type="number"
            min={0}
            placeholder={t('completion.claimAmount')}
            className={inputClass}
            value={completion.claim_amount ?? ''}
            onChange={(event) => onChangeAction({ ...completion, claim_amount: event.target.value === '' ? null : Number(event.target.value) })}
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
