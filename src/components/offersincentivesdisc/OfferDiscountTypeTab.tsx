'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Percent, Gift, ChevronDown, Check, DollarSign } from 'lucide-react';
import type { OfferStatus } from '@/types/offer';
import { useOffersTranslations } from '@/hooks/useOffersTranslations';
import { formatCurrency, getCurrencySymbol, getDefaultCurrency } from '@/utils/currencyUtils';
import { useUserStore } from '@/store/userStore';

export type ProductSelection = {
  productId: string;
  variantScope: 'entire' | 'specific';
  /** Empty when variantScope is entire. */
  variantOptionIds: number[];
};

export type OfferWizardFormData = {
  buyerId: string;
  /** One or more products this rate applies to (each with its own variant scope). */
  productSelections: ProductSelection[];
  enablePriceDiscount: boolean;
  enableBuyXGetY: boolean;
  priceDiscountMode: 'percentage' | 'fixed_amount';
  /** Price discount value when enablePriceDiscount; also free Y when ONLY bxgy (legacy). */
  discountValue: string;
  buyQuantity: string;
  freeQuantity: string;
  /** from_zero counts free pieces before MOQ. after_moq counts only above MOQ. */
  promotionApplyMode: 'from_zero' | 'after_moq';
  startDate: string;
  endDate: string;
  unlimitedEnd: boolean;
  status: OfferStatus;
  notes: string;
};

type Props = {
  formData: OfferWizardFormData;
  onFormChangeAction: (updates: Partial<OfferWizardFormData>) => void;
};

const STATUS_OPTIONS: OfferStatus[] = ['draft', 'active'];

const fieldClass =
  'w-full px-3 py-2 text-black text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0a61d7] focus:border-transparent';
const labelClass = 'block text-xs font-medium text-gray-700 mb-2';

function GreenCheckbox({ checked }: { checked: boolean }) {
  return (
    <span
      className={`w-4 h-4 shrink-0 border-2 rounded transition-all flex items-center justify-center ${
        checked ? 'bg-green-500 border-green-500' : 'bg-white border-gray-300'
      }`}
    >
      {checked && <Check className="w-3 h-3 text-white" />}
    </span>
  );
}

