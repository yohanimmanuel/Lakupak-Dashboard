'use client';

import React, { useState, useEffect } from 'react';
import { X, Calendar, Save } from 'lucide-react';

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

export default function CreateDateRangeModal({ 
  isOpen, 
  onClose, 
  editingRange, 
  onSave 
}: CreateDateRangeModalProps) {
  const [saving, setSaving] = useState(false);
  const [selectedPreset, setSelectedPreset] = useState<string | null>(null);
  const [formData, setFormData] = useState<DateRangeData>({
    name: '',
    description: '',
    startDate: '',
    endDate: '',
  });

  useEffect(() => {
    if (editingRange) {
      setFormData({
        name: editingRange.name || '',
        description: editingRange.description || '',
        startDate: editingRange.startDate || '',
        endDate: editingRange.endDate || '',
      });
    } else {
      // Set default dates for new range
      const today = new Date();
      const nextMonth = new Date(today);
      nextMonth.setMonth(today.getMonth() + 1);
      
      setFormData({
        name: '',
        description: '',
        startDate: today.toISOString().split('T')[0],
        endDate: nextMonth.toISOString().split('T')[0],
      });
    }
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
    
    if (diffDays < 0) return 'Invalid range';
    if (diffDays === 1) return '1 day';
    return `${diffDays} days`;
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
                {editingRange ? 'Edit Date Range' : 'Create Date Range'}
              </h3>
              <p className="text-gray-500 text-sm">
                {editingRange ? 'Update your date range settings' : 'Set when your offer will be active'}
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
            <h4 className="text-md font-semibold text-black">Basic Information</h4>
            
            <div>
              <label className="block text-xs font-medium text-black mb-1">
                Range Name *
              </label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => handleInputChange('name', e.target.value)}
                placeholder="e.g., Summer Sale 2024"
                className="w-full text-xs px-3 py-2 border border-gray-200 rounded-lg text-black"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-black mb-1">
                Description
              </label>
              <textarea
                value={formData.description}
                onChange={(e) => handleInputChange('description', e.target.value)}
                placeholder="Brief description of this date range..."
                rows={3}
                className="w-full text-xs px-3 py-2 border border-gray-200 rounded-lg text-black resize-none"
              />
            </div>
          </div>

          {/* Date Selection */}
          <div className="space-y-2">
            <h4 className="text-md font-semibold text-black">Date Period *</h4>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-black mb-1">
                  Start Date *
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
                  End Date *
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
                    {isDateRangeValid() ? 'Range Duration' : 'Invalid Date Range'}
                  </span>
                </div>
                <p className={`text-xs mt-1 ${
                  isDateRangeValid() ? 'text-green-600' : 'text-red-600'
                }`}>
                  {isDateRangeValid() 
                    ? `${getDateRangeDuration()} from ${new Date(formData.startDate).toLocaleDateString()} to ${new Date(formData.endDate).toLocaleDateString()}`
                    : 'End date must be after start date'
                  }
                </p>
              </div>
            )}
          </div>

          {/* Quick Date Presets */}
          <div className="space-y-2">
            <h4 className="text-md font-semibold text-black">Quick Presets</h4>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {[
                { label: '1 Week', days: 7 },
                { label: '2 Weeks', days: 14 },
                { label: '1 Month', days: 30 },
                { label: '3 Months', days: 90 }
              ].map((preset) => {
                const isSelected = selectedPreset === preset.label;
                return (
                  <button
                    key={preset.label}
                    onClick={() => {
                      const start = new Date(formData.startDate);
                      const end = new Date(start);
                      end.setDate(start.getDate() + preset.days);
                      handleInputChange('endDate', end.toISOString().split('T')[0]);
                      setSelectedPreset(preset.label);
                    }}
                    className={`px-3 py-2 text-xs font-medium rounded-lg transition-colors ${
                      isSelected
                        ? 'border-2 border-[#0a61d7] bg-blue-50 text-[#0a61d7]'
                        : 'border border-gray-200 text-gray-600 hover:bg-gray-50 hover:text-black'
                    }`}
                  >
                    {preset.label}
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
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!formData.name.trim() || !isDateRangeValid() || saving}
            className="flex items-center gap-2 px-6 py-2 bg-[#0a61d7] text-white rounded-lg hover:bg-[#084ba6] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                {editingRange ? 'Updating...' : 'Creating...'}
              </>
            ) : (
              <>
                {editingRange ? 'Update Range' : 'Create Range'}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}


