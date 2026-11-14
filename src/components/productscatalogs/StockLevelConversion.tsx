'use client';

import { Info, Plus, X } from 'lucide-react';
import { useProductsTranslations } from '@/hooks/useProductsTranslations';
import type { StockLevel } from '@/types/product';
import {
  getStockLevelFractionLabel,
  getStockLevelRatio,
  getWholeStockQuantity,
  validateStockLevels,
} from '@/utils/stockUtils';

type StockLevelConversionProps = {
  stockLevels: StockLevel[];
  ratioDrafts: Record<number, string>;
  totalPieces: number;
  /** Piece stock for each variation. Packaging availability is calculated per variation, not across variants. */
  stockQuantities?: number[];
  legacyStockUnit?: string | null;
  legacyPiecesPerUnit?: string;
  legacyConversionError?: string;
  isViewMode?: boolean;
  isOfferConnected?: boolean;
  showSummary?: boolean;
  title?: string;
  description?: string;
  onAddStockLevel(): void;
  onUpdateStockLevel(index: number, patch: Partial<StockLevel>): void;
  onRatioDraftChange(index: number, value: string): void;
  onRatioBlur(index: number): void;
  onRemoveStockLevel(index: number): void;
  onLegacyPiecesPerUnitChange?(value: string): void;
  onConvertLegacyStock?(): void;
};

/**
 * Shared stock-level editor. ProductCatalog owns the data and mutations; this
 * component only renders the controls so the catalog remains the source of truth.
 */
