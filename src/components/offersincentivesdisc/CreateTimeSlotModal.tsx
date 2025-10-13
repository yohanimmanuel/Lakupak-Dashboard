'use client';

import React, { useState, useEffect } from 'react';
import { X, Clock, Save } from 'lucide-react';

interface TimeSlotData {
  name: string;
  startTime: string;
  endTime: string;
  days: string[];
}

interface CreateTimeSlotModalProps {
  isOpen: boolean;
  onClose: () => void;
  editingSlot?: Partial<TimeSlotData>;
  onSave: (slotData: TimeSlotData) => void;
}

const DAYS_OF_WEEK = [
  { value: 'Monday', label: 'Mon' },
  { value: 'Tuesday', label: 'Tue' },
  { value: 'Wednesday', label: 'Wed' },
  { value: 'Thursday', label: 'Thu' },
  { value: 'Friday', label: 'Fri' },
  { value: 'Saturday', label: 'Sat' },
  { value: 'Sunday', label: 'Sun' }
];

const TIME_PRESETS = [
  { label: 'Morning', start: '06:00', end: '12:00' },
  { label: 'Afternoon', start: '12:00', end: '18:00' },
  { label: 'Evening', start: '18:00', end: '22:00' },
  { label: 'Business Hours', start: '09:00', end: '17:00' },
  { label: 'Rush Hour', start: '07:00', end: '09:00' },
  { label: 'Late Night', start: '22:00', end: '06:00' }
];

