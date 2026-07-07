'use client';

import React, { useState, useEffect } from 'react';
import { X, Target, Percent, DollarSign, Gift, Save } from 'lucide-react';
import { formatCurrency, getDefaultCurrency, getCurrencySymbol } from '@/utils/currencyUtils';
import { useUserStore } from '@/store/userStore';
import { useOffersTranslations } from '@/hooks/useOffersTranslations';

export type PromotionApplyMode = 'from_zero' | 'after_moq';

interface OfferTypeData {
  name: string;
  description: string;
  discountType: 'percentage' | 'fixed' | 'buy_x_get_y';
  discountValue: number;
  minOrderValue?: string;
  minQuantity?: number;
  promotionApplyMode?: PromotionApplyMode;
}

interface CreateOfferTypeModalProps {
  isOpen: boolean;
  onClose: () => void;
  editingType?: Partial<OfferTypeData>;
  onSave: (typeData: OfferTypeData) => void;
}

function getInitialOfferTypeData(editingType?: Partial<OfferTypeData>): OfferTypeData {
  if (editingType) {
    return {
      name: editingType.name ?? '',
      description: editingType.description ?? '',
      discountType: editingType.discountType ?? 'percentage',
      discountValue: editingType.discountValue ?? 0,
      minOrderValue: editingType.minOrderValue ?? '',
      minQuantity: editingType.minQuantity ?? undefined,
      promotionApplyMode: editingType.promotionApplyMode ?? 'after_moq',
    };
  }
  return {
    name: '',
    description: '',
    discountType: 'percentage',
    discountValue: 0,
    minOrderValue: '',
    minQuantity: undefined,
    promotionApplyMode: 'after_moq',
  };
}