export default function StockLevelConversion({
  stockLevels,
  ratioDrafts,
  totalPieces,
  stockQuantities = [],
  legacyStockUnit = null,
  legacyPiecesPerUnit = '',
  legacyConversionError = '',
  isViewMode = false,
  isOfferConnected = false,
  showSummary = true,
  title,
  description,
  onAddStockLevel,
  onUpdateStockLevel,
  onRatioDraftChange,
  onRatioBlur,
  onRemoveStockLevel,
  onLegacyPiecesPerUnitChange,
  onConvertLegacyStock,
}: StockLevelConversionProps) {
  const { tCatalog } = useProductsTranslations();
  const levels = stockLevels.length ? stockLevels : [{ name: 'Pieces', piecesPerUnit: 1 }];
  const validationError = legacyStockUnit ? null : validateStockLevels(levels);

  return (
    <section className="mb-6 rounded-lg border border-[#e6e6e6] bg-white p-4">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">
            {title || tCatalog('variants.stockLevelsTitle')}
          </h3>
          <p className="mt-1 text-xs text-gray-500">
            {description || tCatalog('variants.stockLevelsHint')}
          </p>
        </div>
        {!legacyStockUnit && !isViewMode && !isOfferConnected && (
          <button
            type="button"
            onClick={onAddStockLevel}
            className="inline-flex items-center gap-1 rounded-lg border border-dashed border-[#0a61d7] px-3 py-2 text-xs font-medium text-[#0a61d7] transition-colors hover:bg-blue-50"
          >
            <Plus className="h-3.5 w-3.5" />
            {tCatalog('variants.addStockLevel')}
          </button>
        )}
      </div>

      {legacyStockUnit ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
          <div className="text-xs font-semibold text-amber-900">{tCatalog('variants.legacyStockTitle')}</div>
          <p className="mt-1 text-xs text-amber-800">
            {tCatalog('variants.legacyStockDescription', { unit: legacyStockUnit })}
          </p>
          <div className="mt-3 flex flex-wrap items-end gap-2">
            <label className="text-xs font-medium text-gray-700">
              {tCatalog('variants.legacyRatioLabel', { unit: legacyStockUnit })}
              <input
                type="number"
                min="2"
                step="1"
                value={legacyPiecesPerUnit}
                onChange={(event) => onLegacyPiecesPerUnitChange?.(event.target.value)}
                disabled={isViewMode || isOfferConnected}
                className="mt-1 block w-40 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-black disabled:bg-gray-100"
                placeholder="e.g. 12"
              />
            </label>
            <button
              type="button"
              onClick={onConvertLegacyStock}
              disabled={isViewMode || isOfferConnected || !legacyPiecesPerUnit}
              className="rounded-lg bg-[#0a61d7] px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#0851b8] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {tCatalog('variants.convertLegacyStock')}
            </button>
          </div>
          {legacyConversionError && <p className="mt-2 text-xs text-red-600">{legacyConversionError}</p>}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {levels.map((level, index) => (
            <div key={`stock-level-${index}`} className="flex min-w-0 items-end gap-2 rounded-lg border border-gray-200 bg-gray-50 p-2.5">
              <div className="min-w-0 flex-1">
                <label className="mb-1 block text-[11px] font-medium text-gray-600">
                  {index === 0 ? tCatalog('variants.baseStockLevel') : tCatalog('variants.stockLevelName')}
                </label>
                <input
                  type="text"
                  value={level.name}
                  disabled={index === 0 || isViewMode || isOfferConnected}
                  onChange={(event) => onUpdateStockLevel(index, { name: event.target.value })}
                  className="w-full rounded-md border border-gray-300 bg-white px-2.5 py-2 text-xs text-black disabled:bg-gray-100"
                  placeholder={tCatalog('variants.stockLevelPlaceholder')}
                />
              </div>
              <div className="w-28 shrink-0">
                <label className="mb-1 block text-[11px] font-medium text-gray-600">
                  {index === 0
                    ? tCatalog('variants.piecesPerUnit')
                    : tCatalog('variants.stockRatioLabel', {
                        previous: levels[index - 1]?.name || 'previous level',
                        current: level.name || 'new level',
                      })}
                </label>
                <input
                  type="number"
                  min="2"
                  step="1"
                  value={index === 0 ? '1' : (ratioDrafts[index] ?? (getStockLevelRatio(levels, index) || '').toString())}
                  disabled={index === 0 || isViewMode || isOfferConnected}
                  onChange={(event) => onRatioDraftChange(index, event.target.value)}
                  onBlur={() => onRatioBlur(index)}
                  className="w-full rounded-md border border-gray-300 bg-white px-2.5 py-2 text-xs text-black disabled:bg-gray-100"
                  placeholder={index === 0 ? '1' : 'e.g. 12'}
                />
              </div>
              {index > 0 && !isViewMode && !isOfferConnected && (
                <button
                  type="button"
                  onClick={() => onRemoveStockLevel(index)}
                  className="mb-1 rounded-md p-1.5 text-red-500 transition hover:bg-red-50 hover:text-red-700"
                  aria-label={tCatalog('variants.removeStockLevel')}
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {validationError && <p className="mt-2 text-xs text-red-600">{validationError}</p>}

      {showSummary && !legacyStockUnit && (
        <div className="mt-4 rounded-lg border border-[#0a61d7]/20 bg-blue-50/40 p-3">
          <div className="mb-2 text-sm font-semibold text-gray-900">Stock quantities by level</div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {levels.map((level, index) => {
              const piecesPerUnit = Number(level.piecesPerUnit) || 1;
              // Available stock is calculated per variation so incomplete packages
              // from different variants are never combined.
              const availableQuantity = stockQuantities.reduce((sum, quantity) => {
                const pieces = Number.isFinite(quantity) ? Math.max(0, Math.trunc(quantity)) : 0;
                return sum + getWholeStockQuantity(pieces, piecesPerUnit);
              }, 0);
              // Equivalent stock is the mathematical view of the total piece count.
              const equivalentWhole = getWholeStockQuantity(totalPieces, piecesPerUnit);
              const equivalentRemainder = getStockLevelFractionLabel(totalPieces, piecesPerUnit);

              return (
                <div key={`stock-quantities-${index}`} className="rounded-lg bg-white px-4 py-3 text-center border border-gray-200">
                  <div className="text-xs text-gray-500">{level.name}</div>
                  <div className="mt-1 text-2xl font-bold tabular-nums text-gray-900">
                    {availableQuantity.toLocaleString('en-US')}
                  </div>
                  <div className="mt-2 border-t border-gray-100 pt-2 text-xs text-gray-500">
                    <span className="font-medium text-gray-600">Equivalent = </span>
                    <span className="font-semibold tabular-nums text-gray-700">
                      {equivalentWhole.toLocaleString('en-US')}{equivalentRemainder}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="mt-3 flex items-start gap-2 rounded-md bg-blue-50 px-3 py-2.5 text-xs text-blue-900">
            <Info className="mt-0.5 h-4 w-4 shrink-0" />
            <p>Available quantities count only complete packages within each variation. Equivalents show the mathematical conversion of total piece inventory; both figures describe the same inventory, not separate stock.</p>
          </div>
        </div>
      )}
    </section>
  );
}
