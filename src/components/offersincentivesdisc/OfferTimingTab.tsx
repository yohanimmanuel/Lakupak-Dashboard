'use client';

import React from 'react';
import { Check } from 'lucide-react';
import type { OfferWizardFormData } from './OfferDiscountTypeTab';
import { useOffersTranslations } from '@/hooks/useOffersTranslations';

type Props = {
  formData: OfferWizardFormData;
  onFormChangeAction: (updates: Partial<OfferWizardFormData>) => void;
};

const fieldClass =
  'w-full px-3 py-2 text-black text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0a61d7] focus:border-transparent';
const labelClass = 'block text-xs font-medium text-gray-700 mb-2';

export default function OfferTimingTab({ formData, onFormChangeAction }: Props) {
  const { tCreatePage } = useOffersTranslations();

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-gray-900 mb-1">{tCreatePage('timingTabTitle')}</h3>
        <p className="text-sm text-gray-500">{tCreatePage('timingTabSubtitle')}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className={labelClass}>
            {tCreatePage('startDate')} <span className="text-red-500">*</span>
          </label>
          <input
            type="date"
            className={fieldClass}
            value={formData.startDate}
            onChange={(e) => onFormChangeAction({ startDate: e.target.value })}
          />
        </div>

        <div>
          <label className={labelClass}>
            {tCreatePage('endDate')}
            {!formData.unlimitedEnd && <span className="text-red-500"> *</span>}
          </label>
          <input
            type="date"
            className={`${fieldClass} disabled:bg-gray-50 disabled:text-gray-400`}
            value={formData.unlimitedEnd ? '' : formData.endDate}
            disabled={formData.unlimitedEnd}
            onChange={(e) => onFormChangeAction({ endDate: e.target.value })}
          />
          {!formData.unlimitedEnd &&
            formData.endDate &&
            formData.startDate &&
            formData.endDate < formData.startDate && (
              <p className="mt-1 text-xs text-red-500">{tCreatePage('endBeforeStart')}</p>
            )}
        </div>
      </div>

      <button
        type="button"
        onClick={() =>
          onFormChangeAction({
            unlimitedEnd: !formData.unlimitedEnd,
            endDate: !formData.unlimitedEnd ? '' : formData.endDate,
          })
        }
        className="inline-flex items-center gap-2 cursor-pointer select-none"
      >
        <span
          className={`w-4 h-4 border-2 rounded transition-all duration-200 flex items-center justify-center ${
            formData.unlimitedEnd
              ? 'bg-green-500 border-green-500'
              : 'bg-white border-gray-300 hover:border-green-400'
          }`}
        >
          {formData.unlimitedEnd && <Check className="w-3 h-3 text-white" />}
        </span>
        <span className="text-sm text-gray-700">{tCreatePage('unlimitedEnd')}</span>
      </button>
    </div>
  );
}