export default function CreateTimeSlotModal({ 
  isOpen, 
  onClose, 
  editingSlot, 
  onSave 
}: CreateTimeSlotModalProps) {
  const [saving, setSaving] = useState(false);
  const [selectedTimePreset, setSelectedTimePreset] = useState<string | null>(null);
  const [selectedDayPreset, setSelectedDayPreset] = useState<string | null>(null);
  const [formData, setFormData] = useState<TimeSlotData>({
    name: '',
    startTime: '09:00',
    endTime: '17:00',
    days: [],
  });

  useEffect(() => {
    if (editingSlot) {
      setFormData({
        name: editingSlot.name || '',
        startTime: editingSlot.startTime || '09:00',
        endTime: editingSlot.endTime || '17:00',
        days: editingSlot.days || [],
      });
    } else {
      setFormData({
        name: '',
        startTime: '09:00',
        endTime: '17:00',
        days: [],
      });
    }
  }, [editingSlot]);

  const handleInputChange = (field: keyof TimeSlotData, value: string | string[]) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
    // Clear selected presets when manually changing time or days
    if (field === 'startTime' || field === 'endTime') {
      setSelectedTimePreset(null);
    }
    if (field === 'days') {
      setSelectedDayPreset(null);
    }
  };

  const handleDayToggle = (day: string) => {
    setFormData(prev => ({
      ...prev,
      days: prev.days.includes(day)
        ? prev.days.filter(d => d !== day)
        : [...prev.days, day]
    }));
  };

  const handleSave = async () => {
    if (!formData.name.trim() || formData.days.length === 0) return;
    
    setSaving(true);
    try {
      await onSave(formData);
    } finally {
      setSaving(false);
    }
  };

  const getTimeSlotDuration = () => {
    if (!formData.startTime || !formData.endTime) return '';
    
    const start = new Date(`2000-01-01T${formData.startTime}`);
    const end = new Date(`2000-01-01T${formData.endTime}`);
    
    // Handle overnight slots (end time is next day)
    if (end <= start) {
      end.setDate(end.getDate() + 1);
    }
    
    const diffMs = end.getTime() - start.getTime();
    const hours = Math.floor(diffMs / (1000 * 60 * 60));
    const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
    
    if (hours === 0) return `${minutes} minutes`;
    if (minutes === 0) return `${hours} hours`;
    return `${hours}h ${minutes}m`;
  };

  const isTimeSlotValid = () => {
    if (!formData.startTime || !formData.endTime) return false;
    return formData.days.length > 0;
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 bg-white rounded-t-lg">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-[#0a61d7] rounded-lg flex items-center justify-center">
              <Clock className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-black">
                {editingSlot ? 'Edit Time Slot' : 'Create Time Slot'}
              </h3>
              <p className="text-gray-500 text-sm">
                {editingSlot ? 'Update your time slot settings' : 'Define specific hours when your offer will be available'}
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
        <div className="p-4 space-y-4 overflow-y-auto hide-scrollbar flex-1">
          {/* Basic Information */}
          <div className="space-y-2">
            <h4 className="text-md font-semibold text-black">Basic Information</h4>
            
            <div>
              <label className="block text-xs font-medium text-black mb-1">
                Slot Name *
              </label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => handleInputChange('name', e.target.value)}
                placeholder="e.g., Morning Rush, Lunch Break"
                className="w-full text-xs px-3 py-2 border border-gray-200 rounded-lg text-black"
              />
            </div>
          </div>

          {/* Time Selection */}
          <div className="space-y-2">
            <h4 className="text-md font-semibold text-black">Time Period *</h4>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-black mb-1">
                  Start Time *
                </label>
                <input
                  type="time"
                  value={formData.startTime}
                  onChange={(e) => handleInputChange('startTime', e.target.value)}
                  className="w-full text-xs px-3 py-2 border border-gray-200 rounded-lg text-black"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-black mb-1">
                  End Time *
                </label>
                <input
                  type="time"
                  value={formData.endTime}
                  onChange={(e) => handleInputChange('endTime', e.target.value)}
                  className="w-full text-xs px-3 py-2 border border-gray-200 rounded-lg text-black"
                />
              </div>
            </div>

            {/* Time Slot Summary */}
            {formData.startTime && formData.endTime && (
              <div className="p-4 rounded-lg border bg-blue-50 border-blue-200">
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-blue-600" />
                  <span className="text-sm font-medium text-blue-700">
                    Slot Duration
                  </span>
                </div>
                <p className="text-xs mt-1 text-blue-600">
                  {getTimeSlotDuration()} from {formData.startTime} to {formData.endTime}
                </p>
              </div>
            )}
          </div>

          {/* Quick Time Presets */}
          <div className="space-y-2">
            <h4 className="text-md font-semibold text-black">Quick Time Presets</h4>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              {TIME_PRESETS.map((preset) => {
                const isSelected = selectedTimePreset === preset.label;
                return (
                  <button
                    key={preset.label}
                    onClick={() => {
                      handleInputChange('startTime', preset.start);
                      handleInputChange('endTime', preset.end);
                      setSelectedTimePreset(preset.label);
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

          {/* Days Selection */}
          <div className="space-y-2">
            <h4 className="text-md font-semibold text-black">Active Days *</h4>
            
            <div className="grid grid-cols-7 gap-2">
              {DAYS_OF_WEEK.map((day) => (
                <button
                  key={day.value}
                  onClick={() => handleDayToggle(day.value)}
                  className={`p-3 text-center rounded-lg border-2 transition-all ${
                    formData.days.includes(day.value)
                      ? 'bg-[#0a61d7] border-[#0a61d7] text-white'
                      : 'border-gray-200 text-gray-600 hover:border-gray-300 hover:text-black'
                  }`}
                >
                  <div className="text-xs font-medium">{day.label}</div>
                </button>
              ))}
            </div>

            {/* Quick Day Presets */}
            <div className="flex gap-2">
              <button
                onClick={() => {
                  const weekdays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
                  handleInputChange('days', weekdays);
                }}
                className="px-3 py-1 text-xs font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 hover:text-black transition-colors"
              >
                Weekdays
              </button>
              <button
                onClick={() => {
                  const weekends = ['Saturday', 'Sunday'];
                  handleInputChange('days', weekends);
                }}
                className="px-3 py-1 text-xs font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 hover:text-black transition-colors"
              >
                Weekends
              </button>
              <button
                onClick={() => {
                  const allDays = DAYS_OF_WEEK.map(d => d.value);
                  handleInputChange('days', allDays);
                }}
                className="px-3 py-1 text-xs font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 hover:text-black transition-colors"
              >
                All Days
              </button>
            </div>
          </div>

          {/* Selected Days Summary */}
          {formData.days.length > 0 && (
            <div className="p-4 rounded-lg border bg-green-50 border-green-200">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-green-600" />
                <span className="text-sm font-medium text-green-700">
                  Selected Days ({formData.days.length})
                </span>
              </div>
              <p className="text-xs mt-1 text-green-600">
                {formData.days.join(', ')}
              </p>
            </div>
          )}
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
            disabled={!formData.name.trim() || !isTimeSlotValid() || saving}
            className="flex items-center gap-2 px-6 py-2 bg-[#0a61d7] text-white rounded-lg hover:bg-[#084ba6] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                {editingSlot ? 'Updating...' : 'Creating...'}
              </>
            ) : (
              <>
                {editingSlot ? 'Update Slot' : 'Create Slot'}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