export default function CreateOfferTypeModal({
  isOpen,
  onClose,
  editingType,
  onSave,
}: CreateOfferTypeModalProps) {
  const { tTypeModal, tShared } = useOffersTranslations();
  const user = useUserStore((state) => state.user);
  const userCurrency = user?.currency || getDefaultCurrency();
  const currencySymbol = getCurrencySymbol(userCurrency);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState<OfferTypeData>(() => getInitialOfferTypeData(editingType));

  useEffect(() => {
    setFormData(getInitialOfferTypeData(editingType));
  }, [editingType]);

  const handleInputChange = (field: keyof OfferTypeData, value: string | number | undefined) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleSave = async () => {
    if (!formData.name.trim()) return;
    
    setSaving(true);
    try {
      const dataToSave = {
        ...formData,
      };
      
      await onSave(dataToSave);
    } finally {
      setSaving(false);
    }
  };

  const getDiscountTypeIcon = (type: string) => {
    switch (type) {
      case 'percentage':
        return <Percent className="w-5 h-5 text-blue-600" />;
      case 'fixed':
        return <DollarSign className="w-5 h-5 text-green-600" />;
      case 'buy_x_get_y':
        return <Gift className="w-5 h-5 text-purple-600" />;
      default:
        return <Target className="w-5 h-5 text-gray-600" />;
    }
  };

  const discountTypeOptions = [
    {
      value: 'percentage' as const,
      label: tTypeModal('percentageLabel'),
      description: tTypeModal('percentageDesc'),
      icon: <Percent className="w-5 h-5" />,
      color: 'border-blue-200 bg-blue-50',
      textColor: 'text-blue-700'
    },
    {
      value: 'fixed' as const,
      label: tTypeModal('fixedLabel'),
      description: tTypeModal('fixedDesc'),
      icon: <DollarSign className="w-5 h-5" />,
      color: 'border-green-200 bg-green-50',
      textColor: 'text-green-700'
    },
    {
      value: 'buy_x_get_y' as const,
      label: tTypeModal('buyXGetYLabel'),
      description: tTypeModal('buyXGetYDesc'),
      icon: <Gift className="w-5 h-5" />,
      color: 'border-purple-200 bg-purple-50',
      textColor: 'text-purple-700'
    }
  ];

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 bg-white rounded-t-lg">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-[#0a61d7] rounded-lg flex items-center justify-center">
              <Target className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-black">
                {editingType ? tTypeModal('editTitle') : tTypeModal('createTitle')}
              </h3>
              <p className="text-gray-500 text-sm">
                {editingType ? tTypeModal('editSubtitle') : tTypeModal('createSubtitle')}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form - Scrollable Content */}
        <div className="p-4 space-y-4 overflow-y-auto flex-1">
          {/* Basic Information */}
          <div className="space-y-2">
            <h4 className="text-md font-semibold text-black">{tTypeModal('basicInfo')}</h4>
            
            <div>
              <label className="block text-xs font-medium text-black mb-1">
                {tTypeModal('offerName')}
              </label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => handleInputChange('name', e.target.value)}
                placeholder={tTypeModal('offerNamePlaceholder')}
                className="w-full text-xs px-3 py-2 border border-gray-200 rounded-lg text-black"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-black mb-1">
                {tTypeModal('description')}
              </label>
              <textarea
                value={formData.description}
                onChange={(e) => handleInputChange('description', e.target.value)}
                placeholder={tTypeModal('descriptionPlaceholder')}
                rows={3}
                className="w-full text-xs px-3 py-2 border border-gray-200 rounded-lg text-black resize-none"
              />
            </div>
          </div>

          {/* Discount Type Selection */}
          <div className="space-y-2">
            <h4 className="text-md font-semibold text-black">{tTypeModal('discountTypeSection')}</h4>
            <div className="grid grid-cols-1 gap-3">
              {discountTypeOptions.map((option) => (
                <button
                  key={option.value}
                  onClick={() => handleInputChange('discountType', option.value)}
                  className={`p-3 rounded-lg border-2 text-left transition-all ${
                    formData.discountType === option.value
                      ? `${option.color} border-current`
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div className="flex items-center gap-3 text-sm">
                    <div className={`${formData.discountType === option.value ? option.textColor : 'text-gray-500'}`}>
                      {option.icon}
                    </div>
                    <div>
                      <div className={`font-medium ${formData.discountType === option.value ? option.textColor : 'text-black'}`}>
                        {option.label}
                      </div>
                      <div className="text-xs text-gray-500">
                        {option.description}
                      </div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Discount Value */}
          <div className="space-y-2">
            <h4 className="text-md font-semibold text-black">{tTypeModal('discountValueSection')}</h4>
            
            <div>
              <label className="block text-xs font-medium text-black mb-1">
                {formData.discountType === 'percentage' ? tTypeModal('discountPercentage') :
                 formData.discountType === 'fixed' ? tTypeModal('discountAmount') :
                 tTypeModal('freePackages')}
              </label>
              <div className="relative">
                <input
                  type="number"
                  value={formData.discountValue || ''}
                  onChange={(e) => handleInputChange('discountValue', parseFloat(e.target.value) || 0)}
                  placeholder={formData.discountType === 'percentage' ? '15' :
                             formData.discountType === 'fixed' ? '50000' : '1'}
                  className="w-full text-xs px-3 py-2 border border-gray-200 rounded-lg text-black"
                />
                <div className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-500 text-xs">
                  {formData.discountType === 'percentage' ? '%' :
                   formData.discountType === 'fixed' ? currencySymbol : tTypeModal('packagesUnit')}
                </div>
              </div>
              {formData.discountType === 'fixed' && formData.discountValue > 0 && (
                <div className="mt-2 text-xs text-gray-600">
                  {tTypeModal('previewDiscount', { value: formatCurrency(formData.discountValue, userCurrency) })}
                </div>
              )}
            </div>

            {/* Buy X Get Y specific field */}
            {formData.discountType === 'buy_x_get_y' && (
              <div>
                <label className="block text-xs font-medium text-black mb-1">
                  {tTypeModal('minPackagesToBuy')}
                </label>
                <input
                  type="number"
                  value={formData.minQuantity || ''}
                  onChange={(e) => handleInputChange('minQuantity', parseInt(e.target.value) || undefined)}
                  placeholder="3"
                  className="w-full text-xs px-3 py-2 border border-gray-200 rounded-lg text-black"
                />
                <div className="mt-2 text-xs text-gray-600">
                  {tTypeModal('minPackagesHint')}
                </div>

                <div className="mt-4 space-y-2">
                  <label className="block text-xs font-medium text-black">
                    {tTypeModal('promotionApplyModeLabel')}
                  </label>
                  <div className="space-y-2">
                    {([
                      { value: 'from_zero' as const, label: tTypeModal('promotionFromZero') },
                      { value: 'after_moq' as const, label: tTypeModal('promotionAfterMoq') },
                    ]).map((option) => (
                      <label
                        key={option.value}
                        className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                          (formData.promotionApplyMode ?? 'after_moq') === option.value
                            ? 'border-purple-300 bg-purple-50'
                            : 'border-gray-200 hover:border-gray-300'
                        }`}
                      >
                        <input
                          type="radio"
                          name="promotionApplyMode"
                          value={option.value}
                          checked={(formData.promotionApplyMode ?? 'after_moq') === option.value}
                          onChange={() => handleInputChange('promotionApplyMode', option.value)}
                          className="mt-0.5"
                        />
                        <span className="text-xs text-gray-700 leading-5">{option.label}</span>
                      </label>
                    ))}
                  </div>
                  <p className="text-xs text-gray-500">{tTypeModal('promotionApplyModeHint')}</p>
                </div>
              </div>
            )}
          </div>

          {/* Limit Settings */}
          <div className="space-y-2">
            <h4 className="text-md font-semibold text-black">{tTypeModal('limitSettings')}</h4>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-black mb-1">
                  {tTypeModal('minOrderValue')}
                </label>
                <div className="relative">
                  <div className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500 text-xs">
                    {currencySymbol}
                  </div>
                  <input
                    type="text"
                    value={formData.minOrderValue || ''}
                    onChange={(e) => {
                      handleInputChange('minOrderValue', e.target.value);
                    }}
                    placeholder={tTypeModal('minOrderPlaceholder')}
                    className="w-full text-xs pl-8 pr-3 py-2 border border-gray-200 rounded-lg text-black"
                  />
                </div>
              </div>


            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 p-4 border-t border-gray-200 text-sm flex-shrink-0 rounded-b-lg">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-gray-100 text-gray-700 font-medium hover:bg-gray-200 transition-colors"
          >
            {tShared('cancel')}
          </button>
          <button
            onClick={handleSave}
            disabled={!formData.name.trim() || saving}
            className="flex items-center gap-2 px-6 py-2 bg-[#0a61d7] text-white rounded-lg hover:bg-[#084ba6] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                {editingType ? tTypeModal('updating') : tTypeModal('creating')}
              </>
            ) : (
              <>
                {editingType ? tTypeModal('updateType') : tTypeModal('createType')}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}