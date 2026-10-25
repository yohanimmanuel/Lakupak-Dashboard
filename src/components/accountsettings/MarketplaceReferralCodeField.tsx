'use client';

import React from 'react';
import { useSettingsTranslations } from '@/hooks/useSettingsTranslations';

const normalize = (value: string) => value.toUpperCase().replace(/\s+/g, '');

export default function MarketplaceReferralCodeField({
  isEditing,
  value,
  onChange,
}: {
  isEditing: boolean;
  value: string;
  onChange: (value: string) => void;
}) {
  const { tDistributor } = useSettingsTranslations();

  return (
    <div>
      <label className="block text-xs font-medium text-gray-700 mb-1">
        {tDistributor('referralCode')}
      </label>
      <p className="text-[11px] text-gray-500 mb-2">
        {tDistributor('referralCodeDescription')}
      </p>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(normalize(e.target.value))}
        disabled={!isEditing}
        maxLength={24}
        autoComplete="off"
        spellCheck={false}
        className="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0a61d7] focus:border-transparent disabled:bg-gray-50 text-black font-semibold tracking-wide"
        placeholder={tDistributor('referralCodePlaceholder')}
      />
      {!value && (
        <p className="text-[11px] text-amber-600 mt-1">{tDistributor('referralCodeEmptyHint')}</p>
      )}
    </div>
  );
}
