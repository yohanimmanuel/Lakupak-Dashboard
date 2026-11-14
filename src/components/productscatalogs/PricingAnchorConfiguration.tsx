'use client';

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import type { StockLevel } from '@/types/product';

type PricingAnchorConfigurationProps = {
  stockLevels: StockLevel[];
  sellingPriceUnit: string;
  purchasePriceUnit: string;
  title: string;
  description: string;
  sellingLabel: string;
  purchaseLabel: string;
  disabled?: boolean;
  onChange(kind: 'selling' | 'purchase', unitName: string): void;
};

type PricingUnitKind = 'selling' | 'purchase';

/** Shared product-level pricing anchor controls used by the catalog and import setup. */
export default function PricingAnchorConfiguration({
  stockLevels,
  sellingPriceUnit,
  purchasePriceUnit,
  title,
  description,
  sellingLabel,
  purchaseLabel,
  disabled = false,
  onChange,
}: PricingAnchorConfigurationProps) {
  const [openDropdown, setOpenDropdown] = useState<PricingUnitKind | null>(null);
  const options = stockLevels.filter(
    (level) => level.name.trim().length > 0 && Number.isSafeInteger(level.piecesPerUnit) && level.piecesPerUnit > 0,
  );

  const renderDropdown = (
    kind: PricingUnitKind,
    label: string,
    selectedUnit: string,
  ) => {
    const isOpen = openDropdown === kind;
    const selectedLabel = options.find((level) => level.name === selectedUnit)?.name ?? selectedUnit ?? 'Pieces';

    return (
      <div className="block min-w-0 text-xs font-medium text-gray-700">
        <span className="mb-2 block">{label}</span>
        <div className="relative">
          <button
            type="button"
            onClick={() => setOpenDropdown((current) => (current === kind ? null : kind))}
            disabled={disabled}
            aria-haspopup="listbox"
            aria-expanded={isOpen}
            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs text-left text-black flex items-center justify-between focus:outline-none focus:ring-2 focus:ring-[#0a61d7] focus:border-transparent disabled:bg-gray-50 disabled:cursor-not-allowed"
          >
            <span className="truncate">{selectedLabel}</span>
            <ChevronDown className={`ml-2 h-4 w-4 shrink-0 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
          </button>

          {isOpen && !disabled && (
            <div
              role="listbox"
              aria-label={label}
              className="absolute z-50 mt-1 max-h-60 w-full overflow-y-auto rounded-lg border border-[#e6e6e6] bg-white shadow-lg"
            >
              {options.map((level) => {
                const selected = level.name === selectedUnit;
                return (
                  <button
                    key={`${kind}-${level.name}`}
                    type="button"
                    role="option"
                    aria-selected={selected}
                    onClick={() => {
                      onChange(kind, level.name);
                      setOpenDropdown(null);
                    }}
                    className={`block w-full px-3 py-2 text-left text-xs hover:bg-gray-100 ${
                      selected ? 'font-semibold text-[#0a61d7]' : 'text-gray-700'
                    }`}
                  >
                    {level.name}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <section className="mb-4 rounded-lg border border-[#e6e6e6] bg-white p-4">
      <div className="mb-3">
        <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
        <p className="mt-1 text-xs text-gray-500">{description}</p>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {renderDropdown('selling', sellingLabel, sellingPriceUnit || 'Pieces')}
        {renderDropdown('purchase', purchaseLabel, purchasePriceUnit || 'Pieces')}
      </div>
    </section>
  );
}