export default function OfferDiscountTypeTab({
  formData,
  onFormChangeAction,
}: Props) {
  const { tCreatePage, tTypeModal, translateOfferStatus } = useOffersTranslations();
  const user = useUserStore((s) => s.user);
  const currency = user?.currency || getDefaultCurrency();
  const currencySymbol = getCurrencySymbol(currency);
  const [showStatusDropdown, setShowStatusDropdown] = useState(false);
  const statusRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onOutside = (e: MouseEvent) => {
      if (statusRef.current && !statusRef.current.contains(e.target as Node)) {
        setShowStatusDropdown(false);
      }
    };
    document.addEventListener('mousedown', onOutside);
    return () => document.removeEventListener('mousedown', onOutside);
  }, []);

  const togglePrice = () => {
    const next = !formData.enablePriceDiscount;
    // Must keep at least one enabled
    if (!next && !formData.enableBuyXGetY) return;
    onFormChangeAction({ enablePriceDiscount: next });
  };

  const toggleBxgy = () => {
    const next = !formData.enableBuyXGetY;
    if (!next && !formData.enablePriceDiscount) return;
    onFormChangeAction({ enableBuyXGetY: next });
  };

  const discountValueNum = Number.parseFloat(formData.discountValue) || 0;

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-gray-900 mb-1">
          {tCreatePage('discountTabTitle')}
        </h3>
        <p className="text-sm text-gray-500">{tCreatePage('discountTabSubtitle')}</p>
      </div>

      <div className="space-y-2">
        <h4 className="text-md font-semibold text-black">
          {tTypeModal('discountTypeSection')} <span className="text-red-500">*</span>
        </h4>
        <p className="text-xs text-gray-500 mb-1">{tCreatePage('enableBothHint')}</p>
        <div className="grid grid-cols-1 gap-3">
          {/* Percentage / Fixed Amount */}
          <div
            className={`rounded-lg border-2 transition-all ${
              formData.enablePriceDiscount
                ? 'border-blue-200 bg-blue-50'
                : 'border-gray-200 bg-white'
            }`}
          >
            <button
              type="button"
              onClick={togglePrice}
              className="w-full p-3 text-left"
            >
              <div className="flex items-center gap-3 text-sm">
                <GreenCheckbox checked={formData.enablePriceDiscount} />
                <div
                  className={
                    formData.enablePriceDiscount ? 'text-blue-700' : 'text-gray-500'
                  }
                >
                  <Percent className="w-5 h-5" />
                </div>
                <div>
                  <div
                    className={`font-medium ${
                      formData.enablePriceDiscount ? 'text-blue-700' : 'text-black'
                    }`}
                  >
                    {tTypeModal('percentageFixedLabel')}
                  </div>
                  <div className="text-xs text-gray-500">
                    {tTypeModal('percentageFixedDesc')}
                  </div>
                </div>
              </div>
            </button>

            {formData.enablePriceDiscount && (
              <div className="px-3 pb-3 space-y-3 border-t border-blue-100 pt-3">
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => onFormChangeAction({ priceDiscountMode: 'percentage' })}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg border-2 text-xs font-medium transition-all ${
                      formData.priceDiscountMode === 'percentage'
                        ? 'border-blue-300 bg-white text-blue-700'
                        : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                    }`}
                  >
                    <GreenCheckbox
                      checked={formData.priceDiscountMode === 'percentage'}
                    />
                    <Percent className="w-3.5 h-3.5" />
                    {tTypeModal('priceModePercentage')}
                  </button>
                  <button
                    type="button"
                    onClick={() => onFormChangeAction({ priceDiscountMode: 'fixed_amount' })}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg border-2 text-xs font-medium transition-all ${
                      formData.priceDiscountMode === 'fixed_amount'
                        ? 'border-blue-300 bg-white text-blue-700'
                        : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                    }`}
                  >
                    <GreenCheckbox
                      checked={formData.priceDiscountMode === 'fixed_amount'}
                    />
                    <DollarSign className="w-3.5 h-3.5" />
                    {tTypeModal('priceModeFixed')}
                  </button>
                </div>

                <div>
                  <label className={labelClass}>
                    {formData.priceDiscountMode === 'percentage'
                      ? tTypeModal('discountPercentage')
                      : tTypeModal('discountAmount')}{' '}
                    <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      className={`${fieldClass} pr-12`}
                      value={formData.discountValue}
                      onChange={(e) => onFormChangeAction({ discountValue: e.target.value })}
                      placeholder={
                        formData.priceDiscountMode === 'percentage' ? '15' : '50000'
                      }
                    />
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 text-xs">
                      {formData.priceDiscountMode === 'percentage' ? '%' : currencySymbol}
                    </div>
                  </div>
                  {formData.priceDiscountMode === 'fixed_amount' &&
                    discountValueNum > 0 && (
                      <p className="mt-2 text-xs text-gray-600">
                        {tTypeModal('previewDiscount', {
                          value: formatCurrency(discountValueNum, currency),
                        })}
                      </p>
                    )}
                </div>
              </div>
            )}
          </div>

          {/* Buy X Get Y */}
          <div
            className={`rounded-lg border-2 transition-all ${
              formData.enableBuyXGetY
                ? 'border-purple-200 bg-purple-50'
                : 'border-gray-200 bg-white'
            }`}
          >
            <button
              type="button"
              onClick={toggleBxgy}
              className="w-full p-3 text-left"
            >
              <div className="flex items-center gap-3 text-sm">
                <GreenCheckbox checked={formData.enableBuyXGetY} />
                <div
                  className={
                    formData.enableBuyXGetY ? 'text-purple-700' : 'text-gray-500'
                  }
                >
                  <Gift className="w-5 h-5" />
                </div>
                <div>
                  <div
                    className={`font-medium ${
                      formData.enableBuyXGetY ? 'text-purple-700' : 'text-black'
                    }`}
                  >
                    {tTypeModal('buyXGetYLabel')}
                  </div>
                  <div className="text-xs text-gray-500">
                    {tTypeModal('buyXGetYDesc')}
                  </div>
                </div>
              </div>
            </button>

            {formData.enableBuyXGetY && (
              <div className="px-3 pb-3 space-y-3 border-t border-purple-100 pt-3">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className={labelClass}>
                      {tTypeModal('minPackagesToBuy')}{' '}
                      <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="number"
                      min="1"
                      step="1"
                      className={fieldClass}
                      value={formData.buyQuantity}
                      onChange={(e) => onFormChangeAction({ buyQuantity: e.target.value })}
                      placeholder="3"
                    />
                    <p className="mt-2 text-xs text-gray-600">
                      {tTypeModal('minPackagesHint')}
                    </p>
                  </div>
                  <div>
                    <label className={labelClass}>
                      {tCreatePage('freeQuantity') || tTypeModal('freePackages')}{' '}
                      <span className="text-red-500">*</span>
                    </label>
                    <div className="relative">
                      <input
                        type="number"
                        min="1"
                        step="1"
                        className={`${fieldClass} pr-16`}
                        value={formData.freeQuantity}
                        onChange={(e) => onFormChangeAction({ freeQuantity: e.target.value })}
                        placeholder="1"
                      />
                      <div className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 text-xs">
                        {tTypeModal('packagesUnit')}
                      </div>
                    </div>
                  </div>
                </div>
                <div>
                  <p className={labelClass}>{tTypeModal('countFreePiecesLabel')}</p>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => onFormChangeAction({ promotionApplyMode: 'from_zero' })}
                      className={`flex items-center gap-2 px-3 py-2 rounded-lg border-2 text-xs font-medium transition-all ${
                        formData.promotionApplyMode === 'from_zero'
                          ? 'border-purple-300 bg-white text-purple-700'
                          : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                      }`}
                    >
                      <GreenCheckbox checked={formData.promotionApplyMode === 'from_zero'} />
                      {tTypeModal('countFreeBeforeMoq')}
                    </button>
                    <button
                      type="button"
                      onClick={() => onFormChangeAction({ promotionApplyMode: 'after_moq' })}
                      className={`flex items-center gap-2 px-3 py-2 rounded-lg border-2 text-xs font-medium transition-all ${
                        formData.promotionApplyMode === 'after_moq'
                          ? 'border-purple-300 bg-white text-purple-700'
                          : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                      }`}
                    >
                      <GreenCheckbox checked={formData.promotionApplyMode === 'after_moq'} />
                      {tTypeModal('countFreeAfterMoq')}
                    </button>
                  </div>
                  <p className="mt-2 text-xs text-gray-600">{tTypeModal('countFreePiecesHint')}</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className={labelClass}>
            {tCreatePage('status')} <span className="text-red-500">*</span>
          </label>
          <div className="relative" ref={statusRef}>
            <button
              type="button"
              onClick={() => setShowStatusDropdown((v) => !v)}
              className="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg text-left flex items-center justify-between focus:outline-none focus:ring-2 focus:ring-[#0a61d7] focus:border-transparent bg-white"
            >
              <span className={formData.status ? 'text-black' : 'text-gray-500'}>
                {formData.status
                  ? translateOfferStatus(formData.status)
                  : tCreatePage('selectStatus')}
              </span>
              <ChevronDown className="w-4 h-4 text-gray-400" />
            </button>
            {showStatusDropdown && (
              <div className="absolute z-50 w-full mt-1 bg-white border border-[#e6e6e6] rounded-lg shadow-lg max-h-40 overflow-y-auto">
                {STATUS_OPTIONS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => {
                      onFormChangeAction({ status: s });
                      setShowStatusDropdown(false);
                    }}
                    className={`w-full px-3 py-2 text-xs text-left hover:bg-gray-100 ${
                      formData.status === s
                        ? 'text-[#0a61d7] font-semibold bg-gray-50'
                        : 'text-gray-700'
                    }`}
                  >
                    {translateOfferStatus(s)}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <div>
        <label className={labelClass}>{tCreatePage('notes')}</label>
        <textarea
          className={`${fieldClass} resize-none`}
          rows={3}
          value={formData.notes}
          onChange={(e) => onFormChangeAction({ notes: e.target.value })}
          placeholder={tCreatePage('notesPlaceholder')}
        />
      </div>
    </div>
  );
}
