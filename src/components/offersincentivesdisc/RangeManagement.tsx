'use client';

import React, { useState, useMemo } from 'react';
import { Calendar, Plus, Edit, Trash2 } from 'lucide-react';
import { useOfferCreationStore } from '@/store/offerCreationStore';
import CreateDateRangeModal from './CreateDateRangeModal';
import { getTodayBoundaries, getEndOfDay, parseDateInTimezone } from '@/lib/dateUtils';

interface DatabaseDateRange {
  id: string;
  name: string;
  description?: string | null;
  startDate: Date | string;
  endDate: Date | string;
  isActive: boolean;
  createdAt?: Date | string;
}

interface OfferData {
  id: string;
  dateRanges?: DatabaseDateRange[];
  [key: string]: unknown;
}

interface RangeManagementProps {
  isNewOffer?: boolean;
  offerData?: OfferData;
  onOfferChange?: (updatedData: Partial<OfferData>) => void;
  onOpenDateModal?: () => void;
  selectedDateRange?: DateRange;
  onSelectDateRange?: (dateRange: DateRange) => void;
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

export default function RangeManagement({ 
  isNewOffer = false, 
  offerData,
  onOfferChange,
  onOpenDateModal, 
  selectedDateRange,
  onSelectDateRange
}: RangeManagementProps) {
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingRange, setEditingRange] = useState<DateRange | null>(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<DateRange | null>(null);

  // Use offerData if provided (details view), otherwise use store data (create view)
  const { 
    removeDateRange, 
    addDateRange, 
    updateDateRange,
    setDateRangeConfigured, 
    updateReadyToCreate, 
    dateRanges: storeDateRanges 
  } = useOfferCreationStore();
  const isBatchEditMode = Boolean(offerData && onOfferChange);
  
  // Memoize dateRanges computation to prevent unnecessary re-computations
  // Following React best practices: compute derived data during render, but memoize if expensive
  const dateRanges: DateRange[] = useMemo(() => {
    if (offerData) {
      // Use data from database for details view
      return (offerData.dateRanges || []).map((dr) => ({
        ...dr,
        description: dr.description || '',
        offerCount: 0,
        createdAt: dr.createdAt ? new Date(dr.createdAt).toISOString() : new Date().toISOString(),
        // Convert ISO dates to yyyy-MM-dd format for HTML date inputs
        startDate: dr.startDate ? new Date(dr.startDate).toISOString().split('T')[0] : '',
        endDate: dr.endDate ? new Date(dr.endDate).toISOString().split('T')[0] : '',
      }));
    } else {
      const dateRangesFromStore: DateRange[] = (storeDateRanges || []).map((dr) => ({
        ...dr,
        offerCount: 0,
        createdAt: (dr as { createdAt?: string }).createdAt || new Date().toISOString(),
        description: dr.description || `From ${new Date(dr.startDate).toLocaleDateString()} to ${new Date(dr.endDate).toLocaleDateString()}`,
        isActive: dr.isActive ?? true,
      }));

      // Fallback: if arrays are empty but a selection exists (older persisted state), render the selection
      return dateRangesFromStore.length > 0
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
    }
  }, [offerData, storeDateRanges, selectedDateRange]);

  const handleEdit = (range: DateRange) => {
    setEditingRange(range);
    setShowEditModal(true);
  };

  const handleDelete = (id: string) => {
    const item = dateRanges.find(dr => dr.id === id);
    
    if (item) {
      setItemToDelete(item);
      setShowDeleteModal(true);
    }
  };

  const handleDeleteConfirm = () => {
    if (!itemToDelete) return;

    if (isBatchEditMode) {
      // In batch edit mode, update parent state
      const updatedDateRanges = dateRanges.filter(dr => dr.id !== itemToDelete.id);
      onOfferChange!({ dateRanges: updatedDateRanges });
    } else {
      // In create view, remove from store
      removeDateRange(itemToDelete.id);
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

  return (
    <div className="p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-black">{isNewOffer ? 'Date Range' : 'Range Management'}</h2>
          <p className="text-gray-500 text-sm">{isNewOffer ? 'Set the active period for your new offer (optional)' : 'Manage date ranges for offers'}</p>
        </div>
        <div className="flex items-center gap-2">
          {isNewOffer && dateRanges.length === 0 && (
            <button
              onClick={() => {
                // Mark as skipped - clear date ranges and mark as configured to allow proceeding
                if (isBatchEditMode) {
                  onOfferChange!({ dateRanges: [] });
                } else {
                  // First mark as configured (skipped), then clear date ranges
                  // The removeDateRange function now preserves isDateRangeConfigured if it's true
                  setDateRangeConfigured(true);
                  // Clear all date ranges
                  const currentRanges = [...storeDateRanges];
                  currentRanges.forEach(dr => removeDateRange(dr.id));
                  // Update ready state
                  updateReadyToCreate();
                }
              }}
              className="flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-300 bg-white text-gray-700 font-semibold hover:bg-gray-50 transition text-sm"
            >
              Skip
            </button>
          )}
        </div>
      </div>

      {/* Empty state when no ranges */}
      {dateRanges.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-lg p-8 text-center">
          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Calendar className="w-8 h-8 text-gray-400" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">No Date Range Configured</h3>
          <p className="text-gray-500 text-sm mb-4">
            Offers may or may not have date restrictions and will remain active or inactive based on its status. 
            You can optionally create date ranges to limit when the offer is available.
          </p>
          <div className="flex items-center justify-center gap-3">
            {isNewOffer && (
              <button 
                onClick={() => {
                  // Mark as skipped - clear date ranges and mark as configured to allow proceeding
                  if (isBatchEditMode) {
                    onOfferChange!({ dateRanges: [] });
                  } else {
                    // First mark as configured (skipped), then clear date ranges
                    // The removeDateRange function now preserves isDateRangeConfigured if it's true
                    setDateRangeConfigured(true);
                    // Clear all date ranges
                    const currentRanges = [...storeDateRanges];
                    currentRanges.forEach(dr => removeDateRange(dr.id));
                    // Update ready state
                    updateReadyToCreate();
                  }
                }} 
                className="flex items-center gap-2 px-6 py-3 border border-gray-300 bg-white text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Skip
              </button>
            )}
            <button 
              onClick={() => { setEditingRange(null); setShowCreateModal(true); }} 
              className="flex items-center gap-2 px-6 py-3 bg-[#0a61d7] text-white rounded-lg hover:bg-[#084ba6] transition-colors"
            >
              <Plus className="w-4 h-4" />
              Add Date Range (Optional)
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-black">Date Range</h3>
            {isNewOffer && (
              <button
                onClick={() => {
                  // Mark as skipped - clear date ranges and mark as configured to allow proceeding
                  if (isBatchEditMode) {
                    onOfferChange!({ dateRanges: [] });
                  } else {
                    // First mark as configured (skipped), then clear date ranges
                    setDateRangeConfigured(true);
                    const currentRanges = [...storeDateRanges];
                    currentRanges.forEach(dr => removeDateRange(dr.id));
                    updateReadyToCreate();
                  }
                }}
                className="flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-300 bg-white text-gray-700 font-semibold hover:bg-gray-50 transition text-sm"
              >
                Skip
              </button>
            )}
          </div>
          <div className="grid grid-cols-1 gap-4">
            {dateRanges.slice(0, 1).map((range) => {
              const { startOfToday } = getTodayBoundaries();
              
              // Parse endDate and create date directly in Jakarta timezone
              // This ensures the date is interpreted correctly regardless of server timezone
              const rangeEndDate = typeof range.endDate === 'string' 
                ? parseDateInTimezone(range.endDate) 
                : range.endDate;
              
              const rangeEnd = getEndOfDay(rangeEndDate);
              
              // Offer remains active throughout the entire end date
              // Only expires when today > end date (not when today === end date)
              const isExpired = range.isActive && startOfToday > rangeEnd;
              
              return (
                <div key={range.id} className={`bg-white p-4 rounded-lg border hover:shadow-md transition-shadow ${
                  isExpired ? 'border-orange-200 bg-orange-50' : 'border-gray-200'
                }`}>
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <h4 className="text-md font-semibold text-black">{range.name}</h4>
                        {isExpired && (
                          <span className="px-2 py-0.5 text-xs font-medium bg-orange-500 text-white rounded">
                            Expired
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-gray-600 mb-2">{range.description}</p>
                      {isExpired && (
                        <p className="text-xs text-orange-700 mb-2 italic">
                          This date range has expired. Update the dates to reactivate.
                        </p>
                      )}
                    </div>
                    <button
                      onClick={() => handleToggleActive(range.id)}
                      className={`w-3 h-3 rounded-full border-2 transition-colors ${
                        range.isActive && !isExpired
                          ? 'bg-green-500 border-green-500' 
                          : 'bg-white border-gray-300'
                      }`}
                      title={range.isActive && !isExpired ? 'Active' : isExpired ? 'Expired' : 'Inactive'}
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
      )}

      {/* Create/Edit Modal */}
      {(showCreateModal || showEditModal) && (
        <CreateDateRangeModal
          isOpen={showCreateModal || showEditModal}
          onClose={() => {
            setShowCreateModal(false);
            setShowEditModal(false);
            setEditingRange(null);
          }}
          editingRange={editingRange || undefined}
          onSave={(rangeData) => {
            const preserveId = (editingRange as { id?: string })?.id || `dr-${Date.now()}`;
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
              // Only allow one date range - replace if editing, or set as single item if creating
              if (editingRange) {
                const updatedDateRanges = dateRanges.map(dr => 
                  dr.id === preserveId ? payload : dr
                );
                onOfferChange!({ dateRanges: updatedDateRanges });
              } else {
                // Replace all with just this one (limit to 1 range)
                onOfferChange!({ dateRanges: [payload] });
              }
            } else {
              // In create view, update store
              if (editingRange) {
                updateDateRange(preserveId, payload);
              } else {
                // Clear existing ranges first (limit to 1 range)
                const currentRanges = [...storeDateRanges];
                currentRanges.forEach(dr => removeDateRange(dr.id));
                addDateRange(payload);
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
              Delete Date Range
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
