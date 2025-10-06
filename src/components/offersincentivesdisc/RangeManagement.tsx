'use client';

import React, { useState } from 'react';
import { Calendar, Clock, Plus, Edit, Trash2, Target, AlertCircle, CheckCircle, TrendingUp } from 'lucide-react';
import CreateDateRangeModal from './CreateDateRangeModal';
import CreateTimeSlotModal from './CreateTimeSlotModal';

interface RangeManagementProps {
  isNewOffer?: boolean;
  onOpenDateModal?: () => void;
  onOpenTimeModal?: () => void;
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

export default function RangeManagement({ isNewOffer = false, onOpenDateModal, onOpenTimeModal }: RangeManagementProps) {
  const [activeTab, setActiveTab] = useState<'date' | 'time'>('date');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingRange, setEditingRange] = useState<DateRange | TimeSlot | null>(null);

  // Mock data - replace with actual API calls
  const dateRanges: DateRange[] = [
    {
      id: '1',
      name: 'Summer Sale 2024',
      description: 'Annual summer promotion period',
      startDate: '2024-06-01',
      endDate: '2024-08-31',
      isActive: true,
      offerCount: 12,
      createdAt: '2024-05-15',
    },
    {
      id: '2',
      name: 'Back to School',
      description: 'Educational products promotion',
      startDate: '2024-07-15',
      endDate: '2024-09-15',
      isActive: true,
      offerCount: 8,
      createdAt: '2024-06-20',
    },
    {
      id: '3',
      name: 'Holiday Season',
      description: 'Year-end holiday promotions',
      startDate: '2024-12-01',
      endDate: '2024-12-31',
      isActive: false,
      offerCount: 15,
      createdAt: '2024-11-10',
    },
  ];

  const timeSlots: TimeSlot[] = [
    {
      id: '1',
      name: 'Morning Rush',
      startTime: '07:00',
      endTime: '10:00',
      days: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
      isActive: true,
      offerCount: 5,
      createdAt: '2024-01-15',
    },
    {
      id: '2',
      name: 'Lunch Break',
      startTime: '12:00',
      endTime: '14:00',
      days: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
      isActive: true,
      offerCount: 3,
      createdAt: '2024-01-20',
    },
    {
      id: '3',
      name: 'Weekend Special',
      startTime: '09:00',
      endTime: '18:00',
      days: ['Saturday', 'Sunday'],
      isActive: false,
      offerCount: 7,
      createdAt: '2024-02-01',
    },
  ];

  const getDateRangeStatus = (startDate: string, endDate: string, isActive: boolean) => {
    const now = new Date();
    const start = new Date(startDate);
    const end = new Date(endDate);

    if (!isActive) {
      if (now > end) return { status: 'expired', color: 'text-red-600', bg: 'bg-red-100', icon: AlertCircle };
      return { status: 'inactive', color: 'text-gray-600', bg: 'bg-gray-100', icon: AlertCircle };
    }
    if (now > end) return { status: 'expired', color: 'text-red-600', bg: 'bg-red-100', icon: AlertCircle };
    if (now < start) return { status: 'upcoming', color: 'text-blue-600', bg: 'bg-blue-100', icon: Clock };
    return { status: 'active', color: 'text-green-600', bg: 'bg-green-100', icon: CheckCircle };
  };

  const getDaysRemaining = (endDate: string) => {
    const now = new Date();
    const end = new Date(endDate);
    const diffTime = end.getTime() - now.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  };

  const handleEdit = (range: DateRange | TimeSlot) => {
    setEditingRange(range);
    setShowEditModal(true);
  };

  const handleDelete = (id: string) => {
    // Implement delete functionality
    console.log('Delete range:', id);
  };

  const handleToggleActive = (id: string) => {
    // Implement toggle active functionality
    console.log('Toggle active for range:', id);
  };

