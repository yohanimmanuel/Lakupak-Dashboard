'use client';

import React, { useState, useEffect } from 'react';
import { X, Calendar, Save } from 'lucide-react';
import { useOffersTranslations } from '@/hooks/useOffersTranslations';

interface DateRangeData {
  name: string;
  description: string;
  startDate: string;
  endDate: string;
}

interface CreateDateRangeModalProps {
  isOpen: boolean;
  onClose: () => void;
  editingRange?: Partial<DateRangeData>;
  onSave: (rangeData: DateRangeData) => void;
}

function getInitialDateRangeData(editingRange?: Partial<DateRangeData>): DateRangeData {
  if (editingRange) {
    return {
      name: editingRange.name ?? '',
      description: editingRange.description ?? '',
      startDate: editingRange.startDate ?? '',
      endDate: editingRange.endDate ?? '',
    };
  }
  const today = new Date();
  const nextMonth = new Date(today);
  nextMonth.setMonth(today.getMonth() + 1);
  return {
    name: '',
    description: '',
    startDate: today.toISOString().split('T')[0],
    endDate: nextMonth.toISOString().split('T')[0],
  };
}

export default function CreateDateRangeModal({
  isOpen,
  onClose,
  editingRange,
  onSave,
}: CreateDateRangeModalProps) {
  const { tDateRangeModal, tShared } = useOffersTranslations();
  const [saving, setSaving] = useState(false);
  const [selectedPreset, setSelectedPreset] = useState<string | null>(null);
  const [formData, setFormData] = useState<DateRangeData>(() => getInitialDateRangeData(editingRange));

  useEffect(() => {
    setFormData(getInitialDateRangeData(editingRange));
  }, [editingRange]);

  const handleInputChange = (field: keyof DateRangeData, value: string) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
    // Clear selected preset when manually changing dates
    if (field === 'startDate' || field === 'endDate') {
      setSelectedPreset(null);
    }
  };

  const handleSave = async () => {
    if (!formData.name.trim() || !formData.startDate || !formData.endDate) return;
    
    setSaving(true);
    try {
      await onSave(formData);
    } finally {
      setSaving(false);
    }
  };

  const getDateRangeDuration = () => {
    if (!formData.startDate || !formData.endDate) return '';
    
    const start = new Date(formData.startDate);
    const end = new Date(formData.endDate);
    const diffTime = end.getTime() - start.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
    
    if (diffDays < 0) return tDateRangeModal('invalidRangeShort');
    if (diffDays === 1) return tDateRangeModal('oneDay');
    return tDateRangeModal('daysCount', { count: diffDays });
  };

  const isDateRangeValid = () => {
    if (!formData.startDate || !formData.endDate) return false;
    return new Date(formData.endDate) >= new Date(formData.startDate);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 bg-white rounded-t-lg">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-[#0a61d7] rounded-lg flex items-center justify-center">
              <Calendar className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-black">
                {editingRange ? tDateRangeModal('editTitle') : tDateRangeModal('createTitle')}
              </h3>
              <p className="text-gray-500 text-sm">
                {editingRange ? tDateRangeModal('editSubtitle') : tDateRangeModal('createSubtitle')}
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
            <h4 className="text-md font-semibold text-black">{tDateRangeModal('basicInfo')}</h4>
            
            <div>
              <label className="block text-xs font-medium text-black mb-1">
                {tDateRangeModal('rangeName')}
              </label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => handleInputChange('name', e.target.value)}
                placeholder={tDateRangeModal('rangeNamePlaceholder')}
                className="w-full text-xs px-3 py-2 border border-gray-200 rounded-lg text-black"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-black mb-1">
                {tDateRangeModal('description')}
              </label>
              <textarea
                value={formData.description}
                onChange={(e) => handleInputChange('description', e.target.value)}
                placeholder={tDateRangeModal('descriptionPlaceholder')}
                rows={3}
                className="w-full text-xs px-3 py-2 border border-gray-200 rounded-lg text-black resize-none"
              />
            </div>
          </div>

          {/* Date Selection */}
          <div className="space-y-2">
            <h4 className="text-md font-semibold text-black">{tDateRangeModal('datePeriod')}</h4>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-black mb-1">
                  {tDateRangeModal('startDate')}
                </label>
                <input
                  type="date"
                  value={formData.startDate}
                  onChange={(e) => handleInputChange('startDate', e.target.value)}
                  className="w-full text-xs px-3 py-2 border border-gray-200 rounded-lg text-black"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-black mb-1">
                  {tDateRangeModal('endDate')}
                </label>
                <input
                  type="date"
                  value={formData.endDate}
                  onChange={(e) => handleInputChange('endDate', e.target.value)}
                  className="w-full text-xs px-3 py-2 border border-gray-200 rounded-lg text-black"
                />
              </div>
            </div>

            {/* Date Range Summary */}
            {formData.startDate && formData.endDate && (
              <div className={`p-4 rounded-lg border ${
                isDateRangeValid() 
                  ? 'bg-green-50 border-green-200' 
                  : 'bg-red-50 border-red-200'
              }`}>
                <div className="flex items-center gap-2">
                  <Calendar className={`w-4 h-4 ${
                    isDateRangeValid() ? 'text-green-600' : 'text-red-600'
                  }`} />
                  <span className={`text-sm font-medium ${
                    isDateRangeValid() ? 'text-green-700' : 'text-red-700'
                  }`}>
                    {isDateRangeValid() ? tDateRangeModal('rangeDuration') : tDateRangeModal('invalidRange')}
                  </span>
                </div>
                <p className={`text-xs mt-1 ${
                  isDateRangeValid() ? 'text-green-600' : 'text-red-600'
                }`}>
                  {isDateRangeValid() 
                    ? tDateRangeModal('durationFromTo', {
                        duration: getDateRangeDuration(),
                        start: new Date(formData.startDate).toLocaleDateString(),
                        end: new Date(formData.endDate).toLocaleDateString(),
                      })
                    : tDateRangeModal('invalidRangeHint')
                  }
                </p>
              </div>
            )}
          </div>

          {/* Quick Date Presets */}
          <div className="space-y-2">
            <h4 className="text-md font-semibold text-black">{tDateRangeModal('quickPresets')}</h4>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {([
                { key: 'preset1Week', days: 7 },
                { key: 'preset2Weeks', days: 14 },
                { key: 'preset1Month', days: 30 },
                { key: 'preset3Months', days: 90 },
              ] as const).map((preset) => {
                const isSelected = selectedPreset === preset.key;
                return (
                  <button
                    key={preset.key}
                    onClick={() => {
                      const start = new Date(formData.startDate);
                      const end = new Date(start);
                      end.setDate(start.getDate() + preset.days);
                      handleInputChange('endDate', end.toISOString().split('T')[0]);
                      setSelectedPreset(preset.key);
                    }}
                    className={`px-3 py-2 text-xs font-medium rounded-lg transition-colors ${
                      isSelected
                        ? 'border-2 border-[#0a61d7] bg-blue-50 text-[#0a61d7]'
                        : 'border border-gray-200 text-gray-600 hover:bg-gray-50 hover:text-black'
                    }`}
                  >
                    {tDateRangeModal(preset.key)}
                  </button>
                );
              })}
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
            disabled={!formData.name.trim() || !isDateRangeValid() || saving}
            className="flex items-center gap-2 px-6 py-2 bg-[#0a61d7] text-white rounded-lg hover:bg-[#084ba6] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                {editingRange ? tDateRangeModal('updating') : tDateRangeModal('creating')}
              </>
            ) : (
              <>
                {editingRange ? tDateRangeModal('updateRange') : tDateRangeModal('createRange')}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}


