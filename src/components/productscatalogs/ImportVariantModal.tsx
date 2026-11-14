import { ArrowRight, X } from 'lucide-react';
import type { StockLevel } from '../../types/product';
import { useProductsTranslations } from '@/hooks/useProductsTranslations';
import StockLevelConversion from '@/components/productscatalogs/StockLevelConversion';
import PricingAnchorConfiguration from '@/components/productscatalogs/PricingAnchorConfiguration';

type ImportVariantModalProps = {
  open: boolean;
  stockLevels: StockLevel[];
  sellingPriceUnit: string;
  purchasePriceUnit: string;
  onPriceAnchorChange(kind: 'selling' | 'purchase', unitName: string): void;
  ratioDrafts: Record<number, string>;
  totalPieces: number;
  legacyStockUnit?: string | null;
  legacyPiecesPerUnit?: string;
  legacyConversionError?: string;
  isOfferConnected?: boolean;
  onAddStockLevel(): void;
  onUpdateStockLevel(index: number, patch: Partial<StockLevel>): void;
  onRatioDraftChange(index: number, value: string): void;
  onRatioBlur(index: number): void;
  onRemoveStockLevel(index: number): void;
  onLegacyPiecesPerUnitChange?(value: string): void;
  onConvertLegacyStock?(): void;
  onCancel(): void;
  onContinue(): void;
};

/**
 * Import preparation step. Users confirm or adjust the same chained stock ratios
 * used by the catalog before the spreadsheet column-mapping modal opens.
 */
export default function ImportVariantModal({
  open,
  stockLevels,
  sellingPriceUnit,
  purchasePriceUnit,
  onPriceAnchorChange,
  ratioDrafts,
  totalPieces,
  legacyStockUnit = null,
  legacyPiecesPerUnit = '',
  legacyConversionError = '',
  isOfferConnected = false,
  onAddStockLevel,
  onUpdateStockLevel,
  onRatioDraftChange,
  onRatioBlur,
  onRemoveStockLevel,
  onLegacyPiecesPerUnitChange,
  onConvertLegacyStock,
  onCancel,
  onContinue,
}: ImportVariantModalProps) {
  const { tCatalog } = useProductsTranslations();
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
      <div className="relative max-h-[90vh] w-full max-w-5xl overflow-y-auto rounded-2xl border border-[#e6e6e6] bg-white p-5 shadow-xl">
        <button
          type="button"
          onClick={onCancel}
          className="absolute right-3 top-3 rounded-full p-2 text-gray-500 transition hover:bg-gray-100 hover:text-gray-800"
          aria-label="Close import preparation"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="mb-4 pr-10">
          <h2 className="text-lg font-semibold text-gray-900">{tCatalog('variants.importStockRatiosTitle')}</h2>
          <p className="mt-1 text-sm text-gray-600">
            {tCatalog('variants.importStockRatiosDescription')}
          </p>
        </div>

        <StockLevelConversion
          stockLevels={stockLevels}
          ratioDrafts={ratioDrafts}
          totalPieces={totalPieces}
          legacyStockUnit={legacyStockUnit}
          legacyPiecesPerUnit={legacyPiecesPerUnit}
          legacyConversionError={legacyConversionError}
          isViewMode={false}
          isOfferConnected={isOfferConnected}
          showSummary={false}
          title={tCatalog('variants.stockLevelsTitle')}
          description={tCatalog('variants.stockLevelsHint')}
          onAddStockLevel={onAddStockLevel}
          onUpdateStockLevel={onUpdateStockLevel}
          onRatioDraftChange={onRatioDraftChange}
          onRatioBlur={onRatioBlur}
          onRemoveStockLevel={onRemoveStockLevel}
          onLegacyPiecesPerUnitChange={onLegacyPiecesPerUnitChange}
          onConvertLegacyStock={onConvertLegacyStock}
        />

        <PricingAnchorConfiguration
          stockLevels={stockLevels}
          sellingPriceUnit={sellingPriceUnit}
          purchasePriceUnit={purchasePriceUnit}
          title={tCatalog('variants.pricingConfigurationTitle')}
          description={tCatalog('variants.importPriceAnchorsDescription')}
          sellingLabel={tCatalog('variants.sellingPriceUnit')}
          purchaseLabel={tCatalog('variants.purchasePriceUnit')}
          disabled={isOfferConnected || Boolean(legacyStockUnit)}
          onChange={onPriceAnchorChange}
        />

        <div className="mt-3 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2.5 text-xs leading-5 text-blue-900">
          {tCatalog('variants.importStockRatiosNote')}
          {' '}{tCatalog('variants.importPriceAnchorsNote', { sellingUnit: sellingPriceUnit, purchaseUnit: purchasePriceUnit })}
        </div>

        <div className="mt-5 flex justify-end gap-2 border-t border-gray-200 pt-4">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
          >
            {tCatalog('variants.cancelImport')}
          </button>
          <button
            type="button"
            onClick={onContinue}
            disabled={Boolean(legacyStockUnit) || Boolean(isOfferConnected)}
            className="inline-flex items-center gap-2 rounded-lg bg-[#0a61d7] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#084ba6] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {tCatalog('variants.continueToColumnMapping')}
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