  // New offer state - show create button and form
  if (isNewOffer) {
    return (
      <div className="p-4 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-black">Date & Time Range</h2>
            <p className="text-gray-500 text-sm">Set the active period for your new offer</p>
          </div>
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

        {/* Empty State with Create Button */}
        <div className="bg-white border border-gray-200 rounded-lg p-8 text-center">
          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            {activeTab === 'date' ? (
              <Calendar className="w-8 h-8 text-gray-400" />
            ) : (
              <Clock className="w-8 h-8 text-gray-400" />
            )}
          </div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">
            {activeTab === 'date' ? 'No Date Range Configured' : 'No Time Slots Configured'}
          </h3>
          <p className="text-gray-500 text-sm mb-4">
            {activeTab === 'date' 
              ? 'Create a date range to define when your offer will be active.'
              : 'Create time slots to define specific hours when your offer will be available.'
            }
          </p>
          <button
            onClick={() => {
              if (activeTab === 'date' && onOpenDateModal) {
                onOpenDateModal();
              } else if (activeTab === 'time' && onOpenTimeModal) {
                onOpenTimeModal();
              } else {
                setShowCreateModal(true);
              }
            }}
            className="flex items-center gap-2 px-6 py-3 bg-[#0a61d7] text-white rounded-lg hover:bg-[#084ba6] transition-colors mx-auto"
          >
            <Plus className="w-4 h-4" />
            {activeTab === 'date' ? 'Create Date Range' : 'Create Time Slot'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-black">Range Management</h2>
          <p className="text-gray-500 text-sm">Manage date ranges and time slots for offers</p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#0a61d7] text-white font-semibold hover:bg-[#084ba6] transition text-sm"
        >
          <Plus className="w-4 h-4" />
          Create Range
        </button>
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

      {/* Quick Stats */}
      <div className="w-full mx-auto grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
        <div className="flex flex-col justify-between p-4 rounded-lg shadow bg-white border border-[#e6e6e6] bg-[#f7faff]">
          <div className="flex items-center gap-4 border-b border-gray-200 pb-4">
            <div className="flex items-center justify-center w-12 h-12 rounded-lg bg-white shadow-sm">
              <Calendar className="w-6 h-6 text-[#0a61d7]" />
            </div>
            <div>
              <div className="text-xs text-gray-500 font-semibold uppercase tracking-wide">Date Ranges</div>
              <div className="text-xl font-bold text-black">{dateRanges.length}</div>
            </div>
          </div>
          <div className="flex items-center gap-2 mt-4 ml-1">
            <TrendingUp className="w-5 h-5 text-[#3ea73b]" />
            <span className="text-[#3ea73b] text-xs font-semibold">+2%</span>
            <span className="text-gray-400 text-xs">from last month</span>
          </div>
        </div>

        <div className="flex flex-col justify-between p-4 rounded-lg shadow bg-white border border-[#e6e6e6] bg-[#e6f7ec]">
          <div className="flex items-center gap-4 border-b border-gray-200 pb-4">
            <div className="flex items-center justify-center w-12 h-12 rounded-lg bg-white shadow-sm">
              <Clock className="w-6 h-6 text-green-500" />
            </div>
            <div>
              <div className="text-xs text-gray-500 font-semibold uppercase tracking-wide">Time Slots</div>
              <div className="text-xl font-bold text-black">{timeSlots.length}</div>
            </div>
          </div>
          <div className="flex items-center gap-2 mt-4 ml-1">
            <TrendingUp className="w-5 h-5 text-[#3ea73b]" />
            <span className="text-[#3ea73b] text-xs font-semibold">+1%</span>
            <span className="text-gray-400 text-xs">from last month</span>
          </div>
        </div>

        <div className="flex flex-col justify-between p-4 rounded-lg shadow bg-white border border-[#e6e6e6] bg-[#fff7ed]">
          <div className="flex items-center gap-4 border-b border-gray-200 pb-4">
            <div className="flex items-center justify-center w-12 h-12 rounded-lg bg-white shadow-sm">
              <Target className="w-6 h-6 text-orange-500" />
            </div>
            <div>
              <div className="text-xs text-gray-500 font-semibold uppercase tracking-wide">Active Ranges</div>
              <div className="text-xl font-bold text-black">
                {dateRanges.filter(r => r.isActive).length + timeSlots.filter(t => t.isActive).length}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 mt-4 ml-1">
            <TrendingUp className="w-5 h-5 text-[#3ea73b]" />
            <span className="text-[#3ea73b] text-xs font-semibold">67%</span>
            <span className="text-gray-400 text-xs">active rate</span>
          </div>
        </div>

        <div className="flex flex-col justify-between p-4 rounded-lg shadow bg-white border border-[#e6e6e6] bg-[#f3f0ff]">
          <div className="flex items-center gap-4 border-b border-gray-200 pb-4">
            <div className="flex items-center justify-center w-12 h-12 rounded-lg bg-white shadow-sm">
              <CheckCircle className="w-6 h-6 text-purple-500" />
            </div>
            <div>
              <div className="text-xs text-gray-500 font-semibold uppercase tracking-wide">Total Offers</div>
              <div className="text-xl font-bold text-black">
                {dateRanges.reduce((sum, r) => sum + r.offerCount, 0) + 
                 timeSlots.reduce((sum, t) => sum + t.offerCount, 0)}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 mt-4 ml-1">
            <TrendingUp className="w-5 h-5 text-[#3ea73b]" />
            <span className="text-[#3ea73b] text-xs font-semibold">+12%</span>
            <span className="text-gray-400 text-xs">from last month</span>
          </div>
        </div>
      </div>

      {/* Content based on active tab */}
      {activeTab === 'date' ? (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-black">Date Ranges</h3>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {dateRanges.map((range) => {
              const status = getDateRangeStatus(range.startDate, range.endDate, range.isActive);
              const daysRemaining = getDaysRemaining(range.endDate);
              const StatusIcon = status.icon;

              return (
                <div key={range.id} className="bg-white p-4 rounded-lg border border-gray-200 hover:shadow-md transition-shadow">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex-1">
                      <h4 className="text-md font-semibold text-black mb-1">{range.name}</h4>
                      <p className="text-xs text-gray-600 mb-2">{range.description}</p>
                      <div className="flex items-center gap-2">
                        <StatusIcon className={`w-4 h-4 ${status.color}`} />
                        <span className={`text-xs font-medium ${status.color}`}>
                          {status.status.charAt(0).toUpperCase() + status.status.slice(1)}
                        </span>
                        {status.status === 'active' && (
                          <span className="text-xs text-gray-500">
                            ({daysRemaining} days remaining)
                          </span>
                        )}
                      </div>
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
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1">
                    <h4 className="text-md font-semibold text-black mb-1">{slot.name}</h4>
                    <div className="flex items-center gap-2 mb-2">
                      <Clock className="w-4 h-4 text-gray-500" />
                      <span className="text-xs font-medium text-black">
                        {slot.startTime} - {slot.endTime}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      {slot.isActive ? (
                        <CheckCircle className="w-4 h-4 text-green-600" />
                      ) : (
                        <AlertCircle className="w-4 h-4 text-gray-600" />
                      )}
                      <span className={`text-xs font-medium ${slot.isActive ? 'text-green-600' : 'text-gray-600'}`}>
                        {slot.isActive ? 'Active' : 'Inactive'}
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
            console.log('Save date range:', rangeData);
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
            console.log('Save time slot:', slotData);
            setShowCreateModal(false);
            setShowEditModal(false);
            setEditingRange(null);
          }}
        />
      )}
    </div>
  );
}
