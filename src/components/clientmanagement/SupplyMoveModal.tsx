
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

export type ManualSupplyRecord = {
  id: number;
  sku: string;
  product: string;
  totalSupplied: string;
  totalValue: string;
  lastDelivery: string;
  productId: string | null;
  variantName: string | null;
  targetSupplierName: string;
  recordType: string;
};

type SupplyMoveModalProps = {
  open: boolean;
  candidates: SupplyMoveCandidateRow[];
  currency: string;
  submitting?: boolean;
  onCloseAction: () => void;
  onConfirmAction: (
    variants: Array<{ productId: string; variantName: string }>
  ) => void | Promise<void>;

  mode?: 'automatic' | 'manual';
  manualRecords?: ManualSupplyRecord[];
  manualEnabled?: boolean;
  onManualConfirmAction?: (
    recordIds: number[],
  ) => void | Promise<void>;
};

function candidateKey(
  row: Pick<SupplyMoveCandidateRow, 'productId' | 'variantName'>
): string {
  return `${row.productId}|${row.variantName}`;
}

// Identify opening balances consistently for sorting and display.
function isOpeningBalance(row: ManualSupplyRecord): boolean {
  const type = String(row.recordType || '').trim().toLowerCase();

  return type === 'summary' || type === 'opening';
}

