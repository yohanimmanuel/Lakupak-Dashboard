'use client';

import React, { useState, useEffect } from 'react';
import { Calendar, Clock, Plus, Edit, Trash2, Target, TrendingUp, CheckCircle } from 'lucide-react';
import { useOfferCreationStore } from '@/store/offerCreationStore';
import CreateDateRangeModal from './CreateDateRangeModal';
import CreateTimeSlotModal from './CreateTimeSlotModal';

interface RangeManagementProps {
  isNewOffer?: boolean;
  onOpenDateModal?: () => void;
  onOpenTimeModal?: () => void;
  selectedDateRange?: any;
  selectedTimeSlot?: any;
  onSelectDateRange?: (dateRange: any) => void;
  onSelectTimeSlot?: (timeSlot: any) => void;
}

interface DateRange {
  id: string;
  name: string;
  description: string;
  startDate: string;
  endDate: string;
  isActive: boolean;
  offerCount: number;
  createdAt: string;
}

interface TimeSlot {
  id: string;
  name: string;
  startTime: string;
  endTime: string;
  days: string[];
  isActive: boolean;
  offerCount: number;
  createdAt: string;
}

export default function RangeManagement({ 
  isNewOffer = false, 
  onOpenDateModal, 
  onOpenTimeModal,
  selectedDateRange,
  selectedTimeSlot,
  onSelectDateRange,
  onSelectTimeSlot
}: RangeManagementProps) {
  const [activeTab, setActiveTab] = useState<'date' | 'time'>('date');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingRange, setEditingRange] = useState<DateRange | TimeSlot | null>(null);

  // Use arrays from store to allow multiple entries
  const store = useOfferCreationStore();
  const dateRangesFromStore: DateRange[] = (store.dateRanges || []).map((dr) => ({
    ...dr,
    offerCount: 0,
    createdAt: (dr as any).createdAt || new Date().toISOString(),
    description: dr.description || `From ${new Date(dr.startDate).toLocaleDateString()} to ${new Date(dr.endDate).toLocaleDateString()}`,
    isActive: dr.isActive ?? true,
  }));

  const timeSlotsFromStore: TimeSlot[] = (store.timeSlots || []).map((ts) => ({
    ...ts,
    offerCount: 0,
    createdAt: (ts as any).createdAt || new Date().toISOString(),
    isActive: ts.isActive ?? true,
  }));

  // Fallback: if arrays are empty but a selection exists (older persisted state), render the selection
  const dateRanges: DateRange[] = dateRangesFromStore.length > 0
    ? dateRangesFromStore
    : (selectedDateRange ? [{
        id: selectedDateRange.id,
        name: selectedDateRange.name,
        description: selectedDateRange.description || `From ${new Date(selectedDateRange.startDate).toLocaleDateString()} to ${new Date(selectedDateRange.endDate).toLocaleDateString()}`,
        startDate: selectedDateRange.startDate,
        endDate: selectedDateRange.endDate,
        isActive: selectedDateRange.isActive ?? true,
        offerCount: 0,
        createdAt: new Date().toISOString(),
      }] : []);

  const timeSlots: TimeSlot[] = timeSlotsFromStore.length > 0
    ? timeSlotsFromStore
    : (selectedTimeSlot ? [{
        id: selectedTimeSlot.id,
        name: selectedTimeSlot.name,
        startTime: selectedTimeSlot.startTime,
        endTime: selectedTimeSlot.endTime,
        days: selectedTimeSlot.days,
        isActive: selectedTimeSlot.isActive ?? true,
        offerCount: 0,
        createdAt: new Date().toISOString(),
      }] : []);

  // No API calls needed - data comes from store



  const handleEdit = (range: DateRange | TimeSlot) => {
    setEditingRange(range);
    setShowEditModal(true);
  };

  const handleDelete = (id: string) => {
    if (activeTab === 'date') {
      store.removeDateRange(id);
    } else {
      store.removeTimeSlot(id);
    }
  };

  const handleToggleActive = (id: string) => {
    // For now, just log - could implement active/inactive state in store if needed
    console.log('Toggle active for range:', id);
  };

  // Unified single return below (mirrors OfferType approach)

  return (
    <div className="p-4 space-y-4">
      {/* Header */}
        <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-black">{isNewOffer ? 'Date & Time Range' : 'Range Management'}</h2>
          <p className="text-gray-500 text-sm">{isNewOffer ? 'Set the active period for your new offer' : 'Manage date ranges and time slots for offers'}</p>
        </div>
        {(dateRanges.length + timeSlots.length) > 0 && (
          <button
            onClick={() => { setEditingRange(null); setShowCreateModal(true); }}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#0a61d7] text-white font-semibold hover:bg-[#084ba6] transition text-sm"
          >
            <Plus className="w-4 h-4" />
            {activeTab === 'date' ? 'Create Date Range' : 'Create Time Slot'}
          </button>
        )}
      </div>

      {/* Tab Navigation */}
      <div className="flex gap-1">
        <button
          onClick={() => setActiveTab('date')}
          className={`flex items-center gap-2 px-4 py-2 rounded-md text-xs font-medium transition-colors ${
            activeTab === 'date'
              ? 'bg-[#0a61d7] text-white'
              : 'text-gray-600 hover:text-black hover:bg-gray-100'
          }`}
        >
          <Calendar className="w-4 h-4" />
          Date Ranges
        </button>
        <button
          onClick={() => setActiveTab('time')}
          className={`flex items-center gap-2 px-4 py-2 rounded-md text-xs font-medium transition-colors ${
            activeTab === 'time'
              ? 'bg-[#0a61d7] text-white'
              : 'text-gray-600 hover:text-black hover:bg-gray-100'
          }`}
        >
          <Clock className="w-4 h-4" />
          Time Slots
        </button>
      </div>

      {/* Quick Stats removed for simplicity */}

      {/* Empty state when no ranges/slots */}
      {dateRanges.length === 0 && timeSlots.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-lg p-8 text-center">
          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            {activeTab === 'date' ? (
              <Calendar className="w-8 h-8 text-gray-400" />
            ) : (
              <Clock className="w-8 h-8 text-gray-400" />
            )}
          </div>
          {activeTab === 'date' ? (
            <>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">No Date Range Configured</h3>
              <p className="text-gray-500 text-sm mb-4">Create a date range to define when your offer will be active.</p>
              <button onClick={() => { setEditingRange(null); setShowCreateModal(true); }} className="flex items-center gap-2 px-6 py-3 bg-[#0a61d7] text-white rounded-lg hover:bg-[#084ba6] transition-colors mx-auto">
                <Plus className="w-4 h-4" />
                Create Date Range
              </button>
            </>
          ) : (
            <>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">No Time Slots Configured</h3>
              <p className="text-gray-500 text-sm mb-4">Create time slots to define specific hours when your offer will be available.</p>
              <button onClick={() => { setEditingRange(null); setShowCreateModal(true); }} className="flex items-center gap-2 px-6 py-3 bg-[#0a61d7] text-white rounded-lg hover:bg-[#084ba6] transition-colors mx-auto">
                <Plus className="w-4 h-4" />
                Create Time Slot
              </button>
            </>
          )}
        </div>
      ) : activeTab === 'date' ? (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-black">Date Ranges</h3>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {dateRanges.map((range) => {

              return (
                <div key={range.id} className="bg-white p-4 rounded-lg border border-gray-200 hover:shadow-md transition-shadow">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex-1">
                      <h4 className="text-md font-semibold text-black mb-1">{range.name}</h4>
                      <p className="text-xs text-gray-600 mb-2">{range.description}</p>
                    </div>
                    <button
                      onClick={() => handleToggleActive(range.id)}
                      className={`w-3 h-3 rounded-full border-2 transition-colors ${
                        range.isActive 
                          ? 'bg-green-500 border-green-500' 
                          : 'bg-white border-gray-300'
                      }`}
                      title={range.isActive ? 'Active' : (new Date() > new Date(range.endDate) ? 'Expired' : 'Inactive')}
                    />
                  </div>

                  <div className="space-y-2 mb-4">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-gray-600">Start Date:</span>
                      <span className="font-medium text-black text-xs">
                        {new Date(range.startDate).toLocaleDateString()}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-gray-600">End Date:</span>
                      <span className="font-medium text-black text-xs">
                        {new Date(range.endDate).toLocaleDateString()}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-gray-600">Associated Offers:</span>
                      <span className="font-medium text-black text-xs">{range.offerCount}</span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-4 border-t border-gray-200">
                    <div className="text-xs text-gray-500">
                      Created: {new Date(range.createdAt).toLocaleDateString()}
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleEdit(range)}
                        className="p-2 text-blue-600 hover:text-blue-700 hover:bg-blue-100 rounded-lg transition-colors text-xs"
                        title="Edit Range"
                      >
                        <Edit className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(range.id)}
                        className="p-2 text-red-600 hover:text-red-700 hover:bg-red-100 rounded-lg transition-colors text-xs"
                        title="Delete Range"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-black">Time Slots</h3>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {timeSlots.map((slot) => (
              <div key={slot.id} className="bg-white p-4 rounded-lg border border-gray-200 hover:shadow-md transition-shadow">
                <div className="flex items-start justify-between mb-2">
                  <div className="flex-1">
                    <h4 className="text-md font-semibold text-black mb-1">{slot.name}</h4>
                    <div className="flex items-center gap-2 mb-2">
                      <Clock className="w-4 h-4 text-gray-500" />
                      <span className="text-xs font-medium text-black">
                        {slot.startTime} - {slot.endTime}
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={() => handleToggleActive(slot.id)}
                    className={`w-3 h-3 rounded-full border-2 transition-colors ${
                      slot.isActive 
                        ? 'bg-green-500 border-green-500' 
                        : 'bg-white border-gray-300'
                    }`}
                    title={slot.isActive ? 'Active' : 'Inactive'}
                  />
                </div>

                <div className="space-y-2 mb-4">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-600">Days:</span>
                    <span className="font-medium text-black text-xs">{slot.days.join(', ')}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-600">Associated Offers:</span>
                    <span className="font-medium text-black text-xs">{slot.offerCount}</span>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-4 border-t border-gray-200">
                  <div className="text-xs text-gray-500">
                    Created: {new Date(slot.createdAt).toLocaleDateString()}
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleEdit(slot)}
                      className="p-2 text-blue-600 hover:text-blue-700 hover:bg-blue-100 rounded-lg transition-colors text-xs"
                      title="Edit Time Slot"
                    >
                      <Edit className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(slot.id)}
                      className="p-2 text-red-600 hover:text-red-700 hover:bg-red-100 rounded-lg transition-colors text-xs"
                      title="Delete Time Slot"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Create/Edit Modals */}
      {activeTab === 'date' && (showCreateModal || showEditModal) && (
        <CreateDateRangeModal
          isOpen={showCreateModal || showEditModal}
          onClose={() => {
            setShowCreateModal(false);
            setShowEditModal(false);
            setEditingRange(null);
          }}
          editingRange={editingRange}
          onSave={(rangeData) => {
            const preserveId = (editingRange as any)?.id || `temp-${Date.now()}`;
            const payload = {
              id: preserveId,
              name: rangeData.name,
              description: rangeData.description,
              startDate: rangeData.startDate,
              endDate: rangeData.endDate,
              isActive: true,
            } as any;
            if (editingRange) {
              store.updateDateRange(preserveId, payload);
            } else {
              store.addDateRange(payload);
            }
            setShowCreateModal(false);
            setShowEditModal(false);
            setEditingRange(null);
          }}
        />
      )}

      {activeTab === 'time' && (showCreateModal || showEditModal) && (
        <CreateTimeSlotModal
          isOpen={showCreateModal || showEditModal}
          onClose={() => {
            setShowCreateModal(false);
            setShowEditModal(false);
            setEditingRange(null);
          }}
          editingSlot={editingRange}
          onSave={(slotData) => {
            const preserveId = (editingRange as any)?.id || `temp-${Date.now()}`;
            const payload = {
              id: preserveId,
              name: slotData.name,
              startTime: slotData.startTime,
              endTime: slotData.endTime,
              days: slotData.days,
              isActive: true,
            } as any;
            if (editingRange) {
              store.updateTimeSlot(preserveId, payload);
            } else {
              store.addTimeSlot(payload);
            }
            setShowCreateModal(false);
            setShowEditModal(false);
            setEditingRange(null);
          }}
        />
      )}
    </div>
  );
}
