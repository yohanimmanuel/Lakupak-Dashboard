'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { AlertCircle, CheckCircle2, X } from 'lucide-react';
import ImportSelectionCheckbox from '@/components/clientmanagement/ImportSelectionCheckbox';
import { useClientsTranslations } from '@/hooks/useClientsTranslations';
import { formatCurrency } from '@/utils/currencyUtils';

export type SupplyMoveCandidateRow = {
  productId: string;
  variantName: string;
  sku: string;
  productLabel: string;
  targetSupplierName: string;
  historyCount: number;
  totalSupplied: number;
  totalValue: number;
};

type SupplyMoveModalProps = {
  open: boolean;
  candidates: SupplyMoveCandidateRow[];
  currency: string;
  submitting?: boolean;
  onCloseAction: () => void;
  onConfirmAction: (variants: Array<{ productId: string; variantName: string }>) => void | Promise<void>;
};

function candidateKey(row: Pick<SupplyMoveCandidateRow, 'productId' | 'variantName'>): string {
  return `${row.productId}|${row.variantName}`;
}

export default function SupplyMoveModal({
  open,
  candidates,
  currency,
  submitting = false,
  onCloseAction,
  onConfirmAction,
}: SupplyMoveModalProps) {
  const { tSuppliersProfile } = useClientsTranslations();
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(candidates.map(candidateKey)),
  );

  useEffect(() => {
    if (!open) return;
    setSelected(new Set(candidates.map(candidateKey)));
  }, [open, candidates]);

  const allSelected = candidates.length > 0 && selected.size === candidates.length;
  const someSelected = selected.size > 0 && !allSelected;

  const selectedRows = useMemo(
    () => candidates.filter((row) => selected.has(candidateKey(row))),
    [candidates, selected],
  );

  if (!open) return null;

  const toggleRow = (key: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleAll = () => {
    setSelected(allSelected ? new Set() : new Set(candidates.map(candidateKey)));
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
      <div className="relative w-full max-w-3xl rounded-2xl border border-[#e6e6e6] bg-white p-4 shadow-lg">
        <button
          type="button"
          className="absolute right-3 top-3 rounded-full p-2 hover:bg-gray-100"
          onClick={onCloseAction}
          disabled={submitting}
          aria-label={tSuppliersProfile('supplyMoveClose')}
        >
          <X className="h-5 w-5 text-black" />
        </button>
        <h2 className="mb-1 border-b border-[#e6e6e6] pb-2 pr-10 text-lg font-bold text-black">
          {tSuppliersProfile('supplyMoveTitle')}
        </h2>
        <p className="mb-3 text-sm text-gray-600">{tSuppliersProfile('supplyMoveHint')}</p>

        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <span className="text-sm text-gray-700">
            {tSuppliersProfile('supplyMoveSelected', {
              selected: selected.size,
              total: candidates.length,
            })}
          </span>
          <div className="flex items-center gap-2">
            <ImportSelectionCheckbox
              checked={allSelected}
              indeterminate={someSelected}
              onToggle={toggleAll}
              ariaLabel={allSelected ? tSuppliersProfile('deselectAll') : tSuppliersProfile('selectAll')}
            />
            <button
              type="button"
              className="text-sm font-medium text-gray-700 hover:text-black"
              onClick={toggleAll}
            >
              {allSelected ? tSuppliersProfile('deselectAll') : tSuppliersProfile('selectAll')}
            </button>
          </div>
        </div>

        <div className="max-h-[360px] overflow-auto rounded-lg border border-gray-200">
          <table className="min-w-full bg-white text-left text-xs font-medium">
            <thead className="sticky top-0 z-10">
              <tr className="whitespace-nowrap bg-gray-100 text-gray-500">
                <th className="w-12 px-3 py-2">
                  <ImportSelectionCheckbox
                    checked={allSelected}
                    indeterminate={someSelected}
                    onToggle={toggleAll}
                    ariaLabel={allSelected ? tSuppliersProfile('deselectAll') : tSuppliersProfile('selectAll')}
                  />
                </th>
                <th className="px-3 py-2 font-medium uppercase">{tSuppliersProfile('skuNumber')}</th>
                <th className="px-3 py-2 font-medium uppercase">{tSuppliersProfile('productName')}</th>
                <th className="px-3 py-2 font-medium uppercase">{tSuppliersProfile('supplyMoveTarget')}</th>
                <th className="px-3 py-2 font-medium uppercase">{tSuppliersProfile('supplyMoveHistoryCount')}</th>
                <th className="px-3 py-2 font-medium uppercase">{tSuppliersProfile('totalSuppliedCol')}</th>
                <th className="px-3 py-2 font-medium uppercase">{tSuppliersProfile('totalPurchaseCol')}</th>
              </tr>
            </thead>
            <tbody>
              {candidates.map((row) => {
                const key = candidateKey(row);
                const isSelected = selected.has(key);
                return (
                  <tr
                    key={key}
                    onClick={() => toggleRow(key)}
                    className={`cursor-pointer whitespace-nowrap ${
                      isSelected ? 'text-black hover:bg-blue-50/40' : 'bg-gray-50 text-black opacity-50 hover:bg-gray-100'
                    }`}
                  >
                    <td className="px-3 py-2">
                      <ImportSelectionCheckbox
                        checked={isSelected}
                        onToggle={() => toggleRow(key)}
                        ariaLabel={tSuppliersProfile('supplyMoveSelectRow', { sku: row.sku })}
                      />
                    </td>
                    <td className="px-3 py-2 font-semibold">{row.sku || '—'}</td>
                    <td className="px-3 py-2">{row.productLabel || '—'}</td>
                    <td className="px-3 py-2 text-[#0a61d7]">{row.targetSupplierName}</td>
                    <td className="px-3 py-2">{row.historyCount}</td>
                    <td className="px-3 py-2">{row.totalSupplied}</td>
                    <td className="px-3 py-2">{formatCurrency(row.totalValue, currency)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-end gap-2 border-t border-gray-200 pt-4 text-sm">
          <button
            type="button"
            className="rounded-lg bg-gray-100 px-4 py-2 font-medium text-gray-700 hover:bg-gray-200 disabled:opacity-50"
            onClick={onCloseAction}
            disabled={submitting}
          >
            {tSuppliersProfile('supplyMoveCancel')}
          </button>
          <button
            type="button"
            className="flex items-center gap-2 rounded-lg bg-[#0a61d7] px-4 py-2 font-semibold text-white hover:bg-[#084ba6] disabled:opacity-60"
            disabled={submitting || selectedRows.length === 0}
            onClick={() =>
              onConfirmAction(
                selectedRows.map((row) => ({
                  productId: row.productId,
                  variantName: row.variantName,
                })),
              )
            }
          >
            {submitting ? (
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
            ) : (
              <CheckCircle2 className="h-4 w-4" />
            )}
            {tSuppliersProfile('supplyMoveConfirm', { count: selectedRows.length })}
          </button>
        </div>
      </div>
    </div>
  );
}

export function SupplyMoveNotice({
  count,
  onReviewAction,
}: {
  count: number;
  onReviewAction: () => void;
}) {
  const { tSuppliersProfile } = useClientsTranslations();
  if (count <= 0) return null;
  return (
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3">
      <div className="flex items-start gap-2 text-sm text-amber-900">
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
        <span>{tSuppliersProfile('supplyMoveNotice', { count })}</span>
      </div>
      <button
        type="button"
        className="rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-amber-900 transition hover:bg-amber-100"
        onClick={onReviewAction}
      >
        {tSuppliersProfile('supplyMoveReview')}
      </button>
    </div>
  );
}