export default function SupplyMoveModal({
  open,
  candidates,
  currency,
  submitting = false,
  onCloseAction,
  onConfirmAction,
  mode = 'automatic',
  manualRecords = [],
  manualEnabled = false,
  onManualConfirmAction,
}: SupplyMoveModalProps) {
  const { tSuppliersProfile } = useClientsTranslations();

  // Existing automatic transfer selection.
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(candidates.map(candidateKey)),
  );

  // Manual transfer selection.
  const [selectedRecordIds, setSelectedRecordIds] =
    useState<Set<number>>(new Set());

  // Preserve automatic selection behavior.
  useEffect(() => {
    if (!open || mode !== 'automatic') return;
    setSelected(new Set(candidates.map(candidateKey)));
  }, [open, candidates, mode]);

  // Reset manual selection whenever manual mode opens.
  useEffect(() => {
    if (!open || mode !== 'manual') return;

    setSelectedRecordIds(new Set());
  }, [open, mode]);

  const selectedRows = useMemo(
    () => candidates.filter((row) => selected.has(candidateKey(row))),
    [candidates, selected],
  );

  const allSelected =
    candidates.length > 0 &&
    selectedRows.length === candidates.length;

  const someSelected =
    selectedRows.length > 0 && !allSelected;

  const selectedManualRecords = useMemo(
    () => manualRecords.filter((row) => selectedRecordIds.has(row.id)),
    [manualRecords, selectedRecordIds],
  );

  // Opening balances first, followed by newest supply history.
  const sortedManualRecords = useMemo(() => {
    return [...manualRecords].sort((a, b) => {
      const aOpening = isOpeningBalance(a);
      const bOpening = isOpeningBalance(b);

      if (aOpening !== bOpening) {
        return aOpening ? -1 : 1;
      }

      // Opening balances grouped by SKU and product.
      if (aOpening && bOpening) {
        return (
          a.sku.localeCompare(b.sku) ||
          a.product.localeCompare(b.product) ||
          a.id - b.id
        );
      }

      // Historical supplies sorted by most recent date.
      const dateCompare = (b.lastDelivery || '').localeCompare(
        a.lastDelivery || ''
      );

      return dateCompare || a.id - b.id;
    });
  }, [manualRecords]);

  const allManualSelected =
    manualRecords.length > 0 &&
    selectedManualRecords.length === manualRecords.length;

  const someManualSelected =
    selectedManualRecords.length > 0 && !allManualSelected;

  const toggleRow = (key: string) => {
    if (submitting) return;

    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleAll = () => {
    if (submitting) return;

    setSelected(
      allSelected
        ? new Set()
        : new Set(candidates.map(candidateKey)),
    );
  };

  const toggleManualRow = (id: number) => {
    if (submitting) return;

    setSelectedRecordIds((prev) => {
      const next = new Set(prev);

      if (next.has(id)) {
        next.delete(id);
      } else {
        const target = manualRecords.find(
          (row) => row.id === id
        )?.targetSupplierName;

        if (
          prev.size &&
          selectedManualRecords[0]?.targetSupplierName !== target
        ) {
          return prev;
        }

        next.add(id);
      }

      return next;
    });
  };

  const toggleAllManual = () => {
    if (submitting) return;

    setSelectedRecordIds(
      allManualSelected
        ? new Set()
        : new Set(
            manualRecords
              .filter(
                (row) =>
                  row.targetSupplierName ===
                  manualRecords[0]?.targetSupplierName
              )
              .map((row) => row.id)
          ),
    );
  };

  const handleManualConfirm = () => {
    if (
      !manualEnabled ||
      submitting ||
      selectedManualRecords.length === 0 ||
      !onManualConfirmAction
    ) {
      return;
    }

    void onManualConfirmAction(
      selectedManualRecords.map((row) => row.id)
    );
  };

  if (!open) return null;

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

        <p className="mb-3 text-sm text-gray-600">
          {mode === 'manual'
            ? 'Select supply history or opening balances to move to the supplier assigned in the Product Catalog.'
            : tSuppliersProfile('supplyMoveHint')}
        </p>

        {mode === 'automatic' ? (
          <>
            {/* Existing automatic selection controls */}
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm text-gray-700">
                {tSuppliersProfile('supplyMoveSelected', {
                  selected: selectedRows.length,
                  total: candidates.length,
                })}
              </span>

              <div className="flex items-center gap-2">
                <ImportSelectionCheckbox
                  checked={allSelected}
                  indeterminate={someSelected}
                  onToggle={toggleAll}
                  ariaLabel={
                    allSelected
                      ? tSuppliersProfile('deselectAll')
                      : tSuppliersProfile('selectAll')
                  }
                />

                <button
                  type="button"
                  className="text-sm font-medium text-gray-700 hover:text-black"
                  onClick={toggleAll}
                  disabled={submitting}
                >
                  {allSelected
                    ? tSuppliersProfile('deselectAll')
                    : tSuppliersProfile('selectAll')}
                </button>
              </div>
            </div>

            {/* Existing automatic transfer table */}
            <div className="max-h-[360px] overflow-auto rounded-lg border border-gray-200">
              <table className="min-w-full bg-white text-left text-xs font-medium">
                <thead className="sticky top-0 z-10">
                  <tr className="whitespace-nowrap bg-gray-100 text-gray-500">
                    <th className="w-12 px-3 py-2">
                      <ImportSelectionCheckbox
                        checked={allSelected}
                        indeterminate={someSelected}
                        onToggle={toggleAll}
                        ariaLabel={
                          allSelected
                            ? tSuppliersProfile('deselectAll')
                            : tSuppliersProfile('selectAll')
                        }
                      />
                    </th>
                    <th className="px-3 py-2 font-medium uppercase">
                      {tSuppliersProfile('skuNumber')}
                    </th>
                    <th className="px-3 py-2 font-medium uppercase">
                      {tSuppliersProfile('productName')}
                    </th>
                    <th className="px-3 py-2 font-medium uppercase">
                      {tSuppliersProfile('supplyMoveTarget')}
                    </th>
                    <th className="px-3 py-2 font-medium uppercase">
                      {tSuppliersProfile('supplyMoveHistoryCount')}
                    </th>
                    <th className="px-3 py-2 font-medium uppercase">
                      {tSuppliersProfile('totalSuppliedCol')}
                    </th>
                    <th className="px-3 py-2 font-medium uppercase">
                      {tSuppliersProfile('totalPurchaseCol')}
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {candidates.length === 0 ? (
                    <tr>
                      <td
                        colSpan={7}
                        className="px-4 py-8 text-center text-sm text-gray-500"
                      >
                        No supply transfers are currently available.
                      </td>
                    </tr>
                  ) : (
                    candidates.map((row) => {
                      const key = candidateKey(row);
                      const isSelected = selected.has(key);

                      return (
                        <tr
                          key={key}
                          onClick={() => toggleRow(key)}
                          className={`cursor-pointer whitespace-nowrap ${
                            isSelected
                              ? 'text-black hover:bg-blue-50/40'
                              : 'bg-gray-50 text-black opacity-50 hover:bg-gray-100'
                          }`}
                        >
                          <td
                            className="px-3 py-2"
                            onClick={(event) => event.stopPropagation()}
                          >
                            <ImportSelectionCheckbox
                              checked={isSelected}
                              onToggle={() => toggleRow(key)}
                              ariaLabel={tSuppliersProfile(
                                'supplyMoveSelectRow',
                                { sku: row.sku },
                              )}
                            />
                          </td>
                          <td className="px-3 py-2 font-semibold">
                            {row.sku || '—'}
                          </td>
                          <td className="px-3 py-2">
                            {row.productLabel || '—'}
                          </td>
                          <td className="px-3 py-2 text-[#0a61d7]">
                            {row.targetSupplierName}
                          </td>
                          <td className="px-3 py-2">
                            {row.historyCount}
                          </td>
                          <td className="px-3 py-2">
                            {row.totalSupplied}
                          </td>
                          <td className="px-3 py-2">
                            {formatCurrency(row.totalValue, currency)}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Existing automatic transfer actions */}
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

                {tSuppliersProfile('supplyMoveConfirm', {
                  count: selectedRows.length,
                })}
              </button>
            </div>
          </>
        ) : (
          <>
            {/* Manual transfer selection controls */}
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm text-gray-700">
                {selectedManualRecords.length} of {manualRecords.length} selected
              </span>

              <div className="flex items-center gap-2">
                <ImportSelectionCheckbox
                  checked={allManualSelected}
                  indeterminate={someManualSelected}
                  onToggle={toggleAllManual}
                  ariaLabel={
                    allManualSelected
                      ? tSuppliersProfile('deselectAll')
                      : tSuppliersProfile('selectAll')
                  }
                />

                <button
                  type="button"
                  className="text-sm font-medium text-gray-700 hover:text-black"
                  onClick={toggleAllManual}
                  disabled={submitting}
                >
                  {allManualSelected
                    ? tSuppliersProfile('deselectAll')
                    : tSuppliersProfile('selectAll')}
                </button>
              </div>
            </div>

            {/* Manual transfer records */}
            <div className="max-h-[360px] overflow-auto rounded-lg border border-gray-200">
              <table className="min-w-full bg-white text-left text-xs font-medium">
                <thead className="sticky top-0 z-10">
                  <tr className="whitespace-nowrap bg-gray-100 text-gray-500">
                    <th className="w-12 px-3 py-2">Select</th>
                    <th className="px-3 py-2 font-medium uppercase">
                      {tSuppliersProfile('skuNumber')}
                    </th>
                    <th className="px-3 py-2 font-medium uppercase">
                      {tSuppliersProfile('productName')}
                    </th>
                    <th className="px-3 py-2 font-medium uppercase">
                      {tSuppliersProfile('totalSuppliedCol')}
                    </th>
                    <th className="px-3 py-2 font-medium uppercase">
                      {tSuppliersProfile('totalPurchaseCol')}
                    </th>
                    <th className="px-3 py-2 font-medium uppercase">
                      Date
                    </th>
                    <th className="px-3 py-2 font-medium uppercase">
                      Move to
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {manualRecords.length === 0 ? (
                    <tr>
                      <td
                        colSpan={7}
                        className="px-4 py-8 text-center text-sm text-gray-500"
                      >
                        No supply records available for transfer.
                      </td>
                    </tr>
                  ) : (
                    sortedManualRecords.map((row) => {
                      const isSelected = selectedRecordIds.has(row.id);

                      return (
                        <tr
                          key={row.id}
                          onClick={() => toggleManualRow(row.id)}
                          className={`cursor-pointer whitespace-nowrap ${
                            isSelected
                              ? 'text-black hover:bg-blue-50/40'
                              : 'bg-gray-50 text-black opacity-50 hover:bg-gray-100'
                          }`}
                        >
                          <td
                            className="px-3 py-2"
                            onClick={(event) => event.stopPropagation()}
                          >
                            <ImportSelectionCheckbox
                              checked={isSelected}
                              onToggle={() => toggleManualRow(row.id)}
                              ariaLabel={`Select ${row.sku}`}
                            />
                          </td>
                          <td className="px-3 py-2 font-semibold">
                            {row.sku || '—'}
                          </td>
                          <td className="px-3 py-2">
                            {row.product || '—'}
                          </td>
                          <td className="px-3 py-2">
                            {row.totalSupplied}
                          </td>
                          <td className="px-3 py-2">
                            {formatCurrency(
                              Number(row.totalValue) || 0,
                              currency,
                            )}
                          </td>
                          <td className="px-3 py-2">
                            {isOpeningBalance(row)
                              ? 'Opening balance'
                              : (row.lastDelivery || '—')}
                          </td>
                          <td className="px-3 py-2 text-[#0a61d7]">
                            {row.targetSupplierName}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            <p className="mt-3 text-xs text-gray-600">
              Destination suppliers are assigned in the Product Catalog. To change a destination, edit the product's supplier there.
              {selectedManualRecords.length > 0 && (
                <span className="mt-1 block font-semibold text-[#0a61d7]">
                  Selected records will move to: {selectedManualRecords[0].targetSupplierName}
                </span>
              )}
            </p>

            {/* Manual transfer actions */}
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
                disabled={
                  !manualEnabled ||
                  submitting ||
                  selectedManualRecords.length === 0 ||
                  !onManualConfirmAction
                }
                onClick={handleManualConfirm}
              >
                {submitting ? (
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                ) : (
                  <CheckCircle2 className="h-4 w-4" />
                )}

                {tSuppliersProfile('supplyMoveConfirm', {
                  count: selectedManualRecords.length,
                })}
              </button>
            </div>
          </>
        )}
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

        <span>
          {tSuppliersProfile('supplyMoveNotice', { count })}
        </span>
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
