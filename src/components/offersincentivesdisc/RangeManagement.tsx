'use client';

import React, { useState, useEffect } from 'react';
import { Calendar, Clock, Plus, Edit, Trash2, Target, TrendingUp, CheckCircle } from 'lucide-react';
import { useOfferCreationStore } from '@/store/offerCreationStore';
import CreateDateRangeModal from './CreateDateRangeModal';
import CreateTimeSlotModal from './CreateTimeSlotModal';

interface RangeManagementProps {
  isNewOffer?: boolean;
  offerData?: any; // Offer data from database for details view
  onOfferChange?: (updatedData: any) => void; // Callback for batch edit mode
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
  offerData,
  onOfferChange,
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
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<DateRange | TimeSlot | null>(null);

  // Use offerData if provided (details view), otherwise use store data (create view)
  const store = useOfferCreationStore();
  const isBatchEditMode = Boolean(offerData && onOfferChange);
  
  let dateRanges: DateRange[] = [];
  let timeSlots: TimeSlot[] = [];
  
  if (offerData) {
    // Use data from database for details view
    dateRanges = (offerData.dateRanges || []).map((dr: any) => ({
      ...dr,
      offerCount: 0,
      createdAt: dr.createdAt || new Date().toISOString(),
      // Convert ISO dates to yyyy-MM-dd format for HTML date inputs
      startDate: dr.startDate ? new Date(dr.startDate).toISOString().split('T')[0] : dr.startDate,
      endDate: dr.endDate ? new Date(dr.endDate).toISOString().split('T')[0] : dr.endDate,
    }));
    timeSlots = (offerData.timeSlots || []).map((ts: any) => ({
      ...ts,
      offerCount: 0,
      createdAt: ts.createdAt || new Date().toISOString(),
      days: ts.days || [], // Add fallback for days property
    }));
  } else {
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
    dateRanges = dateRangesFromStore.length > 0
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

    timeSlots = timeSlotsFromStore.length > 0
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
  }

  // No API calls needed - data comes from store



  const handleEdit = (range: DateRange | TimeSlot) => {
    setEditingRange(range);
    setShowEditModal(true);
  };

  const handleDelete = (id: string) => {
    const item = activeTab === 'date' 
      ? dateRanges.find(dr => dr.id === id)
      : timeSlots.find(ts => ts.id === id);
    
    if (item) {
      setItemToDelete(item);
      setShowDeleteModal(true);
    }
  };

  const handleDeleteConfirm = () => {
    if (!itemToDelete) return;

    if (isBatchEditMode) {
      // In batch edit mode, update parent state
      if (activeTab === 'date') {
        const updatedDateRanges = dateRanges.filter(dr => dr.id !== itemToDelete.id);
        onOfferChange!({ dateRanges: updatedDateRanges });
      } else {
        const updatedTimeSlots = timeSlots.filter(ts => ts.id !== itemToDelete.id);
        onOfferChange!({ timeSlots: updatedTimeSlots });
      }
    } else {
      // In create view, remove from store
      if (activeTab === 'date') {
        store.removeDateRange(itemToDelete.id);
      } else {
        store.removeTimeSlot(itemToDelete.id);
      }
    }
    setShowDeleteModal(false);
    setItemToDelete(null);
  };

  const handleDeleteCancel = () => {
    setShowDeleteModal(false);
    setItemToDelete(null);
  };

  const handleToggleActive = (id: string) => {
    // For now, just log - could implement active/inactive state in store if needed
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
                    <span className="font-medium text-black text-xs">{(slot.days || []).join(', ') || 'All days'}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-600">Slot Duration:</span>
                    <span className="font-medium text-black text-xs">
                      {(() => {
                        const start = slot.startTime;
                        const end = slot.endTime;
                        const startTime = new Date(`2000-01-01T${start}:00`);
                        const endTime = new Date(`2000-01-01T${end}:00`);
                        const diffMs = endTime.getTime() - startTime.getTime();
                        const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
                        const diffMinutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
                        if (diffHours > 0 && diffMinutes > 0) {
                          return `${diffHours}h ${diffMinutes}m from ${start} to ${end}`;
                        } else if (diffHours > 0) {
                          return `${diffHours} hours from ${start} to ${end}`;
                        } else {
                          return `${diffMinutes} minutes from ${start} to ${end}`;
                        }
                      })()}
                    </span>
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
            const preserveId = (editingRange as any)?.id || `dr-${Date.now()}`;
            const payload = {
              id: preserveId,
              name: rangeData.name,
              description: rangeData.description,
              startDate: rangeData.startDate,
              endDate: rangeData.endDate,
              isActive: true,
              offerCount: 0,
              createdAt: new Date().toISOString(),
            };

            if (isBatchEditMode) {
              // In batch edit mode, update parent state
              let updatedDateRanges;
              if (editingRange) {
                updatedDateRanges = dateRanges.map(dr => 
                  dr.id === preserveId ? payload : dr
                );
              } else {
                updatedDateRanges = [...dateRanges, payload];
              }
              onOfferChange!({ dateRanges: updatedDateRanges });
            } else {
              // In create view, update store
              if (editingRange) {
                store.updateDateRange(preserveId, payload);
              } else {
                store.addDateRange(payload);
              }
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
            const preserveId = (editingRange as any)?.id || `ts-${Date.now()}`;
            const payload = {
              id: preserveId,
              name: slotData.name,
              startTime: slotData.startTime,
              endTime: slotData.endTime,
              days: slotData.days || [],
              isActive: true,
              offerCount: 0,
              createdAt: new Date().toISOString(),
            };

            if (isBatchEditMode) {
              // In batch edit mode, update parent state
              let updatedTimeSlots;
              if (editingRange) {
                updatedTimeSlots = timeSlots.map(ts => 
                  ts.id === preserveId ? payload : ts
                );
              } else {
                updatedTimeSlots = [...timeSlots, payload];
              }
              onOfferChange!({ timeSlots: updatedTimeSlots });
            } else {
              // In create view, update store
              if (editingRange) {
                store.updateTimeSlot(preserveId, payload);
              } else {
                store.addTimeSlot(payload);
              }
            }
            setShowCreateModal(false);
            setShowEditModal(false);
            setEditingRange(null);
          }}
        />
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold text-black mb-4">
              Delete {activeTab === 'date' ? 'Date Range' : 'Time Slot'}
            </h3>
            <p className="text-gray-600 mb-6">
              Are you sure you want to delete &quot;{itemToDelete?.name}&quot;? This action cannot be undone.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={handleDeleteCancel}
                className="px-4 py-2 text-gray-600 hover:text-black border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteConfirm}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
