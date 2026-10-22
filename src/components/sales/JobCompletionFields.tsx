'use client';

import { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { SalesJobCompletion, SalesJobStockCount } from './salesJobTypes';

const inputClass = 'w-full border border-[#e6e6e6] rounded-lg px-3 py-2 text-xs text-black bg-white';

export type CompletionProduct = { productId: string; name: string };
export type CompletionClientGroup = { id: string; name: string };

export default function JobCompletionFields({
  jobTypes,
  completion,
  stockProducts,
  activationProducts = [],
  clientGroups = [],
  onChangeAction,
}: {
  jobTypes: string[];
  completion: SalesJobCompletion;
  stockProducts: CompletionProduct[];
  activationProducts?: CompletionProduct[];
  clientGroups?: CompletionClientGroup[];
  onChangeAction: (next: SalesJobCompletion) => void;
}) {
  const t = useTranslations('dashboard.sales.salesJobs');
  const types = new Set(jobTypes);
  const stockLines = completion.stock_counts ?? [];
  const givenLines = completion.given_counts ?? [];
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});
  const groups: CompletionClientGroup[] = clientGroups.length ? clientGroups : [{ id: '', name: '' }];

  const toggleGroup = (groupId: string) => {
    setCollapsedGroups((current) => ({ ...current, [groupId]: !current[groupId] }));
  };

  /** Saved lines without a client belong to the first group, from before per-client counts. */
  const stockLineFor = (clientId: string, productId: string, isFirstGroup: boolean): SalesJobStockCount => {
    const scoped = stockLines.find((line) => line.product_id === productId && (line.client_id || '') === clientId);
    if (scoped) return scoped;
    if (isFirstGroup) {
      const legacy = stockLines.find((line) => line.product_id === productId && !line.client_id);
      if (legacy) return legacy;
    }
    return { product_id: productId, checked: true, counted: null, ...(clientId ? { client_id: clientId } : {}) };
  };

  const patchStock = (clientId: string, productId: string, patch: Partial<SalesJobStockCount>, isFirstGroup: boolean) => {
    const current = stockLineFor(clientId, productId, isFirstGroup);
    const nextLine: SalesJobStockCount = {
      ...current,
      ...patch,
      product_id: productId,
      ...(clientId ? { client_id: clientId } : {}),
    };
    if (!clientId) delete nextLine.client_id;
    const rest = stockLines.filter(
      (line) =>
        !(
          line.product_id === productId &&
          ((line.client_id || '') === clientId || (isFirstGroup && !line.client_id && clientId !== (line.client_id || '')))
        ),
    );
    onChangeAction({ ...completion, stock_counts: [...rest, nextLine] });
  };

  const givenLineFor = (clientId: string, productId: string, isFirstGroup: boolean) => {
    const scoped = givenLines.find((line) => line.product_id === productId && (line.client_id || '') === clientId);
    if (scoped) return scoped;
    if (isFirstGroup) return givenLines.find((line) => line.product_id === productId && !line.client_id);
    return undefined;
  };

  const patchGiven = (clientId: string, productId: string, quantity: number | null, isFirstGroup: boolean) => {
    const rest = givenLines.filter(
      (line) =>
        !(
          line.product_id === productId &&
          ((line.client_id || '') === clientId || (isFirstGroup && !line.client_id && clientId !== (line.client_id || '')))
        ),
    );
    const given_counts =
      quantity == null
        ? rest
        : [...rest, { product_id: productId, quantity, ...(clientId ? { client_id: clientId } : {}) }];
    onChangeAction({
      ...completion,
      given_counts,
      samples_given: given_counts.length ? given_counts.reduce((sum, row) => sum + row.quantity, 0) : null,
    });
  };

  type MasterCheckKind = 'stock' | 'promote' | 'activation';

  const masterGlobalChecked = (kind: MasterCheckKind): boolean => {
    if (kind === 'stock') return completion.stock_checked;
    if (kind === 'promote') return completion.promoted === true;
    return completion.product_given === true;
  };

  /** Saved completions without per-client checks fall back to the old single checkbox. */
  const clientCheckFor = (clientId: string, kind: MasterCheckKind): boolean => {
    const scoped = (completion.client_checks ?? []).find((entry) => entry.client_id === clientId);
    if (scoped) return scoped.checked;
    if ((completion.client_checks ?? []).length === 0) return masterGlobalChecked(kind);
    return false;
  };

  const patchClientCheck = (clientId: string, checked: boolean, kind: MasterCheckKind) => {
    const globalChecked = masterGlobalChecked(kind);
    const entries = groups
      .filter((group) => group.id)
      .map((group) => ({
        client_id: group.id,
        checked: group.id === clientId ? checked : clientCheckFor(group.id, kind),
      }));
    const allChecked = groups.every((group) => (group.id === clientId ? checked : clientCheckFor(group.id, kind)));
    onChangeAction({
      ...completion,
      ...(entries.length > 0 ? { client_checks: entries } : {}),
      ...(kind === 'stock'
        ? { stock_checked: allChecked }
        : kind === 'promote'
          ? { promoted: allChecked }
          : { product_given: allChecked }),
    });
  };

  const groupHeader = (group: CompletionClientGroup, kind: MasterCheckKind, checkLabel: string) => {
    if (!group.name) return null;
    const collapsed = collapsedGroups[group.id] === true;
    const checked = clientCheckFor(group.id, kind);
    return (
      <div className="flex w-full items-center gap-2 px-3 py-2">
        <button
          type="button"
          onClick={() => patchClientCheck(group.id, !checked, kind)}
          aria-label={`${checkLabel}: ${group.name}`}
          aria-pressed={checked}
          className="shrink-0"
        >
          <GreenCheck checked={checked} />
        </button>
        <button
          type="button"
          onClick={() => toggleGroup(group.id)}
          aria-expanded={!collapsed}
          aria-label={collapsed ? t('completion.expandClient', { name: group.name }) : t('completion.collapseClient', { name: group.name })}
          className="flex min-w-0 flex-1 items-center gap-2 text-left text-xs font-semibold text-gray-900"
        >
          <span className="min-w-0 flex-1 truncate">{group.name}</span>
          {collapsed ? <ChevronDown className="h-4 w-4 shrink-0 text-gray-500" /> : <ChevronUp className="h-4 w-4 shrink-0 text-gray-500" />}
        </button>
      </div>
    );
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
      {(types.has('promote_product') || types.has('new_product_activation')) && (
        <div className="grid gap-2">
          {activationProducts.length > 0
            ? groups.map((group, groupIndex) => (
                <div key={group.id || 'default'} className={group.name ? 'overflow-hidden rounded-lg border border-[#e6e6e6]' : ''}>
                  {groupHeader(
                    group,
                    types.has('promote_product') ? 'promote' : 'activation',
                    types.has('promote_product') ? t('completion.promoted') : t('completion.productGiven'),
                  )}
                  {collapsedGroups[group.id] !== true && (
                    <div className={`grid gap-2 ${group.name ? 'px-3 pb-3 pt-1' : ''}`}>
                      {!group.name &&
                        (types.has('promote_product') ? (
                          <CheckRow
                            checked={clientCheckFor(group.id, 'promote')}
                            label={t('completion.promoted')}
                            onChangeAction={(checked) => patchClientCheck(group.id, checked, 'promote')}
                          />
                        ) : (
                          <CheckRow
                            checked={clientCheckFor(group.id, 'activation')}
                            label={t('completion.productGiven')}
                            onChangeAction={(checked) => patchClientCheck(group.id, checked, 'activation')}
                          />
                        ))}
                      {activationProducts.map((product) => {
                        const line = givenLineFor(group.id, product.productId, groupIndex === 0);
                        return (
                          <div key={product.productId} className="flex items-center gap-2">
                            <span className="text-xs text-gray-700 truncate flex-1">{product.name}</span>
                            <input
                              type="number"
                              min={0}
                              step={1}
                              aria-label={product.name}
                              placeholder={t('completion.quantity')}
                              className="w-28 border border-[#e6e6e6] rounded-lg px-3 py-2 text-xs text-black bg-white"
                              value={line?.quantity ?? ''}
                              onChange={(event) => {
                                const raw = event.target.value;
                                const parsed = raw === '' ? null : Number(raw);
                                const quantity = parsed == null || !Number.isFinite(parsed) ? null : Math.max(0, Math.floor(parsed));
                                patchGiven(group.id, product.productId, quantity, groupIndex === 0);
                              }}
                            />
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              ))
            : (
              <>
                {types.has('promote_product') ? (
                  <CheckRow
                    checked={clientCheckFor(groups[0].id, 'promote')}
                    label={t('completion.promoted')}
                    onChangeAction={(checked) => patchClientCheck(groups[0].id, checked, 'promote')}
                  />
                ) : (
                  <CheckRow
                    checked={clientCheckFor(groups[0].id, 'activation')}
                    label={t('completion.productGiven')}
                    onChangeAction={(checked) => patchClientCheck(groups[0].id, checked, 'activation')}
                  />
                )}
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
              </>
            )}
        </div>
      )}
      {types.has('stock_check') && (
        <div className="grid gap-2">
          {groups.map((group, groupIndex) => (
            <div key={group.id || 'default'} className={group.name ? 'overflow-hidden rounded-lg border border-[#e6e6e6]' : ''}>
              {groupHeader(group, 'stock', t('completion.checked'))}
              {collapsedGroups[group.id] !== true && (
                <div className={`grid gap-2 ${group.name ? 'px-3 pb-3 pt-1' : ''}`}>
                  {!group.name && (
                    <CheckRow
                      checked={clientCheckFor(group.id, 'stock')}
                      label={t('completion.checked')}
                      onChangeAction={(checked) => patchClientCheck(group.id, checked, 'stock')}
                    />
                  )}
                  {stockProducts.map((product) => {
                    const line = stockLineFor(group.id, product.productId, groupIndex === 0);
                    return (
                      <div key={product.productId} className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            patchStock(group.id, product.productId, { checked: !line.checked, counted: line.counted }, groupIndex === 0)
                          }
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
                            patchStock(
                              group.id,
                              product.productId,
                              { checked: line.checked, counted: event.target.value === '' ? null : Number(event.target.value) },
                              groupIndex === 0,
                            )
                          }
                        />
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ))}
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
    return {
      ...shared,
      promoted: completion.promoted === true,
      samples_given: completion.given_counts?.length
        ? completion.given_counts.reduce((sum, line) => sum + line.quantity, 0)
        : completion.samples_given ?? null,
      given_counts: completion.given_counts ?? [],
      client_checks: completion.client_checks ?? [],
    };
  }
  if (jobType === 'stock_check') {
    return {
      ...shared,
      stock_checked: completion.stock_checked,
      stock_counts: (completion.stock_counts ?? []).map((line) => ({
        product_id: line.product_id,
        checked: line.checked,
        counted: line.counted,
        ...(line.client_id ? { client_id: line.client_id } : {}),
      })),
      client_checks: completion.client_checks ?? [],
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
    };
  }
  if (jobType === 'new_product_activation') {
    return {
      ...shared,
      product_given: completion.product_given === true,
      samples_given: completion.given_counts?.length
        ? completion.given_counts.reduce((sum, line) => sum + line.quantity, 0)
        : completion.samples_given ?? null,
      given_counts: completion.given_counts ?? [],
      client_checks: completion.client_checks ?? [],
    };
  }
  return shared;
}
